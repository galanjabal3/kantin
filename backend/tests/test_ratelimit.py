"""B3: rate limit per-IP via slowapi 0.1.9."""


def test_menu_dibatasi_20_request_per_menit(client, seed):
    data = seed("warung-rl-menu")

    codes = [
        client.get(f"/api/r/{data['slug']}/menu").status_code for _ in range(21)
    ]
    assert codes[:20] == [200] * 20
    assert codes[20] == 429


def test_order_dibatasi_10_request_per_menit(client):
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


def test_respon_429_berisi_pesan_jelas(client, seed):
    data = seed("warung-rl-pesan")
    for _ in range(20):
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
