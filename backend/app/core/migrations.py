"""Jalankan `alembic upgrade head` saat aplikasi start (B1).

Dinonaktifkan dengan env ``RUN_MIGRATIONS=0`` (dipakai oleh test suite agar
tidak menyentuh database manapun).
"""
import logging
import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import inspect, text

logger = logging.getLogger("kantin.migrations")

BACKEND_DIR = Path(__file__).resolve().parents[2]
INITIAL_REVISION = "9fe1a27f5c6c"


def _alembic(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=str(BACKEND_DIR),
        capture_output=True,
        text=True,
    )


def _needs_legacy_stamp() -> bool:
    """DB lama yang dibuat `Base.metadata.create_all` belum punya alembic_version."""
    from app.core.database import engine

    inspector = inspect(engine)
    if not inspector.has_table("restaurants"):
        return False
    if not inspector.has_table("alembic_version"):
        return True
    with engine.connect() as connection:
        row = connection.execute(text("SELECT version_num FROM alembic_version")).first()
        return row is None


def run_migrations() -> None:
    if os.getenv("RUN_MIGRATIONS", "1") == "0":
        logger.info("RUN_MIGRATIONS=0 — melewati alembic upgrade head")
        return

    try:
        if _needs_legacy_stamp():
            logger.warning(
                "Menemukan skema lama tanpa alembic_version → stamp %s dulu",
                INITIAL_REVISION,
            )
            stamped = _alembic("stamp", INITIAL_REVISION)
            if stamped.returncode != 0:
                raise RuntimeError(stamped.stderr or stamped.stdout)

        proc = _alembic("upgrade", "head")
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr or proc.stdout)
        logger.info("Alembic: skema sudah di head")
    except Exception as exc:
        # Gagal migrasi tidak boleh mematikan proses (mis. DB sementara
        # tidak terjangkau) — tetap catat jelas di log.
        logger.error(
            "Alembic upgrade head GAGAL (%s): %s — aplikasi tetap start tanpa migrasi.",
            type(exc).__name__,
            exc,
        )
