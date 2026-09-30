"""B14: login wajib rate limit per-IP + throttle per-email + compare_digest.

Sebelumnya POST /api/auth/login tidak dibatasi sama sekali (hanya menu &
order) → brute-force password seller/admin bebas.
"""
from app.core.config import settings
from app.core.ratelimit import limiter

LOGIN = "/api/auth/login"


def _login_body(email: str, password: str) -> dict:
    return {"email": email, "password": password}


def test_login_dibatasi_5_request_per_menit_per_ip(client):
    codes = [
        client.post(LOGIN, json=_login_body("brute@evil.test", "salah")).status_code
        for _ in range(6)
    ]
    assert codes[:5] == [401] * 5
    assert codes[5] == 429

    # 429 datang dari bucket IP slowapi
    resp = client.post(LOGIN, json=_login_body("brute@evil.test", "salah"))
    assert "error" in resp.json()


def test_throttle_per_email_10_gagal_per_menit(client):
    target = "target@kantin.test"

    # kosongkan bucket IP agar yang teruji justru throttle per-email
    for _ in range(10):
        limiter.reset()
        resp = client.post(LOGIN, json=_login_body(target, "salah"))
        assert resp.status_code == 401, resp.text

    limiter.reset()
    resp = client.post(LOGIN, json=_login_body(target, "salah"))
    assert resp.status_code == 429
    assert "email ini" in resp.json()["detail"]


def test_throttle_per_email_tidak_mematikan_email_lain(client, seed):
    data = seed("warung-throttle-lain")
    for _ in range(10):
        limiter.reset()
        assert (
            client.post(LOGIN, json=_login_body("korban@kantin.test", "salah")).status_code
            == 401
        )

    # email lain masih boleh mencoba (bucket IP dikosongkan dulu)
    limiter.reset()
    resp = client.post(
        LOGIN,
        json=_login_body(data["seller_email"], data["seller_password"]),
    )
    assert resp.status_code == 200, resp.text

    # sampai 10 percobaan pun email lain masih 401, bukan 429
    for _ in range(10):
        limiter.reset()
        assert (
            client.post(LOGIN, json=_login_body("lain@kantin.test", "salah")).status_code
            == 401
        )


def test_throttle_berlaku_juga_untuk_password_benar(client, seed):
    data = seed("warung-throttle-benar")
    for _ in range(10):
        limiter.reset()
        assert (
            client.post(LOGIN, json=_login_body(data["seller_email"], "salah")).status_code
            == 401
        )

    limiter.reset()
    resp = client.post(
        LOGIN,
        json=_login_body(data["seller_email"], data["seller_password"]),
    )
    assert resp.status_code == 429
    assert "email ini" in resp.json()["detail"]


def test_login_sukses_mereset_hitungan_gagal(client, seed):
    data = seed("warung-reset-gagal")

    for _ in range(9):
        limiter.reset()
        assert (
            client.post(LOGIN, json=_login_body(data["seller_email"], "salah")).status_code
            == 401
        )

    limiter.reset()
    assert (
        client.post(
            LOGIN,
            json=_login_body(data["seller_email"], data["seller_password"]),
        ).status_code
        == 200
    )

    # hitungannya direset → 9 gagal berikutnya tetap 401, bukan 429
    for _ in range(9):
        limiter.reset()
        assert (
            client.post(LOGIN, json=_login_body(data["seller_email"], "salah")).status_code
            == 401
        )


def test_bandingkan_password_admin_non_ascii_tidak_crash(client, monkeypatch):
    """secrets.compare_digest dengan teks non-ASCII harus aman (401, bukan 500)."""
    monkeypatch.setattr(settings, "ADMIN_EMAIL", "bos@kantin.test")
    monkeypatch.setattr(settings, "ADMIN_PASSWORD", "Rahasia!99")

    resp = client.post(LOGIN, json=_login_body("bôs@kântin.test", "rahasia😀"))
    assert resp.status_code == 401, resp.text

    ok = client.post(LOGIN, json=_login_body("bos@kantin.test", "Rahasia!99"))
    assert ok.status_code == 200, ok.text
    assert ok.json()["user_type"] == "admin"


def test_seller_aktif_setelah_login_lolos_rate_limit(client, seed):
    """Limit tidak menghalangi login sah yang wajar (< 5/menit)."""
    data = seed("warung-login-lolos")
    for _ in range(4):
        resp = client.post(
            LOGIN, json=_login_body(data["seller_email"], data["seller_password"])
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["user_type"] == "seller"

    # percobaan ke-5 masih diterima, ke-6 dibatasi
    assert (
        client.post(
            LOGIN, json=_login_body(data["seller_email"], data["seller_password"])
        ).status_code
        == 200
    )
    assert (
        client.post(
            LOGIN, json=_login_body(data["seller_email"], data["seller_password"])
        ).status_code
        == 429
    )
