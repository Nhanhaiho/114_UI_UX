# Fire Detection Studio

Ứng dụng web kiểm thử mô hình AI phát hiện **Lửa (`fire`)** và **Khói (`smoke`)** thời gian thực từ **Ảnh**, **Video tải lên** và **Webcam**. Toàn bộ mã nguồn ứng dụng nằm trong thư mục [`fire-detection-demo/`](./fire-detection-demo/).

---

## 1. Yêu cầu môi trường

| Thành phần | Phiên bản tối thiểu | Ghi chú |
|---|---|---|
| **Python** | `>= 3.10` (khuyến nghị 3.11–3.13) | Chạy FastAPI backend & PyTorch/Ultralytics |
| **Node.js** | `>= 22.12.0` (khuyến nghị Node.js 22 LTS) | Theo `package-lock.json` (`vite@^8.3.6` yêu cầu `^20.19.0 \|\| >=22.12.0`; `@supabase/supabase-js` yêu cầu `>=22.0.0`) |
| **npm** | `>= 10.0.0` | Đi kèm Node.js 22 LTS |
| **GPU CUDA** | Tùy chọn | Có GPU NVIDIA + PyTorch CUDA giúp suy luận nhanh hơn; nếu không có vẫn chạy được bằng CPU |

---

## 2. Cài đặt và chạy nhanh

Tất cả lệnh dưới đây chạy từ **thư mục gốc repo** bằng đường dẫn tương đối.

### Bước 1: Chuẩn bị file `.env` và checkpoint mô hình

1. Tạo file `.env` từ file mẫu:

```bash
# Windows PowerShell:
Copy-Item fire-detection-demo/backend/.env.example fire-detection-demo/backend/.env
Copy-Item fire-detection-demo/frontend/.env.example fire-detection-demo/frontend/.env

# macOS / Linux:
# cp fire-detection-demo/backend/.env.example fire-detection-demo/backend/.env
# cp fire-detection-demo/frontend/.env.example fire-detection-demo/frontend/.env
```

2. Đặt tệp checkpoint `.pt` của bạn vào `fire-detection-demo/backend/weights/` (thư mục này không theo dõi `.pt` trên Git), ví dụ `fire-detection-demo/backend/weights/best.pt`, sau đó chỉnh `MODEL_PATH` trong `fire-detection-demo/backend/.env`:

```env
MODEL_PATH=weights/best.pt
MODEL_CODE_DIR=model_code
DEVICE=
IMGSZ=640
CONF_THRESHOLD=0.25
```

> Nếu để trống `DEVICE=`, backend sẽ tự chọn GPU CUDA nếu khả dụng, hoặc tự chuyển sang `cpu`. Nếu chỉ muốn xem giao diện không cần checkpoint, bật công tắc **Xem thử (Mô phỏng)** trên web.

### Bước 2: Chạy Backend (FastAPI — cổng `8000`)

Mở **Terminal 1**:

```bash
cd fire-detection-demo/backend
python -m venv .venv
```

Kích hoạt môi trường ảo và cài thư viện:

```powershell
# Windows PowerShell
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python run.py
```

```bash
# macOS / Linux
source .venv/bin/activate
python -m pip install -r requirements.txt
python run.py
```

*(Nếu dùng GPU NVIDIA, cài bản PyTorch CUDA phù hợp trước hoặc sau khi cài `requirements.txt` theo hướng dẫn tại pytorch.org.)*

Kiểm tra trạng thái model đã nạp qua endpoint:

- `http://localhost:8000/api/model/status` — xác nhận `"is_ready": true`, `model_name`, `model_path`, `device` và `supported_classes`.
- Swagger API Docs: `http://localhost:8000/docs`

### Bước 3: Chạy Frontend (React + Vite — cổng `5173`)

Mở **Terminal 2**:

```bash
cd fire-detection-demo/frontend
npm ci
npm run dev
```

Mở trình duyệt tại **`http://localhost:5173`**:
- **Tab Ảnh**: khởi đầu ở trạng thái trống; kéo thả hoặc bấm nút tải ảnh JPG/PNG/WebP từ máy tính (có thể lấy ảnh kiểm thử trong `fire-detection-demo/sample_images/`).
- **Tab Video**: khởi đầu ở trạng thái chưa chọn tệp; kéo thả hoặc bấm nút chọn tệp video `.mp4` / `.webm` từ máy tính để phát và nhận diện thời gian thực.
- **Tab Camera**: cấp quyền webcam trên trình duyệt, hỗ trợ lật gương và chọn thiết bị camera.

