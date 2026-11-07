# 🔥 Fire Detection Studio — AI Fire & Smoke Detection Workbench

> **Dự án Web Demo độc lập kiểm thử mô hình AI nhận diện Lửa & Khói (YOLO26n-P2 + SRC & YOLO26n) thời gian thực từ Ảnh, Video và Webcam.**

---

## 📌 BẢNG THÔNG SỐ PHIÊN BẢN YÊU CẦU (VERSION REQUIREMENTS)

Dành cho bạn/thành viên mới khi clone hoặc copy dự án về máy: hãy kiểm tra máy tính đã cài đúng các công cụ sau trước khi chạy:

| Thành phần | Phiên bản yêu cầu | Phiên bản khuyến nghị | Lệnh kiểm tra trên máy |
|---|---|---|---|
| **Node.js** | `>= 18.18.0` hoặc `>= 20.0.0` | **Node.js 20 LTS** (hoặc v22 / v24) | `node -v` |
| **npm** | `>= 9.0.0` | **npm 10.x** hoặc **npm 11.x** | `npm -v` |
| **Vite** | **`^8.3.6` (Vite 8)** | Tự động cài qua `npm install` | `npx vite --version` |
| **React** | **`^19.3.1` (React 19)** | Tự động cài qua `npm install` | Xem trong `package.json` |
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

#### Bước 1.1: Chuyển vào thư mục backend
```powershell
cd C:\fire_smoke_web\fire-detection-demo\backend
```
*(Nếu bạn để project ở ổ đĩa khác, thay bằng đường dẫn thư mục `fire-detection-demo\backend` trên máy bạn).*

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

