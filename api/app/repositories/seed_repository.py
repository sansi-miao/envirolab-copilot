from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    disciplines,
    experiment_formulas,
    experiment_methods,
    experiment_papers,
    experiment_tags,
    experiment_versions,
    experiments,
    papers,
)
from app.schemas.experiment import DisciplineSeed, ExperimentDetail


class SeedRepository:
    def __init__(self, db: Session):
        self.db = db

    def _upsert(self, table, key: str, values: dict) -> None:
        condition = table.c[key] == values[key]
        exists = self.db.scalar(select(table.c[key]).where(condition))
        if exists is None:
            self.db.execute(table.insert().values(**values))
        else:
            self.db.execute(table.update().where(condition).values(**values))

    def import_discipline(self, discipline: DisciplineSeed) -> None:
        self._upsert(disciplines, "id", discipline.model_dump())

    def import_experiment(self, experiment: ExperimentDetail) -> None:
        existing_current = self.db.scalar(
            select(experiments.c.current_version).where(experiments.c.id == experiment.id)
        )
        current_version = max(existing_current or 0, experiment.version)
        self._upsert(
            experiments,
            "id",
            {
                "id": experiment.id,
                "name": experiment.name,
                "english_name": experiment.english_name,
                "discipline_id": experiment.discipline_id,
                "summary": experiment.summary,
                "current_version": current_version,
                "is_public": True,
                "created_at": experiment.created_at,
                "updated_at": experiment.updated_at,
            },
        )
        version_id = f"{experiment.id}:v{experiment.version}"
        self._upsert(
            experiment_versions,
            "id",
            {
                "id": version_id,
                "experiment_id": experiment.id,
                "version": experiment.version,
                "evidence_status": experiment.evidence_status,
                "review_status": experiment.review_status,
                "calculation_status": experiment.calculation_status,
                "completeness": experiment.completeness,
                "created_at": experiment.created_at,
                "updated_at": experiment.updated_at,
            },
        )
        self.db.execute(
            experiment_methods.delete().where(experiment_methods.c.version_id == version_id)
        )
        self.db.execute(
            experiment_methods.insert().values(
                experiment_id=experiment.id,
                version_id=version_id,
                **experiment.method.model_dump(),
            )
        )
        self.db.execute(
            experiment_formulas.delete().where(experiment_formulas.c.version_id == version_id)
        )
        for formula in experiment.formulas:
            self.db.execute(
                experiment_formulas.insert().values(
                    experiment_id=experiment.id,
                    version_id=version_id,
                    **formula.model_dump(),
                )
            )
        self.db.execute(experiment_tags.delete().where(experiment_tags.c.experiment_id == experiment.id))
        for tag in sorted(set(experiment.tags)):
            self.db.execute(experiment_tags.insert().values(experiment_id=experiment.id, tag=tag))
        self.db.execute(
            experiment_papers.delete().where(experiment_papers.c.experiment_id == experiment.id)
        )
        for paper in experiment.papers:
            self._upsert(papers, "id", paper.model_dump())
            self.db.execute(
                experiment_papers.insert().values(
                    experiment_id=experiment.id,
                    paper_id=paper.id,
                    relation="method_source",
                )
            )
