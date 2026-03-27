import re
import uuid
from sqlalchemy.orm import Session
from app.models.restaurant import Restaurant
from app.models.seller import Seller
from app.core.security import hash_password


def generate_slug(name: str, db: Session) -> str:
    """Generate unique slug from restaurant name."""
    # Convert to lowercase, replace spaces with dashes, remove special chars
    base_slug = re.sub(r'[^a-z0-9-]', '', name.lower().replace(' ', '-'))
    base_slug = re.sub(r'-+', '-', base_slug).strip('-')

    slug = base_slug
    counter = 1

    # Ensure slug is unique
    while db.query(Restaurant).filter(Restaurant.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    return slug


def create_restaurant_with_seller(data, db: Session):
    """Create a new restaurant and its seller account."""
    slug = generate_slug(data.name, db)

    restaurant = Restaurant(
        id=str(uuid.uuid4()),
        name=data.name,
        slug=slug,
        description=data.description,
        mode=data.mode,
    )
    db.add(restaurant)
    db.flush()  # Get restaurant.id before committing

    seller = Seller(
        id=str(uuid.uuid4()),
        restaurant_id=restaurant.id,
        email=data.seller_email,
        hashed_password=hash_password(data.seller_password),
    )
    db.add(seller)
    db.commit()
    db.refresh(restaurant)

    return restaurant