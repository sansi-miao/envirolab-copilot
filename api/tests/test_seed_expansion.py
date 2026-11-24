import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "api"))
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from app.db.session import get_db
from app.main import app
from import_seed import apply_seed, make_engine, post_import_report
from validate_seed import (
    BASE_EXPERIMENT_IDS,
    SeedValidationError,
    load_and_validate,
)

SEED_PATH = PROJECT_ROOT / "data" / "seeds" / "experiments.json"
EXPANSION_IDS = {
    "density-solid-liquid",
    "thin-lens-focal-length",
    "water-hardness-edta",
    "onion-epidermis-microscopy",
    "campus-noise-monitoring",
}
EXPANSION_BATCH2_IDS = {
    "volt-ampere-resistance",
    "oscilloscope-waveform-measurement",
    "youngs-modulus-determination",
    "kmno4-hydrogen-peroxide-titration",
    "iron-phenanthroline-spectrophotometry",
    "acetic-acid-conductivity-ka",
    "plant-cell-plasmolysis",
    "onion-root-mitosis",
    "soil-ph-electrical-conductivity",
    "residual-chlorine-dpd",
}
NEW_EXPERIMENT_IDS = EXPANSION_IDS | EXPANSION_BATCH2_IDS


def write_modified_seed(tmp_path: Path, mutate) -> Path:
    payload = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    mutate(payload)
    path = tmp_path / "experiments.json"
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return path


def test_seed_accepts_thirty_and_retains_base_ids() -> None:
    seed = load_and_validate(SEED_PATH)
    experiment_ids = {experiment.id for experiment in seed.experiments}

    assert len(seed.experiments) == 30
    assert set(BASE_EXPERIMENT_IDS).issubset(experiment_ids)
    assert NEW_EXPERIMENT_IDS.issubset(experiment_ids)
    assert all(
        experiment.review_status == "pending_review" for experiment in seed.experiments
    )


def test_new_experiments_document_recording_fields_and_sources() -> None:
    seed = load_and_validate(SEED_PATH)
    by_id = {experiment.id: experiment for experiment in seed.experiments}

    for experiment_id in EXPANSION_BATCH2_IDS:
        experiment = by_id[experiment_id]
        assert "适用课程" in experiment.summary
        assert "记录字段" in experiment.method.data_processing
        assert experiment.papers
        assert all(paper.url.startswith("https://") or paper.url.startswith("http://") for paper in experiment.papers)


def test_duplicate_experiment_name_is_rejected(tmp_path: Path) -> None:
    def mutate(payload: dict) -> None:
        for experiment in payload["experiments"]:
            if experiment["id"] == "density-solid-liquid":
                experiment["name"] = "用单摆测定重力加速度"
                break

    path = write_modified_seed(tmp_path, mutate)
    with pytest.raises(SeedValidationError, match="duplicate experiment name"):
        load_and_validate(path)


def test_missing_base_experiment_is_rejected(tmp_path: Path) -> None:
    def mutate(payload: dict) -> None:
        payload["experiments"] = [
            experiment
            for experiment in payload["experiments"]
            if experiment["id"] != "water-ph-electrode"
        ]

    path = write_modified_seed(tmp_path, mutate)
    with pytest.raises(SeedValidationError, match="Base experiments must be retained"):
        load_and_validate(path)


def test_repeated_import_is_idempotent_in_temp_database(tmp_path: Path) -> None:
    seed = load_and_validate(SEED_PATH)
    database_path = tmp_path / "expanded-seed.db"
    engine = make_engine(database_path, create_schema=True)

    apply_seed(seed, engine)
    first = post_import_report(engine)
    apply_seed(seed, engine)
    second = post_import_report(engine)

    assert first["counts"] == second["counts"] == {
        "disciplines": 16,
        "experiments": 30,
        "versions": 30,
        "formulas": sum(len(experiment.formulas) for experiment in seed.experiments),
        "papers": 30,
    }
    assert second["duplicate_experiment_names"] == []
    assert second["duplicate_version_owners"] == []
    engine.dispose()


def test_expanded_catalog_is_visible_through_api(tmp_path: Path) -> None:
    seed = load_and_validate(SEED_PATH)
    database_path = tmp_path / "expanded-api.db"
    engine = make_engine(database_path, create_schema=True)
    apply_seed(seed, engine)
    test_session = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)

    def override_get_db():
        db = test_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        client = TestClient(app)

        listing = client.get("/api/experiments", params={"limit": 100})
        assert listing.status_code == 200
        result = listing.json()
        assert result["total"] == 30
        returned_ids = {item["id"] for item in result["items"]}
        assert NEW_EXPERIMENT_IDS.issubset(returned_ids)

        for keyword, expected_id in (
            ("噪声", "campus-noise-monitoring"),
            ("示波器", "oscilloscope-waveform-measurement"),
            ("有丝分裂", "onion-root-mitosis"),
            ("余氯", "residual-chlorine-dpd"),
        ):
            search = client.get("/api/experiments/search", params={"q": keyword})
            assert search.status_code == 200
            assert any(
                item["id"] == expected_id for item in search.json()["items"]
            ), f"{keyword} should find {expected_id}"

        density = client.get("/api/experiments/density-solid-liquid")
        assert density.status_code == 200
        density_detail = density.json()
        assert len(density_detail["formulas"]) == 3
        assert density_detail["papers"][0]["url"].startswith("https://chem.libretexts.org/")

        onion = client.get("/api/experiments/onion-epidermis-microscopy")
        assert onion.status_code == 200
        assert onion.json()["formulas"][0]["id"] == "microscope-total-magnification"

        youngs = client.get("/api/experiments/youngs-modulus-determination")
        assert youngs.status_code == 200
        assert youngs.json()["evidence_status"] == "source_verified"

        chlorine = client.get("/api/experiments/residual-chlorine-dpd")
        assert chlorine.status_code == 200
        assert chlorine.json()["evidence_status"] == "partially_verified"

        for experiment_id in NEW_EXPERIMENT_IDS:
            detail = client.get(f"/api/experiments/{experiment_id}")
            assert detail.status_code == 200
            payload = detail.json()
            assert len(payload["method"]["steps"]) >= 4
            assert len(payload["formulas"]) >= 1
            assert len(payload["papers"]) >= 1
            assert payload["review_status"] == "pending_review"

        disciplines = client.get("/api/disciplines")
        assert disciplines.status_code == 200
        counts = {item["id"]: item["experiment_count"] for item in disciplines.json()}
        assert counts["biology"] == 4
        assert counts["physics"] == 6
        assert counts["chemistry"] == 5
        assert counts["environmental_engineering"] == 13
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()
