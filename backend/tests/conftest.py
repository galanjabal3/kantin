import os
import sys
import uuid
from pathlib import Path

# Add backend directory to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Test tidak boleh menjalankan `alembic upgrade head` (lihat app/core/migrations.py)
os.environ.setdefault("RUN_MIGRATIONS", "0")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.core.ratelimit import limiter, reset_login_failures
from app.core.security import hash_password
from app.models.category import Category
from app.models.menu import MenuItem
from app.models.restaurant import Restaurant
from app.models.seller import Seller

# bcrypt itu berat — hash sekali saja untuk dipakai ulang antar test.
_HASH_CACHE: dict = {}


def cached_password_hash(password: str) -> str:
    if password not in _HASH_CACHE:
        _HASH_CACHE[password] = hash_password(password)
    return _HASH_CACHE[password]


# Setup test database (in-memory SQLite)
SQLALCHEMY_TEST_DATABASE_URL = "sqlite://"
engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Batas rate limit pakai storage in-process — bersihkan antar test."""
    limiter.reset()
    reset_login_failures()  # throttle login per-email juga in-process
    yield
    limiter.reset()
    reset_login_failures()


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def seed(db_session):
    """Buat restoran lengkap (seller + kategori + menu) dan kembalikan id-nya."""

    def _seed(slug: str, *, price: float = 10000.0, password: str = "rahasia123"):
        restaurant_id = str(uuid.uuid4())
        category_id = str(uuid.uuid4())
        menu_item_id = str(uuid.uuid4())
        seller_id = str(uuid.uuid4())
        seller_email = f"{slug}@seller.test"
        db_session.add_all(
            [
                Restaurant(
                    id=restaurant_id,
                    name=f"Warung {slug}",
                    slug=slug,
                ),
                Seller(
                    id=seller_id,
                    restaurant_id=restaurant_id,
                    email=seller_email,
                    hashed_password=cached_password_hash(password),
                ),
                Category(id=category_id, restaurant_id=restaurant_id, name="Makanan"),
                MenuItem(
                    id=menu_item_id,
                    restaurant_id=restaurant_id,
                    category_id=category_id,
                    name="Nasi Goreng",
                    price=price,
                ),
            ]
        )
        db_session.commit()
        return {
            "restaurant_id": restaurant_id,
            "seller_id": seller_id,
            "slug": slug,
            "seller_email": seller_email,
            "seller_password": password,
            "category_id": category_id,
            "menu_item_id": menu_item_id,
            "price": price,
        }

    return _seed
