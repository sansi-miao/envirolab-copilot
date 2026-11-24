from sqlalchemy import and_, func, select

from app.db.models import experiment_formulas, experiment_methods, experiment_versions, experiments
from app.db.session import SessionLocal


def current_version_count(table) -> int:
    statement = (
        select(func.count())
        .select_from(table)
        .join(
            experiment_versions,
            experiment_versions.c.id == table.c.version_id,
        )
        .join(
            experiments,
            and_(
                experiments.c.id == experiment_versions.c.experiment_id,
                experiments.c.current_version == experiment_versions.c.version,
            ),
        )
    )
    with SessionLocal() as db:
        return db.scalar(statement) or 0


def test_current_catalog_retains_all_methods_and_formulas() -> None:
    assert current_version_count(experiment_methods) == 30
    assert current_version_count(experiment_formulas) == 56
