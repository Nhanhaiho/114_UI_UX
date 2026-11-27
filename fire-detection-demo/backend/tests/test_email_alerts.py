import pytest
import asyncio
import smtplib
import logging
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

from app.config import settings, ENV_FILE_PATH
from app.fire_tracker import BackendFireTracker
from app.database import (
    set_user_preferences,
    get_user_session_dispatches,
    _in_memory_dispatches,
    _in_memory_preferences,
    _in_memory_test_cooldowns,
)
from app.smtp_service import send_test_email
from app.auth import verify_supabase_token, AuthenticatedUser, get_current_user, clear_auth_cache
from app.main import app


def make_det(cls_name="fire", conf=0.85, box=None):
    return {
        "class_id": 0 if cls_name == "fire" else 1,
        "class_name": cls_name,
        "confidence": conf,
        "box": box or [0.2, 0.2, 0.4, 0.4],
    }


@pytest.fixture(autouse=True)
def clean_database(monkeypatch):
    """Làm sạch bộ nhớ và cách ly khỏi Supabase mạng ngoài trước mỗi bài test"""
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    monkeypatch.setattr(settings, "SUPABASE_ANON_KEY", "")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "")
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "")
    _in_memory_dispatches.clear()
    _in_memory_preferences.clear()
    _in_memory_test_cooldowns.clear()
    clear_auth_cache()


def test_single_isolated_frame_generates_zero_emails():
    """Tình huống 1: Box lóe 1 frame lẻ (< 0.5s) -> 0 sự kiện confirm, 0 email"""
    async def _test():
        tracker = BackendFireTracker(
            trigger_confidence=0.30,
            continue_confidence=0.20,
            confirm_duration_ms=500.0,
            max_gap_ms=400.0,
        )
        user_id = "user-test-1"
        user_email = "test1@example.com"
        await set_user_preferences(user_id, user_email, True)

        with patch("app.fire_tracker.send_fire_alert_email") as mock_send:
            # Frame 1 tại t=0ms
            events1 = await tracker.process_frame(
                session_id="session-single-frame",
                detections=[make_det("fire", 0.85)],
                timestamp_ms=0.0,
                source_type="video",
                model_name="best.pt",
                user_id=user_id,
                user_email=user_email,
            )
            assert len(events1) == 0

            # Frame 2 tại t=500ms không có lửa (vượt max_gap_ms = 400ms)
            events2 = await tracker.process_frame(
                session_id="session-single-frame",
                detections=[],
                timestamp_ms=500.0,
                source_type="video",
                model_name="best.pt",
                user_id=user_id,
                user_email=user_email,
            )
            assert len(events2) == 0
            mock_send.assert_not_called()

    asyncio.run(_test())


def test_prolonged_fire_generates_exactly_one_email():
    """Tình huống 2: Lửa kéo dài >= 0.5s -> Xác nhận sự kiện và gửi đúng 1 email"""
    async def _test():
        tracker = BackendFireTracker(
            trigger_confidence=0.30,
            continue_confidence=0.20,
            confirm_duration_ms=500.0,
            max_gap_ms=400.0,
        )
        user_id = "user-test-2"
        user_email = "test2@example.com"
        await set_user_preferences(user_id, user_email, True)

        sent_emails = []

        async def fake_send(**kwargs):
            sent_emails.append(kwargs)
            return True, None

        with patch("app.fire_tracker.send_fire_alert_email", side_effect=fake_send):
            # Frame 1 tại t=0ms (bắt đầu candidate)
            await tracker.process_frame(
                session_id="session-prolonged",
                detections=[make_det("fire", 0.40)],
                timestamp_ms=0.0,
                source_type="video",
                model_name="best.pt",
                user_id=user_id,
                user_email=user_email,
            )

            # Frame 2 tại t=200ms
            await tracker.process_frame(
                session_id="session-prolonged",
                detections=[make_det("fire", 0.30)],
                timestamp_ms=200.0,
                source_type="video",
                model_name="best.pt",
                user_id=user_id,
                user_email=user_email,
            )

            # Frame 3 tại t=550ms (duy trì 550ms >= 500ms -> Confirm!)
            events3 = await tracker.process_frame(
                session_id="session-prolonged",
                detections=[make_det("fire", 0.35)],
                timestamp_ms=550.0,
                source_type="video",
                model_name="best.pt",
                user_id=user_id,
                user_email=user_email,
            )
            assert len(events3) == 1
            assert events3[0]["max_confidence"] == 0.40

            # Cho phép background task chạy
            await asyncio.sleep(0.05)
            assert len(sent_emails) == 1
            assert sent_emails[0]["to_email"] == user_email

    asyncio.run(_test())


