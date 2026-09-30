from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class Admin(Base):
    """Akun admin — klaim `user_type=admin` pada token selalu divalidasi ke baris ini."""

    __tablename__ = "admins"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
