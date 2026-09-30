"""Test keamanan P0: IDOR (B4), CORS origins (B5), admin authz (B6),
refresh token (B7), dan cascade delete (B9)."""
from datetime import datetime, timedelta, timezone

from jose import jwt

from app.core.config import DEV_ORIGINS, Settings, settings
from app.core.refresh import hash_refresh_token
from app.core.security import create_access_token
from app.models.category import Category
from app.models.menu import MenuItem
from app.models.order import Order, OrderItem, OrderSource
from app.models.refresh_token import RefreshToken
from app.models.restaurant import Restaurant
from app.models.seller import Seller


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(client, email: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()


# ── B4: IDOR pelacakan order ─────────────────────────────────


def test_order_hanya_bisa_diakses_lewat_slug_restoran_pemilik(client, seed):
    a = seed("warung-idor-a")
    b = seed("warung-idor-b")

    resp = client.post(
        f"/api/r/{a['slug']}/orders",
        json={
            "customer_name": "Andi",
            "table_number": "3",
            "items": [{"menu_item_id": a["menu_item_id"], "quantity": 2}],
        },
    )
    assert resp.status_code == 200, resp.text
    order_id = resp.json()["id"]

    # slug pemilik → boleh
    assert client.get(f"/api/r/{a['slug']}/orders/{order_id}").status_code == 200
    # slug resto lain → 404 (bukan 200/403)
    assert client.get(f"/api/r/{b['slug']}/orders/{order_id}").status_code == 404
    # slug tidak dikenal → 404
    assert client.get(f"/api/r/tidak-ada/orders/{order_id}").status_code == 404


# ── B5: origins CORS ketat ───────────────────────────────────


def test_origins_kosong_tidak_mengizinkan_semua_origin():
    for raw in ("", "   ", "*", ",,"):
        origins = Settings(ALLOWED_ORIGINS=raw).origins_list
        assert origins == DEV_ORIGINS
        assert "" not in origins
        assert "*" not in origins


def test_origins_wildcard_dibuang_tetapi_tetap_ketat():
    origins = Settings(ALLOWED_ORIGINS="*").origins_list
    assert origins == DEV_ORIGINS

    origins = Settings(ALLOWED_ORIGINS="*, https://contoh.com").origins_list
    assert origins == ["https://contoh.com"]


def test_origins_kustom_dipertahankan():
    origins = Settings(ALLOWED_ORIGINS="https://a.com, https://b.com").origins_list
    assert origins == ["https://a.com", "https://b.com"]


def test_origins_aplikasi_aktif_bukan_wildcard():
    origins = settings.origins_list
    assert origins
    assert all(origins)
    assert "*" not in origins


def test_preflight_origin_tidak_dikenal_tidak_dikabulkan(client):
    resp = client.options(
        "/api/auth/login",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    assert "access-control-allow-origin" not in resp.headers

    resp = client.options(
        "/api/auth/login",
        headers={
            "Origin": DEV_ORIGINS[0],
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    assert resp.headers.get("access-control-allow-origin") == DEV_ORIGINS[0]


# ── B6: otorisasi admin ──────────────────────────────────────


def test_token_admin_palsu_ditolak_403(client):
    token = create_access_token(
        {"sub": "id-yang-tidak-ada", "user_type": "admin", "email": "evil@x.test"}
    )
    resp = client.get("/api/admin/restaurants", headers=_auth(token))
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Admin access required"


def test_seller_id_berbagai_klaim_admin_ditolak_403(client, seed):
    data = seed("warung-b6")

    for claims in (
        {"sub": data["seller_id"], "user_type": "admin"},
        {"sub": data["restaurant_id"], "user_type": "admin"},
    ):
        resp = client.get(
            "/api/admin/restaurants", headers=_auth(create_access_token(claims))
        )
        assert resp.status_code == 403


def test_seller_asli_tidak_bisa_mengakses_admin(client, seed):
    data = seed("warung-b6-seller")
    body = _login(client, data["seller_email"], data["seller_password"])
    assert body["user_type"] == "seller"

    resp = client.get("/api/admin/restaurants", headers=_auth(body["access_token"]))
    assert resp.status_code == 403


def test_login_admin_asli_tetap_bisa_mengakses_admin(client, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAIL", "boss@kantin.test")
    monkeypatch.setattr(settings, "ADMIN_PASSWORD", "Rahasia!99")

    body = _login(client, "boss@kantin.test", "Rahasia!99")
    assert body["user_type"] == "admin"
    assert body["refresh_token"]

    resp = client.get("/api/admin/restaurants", headers=_auth(body["access_token"]))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_login_admin_password_salah_ditolak(client, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAIL", "boss2@kantin.test")
    monkeypatch.setattr(settings, "ADMIN_PASSWORD", "Rahasia!99")

    resp = client.post(
        "/api/auth/login",
        json={"email": "boss2@kantin.test", "password": "salah"},
    )
    assert resp.status_code == 401


# ── B7: JWT 30 menit + refresh token ────────────────────────


def test_login_seller_mengembalikan_kontrak_token(client, seed):
    data = seed("warung-kontrak")
    body = _login(client, data["seller_email"], data["seller_password"])

    assert set(body) == {
        "access_token",
        "refresh_token",
        "token_type",
        "user_type",
        "restaurant_id",
        "restaurant_slug",
    }
    assert body["token_type"] == "bearer"
    assert body["user_type"] == "seller"
    assert body["restaurant_id"] == data["restaurant_id"]
    assert body["restaurant_slug"] == data["slug"]


def test_access_token_hanya_berlaku_30_menit(client, seed):
    data = seed("warung-jwt")
    body = _login(client, data["seller_email"], data["seller_password"])

    payload = jwt.decode(
        body["access_token"], settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
    )
    assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == 30
    assert payload["exp"] - payload["iat"] == 30 * 60


def test_refresh_menghasilkan_pasangan_token_baru(client, seed):
    data = seed("warung-refresh")
    first = _login(client, data["seller_email"], data["seller_password"])

    resp = client.post(
        "/api/auth/refresh", json={"refresh_token": first["refresh_token"]}
    )
    assert resp.status_code == 200, resp.text
    second = resp.json()

    assert set(second) == {"access_token", "refresh_token", "token_type"}
    assert second["token_type"] == "bearer"
    assert second["refresh_token"] != first["refresh_token"]

    # access token hasil refresh benar-benar dipakai
    me = client.get("/api/seller/me", headers=_auth(second["access_token"]))
    assert me.status_code == 200
    assert me.json()["slug"] == data["slug"]


def test_reuse_refresh_token_lama_setelah_rotasi_ditolak(client, seed):
    data = seed("warung-reuse")
    first = _login(client, data["seller_email"], data["seller_password"])

    rotated = client.post(
        "/api/auth/refresh", json={"refresh_token": first["refresh_token"]}
    )
    assert rotated.status_code == 200
    new_refresh = rotated.json()["refresh_token"]

    # token lama dipakai ulang → reuse detection
    reuse = client.post(
        "/api/auth/refresh", json={"refresh_token": first["refresh_token"]}
    )
    assert reuse.status_code == 401

    # seluruh keluarga dicabut → token baru dari rotasi ikut mati
    assert (
        client.post(
            "/api/auth/refresh", json={"refresh_token": new_refresh}
        ).status_code
        == 401
    )


def test_refresh_token_rusak_ditolak_401(client):
    for bad in ("bukan-token", "x" * 120, ""):
        resp = client.post("/api/auth/refresh", json={"refresh_token": bad})
        assert resp.status_code == 401, (bad, resp.status_code, resp.text)


def test_refresh_token_kedaluwarsa_ditolak_401(client, seed, db_session):
    data = seed("warung-expired")
    body = _login(client, data["seller_email"], data["seller_password"])

    row = (
        db_session.query(RefreshToken)
        .filter(RefreshToken.token_hash == hash_refresh_token(body["refresh_token"]))
        .first()
    )
    assert row is not None
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()

    resp = client.post(
        "/api/auth/refresh", json={"refresh_token": body["refresh_token"]}
    )
    assert resp.status_code == 401


def test_ttl_refresh_token_7_hari(client, seed, db_session):
    data = seed("warung-ttl")
    body = _login(client, data["seller_email"], data["seller_password"])

    row = (
        db_session.query(RefreshToken)
        .filter(RefreshToken.token_hash == hash_refresh_token(body["refresh_token"]))
        .first()
    )
    created = row.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    assert settings.REFRESH_TOKEN_EXPIRE_DAYS == 7
    assert timedelta(days=6, hours=23) <= expires - created
    assert expires - created <= timedelta(days=7, seconds=5)


# ── B9: cascade delete ───────────────────────────────────────


def test_hapus_restoran_menghapus_seluruh_data_anak(db_session, seed):
    data = seed("warung-cascade")

    order = Order(
        id="order-cascade-1",
        restaurant_id=data["restaurant_id"],
        customer_name="Budi",
        total_price=20000,
        source=OrderSource.customer,
    )
    db_session.add(order)
    db_session.flush()
    db_session.add(
        OrderItem(
            id="order-item-1",
            order_id=order.id,
            menu_item_id=data["menu_item_id"],
            quantity=2,
            subtotal=20000,
        )
    )
    db_session.commit()

    db_session.delete(db_session.get(Restaurant, data["restaurant_id"]))
    db_session.commit()

    assert db_session.query(Order).count() == 0
    assert db_session.query(OrderItem).count() == 0
    assert db_session.query(MenuItem).count() == 0
    assert db_session.query(Category).count() == 0
    assert db_session.query(Seller).count() == 0


def test_hapus_kategori_tidak_menghapus_menu_dan_riwayat_order(db_session, seed):
    """Hapus kategori = buang menu dari kategori, TANPA membuang riwayat.

    Sebelum B11 test ini melegitimasi penghapusan riwayat transaksi
    (kategori → menu → order_items ikut ter-cascade). Sekarang menu milik
    kategori cukup di-orphan (category_id NULL) dan order_items selamat.
    """
    data = seed("warung-cascade-kategori")

    order = Order(
        id="order-kat-1",
        restaurant_id=data["restaurant_id"],
        customer_name="Budi",
        total_price=20000,
        source=OrderSource.customer,
    )
    db_session.add(order)
    db_session.flush()
    db_session.add(
        OrderItem(
            id="order-item-kat-1",
            order_id=order.id,
            menu_item_id=data["menu_item_id"],
            quantity=2,
            subtotal=20000,
        )
    )
    db_session.commit()

    db_session.delete(db_session.get(Category, data["category_id"]))
    db_session.commit()

    # menu tidak ikut terhapus — hanya kehilangan kategorinya
    menu = db_session.query(MenuItem).first()
    assert db_session.query(MenuItem).count() == 1
    assert menu.category_id is None

    # riwayat transaksi selamat (B11)
    assert db_session.query(OrderItem).count() == 1
    assert db_session.query(Order).count() == 1

    # restorannya tetap ada
    assert db_session.query(Restaurant).count() == 1
