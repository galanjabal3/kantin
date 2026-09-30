from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class RefreshToken(Base):
    """Refresh token opaque (disimpan sebagai SHA-256, bukan token mentah)."""

    __tablename__ = "refresh_tokens"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    token_hash = Column(String, unique=True, nullable=False, index=True)
    # Satu "keluarga" token lahir dari satu login; dipakai untuk reuse detection.
    family_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    user_type = Column(String, nullable=False)
    email = Column(String, nullable=True)
    restaurant_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
