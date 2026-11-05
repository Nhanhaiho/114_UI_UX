from typing import List, Optional, Dict
from pydantic import BaseModel, Field

class DetectionItem(BaseModel):
    class_id: int = Field(..., description="ID của lớp (ví dụ: 0 là lửa)")
    class_name: str = Field(..., description="Tên lớp (ví dụ: fire)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Điểm tin cậy [0, 1]")
    box: List[float] = Field(..., description="Bounding box chuẩn hóa [x1, y1, x2, y2] trong khoảng [0, 1]")

class InferenceResponse(BaseModel):
    session_id: Optional[str] = Field(None, description="Mã phiên làm việc")
    generation_id: Optional[int] = Field(None, description="Số thế hệ để hủy bỏ phản hồi cũ")
    frame_id: Optional[int] = Field(None, description="Thứ tự frame")
    timestamp_ms: Optional[float] = Field(None, description="Thời điểm của media tính bằng ms")
    image_width: int = Field(..., description="Chiều rộng ảnh gốc gửi lên")
    image_height: int = Field(..., description="Chiều cao ảnh gốc gửi lên")
    inference_ms: float = Field(..., description="Thời gian mô hình tính toán (ms)")
    mode: str = Field(..., description="Chế độ suy luận: 'real' hoặc 'mock'")
    detections: List[DetectionItem] = Field(default_factory=list, description="Danh sách box phát hiện")

class ModelStatusResponse(BaseModel):
    is_ready: bool = Field(..., description="Mô hình thật đã sẵn sàng suy luận chưa")
    model_name: Optional[str] = Field(None, description="Tên hoặc kiến trúc mô hình")
    model_path: str = Field(..., description="Đường dẫn file trọng số đã cấu hình")
    device: str = Field(..., description="Thiết bị tính toán thực tế (cpu, cuda:0,...)")
    imgsz: int = Field(..., description="Kích thước đầu vào chuẩn của mô hình")
    supported_classes: Dict[int, str] = Field(default_factory=dict, description="Danh sách lớp hỗ trợ từ checkpoint")
    error_message: Optional[str] = Field(None, description="Mô tả lỗi nếu chưa nạp được mô hình")
    notes: str = Field(..., description="Ghi chú trạng thái hoặc hướng dẫn tích hợp")

class HealthResponse(BaseModel):
    status: str = Field(..., description="Trạng thái dịch vụ")
    model_ready: bool = Field(..., description="Trạng thái sẵn sàng của mô hình")
    uptime_seconds: float = Field(..., description="Thời gian backend đã hoạt động (giây)")

class ErrorResponse(BaseModel):
    error: str = Field(..., description="Mã lỗi")
    message: str = Field(..., description="Thông báo lỗi chi tiết dễ hiểu")

