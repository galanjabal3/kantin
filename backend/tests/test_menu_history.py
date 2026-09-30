"""B11: menghapus menu/kategori tidak boleh membuang riwayat transaksi.

Sebelumnya cascade "all, delete-orphan" pada MenuItem.order_items &
Category.menu_items menghapus baris order_items (data keuangan) saat seller
menekan tombol "Hapus menu". Sekarang: snapshot di order_items + soft-delete
menu + kategori dihapus tanpa menyentuh menu miliknya.
"""
from app.models.menu import MenuItem
from app.models.order import Order, OrderItem
from app.models.category import Category


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(client, email: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _buat_order(client, slug: str, menu_item_id: str, qty: int = 2) -> str:
    resp = client.post(
        f"/api/r/{slug}/orders",
        json={
            "customer_name": "Andi",
            "table_number": "3",
            "items": [{"menu_item_id": menu_item_id, "quantity": qty}],
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_hapus_menu_punya_riwayat_riwayat_transaksi_selamat(
    client, db_session, seed
):
    data = seed("warung-hapus-menu")
    token = _login(client, data["seller_email"], data["seller_password"])["access_token"]
    order_id = _buat_order(client, data["slug"], data["menu_item_id"])

    assert db_session.query(OrderItem).count() == 1

    resp = client.delete(
        f"/api/seller/menu/{data['menu_item_id']}", headers=_auth(token)
    )
    assert resp.status_code == 200, resp.text

    # riwayat transaksi TIDAK hilang
    assert db_session.query(OrderItem).count() == 1
    assert db_session.query(Order).count() == 1

    # menu hanya soft-delete — barisnya masih ada untuk join order lama
    menu = (
        db_session.query(MenuItem)
        .filter(MenuItem.id == data["menu_item_id"])
        .one()
    )
    assert menu.deleted_at is not None
    assert menu.is_available is False

    # hilang dari menu seller & menu customer
    assert client.get("/api/seller/menu", headers=_auth(token)).json() == []
    assert client.get(f"/api/r/{data['slug']}/menu").json() == []

    # laporan tetap membaca snapshot nama & harga satuan
    item = db_session.query(OrderItem).filter(OrderItem.order_id == order_id).one()
    assert item.menu_item_name == "Nasi Goreng"
    assert item.unit_price == data["price"]

    # order lama tetap joinable: nama menu dari snapshot maupun join menu
    order = (
        client.get(f"/api/r/{data['slug']}/orders/{order_id}").json()
    )
    assert order["items"][0]["menu_item_name"] == "Nasi Goreng"
    assert order["items"][0]["unit_price"] == data["price"]
    assert order["items"][0]["menu_item"]["name"] == "Nasi Goreng"


def test_hapus_menu_tanpa_riwayat_juga_soft_delete(client, db_session, seed):
    data = seed("warung-hapus-menu-kosong")
    token = _login(client, data["seller_email"], data["seller_password"])["access_token"]

    resp = client.delete(
        f"/api/seller/menu/{data['menu_item_id']}", headers=_auth(token)
    )
    assert resp.status_code == 200

    assert db_session.query(OrderItem).count() == 0
    assert client.get("/api/seller/menu", headers=_auth(token)).json() == []
    assert client.get(f"/api/r/{data['slug']}/menu").json() == []


def test_menu_soft_delete_tidak_bisa_dipesan_lagi(client, seed):
    data = seed("warung-tidak-bisa-pesan")
    token = _login(client, data["seller_email"], data["seller_password"])["access_token"]
    client.delete(f"/api/seller/menu/{data['menu_item_id']}", headers=_auth(token))

    resp = client.post(
        f"/api/r/{data['slug']}/orders",
        json={
            "customer_name": "Budi",
            "items": [{"menu_item_id": data["menu_item_id"], "quantity": 1}],
        },
    )
    assert resp.status_code == 404


def test_hapus_kategori_dengan_menu_berriwayat_riwayat_selamat(
    client, db_session, seed
):
    data = seed("warung-hapus-kategori")
    token = _login(client, data["seller_email"], data["seller_password"])["access_token"]
    order_id = _buat_order(client, data["slug"], data["menu_item_id"])

    resp = client.delete(
        f"/api/seller/categories/{data['category_id']}", headers=_auth(token)
    )
    assert resp.status_code == 200, resp.text

    # riwayat & menu selamat — menu cuma kehilangan kategorinya
    assert db_session.query(OrderItem).count() == 1
    assert db_session.query(Order).count() == 1
    assert db_session.query(MenuItem).count() == 1
    assert db_session.query(Category).count() == 0
    assert db_session.query(MenuItem).first().category_id is None

    # snapshot laporan tetap terbaca
    item = db_session.query(OrderItem).filter(OrderItem.order_id == order_id).one()
    assert item.menu_item_name == "Nasi Goreng"


def test_hapus_menu_kedua_kali_ditolak_404(client, seed):
    data = seed("warung-hapus-duplikat")
    token = _login(client, data["seller_email"], data["seller_password"])["access_token"]

    assert (
        client.delete(f"/api/seller/menu/{data['menu_item_id']}", headers=_auth(token))
        .status_code
        == 200
    )
    assert (
        client.delete(f"/api/seller/menu/{data['menu_item_id']}", headers=_auth(token))
        .status_code
        == 404
    )
