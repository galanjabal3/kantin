"""B6: rotasi refresh token harus klaim atomik (UPDATE berbasis WHERE).

Dulu ``rotate_refresh_token`` query dulu lalu mengecek ``used_at``/
``revoked_at`` di Python sebelum menulis → dua request refresh bersamaan bisa
sama-sama lolos dan melahirkan dua token hidup dari satu token. Sekarang
penanda "used" diklaim lewat satu ``UPDATE ... WHERE used_at IS NULL AND
revoked_at IS NULL``; hanya ``rowcount == 1`` yang berhak menerbitkan token
baru.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.refresh import (
    create_refresh_token,
    hash_refresh_token,
    rotate_refresh_token,
)
from app.models.refresh_token import RefreshToken


def _spy_update_refresh_tokens(engine):
    """Rekam setiap UPDATE refresh_tokens beserta rowcount-nya."""
    rekaman: list[tuple[str, int]] = []

    def _catat(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("UPDATE REFRESH_TOKENS"):
            rekaman.append((statement, cursor.rowcount))

    event.listen(engine, "after_cursor_execute", _catat)
    return rekaman, lambda: event.remove(engine, "after_cursor_execute", _catat)


def _ambil(kalimat: str, rekaman: list[tuple[str, int]]):
    return [r for r in rekaman if kalimat in r[0].upper()]


def test_klaim_used_dilakukan_dalam_satu_update_berguard(db_session):
    """Baris ditandai used oleh SATU UPDATE ber-guard — bukan baca-lalu-tulis."""
    raw = create_refresh_token(
        db_session,
        user_id="u-klaim",
        user_type="seller",
        email="klaim@kantin.test",
    )
    db_session.commit()

    engine = db_session.get_bind()
    rekaman, lepas_spy = _spy_update_refresh_tokens(engine)
    try:
        # ── rotasi pertama: menang ────────────────────────────────────
        menang = rotate_refresh_token(db_session, raw)
        assert menang is not None
        assert menang["refresh_token"] != raw

        klaim = _ambil("SET USED_AT", rekaman)
        assert len(klaim) == 1, "penanda used ditulis oleh TEPAT SATU UPDATE"
        pernyataan, rowcount = klaim[0]
        assert rowcount == 1, "rotasi pertama memenangi klaim"
        # guard-nya ada di SQL, sehingga database yang meng serialisasi
        assert "USED_AT IS NULL" in pernyataan.upper()
        assert "REVOKED_AT IS NULL" in pernyataan.upper()
        assert not _ambil("SET REVOKED_AT", rekaman)

        # ── rotasi kedua: token yang sama dipakai ulang ───────────────
        rekaman.clear()
        kalah = rotate_refresh_token(db_session, raw)
        assert kalah is None, "hanya satu pemenang dari satu token"

        klaim_kedua = _ambil("SET USED_AT", rekaman)
        assert len(klaim_kedua) == 1
        assert klaim_kedua[0][1] == 0, (
            "klaim kedua diblokir guard WHERE di SQL (rowcount 0), "
            "bukan lolos karena pembacaan di Python"
        )

        # reuse detection tetap berjalan: seluruh keluarga dicabut
        cabut = _ambil("SET REVOKED_AT", rekaman)
        assert len(cabut) == 1
        # keluarga = token asli + successor dari rotasi pertama
        assert cabut[0][1] == 2
    finally:
        lepas_spy()

    # semua token keluarga mati
    hidup = (
        db_session.query(RefreshToken)
        .filter(
            RefreshToken.used_at.is_(None),
            RefreshToken.revoked_at.is_(None),
        )
        .count()
    )
    assert hidup == 0


def test_race_dua_rotasi_beruntun_hanya_menerbitkan_satu_successor(tmp_path):
    """Race: request kedua masuk di tengah rotasi pertama (sesi/koneksi beda).

    Suntikan dilakukan lewat hook ``before_cursor_execute`` pada saat pemenang
    akan menerbitkan successor — jendela yang persis dulu membuat dua request
    sama-sama lolos. Setup test in-memory bersama StaticPool (satu koneksi)
    tidak bisa mereproduksi dua koneksi paralel, jadi DB SQLite berfile dipakai
    agar kedua sesi benar-benar memakai koneksi terpisah.
    """
    engine = create_engine(
        f"sqlite:///{tmp_path}/race.db",
        connect_args={"timeout": 30},
    )
    RefreshToken.__table__.create(engine)
    Sesional = sessionmaker(bind=engine)
    try:
        with Sesional() as sesi_awal:
            raw = create_refresh_token(
                sesi_awal,
                user_id="u-race",
                user_type="seller",
                email="race@kantin.test",
            )
            sesi_awal.commit()

        hasil_kalah: list = []
        sudah_disuntik = {"ya": False}

        def _suntik_request_kedua(conn, cursor, statement, parameters, context, executemany):
            if sudah_disuntik["ya"]:
                return
            if not statement.lstrip().upper().startswith("INSERT INTO REFRESH_TOKENS"):
                return
            sudah_disuntik["ya"] = True
            # koneksi berbeda = meniru request refresh paralel yang masuk
            # tepat sebelum successor terbit
            with Sesional() as sesi_kedua:
                hasil_kalah.append(rotate_refresh_token(sesi_kedua, raw))

        event.listen(engine, "before_cursor_execute", _suntik_request_kedua)
        try:
            with Sesional() as sesi_pertama:
                hasil_menang = rotate_refresh_token(sesi_pertama, raw)
        finally:
            event.remove(engine, "before_cursor_execute", _suntik_request_kedua)

        assert sudah_disuntik["ya"] is True, "jendela race memang diinterupsi"
        # tepat 1 sukses, 1 gagal (endpoint /refresh → 401)
        assert hasil_menang is not None
        assert hasil_kalah == [None]

        with Sesional() as sesi:
            baris = sesi.query(RefreshToken).all()
            # bug lama: dua rotasi → dua successor; kini hanya SATU
            assert len(baris) == 2
            assert sum(1 for b in baris if b.used_at is not None) == 1
            successor = [b for b in baris if b.used_at is None]
            assert len(successor) == 1
            # pemenang tetap boleh memakai token barunya
            assert successor[0].revoked_at is None

            # token hasil rotasi menang benar-benar bisa dipakai
            berikutnya = rotate_refresh_token(sesi, hasil_menang["refresh_token"])
            assert berikutnya is not None
            assert berikutnya["claims"]["sub"] == "u-race"
            assert berikutnya["refresh_token"] != hasil_menang["refresh_token"]
    finally:
        engine.dispose()


# ── perilaku lama wajib bertahan ───────────────────────────────


def test_token_dicabut_kembalikan_none_tanpa_memicu_reuse(db_session):
    raw = create_refresh_token(
        db_session, user_id="u-revoked", user_type="seller"
    )
    db_session.commit()

    dicabut_pada = datetime.now(timezone.utc) - timedelta(minutes=1)
    baris = (
        db_session.query(RefreshToken)
        .filter(RefreshToken.token_hash == hash_refresh_token(raw))
        .one()
    )
    baris.revoked_at = dicabut_pada
    db_session.commit()

    assert rotate_refresh_token(db_session, raw) is None

    db_session.expire_all()
    sesudah = db_session.query(RefreshToken).filter(RefreshToken.id == baris.id).one()
    # revoked dicek lebih dulu → tidak dianggap reuse, keluarga tidak dicabut
    # (SQLite mengembalikan datetime naive → samakan ke UTC)
    sesudah_revoked = sesudah.revoked_at.replace(tzinfo=timezone.utc)
    assert sesudah_revoked == dicabut_pada
    assert sesudah.used_at is None


def test_token_salah_dan_kosong_kembalikan_none(db_session):
    assert rotate_refresh_token(db_session, "") is None
    assert rotate_refresh_token(db_session, "bukan-token-ada") is None
    assert (
        db_session.query(RefreshToken).count() == 0
    ), "token tak dikenal tidak menulis apa pun"
