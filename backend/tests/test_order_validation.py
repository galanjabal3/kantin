"""B12: validasi input order (endpoint publik) + plafon total + harga menu > 0."""
import pytest

from app.schemas.order import MAX_ITEMS_PER_ORDER, MAX_ORDER_TOTAL

PRICE = 10_000.0


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(client, email: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _order(client, slug: str, menu_item_id: str, quantity, items=None):
    body = {
        "customer_name": "Cici",
        "items": items
        if items is not None
        else [{"menu_item_id": menu_item_id, "quantity": quantity}],
    }
    return client.post(f"/api/r/{slug}/orders", json=body)


@pytest.mark.parametrize("quantity", [0, -5, -1000, 101, 10_000_000_000])
def test_quantity_di_luar_batas_ditolak_422(client, seed, quantity):
    data = seed("warung-validasi-qty")
    resp = _order(client, data["slug"], data["menu_item_id"], quantity)
    assert resp.status_code == 422, resp.text


@pytest.mark.parametrize("quantity", [1, 50, 100])
def test_quantity_valid_diterima_200(client, seed, quantity):
    data = seed("warung-validasi-qty-ok")
    resp = _order(client, data["slug"], data["menu_item_id"], quantity)
    assert resp.status_code == 200, resp.text
    assert resp.json()["total_price"] == PRICE * quantity


def test_items_kosong_ditolak_422(client, seed):
    data = seed("warung-validasi-kosong")
    resp = _order(client, data["slug"], data["menu_item_id"], None, items=[])
    assert resp.status_code == 422, resp.text


def test_items_terlalu_banyak_ditolak_422(client, seed):
    data = seed("warung-validasi-banyak")
    items = [
        {"menu_item_id": data["menu_item_id"], "quantity": 1}
        for _ in range(MAX_ITEMS_PER_ORDER + 10)
    ]
    resp = _order(client, data["slug"], data["menu_item_id"], None, items=items)
    assert resp.status_code == 422, resp.text


def test_quantity_negatif_tidak_menghasilkan_total_negatif(client, db_session, seed):
    data = seed("warung-validasi-negatif")
    resp = _order(client, data["slug"], data["menu_item_id"], -1000)
    assert resp.status_code == 422
    from app.models.order import Order

    assert db_session.query(Order).count() == 0


def test_total_melebihi_plafon_ditolak_customer(client, seed):
    # 1 item × 100 qty × Rp30.000.000 = Rp3.000.000.000 > Rp1.000.000.000
    data = seed("warung-plafon", price=30_000_000.0)
    resp = _order(client, data["slug"], data["menu_item_id"], 100)
    assert resp.status_code == 400, resp.text
    assert "melebihi batas" in resp.json()["detail"]
    assert MAX_ORDER_TOTAL == 1_000_000_000


def test_total_sama_dengan_plafon_diterima(client, seed):
    # 1 item × 100 qty × Rp10.000.000 = Rp1.000.000.000 (tepat di plafon)
    data = seed("warung-plafon-pas", price=10_000_000.0)
    resp = _order(client, data["slug"], data["menu_item_id"], 100)
    assert resp.status_code == 200, resp.text


def test_total_melebihi_plafon_ditolak_kasir(client, seed):
    data = seed("warung-plafon-kasir", price=30_000_000.0)
    token = _login(client, data["seller_email"], data["seller_password"])["access_token"]

    resp = client.post(
        "/api/seller/orders",
        json={
            "customer_name": "Eka",
            "items": [{"menu_item_id": data["menu_item_id"], "quantity": 100}],
        },
        headers=_auth(token),
    )
    assert resp.status_code == 400, resp.text


def test_kasir_juga_terlindungi_validasi_item(client, seed):
    data = seed("warung-plafon-kasir-validasi")
    token = _login(client, data["seller_email"], data["seller_password"])["access_token"]

    kosong = client.post(
        "/api/seller/orders",
        json={"customer_name": "Eka", "items": []},
        headers=_auth(token),
    )
    assert kosong.status_code == 422, kosong.text

    negatif = client.post(
        "/api/seller/orders",
        json={
            "customer_name": "Eka",
            "items": [{"menu_item_id": data["menu_item_id"], "quantity": -1}],
        },
        headers=_auth(token),
    )
    assert negatif.status_code == 422, negatif.text


def test_seller_bisa_dibuat_dengan_quantity_1_100(client, seed):
    data = seed("warung-plafon-kasir-ok")
    token = _login(client, data["seller_email"], data["seller_password"])["access_token"]

    resp = client.post(
        "/api/seller/orders",
        json={
            "customer_name": "Eka",
            "items": [{"menu_item_id": data["menu_item_id"], "quantity": 100}],
        },
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text


def test_seller_tidak_bisa_buat_menu_harga_nol_atau_negatif(client, seed):
    data = seed("warung-harga")
    token = _login(client, data["seller_email"], data["seller_password"])["access_token"]

    for harga in (0, -1000):
        resp = client.post(
            "/api/seller/menu",
            json={"name": "Es Teh", "price": harga},
            headers=_auth(token),
        )
        assert resp.status_code == 422, (harga, resp.text)

    ok = client.post(
        "/api/seller/menu",
        json={"name": "Es Teh", "price": 5000},
        headers=_auth(token),
    )
    assert ok.status_code == 200, ok.text


def test_seller_tidak_bisa_update_menu_ke_harga_negatif(client, seed):
    data = seed("warung-harga-update")
    token = _login(client, data["seller_email"], data["seller_password"])["access_token"]

    resp = client.put(
        f"/api/seller/menu/{data['menu_item_id']}",
        json={"price": -1},
        headers=_auth(token),
    )
    assert resp.status_code == 422, resp.text
