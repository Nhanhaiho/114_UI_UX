import logging
from typing import Optional
from pydantic import BaseModel
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
import jwt

from app.config import settings, is_placeholder_or_empty

logger = logging.getLogger("fire_studio_api.auth")
security = HTTPBearer(auto_error=False)


class AuthenticatedUser(BaseModel):
    id: str
    email: str
    email_confirmed: bool = False
    is_mock: bool = False


async def verify_supabase_token(token: str) -> Optional[AuthenticatedUser]:
    """
    Xác thực Supabase access token (JWT) và trích xuất email đã xác minh từ tài khoản Supabase.
    Hỗ trợ xác thực trực tiếp qua Supabase Auth API (/auth/v1/user) và dự phòng cục bộ qua JWT Secret.
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

    # Cách 1: Xác thực trực tiếp qua Supabase Auth REST endpoint (lấy email & trạng thái xác minh mới nhất)
    if not is_placeholder_or_empty(settings.SUPABASE_URL):
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
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(auth_url, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    user_id = data.get("id")
                    email = data.get("email")
                    email_confirmed = bool(
                        data.get("email_confirmed_at") or data.get("confirmed_at")
                    )
                    if user_id and email:
                        return AuthenticatedUser(
                            id=user_id,
                            email=email,
                            email_confirmed=email_confirmed,
                            is_mock=False,
                        )
                else:
                    logger.warning(f"Supabase auth check returned status {res.status_code}")
        except Exception as e:
            logger.error(f"Lỗi kết nối Supabase Auth: {type(e).__name__}")

    # Cách 2: Giải mã JWT cục bộ bằng SUPABASE_JWT_SECRET nếu đã cấu hình
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
                return AuthenticatedUser(
                    id=user_id,
                    email=email,
                    email_confirmed=email_confirmed,
                    is_mock=False,
                )
        except jwt.PyJWTError as e:
            logger.warning(f"Lỗi giải mã JWT token: {type(e).__name__}")

    return None


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[AuthenticatedUser]:
    """Dependency lấy thông tin người dùng nếu có token hợp lệ, không bắt buộc (khách vẫn dùng được)"""
    if not credentials or not credentials.credentials:
        return None
    return await verify_supabase_token(credentials.credentials)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> AuthenticatedUser:
    """Dependency bắt buộc người dùng đã đăng nhập với phiên hợp lệ"""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yêu cầu xác thực tài khoản. Vui lòng đăng nhập để tiếp tục.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raw_token = credentials.credentials
    user = await verify_supabase_token(raw_token)
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
