"""B1: `alembic upgrade head` dijalankan saat aplikasi start."""
import subprocess

from app.core import migrations


def _completed() -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(args=["alembic"], returncode=0, stdout="", stderr="")


def test_migrasi_dilewati_bila_run_migrations_0(monkeypatch):
    calls = []
    monkeypatch.setattr(
        migrations, "_alembic", lambda *args: calls.append(args) or _completed()
    )
    monkeypatch.setenv("RUN_MIGRATIONS", "0")

    migrations.run_migrations()
    assert calls == []


def test_startup_menjalankan_upgrade_head(monkeypatch):
    calls = []
    monkeypatch.setattr(
        migrations, "_alembic", lambda *args: calls.append(args) or _completed()
    )
    monkeypatch.setattr(migrations, "_needs_legacy_stamp", lambda: False)
    monkeypatch.setenv("RUN_MIGRATIONS", "1")

    migrations.run_migrations()
    assert calls == [("upgrade", "head")]


def test_db_lama_tanpa_alembic_version_di_stamp_dulu(monkeypatch):
    calls = []
    monkeypatch.setattr(
        migrations, "_alembic", lambda *args: calls.append(args) or _completed()
    )
    monkeypatch.setattr(migrations, "_needs_legacy_stamp", lambda: True)
    monkeypatch.setenv("RUN_MIGRATIONS", "1")

    migrations.run_migrations()
    assert calls == [
        ("stamp", migrations.INITIAL_REVISION),
        ("upgrade", "head"),
    ]


def test_kegagalan_migrasi_tidak_mematikan_aplikasi(monkeypatch):
    def gagal(*args):
        return subprocess.CompletedProcess(
            args=["alembic"], returncode=1, stdout="", stderr="db down"
        )

    monkeypatch.setattr(migrations, "_alembic", gagal)
    monkeypatch.setattr(migrations, "_needs_legacy_stamp", lambda: False)
    monkeypatch.setenv("RUN_MIGRATIONS", "1")

    migrations.run_migrations()  # tidak melempar exception
