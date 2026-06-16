from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    app_name: str = "pet-bot-server"
    database_url: str = "sqlite:///./petbot.db"
    upload_dir: str = "./uploads"
    asset_dir: str = "./assets"
    builtin_provider_key: str = ""
    max_free_generations: int = 5
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440
    cors_origins: str = "*"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
Path(settings.asset_dir).mkdir(parents=True, exist_ok=True)
