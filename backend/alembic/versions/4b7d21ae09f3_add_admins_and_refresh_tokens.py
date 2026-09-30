"""add admins and refresh tokens

Revision ID: 4b7d21ae09f3
Revises: 9fe1a27f5c6c
Create Date: 2026-09-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b7d21ae09f3'
down_revision: Union[str, None] = '9fe1a27f5c6c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempoten: DB lama yang sudah dibuat via Base.metadata.create_all
    # tidak boleh gagal "table already exists".
    inspector = sa.inspect(op.get_bind())

    if not inspector.has_table('admins'):
        op.create_table(
            'admins',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('email', sa.String(), nullable=False),
            sa.Column('hashed_password', sa.String(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_admins_email'), 'admins', ['email'], unique=True)

    if not inspector.has_table('refresh_tokens'):
        op.create_table(
            'refresh_tokens',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('token_hash', sa.String(), nullable=False),
            sa.Column('family_id', sa.String(), nullable=False),
            sa.Column('user_id', sa.String(), nullable=False),
            sa.Column('user_type', sa.String(), nullable=False),
            sa.Column('email', sa.String(), nullable=True),
            sa.Column('restaurant_id', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_refresh_tokens_token_hash'), 'refresh_tokens', ['token_hash'], unique=True)
        op.create_index(op.f('ix_refresh_tokens_family_id'), 'refresh_tokens', ['family_id'], unique=False)
        op.create_index(op.f('ix_refresh_tokens_user_id'), 'refresh_tokens', ['user_id'], unique=False)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if inspector.has_table('refresh_tokens'):
        op.drop_index(op.f('ix_refresh_tokens_user_id'), table_name='refresh_tokens')
        op.drop_index(op.f('ix_refresh_tokens_family_id'), table_name='refresh_tokens')
        op.drop_index(op.f('ix_refresh_tokens_token_hash'), table_name='refresh_tokens')
        op.drop_table('refresh_tokens')

    if inspector.has_table('admins'):
        op.drop_index(op.f('ix_admins_email'), table_name='admins')
        op.drop_table('admins')
