import json
from pathlib import Path

import httpx

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SEED_PATH = PROJECT_ROOT / "data" / "seeds" / "experiments.json"
OUTPUT_PATH = PROJECT_ROOT / ".cache" / "source-check.json"


def main() -> None:
    payload = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    sources = {
        paper["id"]: paper
        for experiment in payload["experiments"]
        for paper in experiment["papers"]
    }
    results = []
    with httpx.Client(
        follow_redirects=True,
        trust_env=False,
        timeout=httpx.Timeout(20.0, connect=10.0),
        headers={"User-Agent": "EnviroLabCopilotSourceCheck/0.2"},
    ) as client:
        for source in sources.values():
            try:
                with client.stream("GET", source["url"]) as response:
                    status = response.status_code
                result = {
                    "id": source["id"],
                    "url": source["url"],
                    "http_status": status,
                    "reachable": status < 400,
                    "access_note": "reachable" if status < 400 else "restricted_or_unavailable",
                }
            except httpx.HTTPError as error:
                result = {
                    "id": source["id"],
                    "url": source["url"],
                    "http_status": None,
                    "reachable": False,
                    "access_note": type(error).__name__,
                }
            results.append(result)
            print(f"{result['id']}: {result['http_status'] or result['access_note']}")

    OUTPUT_PATH.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    reachable = sum(item["reachable"] for item in results)
    print(f"Reachable: {reachable}/{len(results)}; details: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
