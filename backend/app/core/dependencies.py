from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.seller import Seller
from app.models.admin import Admin

security = HTTPBearer()


def _decode_or_401(token: str) -> dict:
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def get_current_seller(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> Seller:
    """Get current logged-in seller from JWT token."""
    payload = _decode_or_401(credentials.credentials)

    user_type = payload.get("user_type")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Admin — klaim token harus cocok dengan baris di tabel `admins`
    if user_type == "admin":
        admin = db.query(Admin).filter(Admin.id == user_id).first()
        if not admin:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return {"id": admin.id, "user_type": "admin", "email": admin.email}

    seller = db.query(Seller).filter(Seller.id == user_id).first()
    if not seller:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return seller


def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> dict:
    """Hanya admin asli yang lolos.

    Klaim ``user_type`` dari payload TIDAK dipercaya sendirian: id dari token
    wajib menunjuk baris di tabel ``admins``. Token palsu / untuk user yang
    tidak ada → 403.
    """
    payload = _decode_or_401(credentials.credentials)

    if payload.get("user_type") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    admin_id = payload.get("sub")
    admin = (
        db.query(Admin).filter(Admin.id == admin_id).first() if admin_id else None
    )
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    return {"id": admin.id, "user_type": "admin", "email": admin.email}
