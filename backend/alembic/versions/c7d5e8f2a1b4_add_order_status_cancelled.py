"""tambah nilai enum orderstatus 'cancelled'

Revisi ke-5 status order: pelanggan bisa membatalkan pesanan selama masih
``pending``, sehingga tipe enum PostgreSQL ``orderstatus`` perlu memuat nilai
``cancelled`` (belum ada di skema awal 9fe1a27f5c6c yang hanya 4 nilai).

``ALTER TYPE ... ADD VALUE`` WAJIB dijalankan di luar transaksi:
  - PostgreSQL < 12 menolaknya di dalam transaction block sama sekali;
  - PostgreSQL >= 12 mengizinkannya, tapi nilai baru tidak boleh dipakai
    oleh transaksi yang sama sebelum COMMIT — Alembic membungkus tiap revisi
    dalam satu transaksi, jadi pemakaian 'cancelled' akan langsung gagal.
Makanya dipakai ``autocommit_block()``.

Revision ID: c7d5e8f2a1b4
Revises: f8c1d4a72b93
Create Date: 2026-10-02 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c7d5e8f2a1b4'
down_revision: Union[str, None] = 'f8c1d4a72b93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # `ALTER TYPE` hanya ada di PostgreSQL. Dialect dipakai supaya revisi ini
    # tetap jalan di SQLite (test alembic lokal / `test_alembic_env.py`):
    # di SQLite tipe enum dirender sebagai VARCHAR biasa, jadi tidak ada DDL
    # yang perlu dijalankan — semua string diterima apa adanya.
    dialect = op.get_context().dialect.name
    if dialect != "postgresql":
        return

    # IF NOT EXISTS → idempoten terhadap DB legacy yang dibuat
    # Base.metadata.create_all (enum sudah dibuat dari model Python yang
    # memuat 'cancelled') lalu di-stamp ke revisi awal.
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'cancelled'"
        )


def downgrade() -> None:
    # No-op yang disengaja.
    # PostgreSQL < 16 tidak menyediakan ALTER TYPE ... DROP VALUE, dan
    # menghapus nilai enum akan membatalkan/menolak baris orders yang sudah
    # berstatus 'cancelled'. Tipe enum TIDAK disentuh supaya skema tetap
    # utuh dan revisi ini bisa dijalankan ulang tanpa merusak data.
    pass
