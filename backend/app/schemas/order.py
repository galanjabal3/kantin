from pydantic import BaseModel, Field
from typing import Optional, List
from app.models.order import OrderStatus, OrderSource
from datetime import datetime

# Batas masuk akal untuk order kantin (B12)
MAX_QUANTITY_PER_ITEM = 100
MAX_ITEMS_PER_ORDER = 50
MAX_ORDER_TOTAL = 1_000_000_000  # Rp1.000.000.000


class MenuItemSimple(BaseModel):
    id: str
    name: str
    price: float

    class Config:
        from_attributes = True


class OrderItemCreate(BaseModel):
    menu_item_id: str
    quantity: int = Field(..., ge=1, le=MAX_QUANTITY_PER_ITEM)


class OrderCreate(BaseModel):
    customer_name: Optional[str] = None
    customer_id: Optional[str] = None
    table_number: Optional[str] = None
    items: List[OrderItemCreate] = Field(
        ..., min_length=1, max_length=MAX_ITEMS_PER_ORDER
    )
    source: OrderSource = OrderSource.customer


class OrderItemResponse(BaseModel):
    id: str
    menu_item_id: str
    quantity: float
    subtotal: float
    # Snapshot nama & harga satuan saat order dibuat (tetap terbaca walau
    # menu sudah di-soft-delete)
    menu_item_name: Optional[str] = None
    unit_price: Optional[float] = None
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