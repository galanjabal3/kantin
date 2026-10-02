"""Seed data demo idempoten untuk DB lokal.

Cara menjalankan (dari folder ``backend``):

    python scripts/seed_demo.py
    python -m scripts.seed_demo

Aman dijalankan berulang: resto/kategori/menu yang sudah ada tidak diduplikat,
melainkan disinkronkan ke kondisi ideal demo. Order basi (pending lama, bukan
order seed) dibersihkan, dan 3 order contoh dibuat jika belum ada.
"""

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _load_env_file(path: Path) -> None:
    """Isi DATABASE_URL dari backend/.env bila belum ada di environment.

    pydantic-settings membaca ``.env`` relatif terhadap cwd — kalau script
    dijalankan dari folder lain, tanpa hook ini aplikasi diam-diam jatuh ke
    SQLite lokal. Env var selalu menang atas file .env.
    """
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file(BACKEND_DIR / ".env")

from app.core.database import DATABASE_URL, SessionLocal  # noqa: E402
from app.core.security import hash_password, verify_password  # noqa: E402
from app.models.category import Category  # noqa: E402
from app.models.menu import MenuItem  # noqa: E402
from app.models.order import Order, OrderItem, OrderSource, OrderStatus  # noqa: E402
from app.models.restaurant import Restaurant, RestaurantMode  # noqa: E402
from app.models.seller import Seller  # noqa: E402
from app.schemas.restaurant import RestaurantCreate  # noqa: E402
from app.services.restaurant_service import create_restaurant_with_seller  # noqa: E402

RESTO_SLUG = "kantin-demo"
RESTO_NAME = "Kantin Demo"
RESTO_DESCRIPTION = (
    "Kantin demo serba ada: nasi goreng, ayam geprek, es teh, sampai pisang "
    "goreng — semua siap dipesan dalam hitungan menit."
)
SELLER_EMAIL = "seller@kantin.test"
SELLER_PASSWORD = "Demo1234!"

CATEGORIES = ["Makanan", "Minuman", "Camilan"]

# (kategori, nama, harga, deskripsi)
MENU_ITEMS = [
    ("Makanan", "Nasi Goreng", 15000, "Nasi goreng spesial telur dan sayur."),
    ("Makanan", "Ayam Geprek", 18000, "Ayam goreng digeprek sambal bawang."),
    ("Makanan", "Nasi Ayam Penyet", 17000, "Ayam penyet dengan sambal terasi."),
    ("Makanan", "Mie Goreng", 12000, "Mie goreng khas kantin dengan telur."),
    ("Makanan", "Nasi Rendang", 22000, "Nasi dengan rendang sapi empuk."),
    ("Minuman", "Es Teh", 4000, "Teh manis dingin segar."),
    ("Minuman", "Kopi Susu", 10000, "Es kopi susu gula aren."),
    ("Minuman", "Es Jeruk", 5000, "Jeruk peras dingin menyegarkan."),
    ("Camilan", "Pisang Goreng", 8000, "Pisang goreng renyah di luar, lembut di dalam."),
    ("Camilan", "Tahu Goreng", 6000, "Tahu goreng gurih dengan sambal kecap."),
    ("Camilan", "Roti Bakar", 9000, "Roti bakar cokelat keju."),
]

# Nama pelanggan khusus order seed — dipakai supaya tidak dihapus oleh
# pembersih order basi dan tidak diduplikasi saat script dijalankan ulang.
SEED_ORDERS = [
    {
        "customer_name": "Budi Santoso",
        "table_number": "3",
        "status": OrderStatus.pending,
        "minutes_ago": 5,
        "items": [("Nasi Goreng", 2), ("Es Teh", 2)],
    },
    {
        "customer_name": "Siti Aminah",
        "table_number": "5",
        "status": OrderStatus.preparing,
        "minutes_ago": 20,
        "items": [("Ayam Geprek", 1), ("Kopi Susu", 1), ("Pisang Goreng", 1)],
    },
    {
        "customer_name": "Rudi Hartono",
        "table_number": "2",
        "status": OrderStatus.done,
        "minutes_ago": 45,
        "items": [("Mie Goreng", 1), ("Es Jeruk", 1)],
    },
]
SEED_ORDER_NAMES = {o["customer_name"] for o in SEED_ORDERS}

# Order pending yang lebih tua dari ini (dan bukan order seed) dianggap basi.
STALE_PENDING_MINUTES = 30


