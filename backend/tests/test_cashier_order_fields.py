"""Tab Kasir: field payload OrderCreate harus benar-benar tersimpan ke DB.

Regression test untuk bug: `table_number` dari payload tidak pernah di-assign
ke objek Order di `create_order_cashier` sehingga hilang dari database.
"""
from app.models.order import Order


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(client, email: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_order_kasir_persist_table_number_dan_customer_name(
    client, db_session, seed
):
    data = seed("warung-kasir-meja")
    token = _login(client, data["seller_email"], data["seller_password"])["access_token"]

    resp = client.post(
        "/api/seller/orders",
        json={
            "customer_name": "Rina",
            "table_number": "Meja 3",
            "items": [{"menu_item_id": data["menu_item_id"], "quantity": 2}],
        },
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Response mengembalikan field-nya (OrderResponse)
    assert body["table_number"] == "Meja 3"
    assert body["customer_name"] == "Rina"

    # Row di DB benar-benar menyimpannya (bukan cuma echo response)
    order = db_session.query(Order).filter(Order.id == body["id"]).one()
    assert order.table_number == "Meja 3"
    assert order.customer_name == "Rina"
    assert order.source == "cashier"


def test_order_kasir_tanpa_table_number_tetap_null(client, db_session, seed):
    data = seed("warung-kasir-tanpa-meja")
    token = _login(client, data["seller_email"], data["seller_password"])["access_token"]

    resp = client.post(
        "/api/seller/orders",
        json={
            "customer_name": "Eka",
            "items": [{"menu_item_id": data["menu_item_id"], "quantity": 1}],
        },
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["table_number"] is None

    order = db_session.query(Order).filter(Order.id == body["id"]).one()
    assert order.table_number is None
    assert order.customer_name == "Eka"


def test_order_customer_persist_table_number(client, db_session, seed):
    """Endpoint customer sudah benar — dipertahankan sebagai pembanding."""
    data = seed("warung-customer-meja")

    resp = client.post(
        f"/api/r/{data['slug']}/orders",
        json={
            "customer_name": "Cici",
            "table_number": "Meja 7",
            "items": [{"menu_item_id": data["menu_item_id"], "quantity": 1}],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["table_number"] == "Meja 7"

    order = db_session.query(Order).filter(Order.id == body["id"]).one()
    assert order.table_number == "Meja 7"
    assert order.customer_name == "Cici"
