from pydantic_settings import BaseSettings
from pathlib import Path
from threading import Lock


class Settings(BaseSettings):
    app_name: str = "pet-bot-server"
    database_url: str = "sqlite:///./petbot.db"
    upload_dir: str = "./uploads"
    asset_dir: str = "./assets"
    builtin_provider_key: str = ""
    builtin_model: str = "gpt-image-2"
    builtin_api_base: str = "https://api.openai.com/v1"
    cors_origins: str = "*"
    max_free_generations: int = 5
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440
    sprite_generation_enabled: bool = True
    sprite_max_regenerate_attempts: int = 2

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "allow"}


settings = Settings()
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
Path(settings.asset_dir).mkdir(parents=True, exist_ok=True)


class RuntimeConfig:
    """Thread-safe runtime-overridable AI config.

    Values set here take precedence over ``settings.*`` defaults.
    When a value is ``None`` the provider falls back to ``settings``.
    """

    _instance = None
    _lock = Lock()

    def __new__(cls) -> "RuntimeConfig":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._api_key: str | None = None
            cls._instance._api_base_url: str | None = None
            cls._instance._model: str | None = None
        return cls._instance

    # ---- thread-safe accessors ----

    @property
    def api_key(self) -> str | None:
        with self._lock:
            return self._api_key

    @property
    def api_base_url(self) -> str | None:
        with self._lock:
            return self._api_base_url

    @property
    def model(self) -> str | None:
        with self._lock:
            return self._model

    def update(
        self,
        api_key: str | None = None,
        api_base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        """Update runtime overrides. Pass ``None`` to clear a field."""
        with self._lock:
            if api_key is not None:
                self._api_key = api_key if api_key != "" else None
            if api_base_url is not None:
                self._api_base_url = api_base_url if api_base_url != "" else None
            if model is not None:
                self._model = model if model != "" else None

    def as_dict(self) -> dict:
        with self._lock:
            return {
                "api_key": self._api_key,
                "api_base_url": self._api_base_url,
                "model": self._model,
            }


runtime_config = RuntimeConfig()
