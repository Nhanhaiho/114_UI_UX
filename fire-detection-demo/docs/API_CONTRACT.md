# Hợp đồng Dữ liệu & API Contract — Fire Detection Studio

Tài liệu này quy định chi tiết giao diện lập trình ứng dụng (API Contract) giữa giao diện người dùng (Frontend React) và dịch vụ xử lý thị giác máy tính (Backend FastAPI).

---

## 1. Nguyên tắc thiết kế

1. **Truyền tải Binary:** Sử dụng `multipart/form-data` để gửi dữ liệu ảnh nhị phân trực tiếp (JPEG/PNG/WebP), không mã hóa Base64 nhằm tiết kiệm băng thông và giảm độ trễ CPU.
2. **Tọa độ chuẩn hóa:** Toàn bộ bounding box trả về được chuẩn hóa trong khoảng $[0.0, 1.0]$ theo thứ tự `[x1, y1, x2, y2]`. Frontend chịu trách nhiệm nhân với kích thước vùng hiển thị thực tế (bù trừ viền đen của `object-fit: contain`).
3. **Tuần tự hóa suy luận (In-flight constraint):** Mỗi phiên chỉ gửi tối đa 1 frame đang chờ xử lý. Khung hình tiếp theo chỉ được lấy mẫu sau khi request trước đã nhận được phản hồi.
4. **Hủy bỏ phản hồi cũ bằng `generation_id`:** Khi người dùng tua video, đổi nguồn media hoặc đổi cấu hình, `generation_id` tăng lên. Phản hồi có `generation_id` cũ hơn giá trị hiện tại bị frontend hủy bỏ ngay lập tức để tránh hiện tượng box trôi dạt trên frame mới.

---

## 2. Danh sách Endpoints

### 2.1 Kiểm tra trạng thái máy chủ (`GET /api/health`)

- **Phương thức:** `GET`
- **Đường dẫn:** `/api/health`
- **Mục đích:** Kiểm tra kết nối mạng và tình trạng nạp mô hình.
- **Response:** `200 OK`
  ```json
  {
    "status": "ok",
    "model_ready": false,
    "uptime_seconds": 128.4
  }
  ```

---

### 2.2 Chi tiết cấu hình mô hình (`GET /api/model/status`)

- **Phương thức:** `GET`
- **Đường dẫn:** `/api/model/status`
- **Mục đích:** Cung cấp thông tin phần cứng, đường dẫn weights, kích thước imgsz và các lớp đã học.
- **Response:** `200 OK`
  ```json
  {
    "is_ready": false,
    "model_name": null,
    "model_path": "weights/best.pt",
    "device": "cuda:0",
    "imgsz": 640,
    "supported_classes": {},
    "error_message": "Không tìm thấy file checkpoint tại 'weights/best.pt'...",
    "notes": "Mô hình chưa được nạp. Bạn có thể sử dụng chế độ 'Xem thử giao diện' để kiểm tra UI."
  }
  ```

---

### 2.3 Suy luận phát hiện lửa (`POST /api/infer/image`)

- **Phương thức:** `POST`
- **Content-Type:** `multipart/form-data`
- **Mục đích:** Nhận ảnh tĩnh hoặc 1 frame trích xuất từ video/webcam và thực thi mô hình YOLO26n-P2 + SRC.

#### Request Form Fields:

| Tên trường | Kiểu dữ liệu | Bắt buộc | Mô tả |
|---|---|---|---|
| `file` | Binary File | Có | Tệp ảnh JPEG, PNG hoặc WebP |
| `session_id` | String | Không | Mã định danh phiên làm việc |
| `generation_id` | Integer | Không | Số thế hệ dùng để loại bỏ response cũ khi tua |
| `frame_id` | Integer | Không | Số thứ tự tăng dần của frame |
| `timestamp_ms` | Float | Không | Thời điểm phát của media (mili-giây) |
| `confidence_threshold` | Float | Không | Ngưỡng tin cậy lọc kết quả (mặc định 0.25) |
| `use_mock` | Boolean | Không | `true` để kích hoạt chế độ xem thử mô phỏng cố định |

#### Response Thành công (`200 OK`):

```json
{
  "session_id": "session-demo",
  "generation_id": 2,
  "frame_id": 14,
  "timestamp_ms": 3400.0,
  "image_width": 1280,
  "image_height": 720,
  "inference_ms": 38.6,
  "mode": "real",
  "detections": [
    {
      "class_id": 0,
      "class_name": "fire",
      "confidence": 0.912,
      "box": [0.215, 0.320, 0.375, 0.615]
    }
  ]
}
```

*Trong đó:*
- `box`: `[x1, y1, x2, y2]` với:
  - `x1`: Tỉ lệ khoảng cách từ mép trái đến cạnh trái box $[0, 1]$
  - `y1`: Tỉ lệ khoảng cách từ mép trên đến cạnh trên box $[0, 1]$
  - `x2`: Tỉ lệ khoảng cách từ mép trái đến cạnh phải box $[0, 1]$
  - `y2`: Tỉ lệ khoảng cách từ mép trên đến cạnh dưới box $[0, 1]$
- `inference_ms`: Thời gian mô hình tính toán thực tế trên GPU/CPU (không bao gồm độ trễ mạng).
- `mode`: `"real"` (suy luận từ checkpoint thật) hoặc `"mock"` (mô phỏng xem thử).

#### Mã lỗi (Error Responses):

- **`400 Bad Request`**: Dữ liệu tệp tải lên không phải định dạng ảnh hợp lệ hoặc bị hỏng.
  ```json
  { "detail": "Tệp tải lên không phải là ảnh hợp lệ hoặc dữ liệu bị hỏng." }
  ```
- **`413 Request Entity Too Large`**: Dung lượng ảnh vượt quá giới hạn cấu hình (mặc định 20MB).
  ```json
  { "detail": "Kích thước tệp vượt quá giới hạn cho phép (20 MB)." }
  ```
- **`503 Service Unavailable`**: Mô hình chưa sẵn sàng và người dùng không yêu cầu mock:
  ```json
  {
    "error": "model_not_ready",
    "message": "Mô hình chưa sẵn sàng. Vui lòng đặt checkpoint vào weights/best.pt hoặc sử dụng chế độ 'Xem thử giao diện'."
  }
  ```

