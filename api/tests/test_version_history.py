import copy
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.db.models import (
    evidence_items,
    experiment_formulas,
    experiment_methods,
    experiment_papers,
    experiment_versions,
    experiments,
)
from app.repositories.seed_repository import SeedRepository
from app.schemas.experiment import EvidenceItem, EvidenceTargetType, ExperimentDetail

EXPERIMENT_ID = "water-cod-dichromate"


def import_payload(session_factory, payload: dict) -> None:
    experiment = ExperimentDetail.model_validate(payload)
    with session_factory() as db, db.begin():
        SeedRepository(db).import_experiment(experiment)


def experiment_payload(environment) -> dict:
    return next(
        item
        for item in environment.payload["experiments"]
        if item["id"] == EXPERIMENT_ID
    )


def next_version_payload(original: dict) -> dict:
    payload = copy.deepcopy(original)
    payload["version"] += 1
    original_updated_at = datetime.fromisoformat(original["updated_at"])
    payload["updated_at"] = (original_updated_at + timedelta(days=1)).isoformat()
    payload["method"]["purpose"] = "新版方法用途：验证历史版本中的旧方法不会被覆盖。"
    payload["formulas"][0]["expression"] = "新版公式表达式"
    return payload


def row_count(environment, table) -> int:
    with environment.session_factory() as db:
        return db.scalar(
            select(func.count())
            .select_from(table)
            .where(table.c.experiment_id == EXPERIMENT_ID)
        )


def test_current_detail_uses_current_version_after_reimport(isolated_api) -> None:
    original = experiment_payload(isolated_api)
    updated = next_version_payload(original)
    import_payload(isolated_api.session_factory, updated)

    response = isolated_api.client.get(f"/api/experiments/{EXPERIMENT_ID}")

    assert response.status_code == 200
    detail = response.json()
    assert detail["version"] == updated["version"]
    assert detail["method"]["purpose"] == updated["method"]["purpose"]
    assert detail["formulas"][0]["expression"] == updated["formulas"][0]["expression"]
    assert detail["method"]["purpose"] != original["method"]["purpose"]


def test_old_version_remains_queryable(isolated_api) -> None:
    original = experiment_payload(isolated_api)
    original_version = original["version"]
    updated = next_version_payload(original)
    import_payload(isolated_api.session_factory, updated)

    versions = isolated_api.client.get(
        f"/api/experiments/{EXPERIMENT_ID}/versions"
    ).json()
    assert [item["version"] for item in versions] == [updated["version"], original_version]
    assert versions[0]["is_current"] is True
    assert versions[1]["is_current"] is False
    assert all(item["formula_count"] == len(original["formulas"]) for item in versions)

    history = isolated_api.client.get(
        f"/api/experiments/{EXPERIMENT_ID}/versions/{original_version}"
    )
    assert history.status_code == 200
    old = history.json()
    assert old["version"] == original_version
    assert old["method"]["purpose"] == original["method"]["purpose"]
    assert old["formulas"][0]["expression"] == original["formulas"][0]["expression"]

    queried = isolated_api.client.get(
        f"/api/experiments/{EXPERIMENT_ID}", params={"version": original_version}
    )
    assert queried.status_code == 200
    assert queried.json()["formulas"][0]["expression"] == original["formulas"][0]["expression"]

    assert (
        isolated_api.client.get(
            f"/api/experiments/{EXPERIMENT_ID}/versions/{updated['version'] + 1}"
        ).status_code
        == 404
    )


def test_reimporting_same_version_is_idempotent(isolated_api) -> None:
    original = experiment_payload(isolated_api)
    formula_count = len(original["formulas"])

    import_payload(isolated_api.session_factory, original)
    import_payload(isolated_api.session_factory, original)

    assert row_count(isolated_api, experiment_versions) == 1
    assert row_count(isolated_api, experiment_methods) == 1
    assert row_count(isolated_api, experiment_formulas) == formula_count
    assert row_count(isolated_api, experiment_papers) == len(original["papers"])

    updated = next_version_payload(original)
    import_payload(isolated_api.session_factory, updated)
    import_payload(isolated_api.session_factory, updated)

    assert row_count(isolated_api, experiment_versions) == 2
    assert row_count(isolated_api, experiment_methods) == 2
    assert row_count(isolated_api, experiment_formulas) == formula_count * 2

    import_payload(isolated_api.session_factory, original)

    assert row_count(isolated_api, experiment_versions) == 2
    assert row_count(isolated_api, experiment_methods) == 2
    assert row_count(isolated_api, experiment_formulas) == formula_count * 2
    current = isolated_api.client.get(f"/api/experiments/{EXPERIMENT_ID}").json()
    assert current["version"] == updated["version"]


def test_public_queries_hide_private_experiment(isolated_api) -> None:
    with isolated_api.session_factory() as db, db.begin():
        db.execute(
            experiments.update()
            .where(experiments.c.id == EXPERIMENT_ID)
            .values(is_public=False, owner_id="future-user")
        )

    listing = isolated_api.client.get("/api/experiments", params={"limit": 100})
    assert listing.status_code == 200
    assert listing.json()["total"] == 0
    assert listing.json()["items"] == []

    search = isolated_api.client.get(
        "/api/experiments/search", params={"q": "化学需氧量"}
    )
    assert search.json()["total"] == 0

    assert isolated_api.client.get(f"/api/experiments/{EXPERIMENT_ID}").status_code == 404
    assert (
        isolated_api.client.get(
            f"/api/experiments/{EXPERIMENT_ID}/versions"
        ).status_code
        == 404
    )
    assert (
        isolated_api.client.get(
            f"/api/experiments/{EXPERIMENT_ID}/related"
        ).status_code
        == 404
    )

    disciplines = isolated_api.client.get("/api/disciplines").json()
    assert disciplines[0]["experiment_count"] == 0

    write_attempt = isolated_api.client.post(
        "/api/experiments", json={"name": "not allowed"}
    )
    assert write_attempt.status_code == 405


def test_evidence_is_scoped_to_its_experiment_version(isolated_api) -> None:
    original = experiment_payload(isolated_api)
    formula_id = original["formulas"][0]["id"]
    original_version = original["version"]
    version_id = f"{EXPERIMENT_ID}:v{original_version}"
    evidence = EvidenceItem(
        id="evidence-cod-formula-page-7",
        source_id=original["papers"][0]["id"],
        experiment_id=EXPERIMENT_ID,
        version_id=version_id,
        target_type=EvidenceTargetType.FORMULA,
        target_id=formula_id,
        page="7",
        section="6.2",
        table_or_figure="表 1",
        excerpt="标准给出的公式及适用条件原文摘录。",
    )
    with isolated_api.session_factory() as db, db.begin():
        db.execute(
            evidence_items.insert().values(
                **evidence.model_dump(),
                created_at=datetime.now(timezone.utc),
            )
        )

    import_payload(isolated_api.session_factory, next_version_payload(original))
    history = isolated_api.client.get(
        f"/api/experiments/{EXPERIMENT_ID}/versions/{original_version}"
    )
    assert history.status_code == 200
    historical_evidence = history.json()["evidence"]
    assert len(historical_evidence) == 1
    assert historical_evidence[0]["source_id"] == original["papers"][0]["id"]
    assert historical_evidence[0]["target_id"] == formula_id
    assert historical_evidence[0]["page"] == "7"
    assert historical_evidence[0]["table_or_figure"] == "表 1"

    current = isolated_api.client.get(f"/api/experiments/{EXPERIMENT_ID}").json()
    assert current["evidence"] == []
