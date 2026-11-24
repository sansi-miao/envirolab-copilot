import json
from pathlib import Path

from seed_environment import ENVIRONMENTAL_EXPERIMENTS
from seed_expansion import EXPANSION_EXPERIMENTS
from seed_expansion_batch2 import EXPANSION_BATCH2_EXPERIMENTS
from seed_foundational import FOUNDATIONAL_EXPERIMENTS
from seed_helpers import DISCIPLINES

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = PROJECT_ROOT / "data" / "seeds" / "experiments.json"


def main() -> None:
    experiments = [
        *ENVIRONMENTAL_EXPERIMENTS,
        *FOUNDATIONAL_EXPERIMENTS,
        *EXPANSION_EXPERIMENTS,
        *EXPANSION_BATCH2_EXPERIMENTS,
    ]
    payload = {"disciplines": DISCIPLINES, "experiments": experiments}
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(experiments)} experiments to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
