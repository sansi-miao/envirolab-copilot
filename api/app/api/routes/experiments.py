from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.experiment_repository import ExperimentRepository
from app.schemas.experiment import (
    ExperimentDetail,
    ExperimentListResponse,
    ExperimentVersionSummary,
)
from app.services.experiment_service import (
    ExperimentNotFoundError,
    ExperimentService,
    ExperimentVersionNotFoundError,
)

router = APIRouter(prefix="/experiments", tags=["experiments"])


def get_service(db: Session = Depends(get_db)) -> ExperimentService:
    return ExperimentService(ExperimentRepository(db))


@router.get("", response_model=ExperimentListResponse)
def list_experiments(
    q: str | None = Query(default=None, max_length=100),
    discipline_id: str | None = Query(default=None, max_length=50),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    service: ExperimentService = Depends(get_service),
) -> ExperimentListResponse:
    return service.list_experiments(q, discipline_id, limit, offset)


@router.get("/search", response_model=ExperimentListResponse)
def search_experiments(
    q: str = Query(min_length=1, max_length=100),
    discipline_id: str | None = Query(default=None, max_length=50),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    service: ExperimentService = Depends(get_service),
) -> ExperimentListResponse:
    return service.list_experiments(q, discipline_id, limit, offset)


@router.get("/{experiment_id}/versions", response_model=list[ExperimentVersionSummary])
def list_experiment_versions(
    experiment_id: str,
    service: ExperimentService = Depends(get_service),
) -> list[ExperimentVersionSummary]:
    try:
        return service.list_versions(experiment_id)
    except ExperimentNotFoundError as error:
        raise HTTPException(status_code=404, detail="Experiment not found") from error


@router.get("/{experiment_id}/versions/{version}", response_model=ExperimentDetail)
def get_experiment_version(
    experiment_id: str,
    version: int,
    service: ExperimentService = Depends(get_service),
) -> ExperimentDetail:
    try:
        return service.get_experiment(experiment_id, version)
    except ExperimentVersionNotFoundError as error:
        raise HTTPException(status_code=404, detail="Experiment version not found") from error
    except ExperimentNotFoundError as error:
        raise HTTPException(status_code=404, detail="Experiment not found") from error


@router.get("/{experiment_id}/related", response_model=ExperimentListResponse)
def related_experiments(
    experiment_id: str,
    limit: int = Query(default=4, ge=1, le=10),
    service: ExperimentService = Depends(get_service),
) -> ExperimentListResponse:
    try:
        return service.get_related(experiment_id, limit)
    except ExperimentNotFoundError as error:
        raise HTTPException(status_code=404, detail="Experiment not found") from error


@router.get("/{experiment_id}", response_model=ExperimentDetail)
def get_experiment(
    experiment_id: str,
    version: int | None = Query(default=None, ge=1),
    service: ExperimentService = Depends(get_service),
) -> ExperimentDetail:
    try:
        return service.get_experiment(experiment_id, version)
    except ExperimentVersionNotFoundError as error:
        raise HTTPException(status_code=404, detail="Experiment version not found") from error
    except ExperimentNotFoundError as error:
        raise HTTPException(status_code=404, detail="Experiment not found") from error
