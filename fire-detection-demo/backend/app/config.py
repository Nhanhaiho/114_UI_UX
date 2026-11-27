from pathlib import Path
from typing import List, Optional
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE_PATH = BACKEND_DIR / ".env"

_PLACEHOLDER_MARKERS = (
    "your-project-id",
    "your_anon_key",
    "your_service_role_secret",
    "your-supabase-jwt-secret",
    "your-email@gmail.com",
    "your-16-char-app-password",
    "placeholder",
)


def is_placeholder_or_empty(value: Optional[str]) -> bool:
    """Kiểm tra giá trị cấu hình bị bỏ trống hoặc vẫn là giá trị mẫu trong .env.example"""
    cleaned = (value or "").strip()
    if not cleaned:
        return True
    lowered = cleaned.lower()
    return any(marker in lowered for marker in _PLACEHOLDER_MARKERS)


def _default_model_path() -> str:
    weights_dir = BACKEND_DIR / "weights"
    for candidate in (
        "yolo26n_p2_src.pt",
        "yolo26n-p2-combine.pt",
        "yolo26n-combine.pt",
        "plain_mixedneg_s42_last.pt",
    ):
        if (weights_dir / candidate).exists():
            return f"weights/{candidate}"
    existing = sorted(weights_dir.glob("*.pt"))
    if existing:
        return f"weights/{existing[0].name}"
    return "weights/yolo26n_p2_src.pt"


class Settings(BaseSettings):
    PROJECT_NAME: str = "Fire Detection Studio Backend"
    API_V1_PREFIX: str = "/api"

    # Model config
    MODEL_PATH: str = Field(default_factory=_default_model_path)
    MODEL_CODE_DIR: str = "model_code"
    DEVICE: str = ""  # Để trống để tự động chọn CUDA nếu có, hoặc cpu
    IMGSZ: int = 640
    DEFAULT_CONF_THRESHOLD: float = Field(
        default=0.25,
        validation_alias=AliasChoices("CONF_THRESHOLD", "DEFAULT_CONF_THRESHOLD"),
    )

    # Request limits
    MAX_IMAGE_SIZE_MB: int = 20

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
    ]

    # Supabase Configuration
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""
    ALLOW_MOCK_AUTH: Optional[bool] = None

    # SMTP Configuration (Hỗ trợ Gmail SMTP)
    # Đặt SMTP_MOCK=false và SMTP_ENABLED=true kèm thông tin SMTP hợp lệ để gửi mail thật.
    SMTP_MOCK: bool = False
    SMTP_ENABLED: bool = False
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "Fire Detection Studio"
    SMTP_USE_TLS: bool = True

    # Giới hạn tần suất gửi email thử (Rate Limiting)
    TEST_EMAIL_COOLDOWN_SECONDS: int = 60

    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def is_supabase_auth_configured(self) -> bool:
        has_url = not is_placeholder_or_empty(self.SUPABASE_URL)
        has_api_key = (
            not is_placeholder_or_empty(self.SUPABASE_ANON_KEY)
            or not is_placeholder_or_empty(self.SUPABASE_SERVICE_ROLE_KEY)
        )
        has_jwt_secret = not is_placeholder_or_empty(self.SUPABASE_JWT_SECRET)
        return (has_url and has_api_key) or has_jwt_secret

    @property
    def is_supabase_db_configured(self) -> bool:
        return (
            not is_placeholder_or_empty(self.SUPABASE_URL)
            and not is_placeholder_or_empty(self.SUPABASE_SERVICE_ROLE_KEY)
        )

    @property
    def allow_mock_auth(self) -> bool:
        if self.ALLOW_MOCK_AUTH is not None:
            return self.ALLOW_MOCK_AUTH
        return not self.is_supabase_auth_configured


settings = Settings()
