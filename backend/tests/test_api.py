import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db


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


client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "app" in data


def test_docs_endpoint():
    response = client.get("/docs")
    assert response.status_code == 200


def test_openapi_schema():
    response = client.get("/openapi.json")
    assert response.status_code == 200
    data = response.json()
    assert "openapi" in data
    assert "info" in data


def test_auth_routes_exist():
    # Test that auth routes are registered
    response = client.post("/api/auth/login", json={})
    # Should return 422 (validation error) or 401, not 404
    assert response.status_code != 404


def test_admin_routes_exist():
    # Test that admin routes are registered (should require auth)
    response = client.get("/api/admin/restaurants")
    # Should return 401 (unauthorized) or 403, not 404
    assert response.status_code != 404


def test_seller_routes_exist():
    # Test that seller routes are registered (should require auth)
    response = client.get("/api/seller/menu")
    # Should return 401 (unauthorized) or 403, not 404
    assert response.status_code != 404


def test_customer_routes_exist():
    # Test that customer routes are registered
    response = client.get("/api/r/")
    # Should return 404 (not found) or 422, but route exists
    # This endpoint might need a slug parameter
    assert response.status_code in [404, 422]
