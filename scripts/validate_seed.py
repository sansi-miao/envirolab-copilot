import json
import sys
from collections import Counter
from pathlib import Path

from pydantic import ValidationError

API_ROOT = Path(__file__).resolve().parents[1] / "api"
sys.path.insert(0, str(API_ROOT))

from app.schemas.experiment import SeedCollection

BASE_EXPERIMENT_IDS = (
    "water-ph-electrode",
    "water-conductivity-electrode",
    "water-turbidity-nephelometry",
    "water-dissolved-oxygen-probe",
    "water-cod-dichromate",
    "water-bod5-dilution-seeding",
    "water-ammonia-nessler",
    "water-total-phosphorus-molybdate",
    "water-nitrate-ion-chromatography",
    "air-pm25-gravimetric",
    "water-chlorophyll-a-spectrophotometric",
    "simple-pendulum-gravity",
    "acetic-acid-titration",
    "metal-tensile-test",
    "calibration-linear-regression",
)


def normalize_experiment_name(name: str) -> str:
    return "".join(character for character in name.lower() if character.isalnum())


class SeedValidationError(ValueError):
    pass


def load_and_validate(seed_path: Path) -> SeedCollection:
    try:
        payload = json.loads(seed_path.read_text(encoding="utf-8"))
        seed = SeedCollection.model_validate(payload)
    except json.JSONDecodeError as error:
        raise SeedValidationError(f"Invalid JSON: {error}") from error
    except ValidationError as error:
        raise SeedValidationError(error) from error

    errors: list[str] = []
    if len(seed.experiments) < len(BASE_EXPERIMENT_IDS):
        errors.append(
            f"Expected at least {len(BASE_EXPERIMENT_IDS)} experiments, found {len(seed.experiments)}"
        )

    experiment_ids = {experiment.id for experiment in seed.experiments}
    missing_base_ids = [experiment_id for experiment_id in BASE_EXPERIMENT_IDS if experiment_id not in experiment_ids]
    if missing_base_ids:
        errors.append(f"Base experiments must be retained: {missing_base_ids}")

    normalized_names: dict[str, str] = {}
    for experiment in seed.experiments:
        normalized = normalize_experiment_name(experiment.name)
        if normalized in normalized_names:
            errors.append(
                f"{experiment.id}: duplicate experiment name with {normalized_names[normalized]}"
            )
        normalized_names[normalized] = experiment.id

    formula_ids: list[str] = []
    paper_definitions: dict[str, tuple[str, str]] = {}
    for experiment in seed.experiments:
        if experiment.created_at > experiment.updated_at:
            errors.append(f"{experiment.id}: created_at is after updated_at")
        for formula in experiment.formulas:
            formula_ids.append(formula.id)
            if not formula.applicable_conditions.strip():
                errors.append(f"{experiment.id}/{formula.id}: missing applicable conditions")
        for paper in experiment.papers:
            definition = (paper.title, paper.url)
            if paper.id in paper_definitions and paper_definitions[paper.id] != definition:
                errors.append(f"{experiment.id}/{paper.id}: shared paper has conflicting metadata")
            paper_definitions[paper.id] = definition

    duplicate_formulas = [item for item in set(formula_ids) if formula_ids.count(item) > 1]
    if duplicate_formulas:
        errors.append(f"Formula IDs must be globally unique: {duplicate_formulas}")

    if errors:
        raise SeedValidationError("\n".join(errors))
    return seed


def main() -> int:
    seed_path = Path(__file__).resolve().parents[1] / "data" / "seeds" / "experiments.json"
    try:
        seed = load_and_validate(seed_path)
    except SeedValidationError as error:
        print(f"Seed validation failed:\n{error}", file=sys.stderr)
        return 1

    review_counts = Counter(item.review_status for item in seed.experiments)
    source_count = len({paper.id for item in seed.experiments for paper in item.papers})
    formula_count = sum(len(item.formulas) for item in seed.experiments)
    experiment_ids = {item.id for item in seed.experiments}
    new_experiment_ids = sorted(experiment_ids - set(BASE_EXPERIMENT_IDS))
    print(
        json.dumps(
            {
                "status": "valid",
                "disciplines": len(seed.disciplines),
                "experiments": len(seed.experiments),
                "base_experiments_present": len(BASE_EXPERIMENT_IDS),
                "new_experiments": new_experiment_ids,
                "formulas": formula_count,
                "unique_sources": source_count,
                "review_status": dict(review_counts),
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
