from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_admin
from app.models.restaurant import Restaurant
from app.models.seller import Seller
from app.schemas.restaurant import RestaurantCreate, RestaurantUpdate, RestaurantResponse
from app.services.restaurant_service import create_restaurant_with_seller
from typing import List

router = APIRouter()


@router.get("/restaurants", response_model=List[RestaurantResponse])
def get_all_restaurants(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    """Get all restaurants — admin only."""
    return db.query(Restaurant).all()


@router.post("/restaurants", response_model=RestaurantResponse)
def create_restaurant(
    data: RestaurantCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    """Register a new restaurant and create seller account — admin only."""

    # Check if seller email already exists
    existing_seller = db.query(Seller).filter(Seller.email == data.seller_email).first()
    if existing_seller:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email seller sudah terdaftar",
        )

    return create_restaurant_with_seller(data, db)


@router.put("/restaurants/{restaurant_id}", response_model=RestaurantResponse)
def update_restaurant(
    restaurant_id: str,
    data: RestaurantUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    """Update restaurant details — admin only."""
    restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran tidak ditemukan")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(restaurant, field, value)

    db.commit()
    db.refresh(restaurant)
    return restaurant