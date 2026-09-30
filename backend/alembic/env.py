from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import all models so that SQLAlchemy registers them with Base.metadata
from app.models.restaurant import Restaurant  # noqa: F401
from app.models.seller import Seller  # noqa: F401
from app.models.category import Category  # noqa: F401
from app.models.menu import MenuItem  # noqa: F401
from app.models.order import Order, OrderItem  # noqa: F401
from app.models.customer import Customer  # noqa: F401
from app.models.admin import Admin  # noqa: F401
from app.models.refresh_token import RefreshToken  # noqa: F401

from app.core.config import resolve_database_url
from app.core.database import Base
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    # Sumber tunggal: settings.DATABASE_URL (bukan os.getenv — pydantic-settings
    # tidak menulis ke os.environ, lihat app/core.config.resolve_database_url).
    url = resolve_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    db_url = resolve_database_url()

    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = db_url

    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()