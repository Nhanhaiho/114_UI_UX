# Fire Detection Studio

Ứng dụng web kiểm thử mô hình AI phát hiện **Lửa (`fire`)** và **Khói (`smoke`)** thời gian thực từ **Ảnh**, **Video tải lên** và **Webcam**. Toàn bộ mã nguồn ứng dụng nằm trong thư mục [`fire-detection-demo/`](./fire-detection-demo/).

---

## 1. Chạy và kiểm thử bằng Docker (Windows / PowerShell)

Hướng dẫn dành cho thành viên trong nhóm mới clone repo và chạy trên Windows bằng **PowerShell**. Toàn bộ cấu hình Docker nằm trong `fire-detection-demo/` ([`compose.yaml`](./fire-detection-demo/compose.yaml) mặc định CPU và [`compose.gpu.yaml`](./fire-detection-demo/compose.gpu.yaml) bật NVIDIA GPU).

### 1.1. Chuẩn bị

1. **Cài Git và bật Docker Desktop** (đợi Docker Desktop ở trạng thái *Engine running*), kiểm tra trong PowerShell:

```powershell
git --version
docker version
```

2. **Clone đúng nhánh `chore/docker`** *(sau khi nhánh đã được push lên GitHub)*:

```powershell
git clone -b chore/docker https://github.com/Nhanhaiho/114_UI_UX.git
cd 114_UI_UX
```

Nếu bạn đã clone repo từ trước, chuyển sang nhánh mới nhất bằng:

```powershell
git fetch origin
git checkout chore/docker
git pull origin chore/docker
```

3. **Tạo các file `.env` từ file mẫu** *(khi chưa có `.env`)*:

```powershell
Copy-Item fire-detection-demo/backend/.env.example fire-detection-demo/backend/.env
Copy-Item fire-detection-demo/frontend/.env.example fire-detection-demo/frontend/.env
```

- **Cấu hình tối thiểu để test nhận diện bằng CPU**:
  - Trong `fire-detection-demo/backend/.env`, kiểm tra `MODEL_PATH=weights/plain_mixedneg_s42_last.pt` và `MODEL_CODE_DIR=model_code`. Có thể giữ nguyên `DEVICE=` vì `compose.yaml` tự ép `DEVICE=cpu`; các biến `SUPABASE_*` và `SMTP_*` có sẵn giá trị placeholder mặc định vẫn cho phép chạy nhận diện bình thường ở chế độ khách *(nếu chỉ test thông báo email mô phỏng nội bộ, đặt `SMTP_MOCK=true`)*.
  - Trong `fire-detection-demo/frontend/.env`, giữ nguyên file để `--env-file frontend/.env` hoạt động; nếu chưa điền `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` thật, giao diện vẫn dùng được đầy đủ Ảnh / Video / Webcam (và Mock Auth khi cần thử đăng nhập).
  - Các tệp `.env` thật, trọng số `.pt`, `node_modules/` và cache đều được `.dockerignore` loại khỏi build context; khi chạy Compose, `backend/.env` chỉ được nạp cho backend lúc runtime còn `--env-file frontend/.env` chỉ truyền cấu hình công khai (`VITE_SUPABASE_*`) vào bản build frontend.

4. **Lấy và đặt checkpoint `plain_mixedneg_s42_last.pt`**:
   - Nhận tệp `plain_mixedneg_s42_last.pt` từ người phụ trách qua kênh nhóm *(checkpoint `.pt` không theo dõi trên Git; nếu chưa có link tải chính thức, liên hệ trực tiếp người phụ trách nhóm)*.
   - Chép tệp vào `fire-detection-demo/backend/weights/plain_mixedneg_s42_last.pt`.
   - Kiểm tra dòng cấu hình trong `fire-detection-demo/backend/.env`:

```env
MODEL_PATH=weights/plain_mixedneg_s42_last.pt
```

*(Thư mục `backend/weights/` được mount chỉ đọc `:ro` vào container; mã nguồn `backend/model_code/` đi kèm trong image để hỗ trợ thêm các checkpoint SRC.)*

---

### 1.2. Chạy bản CPU (mặc định)

Chạy từ **thư mục gốc vừa clone (`114_UI_UX`)**:

```powershell
cd fire-detection-demo
docker compose --env-file frontend/.env up -d --build
```

Kiểm tra container và trạng thái model đang nạp:

```powershell
docker compose ps
Invoke-RestMethod http://localhost:8080/api/model/status
```

