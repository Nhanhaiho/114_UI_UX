import hashlib
import logging
import time
from typing import Dict, Optional, Tuple
from pydantic import BaseModel
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
import jwt

from app.config import settings, is_placeholder_or_empty

logger = logging.getLogger("fire_studio_api.auth")
security = HTTPBearer(auto_error=False)

# Cache ngắn hạn token đã xác thực (key là SHA-256 của token, không lưu raw token)
# Tránh gọi HTTPS /auth/v1/user lặp lại trên từng frame video/webcam (~1.6s/frame)
_AUTH_CACHE_TTL_SECONDS = 60.0
_verified_user_cache: Dict[str, Tuple["AuthenticatedUser", float]] = {}
_shared_auth_client: Optional[httpx.AsyncClient] = None


class AuthenticatedUser(BaseModel):
    id: str
    email: str
    email_confirmed: bool = False
    is_mock: bool = False


def _get_auth_client() -> httpx.AsyncClient:
    global _shared_auth_client
    if _shared_auth_client is None or _shared_auth_client.is_closed:
        _shared_auth_client = httpx.AsyncClient(timeout=5.0)
    return _shared_auth_client


def _cache_key(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _extract_unverified_exp(token: str) -> Optional[float]:
    try:
        claims = jwt.decode(token, options={"verify_signature": False})
        exp = claims.get("exp")
        return float(exp) if exp is not None else None
    except Exception:
        return None


def clear_auth_cache() -> None:
    """Xóa bộ nhớ đệm xác thực (hữu ích cho unit test)"""
    _verified_user_cache.clear()


async def verify_supabase_token(
    token: str,
    use_cache: bool = True,
) -> Optional[AuthenticatedUser]:
    """
    Xác thực Supabase access token (JWT) và trích xuất email đã xác minh từ tài khoản Supabase.
    - Ưu tiên cache ngắn hạn (60s, không vượt quá exp của JWT) cho các frame liên tiếp.
    - Hỗ trợ giải mã cục bộ qua SUPABASE_JWT_SECRET và xác thực trực tiếp qua /auth/v1/user.
    """
    if not token:
        return None

    # Chế độ Mock Auth chỉ được chấp nhận khi Supabase chưa cấu hình và không bị tắt
    if token.startswith("mock-token-") or token.startswith("test-token-"):
        if not settings.allow_mock_auth:
            logger.warning(
                "Từ chối token mock auth vì backend đang cấu hình xác thực Supabase thật."
            )
            return None
        parts = token.split("-")
        user_identifier = parts[-1] or "user"
        fake_uuid = f"00000000-0000-0000-0000-{user_identifier.zfill(12)[:12]}"
        return AuthenticatedUser(
            id=fake_uuid,
            email=f"{user_identifier}@example.com",
            email_confirmed=True,
            is_mock=True,
        )

    now = time.time()
    key = _cache_key(token)
    if use_cache:
        cached = _verified_user_cache.get(key)
        if cached is not None:
            cached_user, expires_at = cached
            if now < expires_at:
                return cached_user
            _verified_user_cache.pop(key, None)

    verified_user: Optional[AuthenticatedUser] = None

    # Cách 1: Giải mã JWT cục bộ bằng SUPABASE_JWT_SECRET nếu đã cấu hình (< 0.1ms, không tốn mạng)
    if not is_placeholder_or_empty(settings.SUPABASE_JWT_SECRET):
        try:
            decoded = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET.strip(),
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_signature": True},
            )
            user_id = decoded.get("sub")
            email = decoded.get("email")
            user_meta = decoded.get("user_metadata") or {}
            email_confirmed = bool(
                decoded.get("email_confirmed_at")
                or user_meta.get("email_verified", False)
            )
            if user_id and email:
                verified_user = AuthenticatedUser(
                    id=user_id,
                    email=email,
                    email_confirmed=email_confirmed,
                    is_mock=False,
                )
        except jwt.PyJWTError as e:
            logger.warning(f"Lỗi giải mã JWT token: {type(e).__name__}")

    # Cách 2: Xác thực trực tiếp qua Supabase Auth REST endpoint (/auth/v1/user)
    if verified_user is None and not is_placeholder_or_empty(settings.SUPABASE_URL):
        api_key = ""
        if not is_placeholder_or_empty(settings.SUPABASE_ANON_KEY):
            api_key = settings.SUPABASE_ANON_KEY.strip()
        elif not is_placeholder_or_empty(settings.SUPABASE_SERVICE_ROLE_KEY):
            api_key = settings.SUPABASE_SERVICE_ROLE_KEY.strip()

        try:
            auth_url = f"{settings.SUPABASE_URL.strip().rstrip('/')}/auth/v1/user"
            headers = {
                "Authorization": f"Bearer {token}",
                "apikey": api_key,
            }
            client = _get_auth_client()
            res = await client.get(auth_url, headers=headers)
            if res.status_code == 200:
                data = res.json()
                user_id = data.get("id")
                email = data.get("email")
                email_confirmed = bool(
                    data.get("email_confirmed_at") or data.get("confirmed_at")
                )
                if user_id and email:
                    verified_user = AuthenticatedUser(
                        id=user_id,
                        email=email,
                        email_confirmed=email_confirmed,
                        is_mock=False,
                    )
            else:
                logger.warning(f"Supabase auth check returned status {res.status_code}")
        except Exception as e:
            logger.error(f"Lỗi kết nối Supabase Auth: {type(e).__name__}")

    if verified_user is not None:
        exp = _extract_unverified_exp(token)
        ttl_deadline = now + _AUTH_CACHE_TTL_SECONDS
        expires_at = min(ttl_deadline, exp) if exp is not None else ttl_deadline
        if expires_at > now:
            if len(_verified_user_cache) >= 256:
                _verified_user_cache.clear()
            _verified_user_cache[key] = (verified_user, expires_at)

    return verified_user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[AuthenticatedUser]:
    """Dependency lấy thông tin người dùng nếu có token hợp lệ, không bắt buộc (khách vẫn dùng được)"""
    if not credentials or not credentials.credentials:
        return None
    return await verify_supabase_token(credentials.credentials, use_cache=True)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> AuthenticatedUser:
    """Dependency bắt buộc người dùng đã đăng nhập với phiên hợp lệ (luôn kiểm tra trực tiếp)"""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yêu cầu xác thực tài khoản. Vui lòng đăng nhập để tiếp tục.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raw_token = credentials.credentials
    user = await verify_supabase_token(raw_token, use_cache=False)
    if not user:
        if (raw_token.startswith("mock-token-") or raw_token.startswith("test-token-")) and not settings.allow_mock_auth:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Phiên đăng nhập hiện tại là Mock Auth (@example.com giả lập). Vui lòng đăng xuất và đăng nhập lại bằng tài khoản Supabase.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
