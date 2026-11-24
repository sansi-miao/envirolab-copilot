from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.db.models import (
    disciplines,
    evidence_items,
    experiment_formulas,
    experiment_methods,
    experiment_papers,
    experiment_tags,
    experiment_versions,
    experiments,
    papers,
)
from app.schemas.experiment import (
    DisciplineResponse,
    ExperimentDetail,
    ExperimentSummary,
    ExperimentVersionSummary,
)


class ExperimentRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_disciplines(self) -> list[DisciplineResponse]:
        statement = (
            select(
                disciplines.c.id,
                disciplines.c.name,
                disciplines.c.description,
                disciplines.c.sort_order,
                func.count(experiments.c.id).label("experiment_count"),
            )
            .outerjoin(
                experiments,
                and_(
                    experiments.c.discipline_id == disciplines.c.id,
                    experiments.c.is_public.is_(True),
                ),
            )
            .group_by(disciplines.c.id)
            .order_by(disciplines.c.sort_order)
        )
        return [DisciplineResponse.model_validate(row._mapping) for row in self.db.execute(statement)]

    def _summary_statement(self, version: int | None = None):
        version_match = experiments.c.current_version if version is None else version
        return (
            select(
                experiments.c.id,
                experiments.c.name,
                experiments.c.english_name,
                experiments.c.discipline_id,
                disciplines.c.name.label("discipline_name"),
                experiments.c.summary,
                experiment_versions.c.evidence_status,
                experiment_versions.c.review_status,
                experiment_versions.c.calculation_status,
                experiment_versions.c.completeness,
                experiment_versions.c.updated_at,
                experiments.c.created_at,
                experiments.c.current_version,
            )
            .select_from(experiments)
            .join(disciplines, disciplines.c.id == experiments.c.discipline_id)
            .join(
                experiment_versions,
                (experiment_versions.c.experiment_id == experiments.c.id)
                & (experiment_versions.c.version == version_match),
            )
        )

    def _with_filters(self, statement, query: str | None, discipline_id: str | None):
        statement = statement.where(experiments.c.is_public.is_(True))
        if discipline_id:
            statement = statement.where(experiments.c.discipline_id == discipline_id)
        if query:
            pattern = f"%{query}%"
            statement = statement.where(
                or_(
                    experiments.c.name.ilike(pattern),
                    experiments.c.english_name.ilike(pattern),
                    experiments.c.summary.ilike(pattern),
                    select(experiment_tags.c.experiment_id)
                    .where(
                        experiment_tags.c.experiment_id == experiments.c.id,
                        experiment_tags.c.tag.ilike(pattern),
                    )
                    .exists(),
                )
            )
        return statement

    def list_experiments(
        self,
        query: str | None = None,
        discipline_id: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[ExperimentSummary], int]:
        filtered = self._with_filters(self._summary_statement(), query, discipline_id)
        total = self.db.scalar(select(func.count()).select_from(filtered.subquery())) or 0
        rows = self.db.execute(
            filtered.order_by(experiments.c.name).limit(limit).offset(offset)
        ).all()
        return self._to_summaries(rows), total

    def public_experiment_exists(self, experiment_id: str) -> bool:
        return (
            self.db.scalar(
                select(experiments.c.id).where(
                    experiments.c.id == experiment_id,
                    experiments.c.is_public.is_(True),
                )
            )
            is not None
        )

    def get_experiment(
        self,
        experiment_id: str,
        version: int | None = None,
    ) -> ExperimentDetail | None:
        current_version = self.db.scalar(
            select(experiments.c.current_version).where(
                experiments.c.id == experiment_id,
                experiments.c.is_public.is_(True),
            )
        )
        if current_version is None:
            return None
        target_version = version if version is not None else current_version
        row = self.db.execute(
            self._with_filters(self._summary_statement(target_version), None, None).where(
                experiments.c.id == experiment_id
            )
        ).first()
        if row is None:
            return None
        version_id = self.db.scalar(
            select(experiment_versions.c.id).where(
                experiment_versions.c.experiment_id == experiment_id,
                experiment_versions.c.version == target_version,
            )
        )
        if version_id is None:
            return None
        method_row = self.db.execute(
            select(
                experiment_methods.c.purpose,
                experiment_methods.c.principle,
                experiment_methods.c.materials,
                experiment_methods.c.instruments,
                experiment_methods.c.steps,
                experiment_methods.c.independent_variables,
                experiment_methods.c.dependent_variables,
                experiment_methods.c.controlled_variables,
                experiment_methods.c.data_processing,
                experiment_methods.c.limitations,
            ).where(experiment_methods.c.version_id == version_id)
        ).first()
        if method_row is None:
            return None
        formula_rows = self.db.execute(
            select(
                experiment_formulas.c.id,
                experiment_formulas.c.name,
                experiment_formulas.c.expression,
                experiment_formulas.c.description,
                experiment_formulas.c.symbols,
                experiment_formulas.c.units,
                experiment_formulas.c.applicable_conditions,
            )
            .where(experiment_formulas.c.version_id == version_id)
            .order_by(experiment_formulas.c.id)
        ).all()
        paper_rows = self.db.execute(
            select(
                papers.c.id,
                papers.c.title,
                papers.c.authors,
                papers.c.year,
                papers.c.venue,
                papers.c.doi,
                papers.c.url,
                papers.c.source_type,
                papers.c.source_access,
                papers.c.notes,
            )
            .select_from(experiment_papers)
            .join(papers, papers.c.id == experiment_papers.c.paper_id)
            .where(experiment_papers.c.experiment_id == experiment_id)
            .order_by(papers.c.id)
        ).all()
        evidence_rows = self.db.execute(
            select(
                evidence_items.c.id,
                evidence_items.c.source_id,
                evidence_items.c.experiment_id,
                evidence_items.c.version_id,
                evidence_items.c.target_type,
                evidence_items.c.target_id,
                evidence_items.c.page,
                evidence_items.c.section,
                evidence_items.c.table_or_figure,
                evidence_items.c.excerpt,
                evidence_items.c.note,
            )
            .where(evidence_items.c.version_id == version_id)
            .order_by(evidence_items.c.id)
        ).all()
        summary = self._to_summaries([row])[0]
        return ExperimentDetail.model_validate(
            {
                **summary.model_dump(),
                "version": target_version,
                "created_at": row._mapping["created_at"],
                "method": dict(method_row._mapping),
                "formulas": [dict(item._mapping) for item in formula_rows],
                "papers": [dict(item._mapping) for item in paper_rows],
                "evidence": [dict(item._mapping) for item in evidence_rows],
            }
        )

    def list_versions(self, experiment_id: str) -> list[ExperimentVersionSummary] | None:
        if not self.public_experiment_exists(experiment_id):
            return None
        formula_count = (
            select(func.count(experiment_formulas.c.id))
            .where(experiment_formulas.c.version_id == experiment_versions.c.id)
            .correlate(experiment_versions)
            .scalar_subquery()
        )
        statement = (
            select(
                experiment_versions.c.version,
                experiment_versions.c.evidence_status,
                experiment_versions.c.review_status,
                experiment_versions.c.calculation_status,
                experiment_versions.c.completeness,
                experiment_versions.c.created_at,
                experiment_versions.c.updated_at,
                experiments.c.current_version,
                formula_count.label("formula_count"),
            )
            .select_from(experiment_versions)
            .join(experiments, experiments.c.id == experiment_versions.c.experiment_id)
            .where(
                experiment_versions.c.experiment_id == experiment_id,
                experiments.c.is_public.is_(True),
            )
            .order_by(experiment_versions.c.version.desc())
        )
        return [
            ExperimentVersionSummary(
                version=row.version,
                evidence_status=row.evidence_status,
                review_status=row.review_status,
                calculation_status=row.calculation_status,
                completeness=row.completeness,
                created_at=row.created_at,
                updated_at=row.updated_at,
                is_current=row.version == row.current_version,
                formula_count=row.formula_count,
            )
            for row in self.db.execute(statement)
        ]

    def _to_summaries(self, rows) -> list[ExperimentSummary]:
        if not rows:
            return []
        experiment_ids = [row._mapping["id"] for row in rows]
        tag_rows = self.db.execute(
            select(experiment_tags.c.experiment_id, experiment_tags.c.tag).where(
                experiment_tags.c.experiment_id.in_(experiment_ids)
            )
        ).all()
        tags_by_id: dict[str, list[str]] = {item: [] for item in experiment_ids}
        for tag_row in tag_rows:
            tags_by_id[tag_row._mapping["experiment_id"]].append(tag_row._mapping["tag"])
        return [
            ExperimentSummary.model_validate(
                {
                    **{
                        key: value
                        for key, value in row._mapping.items()
                        if key not in {"created_at", "current_version"}
                    },
                    "tags": tags_by_id[row._mapping["id"]],
                }
            )
            for row in rows
        ]