def test_repeated_requests_idempotency_no_duplicate_emails():
    """Tình huống 3: Request lặp lại hoặc lửa tiếp tục cháy nhiều giây -> Không gửi trùng lặp"""
    async def _test():
        tracker = BackendFireTracker(
            trigger_confidence=0.30,
            continue_confidence=0.20,
            confirm_duration_ms=500.0,
            max_gap_ms=400.0,
        )
        user_id = "user-test-3"
        user_email = "test3@example.com"
        await set_user_preferences(user_id, user_email, True)

        sent_count = 0

        async def fake_send(**kwargs):
            nonlocal sent_count
            sent_count += 1
            return True, None

        with patch("app.fire_tracker.send_fire_alert_email", side_effect=fake_send):
            # t=0, t=300, t=600 -> Confirm tại t=600
            await tracker.process_frame("sess-repeat", [make_det("fire", 0.5)], 0.0, "video", "best.pt", user_id, user_email)
            await tracker.process_frame("sess-repeat", [make_det("fire", 0.5)], 300.0, "video", "best.pt", user_id, user_email)
            await tracker.process_frame("sess-repeat", [make_det("fire", 0.5)], 600.0, "video", "best.pt", user_id, user_email)
            await asyncio.sleep(0.05)
            assert sent_count == 1

            # Các frame tiếp theo t=800ms, t=1000ms, t=1500ms (lửa vẫn cháy liên tục)
            await tracker.process_frame("sess-repeat", [make_det("fire", 0.6)], 800.0, "video", "best.pt", user_id, user_email)
            await tracker.process_frame("sess-repeat", [make_det("fire", 0.7)], 1000.0, "video", "best.pt", user_id, user_email)
            await asyncio.sleep(0.05)

            # Số lượng email gửi vẫn TUYỆT ĐỐI là 1
            assert sent_count == 1

    asyncio.run(_test())


def test_email_alerts_toggled_off_does_not_send_email():
    """Tình huống 4: Người dùng tắt tùy chọn nhận email -> Vẫn confirm sự kiện nhưng 0 email gửi đi"""
    async def _test():
        tracker = BackendFireTracker()
        user_id = "user-test-4"
        user_email = "test4@example.com"
        # email_alerts_enabled = False
        await set_user_preferences(user_id, user_email, False)

        with patch("app.fire_tracker.send_fire_alert_email") as mock_send:
            await tracker.process_frame("sess-off", [make_det("fire", 0.5)], 0.0, "video", "best.pt", user_id, user_email)
            await tracker.process_frame("sess-off", [make_det("fire", 0.5)], 600.0, "video", "best.pt", user_id, user_email)
            await asyncio.sleep(0.05)
            mock_send.assert_not_called()

    asyncio.run(_test())


def test_mock_mode_and_image_source_do_not_send_email():
    """Tình huống 5: Chế độ mock hoặc tab ảnh tĩnh chỉ hiển thị web, không bao giờ gửi email"""
    async def _test():
        tracker = BackendFireTracker()
        user_id = "user-test-5"
        user_email = "test5@example.com"
        await set_user_preferences(user_id, user_email, True)

        with patch("app.fire_tracker.send_fire_alert_email") as mock_send:
            # Mock mode trên video
            await tracker.process_frame("sess-mock", [make_det("fire", 0.88)], 0.0, "video", "best.pt", user_id, user_email, is_mock=True)
            await tracker.process_frame("sess-mock", [make_det("fire", 0.88)], 600.0, "video", "best.pt", user_id, user_email, is_mock=True)

            # Tab ảnh tĩnh
            await tracker.process_frame("sess-img", [make_det("fire", 0.88)], 0.0, "image", "best.pt", user_id, user_email, is_mock=False)

            await asyncio.sleep(0.05)
            mock_send.assert_not_called()

    asyncio.run(_test())


