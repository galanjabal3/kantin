"""B13: alembic/env.py harus memakai settings.DATABASE_URL, bukan os.getenv.

Sebelumnya env.py membaca os.getenv("DATABASE_URL", "sqlite://") —
pydantic-settings membaca .env tetapi tidak menulis ke os.environ, sehingga
`alembic upgrade head` diam-diam membuat tabel di SQLite in-memory, lapor
sukses (returncode 0), dan aplikasi crash "relation restaurants does not
exist" di Postgres.
"""
import os
from pathlib import Path

import pytest
import sqlalchemy
from alembic import command
from alembic.config import Config

from app.core.config import resolve_database_url, settings

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_pakai_settings_bukan_os_getenv(monkeypatch, tmp_path):
    """settings.DATABASE_URL terisi lewat .env tapi env var OS kosong."""
    expected = f"sqlite:///{tmp_path / 'dari-settings.db'}"
    monkeypatch.setattr(settings, "DATABASE_URL", expected)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    assert os.getenv("DATABASE_URL") is None  # pydantic tidak menulis os.environ
    assert resolve_database_url() == expected


def test_fallback_ke_env_var_os(monkeypatch):
    monkeypatch.setattr(settings, "DATABASE_URL", "")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///dari-env-var.db")

    assert resolve_database_url() == "sqlite:///dari-env-var.db"


def test_kedua_kosong_menghasilkan_error_jelas(monkeypatch):
    """Tidak ada lagi fallback sqlite:// diam-diam."""
    monkeypatch.setattr(settings, "DATABASE_URL", "")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        resolve_database_url()


def test_env_py_tidak_membaca_os_getenv_sqlite_inmemory():
    """Guard agar regresi ke os.getenv('DATABASE_URL', 'sqlite://') cepat ketahuan."""
    source = (BACKEND_DIR / "alembic" / "env.py").read_text(encoding="utf-8")
    assert 'os.getenv("DATABASE_URL"' not in source
    assert "'sqlite://'" not in source
    assert '"sqlite://"' not in source
    assert "resolve_database_url" in source


def test_upgrade_head_mengikuti_settings_database_url(monkeypatch, tmp_path):
    """Bukti empiris: `alembic upgrade head` menulis ke URL settings."""
    db_file = tmp_path / "target-alembic.db"
    url = f"sqlite:///{db_file}"
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    command.upgrade(cfg, "head")

    engine = sqlalchemy.create_engine(url)
    tables = set(sqlalchemy.inspect(engine).get_table_names())
    assert {"restaurants", "menu_items", "order_items", "orders"} <= tables
    with engine.connect() as conn:
        version = conn.execute(
            sqlalchemy.text("SELECT version_num FROM alembic_version")
        ).scalar()
    assert version == _head_revision()


def _head_revision() -> str:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    from alembic.script import ScriptDirectory

    return ScriptDirectory.from_config(cfg).get_current_head()
