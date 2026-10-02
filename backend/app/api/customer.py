from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.ratelimit import limiter, menu_rate_limit, order_rate_limit
from app.models.restaurant import Restaurant
from app.models.menu import MenuItem
from app.models.order import Order, OrderItem, OrderSource, OrderStatus
from app.models.customer import Customer
from app.schemas.order import OrderCreate, OrderResponse, MAX_ORDER_TOTAL
from app.schemas.menu import MenuItemResponse
from app.schemas.restaurant import RestaurantResponse
from typing import List, Optional
import uuid

router = APIRouter()


@router.get("/{slug}", response_model=RestaurantResponse)
def get_restaurant(slug: str, db: Session = Depends(get_db)):
    """Get restaurant info by slug."""
    restaurant = db.query(Restaurant).filter(
        Restaurant.slug == slug,
        Restaurant.is_active == True,
    ).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran tidak ditemukan")
    return restaurant


@router.get("/{slug}/menu", response_model=List[MenuItemResponse])
@limiter.limit(menu_rate_limit)
def get_restaurant_menu(
    request: Request,
    slug: str,
    category_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get menu items for a restaurant, optionally filtered by category."""
    restaurant = db.query(Restaurant).filter(
        Restaurant.slug == slug,
        Restaurant.is_active == True,
    ).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran tidak ditemukan")

    query = db.query(MenuItem).filter(
        MenuItem.restaurant_id == restaurant.id,
        MenuItem.is_available == True,
        MenuItem.deleted_at.is_(None),  # soft-delete tidak boleh tampil
    ).options(joinedload(MenuItem.category))

    if category_id:
        query = query.filter(MenuItem.category_id == category_id)

    return query.all()


@router.post("/{slug}/orders", response_model=OrderResponse)
@limiter.limit(order_rate_limit)
def create_order(
    request: Request,
    slug: str,
    data: OrderCreate,
    db: Session = Depends(get_db),
):
    """Create a new order from customer — satu transaksi atomik (B8)."""
    try:
        restaurant = db.query(Restaurant).filter(
            Restaurant.slug == slug,
            Restaurant.is_active == True,
            Restaurant.is_open == True,
        ).first()
        if not restaurant:
            raise HTTPException(
                status_code=404, detail="Restoran tidak ditemukan atau sedang tutup"
            )

        # Validasi SEMUA item dulu — belum ada baris yang ditulis ke DB.
        total = 0
        order_items = []

        for item_data in data.items:
            menu_item = db.query(MenuItem).filter(
                MenuItem.id == item_data.menu_item_id,
                MenuItem.restaurant_id == restaurant.id,
                MenuItem.is_available == True,
            ).first()
            if not menu_item:
                raise HTTPException(
                    status_code=404,
                    detail=f"Menu tidak tersedia",
                )
            subtotal = menu_item.price * item_data.quantity
            total += subtotal
            order_items.append(
                (menu_item, item_data.quantity, subtotal, menu_item.name, menu_item.price)
            )

        if total > MAX_ORDER_TOTAL:
            raise HTTPException(
                status_code=400,
                detail="Total pesanan melebihi batas maksimum (Rp1.000.000.000)",
            )

        order = Order(
            id=str(uuid.uuid4()),
            restaurant_id=restaurant.id,
            customer_id=data.customer_id,
            customer_name=data.customer_name,
            table_number=data.table_number,
            total_price=total,
            source=OrderSource.customer,
        )
        db.add(order)
        db.flush()

        for menu_item, quantity, subtotal, item_name, item_price in order_items:
            db.add(OrderItem(
                id=str(uuid.uuid4()),
                order_id=order.id,
                menu_item_id=menu_item.id,
                quantity=quantity,
                subtotal=subtotal,
                menu_item_name=item_name,
                unit_price=item_price,
            ))

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Gagal membuat pesanan")

    db.refresh(order)
    return order


def _find_order_by_slug(db: Session, slug: str, order_id: str) -> Optional[Order]:
    """Cari order yang di-join ke restoran dengan `slug` cocok (guard IDOR).

    Dipakai bersama oleh track status dan pembatalan: order milik restoran
    lain / id yang tidak ada → None → 404 (jangan bocorkan keberadaan order).
    """
    return (
        db.query(Order)
        .join(Restaurant, Order.restaurant_id == Restaurant.id)
        .filter(Order.id == order_id, Restaurant.slug == slug)
        .options(joinedload(Order.items))
        .first()
    )


@router.get("/{slug}/orders/{order_id}", response_model=OrderResponse)
def get_order_status(
    slug: str,
    order_id: str,
    db: Session = Depends(get_db),
):
    """Get order status — for customer to track their order.

    Order hanya boleh dibaca lewat slug restoran pemiliknya (fix IDOR / B4).
    """
    order = _find_order_by_slug(db, slug, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
    return order


@router.post("/{slug}/orders/{order_id}/cancel", response_model=OrderResponse)
@limiter.limit(order_rate_limit)
def cancel_order(
    request: Request,
    slug: str,
    order_id: str,
    db: Session = Depends(get_db),
):
    """Batalkan pesanan pelanggan — persist ke DB (bukan buang sesi client).

    Kontrak:
      - 200 + OrderResponse : order masih `pending` → jadi `cancelled`
      - 200 + OrderResponse : sudah `cancelled`      → idempoten (retry aman)
      - 409                 : `preparing`/`ready`/`done` → sudah diproses
      - 404                 : order tidak ada / slug tidak cocok (guard IDOR)
    """
    order = _find_order_by_slug(db, slug, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")

    # Idempoten: klik dobel / retry setelah koneksi pulih tetap 200 dan
    # mengembalikan order apa adanya.
    if order.status == OrderStatus.cancelled:
        return order

    if order.status != OrderStatus.pending:
        raise HTTPException(
            status_code=409,
            detail="Pesanan sudah diproses penjual dan tidak bisa dibatalkan",
        )

    order.status = OrderStatus.cancelled
    db.commit()
    db.refresh(order)
    return order
