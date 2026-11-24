from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "envirolab-copilot-api",
        "version": "0.1.0",
    }


def test_unknown_route_returns_404() -> None:
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404
