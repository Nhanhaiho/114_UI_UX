import io
import time
import asyncio
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional
from pydantic import BaseModel

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError

from app.config import settings, ENV_FILE_PATH
from app.schemas import (
    HealthResponse,
    ModelStatusResponse,
    InferenceResponse,
    ErrorResponse,
    UserPreferencesResponse,
    UpdatePreferencesRequest,
    TestEmailResponse,
    ResetSessionRequest,
    SessionDispatchesResponse,
    EmailDispatchItem,
)
from app.detector import YoloSRCDetector, MockDetector, update_env_model_path
from app.auth import get_current_user, get_optional_user, AuthenticatedUser
from app.database import (
    get_user_preferences,
    set_user_preferences,
    can_send_test_email,
    record_test_email_sent,
    get_user_session_dispatches,
)
from app.smtp_service import send_test_email
from app.fire_tracker import backend_fire_tracker

# Cấu hình logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("fire_studio_api")

# Biến toàn cục detector và thời gian khởi động
start_time = time.time()
real_detector: Optional[YoloSRCDetector] = None
mock_detector: Optional[MockDetector] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global real_detector, mock_detector
    logger.info(
        "Cấu hình khởi động: env_file=%s (tồn tại=%s) | SMTP_MOCK=%s | SMTP_ENABLED=%s | SupabaseAuth=%s | SupabaseDB=%s",
        ENV_FILE_PATH,
        ENV_FILE_PATH.exists(),
        settings.SMTP_MOCK,
        settings.SMTP_ENABLED,
        settings.is_supabase_auth_configured,
        settings.is_supabase_db_configured,
    )
    logger.info("Khởi động FastAPI server, đang chuẩn bị detector...")
    # Nạp YoloSRCDetector một lần duy nhất khi khởi động
    real_detector = YoloSRCDetector()
    mock_detector = MockDetector()
    logger.info(f"Detector khởi tạo xong. Trạng thái mô hình thật: {'SẴN SÀNG' if real_detector.is_ready() else 'CHƯA NẠP'}")

    # Background task tự động theo dõi file .env mỗi 1.5 giây
    stop_event = asyncio.Event()

    async def env_watcher():
        while not stop_event.is_set():
            try:
                if real_detector:
                    real_detector.check_env_update()
            except Exception as e:
                logger.debug(f"Lỗi env_watcher: {e}")
            await asyncio.sleep(1.5)

    watcher_task = asyncio.create_task(env_watcher())
    yield
    stop_event.set()
    watcher_task.cancel()
    logger.info("Đang tắt FastAPI server...")


app = FastAPI(
    title="Fire Detection Studio Backend",
    description="API phát hiện lửa sử dụng YOLO26n-P2 và Spatial Relations Co-Attention (SRC)",
    version="1.0.0",
    lifespan=lifespan,
)

