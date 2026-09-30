from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
import uuid


class Category(Base):
    __tablename__ = "categories"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    restaurant_id = Column(String, ForeignKey("restaurants.id"), nullable=False)
    name = Column(String, nullable=False)

    # Relationships
    restaurant = relationship("Restaurant", back_populates="categories")
    # TANPA delete-orphan: menu milik kategori tidak boleh ikut terhapus —
    # bisa saja menu itu punya riwayat order (order_items.menu_item_id NOT NULL).
    # Saat kategori dihapus, category_id menu di-set NULL (FK nullable).
    menu_items = relationship(
        "MenuItem", back_populates="category", cascade="save-update, merge"
    )
