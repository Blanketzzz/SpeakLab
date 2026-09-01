from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    kelai_api_key: str
    kelai_base_url: str = "https://kelaiapi.cc/v1"
    kelai_model: str = "gemini-2.5-flash-lite"
    host: str = "0.0.0.0"
    port: int = 8787
    max_upload_mb: int = 500
    frame_count: int = 6
    whisper_model: str = "base"
    upload_dir: Path = ROOT / "uploads"
    jobs_dir: Path = ROOT / "jobs"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.jobs_dir.mkdir(parents=True, exist_ok=True)
    return settings
