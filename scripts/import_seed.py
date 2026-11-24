import argparse
import json
import sys
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "api"))
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from app.db.models import (
    disciplines,
    experiment_formulas,
    experiment_versions,
    experiments,
    papers,
)
from app.repositories.seed_repository import SeedRepository
from validate_seed import (
    BASE_EXPERIMENT_IDS,
    SeedValidationError,
    load_and_validate,
    normalize_experiment_name,
)

DEFAULT_SEED_PATH = PROJECT_ROOT / "data" / "seeds" / "experiments.json"
DEFAULT_DATABASE_PATH = PROJECT_ROOT / "data" / "envirolab.db"
SIMILARITY_THRESHOLD = 0.82


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Preview and import the experiment seed with duplicate checks."
    )
    parser.add_argument("--seed", type=Path, default=DEFAULT_SEED_PATH)
    parser.add_argument(
        "--database",
        type=Path,
        default=DEFAULT_DATABASE_PATH,
        help="Target SQLite file. Applying is refused for the default database unless --allow-default-database is also set.",
    )
    parser.add_argument("--apply", action="store_true", help="Write the seed to the target database.")
    parser.add_argument(
        "--allow-default-database",
        action="store_true",
        help="Explicitly allow --apply to modify data/envirolab.db.",
    )
    parser.add_argument("--json", action="store_true", help="Print the full report as JSON.")
    return parser.parse_args()


def make_engine(database_path: Path, create_schema: bool):
    engine = create_engine(
        f"sqlite:///{database_path.as_posix()}",
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,
    )
    if create_schema:
        from app.db.models import metadata

        metadata.create_all(engine)
    return engine


def load_existing_state(engine) -> dict:
    with Session(engine) as db:
        experiment_rows = db.execute(
            select(experiments.c.id, experiments.c.name, experiments.c.current_version)
        ).all()
        discipline_ids = set(db.scalars(select(disciplines.c.id)).all())
        paper_ids = set(db.scalars(select(papers.c.id)).all())
        counts = {
            "disciplines": db.scalar(select(func.count()).select_from(disciplines)) or 0,
            "experiments": db.scalar(select(func.count()).select_from(experiments)) or 0,
            "versions": db.scalar(select(func.count()).select_from(experiment_versions)) or 0,
            "formulas": db.scalar(select(func.count()).select_from(experiment_formulas)) or 0,
            "papers": db.scalar(select(func.count()).select_from(papers)) or 0,
        }
        duplicate_names = db.execute(
            select(experiments.c.name, func.count())
            .group_by(experiments.c.name)
            .having(func.count() > 1)
        ).all()
    return {
        "experiments": {
            row.id: {"name": row.name, "current_version": row.current_version}
            for row in experiment_rows
        },
        "discipline_ids": discipline_ids,
        "paper_ids": paper_ids,
        "counts": counts,
        "duplicate_names": [{"name": name, "count": count} for name, count in duplicate_names],
    }


def similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, normalize_experiment_name(left), normalize_experiment_name(right)).ratio()


def build_preview(seed, existing_state: dict) -> dict:
    existing_experiments = existing_state["experiments"]
    seed_ids = {experiment.id for experiment in seed.experiments}
    new_ids = sorted(seed_ids - set(existing_experiments))
    existing_ids = sorted(seed_ids & set(existing_experiments))

    potential_duplicates = []
    for experiment in seed.experiments:
        if experiment.id in existing_experiments:
            continue
        for existing_id, existing in existing_experiments.items():
            score = similarity(experiment.name, existing["name"])
            if score >= SIMILARITY_THRESHOLD:
                potential_duplicates.append(
                    {
                        "new_id": experiment.id,
                        "new_name": experiment.name,
                        "existing_id": existing_id,
                        "existing_name": existing["name"],
                        "similarity": round(score, 3),
                    }
                )
    potential_duplicates.sort(key=lambda item: item["similarity"], reverse=True)

    missing_disciplines = sorted(
        {experiment.discipline_id for experiment in seed.experiments}
        - existing_state["discipline_ids"]
        - {discipline.id for discipline in seed.disciplines}
    )
    missing_base_ids = sorted(set(BASE_EXPERIMENT_IDS) - seed_ids)
    review_counts = Counter(experiment.review_status for experiment in seed.experiments)

    new_versions = [
        experiment
        for experiment in seed.experiments
        if experiment.id not in existing_experiments
        or experiment.version > existing_experiments[experiment.id]["current_version"]
    ]
    new_paper_ids = {
        paper.id for experiment in seed.experiments for paper in experiment.papers
    } - existing_state["paper_ids"]

    return {
        "seed": {
            "disciplines": len(seed.disciplines),
            "experiments": len(seed.experiments),
            "formulas": sum(len(experiment.formulas) for experiment in seed.experiments),
            "papers": len({paper.id for experiment in seed.experiments for paper in experiment.papers}),
            "review_status": dict(review_counts),
        },
        "existing": {
            "experiments": existing_state["counts"]["experiments"],
            "versions": existing_state["counts"]["versions"],
            "formulas": existing_state["counts"]["formulas"],
            "papers": existing_state["counts"]["papers"],
            "duplicate_names": existing_state["duplicate_names"],
        },
        "new_experiment_ids": new_ids,
        "existing_experiment_ids": existing_ids,
        "potential_duplicate_names": potential_duplicates,
        "missing_base_experiment_ids": missing_base_ids,
        "experiment_names_are_unique_in_seed": len(
            {normalize_experiment_name(experiment.name) for experiment in seed.experiments}
        )
        == len(seed.experiments),
        "missing_discipline_ids": missing_disciplines,
        "estimated_after_import": {
            "experiments": existing_state["counts"]["experiments"] + len(new_ids),
            "versions": existing_state["counts"]["versions"] + len(new_versions),
            "formulas": existing_state["counts"]["formulas"]
            + sum(len(experiment.formulas) for experiment in new_versions),
            "papers": existing_state["counts"]["papers"] + len(new_paper_ids),
        },
    }