Kết quả mong đợi:
- `docker compose ps`: container `backend` ở trạng thái **healthy** (cổng `8000`), `frontend` đang chạy (cổng `8080`).
- `Invoke-RestMethod http://localhost:8080/api/model/status`: trả về `is_ready: True`, `model_name: YOLO26n-Plain (plain_mixedneg_s42_last.pt)`, `model_path: weights/plain_mixedneg_s42_last.pt`, `device: cpu`.

Mở trình duyệt tại **`http://localhost:8080`**:
- Cổng `8080` là nơi Nginx phục vụ giao diện React; mọi yêu cầu `/api/...` từ trình duyệt đi cùng origin tới `http://localhost:8080/api/...` và được Nginx chuyển tiếp tới FastAPI ở `backend:8000` bên trong Docker.

#### Tùy chọn: Chạy bằng NVIDIA GPU (`compose.gpu.yaml`)

Nếu máy Windows có GPU NVIDIA, đã cài driver NVIDIA mới và bật hỗ trợ GPU trong Docker Desktop, dùng thêm file override `compose.gpu.yaml` *(build backend với PyTorch CUDA 12.6 `cu126` và đặt `DEVICE=cuda:0`)*:

```powershell
docker compose --env-file frontend/.env -f compose.yaml -f compose.gpu.yaml up -d --build
Invoke-RestMethod http://localhost:8080/api/model/status
```

Lúc này trường `device` trả về `cuda:0`. *(Lần build GPU đầu tiên tải các gói CUDA nên mất nhiều thời gian hơn bản CPU.)*

---

### 1.3. Checklist kiểm thử

- [ ] **Ảnh**: Tải lên hoặc kéo thả ảnh có lửa/khói *(có thể thử bằng ảnh trong `fire-detection-demo/sample_images/` hoặc ảnh của nhóm)* và kiểm tra bounding box hiển thị đúng vùng **Lửa** / **Khói**.
- [ ] **Video**: Mở tab **Video** — xác nhận khung ban đầu trống (không có video mẫu sẵn). Tải lên clip thử (`.mp4` / `.webm`) của nhóm rồi bật nhận diện để kiểm tra phát video và vẽ bounding box.
- [ ] **Webcam**: Mở tab **Webcam**, bấm **Mở Camera**, cấp quyền camera trên trình duyệt và kiểm tra luồng camera thật cùng FPS / độ trễ suy luận.
- [ ] **Email (mục tùy chọn cho thành viên được cấp quyền)**:
  - *Email mô phỏng*: khi đặt `SMTP_MOCK=true` trong `backend/.env`, backend không gửi thư thật mà chỉ ghi `[SMTP MOCK / TEST MODE]` và UI báo **“Đã mô phỏng gửi email”**. *(Nếu chưa cấu hình Supabase thật ở `frontend/.env` và `backend/.env`, đăng nhập dùng Mock Auth mã `123456`.)*
  - *Gửi email thử thật*: yêu cầu cấu hình Supabase thật và Gmail SMTP thật (`SMTP_MOCK=false`, `SMTP_ENABLED=true`, App Password 16 ký tự), đăng nhập OTP bằng tài khoản thật và bấm **Gửi email thử** trong Cài đặt — UI báo **“Máy chủ email đã chấp nhận thư”** khi SMTP xác nhận.
  - *Email cảnh báo từ sự kiện phát hiện*: chỉ chạy ở **Video** và **Webcam** với model thật (không gửi với Ảnh tĩnh hay chế độ Mô phỏng) khi người dùng đã đăng nhập, bật công tắc **“Nhận cảnh báo lửa qua email”**, và vùng lửa đạt ngưỡng xác nhận (`confidence >= 0.30`, duy trì `> 0.20` tối thiểu `0.5 giây`; mỗi sự kiện kéo dài chỉ gửi tối đa 1 thư). Không điền hay gửi thông tin xác thực thật lên repository hoặc kênh công khai.

---

### 1.4. Xử lý lỗi và báo kết quả

- **Xem log backend**:

```powershell
# Bản CPU
docker compose logs -f backend

# Bản GPU
docker compose -f compose.yaml -f compose.gpu.yaml logs -f backend
```

