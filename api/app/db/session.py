import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import metadata

API_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = API_ROOT.parent
DATA_DIRECTORY = PROJECT_ROOT / "data"
DATA_DIRECTORY.mkdir(parents=True, exist_ok=True)
DEFAULT_SQLITE_PATH = DATA_DIRECTORY / "envirolab.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)


_FORMULA_COLUMNS = (
    "version_id",
    "id",
    "experiment_id",
    "name",
    "expression",
    "description",
    "symbols",
    "units",
    "applicable_conditions",
)
_LEGACY_FORMULA_TABLE = "experiment_formulas_legacy"
_FORMULA_CONTENT_COLUMNS = tuple(
    column for column in _FORMULA_COLUMNS if column not in {"version_id", "id"}
)


def _assert_no_formula_conflicts(connection) -> None:
    differences = " OR ".join(
        f"current.{column} IS NOT legacy.{column}"
        for column in _FORMULA_CONTENT_COLUMNS
    )
    conflicts = connection.execute(
        text(
            f"SELECT COUNT(*) FROM {_LEGACY_FORMULA_TABLE} AS legacy "
            "JOIN experiment_formulas AS current "
            "ON current.version_id = legacy.version_id AND current.id = legacy.id "
            f"WHERE {differences}"
        )
    ).scalar_one()
    if conflicts:
        raise RuntimeError(
            f"SQLite formula migration conflict: {conflicts} rows share a "
            "primary key but differ in content; the legacy table was kept "
            "for manual review"
        )


def _copy_formulas_from_legacy(connection) -> None:
    columns = ", ".join(_FORMULA_COLUMNS)
    connection.execute(
        text(
            f"INSERT OR IGNORE INTO experiment_formulas ({columns}) "
            f"SELECT {columns} FROM {_LEGACY_FORMULA_TABLE}"
        )
    )


def _assert_legacy_formulas_copied(connection) -> None:
    missing = connection.execute(
        text(
            f"SELECT COUNT(*) FROM {_LEGACY_FORMULA_TABLE} AS legacy "
            "LEFT JOIN experiment_formulas AS current "
            "ON current.version_id = legacy.version_id AND current.id = legacy.id "
            "WHERE current.id IS NULL"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"SQLite formula migration left {missing} legacy rows uncopied"
        )


def _migrate_sqlite_schema(target_engine: Engine) -> None:
    if target_engine.dialect.name != "sqlite":
        return

    table_names = set(inspect(target_engine).get_table_names())
    if "experiments" in table_names:
        experiment_columns = {
            column["name"] for column in inspect(target_engine).get_columns("experiments")
        }
        if "owner_id" not in experiment_columns:
            with target_engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE experiments ADD COLUMN owner_id VARCHAR(100)")
                )
        with target_engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_experiments_public "
                    "ON experiments (is_public)"
                )
            )
            connection.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_experiments_owner "
                    "ON experiments (owner_id)"
                )
            )

    has_formula_table = "experiment_formulas" in table_names
    has_legacy_table = _LEGACY_FORMULA_TABLE in table_names
    if not has_formula_table and not has_legacy_table:
        return

    formula_pk = (
        inspect(target_engine)
        .get_pk_constraint("experiment_formulas")
        .get("constrained_columns", [])
        if has_formula_table
        else []
    )
    formula_has_new_pk = "version_id" in formula_pk

    if has_legacy_table:
        if not has_formula_table:
            metadata.create_all(target_engine)
        elif not formula_has_new_pk:
            raise RuntimeError(
                "Cannot recover SQLite formula migration: both the legacy and "
                "old-schema formula tables exist"
            )

        with target_engine.begin() as connection:
            _assert_no_formula_conflicts(connection)
            _copy_formulas_from_legacy(connection)
            _assert_legacy_formulas_copied(connection)
            connection.execute(text(f"DROP TABLE {_LEGACY_FORMULA_TABLE}"))
        return

    if formula_has_new_pk:
        return

    # Copy and drop in one transaction so an interrupted migration leaves the
    # legacy table available for the recovery path above.
    with target_engine.begin() as connection:
        connection.execute(text("DROP INDEX IF EXISTS ix_formula_experiment"))
        connection.execute(text("DROP INDEX IF EXISTS ix_formula_version"))
        connection.execute(
            text(
                "ALTER TABLE experiment_formulas "
                "RENAME TO experiment_formulas_legacy"
            )
        )
        metadata.create_all(connection)
        _assert_no_formula_conflicts(connection)
        _copy_formulas_from_legacy(connection)
        _assert_legacy_formulas_copied(connection)
        connection.execute(text(f"DROP TABLE {_LEGACY_FORMULA_TABLE}"))


def initialize_database(target_engine: Engine) -> None:
    metadata.create_all(target_engine)
    _migrate_sqlite_schema(target_engine)


def init_db() -> None:
    initialize_database(engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
