"""Refresh token opaque: disimpan sebagai hash, dirotasi tiap dipakai."""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.refresh_token import RefreshToken


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite mengembalikan datetime naive, PostgreSQL aware → samakan ke UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def create_refresh_token(
    db: Session,
    *,
    user_id: str,
    user_type: str,
    email: Optional[str] = None,
    restaurant_id: Optional[str] = None,
    family_id: Optional[str] = None,
) -> str:
    """Simpan hash refresh token, kembalikan token mentah untuk dikirim ke klien.

    Belum commit — caller yang memutuskan batas transaksi.
    """
    raw_token = secrets.token_urlsafe(48)
    db.add(
        RefreshToken(
            id=str(uuid.uuid4()),
            token_hash=hash_refresh_token(raw_token),
            family_id=family_id or str(uuid.uuid4()),
            user_id=user_id,
            user_type=user_type,
            email=email,
            restaurant_id=restaurant_id,
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    return raw_token


def rotate_refresh_token(db: Session, raw_token: str) -> Optional[Dict[str, str]]:
    """Validasi refresh token lama → tandai used → terbitkan token baru.

    Penanda "used" diklaim lewat SATU ``UPDATE`` atomik berbasis ``WHERE``
    (``token_hash = :x AND used_at IS NULL AND revoked_at IS NULL``), sehingga
    dari dua request refresh bersamaan hanya SATU yang ``rowcount``-nya 1 (B6).
    Dulu: query dulu → cek ``used_at``/``revoked_at`` di Python → update; dua
    request bisa sama-sama lolos dan melahirkan dua token hidup dari satu token.

    Mengembalikan dict ``{"refresh_token", "claims"}`` bila menang klaim, atau
    ``None`` bila token tidak dikenal, kedaluwarsa, sudah dipakai ulang
    (reuse detection → seluruh keluarga dicabut), maupun sudah dicabut.
    """
    if not raw_token:
        return None

    token_hash = hash_refresh_token(raw_token)
    now = datetime.now(timezone.utc)

    # 1) Klaim atomik — guard-nya ada di SQL, jadi database yang menentukan
    #    pemenangnya (bukan pembacaan-lalu-tulis yang bisa tumpang tindih).
    #    Langsung di-commit supaya klaim permanen sebelum token baru diterbitkan:
    #    bila langkah berikutnya gagal, token lama tetap hangus (fail-closed).
    claimed = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.token_hash == token_hash,
            RefreshToken.used_at.is_(None),
            RefreshToken.revoked_at.is_(None),
        )
        .update({RefreshToken.used_at: now}, synchronize_session=False)
    )
    db.commit()

    if claimed != 1:
        # 2) Kalah klaim → baca barisnya untuk menentukan penyebab (respons
        #    endpoint /refresh tidak berubah: selalu 401 dengan pesan sama).
        row = (
            db.query(RefreshToken)
            .filter(RefreshToken.token_hash == token_hash)
            .first()
        )
        if row is None:
            return None

        # Urutan pemeriksaan sama seperti sebelum B6: revoked dulu, baru used.
        if row.revoked_at is not None:
            return None

        # Reuse detection: token lama dipakai ulang setelah dirotasi → seluruh
        # keluarga token dicabut, klien wajib login ulang.
        if row.used_at is not None:
            (
                db.query(RefreshToken)
                .filter(
                    RefreshToken.family_id == row.family_id,
                    RefreshToken.revoked_at.is_(None),
                )
                .update({RefreshToken.revoked_at: now}, synchronize_session=False)
            )
            db.commit()
            return None

        return None

    # 3) Menang klaim → baris milik kita; ambil datanya untuk claims & TTL.
    row = (
        db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    )
    if row is None:  # praktis mustahil — barisnya baru saja kita klaim
        return None

    if _aware(row.expires_at) <= now:
        row.revoked_at = now
        db.commit()
        return None

    claims: Dict[str, str] = {
        "sub": row.user_id,
        "user_type": row.user_type,
    }
    if row.email:
        claims["email"] = row.email
    if row.restaurant_id:
        claims["restaurant_id"] = row.restaurant_id

    new_raw_token = create_refresh_token(
        db,
        user_id=row.user_id,
        user_type=row.user_type,
        email=row.email,
        restaurant_id=row.restaurant_id,
        family_id=row.family_id,
    )
    db.commit()
    return {"refresh_token": new_raw_token, "claims": claims}
