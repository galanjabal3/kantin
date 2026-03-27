from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_access_token
from app.core.config import settings
from app.models.seller import Seller

security = HTTPBearer()


def get_current_seller(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> Seller:
    """Get current logged-in seller from JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise credentials_exception

    user_type = payload.get("user_type")
    user_id = payload.get("sub")

    if not user_id:
        raise credentials_exception

    # Admin — hardcoded, no DB lookup needed
    if user_type == "admin":
        return {"id": "admin", "user_type": "admin", "email": payload.get("email")}

    # Seller — lookup from DB
    seller = db.query(Seller).filter(Seller.id == user_id).first()
    if not seller:
        raise credentials_exception

    return seller


def get_current_admin(
    current_user=Depends(get_current_seller),
):
    """Only allow admin access."""
    if isinstance(current_user, dict) and current_user.get("user_type") == "admin":
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Admin access required",
    )