"""order item snapshot + menu soft-delete (B11)

Menambahkan snapshot transaksi pada ``order_items`` (nama menu & harga
satuan saat order dibuat) serta kolom ``deleted_at`` pada ``menu_items``
untuk soft-delete menu, sehingga menghapus menu/kategori tidak lagi
memutus riwayat transaksi/laporan pendapatan.

Revision ID: f8c1d4a72b93
Revises: 4b7d21ae09f3
Create Date: 2026-09-30 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8c1d4a72b93'
down_revision: Union[str, None] = '4b7d21ae09f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(bind, table: str) -> set:
    inspector = sa.inspect(bind)
    if not inspector.has_table(table):
        return set()
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    # Idempoten: DB lama yang dibuat via Base.metadata.create_all bisa saja
    # sudah punya kolom ini (gaya revisi 4b7d21ae09f3).
    bind = op.get_bind()

    if "menu_item_name" not in _columns(bind, "order_items"):
        op.add_column(
            "order_items",
            sa.Column("menu_item_name", sa.String(), nullable=True),
        )
    if "unit_price" not in _columns(bind, "order_items"):
        op.add_column(
            "order_items",
            sa.Column("unit_price", sa.Float(), nullable=True),
        )
    if "deleted_at" not in _columns(bind, "menu_items"):
        op.add_column(
            "menu_items",
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        )

    if not sa.inspect(bind).has_table("order_items"):
        return

    # Backfill baris lama dari menu yang masih ada; menu yang sudah hilang
    # dapat fallback: nama "-", harga = subtotal/quantity (quantity 0 → 0).
    op.execute(
        """
        UPDATE order_items
        SET menu_item_name = COALESCE(
                (SELECT mi.name FROM menu_items mi
                 WHERE mi.id = order_items.menu_item_id),
                '-'),
            unit_price = COALESCE(
                (SELECT mi.price FROM menu_items mi
                 WHERE mi.id = order_items.menu_item_id),
                CASE WHEN quantity <> 0
                     THEN subtotal / quantity
                     ELSE 0 END)
        WHERE menu_item_name IS NULL
        """
    )


def downgrade() -> None:
    bind = op.get_bind()

    if "deleted_at" in _columns(bind, "menu_items"):
        op.drop_column("menu_items", "deleted_at")
    if "unit_price" in _columns(bind, "order_items"):
        op.drop_column("order_items", "unit_price")
    if "menu_item_name" in _columns(bind, "order_items"):
        op.drop_column("order_items", "menu_item_name")