- **Lỗi thiếu checkpoint**: `Invoke-RestMethod http://localhost:8080/api/model/status` trả `is_ready: False` kèm `Không tìm thấy file checkpoint tại 'weights/...'`. Kiểm tra lại file `.pt` đã nằm đúng trong `fire-detection-demo/backend/weights/` và biến `MODEL_PATH` trong `fire-detection-demo/backend/.env`.
- **Lỗi xung đột cổng (`8080` hoặc `8000`)**: nếu báo cổng đang được sử dụng, kiểm tra tiến trình chiếm cổng bằng `Get-NetTCPConnection -LocalPort 8000,8080` (ví dụ tắt backend/frontend đang chạy ngoài Docker) rồi chạy lại Compose.
- **Dừng container khi kiểm thử xong**:

```powershell
# Dừng bản CPU
docker compose down

# Dừng bản GPU
docker compose -f compose.yaml -f compose.gpu.yaml down
```

- **Mẫu báo cáo kết quả gửi nhóm**: *(Luôn **che/xóa toàn bộ mật khẩu, App Password, JWT secret, service_role key** trước khi gửi log hoặc báo cáo.)*

```text
- Hệ điều hành: Windows ... (PowerShell)
- Chế độ chạy: CPU / NVIDIA GPU (...)
- Checkpoint (MODEL_PATH): weights/plain_mixedneg_s42_last.pt
- /api/model/status: is_ready=..., device=...
- Kết quả Ảnh: Đạt / Lỗi (...)
- Kết quả Video: Đạt / Lỗi (...)
- Kết quả Webcam: Đạt / Lỗi (...)
- Lỗi gặp phải & log (đã che thông tin nhạy cảm): Không / ...
```

---

## 2. Yêu cầu môi trường (khi chạy trực tiếp không dùng Docker)

| Thành phần | Phiên bản tối thiểu | Ghi chú |
|---|---|---|
| **Python** | `>= 3.10` (khuyến nghị 3.11–3.13) | Chạy FastAPI backend & PyTorch/Ultralytics |
| **Node.js** | `>= 22.12.0` (khuyến nghị Node.js 22 LTS) | Theo `package-lock.json` (`vite@^8.3.6` yêu cầu `^20.19.0 \|\| >=22.12.0`; `@supabase/supabase-js` yêu cầu `>=22.0.0`) |
| **npm** | `>= 10.0.0` | Đi kèm Node.js 22 LTS |
| **GPU CUDA** | Tùy chọn | Có GPU NVIDIA + PyTorch CUDA giúp suy luận nhanh hơn; nếu không có vẫn chạy được bằng CPU |

---

## 3. Cài đặt và chạy trực tiếp không dùng Docker (2 Terminal)

Tất cả lệnh dưới đây chạy từ **thư mục gốc repo** bằng đường dẫn tương đối.

### Bước 1: Chuẩn bị file `.env` và checkpoint mô hình

1. Tạo file `.env` từ file mẫu:

```powershell
# Windows PowerShell:
Copy-Item fire-detection-demo/backend/.env.example fire-detection-demo/backend/.env
Copy-Item fire-detection-demo/frontend/.env.example fire-detection-demo/frontend/.env

# macOS / Linux:
# cp fire-detection-demo/backend/.env.example fire-detection-demo/backend/.env
# cp fire-detection-demo/frontend/.env.example fire-detection-demo/frontend/.env
```

2. Đặt tệp checkpoint `.pt` vào `fire-detection-demo/backend/weights/` (thư mục này không theo dõi `.pt` trên Git), ví dụ `fire-detection-demo/backend/weights/plain_mixedneg_s42_last.pt`, sau đó chỉnh `MODEL_PATH` trong `fire-detection-demo/backend/.env`:

```env
MODEL_PATH=weights/plain_mixedneg_s42_last.pt
MODEL_CODE_DIR=model_code
DEVICE=
IMGSZ=640
CONF_THRESHOLD=0.25
```

> Nếu để trống `DEVICE=`, backend sẽ tự chọn GPU CUDA nếu khả dụng, hoặc tự chuyển sang `cpu`. Nếu chỉ muốn xem giao diện không cần checkpoint, bật công tắc **Xem thử (Mô phỏng)** trên web.

### Bước 2: Chạy Backend (FastAPI — cổng `8000`)

Mở **Terminal 1**:

