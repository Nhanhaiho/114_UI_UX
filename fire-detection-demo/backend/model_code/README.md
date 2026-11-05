# Thư mục chứa Mã nguồn Kiến trúc Mô hình Tùy chỉnh (Model Code)

Đặt mã nguồn định nghĩa module **Spatial Relations Co-Attention (SRC)** hoặc kiến trúc YOLO26n-P2 tùy chỉnh vào đây:
- Ví dụ: `src_coattention.py`, `yolo_src.py`, v.v.

## Cách thức hoạt động
1. Khi nạp checkpoint `best.pt`, PyTorch và Ultralytics có thể cần import các lớp tùy chỉnh (custom modules) đã được định nghĩa lúc huấn luyện.
2. Backend tự động thêm thư mục `model_code/` vào `sys.path` của Python khi khởi chạy.
3. Nhờ đó, quá trình unpickling checkpoint sẽ tự động tìm thấy các class kiến trúc SRC mà không bị lỗi `AttributeError` hoặc `ModuleNotFoundError`.

