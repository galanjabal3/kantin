from sqlalchemy import Column, String, Boolean, Text, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base
import uuid
import enum


class RestaurantMode(str, enum.Enum):
    full = "full"
    cashier = "cashier"


class Restaurant(Base):
    __tablename__ = "restaurants"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    logo_url = Column(String, nullable=True)
    mode = Column(Enum(RestaurantMode), default=RestaurantMode.full)
    is_active = Column(Boolean, default=True)
    is_open = Column(Boolean, default=True)
    require_otp = Column(Boolean, default=False)
    enable_table_number = Column(Boolean, default=False)

    # Relationships
    seller = relationship("Seller", back_populates="restaurant", uselist=False)
    categories = relationship("Category", back_populates="restaurant")
    menu_items = relationship("MenuItem", back_populates="restaurant")
    orders = relationship("Order", back_populates="restaurant")