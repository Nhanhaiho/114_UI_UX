import sys
import os
import time
import threading
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional
from PIL import Image, ImageOps
import numpy as np

from app.config import settings
from app.schemas import DetectionItem, ModelStatusResponse

logger = logging.getLogger("fire_detector")

class DetectorAdapter(ABC):
    """Lớp trừu tượng cho các bộ nhận diện đối tượng"""

    @abstractmethod
    def is_ready(self) -> bool:
        """Kiểm tra xem mô hình thật đã sẵn sàng chưa"""
        pass

    @abstractmethod
    def get_status(self) -> ModelStatusResponse:
        """Lấy thông tin trạng thái chi tiết của mô hình"""
        pass

    @abstractmethod
    def infer(self, image: Image.Image, conf_threshold: float) -> Tuple[List[DetectionItem], float, str]:
        """
        Thực hiện suy luận trên ảnh PIL.
        Trả về (danh sách detection, thời gian suy luận ms, chế độ 'real'|'mock')
        """
        pass


class YoloSRCDetector(DetectorAdapter):
    """
    Bộ nhận diện tích hợp YOLO26n-P2 kèm module SRC (Spatial Relations Co-Attention).
    Nạp mô hình 1 lần khi khởi động và hỗ trợ khóa thread an toàn.
    """

    def __init__(self):
        self._is_ready: bool = False
        self._error_message: Optional[str] = None
        self._model = None
        self._model_name: Optional[str] = None
        self._classes: Dict[int, str] = {}
        self._lock = threading.Lock()
        
        # Thiết bị
        import torch
        if settings.DEVICE:
            self._device = settings.DEVICE
        else:
            self._device = "cuda:0" if torch.cuda.is_available() else "cpu"
        
        self._imgsz = settings.IMGSZ
        self._model_path = Path(settings.MODEL_PATH)
        self._model_code_dir = Path(settings.MODEL_CODE_DIR)
        
        self._load_model()

    def _setup_custom_modules(self):
        """Thêm thư mục chứa mã nguồn SRC vào sys.path để PyTorch unpickling nhận diện được module"""
        if self._model_code_dir.exists():
            code_dir_str = str(self._model_code_dir.resolve())
            if code_dir_str not in sys.path:
                sys.path.insert(0, code_dir_str)
                logger.info(f"Đã thêm đường dẫn module SRC vào sys.path: {code_dir_str}")

        # Tự động nạp và đăng ký SpatialRelationalCoAttention nếu có trong model_code
        try:
            import src.modules.attention.src as src_module
            if hasattr(src_module, "register_src"):
                src_module.register_src()
            logger.info("Đã đăng ký thành công module SRC (SpatialRelationalCoAttention) vào Ultralytics.")
        except Exception as e:
            logger.debug(f"Không thể import src.modules.attention.src tự động: {e}")

    def _load_model(self):
        self._setup_custom_modules()

        if not self._model_path.exists():
            self._is_ready = False
            self._error_message = (
                f"Không tìm thấy file checkpoint tại '{self._model_path}'. "
                f"Vui lòng đặt file best.pt vào thư mục 'weights/' hoặc điều chỉnh MODEL_PATH."
            )
            logger.warning(self._error_message)
            return

        try:
            from ultralytics import YOLO
            logger.info(f"Đang nạp checkpoint từ {self._model_path} lên thiết bị {self._device}...")
            self._model = YOLO(str(self._model_path))
            
            # Lấy tên các lớp từ model checkpoint
            if hasattr(self._model, 'names') and self._model.names:
                self._classes = {int(k): str(v) for k, v in self._model.names.items()}
            else:
                self._classes = {0: "fire", 1: "smoke"}

            self._model_name = f"YOLO26n-P2-SRC ({self._model_path.name})"
            self._is_ready = True
            self._error_message = None
            logger.info(f"Nạp mô hình thành công! Danh sách lớp: {self._classes}")
        except Exception as e:
            self._is_ready = False
            self._error_message = (
                f"Lỗi khi nạp mô hình ({type(e).__name__}): {str(e)}. "
                f"Nếu mô hình dùng module SRC tùy chỉnh, hãy đảm bảo đặt mã src_coattention.py "
                f"vào thư mục 'model_code/' và dùng đúng phiên bản Ultralytics/PyTorch."
            )
            logger.error(self._error_message, exc_info=True)

    def is_ready(self) -> bool:
        return self._is_ready

    def get_status(self) -> ModelStatusResponse:
        notes = (
            "Mô hình đã sẵn sàng cho suy luận thực tế."
            if self._is_ready
            else "Mô hình chưa được nạp. Bạn có thể sử dụng chế độ 'Xem thử giao diện' để kiểm tra UI và tính năng media."
        )
        return ModelStatusResponse(
            is_ready=self._is_ready,
            model_name=self._model_name,
            model_path=str(self._model_path),
            device=self._device,
            imgsz=self._imgsz,
            supported_classes=self._classes,
            error_message=self._error_message,
            notes=notes,
        )

    def infer(self, image: Image.Image, conf_threshold: float) -> Tuple[List[DetectionItem], float, str]:
        if not self._is_ready or self._model is None:
            raise RuntimeError(self._error_message or "Mô hình chưa sẵn sàng")

        # Chuẩn hóa hướng xoay EXIF để box khớp với ảnh hiển thị
        normalized_img = ImageOps.exif_transpose(image)
        img_w, img_h = normalized_img.size

        start_time = time.perf_counter()

        with self._lock:
            # Chạy inference
            results = self._model.predict(
                source=normalized_img,
                conf=conf_threshold,
                imgsz=self._imgsz,
                device=self._device,
                verbose=False,
            )

        inference_ms = (time.perf_counter() - start_time) * 1000.0

        detections: List[DetectionItem] = []
        if len(results) > 0 and results[0].boxes is not None:
            boxes = results[0].boxes
            # xyxyn: tọa độ normalized [0, 1] [x1, y1, x2, y2]
            xyxyn = boxes.xyxyn.cpu().numpy()
            confs = boxes.conf.cpu().numpy()
            clses = boxes.cls.cpu().numpy()

            for i in range(len(boxes)):
                cls_id = int(clses[i])
                cls_name = self._classes.get(cls_id, f"class_{cls_id}")
                conf = float(confs[i])
                box = [
                    float(np.clip(xyxyn[i][0], 0.0, 1.0)),
                    float(np.clip(xyxyn[i][1], 0.0, 1.0)),
                    float(np.clip(xyxyn[i][2], 0.0, 1.0)),
                    float(np.clip(xyxyn[i][3], 0.0, 1.0)),
                ]
                detections.append(
                    DetectionItem(
                        class_id=cls_id,
                        class_name=cls_name,
                        confidence=round(conf, 4),
                        box=box,
                    )
                )

        return detections, round(inference_ms, 2), "real"


