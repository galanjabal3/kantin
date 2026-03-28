from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.models.restaurant import Restaurant
from app.models.menu import MenuItem
from app.models.order import Order, OrderItem, OrderSource
from app.models.customer import Customer
from app.schemas.order import OrderCreate, OrderResponse
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
def get_restaurant_menu(
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
    ).options(joinedload(MenuItem.category))

    if category_id:
        query = query.filter(MenuItem.category_id == category_id)

    return query.all()


@router.post("/{slug}/orders", response_model=OrderResponse)
def create_order(
    slug: str,
    data: OrderCreate,
    db: Session = Depends(get_db),
):
    """Create a new order from customer."""
    restaurant = db.query(Restaurant).filter(
        Restaurant.slug == slug,
        Restaurant.is_active == True,
        Restaurant.is_open == True,
    ).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran tidak ditemukan atau sedang tutup")

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
        order_items.append((menu_item, item_data.quantity, subtotal))

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

    for menu_item, quantity, subtotal in order_items:
        db.add(OrderItem(
            id=str(uuid.uuid4()),
            order_id=order.id,
            menu_item_id=menu_item.id,
            quantity=quantity,
            subtotal=subtotal,
        ))

    db.commit()
    db.refresh(order)
    return order


@router.get("/{slug}/orders/{order_id}", response_model=OrderResponse)
def get_order_status(
    slug: str,
    order_id: str,
    db: Session = Depends(get_db),
):
    """Get order status — for customer to track their order."""
    order = db.query(Order).filter(
        Order.id == order_id,
    ).options(joinedload(Order.items)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
    return order