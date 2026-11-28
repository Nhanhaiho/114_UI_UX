# 🔥 Fire Detection Studio — AI Fire & Smoke Detection Workbench

> **Dự án Web Demo độc lập kiểm thử mô hình AI nhận diện Lửa & Khói (YOLO26n-P2 + SRC & YOLO26n) thời gian thực từ Ảnh, Video và Webcam.**

---

## 📌 BẢNG THÔNG SỐ PHIÊN BẢN YÊU CẦU (VERSION REQUIREMENTS)

Dành cho bạn/thành viên mới khi clone hoặc copy dự án về máy: hãy kiểm tra máy tính đã cài đúng các công cụ sau trước khi chạy:

| Thành phần | Phiên bản yêu cầu | Phiên bản khuyến nghị | Lệnh kiểm tra trên máy |
|---|---|---|---|
| **Node.js** | `>= 22.12.0` | **Node.js 22 LTS** | `node -v` |
| **npm** | `>= 10.0.0` | **npm 10.x** hoặc **npm 11.x** | `npm -v` |
| **Vite** | **`^8.3.6` (Vite 8)** | Tự động cài qua `npm ci` | `npx vite --version` |
| **React** | **`^19.3.1` (React 19)** | Tự động cài qua `npm ci` | Xem trong `package.json` |
| **Python** | `>= 3.10` (64-bit) | **Python 3.11**, **3.12** hoặc **3.13** | `python --version` |
| **PyTorch** | `>= 2.0.0` (CUDA hoặc CPU) | **`torch >= 2.3` kèm CUDA 12.x** | `python -c "import torch; print(torch.__version__, torch.cuda.is_available())"` |
| **Ultralytics** | `>= 8.0.0` | **Ultralytics 8.4.x** | `python -c "import ultralytics; print(ultralytics.__version__)"` |
| **FastAPI** | `>= 0.110.0` | **FastAPI 0.115+** | `python -c "import fastapi; print(fastapi.__version__)"` |

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT & CHẠY DỰ ÁN TỪNG BƯỚC

Dự án gồm 2 phần độc lập:
1. **Backend** (FastAPI chạy mô hình Python trên cổng `8000`).
2. **Frontend** (React + TypeScript + Vite chạy giao diện web trên cổng `5173`).

---

### PHẦN 1: CÀI ĐẶT & KHỞI CHẠY BACKEND (FASTAPI)

Mở cửa sổ **Terminal 1** (PowerShell hoặc CMD) và thực hiện tuần tự:

#### Bước 1.1: Chuyển vào thư mục backend (từ thư mục gốc repo)
```bash
cd fire-detection-demo/backend
```

#### Bước 1.2: (Khuyến nghị) Tạo và kích hoạt môi trường ảo Python venv
```powershell
# Tạo môi trường ảo tên .venv
python -m venv .venv

# Kích hoạt môi trường ảo trên Windows (PowerShell)
.venv\Scripts\Activate.ps1

# (Nếu dùng Command Prompt CMD):
# .venv\Scripts\activate.bat
```
> [!TIP]
> Nếu PowerShell báo lỗi `Execution_Policies` khi chạy script kích hoạt, hãy mở PowerShell quyền Administrator và gõ:  
> `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` sau đó kích hoạt lại.

#### Bước 1.3: Cài đặt các gói thư viện Python (Requirements)
```powershell
# Nâng cấp pip lên bản mới
python -m pip install --upgrade pip

# Cài đặt toàn bộ thư viện cần thiết từ requirements.txt
python -m pip install -r requirements.txt
```

> [!IMPORTANT]
> **Lưu ý về PyTorch (GPU CUDA vs CPU):**
> - **Nếu máy có GPU NVIDIA (khuyên dùng để suy luận nhanh ~29ms):**
>   ```powershell
>   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
>   ```
> - **Nếu máy không có GPU rời (chạy bằng CPU bình thường):**
>   Lệnh `pip install -r requirements.txt` đã tự động cài đặt PyTorch bản CPU, không cần cài gì thêm.