def test_smtp_error_handling_marks_dispatch_failed():
    """Tình huống 6: SMTP bị lỗi -> Cập nhật trạng thái failed, hệ thống không bị crash"""
    async def _test():
        tracker = BackendFireTracker()
        user_id = "user-test-6"
        user_email = "test6@example.com"
        await set_user_preferences(user_id, user_email, True)

        async def failing_send(**kwargs):
            return False, "SMTPAuthenticationError: Username and Password not accepted"

        with patch("app.fire_tracker.send_fire_alert_email", side_effect=failing_send):
            await tracker.process_frame("sess-fail", [make_det("fire", 0.5)], 0.0, "camera", "best.pt", user_id, user_email)
            await tracker.process_frame("sess-fail", [make_det("fire", 0.5)], 300.0, "camera", "best.pt", user_id, user_email)
            await tracker.process_frame("sess-fail", [make_det("fire", 0.5)], 600.0, "camera", "best.pt", user_id, user_email)
            await asyncio.sleep(0.05)

            dispatches = await get_user_session_dispatches(user_id, "sess-fail")
            assert len(dispatches) == 1
            assert dispatches[0]["status"] == "failed"
            assert "SMTPAuthenticationError" in dispatches[0]["error_message"]

    asyncio.run(_test())


def test_multi_tenancy_user_a_and_b_isolation():
    """Tình huống 7: Hai tài khoản A/B - B không đọc được lịch sử của A và không nhận email của A"""
    async def _test():
        tracker = BackendFireTracker()
        user_a = "user-A"
        email_a = "a@example.com"
        user_b = "user-B"
        email_b = "b@example.com"

        await set_user_preferences(user_a, email_a, True)
        await set_user_preferences(user_b, email_b, True)

        sent_to = []

        async def fake_send(**kwargs):
            sent_to.append(kwargs["to_email"])
            return True, None

        with patch("app.fire_tracker.send_fire_alert_email", side_effect=fake_send):
            # Phiên của User A
            await tracker.process_frame("session-A", [make_det("fire", 0.5)], 0.0, "video", "best.pt", user_a, email_a)
            await tracker.process_frame("session-A", [make_det("fire", 0.5)], 300.0, "video", "best.pt", user_a, email_a)
            await tracker.process_frame("session-A", [make_det("fire", 0.5)], 600.0, "video", "best.pt", user_a, email_a)
            await asyncio.sleep(0.05)

            # Email chỉ gửi cho A
            assert sent_to == [email_a]

            # Kiểm tra phân quyền truy vấn:
            # User A xem session-A -> Thấy 1 bản ghi
            dispatches_a = await get_user_session_dispatches(user_a, "session-A")
            assert len(dispatches_a) == 1
            assert dispatches_a[0]["recipient_email"] == email_a

            # User B xem session-A -> Hoàn toàn rỗng (0 bản ghi)!
            dispatches_b = await get_user_session_dispatches(user_b, "session-A")
            assert len(dispatches_b) == 0

    asyncio.run(_test())


# =============================================================================
# CÁC TEST MỚI CHO LUỒNG GỬI EMAIL THỬ, SMTP THẬT/MOCK VÀ XÁC THỰC SUPABASE
# =============================================================================

def test_env_file_path_resolves_to_backend_dir():
    """Đảm bảo đường dẫn .env luôn trỏ đúng vào fire-detection-demo/backend/.env"""
    expected = Path(__file__).resolve().parent.parent / ".env"
    assert ENV_FILE_PATH == expected


