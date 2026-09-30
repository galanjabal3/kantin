import secrets
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.ratelimit import (
    limiter,
    clear_login_failures,
    login_email_throttled,
    register_login_failure,
)
from app.core.security import verify_password, create_access_token, hash_password
from app.core.config import settings
from app.core.refresh import create_refresh_token, rotate_refresh_token
from app.models.seller import Seller
from app.models.admin import Admin
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest, RefreshResponse

router = APIRouter()


def _secret_equals(provided: str, expected: str) -> bool:
    """Perbandingan credential constant-time (secrets.compare_digest)."""
    return secrets.compare_digest(
        provided.encode("utf-8"), expected.encode("utf-8")
    )


def _issue_token_pair(
    db: Session, claims: dict, family_id: str | None = None
) -> tuple[str, str]:
    """Terbitkan access JWT + refresh token opaque dalam satu commit."""
    access_token = create_access_token(claims)
    refresh_token = create_refresh_token(
        db,
        user_id=claims["sub"],
        user_type=claims.get("user_type", "seller"),
        email=claims.get("email"),
        restaurant_id=claims.get("restaurant_id"),
        family_id=family_id,
    )
    db.commit()
    return access_token, refresh_token


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    """Login for seller and admin.

    Dilindungi dua lapis (B14): rate limit 5/menit per-IP (slowapi, bucket
    (IP, path)) dan throttle per-email — 10 login gagal/menit untuk1 email
    → 429, agar brute-force tidak bisa disebarkan ke banyak IP.
    """
    if login_email_throttled(payload.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Terlalu banyak percobaan login untuk email ini, coba lagi nanti",
        )

    # Check if admin — perbandingan credential constant-time
    if (
        settings.ADMIN_EMAIL
        and settings.ADMIN_PASSWORD
        and _secret_equals(payload.email, settings.ADMIN_EMAIL)
        and _secret_equals(payload.password, settings.ADMIN_PASSWORD)
    ):
        admin = db.query(Admin).filter(Admin.email == payload.email).first()
        if admin is None:
            admin = Admin(
                id=str(uuid.uuid4()),
                email=payload.email,
                hashed_password=hash_password(payload.password),
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
        elif not verify_password(settings.ADMIN_PASSWORD, admin.hashed_password):
            admin.hashed_password = hash_password(payload.password)
            db.commit()

        claims = {"sub": admin.id, "user_type": "admin", "email": admin.email}
        access_token, refresh_token = _issue_token_pair(db, claims)
        clear_login_failures(payload.email)
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user_type="admin",
        )

    # Check if seller
    seller = db.query(Seller).filter(Seller.email == payload.email).first()
    if not seller or not verify_password(payload.password, seller.hashed_password):
        register_login_failure(payload.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email atau password salah",
        )

    claims = {
        "sub": seller.id,
        "user_type": "seller",
        "restaurant_id": seller.restaurant_id,
    }
    access_token, refresh_token = _issue_token_pair(db, claims)
    clear_login_failures(payload.email)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_type="seller",
        restaurant_id=seller.restaurant_id,
        restaurant_slug=seller.restaurant.slug if seller.restaurant else None,
    )


@router.post("/refresh", response_model=RefreshResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    """Rotasi refresh token → pasangan token baru.

    Token lama langsung ditandai used; dipakai ulang = reuse detection → 401.
    """
    result = rotate_refresh_token(db, payload.refresh_token)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token tidak valid atau kedaluwarsa",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(result["claims"])
    return RefreshResponse(
        access_token=access_token,
        refresh_token=result["refresh_token"],
    )