def _rp(amount: float) -> str:
    """Format rupiah: Rp15.000 (titik sebagai pemisah ribuan)."""
    return f"Rp{amount:,.0f}".replace(",", ".")


def _as_utc(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)


def ensure_restaurant(db) -> Restaurant:
    restaurant = db.query(Restaurant).filter(Restaurant.slug == RESTO_SLUG).first()

    if restaurant is None:
        data = RestaurantCreate(
            name=RESTO_NAME,
            description=RESTO_DESCRIPTION,
            mode=RestaurantMode.full,
            seller_email=SELLER_EMAIL,
            seller_password=SELLER_PASSWORD,
        )
        restaurant = create_restaurant_with_seller(data, db)
        # Slug harus persis RESTO_SLUG; kalau service memberi suffix (mis.
        # slug lama sudah terpakai), perbaiki agar URL demo tetap stabil.
        if restaurant.slug != RESTO_SLUG:
            restaurant.slug = RESTO_SLUG
            db.commit()
        print(f"[resto] DIBUAT: {restaurant.name} (slug={restaurant.slug})")
    else:
        print(f"[resto] sudah ada: {restaurant.name} (slug={restaurant.slug})")

    changed = []
    expected = {
        "name": RESTO_NAME,
        "description": RESTO_DESCRIPTION,
        "mode": RestaurantMode.full,
        "is_open": True,
        "is_active": True,
        "enable_table_number": True,
        "require_otp": False,
    }
    for field, value in expected.items():
        if getattr(restaurant, field) != value:
            setattr(restaurant, field, value)
            changed.append(field)
    if changed:
        db.commit()
        print(f"[resto] diperbarui: {', '.join(changed)}")
    return restaurant


def ensure_seller(db, restaurant: Restaurant) -> Seller:
    seller = db.query(Seller).filter(Seller.email == SELLER_EMAIL).first()

    if seller is None:
        owner = (
            db.query(Seller).filter(Seller.restaurant_id == restaurant.id).first()
        )
        if owner is not None:
            owner.email = SELLER_EMAIL
            owner.hashed_password = hash_password(SELLER_PASSWORD)
            db.commit()
            print(f"[seller] diperbarui: {SELLER_EMAIL} (akun lama di-reset)")
            return owner
        seller = Seller(
            id=str(uuid.uuid4()),
            restaurant_id=restaurant.id,
            email=SELLER_EMAIL,
            hashed_password=hash_password(SELLER_PASSWORD),
        )
        db.add(seller)
        db.commit()
        db.refresh(seller)
        print(f"[seller] DIBUAT: {SELLER_EMAIL}")
        return seller

    if seller.restaurant_id != restaurant.id:
        seller.restaurant_id = restaurant.id
    if not verify_password(SELLER_PASSWORD, seller.hashed_password):
        seller.hashed_password = hash_password(SELLER_PASSWORD)
        db.commit()
        print(f"[seller] sudah ada: {SELLER_EMAIL} (password di-reset)")
    else:
        db.commit()
        print(f"[seller] sudah ada: {SELLER_EMAIL}")
    return seller


def ensure_categories(db, restaurant: Restaurant) -> dict:
    existing = {
        c.name: c
        for c in db.query(Category).filter(Category.restaurant_id == restaurant.id)
    }
    categories = {}
    for name in CATEGORIES:
        category = existing.get(name)
        if category is None:
            category = Category(
                id=str(uuid.uuid4()),
                restaurant_id=restaurant.id,
                name=name,
            )
            db.add(category)
            db.flush()
            print(f"[kategori] DIBUAT: {name}")
        else:
            print(f"[kategori] sudah ada: {name}")
        categories[name] = category
    db.commit()
    return categories


def ensure_menu(db, restaurant: Restaurant, categories: dict) -> dict:
    existing = {
        m.name: m
        for m in db.query(MenuItem).filter(MenuItem.restaurant_id == restaurant.id)
    }
    menu = {}
    for category_name, name, price, description in MENU_ITEMS:
        item = existing.get(name)
        if item is None:
            item = MenuItem(
                id=str(uuid.uuid4()),
                restaurant_id=restaurant.id,
                category_id=categories[category_name].id,
                name=name,
                description=description,
                price=float(price),
                is_available=True,
            )
            db.add(item)
            print(f"[menu] DIBUAT: {name} — {_rp(price)}")
        else:
            changed = []
            if item.deleted_at is not None:
                item.deleted_at = None
                changed.append("diaktifkan kembali")
            if item.category_id != categories[category_name].id:
                item.category_id = categories[category_name].id
                changed.append("kategori")
            if item.price != float(price):
                item.price = float(price)
                changed.append("harga")
            if item.description != description:
                item.description = description
                changed.append("deskripsi")
            if item.is_available is not True:
                item.is_available = True
                changed.append("is_available")
            if changed:
                print(f"[menu] diperbarui ({', '.join(changed)}): {name}")
            else:
                print(f"[menu] sudah ada: {name}")
        menu[name] = item
    db.commit()
    return menu


