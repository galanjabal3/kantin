"""B8: transaksi order harus atomik — gagal di tengah = tidak ada data tersimpan."""
from sqlalchemy.orm import Session

from app.models.order import Order, OrderItem


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _boom(self, *args, **kwargs):
    raise RuntimeError("simulasi kegagalan database di tengah transaksi")


def test_item_tidak_valid_tidak_menghasilkan_order_setengah_jadi(
    client, db_session, seed
):
    data = seed("warung-validasi")

    resp = client.post(
        f"/api/r/{data['slug']}/orders",
        json={
            "customer_name": "Cici",
            "items": [
                {"menu_item_id": data["menu_item_id"], "quantity": 1},
                {"menu_item_id": "menu-yang-tidak-ada", "quantity": 1},
            ],
        },
    )
    assert resp.status_code == 404

    assert db_session.query(Order).count() == 0
    assert db_session.query(OrderItem).count() == 0


def test_kegagalan_di_tengah_transaksi_customer_di_rollback(
    client, db_session, seed, monkeypatch
):
    data = seed("warung-rollback")

    monkeypatch.setattr(Session, "flush", _boom)
    resp = client.post(
        f"/api/r/{data['slug']}/orders",
        json={
            "customer_name": "Dedi",
            "items": [{"menu_item_id": data["menu_item_id"], "quantity": 1}],
        },
    )
    assert resp.status_code == 500

    monkeypatch.undo()
    assert db_session.query(Order).count() == 0
    assert db_session.query(OrderItem).count() == 0


def test_kegagalan_di_tengah_transaksi_kasir_di_rollback(
    client, db_session, seed, monkeypatch
):
    data = seed("warung-rollback-kasir")
    login = client.post(
        "/api/auth/login",
        json={"email": data["seller_email"], "password": data["seller_password"]},
    )
    assert login.status_code == 200, login.text

    monkeypatch.setattr(Session, "flush", _boom)
    resp = client.post(
        "/api/seller/orders",
        json={
            "customer_name": "Eka",
            "items": [{"menu_item_id": data["menu_item_id"], "quantity": 1}],
        },
        headers=_auth(login.json()["access_token"]),
    )
    assert resp.status_code == 500

    monkeypatch.undo()
    assert db_session.query(Order).count() == 0
    assert db_session.query(OrderItem).count() == 0


def test_order_kasir_normal_tersimpan_bersama_items(client, db_session, seed):
    data = seed("warung-kasir-sukses")
    login = client.post(
        "/api/auth/login",
        json={"email": data["seller_email"], "password": data["seller_password"]},
    )
    assert login.status_code == 200, login.text

    resp = client.post(
        "/api/seller/orders",
        json={
            "customer_name": "Gita",
            "items": [{"menu_item_id": data["menu_item_id"], "quantity": 3}],
        },
        headers=_auth(login.json()["access_token"]),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["total_price"] == data["price"] * 3
    assert len(resp.json()["items"]) == 1

    assert db_session.query(Order).count() == 1
    assert db_session.query(OrderItem).count() == 1