def test_smtp_mock_mode_reports_simulated_not_real_success(monkeypatch):
    """Khi SMTP_MOCK=true: trả về trạng thái mô phỏng rõ ràng, không kết nối SMTP thật"""
    monkeypatch.setattr(settings, "SMTP_MOCK", True)
    monkeypatch.setattr(settings, "SMTP_ENABLED", False)

    real_user = AuthenticatedUser(
        id="11111111-1111-1111-1111-111111111111",
        email="realuser@gmail.com",
        email_confirmed=True,
        is_mock=False,
    )
    app.dependency_overrides[get_current_user] = lambda: real_user
    try:
        with patch("app.smtp_service.smtplib.SMTP") as mock_smtp:
            client = TestClient(app)
            res = client.post("/api/alerts/test-email")
            assert res.status_code == 200
            data = res.json()
            assert data["mode"] == "mock"
            assert data["status"] == "simulated"
            assert "Đã mô phỏng gửi email" in data["message"]
            assert data["recipient"] == "realuser@gmail.com"
            mock_smtp.assert_not_called()
    finally:
        app.dependency_overrides.clear()


def test_missing_smtp_config_returns_error_never_falls_back_to_mock(monkeypatch):
    """Khi SMTP_MOCK=false mà thiếu cấu hình hoặc chưa bật SMTP_ENABLED: trả lỗi rõ ràng, không fallback mock"""
    monkeypatch.setattr(settings, "SMTP_MOCK", False)
    monkeypatch.setattr(settings, "SMTP_ENABLED", True)
    monkeypatch.setattr(settings, "SMTP_USER", "")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "your-16-char-app-password")

    real_user = AuthenticatedUser(
        id="22222222-2222-2222-2222-222222222222",
        email="realuser@gmail.com",
        email_confirmed=True,
        is_mock=False,
    )
    app.dependency_overrides[get_current_user] = lambda: real_user
    try:
        client = TestClient(app)
        res = client.post("/api/alerts/test-email")
        assert res.status_code == 400
        detail = res.json()["detail"]
        assert "Thiếu cấu hình SMTP thật" in detail
        assert "SMTP_USER" in detail
        assert "SMTP_PASSWORD" in detail
        assert "your-16-char-app-password" not in detail
    finally:
        app.dependency_overrides.clear()


def test_smtp_rejection_returns_error_and_hides_password(monkeypatch, caplog):
    """Khi Gmail SMTP từ chối xác thực: trả lỗi rõ ràng, không in App Password ra log và không tính cooldown"""
    secret_app_pw = "supersecretapppw"
    monkeypatch.setattr(settings, "SMTP_MOCK", False)
    monkeypatch.setattr(settings, "SMTP_ENABLED", True)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setattr(settings, "SMTP_PORT", 587)
    monkeypatch.setattr(settings, "SMTP_USER", "sender@gmail.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", secret_app_pw)
    monkeypatch.setattr(settings, "SMTP_FROM_EMAIL", "sender@gmail.com")

    real_user = AuthenticatedUser(
        id="33333333-3333-3333-3333-333333333333",
        email="receiver@gmail.com",
        email_confirmed=True,
        is_mock=False,
    )
    app.dependency_overrides[get_current_user] = lambda: real_user
    try:
        mock_server = MagicMock()
        mock_server.__enter__.return_value = mock_server
        mock_server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"5.7.8 Username and Password not accepted")

        with caplog.at_level(logging.INFO):
            with patch("app.smtp_service.smtplib.SMTP", return_value=mock_server):
                client = TestClient(app)
                res = client.post("/api/alerts/test-email")
                assert res.status_code == 502
                detail = res.json()["detail"]
                assert "từ chối đăng nhập" in detail
                assert secret_app_pw not in detail
                assert secret_app_pw not in caplog.text
                # Không bị khóa cooldown khi gửi lỗi
                assert real_user.id not in _in_memory_test_cooldowns
    finally:
        app.dependency_overrides.clear()


