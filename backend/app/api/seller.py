from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timezone
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.dependencies import get_current_seller
from app.models.seller import Seller
from app.models.category import Category
from app.models.menu import MenuItem
from app.models.order import Order, OrderItem, OrderStatus
from app.models.restaurant import Restaurant
from app.schemas.menu import (
    CategoryCreate, CategoryResponse,
    MenuItemCreate, MenuItemUpdate, MenuItemResponse,
)
from app.schemas.order import OrderCreate, OrderResponse, MAX_ORDER_TOTAL
from app.schemas.restaurant import RestaurantResponse, RestaurantUpdate
from typing import List
import uuid

router = APIRouter()


# ── Restaurant ──────────────────────────────────────────

@router.get("/me", response_model=RestaurantResponse)
def get_my_restaurant(
    db: Session = Depends(get_db),
    current_seller: Seller = Depends(get_current_seller),
):
    """Get current seller's restaurant info."""
    restaurant = db.query(Restaurant).filter(
        Restaurant.id == current_seller.restaurant_id
    ).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran tidak ditemukan")
    return restaurant


@router.put("/me", response_model=RestaurantResponse)
def update_my_restaurant(
    data: RestaurantUpdate,
    db: Session = Depends(get_db),
    current_seller: Seller = Depends(get_current_seller),
):
    """Update current seller's restaurant."""
    restaurant = db.query(Restaurant).filter(
        Restaurant.id == current_seller.restaurant_id
    ).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran tidak ditemukan")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(restaurant, field, value)

    db.commit()
    db.refresh(restaurant)
    return restaurant


# ── Categories ───────────────────────────────────────────

@router.get("/categories", response_model=List[CategoryResponse])
def get_categories(
    db: Session = Depends(get_db),
    current_seller: Seller = Depends(get_current_seller),
):
    return db.query(Category).filter(
        Category.restaurant_id == current_seller.restaurant_id
    ).all()


@router.post("/categories", response_model=CategoryResponse)
def create_category(
    data: CategoryCreate,
    db: Session = Depends(get_db),
    current_seller: Seller = Depends(get_current_seller),
):
    category = Category(
        id=str(uuid.uuid4()),
        restaurant_id=current_seller.restaurant_id,
        name=data.name,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: str,
    db: Session = Depends(get_db),
    current_seller: Seller = Depends(get_current_seller),
):
    """Hapus kategori.

    Menu milik kategori TIDAK ikut terhapus (B11): `category_id` di-set NULL,
    baris menu dan riwayat order_items tetap utuh.
    """
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.restaurant_id == current_seller.restaurant_id,
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Kategori tidak ditemukan")
    db.delete(category)
    db.commit()
    return {"message": "Kategori dihapus"}


# ── Menu Items ────────────────────────────────────────────

@router.get("/menu", response_model=List[MenuItemResponse])
def get_menu(
    db: Session = Depends(get_db),
    current_seller: Seller = Depends(get_current_seller),
):
    return (
        db.query(MenuItem)
        .filter(
            MenuItem.restaurant_id == current_seller.restaurant_id,
            MenuItem.deleted_at.is_(None),  # menu soft-delete tidak tampil
        )
        .options(joinedload(MenuItem.category))
        .all()
    )


@router.post("/menu", response_model=MenuItemResponse)
def create_menu_item(
    data: MenuItemCreate,
    db: Session = Depends(get_db),
    current_seller: Seller = Depends(get_current_seller),
):
    item = MenuItem(
        id=str(uuid.uuid4()),
        restaurant_id=current_seller.restaurant_id,
        **data.model_dump(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/menu/{item_id}", response_model=MenuItemResponse)
def update_menu_item(
    item_id: str,
    data: MenuItemUpdate,
    db: Session = Depends(get_db),
    current_seller: Seller = Depends(get_current_seller),
):
    item = db.query(MenuItem).filter(
        MenuItem.id == item_id,
        MenuItem.restaurant_id == current_seller.restaurant_id,
        MenuItem.deleted_at.is_(None),
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Menu tidak ditemukan")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/menu/{item_id}")
def delete_menu_item(
    item_id: str,
    db: Session = Depends(get_db),
    current_seller: Seller = Depends(get_current_seller),
):
    """Hapus menu — SOFT-DELETE (B11).

    Baris `menu_items` tidak boleh di-hard-delete karena `order_items`
    (riwayat transaksi/laporan pendapatan) menunjuk ke menu ini dengan
    FK NOT NULL. Menu ditandai `deleted_at` + `is_available=False` sehingga
    hilang dari daftar seller & menu customer, tapi order lama tetap
    joinable.
    """
    item = db.query(MenuItem).filter(
        MenuItem.id == item_id,
        MenuItem.restaurant_id == current_seller.restaurant_id,
        MenuItem.deleted_at.is_(None),
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Menu tidak ditemukan")
    item.is_available = False
    item.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Menu dihapus"}


# ── Orders ────────────────────────────────────────────────

@router.get("/orders", response_model=List[OrderResponse])
def get_orders(
    db: Session = Depends(get_db),
    current_seller: Seller = Depends(get_current_seller),
):
    return db.query(Order).filter(
        Order.restaurant_id == current_seller.restaurant_id
    ).options(joinedload(Order.items)).order_by(Order.created_at.desc()).all()


@router.post("/orders", response_model=OrderResponse)
def create_order_cashier(
    data: OrderCreate,
    db: Session = Depends(get_db),
    current_seller: Seller = Depends(get_current_seller),
):
    """Create order manually via cashier mode — satu transaksi atomik (B8)."""
    try:
        total = 0
        order_items = []

        for item_data in data.items:
            menu_item = db.query(MenuItem).filter(
                MenuItem.id == item_data.menu_item_id,
                MenuItem.restaurant_id == current_seller.restaurant_id,
                MenuItem.is_available == True,
            ).first()
            if not menu_item:
                raise HTTPException(
                    status_code=404,
                    detail=f"Menu {item_data.menu_item_id} tidak ditemukan atau tidak tersedia",
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
            restaurant_id=current_seller.restaurant_id,
            customer_id=data.customer_id,
            customer_name=data.customer_name,
            table_number=data.table_number,
            total_price=total,
            source="cashier",
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


@router.put("/orders/{order_id}/status")
def update_order_status(
    order_id: str,
    new_status: OrderStatus,
    db: Session = Depends(get_db),
    current_seller: Seller = Depends(get_current_seller),
):
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.restaurant_id == current_seller.restaurant_id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")

    # Status terminal: order yang dibatalkan pelanggan tidak boleh
    # "dihidupkan" lagi atau diubah statusnya oleh seller.
    if order.status == OrderStatus.cancelled:
        raise HTTPException(
            status_code=409,
            detail="Order sudah dibatalkan pelanggan dan tidak bisa diubah statusnya",
        )

    order.status = new_status
    db.commit()
    return {"message": "Status diupdate", "status": new_status}