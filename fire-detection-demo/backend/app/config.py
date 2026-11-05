import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Fire Detection Studio Backend"
    API_V1_PREFIX: str = "/api"
    
    # Model config
    MODEL_PATH: str = os.getenv(
        "MODEL_PATH",
        "weights/src_ratio8.pt" if Path("weights/src_ratio8.pt").exists() else "weights/best.pt"
    )
    MODEL_CODE_DIR: str = os.getenv("MODEL_CODE_DIR", "model_code")
    DEVICE: str = os.getenv("DEVICE", "")  # Empty string means auto: cuda if available else cpu
    IMGSZ: int = int(os.getenv("IMGSZ", "640"))
    DEFAULT_CONF_THRESHOLD: float = float(os.getenv("CONF_THRESHOLD", "0.25"))
    
    # Request limits
    MAX_IMAGE_SIZE_MB: int = int(os.getenv("MAX_IMAGE_SIZE_MB", "20"))
    
    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
    ]

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

