# 🔥 Fire Detection Studio — AI Fire & Smoke Detection Workbench

<<<<<<< HEAD
> **Dự án Web Demo độc lập kiểm thử mô hình AI nhận diện Lửa & Khói thời gian thực từ Ảnh, Video và Webcam.**

---

## 📌 BẢNG THÔNG SỐ PHIÊN BẢN YÊU CẦU (VERSION REQUIREMENTS)



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

## ⚡ HƯỚNG DẪN KHỞI CHẠY NHANH (2 TERMINAL)

### Bước 1: Khởi động Backend (FastAPI - Cổng 8000)
Mở cửa sổ Terminal 1:
```powershell
cd C:\fire_smoke_web\fire-detection-demo\backend

# Cài đặt thư viện Python (lần đầu)
python -m pip install -r requirements.txt

# Khởi chạy server
python run.py
```
*Truy cập kiểm tra: `http://localhost:8000/api/model/status` và tài liệu API tại `http://localhost:8000/docs`.*

---

### Bước 2: Khởi động Frontend (React + Vite - Cổng 5173)
Mở cửa sổ Terminal 2:
```powershell
cd C:\fire_smoke_web\fire-detection-demo\frontend

# Cài đặt npm dependencies (tự động cài Vite 8, React 19)
npm install

# Khởi chạy giao diện
npm run dev
```


##  LIÊN KẾT TÀI LIỆU CHI TIẾT
-  **[README.md chi tiết toàn bộ dự án](./fire-detection-demo/README.md)**
-  **[PROJECT_STRUCTURE.md tóm tắt kiến trúc phục vụ báo cáo Đồ án Cuối kỳ](./fire-detection-demo/PROJECT_STRUCTURE.md)**
-  **[MODEL_INTEGRATION.md tài liệu tích hợp checkpoint mô hình AI](./fire-detection-demo/docs/MODEL_INTEGRATION.md)**
-  **[API_CONTRACT.md quy định dữ liệu API](./fire-detection-demo/docs/API_CONTRACT.md)**
=======
Hệ thống Web Demo thử nghiệm mô hình thị giác máy tính theo thời gian thực.

## 📂 Thư mục Dự án Chính

Toàn bộ mã nguồn, dữ liệu trọng số và tài liệu của dự án nằm tại thư mục:
👉 **[`fire-detection-demo/`](./fire-detection-demo/)**

- 📄 **[README.md chi tiết hướng dẫn cài đặt & vận hành](./fire-detection-demo/README.md)**
- 📄 **[PROJECT_STRUCTURE.md tóm tắt cấu trúc phục vụ báo cáo Đồ án Cuối kỳ](./fire-detection-demo/PROJECT_STRUCTURE.md)**
- 📄 **[MODEL_INTEGRATION.md tài liệu tích hợp checkpoint mô hình AI](./fire-detection-demo/docs/MODEL_INTEGRATION.md)**

---

## ⚡ Lệnh Khởi Chạy Nhanh

### 1. Khởi động Backend (FastAPI - Cổng 8000)
```powershell
cd \fire_smoke_web\fire-detection-demo\backend
python run.py
```

### 2. Khởi động Frontend (React + Vite - Cổng 5173)
```powershell
cd \fire_smoke_web\fire-detection-demo\frontend
npm run preview -- --port 5173
```

Mở trình duyệt truy cập: **`http://localhost:5173`**

>>>>>>> 7e1ad45e64f34f7db986b2ad0bf549bf72b57b9a
