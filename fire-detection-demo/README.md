# Fire Detection Studio — Web Demo Thử Nghiệm Phát Hiện Lửa Bằng AI

Hệ thống web demo độc lập phục vụ kiểm nghiệm mô hình thị giác máy tính **YOLO26n-P2 + Spatial Relations Co-Attention (SRC)** trong bài toán phát hiện lửa nhỏ từ Ảnh, Video và Webcam.

---

## 1. Cấu trúc Dự án

```text
fire-detection-demo/
├── frontend/                     # Giao diện người dùng React + TypeScript + Vite
│   ├── src/
│   │   ├── components/           # Header, SourceTabs, MediaViewer, Toolbar, ResultPanel...
│   │   ├── hooks/                # useBackendStatus, useWebcam...
│   │   ├── services/             # API client giao tiếp backend qua multipart binary
│   │   ├── utils/                # Thuật toán tính toán bù trừ viền đen contain & formatters
│   │   └── types/                # TypeScript interface & contract definitions
│   └── package.json
├── backend/                      # Máy chủ suy luận FastAPI
│   ├── app/
│   │   ├── main.py               # FastAPI endpoints & CORS
│   │   ├── detector.py           # DetectorAdapter (YoloSRCDetector & MockDetector)
│   │   ├── schemas.py            # Pydantic schema
│   │   └── config.py             # Cấu hình biến môi trường
│   ├── weights/                  # Thư mục đặt checkpoint best.pt
│   ├── model_code/               # Thư mục đặt mã module SRC (src_coattention.py)
│   ├── requirements.txt
│   └── run.py                    # Script khởi chạy uvicorn
├── docs/
│   ├── API_CONTRACT.md           # Quy định chi tiết endpoints & dữ liệu
│   └── MODEL_INTEGRATION.md      # Hướng dẫn tích hợp best.pt và module SRC
├── sample_images/                # Ảnh mẫu thử nghiệm (cháy/khói và an toàn)
├── PROJECT_STRUCTURE.md          # Tóm tắt cấu trúc chi tiết phục vụ báo cáo Đồ án Cuối kỳ
└── README.md
```

---

## 2. Hướng dẫn Cài đặt & Khởi chạy

### Bước 1: Khởi chạy Backend (FastAPI)

Mở cửa sổ PowerShell mới:

```powershell
cd C:\fire_smoke_web\fire-detection-demo\backend

# Cài đặt các gói phụ thuộc (nếu chưa cài)
python -m pip install -r requirements.txt

# Khởi chạy máy chủ FastAPI (cổng 8000)
python run.py
```

- Endpoint API: `http://localhost:8000`
- Tài liệu tương tác Swagger: `http://localhost:8000/docs`

---

### Bước 2: Khởi chạy Frontend (React + Vite)

Mở một cửa sổ PowerShell khác:

```powershell
cd C:\fire_smoke_web\fire-detection-demo\frontend

# Cài đặt gói npm (đã cài sẵn)
npm install

# Khởi chạy giao diện phát triển (cổng 5173)
npm run dev
```

- Mở trình duyệt truy cập: `http://localhost:5173`

---

## 3. Các tính năng chính của Demo

1. **Ba nguồn Media tương tác:**
   - **Ảnh tĩnh:** Tải lên tệp ảnh (hoặc dùng nút *Thử nhanh bằng mẫu ảnh có lửa/không lửa*), bấm `Phát hiện lửa` để xem kết quả.
   - **Video:** Tải tệp MP4/WebM, hỗ trợ Play/Pause, tua timeline mượt mà, đổi tốc độ (0.5x – 2.0x), chỉnh âm lượng và toàn màn hình. Có công tắc `Bật/Tắt nhận diện AI`.
   - **Webcam trực tiếp:** Mở camera máy tính, cấp quyền qua `getUserMedia()`, chọn thiết bị camera, lật gương (mirror) và tự động giải phóng phần cứng khi tắt/chuyển nguồn.
2. **Đồng bộ Media và Bounding Box:**
   - Lớp vẽ Canvas đặt tách biệt phía trên thẻ `<video>`/`<img>`. Nút `Ẩn Box` chỉ ẩn lớp vẽ mà không can thiệp vào luồng phát media.
   - Xử lý bù trừ viền đen chuẩn xác theo thuật toán `object-fit: contain` khi co giãn cửa sổ hoặc xem toàn màn hình.
   - Khi người dùng tua video hoặc đổi nguồn, hệ thống tự động tăng `generation_id`, xóa ngay các box cũ và hủy yêu cầu HTTP cũ để không bao giờ xảy ra lỗi box chạy lệch frame.
3. **Đo lường thời gian thực (Telemetry):**
   - Đo thời gian tính toán thực tế của mô hình (`inference_ms`).
   - Đo tốc độ lấy mẫu và xử lý thực tế (`FPS`).
   - Lịch sử các mốc sự kiện phát hiện lửa trên timeline video, cho phép bấm vào sự kiện để nhảy ngay đến giây tương ứng.
4. **Chế độ "Xem thử giao diện" (Mô phỏng):**
   - Khi chưa có checkpoint thật, người dùng có thể bật chế độ xem thử để kiểm tra toàn bộ luồng tương tác và vẽ Bounding Box.
   - Luôn hiển thị nhãn **`MÔ PHỎNG`** rõ ràng, minh bạch, không giả mạo kết quả AI thật.
5. **Tích hợp mô hình thật:**
   - Xem hướng dẫn chi tiết trong file `docs/MODEL_INTEGRATION.md`.

---

## 4. Kiểm thử & Nghiệm thu (Verification)

| Kiểm tra | Lệnh thực hiện | Kết quả |
|---|---|---|
| **TypeScript & Build Frontend** | `npm run build` | Đạt (0 lỗi, hoàn thành trong ~420ms) |
| **Linting Frontend** | `npm run lint` | Đạt (0 lỗi oxlint) |
| **Khởi động Backend** | `python run.py` | Đạt (Cổng 8000 sẵn sàng, CORS chuẩn) |
| **Kiểm tra API Health** | `GET /api/health` | Đạt (`status: "ok"`) |
| **Kiểm tra Model Status** | `GET /api/model/status` | Đạt (Phản hồi trạng thái chính xác) |