#### Bước 1.4: Tạo `.env` từ mẫu và cấu hình Model
```bash
# Windows PowerShell:
Copy-Item .env.example .env

# macOS / Linux:
# cp .env.example .env
```
Mở tệp `backend/.env` và trỏ `MODEL_PATH` đến file checkpoint `.pt` đặt trong `backend/weights/` (ví dụ `weights/best.pt`):
```env
MODEL_PATH=weights/best.pt
MODEL_CODE_DIR=model_code
DEVICE=  # để trống sẽ tự động nhận diện CUDA nếu có, hoặc điền 'cpu', 'cuda:0'
IMGSZ=640
CONF_THRESHOLD=0.25
MAX_IMAGE_SIZE_MB=20
```
*(Các biến `SUPABASE_*` và `SMTP_*` trong `.env` là tùy chọn nếu bạn muốn bật đăng nhập OTP và cảnh báo email — xem chi tiết ở `README.md` gốc).*

#### Bước 1.5: Khởi chạy Backend Server
```powershell
python run.py
```

> **Dấu hiệu Backend đã chạy thành công:**
> ```text
> [INFO] fire_detector: Đang nạp checkpoint từ weights\... lên thiết bị cuda:0...
> [INFO] fire_detector: Nạp mô hình thành công! Danh sách lớp: {0: 'fire', 1: 'smoke'}
> [INFO] fire_studio_api: Detector khởi tạo xong. Trạng thái mô hình thật: SẴN SÀNG
> INFO: Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
> ```
- **Kiểm tra API Backend**: Mở trình duyệt vào `http://localhost:8000/api/model/status`
- **Swagger Documentation**: `http://localhost:8000/docs`

---

### PHẦN 2: CÀI ĐẶT & KHỞI CHẠY FRONTEND (REACT + VITE)

Mở cửa sổ **Terminal 2** riêng biệt:

