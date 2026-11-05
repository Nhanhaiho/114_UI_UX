# Thư mục chứa Checkpoint Mô hình (Weights)

Đã tích hợp checkpoint thật:
- **Tệp trọng số hiện tại**: `weights/src_ratio8.pt` (hoặc `best.pt`)
- **Kiến trúc mô hình**: YOLO26n-P2 kèm module Spatial-Relational Co-Attention (SRC) với sr_ratio=8.
- **Danh sách lớp (model.names)**:
  - `0`: `fire` (Lửa)
  - `1`: `smoke` (Khói)

## Cấu hình qua .env
```env
MODEL_PATH=weights/src_ratio8.pt
MODEL_CODE_DIR=model_code
DEVICE=  # để trống chọn GPU CUDA nếu có, hoặc điền 'cuda:0', 'cpu'
IMGSZ=640
CONF_THRESHOLD=0.25
```
