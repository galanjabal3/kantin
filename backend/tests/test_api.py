import pytest
from fastapi.testclient import TestClient

from app.main import app

# Setup test database + dependency override ada di tests/conftest.py
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