---

## 3. Tùy chọn Email (Đăng nhập OTP & Cảnh báo lửa)

Phần này **không bắt buộc** nếu bạn chỉ kiểm thử nhận diện Ảnh/Video/Webcam ở chế độ khách. Các ngưỡng xác nhận sự kiện lửa khi theo dõi Video/Webcam dùng bộ theo dõi đồng bộ (`trigger >= 0.30`, duy trì `> 0.20` tối thiểu `0.5s`, chỉ gửi tối đa 1 email cho mỗi sự kiện kéo dài).

### 3.1. Tạo bảng trên Supabase (nếu lưu tùy chọn và nhật ký gửi thư)

Mở **Supabase Dashboard -> SQL Editor** và chạy file migration:
- [`fire-detection-demo/backend/supabase/migrations/20261124_email_notifications.sql`](./fire-detection-demo/backend/supabase/migrations/20261124_email_notifications.sql)

### 3.2. Phân biệt chế độ Mô phỏng (Mock) và Gửi thật (Real)

| Chế độ | Điều kiện kích hoạt | Hành vi thực tế | Thông báo hiển thị |
|---|---|---|---|
| **Mock Auth** | Để trống hoặc giữ placeholder ở `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (và backend cho phép `ALLOW_MOCK_AUTH`) | Dùng mã OTP thử nghiệm `123456`, tạo phiên thử nghiệm (ví dụ `@example.com`) | Giao diện hiển thị nhãn Mock Auth |
| **Supabase Auth thật** | Điền đầy đủ `VITE_SUPABASE_*` ở `frontend/.env` và `SUPABASE_*` ở `backend/.env` | Gửi OTP 6 số qua Supabase Auth, FastAPI xác thực JWT & lấy email đã xác minh | Hiển thị email thật đã đăng nhập |
| **SMTP Mock** | Đặt `SMTP_MOCK=true` trong `backend/.env` | Không kết nối SMTP ra ngoài, chỉ ghi log `[SMTP MOCK / TEST MODE]` | **“Đã mô phỏng gửi email”** |
| **Gmail SMTP thật** | Đặt `SMTP_MOCK=false`, `SMTP_ENABLED=true` và điền Gmail + App Password hợp lệ | FastAPI kết nối SMTP thật; nếu thiếu cấu hình hoặc SMTP từ chối sẽ trả lỗi rõ ràng (không tự rơi về mock) | **“Máy chủ email đã chấp nhận thư”** |

### 3.3. Biến môi trường mẫu (Placeholder)

Trong `fire-detection-demo/backend/.env`:

```env
# Supabase thật (lấy tại Project Settings -> API)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_JWT_SECRET=your_supabase_jwt_secret

# Email SMTP thật (Gmail + App Password 16 ký tự)
SMTP_MOCK=false
SMTP_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-16-char-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_FROM_NAME="Fire Detection Studio"
SMTP_USE_TLS=true
TEST_EMAIL_COOLDOWN_SECONDS=60
```

Trong `fire-detection-demo/frontend/.env` *(chỉ dùng `ANON KEY` công khai, không đưa `service_role` vào frontend)*:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 4. Chạy kiểm thử (Tests) và Build

### Backend tests (`pytest`)

`pytest` là dependency phục vụ kiểm thử, cài bổ sung trong môi trường backend:

```bash
cd fire-detection-demo/backend
python -m pip install pytest
python -m pytest tests/test_email_alerts.py -v
```

### Frontend lint, build và unit test bộ theo dõi sự kiện lửa

```bash
cd fire-detection-demo/frontend
npm run lint
npm run build
node scratch/test_fire_alert_tracker.mjs
```

---

## 5. Tài liệu chi tiết trong dự án

- [Hướng dẫn chi tiết Fire Detection Studio](./fire-detection-demo/README.md)
- [Cấu trúc dự án (`PROJECT_STRUCTURE.md`)](./fire-detection-demo/PROJECT_STRUCTURE.md)
- [Đặc tả API (`API_CONTRACT.md`)](./fire-detection-demo/docs/API_CONTRACT.md)
- [Tích hợp mô hình & SRC (`MODEL_INTEGRATION.md`)](./fire-detection-demo/docs/MODEL_INTEGRATION.md)
