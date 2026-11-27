import uvicorn
import os
import sys
import asyncio

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    # Đảm bảo thư mục backend nằm trong sys.path và là thư mục làm việc hiện tại
    # để đường dẫn .env, weights/ và model_code/ luôn nhất quán trên Windows
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(backend_dir)
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)

    print("=" * 60)
    print("Khởi động Fire Detection Studio Backend...")
    print(f"Working Directory: {backend_dir}")
    print(f"Env File: {os.path.join(backend_dir, '.env')}")
    print("API Endpoint: http://localhost:8000")
    print("Swagger Docs: http://localhost:8000/docs")
    print("=" * 60)
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
