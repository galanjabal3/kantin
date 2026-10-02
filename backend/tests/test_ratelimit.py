"""B3 + A4: rate limit per-IP via slowapi 0.1.9.

A4: limit tidak lagi string hardcode di dekorator — tiap endpoint membaca
settings (pydantic-settings, bisa dioverride lewat env var) lewat provider
callable di ``app.core.ratelimit``.
"""
from app.core import config as config_module
from app.core import ratelimit as ratelimit_module
from app.core.config import Settings, settings


# ── A4: konfigurasi limit ─────────────────────────────────────


def test_default_rate_limit_masuk_akal_untuk_demo():
    assert settings.RATE_LIMIT_MENU == "60/minute"  # dulu 20/minute
    assert settings.RATE_LIMIT_ORDER == "30/minute"  # dulu 10/minute
    assert settings.RATE_LIMIT_LOGIN == "5/minute"  # TETAP — keamanan


def test_settings_membaca_env_var_rate_limit(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_MENU", "7/minute")
    monkeypatch.setenv("RATE_LIMIT_ORDER", "3/minute")
    monkeypatch.setenv("RATE_LIMIT_LOGIN", "2/minute")

    konfigurasi_baru = Settings()
    assert konfigurasi_baru.RATE_LIMIT_MENU == "7/minute"
    assert konfigurasi_baru.RATE_LIMIT_ORDER == "3/minute"
    assert konfigurasi_baru.RATE_LIMIT_LOGIN == "2/minute"


def test_menu_default_tidak_mudah_kena_429(client, seed):
    """Demo publik: jauh di atas batas lama 20/minute tetap diterima."""
    data = seed("warung-a4-default")

    codes = [
        client.get(f"/api/r/{data['slug']}/menu").status_code for _ in range(30)
    ]
    assert codes == [200] * 30


def test_limit_menu_mengikuti_env_var_rate_limit(client, seed, monkeypatch):
    """A4(a): env var → pydantic-settings → provider slowapi → endpoint.

    Bukti limit dibaca per-request dari settings, bukan string hardcode.
    """
    monkeypatch.setenv("RATE_LIMIT_MENU", "3/minute")
    konfigurasi_baru = Settings()
    assert konfigurasi_baru.RATE_LIMIT_MENU == "3/minute"
    monkeypatch.setattr(config_module, "settings", konfigurasi_baru)
    monkeypatch.setattr(ratelimit_module, "settings", konfigurasi_baru)

    data = seed("warung-a4-env")
    codes = [
        client.get(f"/api/r/{data['slug']}/menu").status_code for _ in range(4)
    ]
    assert codes[:3] == [200] * 3
    assert codes[3] == 429


def test_limit_order_mengikuti_configurasi_rate_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ORDER", "2/minute")

    # items minimal 1 (validasi B12) — restoran "ghost" tidak ada → 404
    payload = {
        "customer_name": "Fani",
        "items": [{"menu_item_id": "menu-tidak-ada", "quantity": 1}],
    }
    codes = [
        client.post("/api/r/ghost-a4/orders", json=payload).status_code
        for _ in range(3)
    ]
    assert codes[:2] == [404] * 2  # limit kecil tetap ADA, bukan dihapus
    assert codes[2] == 429


# ── B3: perilaku limit lama tetap berlaku ─────────────────────


def test_menu_dibatasi_20_request_per_menit(client, seed, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_MENU", "20/minute")
    data = seed("warung-rl-menu")

    codes = [
        client.get(f"/api/r/{data['slug']}/menu").status_code for _ in range(21)
    ]
    assert codes[:20] == [200] * 20
    assert codes[20] == 429


def test_order_dibatasi_10_request_per_menit(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ORDER", "10/minute")
    # items minimal 1 (validasi B12) — restoran "ghost" tetap tidak ada → 404
    payload = {
        "customer_name": "Fani",
        "items": [{"menu_item_id": "menu-tidak-ada", "quantity": 1}],
    }

    codes = [
        client.post("/api/r/ghost-rl/orders", json=payload).status_code
        for _ in range(11)
    ]
    # 10 pertama diterima endpoint (restoran tidak ada → 404, tetap dihitung)
    assert codes[:10] == [404] * 10
    assert codes[10] == 429


def test_respon_429_berisi_pesan_jelas(client, seed, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_MENU", "2/minute")
    data = seed("warung-rl-pesan")
    for _ in range(2):
        client.get(f"/api/r/{data['slug']}/menu")

    resp = client.get(f"/api/r/{data['slug']}/menu")
    assert resp.status_code == 429
    body = resp.json()
    assert "error" in body or "detail" in body


def test_limit_terpisah_per_ip_dan_per_endpoint(client, seed):
    data_a = seed("warung-rl-a")
    data_b = seed("warung-rl-b")

    # endpoint lain tidak ikut terbakar oleh limit menu
    assert client.get("/health").status_code == 200

    # slug berbeda = path berbeda → jendela hitung terpisah
    assert client.get(f"/api/r/{data_a['slug']}/menu").status_code == 200
    assert client.get(f"/api/r/{data_b['slug']}/menu").status_code == 200
