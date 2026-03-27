from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.core.config import settings
from app.models.seller import Seller
from app.schemas.auth import LoginRequest, TokenResponse

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Login for seller and admin."""

    # Check if admin
    if (
        request.email == settings.ADMIN_EMAIL
        and request.password == settings.ADMIN_PASSWORD
    ):
        token = create_access_token(
            {"sub": "admin", "user_type": "admin", "email": request.email}
        )
        return TokenResponse(access_token=token, user_type="admin")

    # Check if seller
    seller = db.query(Seller).filter(Seller.email == request.email).first()
    if not seller or not verify_password(request.password, seller.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email atau password salah",
        )

    token = create_access_token(
        {
            "sub": seller.id,
            "user_type": "seller",
            "restaurant_id": seller.restaurant_id,
        }
    )

    return TokenResponse(
        access_token=token,
        user_type="seller",
        restaurant_id=seller.restaurant_id,
        restaurant_slug=seller.restaurant.slug if seller.restaurant else None,
    )