def cleanup_stale_orders(db) -> None:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=STALE_PENDING_MINUTES)
    stale = (
        db.query(Order)
        .filter(Order.status == OrderStatus.pending)
        .filter(Order.customer_name.notin_(SEED_ORDER_NAMES) | Order.customer_name.is_(None))
        .all()
    )
    removed = 0
    for order in stale:
        created = order.created_at or now
        if _as_utc(created) >= cutoff:
            continue
        label = order.customer_name or "(tanpa nama)"
        db.delete(order)  # order_items ikut terhapus (cascade)
        print(
            f"[order] HAPUS basi: {label} {_rp(order.total_price)} "
            f"pending sejak {_as_utc(created).strftime('%Y-%m-%d %H:%M %Z')}"
        )
        removed += 1
    if removed == 0:
        print("[order] tidak ada order basi untuk dibersihkan")
    db.commit()


def ensure_seed_orders(db, restaurant: Restaurant, menu: dict) -> None:
    existing_names = {
        o.customer_name
        for o in db.query(Order).filter(Order.restaurant_id == restaurant.id)
    }
    for spec in SEED_ORDERS:
        if spec["customer_name"] in existing_names:
            print(f"[order] sudah ada: {spec['customer_name']} ({spec['status'].value})")
            continue

        total = 0.0
        lines = []
        for item_name, quantity in spec["items"]:
            item = menu[item_name]
            subtotal = item.price * quantity
            total += subtotal
            lines.append((item, quantity, subtotal))

        order = Order(
            id=str(uuid.uuid4()),
            restaurant_id=restaurant.id,
            customer_name=spec["customer_name"],
            table_number=spec["table_number"],
            total_price=total,
            status=spec["status"],
            source=OrderSource.customer,
            created_at=datetime.now(timezone.utc)
            - timedelta(minutes=spec["minutes_ago"]),
        )
        db.add(order)
        db.flush()
        for item, quantity, subtotal in lines:
            db.add(
                OrderItem(
                    id=str(uuid.uuid4()),
                    order_id=order.id,
                    menu_item_id=item.id,
                    quantity=quantity,
                    subtotal=subtotal,
                    menu_item_name=item.name,
                    unit_price=item.price,
                )
            )
        db.commit()
        names = ", ".join(f"{n} x{q}" for n, q in spec["items"])
        print(
            f"[order] DIBUAT ({spec['status'].value}): {spec['customer_name']} — "
            f"{names} = {_rp(total)}"
        )


def main() -> None:
    if not DATABASE_URL.startswith(("postgres://", "postgresql://")):
        raise SystemExit(
            f"DATABASE_URL bukan Postgres ({DATABASE_URL!r}) — dibatalkan agar "
            "tidak salah men-seed database SQLite."
        )
    print(f"DB: {DATABASE_URL}")

    db = SessionLocal()
    try:
        restaurant = ensure_restaurant(db)
        ensure_seller(db, restaurant)
        categories = ensure_categories(db, restaurant)
        menu = ensure_menu(db, restaurant, categories)
        cleanup_stale_orders(db)
        ensure_seed_orders(db, restaurant, menu)

        counts = {
            "kategori": db.query(Category)
            .filter(Category.restaurant_id == restaurant.id)
            .count(),
            "menu": db.query(MenuItem)
            .filter(
                MenuItem.restaurant_id == restaurant.id,
                MenuItem.deleted_at.is_(None),
            )
            .count(),
            "seller": db.query(Seller)
            .filter(Seller.restaurant_id == restaurant.id)
            .count(),
            "order": db.query(Order)
            .filter(Order.restaurant_id == restaurant.id)
            .count(),
        }
        print(
            "RINGKASAN — total resto di DB="
            + str(db.query(Restaurant).count())
            + "; kantin-demo → "
            + ", ".join(f"{k}={v}" for k, v in counts.items())
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
