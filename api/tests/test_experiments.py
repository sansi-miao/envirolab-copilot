from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_disciplines_include_all_categories_and_counts() -> None:
    response = client.get("/api/disciplines")

    assert response.status_code == 200
    disciplines = response.json()
    assert len(disciplines) == 16
    assert disciplines[0]["name"] == "数学与统计学"
    environmental = next(item for item in disciplines if item["id"] == "environmental_engineering")
    assert environmental["experiment_count"] == 13


def test_experiment_list_contains_30_archives() -> None:
    response = client.get("/api/experiments", params={"limit": 100})

    assert response.status_code == 200
    result = response.json()
    assert result["total"] == 30
    assert len(result["items"]) == 30
    assert all(item["review_status"] == "pending_review" for item in result["items"])
    assert all(item["calculation_status"] == "not_implemented" for item in result["items"])


def test_pagination_preserves_total() -> None:
    response = client.get("/api/experiments", params={"limit": 5, "offset": 5})

    assert response.status_code == 200
    result = response.json()
    assert result["total"] == 30
    assert len(result["items"]) == 5
    assert result["limit"] == 5
    assert result["offset"] == 5


def test_search_finds_ammonia_experiment() -> None:
    response = client.get("/api/experiments/search", params={"q": "氨氮"})

    assert response.status_code == 200
    result = response.json()
    assert result["total"] >= 1
    assert any(item["id"] == "water-ammonia-nessler" for item in result["items"])


def test_discipline_filter_returns_biology_archive() -> None:
    response = client.get(
        "/api/experiments",
        params={"discipline_id": "biology", "limit": 100},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["total"] == 4
    assert all(item["discipline_id"] == "biology" for item in result["items"])
    assert any(
        item["id"] == "water-chlorophyll-a-spectrophotometric"
        for item in result["items"]
    )


def test_detail_contains_complete_method_and_traceable_source() -> None:
    response = client.get("/api/experiments/water-cod-dichromate")

    assert response.status_code == 200
    result = response.json()
    assert result["name"] == "水质化学需氧量的测定（重铬酸盐法）"
    assert len(result["method"]["steps"]) >= 4
    assert len(result["formulas"]) >= 1
    assert result["formulas"][0]["applicable_conditions"]
    assert result["papers"][0]["title"] == "水质 化学需氧量的测定 重铬酸盐法"
    assert result["papers"][0]["url"].startswith("https://www.mee.gov.cn/")
    assert result["papers"][0]["source_access"] == "official_document"


def test_related_experiments_exclude_source() -> None:
    response = client.get("/api/experiments/water-ph-electrode/related")

    assert response.status_code == 200
    result = response.json()
    assert result["total"] >= 1
    assert all(item["id"] != "water-ph-electrode" for item in result["items"])
    assert any(item["discipline_id"] == "environmental_engineering" for item in result["items"])


def test_empty_search_returns_no_items() -> None:
    response = client.get("/api/experiments/search", params={"q": "不存在的实验关键词"})

    assert response.status_code == 200
    assert response.json()["total"] == 0
    assert response.json()["items"] == []


def test_unknown_experiment_returns_404() -> None:
    response = client.get("/api/experiments/not-a-real-experiment")

    assert response.status_code == 404
    assert response.json()["detail"] == "Experiment not found"


def test_search_requires_keyword() -> None:
    response = client.get("/api/experiments/search")

    assert response.status_code == 422
