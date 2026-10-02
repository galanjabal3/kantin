"""Opsi A — pembatalan pesanan pelanggan PERSIST ke DB (bukan buang sesi client).

Kontrak `POST /api/r/{slug}/orders/{order_id}/cancel`:
  - 200 + ``status="cancelled"`` : order masih ``pending``
  - 200                          : sudah ``cancelled`` → idempoten (retry aman)
  - 409 (pesan Bahasa Indonesia)  : ``preparing`` / ``ready`` / ``done``
  - 404                          : slug salah / order tidak ada (guard IDOR)

Pembatalan juga memantul ke sisi penjual: ``cancelled`` adalah status terminal
di `PUT /api/seller/orders/{id}/status` (409) dan muncul sebagai "Dibatalkan"
di `GET /api/seller/orders`.
"""
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.config import resolve_database_url, settings
from app.models.order import Order, OrderStatus

BACKEND_DIR = Path(__file__).resolve().parents[1]
CANCEL_PATH = "/api/r/{slug}/orders/{oid}/cancel"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(client, email: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _create_order(client, data: dict, name: str = "Cici"):
    resp = client.post(
        f"/api/r/{data['slug']}/orders",
        json={
            "customer_name": name,
            "items": [{"menu_item_id": data["menu_item_id"], "quantity": 1}],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "pending"
    return body


def _cancel(client, slug: str, order_id: str):
    return client.post(CANCEL_PATH.format(slug=slug, oid=order_id))


def _seller_token(client, data: dict) -> str:
    return _login(client, data["seller_email"], data["seller_password"])["access_token"]


def _set_status_via_seller(client, data: dict, order_id: str, new_status: str) -> None:
    """Ubah status lewat endpoint penjual (pola dipakai alur E2E B03/B05)."""
    token = _seller_token(client, data)
    resp = client.put(
        f"/api/seller/orders/{order_id}/status",
        params={"new_status": new_status},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text


# ── Pending → cancelled, dan PERSIST di DB ───────────────────────────────


def test_pending_dibatalkan_status_persist_di_db(client, seed, db_session):
    data = seed("warung-batal")
    order = _create_order(client, data)

    resp = _cancel(client, data["slug"], order["id"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "cancelled"

    # Persist: dibaca ulang lewat sesi DB TERPISAH (bukan cache response)
    row = db_session.query(Order).filter(Order.id == order["id"]).first()
    assert row is not None, "order hilang setelah cancel"
    assert row.status == OrderStatus.cancelled


def test_order_cancelled_muncul_di_daftar_seller_sebagai_cancelled(client, seed):
    data = seed("warung-batal-seller")
    order = _create_order(client, data)
    assert _cancel(client, data["slug"], order["id"]).status_code == 200

    token = _seller_token(client, data)
    resp = client.get("/api/seller/orders", headers=_auth(token))
    assert resp.status_code == 200, resp.text
    entry = next(o for o in resp.json() if o["id"] == order["id"])
    assert entry["status"] == "cancelled"


# ── 404: slug salah / order tidak ada (guard IDOR) ───────────────────────


def test_slug_restoran_lain_ditolak_404(client, seed):
    a = seed("warung-batal-a")
    b = seed("warung-batal-b")
    order = _create_order(client, a)

    resp = _cancel(client, b["slug"], order["id"])  # order milik resto A
    assert resp.status_code == 404, resp.text
    assert "tidak ditemukan" in resp.json()["detail"]

    # Tidak ada efek samping: order asli tetap pending
    assert client.get(
        f"/api/r/{a['slug']}/orders/{order['id']}"
    ).json()["status"] == "pending"


def test_order_tidak_ada_ditolak_404(client, seed):
    data = seed("warung-batal-404")
    resp = _cancel(client, data["slug"], "order-tidak-ada")
    assert resp.status_code == 404, resp.text


def test_slug_tidak_ada_ditolak_404(client):
    resp = _cancel(client, "slug-hilang", "order-tidak-ada")
    assert resp.status_code == 404, resp.text


# ── 409: sudah diproses penjual ───────────────────────────────────────────


@pytest.mark.parametrize("target", ["preparing", "ready", "done"])
def test_sudah_diproses_ditolak_409(client, seed, target):
    data = seed("warung-batal-409")
    order = _create_order(client, data)
    _set_status_via_seller(client, data, order["id"], target)

    resp = _cancel(client, data["slug"], order["id"])
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert "tidak bisa dibatalkan" in detail
    assert "diproses penjual" in detail

    # Status asli tidak berubah
    assert client.get(
        f"/api/r/{data['slug']}/orders/{order['id']}"
    ).json()["status"] == target


# ── 200 idempotent: cancel dua kali tetap 200 ─────────────────────────────


def test_cancel_dua_kali_idempoten_200(client, seed, db_session):
    data = seed("warung-batal-2x")
    order = _create_order(client, data)

    first = _cancel(client, data["slug"], order["id"])
    second = _cancel(client, data["slug"], order["id"])  # retry / klik dobel
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert second.json()["status"] == "cancelled"

    row = db_session.query(Order).filter(Order.id == order["id"]).first()
    assert row.status == OrderStatus.cancelled


# ── Status terminal: seller tidak bisa mengubahnya ────────────────────────


def test_seller_tidak_bisa_ubah_status_order_cancelled(client, seed):
    data = seed("warung-batal-terminal")
    order = _create_order(client, data)
    assert _cancel(client, data["slug"], order["id"]).status_code == 200

    token = _seller_token(client, data)
    resp = client.put(
        f"/api/seller/orders/{order['id']}/status",
        params={"new_status": "preparing"},
        headers=_auth(token),
    )
    assert resp.status_code == 409, resp.text
    assert "dibatalkan" in resp.json()["detail"].lower()

    # Masih cancelled — tidak "dihidupkan" lagi
    assert client.get(
        f"/api/r/{data['slug']}/orders/{order['id']}"
    ).json()["status"] == "cancelled"


# ── Rate limit (pola test_ratelimit: baca settings via monkeypatch) ───────


def test_cancel_dibatasi_rate_limit_order(client, seed, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ORDER", "2/minute")
    data = seed("warung-batal-rl")
    order = _create_order(client, data)

    # Path yang sama → jendela hitung yang sama; limit terbaca per-request
    codes = [
        _cancel(client, data["slug"], order["id"]).status_code for _ in range(3)
    ]
    assert codes[:2] == [200, 200]  # 1 sukses + 1 idempoten, limit masih ada
    assert codes[2] == 429


# ── Migrasi: enum PostgreSQL memuat 'cancelled' ───────────────────────────


def test_revisi_migrasi_cancelled_ada_di_file_versions():
    """Guard statis (pola test_alembic_env): revisi tidak boleh hilang.

    DDL-nya sendiri diverifikasi di test hidup di bawah (butuh PostgreSQL).
    """
    versions = BACKEND_DIR / "alembic" / "versions"
    revisi = versions / "c7d5e8f2a1b4_add_order_status_cancelled.py"
    assert revisi.is_file(), "revisi enum cancelled tidak ada"
    source = revisi.read_text(encoding="utf-8")
    assert "ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'cancelled'" in source
    # DDL enum wajib di luar transaksi (lihat docstring revisi)
    assert "autocommit_block" in source
    # SQLite (test alembic lokal) tidak punya ALTER TYPE → wajib ada guard
    assert 'dialect != "postgresql"' in source


def test_enum_postgres_memuat_nilai_cancelled():
    """Bukti empiris terhadap PG lokal: enum `orderstatus` memuat `cancelled`.

    Skip-guard: enum native hanya ada di PostgreSQL. Kalau `DATABASE_URL`
    bukan postgres ATAU server tidak bisa dihubungi, test dilewati dengan
    pesan jelas — suite lain tetap jalan penuh di SQLite in-memory.
    """
    url = resolve_database_url()
    if not url.startswith(("postgres://", "postgresql://")):
        pytest.skip(f"DATABASE_URL bukan PostgreSQL ({url!r}) — enum native hanya di PG")

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    try:
        # Pastikan revisi terbaru sudah diterapkan (idempoten: bila sudah
        # head, alembic tidak menjalankan apa pun).
        command.upgrade(cfg, "head")
        engine = sa.create_engine(url)
        with engine.connect() as conn:
            values = conn.execute(
                sa.text("SELECT unnest(enum_range(NULL::orderstatus))")
            ).scalars().all()
    except (sa.exc.SQLAlchemyError, OSError) as exc:
        pytest.skip(f"PostgreSQL lokal tidak bisa dihubungi: {exc}")

    assert "cancelled" in values, f"enum orderstatus = {values}"
    assert {"pending", "preparing", "ready", "done", "cancelled"} <= set(values)
