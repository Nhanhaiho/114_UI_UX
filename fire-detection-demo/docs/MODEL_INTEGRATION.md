# Hướng dẫn & Nhật ký Tích hợp Mô hình YOLO26n-P2 + SRC

Tài liệu ghi nhận chi tiết quy trình tích hợp thành công checkpoint huấn luyện thực tế `src_ratio8.pt` cùng module kiến trúc **Spatial-Relational Co-Attention (SRC)** vào backend của Fire Detection Studio.

---

## 1. Cấu trúc tích hợp

```text
fire-detection-demo/
  backend/
    weights/
      src_ratio8.pt        <-- File checkpoint YOLO26n-P2 + SRC (sr_ratio=8)
    model_code/
      src/
        modules/
          attention/
            src.py         <-- Định nghĩa SpatialRelationalCoAttention gốc
      src_coattention.py   <-- Re-export và tự động đăng ký vào Ultralytics
    app/
      config.py            <-- Cấu hình MODEL_PATH, DEVICE, IMGSZ
      detector.py          <-- Nạp YoloSRCDetector một lần duy nhất lúc khởi động
```

---

## 2. Chi tiết kỹ thuật & Giải quyết phụ thuộc

### a. Module tùy chỉnh: Spatial-Relational Co-Attention (SRC)
- Checkpoint `src_ratio8.pt` được huấn luyện với lớp `SpatialRelationalCoAttention` tại layer 20 (nhánh feature map P2).
- Luồng unpickling PyTorch của Ultralytics tham chiếu đến namespace `src.modules.attention.src.SpatialRelationalCoAttention`.
- Hệ thống đã tự động bổ sung cấu trúc module chuẩn tại `backend/model_code/src/modules/attention/src.py` và đăng ký vào cả `ultralytics.nn.modules` lẫn `ultralytics.nn.tasks`.

### b. Mapping lớp nhận diện (model.names)
- `model.names` được đọc tự động trực tiếp từ checkpoint:
  - Lớp `0`: `fire` (Lửa) - Viền đỏ, nhãn pill tương phản cao, đốm đỏ ở danh sách kết quả.
  - Lớp `1`: `smoke` (Khói) - Viền cyan/xanh ngọc, nhãn pill tương phản cao, đốm cyan ở danh sách kết quả.

### c. API Contract & Tọa độ Bounding Box
- Toàn bộ kết quả inference trả về tọa độ chuẩn hóa `[x1, y1, x2, y2]` trong khoảng `[0.0, 1.0]`.
- Frontend tự động chuyển đổi qua `calculateContainRect` để khớp chính xác theo tỷ lệ ảnh `object-fit: contain` mà không bị lệch viền đen hay khi thay đổi kích thước cửa sổ.
- Đánh dấu thuộc tính `mode: "real"` trong phản hồi HTTP.

---

## 3. Kiểm chứng thực tế

| Điểm kiểm tra | Kết quả quan sát |
|---|---|
| Khởi động Backend | `Detector khởi tạo xong. Trạng thái mô hình thật: SẴN SÀNG` trên `cuda:0` |
| `GET /api/model/status` | `is_ready: true`, `model_name: "YOLO26n-P2-SRC (src_ratio8.pt)"`, `device: "cuda:0"`, `supported_classes: {0: 'fire', 1: 'smoke'}` |
| Ảnh có lửa & khói (`sample_fire_smoke.jpg`) | Phát hiện **6 bounding box**: 3 vùng khói (tin cậy 79.5%, 35.1%, 34.2%) và 3 vùng lửa (tin cậy 52.1%, 50.6%, 42.1%). |
| Ảnh bình thường (`sample_neutral.jpg`) | Phát hiện **0 bounding box** ở ngưỡng 0.25 (không báo động giả). |
| Độ trễ suy luận (Inference Latency) | Khoảng **29 ms - 89 ms** trên GPU CUDA (đạt tốc độ >30 FPS). |
