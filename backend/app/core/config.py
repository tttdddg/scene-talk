"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """SceneTalk backend settings loaded from environment."""

    # App
    app_env: str = Field(default="development", alias="APP_ENV")
    app_host: str = Field(default="0.0.0.0", alias="APP_HOST")
    app_port: int = Field(default=8000, alias="APP_PORT")

    # Vision model
    vision_api_key: str = Field(default="", alias="VISION_API_KEY")
    vision_base_url: str = Field(
        default="https://dashscope.aliyuncs.com/compatible-mode/v1",
        alias="VISION_BASE_URL",
    )
    vision_model: str = Field(default="qwen3.5-plus", alias="VISION_MODEL")

    # Limits
    vision_timeout_seconds: int = Field(default=30, alias="VISION_TIMEOUT_SECONDS")
    max_history_rounds: int = Field(default=4, alias="MAX_HISTORY_ROUNDS")
    max_image_bytes: int = Field(default=500_000, alias="MAX_IMAGE_BYTES")

    # CORS
    allowed_origins: str = Field(
        default="http://localhost:5173", alias="ALLOWED_ORIGINS"
    )

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


settings = Settings()
