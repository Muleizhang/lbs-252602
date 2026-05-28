from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

import os

from app.models import Base

config = context.config
_db_url_sync = os.environ.get("DATABASE_URL_SYNC")
if _db_url_sync:
    config.set_main_option("sqlalchemy.url", _db_url_sync)
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


POSTGIS_TABLES = {
    "spatial_ref_sys", "geometry_columns", "geography_columns",
    "layer", "topology",
    "bg", "featnames", "addrfeat", "faces", "county", "state",
    "addr", "edges", "place", "cousub", "tabblock", "tabblock20",
    "tract", "zcta5", "county_lookup", "countysub_lookup",
    "direction_lookup", "place_lookup", "secondary_unit_lookup",
    "state_lookup", "street_type_lookup", "zip_lookup", "zip_lookup_all",
    "zip_lookup_base", "zip_state", "zip_state_loc",
    "loader_lookuptables", "loader_variables", "loader_platform",
    "geocode_settings", "geocode_settings_default",
    "pagc_gaz", "pagc_lex", "pagc_rules",
}

OUR_TABLES = {"users", "api_keys", "pois"}


def include_object(object, name, type_, reflected, compare_to):
    if type_ == "table":
        if name in OUR_TABLES:
            return True
        return False
    return True


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            render_as_batch=False,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
