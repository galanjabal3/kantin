import os
import secrets
from pydantic_settings import BaseSettings
from typing import List

# Origin dev yang diizinkan ketika ALLOWED_ORIGINS kosong / wildcard.
DEV_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]


class Settings(BaseSettings):
    APP_NAME: str = "Kantin API"
    DATABASE_URL: str = ""
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""

    # Parse origins as list when accessed
    @property
    def origins_list(self) -> List[str]:
        """Daftar origin yang benar-benar diizinkan CORS.

        Nilai kosong, entry kosong, maupun wildcard ``*`` TIDAK pernah
        diteruskan (CORS di app memakai allow_credentials=True sehingga
        wildcard = "izinkan semua origin"). Sebagai gantinya fallback ke
        origin dev yang ketat.
        """
        parsed = [i.strip() for i in self.ALLOWED_ORIGINS.split(",") if i.strip()]
        parsed = [origin for origin in parsed if origin != "*"]
        if not parsed:
            return list(DEV_ORIGINS)
        return parsed

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Resolve environment
        self._environment = os.getenv("ENVIRONMENT", "development")

        # Enforce SECRET_KEY in production
        if self._environment == "production" and not self.SECRET_KEY:
            raise ValueError(
                "SECRET_KEY must be set in production environment. "
                "Set ENVIRONMENT=production and export SECRET_KEY, "
                "or set ENVIRONMENT=development for auto-generation."
            )

        # Auto-generate secure SECRET_KEY for development if not set
        if not self.SECRET_KEY and self._environment != "production":
            self.SECRET_KEY = secrets.token_urlsafe(32)


_settings = Settings()

# Export for imports — main.py does `from app.core.config import settings`
settings = _settings


def resolve_database_url() -> str:
    """Satu sumber kebenaran URL database untuk aplikasi **dan** alembic.

    pydantic-settings membaca ``.env`` tetapi TIDAK menulis hasilnya ke
    ``os.environ``, sehingga membaca ``os.getenv("DATABASE_URL")`` di
    ``alembic/env.py`` bisa menghasilkan ``None`` → alembic diam-diam jatuh
    ke SQLite in-memory, lapor sukses, dan tabelnya tidak pernah ada di
    Postgres (B13).

    Urutan: ``settings.DATABASE_URL`` (env var / .env) → env var OS → error
    jelas. Tidak ada fallback ``sqlite://`` diam-diam.
    """
    url = (settings.DATABASE_URL or "").strip()
    if not url:
        url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL belum dikonfigurasi. Isi DATABASE_URL di file .env "
            "atau set environment variable DATABASE_URL."
        )
    return url