#### Bước 1.4: Cấu hình Model trong file `.env`
Trong thư mục `backend/`, mở tệp `.env` để chọn model muốn chạy:
```env
# Lựa chọn 1: Model YOLO26n cơ bản (yolo26ncombineddataset.pt)
MODEL_PATH=weights/yolo26ncombineddataset.pt

# Lựa chọn 2: Model YOLO26n-P2 kèm module SRC (src_ratio8.pt)
# MODEL_PATH=weights/src_ratio8.pt

MODEL_CODE_DIR=model_code
DEVICE=  # để trống sẽ tự động nhận diện CUDA nếu có, hoặc điền 'cpu', 'cuda:0'
IMGSZ=640
CONF_THRESHOLD=0.25
MAX_IMAGE_SIZE_MB=20
```

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
```powershell
node -v
npm -v
```
- Đảm bảo `node -v` ra kết quả từ **`v18.18.0`** hoặc **`v20.0.0`** trở lên (tốt nhất là Node 20 LTS, 22 hoặc 24).
- Đảm bảo `npm -v` ra kết quả từ **`9.0.0`** trở lên.
*(Nếu chưa cài Node.js, tải bản mới nhất tại: https://nodejs.org)*

#### Bước 2.2: Chuyển vào thư mục frontend
```powershell
cd C:\fire_smoke_web\fire-detection-demo\frontend
```

#### Bước 2.3: Cài đặt dependencies (NPM Install)
```powershell
npm install
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
    ├── public/
    │   └── samples/                    # Ảnh mẫu tĩnh nạp trực tiếp vào giao diện
    └── src/
        ├── App.tsx                     # Component gốc điều phối trạng thái (Orchestrator)
        ├── index.css                   # Dark theme studio, màu sắc WCAG AA, responsive
        ├── components/
        │   ├── Header.tsx              # Thanh tiêu đề, trạng thái kết nối Backend & Model
        │   ├── SourceTabs.tsx          # 3 Tab chọn nguồn: Ảnh, Video, Camera
        │   ├── MediaViewer.tsx         # Khung hiển thị media letterbox contain
        │   ├── BoundingBoxCanvas.tsx   # Canvas vẽ box Lửa (Đỏ) và Khói (Cyan)
        │   ├── Toolbar.tsx             # Nút điều khiển: Phát hiện, Ngưỡng tin cậy, Tua, Fullscreen
        │   ├── ResultPanel.tsx         # Bảng kết quả đo lường: Latency ms, FPS, danh sách box
        │   ├── EmptyUploadArea.tsx     # Khung kéo thả tệp và 2 nút thử nhanh ảnh mẫu
        │   └── AdvancedSettingsModal.tsx # Xem chi tiết thông số model
        ├── hooks/                      # useBackendStatus, useWebcam (quản lý camera an toàn)
        ├── services/api.ts             # Gọi API HTTP Multipart sang backend
        ├── types/index.ts              # Interface TypeScript
        └── utils/coordinateUtils.ts    # Thuật toán tính bù trừ viền đen contain
```

---

## 🎯 CÁC CHỨC NĂNG CHÍNH CỦA HỆ THỐNG

1. **Tab Ảnh tĩnh**:
   - Kéo thả hoặc tải ảnh JPG/PNG/WebP.
   - Bấm nút **`Ảnh mẫu có lửa`** hoặc **`Ảnh không có lửa`** để xem ngay kết quả mà không cần tải ảnh ngoài.
   - Bấm **`Phát hiện lửa`** $\rightarrow$ xem Bounding Box phân biệt rõ **Lửa (viền đỏ)** và **Khói (viền cyan)**.
2. **Tab Video tệp tin**:
   - Tải tệp MP4 hoặc WebM (hỗ trợ tới 300 MB).
   - Play, Pause, tua thanh trượt mượt mà, đổi tốc độ xem (0.5x, 1x, 1.5x, 2x).
   - Công tắc **`Bật nhận diện AI`**: tự động lấy mẫu frame thời gian thực (3–5 FPS).
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

Hệ thống đã tích hợp sẵn 2 model huấn luyện thực tế trong thư mục `backend/weights/`:
1. **`src_ratio8.pt`**: Model **YOLO26n-P2 + SRC** (31 layers, có module Spatial-Relational Co-Attention).
2. **`yolo26ncombineddataset.pt`**: Model **YOLO26n Combined** (24 layers cơ bản).

Để đổi model:
1. Mở file [`backend/.env`](file:///c:/fire_smoke_web/fire-detection-demo/backend/.env).
2. Đổi dòng `MODEL_PATH`:
   ```env
   # Muốn dùng model YOLO26n Combined:
   MODEL_PATH=weights/yolo26ncombineddataset.pt

   # Hoặc muốn đổi sang model YOLO26n-P2 + SRC:
   # MODEL_PATH=weights/src_ratio8.pt
   ```
3. Khởi động lại Backend (`Ctrl + C` tại Terminal 1 rồi gõ `python run.py`). Giao diện web sẽ tự động cập nhật tên model tương ứng.

---

## 🛠️ XỬ LÝ SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING)

### 1. Lỗi `npm install` hoặc lỗi phiên bản Node.js
- **Nguyên nhân**: Node.js trên máy bạn quá cũ (dưới v18).
- **Khắc phục**: Truy cập https://nodejs.org và tải bản **Node.js 20 LTS** hoặc mới hơn, sau đó cài đặt và mở lại Terminal.

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

- 📄 [Tóm tắt cấu trúc phục vụ báo cáo Đồ án Cuối kỳ (PROJECT_STRUCTURE.md)](file:///c:/fire_smoke_web/fire-detection-demo/PROJECT_STRUCTURE.md)
- 📄 [Tài liệu hướng dẫn nạp checkpoint & module SRC (MODEL_INTEGRATION.md)](file:///c:/fire_smoke_web/fire-detection-demo/docs/MODEL_INTEGRATION.md)
- 📄 [Đặc tả hợp đồng API Contract (API_CONTRACT.md)](file:///c:/fire_smoke_web/fire-detection-demo/docs/API_CONTRACT.md)
