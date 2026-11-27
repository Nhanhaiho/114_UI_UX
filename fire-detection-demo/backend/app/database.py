import time
import logging
from typing import Optional, Dict, List, Tuple, Any
from datetime import datetime, timezone
import httpx
from app.config import settings

logger = logging.getLogger("fire_studio_api.database")

# In-memory store hỗ trợ phát triển cục bộ, unit tests và fallback khi chưa cấu hình Supabase DB
_in_memory_preferences: Dict[str, Dict[str, Any]] = {}
_in_memory_dispatches: Dict[str, Dict[str, Any]] = {}  # key: event_id
_in_memory_test_cooldowns: Dict[str, float] = {}  # key: user_id -> timestamp


async def get_user_preferences(user_id: str) -> Dict[str, Any]:
    """
    Lấy tùy chọn nhận email của người dùng.
    Mặc định tắt (email_alerts_enabled = False).
    """
    if settings.is_supabase_db_configured:
        try:
            url = f"{settings.SUPABASE_URL.strip().rstrip('/')}/rest/v1/user_email_preferences?user_id=eq.{user_id}"
            svc_key = settings.SUPABASE_SERVICE_ROLE_KEY.strip()
            headers = {
                "apikey": svc_key,
                "Authorization": f"Bearer {svc_key}",
            }
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    rows = res.json()
                    if rows and len(rows) > 0:
                        return rows[0]
                elif res.status_code >= 400:
                    logger.warning(f"Supabase GET preferences trả về mã {res.status_code}")
        except Exception as e:
            logger.warning(f"Lỗi đọc preferences từ Supabase: {type(e).__name__}. Sử dụng in-memory fallback.")

    if user_id in _in_memory_preferences:
        return _in_memory_preferences[user_id]

    return {
        "user_id": user_id,
        "email": "",
        "email_alerts_enabled": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


async def set_user_preferences(user_id: str, email: str, enabled: bool) -> Dict[str, Any]:
    """Cập nhật tùy chọn nhận email của người dùng"""
    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        "user_id": user_id,
        "email": email,
        "email_alerts_enabled": enabled,
        "updated_at": now_iso,
    }

    if settings.is_supabase_db_configured:
        try:
            url = f"{settings.SUPABASE_URL.strip().rstrip('/')}/rest/v1/user_email_preferences"
            svc_key = settings.SUPABASE_SERVICE_ROLE_KEY.strip()
            headers = {
                "apikey": svc_key,
                "Authorization": f"Bearer {svc_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            }
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.post(url, headers=headers, json=record)
                if res.status_code >= 400:
                    logger.warning(f"Supabase POST preferences trả về mã {res.status_code}")
        except Exception as e:
            logger.warning(f"Lỗi ghi preferences vào Supabase: {type(e).__name__}")

    _in_memory_preferences[user_id] = record
    return record


async def can_send_test_email(user_id: str) -> Tuple[bool, int]:
    """Kiểm tra giới hạn tần suất gửi email thử (cooldown)"""
    last_sent = _in_memory_test_cooldowns.get(user_id)
    if not last_sent:
        return True, 0

    elapsed = time.time() - last_sent
    cooldown = settings.TEST_EMAIL_COOLDOWN_SECONDS
    if elapsed >= cooldown:
        return True, 0
    return False, int(cooldown - elapsed)


def record_test_email_sent(user_id: str) -> None:
    """Ghi nhận mốc thời gian vừa gửi email thử"""
    _in_memory_test_cooldowns[user_id] = time.time()


async def register_event_and_dispatch(
    event_id: str,
    user_id: str,
    session_id: str,
    source_type: str,
    model_name: str,
    confirmed_time_ms: float,
    playback_time_str: Optional[str],
    max_confidence: float,
    box: List[float],
    recipient_email: str,
) -> Tuple[bool, str]:
    """
    Đăng ký một sự kiện lửa và tạo bản ghi gửi email với ràng buộc duy nhất để chống gửi trùng lặp.
    Trả về (is_new, status).
    """
    if event_id in _in_memory_dispatches:
        existing = _in_memory_dispatches[event_id]
        return False, existing.get("status", "pending")

    now_iso = datetime.now(timezone.utc).isoformat()
    dispatch_record = {
        "event_id": event_id,
        "user_id": user_id,
        "session_id": session_id,
        "source_type": source_type,
        "model_name": model_name,
        "confirmed_time_ms": confirmed_time_ms,
        "playback_time_str": playback_time_str,
        "max_confidence": max_confidence,
        "box": box,
        "recipient_email": recipient_email,
        "status": "pending",  # 'pending' -> 'sent' hoặc 'failed'
        "mode": "real",       # 'real' | 'mock' | 'error'
        "error_message": None,
        "created_at": now_iso,
        "sent_at": None,
    }

    _in_memory_dispatches[event_id] = dispatch_record

    # Đồng bộ vào 2 bảng Postgres trên Supabase theo đúng schema SQL
    if settings.is_supabase_db_configured:
        base_url = settings.SUPABASE_URL.strip().rstrip("/")
        svc_key = settings.SUPABASE_SERVICE_ROLE_KEY.strip()
        headers = {
            "apikey": svc_key,
            "Authorization": f"Bearer {svc_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=ignore-duplicates",
        }
        event_payload = {
            "event_id": event_id,
            "user_id": user_id,
            "session_id": session_id,
            "source_type": source_type,
            "model_name": model_name,
            "confirmed_time_ms": confirmed_time_ms,
            "playback_time_str": playback_time_str,
            "max_confidence": max_confidence,
            "box": box,
            "created_at": now_iso,
        }
        dispatch_payload = {
            "event_id": event_id,
            "user_id": user_id,
            "session_id": session_id,
            "recipient_email": recipient_email,
            "status": "pending",
            "error_message": None,
            "created_at": now_iso,
            "sent_at": None,
        }
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                ev_res = await client.post(
                    f"{base_url}/rest/v1/fire_alert_events",
                    headers=headers,
                    json=event_payload,
                )
                if ev_res.status_code >= 400:
                    logger.warning(f"Supabase POST fire_alert_events trả về mã {ev_res.status_code}")

                dp_res = await client.post(
                    f"{base_url}/rest/v1/email_dispatches",
                    headers=headers,
                    json=dispatch_payload,
                )
                if dp_res.status_code >= 400:
                    logger.warning(f"Supabase POST email_dispatches trả về mã {dp_res.status_code}")
        except Exception as e:
            logger.warning(f"Lỗi ghi dispatch record vào Supabase: {type(e).__name__}")

    return True, "pending"


async def update_dispatch_status(
    event_id: str,
    status: str,
    error_message: Optional[str] = None,
    mode: Optional[str] = None,
) -> None:
    """Cập nhật trạng thái gửi thư: 'sent' hoặc 'failed'"""
    sent_at_iso = datetime.now(timezone.utc).isoformat() if status == "sent" else None

    if event_id in _in_memory_dispatches:
        rec = _in_memory_dispatches[event_id]
        rec["status"] = status
        rec["error_message"] = error_message
        if mode is not None:
            rec["mode"] = mode
        if sent_at_iso:
            rec["sent_at"] = sent_at_iso

    if settings.is_supabase_db_configured:
        try:
            url = f"{settings.SUPABASE_URL.strip().rstrip('/')}/rest/v1/email_dispatches?event_id=eq.{event_id}"
            svc_key = settings.SUPABASE_SERVICE_ROLE_KEY.strip()
            headers = {
                "apikey": svc_key,
                "Authorization": f"Bearer {svc_key}",
                "Content-Type": "application/json",
            }
            patch_data: Dict[str, Any] = {"status": status, "error_message": error_message}
            if sent_at_iso:
                patch_data["sent_at"] = sent_at_iso

            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.patch(url, headers=headers, json=patch_data)
                if res.status_code >= 400:
                    logger.warning(f"Supabase PATCH email_dispatches trả về mã {res.status_code}")
        except Exception as e:
            logger.warning(f"Lỗi cập nhật dispatch status trên Supabase: {type(e).__name__}")


async def get_user_session_dispatches(user_id: str, session_id: str) -> List[Dict[str, Any]]:
    """
    Lấy danh sách trạng thái gửi email thuộc phiên của người dùng.
    Bảo đảm phân quyền người dùng (chỉ trả về dữ liệu của user_id hiện tại).
    """
    user_dispatches = [
        d for d in _in_memory_dispatches.values()
        if d.get("user_id") == user_id and d.get("session_id") == session_id
    ]

    if not user_dispatches and settings.is_supabase_db_configured:
        try:
            url = (
                f"{settings.SUPABASE_URL.strip().rstrip('/')}/rest/v1/email_dispatches"
                f"?user_id=eq.{user_id}&session_id=eq.{session_id}&order=created_at.desc"
            )
            svc_key = settings.SUPABASE_SERVICE_ROLE_KEY.strip()
            headers = {
                "apikey": svc_key,
                "Authorization": f"Bearer {svc_key}",
            }
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    return res.json() or []
        except Exception as e:
            logger.warning(f"Lỗi đọc dispatches từ Supabase: {type(e).__name__}")

    user_dispatches.sort(key=lambda x: x.get("confirmed_time_ms", 0), reverse=True)
    return user_dispatches
