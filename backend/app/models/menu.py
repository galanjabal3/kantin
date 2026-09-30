from sqlalchemy import Column, String, Float, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
import uuid


class MenuItem(Base):
    __tablename__ = "menu_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    restaurant_id = Column(String, ForeignKey("restaurants.id"), nullable=False)
    category_id = Column(String, ForeignKey("categories.id"), nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=False)
    image_url = Column(String, nullable=True)
    is_available = Column(Boolean, default=True)
    # Soft-delete (B11): baris TIDAK pernah di-hard-delete dari endpoint seller
    # karena riwayat transaksi (order_items) masih menunjuk ke menu ini.
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    restaurant = relationship("Restaurant", back_populates="menu_items")
    category = relationship("Category", back_populates="menu_items")
    # TANPA delete-orphan: order_items menyimpan riwayat keuangan dan
    # menu_item_id NOT NULL → menghapus menu akan membuang laporan pendapatan.
    # Endpoint DELETE menu memakai soft-delete (lihat app/api/seller.py).
    order_items = relationship(
        "OrderItem", back_populates="menu_item", cascade="save-update, merge"
    )
