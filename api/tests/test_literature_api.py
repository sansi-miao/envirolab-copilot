import logging

import pytest
from fastapi.testclient import TestClient

from app.core.config import RateLimitConfig
from app.main import app
from app.schemas.literature import (
    LiteratureHealthResponse,
    LiteratureItem,
    LiteratureSearchRequest,
    LiteratureSearchResponse,
)
from app.services.literature import LiteratureError
from app.services.rate_limit import InMemoryRateLimiter

ALLOWED_ORIGIN = "http://127.0.0.1:5173"
DENIED_ORIGIN = "https://denied.example"


def sample_response(query: str) -> LiteratureSearchResponse:
    return LiteratureSearchResponse(
        query=query,
        mode="keyword",
        retrieved_at="2026-11-20T00:00:00Z",
        total=1,
        page=1,
        page_size=20,
        items=[
            LiteratureItem(
                doi="10.1000/example",
                title="Example paper",
                authors=["Example Author"],
                year=2024,
                venue="Example Journal",
                url="https://doi.org/10.1000/example",
                open_access_status="unknown",
            )
        ],
    )


class FakeLiteratureService:
    def __init__(self, error: LiteratureError | None = None) -> None:
        self.error = error
        self.calls = 0
        self.health_calls = 0

    async def search(self, request: LiteratureSearchRequest) -> LiteratureSearchResponse:
        self.calls += 1
        if self.error is not None:
            raise self.error
        return sample_response(request.query)

    def health(self) -> LiteratureHealthResponse:
        self.health_calls += 1
        return LiteratureHealthResponse(
            status="ready",
            configured=True,
            checked_at="2026-11-20T00:00:00Z",
            last_success_at="2026-11-20T00:00:00Z",
        )


@pytest.fixture()
def api_client():
    with TestClient(app) as client:
        app.state.rate_limiter = InMemoryRateLimiter()
        app.state.rate_limit_config = RateLimitConfig(
            per_ip_limit=100,
            per_ip_window=60,
            global_limit=100,
            global_window=60,
        )
        yield client


def test_allowed_origin_preflight_and_json_post(api_client) -> None:
    service = FakeLiteratureService()
    app.state.literature_service = service

    preflight = api_client.options(
        "/api/literature/search",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    allowed_methods = preflight.headers["access-control-allow-methods"].lower()
    allowed_headers = preflight.headers["access-control-allow-headers"].lower()
    assert "post" in allowed_methods
    assert "get" in allowed_methods
    assert "content-type" in allowed_headers
    assert "accept" in allowed_headers
    assert "access-control-allow-credentials" not in preflight.headers

    response = api_client.post(
        "/api/literature/search",
        json={"query": "activated carbon", "mode": "keyword"},
        headers={"Origin": ALLOWED_ORIGIN},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.json()["items"][0]["doi"] == "10.1000/example"
    assert service.calls == 1


def test_denied_origin_preflight_returns_400_without_cors_headers(api_client) -> None:
    response = api_client.options(
        "/api/literature/search",
        headers={
            "Origin": DENIED_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
    assert "access-control-allow-credentials" not in response.headers


def test_denied_origin_post_has_no_cors_permission(api_client) -> None:
    service = FakeLiteratureService()
    app.state.literature_service = service

    response = api_client.post(
        "/api/literature/search",
        json={"query": "carbon", "mode": "keyword"},
        headers={"Origin": DENIED_ORIGIN},
    )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
    assert service.calls == 1


def test_literature_health_is_local_and_cors_readable(api_client) -> None:
    service = FakeLiteratureService()
    app.state.literature_service = service

    response = api_client.get(
        "/api/literature/health",
        headers={"Origin": ALLOWED_ORIGIN},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.json()["status"] == "ready"
    assert service.health_calls == 1
    assert service.calls == 0


def test_invalid_request_uses_json_error_envelope(api_client) -> None:
    service = FakeLiteratureService()
    app.state.literature_service = service

    response = api_client.post(
        "/api/literature/search",
        json={"query": "   ", "mode": "keyword"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
    assert response.json()["error"]["message"]
    assert service.calls == 0


def test_invalid_doi_uses_invalid_request_envelope(api_client) -> None:
    response = api_client.post(
        "/api/literature/search",
        json={"query": "not-a-doi", "mode": "doi"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


@pytest.mark.parametrize(
    "payload",
    [
        {"query": "x" * 201, "mode": "keyword"},
        {"query": "carbon", "mode": "keyword", "year_from": 2025, "year_to": 2020},
        {"query": "carbon", "mode": "keyword", "page": 0},
        {"query": "carbon", "mode": "keyword", "page": 101},
        {"query": "carbon", "mode": "keyword", "page_size": 0},
        {"query": "carbon", "mode": "keyword", "page_size": 51},
        {"query": "10.1000/example", "mode": "doi", "year_from": 2020},
    ],
)
def test_invalid_search_fields_use_error_envelope(api_client, payload) -> None:
    service = FakeLiteratureService()
    app.state.literature_service = service

    response = api_client.post("/api/literature/search", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
    assert service.calls == 0


def test_per_ip_rate_limit_returns_429_with_retry_after(api_client) -> None:
    service = FakeLiteratureService()
    app.state.literature_service = service
    app.state.rate_limit_config = RateLimitConfig(
        per_ip_limit=1,
        per_ip_window=60,
        global_limit=100,
        global_window=60,
    )
    app.state.rate_limiter = InMemoryRateLimiter()

    first = api_client.post(
        "/api/literature/search",
        json={"query": "carbon", "mode": "keyword"},
    )
    second = api_client.post(
        "/api/literature/search",
        json={"query": "carbon", "mode": "keyword"},
    )

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "rate_limited"
    assert second.json()["error"]["retry_after"] >= 1
    assert int(second.headers["retry-after"]) >= 1
    assert service.calls == 1


def test_global_rate_limit_returns_429(api_client) -> None:
    service = FakeLiteratureService()
    app.state.literature_service = service
    app.state.rate_limit_config = RateLimitConfig(
        per_ip_limit=100,
        per_ip_window=60,
        global_limit=1,
        global_window=60,
    )
    app.state.rate_limiter = InMemoryRateLimiter()

    first = api_client.post(
        "/api/literature/search",
        json={"query": "carbon", "mode": "keyword"},
    )
    second = api_client.post(
        "/api/literature/search",
        json={"query": "carbon", "mode": "keyword"},
    )

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "rate_limited"
    assert service.calls == 1


def test_search_logs_omit_query_and_include_request_id(api_client, caplog) -> None:
    service = FakeLiteratureService()
    app.state.literature_service = service

    with caplog.at_level(logging.INFO, logger="app.literature"):
        response = api_client.post(
            "/api/literature/search",
            json={"query": "private research topic", "mode": "keyword"},
        )

    assert response.status_code == 200
    assert "private research topic" not in caplog.text
    assert "literature_search status=200" in caplog.text
    assert "request_id=" in caplog.text


def test_upstream_timeout_keeps_error_envelope_and_cors(api_client) -> None:
    service = FakeLiteratureService(
        LiteratureError(
            504,
            "upstream_timeout",
            "文献服务响应超时，请稍后重试。",
        )
    )
    app.state.literature_service = service

    response = api_client.post(
        "/api/literature/search",
        json={"query": "carbon", "mode": "keyword"},
        headers={"Origin": ALLOWED_ORIGIN},
    )

    assert response.status_code == 504
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.json()["error"]["code"] == "upstream_timeout"