from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.experiment_repository import ExperimentRepository
from app.schemas.experiment import DisciplineResponse

router = APIRouter(prefix="/disciplines", tags=["disciplines"])


@router.get("", response_model=list[DisciplineResponse])
def list_disciplines(db: Session = Depends(get_db)) -> list[DisciplineResponse]:
    return ExperimentRepository(db).list_disciplines()
