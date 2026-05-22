"""Application configuration loaded from environment variables."""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = "sqlite:///./data/app.sqlite3"

    # Storage
    storage_dir: str = "./storage"
    max_upload_mb: int = 50

    # AI
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    use_mock_ai: bool = True

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    @property
    def storage_path(self) -> Path:
        return Path(self.storage_dir).resolve()

    @property
    def uploads_path(self) -> Path:
        return self.storage_path / "uploads"

    @property
    def markdown_path(self) -> Path:
        return self.storage_path / "markdown"

    @property
    def exports_path(self) -> Path:
        return self.storage_path / "exports"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


settings = Settings()
