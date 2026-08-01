"""Alembic environment configured from application settings.

The database URL and schema metadata come from the running application, so
migrations stay in sync with the Postgres repository models. ``DATABASE_URL``
in the environment (or ``.env``) selects the target database, e.g. RDS.
"""

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

from rmit_society.config import get_settings
from rmit_society.shared.repositories.metadata import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Use the application settings for the target database URL.
config.set_main_option("sqlalchemy.url", get_settings().database_url)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# The Postgres repository's declarative models drive autogenerate.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without a DB connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode against a live engine."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