def apply_seed(seed, engine) -> None:
    with Session(engine) as db:
        repository = SeedRepository(db)
        try:
            with db.begin():
                for discipline in seed.disciplines:
                    repository.import_discipline(discipline)
                for experiment in seed.experiments:
                    repository.import_experiment(experiment)
        except Exception:
            db.rollback()
            raise


def post_import_report(engine) -> dict:
    with Session(engine) as db:
        counts = {
            "disciplines": db.scalar(select(func.count()).select_from(disciplines)) or 0,
            "experiments": db.scalar(select(func.count()).select_from(experiments)) or 0,
            "versions": db.scalar(select(func.count()).select_from(experiment_versions)) or 0,
            "formulas": db.scalar(select(func.count()).select_from(experiment_formulas)) or 0,
            "papers": db.scalar(select(func.count()).select_from(papers)) or 0,
        }
        duplicate_names = db.execute(
            select(experiments.c.name, func.count())
            .group_by(experiments.c.name)
            .having(func.count() > 1)
        ).all()
        duplicate_versions = db.execute(
            select(experiment_versions.c.experiment_id, func.count())
            .group_by(experiment_versions.c.experiment_id)
            .having(func.count() > 1)
        ).all()
    return {
        "counts": counts,
        "duplicate_experiment_names": [
            {"name": name, "count": count} for name, count in duplicate_names
        ],
        "duplicate_version_owners": [
            {"experiment_id": experiment_id, "count": count}
            for experiment_id, count in duplicate_versions
        ],
    }


def print_human_report(report: dict) -> None:
    preview = report["preview"]
    print(f"Seed: {report['seed_path']}")
    print(f"Database: {report['database_path']} (exists before: {report['database_existed_before']})")
    print(
        "Seed records: "
        f"{preview['seed']['disciplines']} disciplines, "
        f"{preview['seed']['experiments']} experiments, "
        f"{preview['seed']['formulas']} formulas, "
        f"{preview['seed']['papers']} unique papers"
    )
    print(
        "Review status: "
        + ", ".join(f"{status}={count}" for status, count in preview["seed"]["review_status"].items())
    )
    print(f"New experiments: {len(preview['new_experiment_ids'])}")
    if preview["new_experiment_ids"]:
        print("  " + ", ".join(preview["new_experiment_ids"]))
    print(f"Existing experiments updated: {len(preview['existing_experiment_ids'])}")
    print(
        "Estimated after import: "
        f"{preview['estimated_after_import']['experiments']} experiments, "
        f"{preview['estimated_after_import']['versions']} versions, "
        f"{preview['estimated_after_import']['formulas']} formulas, "
        f"{preview['estimated_after_import']['papers']} papers"
    )
    print(f"Potential duplicate names: {len(preview['potential_duplicate_names'])}")
    for item in preview["potential_duplicate_names"]:
        print(
            f"  {item['new_id']} ({item['new_name']}) ~ "
            f"{item['existing_id']} ({item['existing_name']}) "
            f"similarity={item['similarity']}"
        )
    print(f"Missing base experiments: {preview['missing_base_experiment_ids'] or 'none'}")
    print(f"Missing disciplines: {preview['missing_discipline_ids'] or 'none'}")
    if report.get("post_import"):
        post = report["post_import"]
        print("Post-import counts: " + json.dumps(post["counts"], ensure_ascii=False))
        print(
            "Duplicate names after import: "
            + (json.dumps(post["duplicate_experiment_names"], ensure_ascii=False) or "none")
        )
        print(
            "Duplicate version owners after import: "
            + (json.dumps(post["duplicate_version_owners"], ensure_ascii=False) or "none")
        )


def main() -> int:
    args = parse_args()
    database_path = args.database.resolve()
    seed_path = args.seed.resolve()

    try:
        seed = load_and_validate(seed_path)
    except SeedValidationError as error:
        print(f"Import stopped: {error}", file=sys.stderr)
        return 1

    if args.apply and not args.allow_default_database and database_path == DEFAULT_DATABASE_PATH.resolve():
        print(
            "Refusing to write data/envirolab.db. Pass a different --database path, "
            "or add --allow-default-database after an explicit backup.",
            file=sys.stderr,
        )
        return 2

    database_existed_before = database_path.exists()
    if args.apply:
        database_path.parent.mkdir(parents=True, exist_ok=True)
        engine = make_engine(database_path, create_schema=True)
        existing_state = load_existing_state(engine)
    elif database_existed_before:
        engine = make_engine(database_path, create_schema=False)
        existing_state = load_existing_state(engine)
    else:
        engine = None
        existing_state = {
            "experiments": {},
            "discipline_ids": set(),
            "paper_ids": set(),
            "counts": {
                "disciplines": 0,
                "experiments": 0,
                "versions": 0,
                "formulas": 0,
                "papers": 0,
            },
            "duplicate_names": [],
        }

    preview = build_preview(seed, existing_state)
    report = {
        "status": "applied" if args.apply else "preview",
        "seed_path": str(seed_path),
        "database_path": str(database_path),
        "database_existed_before": database_existed_before,
        "preview": preview,
        "post_import": None,
    }

    if args.apply:
        assert engine is not None
        apply_seed(seed, engine)
        report["post_import"] = post_import_report(engine)
        engine.dispose()

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_human_report(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())