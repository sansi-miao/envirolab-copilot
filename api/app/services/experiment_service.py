from app.repositories.experiment_repository import ExperimentRepository
from app.schemas.experiment import (
    ExperimentDetail,
    ExperimentListResponse,
    ExperimentSummary,
    ExperimentVersionSummary,
)


class ExperimentNotFoundError(LookupError):
    pass


class ExperimentVersionNotFoundError(LookupError):
    pass


class ExperimentService:
    def __init__(self, repository: ExperimentRepository):
        self.repository = repository

    def list_experiments(
        self,
        query: str | None,
        discipline_id: str | None,
        limit: int,
        offset: int,
    ) -> ExperimentListResponse:
        items, total = self.repository.list_experiments(query, discipline_id, limit, offset)
        return ExperimentListResponse(items=items, total=total, limit=limit, offset=offset)

    def get_experiment(
        self,
        experiment_id: str,
        version: int | None = None,
    ) -> ExperimentDetail:
        experiment = self.repository.get_experiment(experiment_id, version)
        if experiment is not None:
            return experiment
        if version is not None and self.repository.public_experiment_exists(experiment_id):
            raise ExperimentVersionNotFoundError(f"{experiment_id}:v{version}")
        raise ExperimentNotFoundError(experiment_id)

    def list_versions(self, experiment_id: str) -> list[ExperimentVersionSummary]:
        versions = self.repository.list_versions(experiment_id)
        if versions is None:
            raise ExperimentNotFoundError(experiment_id)
        return versions

    def get_related(self, experiment_id: str, limit: int) -> ExperimentListResponse:
        source = self.get_experiment(experiment_id)
        candidates, _ = self.repository.list_experiments(limit=100, offset=0)
        scored: list[tuple[int, ExperimentSummary]] = []
        source_tags = set(source.tags)
        for candidate in candidates:
            if candidate.id == experiment_id:
                continue
            shared_tags = len(source_tags.intersection(candidate.tags))
            same_discipline = int(candidate.discipline_id == source.discipline_id)
            score = shared_tags * 2 + same_discipline
            if score > 0:
                scored.append((score, candidate))
        scored.sort(key=lambda item: (-item[0], item[1].name))
        return ExperimentListResponse(
            items=[candidate for _, candidate in scored[:limit]],
            total=len(scored),
            limit=limit,
            offset=0,
        )