# Cấu hình CORS cho phép frontend truy cập
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Kiểm tra sức khỏe dịch vụ và trạng thái nạp mô hình"""
    uptime = time.time() - start_time
    is_ready = real_detector.is_ready() if real_detector else False
    return HealthResponse(
        status="ok",
        model_ready=is_ready,
        uptime_seconds=round(uptime, 2),
    )


@app.get("/api/model/status", response_model=ModelStatusResponse)
async def get_model_status():
    """Lấy chi tiết trạng thái mô hình thật, thiết bị, kích thước ảnh và các lớp hỗ trợ"""
    if not real_detector:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Detector chưa được khởi tạo.",
        )
    return real_detector.get_status()


class SwitchModelRequest(BaseModel):
    model_path: str


@app.get("/api/model/list")
async def list_available_models():
    """Liệt kê danh sách các file checkpoint .pt có sẵn trong thư mục weights/"""
    weights_dir = Path("weights")
    models = []
    if weights_dir.exists():
        for p in sorted(weights_dir.glob("*.pt")):
            models.append({
                "filename": p.name,
                "path": f"weights/{p.name}",
                "size_mb": round(p.stat().st_size / (1024 * 1024), 2),
            })
    current_name = real_detector._model_path.name if (real_detector and real_detector._model_path) else ""
    return {
        "current_model": current_name,
        "models": models,
    }


@app.post("/api/model/switch", response_model=ModelStatusResponse)
async def switch_model_endpoint(req: SwitchModelRequest):
    """Đổi model đang chạy ngay lập tức và đồng bộ vào file .env"""
    if not real_detector:
        raise HTTPException(status_code=503, detail="Detector chưa khởi tạo")

    target_path = Path(req.model_path)
    if not target_path.exists():
        target_path = Path("weights") / req.model_path
        if not target_path.exists():
            raise HTTPException(status_code=404, detail=f"Không tìm thấy file checkpoint: {req.model_path}")

    try:
        normalized_path = str(target_path).replace("\\", "/")
        real_detector.switch_model(normalized_path)
        update_env_model_path(normalized_path)
        return real_detector.get_status()
    except Exception as e:
        logger.error(f"Lỗi khi chuyển đổi model: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi khi chuyển đổi model: {str(e)}")


# =============================================================================
# ENDPOINTS QUẢN LÝ TÙY CHỌN EMAIL & XÁC NHẬN CẢNH BÁO
# =============================================================================

@app.get("/api/user/preferences", response_model=UserPreferencesResponse)
async def get_preferences_endpoint(user: AuthenticatedUser = Depends(get_current_user)):
    """Lấy tùy chọn nhận cảnh báo qua email của người dùng đã xác thực"""
    prefs = await get_user_preferences(user.id)
    return UserPreferencesResponse(
        user_id=user.id,
        email=user.email,
        email_alerts_enabled=bool(prefs.get("email_alerts_enabled", False)),
        updated_at=prefs.get("updated_at"),
    )


@app.post("/api/user/preferences", response_model=UserPreferencesResponse)
async def update_preferences_endpoint(
    req: UpdatePreferencesRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Bật/tắt tùy chọn nhận cảnh báo lửa qua email"""
    updated = await set_user_preferences(user.id, user.email, req.email_alerts_enabled)
    return UserPreferencesResponse(
        user_id=user.id,
        email=user.email,
        email_alerts_enabled=bool(updated.get("email_alerts_enabled", False)),
        updated_at=updated.get("updated_at"),
    )


@app.post("/api/alerts/test-email", response_model=TestEmailResponse)
async def test_email_endpoint(user: AuthenticatedUser = Depends(get_current_user)):
    """
    Gửi email thử nghiệm độc lập với model, có giới hạn tần suất (cooldown).
    - Khi SMTP_MOCK=false: bắt buộc tài khoản Supabase đã xác minh email (không dùng mock auth @example.com)
      và chỉ trả thành công sau khi máy chủ SMTP chấp nhận thư.
    - Khi SMTP_MOCK=true: trả về trạng thái 'simulated' để UI hiển thị rõ đã mô phỏng.
    """
    if not settings.SMTP_MOCK:
        if user.is_mock:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=(
                    "Phiên đăng nhập hiện tại đang là Mock Auth (@example.com giả lập), không thể gửi email thật. "
                    "Hãy cấu hình Supabase Auth trong frontend/.env và backend/.env, sau đó đăng nhập lại bằng email thật."
                ),
            )
        if not user.email_confirmed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Địa chỉ email trên tài khoản Supabase chưa được xác minh. Vui lòng xác thực OTP trước.",
            )

    can_send, remaining = await can_send_test_email(user.id)
    if not can_send:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Vui lòng đợi {remaining} giây trước khi gửi lại email thử.",
        )

    result = await send_test_email(user.email)
    if not result.success:
        is_config_err = (result.error or "").startswith("ConfigError")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST if is_config_err else status.HTTP_502_BAD_GATEWAY,
            detail=result.message,
        )

    record_test_email_sent(user.id)
    return TestEmailResponse(
        success=True,
        mode=result.mode,
        status=result.status,
        message=result.message,
        recipient=user.email,
        cooldown_seconds=settings.TEST_EMAIL_COOLDOWN_SECONDS,
    )


@app.post("/api/alerts/reset-session")
async def reset_session_endpoint(req: ResetSessionRequest):
    """Xóa các ứng viên đang theo dõi dở dang khi tua video, đổi nguồn hoặc dừng AI"""
    backend_fire_tracker.reset_session(req.session_id)
    return {"status": "ok", "message": f"Đã reset phiên theo dõi {req.session_id}"}


