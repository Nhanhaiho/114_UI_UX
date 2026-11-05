# 🔥 Fire Detection Studio — AI Fire & Smoke Detection Workbench

Hệ thống Web Demo thử nghiệm mô hình thị giác máy tính **YOLO26n-P2** kết hợp module chú ý không gian **Spatial-Relational Co-Attention (SRC)** theo thời gian thực.

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

