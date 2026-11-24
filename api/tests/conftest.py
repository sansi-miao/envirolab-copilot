import json
import os
from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

os.environ.setdefault("LITERATURE_RATE_LIMIT_BACKEND", "memory")

from app.db.models import metadata
from app.db.session import get_db
from app.main import app
from app.repositories.seed_repository import SeedRepository
from app.schemas.experiment import DisciplineSeed, ExperimentDetail

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SEED_PATH = PROJECT_ROOT / "data" / "seeds" / "experiments.json"


@dataclass
class IsolatedEnvironment:
    client: TestClient
    session_factory: sessionmaker
    payload: dict


@pytest.fixture()
def isolated_api(tmp_path):
    database_path = tmp_path / "test.db"
    engine = create_engine(
        f"sqlite:///{database_path.as_posix()}",
        connect_args={"check_same_thread": False},
    )
    metadata.create_all(engine)
    test_session = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)

    payload = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    discipline = DisciplineSeed.model_validate(
        next(
            item
            for item in payload["disciplines"]
            if item["id"] == "environmental_engineering"
        )
    )
    experiment = ExperimentDetail.model_validate(
        next(
            item
            for item in payload["experiments"]
            if item["id"] == "water-cod-dichromate"
        )
    )
    with test_session() as db, db.begin():
        repository = SeedRepository(db)
        repository.import_discipline(discipline)
        repository.import_experiment(experiment)

    def override_get_db():
        db = test_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            yield IsolatedEnvironment(
                client=client,
                session_factory=test_session,
                payload=payload,
            )
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()