@app.get("/api/alerts/session-dispatches", response_model=SessionDispatchesResponse)
async def get_session_dispatches_endpoint(
    session_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Lấy danh sách trạng thái gửi email thuộc phiên của người dùng (bảo đảm phân quyền)"""
    dispatches = await get_user_session_dispatches(user.id, session_id)
    items = [
        EmailDispatchItem(
            event_id=d["event_id"],
            session_id=d["session_id"],
            recipient_email=d["recipient_email"],
            status=d["status"],
            mode=d.get("mode", "real"),
            error_message=d.get("error_message"),
            sent_at=d.get("sent_at"),
            created_at=d["created_at"],
        )
        for d in dispatches
    ]
    return SessionDispatchesResponse(session_id=session_id, dispatches=items)


@app.post(
    "/api/infer/image",
    response_model=InferenceResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Tệp ảnh không hợp lệ"},
        413: {"model": ErrorResponse, "description": "Kích thước tệp quá lớn"},
        503: {"model": ErrorResponse, "description": "Mô hình chưa sẵn sàng"},
    },
)
async def infer_image(
    file: UploadFile = File(..., description="Tệp ảnh dạng binary (JPEG, PNG, WebP)"),
    session_id: Optional[str] = Form(None),
    generation_id: Optional[int] = Form(None),
    frame_id: Optional[int] = Form(None),
    timestamp_ms: Optional[float] = Form(None),
    confidence_threshold: Optional[float] = Form(None),
    source_type: Optional[str] = Form("image", description="Nguồn: 'image', 'video' hoặc 'camera'"),
    use_mock: bool = Form(False, description="Chủ động bật chế độ xem thử mẫu khi chưa có checkpoint thật"),
    user: Optional[AuthenticatedUser] = Depends(get_optional_user),
):
    """
    Điểm cuối suy luận dùng chung cho ảnh tĩnh và từng frame video/webcam.
    Nhận dữ liệu nhị phân qua multipart/form-data.
    """
    # 1. Kiểm tra kích thước tệp
    max_bytes = settings.MAX_IMAGE_SIZE_MB * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Kích thước tệp ({len(content) // 1024} KB) vượt quá giới hạn cho phép ({settings.MAX_IMAGE_SIZE_MB} MB).",
        )

    # 2. Giải mã hình ảnh bằng PIL
    try:
        image = Image.open(io.BytesIO(content))
        image.load()
    except (UnidentifiedImageError, Exception):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tệp tải lên không phải là ảnh hợp lệ hoặc dữ liệu bị hỏng.",
        )

    orig_w, orig_h = image.size
    conf_thresh = (
        confidence_threshold
        if confidence_threshold is not None
        else settings.DEFAULT_CONF_THRESHOLD
    )

    # 3. Chọn bộ nhận diện (Thật hoặc Mô phỏng khi được yêu cầu rõ ràng)
    if use_mock:
        if not mock_detector:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Mock detector chưa khởi tạo.",
            )
        detections, inference_ms, mode = mock_detector.infer(image, conf_thresh)
    else:
        if not real_detector or not real_detector.is_ready():
            error_msg = (
                real_detector.get_status().error_message
                if real_detector
                else "Mô hình AI chưa được nạp."
            )
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={
                    "error": "model_not_ready",
                    "message": error_msg or "Mô hình chưa sẵn sàng. Vui lòng đặt checkpoint vào weights/best.pt hoặc sử dụng chế độ 'Xem thử giao diện'.",
                },
            )

        try:
            detections, inference_ms, mode = real_detector.infer(image, conf_thresh)
        except Exception as e:
            logger.error(f"Lỗi trong quá trình suy luận: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Lỗi suy luận mô hình: {str(e)}",
            )

    # 4. Kích hoạt xác nhận sự kiện và gửi email bất đồng bộ trên backend (chỉ áp dụng với suy luận thật trên Video/Webcam)
    if mode == "real" and source_type in ("video", "camera") and session_id:
        model_short_name = (
            real_detector._model_path.name
            if (real_detector and real_detector._model_path)
            else "YOLO26n"
        )
        asyncio.create_task(
            backend_fire_tracker.process_frame(
                session_id=session_id,
                detections=[d.model_dump() for d in detections],
                timestamp_ms=timestamp_ms if timestamp_ms is not None else (time.time() * 1000.0),
                source_type=source_type,
                model_name=model_short_name,
                user_id=user.id if user else None,
                user_email=user.email if user else None,
                is_mock=use_mock,
                user_email_confirmed=user.email_confirmed if user else False,
                user_is_mock=user.is_mock if user else False,
            )
        )

    return InferenceResponse(
        session_id=session_id,
        generation_id=generation_id,
        frame_id=frame_id,
        timestamp_ms=timestamp_ms,
        image_width=orig_w,
        image_height=orig_h,
        inference_ms=inference_ms,
        mode=mode,
        detections=detections,
    )