def test_real_smtp_success_only_after_server_accepts_and_uses_verified_recipient(monkeypatch):
    """Thành công chỉ trả về khi SMTP server chấp nhận thư, người nhận lấy đúng từ phiên Supabase"""
    monkeypatch.setattr(settings, "SMTP_MOCK", False)
    monkeypatch.setattr(settings, "SMTP_ENABLED", True)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setattr(settings, "SMTP_PORT", 587)
    monkeypatch.setattr(settings, "SMTP_USER", "sender@gmail.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "abcd efgh ijkl mnop")
    monkeypatch.setattr(settings, "SMTP_FROM_EMAIL", "sender@gmail.com")

    real_user = AuthenticatedUser(
        id="44444444-4444-4444-4444-444444444444",
        email="verified.gmail@gmail.com",
        email_confirmed=True,
        is_mock=False,
    )
    app.dependency_overrides[get_current_user] = lambda: real_user
    try:
        mock_server = MagicMock()
        mock_server.__enter__.return_value = mock_server
        mock_server.send_message.return_value = {}

        with patch("app.smtp_service.smtplib.SMTP", return_value=mock_server):
            client = TestClient(app)
            res = client.post("/api/alerts/test-email")
            assert res.status_code == 200
            data = res.json()
            assert data["mode"] == "real"
            assert data["status"] == "accepted"
            assert "Máy chủ email đã chấp nhận thư" in data["message"]
            assert data["recipient"] == "verified.gmail@gmail.com"
            # App password 16 ký tự có dấu cách được chuẩn hóa trước khi login
            mock_server.login.assert_called_once_with("sender@gmail.com", "abcdefghijklmnop")
            sent_msg = mock_server.send_message.call_args[0][0]
            assert sent_msg["To"] == "verified.gmail@gmail.com"
    finally:
        app.dependency_overrides.clear()


def test_mock_auth_token_cannot_send_real_smtp_email(monkeypatch):
    """Phiên Mock Auth (@example.com) phải bị từ chối khi SMTP_MOCK=false"""
    monkeypatch.setattr(settings, "SMTP_MOCK", False)
    monkeypatch.setattr(settings, "SMTP_ENABLED", True)
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    monkeypatch.setattr(settings, "SUPABASE_ANON_KEY", "")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "")
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "")
    monkeypatch.setattr(settings, "ALLOW_MOCK_AUTH", True)

    client = TestClient(app)
    res = client.post(
        "/api/alerts/test-email",
        headers={"Authorization": "Bearer mock-token-usr_tester"},
    )
    assert res.status_code == 401
    assert "@example.com" in res.json()["detail"]


def test_supabase_token_verification_extracts_verified_email(monkeypatch):
    """Chế độ thật: FastAPI xác thực JWT qua Supabase Auth API và lấy đúng email đã xác minh"""
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://myproj.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_ANON_KEY", "real-anon-key-123")
    monkeypatch.setattr(settings, "ALLOW_MOCK_AUTH", None)

    async def _test():
        # 1. Mock-token phải bị từ chối khi Supabase đã cấu hình
        rejected = await verify_supabase_token("mock-token-usr_abc")
        assert rejected is None

        # 2. Token Supabase thật -> trích xuất đúng email & email_confirmed từ /auth/v1/user
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "55555555-5555-5555-5555-555555555555",
            "email": "supabase.user@gmail.com",
            "email_confirmed_at": "2026-11-25T03:00:00Z",
        }
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.get.return_value = mock_response

        with patch("app.auth.httpx.AsyncClient", return_value=mock_client):
            user = await verify_supabase_token("eyJhbGciOiJIUzI1NiJ9.real.jwt")
            assert user is not None
            assert user.email == "supabase.user@gmail.com"
            assert user.email_confirmed is True
            assert user.is_mock is False

    asyncio.run(_test())


def test_video_fire_alert_uses_same_smtp_service_for_mock_and_real(monkeypatch):
    """Email cảnh báo từ Video/Webcam dùng chung dịch vụ SMTP và phản ánh đúng mode mock/real"""
    async def _test():
        tracker = BackendFireTracker(trigger_confidence=0.30, continue_confidence=0.20, confirm_duration_ms=500.0)
        user_id = "66666666-6666-6666-6666-666666666666"
        user_email = "alert.owner@gmail.com"
        await set_user_preferences(user_id, user_email, True)

        # Kiểm tra chế độ SMTP_MOCK=true trên video alert
        monkeypatch.setattr(settings, "SMTP_MOCK", True)
        await tracker.process_frame("sess-shared-mock", [make_det("fire", 0.6)], 0.0, "video", "best.pt", user_id, user_email)
        await tracker.process_frame("sess-shared-mock", [make_det("fire", 0.6)], 300.0, "video", "best.pt", user_id, user_email)
        await tracker.process_frame("sess-shared-mock", [make_det("fire", 0.6)], 600.0, "video", "best.pt", user_id, user_email)
        await asyncio.sleep(0.08)

        dispatches = await get_user_session_dispatches(user_id, "sess-shared-mock")
        assert len(dispatches) == 1
        assert dispatches[0]["status"] == "sent"
        assert dispatches[0]["mode"] == "mock"
        assert dispatches[0]["recipient_email"] == user_email

    asyncio.run(_test())


