import uvicorn
import os
import sys

if __name__ == "__main__":
    # Đảm bảo thư mục hiện tại nằm trong sys.path
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
        
    print("=" * 60)
    print("Khởi động Fire Detection Studio Backend...")
    print("API Endpoint: http://localhost:8000")
    print("Swagger Docs: http://localhost:8000/docs")
    print("=" * 60)
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)

