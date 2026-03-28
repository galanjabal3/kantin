from pydantic import BaseModel
from typing import Optional, List
from app.models.order import OrderStatus, OrderSource
from datetime import datetime


class MenuItemSimple(BaseModel):
    id: str
    name: str
    price: float

    class Config:
        from_attributes = True


class OrderItemCreate(BaseModel):
    menu_item_id: str
    quantity: int


class OrderCreate(BaseModel):
    customer_name: Optional[str] = None
    customer_id: Optional[str] = None
    table_number: Optional[str] = None
    items: List[OrderItemCreate]
    source: OrderSource = OrderSource.customer


class OrderItemResponse(BaseModel):
    id: str
    menu_item_id: str
    quantity: float
    subtotal: float
    menu_item: Optional[MenuItemSimple] = None

    class Config:
        from_attributes = True


class OrderResponse(BaseModel):
    id: str
    customer_name: Optional[str] = None
    table_number: Optional[str] = None
    total_price: float
    status: OrderStatus
    source: OrderSource
    created_at: datetime
    items: List[OrderItemResponse] = []

    class Config:
        from_attributes = True