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

    # Relationships — semua anak dimiliki resto, ikut terhapus (B9)
    seller = relationship(
        "Seller", back_populates="restaurant", uselist=False,
        cascade="all, delete-orphan",
    )
    categories = relationship(
        "Category", back_populates="restaurant", cascade="all, delete-orphan"
    )
    menu_items = relationship(
        "MenuItem", back_populates="restaurant", cascade="all, delete-orphan"
    )
    orders = relationship(
        "Order", back_populates="restaurant", cascade="all, delete-orphan"
    )
    # PERINGATAN: cascade di sini menghapus riwayat keuangan (orders → order_items)
    # secara utuh. Saat ini TIDAK ada endpoint hapus restoran (admin hanya punya
    # POST/PUT /api/admin/restaurants) — jika suatu hari endpoint DELETE restoran
    # dibuat, pastikan laporan pendapatan di-snapshot/diarsipkan dulu sebelum
    # restoran dihapus, atau turunkan cascade menjadi "save-update, merge".