class MockDetector(DetectorAdapter):
    """
    Bộ nhận diện mô phỏng cố định dùng cho chế độ 'Xem thử giao diện'.
    Luôn dán nhãn 'mock', không thay thế mô hình thật một cách âm thầm.
    """

    def __init__(self):
        self._is_ready = True

    def is_ready(self) -> bool:
        return True

    def get_status(self) -> ModelStatusResponse:
        return ModelStatusResponse(
            is_ready=True,
            model_name="Mock-Demonstrator (Mô phỏng mẫu)",
            model_path="[Mock Memory Pattern]",
            device="cpu",
            imgsz=640,
            supported_classes={0: "fire", 1: "smoke"},
            error_message=None,
            notes="Chế độ mô phỏng hiển thị hộp mẫu cố định để kiểm tra giao diện và luồng media.",
        )

    def infer(self, image: Image.Image, conf_threshold: float) -> Tuple[List[DetectionItem], float, str]:
        # Giả lập thời gian tính toán thực tế khoảng 28 - 35ms
        time.sleep(0.025)
        inference_ms = 28.5

        # Trả về 1 bounding box mô phỏng vị trí ngọn lửa mẫu ở trung tâm
        # Chỉ trả về nếu ngưỡng tin cậy <= 0.88
        detections: List[DetectionItem] = []
        mock_conf = 0.88
        if mock_conf >= conf_threshold:
            detections.append(
                DetectionItem(
                    class_id=0,
                    class_name="fire",
                    confidence=mock_conf,
                    box=[0.38, 0.45, 0.62, 0.76],
                )
            )

        return detections, inference_ms, "mock"