```powershell
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

```powershell
cd fire-detection-demo/frontend
npm ci
npm run dev
```

Mở trình duyệt tại **`http://localhost:5173`**:
- **Tab Ảnh**: khởi đầu ở trạng thái trống; kéo thả hoặc bấm nút tải ảnh JPG/PNG/WebP từ máy tính (có thể lấy ảnh kiểm thử trong `fire-detection-demo/sample_images/`).
- **Tab Video**: khởi đầu ở trạng thái chưa chọn tệp; kéo thả hoặc bấm nút chọn tệp video `.mp4` / `.webm` từ máy tính để phát và nhận diện thời gian thực.
- **Tab Camera**: cấp quyền webcam trên trình duyệt, hỗ trợ lật gương và chọn thiết bị camera.

---

## 4. Tùy chọn Email (Đăng nhập OTP & Cảnh báo lửa)

Phần này **không bắt buộc** nếu bạn chỉ kiểm thử nhận diện Ảnh/Video/Webcam ở chế độ khách. Các ngưỡng xác nhận sự kiện lửa khi theo dõi Video/Webcam dùng bộ theo dõi đồng bộ (`trigger >= 0.30`, duy trì `> 0.20` tối thiểu `0.5s`, chỉ gửi tối đa 1 email cho mỗi sự kiện kéo dài).

### 4.1. Tạo bảng trên Supabase (nếu lưu tùy chọn và nhật ký gửi thư)

Mở **Supabase Dashboard -> SQL Editor** và chạy file migration:
- [`fire-detection-demo/backend/supabase/migrations/20261124_email_notifications.sql`](./fire-detection-demo/backend/supabase/migrations/20261124_email_notifications.sql)

### 4.2. Phân biệt chế độ Mô phỏng (Mock) và Gửi thật (Real)

| Chế độ | Điều kiện kích hoạt | Hành vi thực tế | Thông báo hiển thị |
|---|---|---|---|
| **Mock Auth** | Để trống hoặc giữ placeholder ở `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (và backend cho phép `ALLOW_MOCK_AUTH`) | Dùng mã OTP thử nghiệm `123456`, tạo phiên thử nghiệm (ví dụ `@example.com`) | Giao diện hiển thị nhãn Mock Auth |
| **Supabase Auth thật** | Điền đầy đủ `VITE_SUPABASE_*` ở `frontend/.env` và `SUPABASE_*` ở `backend/.env` | Gửi OTP 6 số qua Supabase Auth, FastAPI xác thực JWT & lấy email đã xác minh | Hiển thị email thật đã đăng nhập |
| **SMTP Mock** | Đặt `SMTP_MOCK=true` trong `backend/.env` | Không kết nối SMTP ra ngoài, chỉ ghi log `[SMTP MOCK / TEST MODE]` | **“Đã mô phỏng gửi email”** |
| **Gmail SMTP thật** | Đặt `SMTP_MOCK=false`, `SMTP_ENABLED=true` và điền Gmail + App Password hợp lệ | FastAPI kết nối SMTP thật; nếu thiếu cấu hình hoặc SMTP từ chối sẽ trả lỗi rõ ràng (không tự rơi về mock) | **“Máy chủ email đã chấp nhận thư”** |

### 4.3. Biến môi trường mẫu (Placeholder)

Trong `fire-detection-demo/backend/.env`:

```env
# Supabase thật (lấy tại Project Settings -> API)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...your_anon_key...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...your_service_role_secret...
SUPABASE_JWT_SECRET=your-supabase-jwt-secret

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
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...your_anon_key...
```

---

## 5. Chạy kiểm thử (Tests) và Build

### Backend tests (`pytest`)

`pytest` là dependency phục vụ kiểm thử, cài bổ sung trong môi trường backend:

```powershell
cd fire-detection-demo/backend
python -m pip install pytest
python -m pytest tests/test_email_alerts.py -v
```

### Frontend lint, build và unit test bộ theo dõi sự kiện lửa

```powershell
cd fire-detection-demo/frontend
npm run lint
npm run build
node scratch/test_fire_alert_tracker.mjs
```

---

## 6. Tài liệu chi tiết trong dự án

- [Hướng dẫn chi tiết Fire Detection Studio](./fire-detection-demo/README.md)
- [Cấu trúc dự án (`PROJECT_STRUCTURE.md`)](./fire-detection-demo/PROJECT_STRUCTURE.md)
- [Đặc tả API (`API_CONTRACT.md`)](./fire-detection-demo/docs/API_CONTRACT.md)
- [Tích hợp mô hình & SRC (`MODEL_INTEGRATION.md`)](./fire-detection-demo/docs/MODEL_INTEGRATION.md)