#### Bước 2.1: Kiểm tra phiên bản Node.js và npm
```bash
node -v
npm -v
```
- Đảm bảo `node -v` từ **`v22.12.0`** trở lên (Node.js 22 LTS) để tương thích cả Vite 8 và `@supabase/supabase-js`.
- Đảm bảo `npm -v` từ **`10.0.0`** trở lên.
*(Nếu chưa cài Node.js, tải bản mới nhất tại: https://nodejs.org)*

#### Bước 2.2: Chuyển vào thư mục frontend (từ thư mục gốc repo)
```bash
cd fire-detection-demo/frontend
```

#### Bước 2.3: Tạo `.env` (tùy chọn) và cài đặt dependencies
```bash
# Windows PowerShell:
Copy-Item .env.example .env

npm ci
```
Lệnh này sẽ tự động tải và cài đặt toàn bộ gói theo `package.json` vào thư mục `node_modules`, bao gồm:
- **`vite`**: Phiên bản **`^8.3.6`**
- **`react`** & **`react-dom`**: Phiên bản **`^19.3.1`**
- **`@vitejs/plugin-react`**: Phiên bản **`^6.1.2`**
- **`typescript`**: Phiên bản **`~7.0.2`**
- **`lucide-react`**: Thư viện icon vector

> [!NOTE]
> Bạn **không cần cài Vite global** (`npm install -g vite`). Lệnh `npm install` đã cài đặt Vite cục bộ cho dự án. Bạn có thể kiểm tra Vite version bằng lệnh:  
> `npx vite --version` $\rightarrow$ Kết quả: `vite/8.3.6`

#### Bước 2.4: Khởi chạy Frontend Development Server
```powershell
npm run dev
```

> **Dấu hiệu Frontend đã chạy thành công:**
> ```text
>   VITE v8.3.6  ready in 180 ms
> 
>   ➜  Local:   http://localhost:5173/
>   ➜  Network: use --host to expose
> ```

*(Hoặc nếu muốn chạy bản Production Preview siêu mượt: gõ `npm run build` rồi gõ `npm run preview -- --port 5173`)*.

#### Bước 2.5: Mở Web App trên trình duyệt
Mở trình duyệt (Chrome, Edge, Firefox, Cốc Cốc) truy cập:
👉 **`http://localhost:5173`**

Khi vào trang, nhìn góc trên bên phải thanh Header:
- 🟢 **`Backend: Kết nối`**: Kết nối server thành công.
- 🟢 **`Model: Sẵn sàng (cuda:0)`**: Model AI đã nạp và sẵn sàng nhận diện.

---

## 📁 CẤU TRÚC THƯ MỤC DỰ ÁN

```text
fire-detection-demo/
│
├── README.md                           # [Tệp này] Hướng dẫn cài đặt và chạy chi tiết
├── PROJECT_STRUCTURE.md                 # Tóm tắt kiến trúc kỹ thuật phục vụ báo cáo Đồ án Cuối kỳ
│
├── docs/                               # Tài liệu đặc tả
│   ├── API_CONTRACT.md                 # Hợp đồng dữ liệu API (/health, /model/status, /infer/image)
│   └── MODEL_INTEGRATION.md            # Tài liệu kỹ thuật tích hợp checkpoint và module SRC
│
├── sample_images/                      # Ảnh mẫu có sẵn để bấm thử nghiệm tức thì
│   ├── sample_fire_smoke.jpg           # Ảnh mẫu có cả Lửa và Khói
│   └── sample_neutral.jpg              # Ảnh an toàn không có lửa/khói (test false positive)
│
├── backend/                            # MÁY CHỦ FASTAPI (PYTHON)
│   ├── run.py                          # Script khởi chạy server Uvicorn (Port 8000)
│   ├── requirements.txt                # Danh sách thư viện Python cần cài
│   ├── .env                            # File cấu hình MODEL_PATH, DEVICE, IMGSZ
│   ├── app/
│   │   ├── main.py                     # Lifespan startup, CORS, REST endpoints
│   │   ├── detector.py                 # YoloSRCDetector (model thật) & MockDetector
│   │   ├── config.py                   # Đọc biến môi trường bằng Pydantic Settings
│   │   └── schemas.py                  # Pydantic schemas (Request / Response)
│   ├── model_code/                     # Mã module Spatial-Relational Co-Attention
│   │   ├── src_coattention.py          # Đăng ký tự động vào Ultralytics
│   │   └── src/modules/attention/      # Class SpatialRelationalCoAttention gốc
│   │       └── src.py
│   └── weights/                        # Thư mục chứa các checkpoint trọng số đã train
│       ├── src_ratio8.pt               # Model YOLO26n-P2 + SRC (sr_ratio=8, 16.1 MB)
│       └── yolo26ncombineddataset.pt   # Model YOLO26n Combined (5.38 MB)
│
└── frontend/                           # GIAO DIỆN REACT + VITE (TYPESCRIPT)
    ├── package.json                    # Khai báo dependency: React 19, Vite 8, Lucide icon
    ├── vite.config.ts                  # File cấu hình Vite
    ├── index.html                      # HTML root template
    └── src/
        ├── App.tsx                     # Component gốc điều phối trạng thái (Orchestrator)
        ├── index.css                   # Giao diện studio, màu sắc WCAG AA, responsive
        ├── components/
        │   ├── Header.tsx              # Thanh tiêu đề, trạng thái kết nối Backend & Model
        │   ├── SourceTabs.tsx          # 3 Tab chọn nguồn: Ảnh, Video, Camera
        │   ├── MediaViewer.tsx         # Khung hiển thị media letterbox contain & nút tải tệp
        │   ├── BoundingBoxCanvas.tsx   # Canvas vẽ box Lửa (Đỏ) và Khói (Cyan)
        │   ├── Toolbar.tsx             # Nút điều khiển: Phân tích lại, Ngưỡng tin cậy, Tua, Fullscreen
        │   ├── ResultPanel.tsx         # Bảng kết quả đo lường: Latency ms, FPS, danh sách box
        │   └── AdvancedSettingsModal.tsx # Xem chi tiết thông số model & email
        ├── hooks/                      # useBackendStatus, useWebcam, useAuth
        ├── services/api.ts             # Gọi API HTTP Multipart sang backend
        ├── types/index.ts              # Interface TypeScript
        └── utils/coordinateUtils.ts    # Thuật toán tính bù trừ viền đen contain
```

---

## 🎯 CÁC CHỨC NĂNG CHÍNH CỦA HỆ THỐNG

1. **Tab Ảnh tĩnh**:
   - Mở ở trạng thái chưa chọn ảnh; kéo thả hoặc bấm nút tải ảnh JPG/PNG/WebP từ máy tính.
   - Tự động phân tích ngay khi chọn ảnh và cho phép bấm **`Phân tích lại`** sau khi đổi ngưỡng hoặc model $\rightarrow$ xem Bounding Box phân biệt rõ **Lửa (viền đỏ)** và **Khói (viền cyan)**.
2. **Tab Video tệp tin**:
   - Mở ở trạng thái chưa chọn tệp; kéo thả hoặc chọn tệp MP4 hoặc WebM từ máy tính (hỗ trợ tới 300 MB).
   - Play, Pause, tua thanh trượt mượt mà, đổi tốc độ xem (0.5x, 1x, 1.25x, 1.5x, 2x).
   - Công tắc **`Nhận diện: BẬT/TẮT`**: tự động lấy mẫu frame thời gian thực.
   - Tự động ngắt request cũ khi tua video (`generation_id`) để box không bao giờ bị trễ frame.
3. **Tab Camera (Webcam)**:
   - Cấp quyền mở webcam máy tính, có hỗ trợ chọn camera nếu máy có nhiều thiết bị.
   - Chế độ **Lật gương (Mirror)** tự động đảo trục tọa độ box.
   - Tự động giải phóng phần cứng camera khi bấm tắt hoặc chuyển tab.
4. **Bảng kết quả & Đo lường**:
   - Hiển thị thời gian suy luận thực tế của server (`inference_ms`, ví dụ: ~29ms trên GPU RTX 4060).
   - Tốc độ xử lý khung hình (`FPS`).
   - Danh sách box có tính năng rê chuột vào dòng để làm nổi bật (highlight) box trên ảnh.
5. **Chế độ "Xem thử" (Mô phỏng)**:
   - Cho phép người dùng bật công tắc `Xem thử` để kiểm tra giao diện khi không có backend/checkpoint, luôn có nhãn `MÔ PHỎNG` minh bạch.

---

## 🔄 CÁCH CHUYỂN ĐỔI NHANH GIỮA CÁC MODEL CHECKPOINT

Đặt các tệp trọng số `.pt` của bạn vào thư mục `backend/weights/`, sau đó chọn model:

1. Mở file `backend/.env` (sao chép từ `backend/.env.example`).
2. Đổi dòng `MODEL_PATH` trỏ đến tệp trong `weights/` (ví dụ `MODEL_PATH=weights/best.pt`), hoặc đổi trực tiếp checkpoint ngay trên giao diện Cài đặt qua API `/api/model/switch`.
3. Kiểm tra model đang nạp tại `http://localhost:8000/api/model/status`.

---

## 🛠️ XỬ LÝ SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING)

### 1. Lỗi `npm ci` / `npm install` hoặc lỗi phiên bản Node.js
- **Nguyên nhân**: Node.js trên máy bạn thấp hơn yêu cầu của `package-lock.json` (`>= 22.12.0`).
- **Khắc phục**: Truy cập https://nodejs.org và tải bản **Node.js 22 LTS** trở lên, sau đó mở lại Terminal.

### 2. Lỗi cổng 8000 hoặc 5173 bị chiếm (Port already in use)
- **Khắc phục**: Mở PowerShell gõ lệnh giải phóng cổng:
  ```powershell
  # Tắt tiến trình chiếm cổng 8000
  Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process -Force

  # Tắt tiến trình chiếm cổng 5173
  Get-Process -Id (Get-NetTCPConnection -LocalPort 5173).OwningProcess | Stop-Process -Force
  ```

### 3. Lỗi PowerShell không cho kích hoạt venv (`Script Execution Policy`)
- **Khắc phục**: Mở PowerShell gõ:
  ```powershell
  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

### 4. Lỗi Webcam không mở được
- **Khắc phục**:
  1. Kiểm tra trên thanh địa chỉ trình duyệt xem đã bấm **Cho phép (Allow)** quyền Camera chưa.
  2. Đảm bảo ứng dụng khác (Zoom, Teams, Camera Windows) không chiếm camera.
  3. Webcam trình duyệt yêu cầu chạy trên `localhost` hoặc `https://`.

---

## 📚 TÀI LIỆU BỔ TRỢ

- 📄 [Tóm tắt cấu trúc phục vụ báo cáo Đồ án Cuối kỳ (`PROJECT_STRUCTURE.md`)](./PROJECT_STRUCTURE.md)
- 📄 [Tài liệu hướng dẫn nạp checkpoint & module SRC (`MODEL_INTEGRATION.md`)](./docs/MODEL_INTEGRATION.md)
- 📄 [Đặc tả hợp đồng API Contract (`API_CONTRACT.md`)](./docs/API_CONTRACT.md)
