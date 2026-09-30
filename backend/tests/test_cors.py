"""B10: preflight CORS harus mengizinkan PUT & DELETE.

Sebelum diperbaiki allow_methods hanya ["POST", "GET"] → preflight dengan
Access-Control-Request-Method: PUT/DELETE balik 400, sehingga 4 fitur seller
cross-origin (updateMenu, updateOrderStatus, updateSellerSettings,
deleteMenu) mati total di produksi (Vercel ↔ Render).
"""
from app.core.config import DEV_ORIGINS

ORIGIN = DEV_ORIGINS[0]
PATH = "/api/seller/menu/x"


def _preflight(client, method: str, path: str = PATH):
    return client.options(
        path,
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "Content-Type, Authorization",
        },
    )


def test_preflight_put_diizinkan(client):
    resp = _preflight(client, "PUT")
    assert resp.status_code == 200, resp.text
    assert resp.headers.get("access-control-allow-origin") == ORIGIN
    assert "PUT" in resp.headers.get("access-control-allow-methods", "")


def test_preflight_delete_diizinkan(client):
    resp = _preflight(client, "DELETE")
    assert resp.status_code == 200, resp.text
    assert resp.headers.get("access-control-allow-origin") == ORIGIN
    assert "DELETE" in resp.headers.get("access-control-allow-methods", "")


def test_allow_methods_mencakup_semua_method_inti(client):
    resp = _preflight(client, "PUT")
    allowed = resp.headers.get("access-control-allow-methods", "")
    for method in ("GET", "POST", "PUT", "DELETE"):
        assert method in allowed, f"{method} tidak ada di {allowed!r}"


def test_allow_headers_mencakup_authorization_dan_content_type(client):
    resp = _preflight(client, "PUT")
    allowed = resp.headers.get("access-control-allow-headers", "").lower()
    # Starlette menggabungkan safelisted + allow_headers (mempertahankan kapitalisasi)
    assert "authorization" in allowed
    assert "content-type" in allowed


def test_method_tidak_dikenal_masih_ditolak(client):
    resp = _preflight(client, "TRACE")
    assert resp.status_code == 400
    assert "method" in resp.text.lower()


def test_preflight_tetap_ditolak_untuk_origin_jahat(client):
    resp = client.options(
        PATH,
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "Content-Type, Authorization",
        },
    )
    assert resp.status_code == 400
    assert "access-control-allow-origin" not in resp.headers
