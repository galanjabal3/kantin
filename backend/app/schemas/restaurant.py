from pydantic import BaseModel
from typing import Optional
from app.models.restaurant import RestaurantMode


class RestaurantCreate(BaseModel):
    name: str
    description: Optional[str] = None
    mode: RestaurantMode = RestaurantMode.full
    seller_email: str
    seller_password: str


class RestaurantUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    mode: Optional[RestaurantMode] = None
    is_active: Optional[bool] = None
    is_open: Optional[bool] = None
    require_otp: Optional[bool] = None
    enable_table_number: Optional[bool] = None


class RestaurantResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    logo_url: Optional[str] = None
    mode: RestaurantMode
    is_active: bool
    is_open: bool
    require_otp: bool = False
    enable_table_number: bool = False

    class Config:
        from_attributes = True