def test_tracker_rejects_excessive_gap_0ms_to_1200ms():
    """Khoảng ngắt 0ms -> 1200ms vượt max_gap_ms=400ms KHÔNG được cộng dồn xác nhận"""
    async def _test():
        tracker = BackendFireTracker(
            trigger_confidence=0.30,
            continue_confidence=0.20,
            confirm_duration_ms=500.0,
            max_gap_ms=400.0,
        )
        events1 = await tracker.process_frame("sess-gap", [make_det("fire", 0.7)], 0.0, "video", "plain.pt")
        assert len(events1) == 0

        events2 = await tracker.process_frame("sess-gap", [make_det("fire", 0.7)], 1200.0, "video", "plain.pt")
        assert len(events2) == 0

        # Tiếp tục duy trì liên tục từ 1200ms -> 1450ms -> 1750ms mới xác nhận đúng 1 sự kiện
        await tracker.process_frame("sess-gap", [make_det("fire", 0.7)], 1450.0, "video", "plain.pt")
        events3 = await tracker.process_frame("sess-gap", [make_det("fire", 0.7)], 1750.0, "video", "plain.pt")
        assert len(events3) == 1

    asyncio.run(_test())


def test_tracker_does_not_merge_frames_across_checkpoint_switch():
    """Đổi checkpoint giữa chừng không được gộp frame của hai model thành cùng cảnh báo"""
    async def _test():
        tracker = BackendFireTracker(
            trigger_confidence=0.30,
            continue_confidence=0.20,
            confirm_duration_ms=500.0,
            max_gap_ms=400.0,
        )
        await tracker.process_frame("sess-switch", [make_det("fire", 0.7)], 0.0, "video", "model_a.pt")
        await tracker.process_frame("sess-switch", [make_det("fire", 0.7)], 300.0, "video", "model_a.pt")

        # Frame tại t=600ms đến từ model_b.pt -> reset ứng viên model_a, không confirm ở 600ms
        events_switch = await tracker.process_frame("sess-switch", [make_det("fire", 0.7)], 600.0, "video", "model_b.pt")
        assert len(events_switch) == 0

        # Nếu gọi reset_all_sessions() cũng phải xóa sạch mọi phiên theo dõi dở
        tracker.reset_all_sessions()
        assert len(tracker.sessions) == 0

    asyncio.run(_test())


def test_supabase_token_cache_avoids_repeated_network_calls_per_frame(monkeypatch):
    """Xác thực frame liên tiếp cùng token hợp lệ dùng TTL cache, không gọi HTTPS lặp lại từng frame"""
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://myproj.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_ANON_KEY", "real-anon-key-123")
    monkeypatch.setattr(settings, "ALLOW_MOCK_AUTH", None)

    async def _test():
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "55555555-5555-5555-5555-555555555555",
            "email": "cached.user@gmail.com",
            "email_confirmed_at": "2026-11-25T03:00:00Z",
        }
        mock_client = AsyncMock()
        mock_client.is_closed = False
        mock_client.get.return_value = mock_response

        with patch("app.auth._get_auth_client", return_value=mock_client):
            tok = "eyJhbGciOiJIUzI1NiJ9.cached.frame.token"
            for _ in range(5):
                u = await verify_supabase_token(tok, use_cache=True)
                assert u is not None
                assert u.email == "cached.user@gmail.com"
            # Chỉ gọi Supabase /auth/v1/user đúng 1 lần cho cả 5 frame!
            assert mock_client.get.call_count == 1

    asyncio.run(_test())



