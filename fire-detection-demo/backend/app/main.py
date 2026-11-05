import io
import time
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError

from app.config import settings
from app.schemas import (
    HealthResponse,
    ModelStatusResponse,
    InferenceResponse,
    ErrorResponse,
)
from app.detector import YoloSRCDetector, MockDetector

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
    logger.info("Khởi động FastAPI server, đang chuẩn bị detector...")
    # Nạp YoloSRCDetector một lần duy nhất khi khởi động
    real_detector = YoloSRCDetector()
    mock_detector = MockDetector()
    logger.info(f"Detector khởi tạo xong. Trạng thái mô hình thật: {'SẴN SÀNG' if real_detector.is_ready() else 'CHƯA NẠP'}")
    yield
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
    use_mock: bool = Form(False, description="Chủ động bật chế độ xem thử mẫu khi chưa có checkpoint thật"),
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
        # Nạp dữ liệu ảnh vào bộ nhớ để xác nhận giải mã thành công
        image.load()
    except (UnidentifiedImageError, Exception) as e:
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

