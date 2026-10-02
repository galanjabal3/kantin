"""Rate limiter tunggal untuk seluruh aplikasi (slowapi 0.1.9)."""
import time

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

# Satu instance dipakai bersama oleh main.py (app.state.limiter) dan router
# (dekorator @limiter.limit). key_func → limit per IP klien.
limiter = Limiter(key_func=get_remote_address)


# ── Provider limit dari settings (A4) ────────────────────────
# slowapi menerima callable selain string (StrOrCallableStr): nilai dipanggil
# SAAT request dicek (dynamic limit), bukan saat dekorator dievaluasi saat
# import. Karena itu env var / override settings tetap terbaca walau route
# sudah ter-binding di awal — dan tetap terbaca dari pola pydantic-settings
# di app/core/config.py (bukan os.getenv baru).


def menu_rate_limit() -> str:
    """Limit membaca menu per-IP (default ``60/minute``)."""
    return settings.RATE_LIMIT_MENU


def order_rate_limit() -> str:
    """Limit membuat order per-IP (default ``30/minute``)."""
    return settings.RATE_LIMIT_ORDER


def login_rate_limit() -> str:
    """Limit login per-IP (default ``5/minute`` — tidak dinaikkan)."""
    return settings.RATE_LIMIT_LOGIN


# ── Throttle login per-email (B14) ─────────────────────────────
# Bucket slowapi = (IP, path), jadi brute-force1 akun bisa disebar ke
# banyak IP. Counter in-memory per email menutup celah itu.
# CATATAN: state hilang saat proses restart / reset (cukup untuk skala
# kantin; pindah ke Redis bila kelak di-scale horizontal).
LOGIN_EMAIL_MAX_FAILURES = 10
LOGIN_EMAIL_WINDOW_SECONDS = 60

_login_failures: dict[str, list[float]] = {}


def _prune(email: str, now: float | None = None) -> list[float]:
    now = time.monotonic() if now is None else now
    return [
        ts
        for ts in _login_failures.get(email, [])
        if now - ts < LOGIN_EMAIL_WINDOW_SECONDS
    ]


def register_login_failure(email: str) -> None:
    """Catat1 percobaan login gagal untuk ``email``."""
    bucket = _prune(email)
    bucket.append(time.monotonic())
    _login_failures[email] = bucket


def login_email_throttled(email: str) -> bool:
    """True bila email sudah gagal terlalu banyak dalam jendela waktu."""
    bucket = _prune(email)
    if bucket:
        _login_failures[email] = bucket
    else:
        _login_failures.pop(email, None)
    return len(bucket) >= LOGIN_EMAIL_MAX_FAILURES


def clear_login_failures(email: str) -> None:
    """Login sukses → hitung gagal untuk email ini direset."""
    _login_failures.pop(email, None)


def reset_login_failures() -> None:
    """Bersihkan seluruh counter (dipakai fixture test)."""
    _login_failures.clear()
