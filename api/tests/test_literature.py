import asyncio
import json

import httpx
import pytest
from pydantic import ValidationError

from app.schemas.literature import LiteratureSearchRequest, normalize_doi
from app.services.literature import (
    CrossrefService,
    CrossrefSettings,
    LiteratureError,
)


def run_with_service(handler, callback, settings=None):
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            service = CrossrefService(client, settings)
            return await callback(service)

    return asyncio.run(run())


def request(query="activated carbon", mode="keyword", **overrides):
    values = {"query": query, "mode": mode, **overrides}
    return LiteratureSearchRequest.model_validate(values)


def crossref_payload():
    return {
        "message": {
            "total-results": 3,
            "items": [
                {
                    "DOI": "10.1000/ABC",
                    "title": ["Activated carbon adsorption"],
                    "author": [
                        {"given": "Ada", "family": "Lovelace"},
                        {"name": "Research Group"},
                    ],
                    "issued": {"date-parts": [[2024, 5]]},
                    "container-title": ["Water Research"],
                    "URL": "https://example.org/paper-a",
                },
                {
                    "DOI": "https://doi.org/10.1000/abc",
                    "title": ["Duplicate DOI"],
                    "URL": "https://example.org/paper-a-duplicate",
                },
                {
                    "DOI": "10.1000/DEF",
                    "title": ["Second paper"],
                    "author": [{"given": "Grace", "family": "Hopper"}],
                    "published-print": {"date-parts": [[2022]]},
                    "publisher": "Example Press",
                    "URL": "https://example.org/paper-b",
                },
                {
                    "title": ["No verifiable link"],
                    "URL": "not-a-url",
                },
            ],
        }
    }


def test_request_normalizes_doi_and_rejects_year_filters() -> None:
    validated = request("https://doi.org/10.1000/ABC", mode="doi")
    assert validated.query == "10.1000/abc"

    with pytest.raises(ValidationError):
        request("10.1000/abc", mode="doi", year_from=2020)


def test_normalize_doi_supports_common_prefixes() -> None:
    assert normalize_doi("doi:10.1000/ABC") == "10.1000/abc"
    assert normalize_doi("http://dx.doi.org/10.1000/ABC") == "10.1000/abc"
    assert normalize_doi("not a doi") is None
    assert normalize_doi("10.1/too-short") is None


def test_keyword_search_maps_and_deduplicates_results() -> None:
    captured = {}

    def handler(incoming: httpx.Request) -> httpx.Response:
        captured["params"] = dict(incoming.url.params)
        captured["user_agent"] = incoming.headers.get("user-agent")
        captured["path"] = incoming.url.path
        return httpx.Response(200, json=crossref_payload())

    response = run_with_service(
        handler,
        lambda service: service.search(
            request(
                "  activated carbon  ",
                year_from=2019,
                year_to=2025,
                page=3,
                page_size=10,
            )
        ),
        CrossrefSettings(mailto="lab@example.org"),
    )

    assert captured["path"] == "/works"
    assert captured["params"]["query"] == "activated carbon"
    assert captured["params"]["rows"] == "10"
    assert captured["params"]["offset"] == "20"
    assert captured["params"]["filter"] == (
        "from-pub-date:2019-01-01,until-pub-date:2025-12-31"
    )
    assert captured["params"]["mailto"] == "lab@example.org"
    assert captured["user_agent"].startswith("EnviroLabCopilot/")
    assert response.total == 3
    assert response.page == 3
    assert response.page_size == 10
    assert len(response.items) == 2
    first = response.items[0]
    assert first.doi == "10.1000/abc"
    assert first.title == "Activated carbon adsorption"
    assert first.authors == ["Ada Lovelace", "Research Group"]
    assert first.year == 2024
    assert first.venue == "Water Research"
    assert first.url == "https://doi.org/10.1000/abc"
    assert first.open_access_status == "unknown"
    assert response.items[1].url == "https://doi.org/10.1000/def"


def test_keyword_search_returns_empty_results() -> None:
    response = run_with_service(
        lambda incoming: httpx.Response(
            200,
            json={"message": {"total-results": 0, "items": []}},
        ),
        lambda service: service.search(request("no matching phrase")),
    )

    assert response.total == 0
    assert response.items == []


def test_keyword_zero_results_are_normal_and_health_ready() -> None:
    async def callback(service):
        response = await service.search(request("no matching phrase"))
        return response, service.health()

    response, health = run_with_service(
        lambda incoming: httpx.Response(
            200,
            json={"message": {"total-results": 0, "items": []}},
        ),
        callback,
    )

    assert response.total == 0
    assert response.items == []
    assert health.status == "ready"


def test_doi_404_is_normal_zero_result_and_health_ready() -> None:
    async def callback(service):
        response = await service.search(request("10.1000/missing", mode="doi"))
        return response, service.health()

    response, health = run_with_service(
        lambda incoming: httpx.Response(404),
        callback,
    )

    assert response.total == 0
    assert response.items == []
    assert health.status == "ready"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"message": {"total-results": 0}},
        {"message": {"total-results": 0, "items": "not-a-list"}},
        {"message": []},
    ],
)
def test_invalid_keyword_structure_is_mapped_and_degrades(payload) -> None:
    async def callback(service):
        with pytest.raises(LiteratureError) as error:
            await service.search(request("carbon"))
        return error.value, service.health()

    error, health = run_with_service(
        lambda incoming: httpx.Response(200, json=payload),
        callback,
    )

    assert error.status_code == 503
    assert error.code == "upstream_invalid_response"
    assert health.status == "degraded"
    assert health.last_error_at is not None


def test_invalid_doi_message_type_is_mapped_and_degrades() -> None:
    async def callback(service):
        with pytest.raises(LiteratureError) as error:
            await service.search(request("10.1000/example", mode="doi"))
        return error.value, service.health()

    error, health = run_with_service(
        lambda incoming: httpx.Response(200, json={"message": ["not-an-object"]}),
        callback,
    )

    assert error.status_code == 503
    assert error.code == "upstream_invalid_response"
    assert health.status == "degraded"
    assert health.last_error_at is not None


def test_doi_search_uses_single_record_endpoint() -> None:
    captured = {}

    def handler(incoming: httpx.Request) -> httpx.Response:
        captured["path"] = incoming.url.path
        captured["params"] = dict(incoming.url.params)
        return httpx.Response(
            200,
            json={
                "message": {
                    "DOI": "10.1000/ABC",
                    "title": ["DOI paper"],
                    "URL": "https://example.org/doi-paper",
                }
            },
        )

    response = run_with_service(
        handler,
        lambda service: service.search(
            request("https://doi.org/10.1000/ABC", mode="doi")
        ),
    )

    assert captured["path"] == "/works/10.1000/abc"
    assert "query" not in captured["params"]
    assert response.total == 1
    assert response.items[0].doi == "10.1000/abc"
    assert response.items[0].title == "DOI paper"


def test_unknown_doi_returns_empty_success() -> None:
    response = run_with_service(
        lambda incoming: httpx.Response(404),
        lambda service: service.search(request("10.1000/missing", mode="doi")),
    )

    assert response.total == 0
    assert response.items == []


def test_upstream_rate_limit_is_mapped() -> None:
    def handler(incoming: httpx.Request) -> httpx.Response:
        return httpx.Response(429, headers={"Retry-After": "7"})

    with pytest.raises(LiteratureError) as error:
        run_with_service(
            handler,
            lambda service: service.search(request("carbon")),
        )

    assert error.value.status_code == 429
    assert error.value.code == "rate_limited"
    assert error.value.retry_after == 7


def test_upstream_timeout_is_mapped() -> None:
    def handler(incoming: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("simulated timeout")

    with pytest.raises(LiteratureError) as error:
        run_with_service(
            handler,
            lambda service: service.search(request("carbon")),
        )

    assert error.value.status_code == 504
    assert error.value.code == "upstream_timeout"


def test_upstream_server_error_raises_service_unavailable() -> None:
    def handler(incoming: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    with pytest.raises(LiteratureError) as error:
        run_with_service(
            handler,
            lambda service: service.search(request("carbon")),
        )

    assert error.value.status_code == 503
    assert error.value.code == "service_unavailable"


def test_oversized_response_is_rejected() -> None:
    def handler(incoming: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"x" * 101)

    with pytest.raises(LiteratureError) as error:
        run_with_service(
            handler,
            lambda service: service.search(request("carbon")),
            CrossrefSettings(max_response_bytes=100),
        )

    assert error.value.status_code == 503
    assert error.value.code == "upstream_response_too_large"


def test_invalid_upstream_json_is_rejected() -> None:
    def handler(incoming: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"not-json")

    with pytest.raises(LiteratureError) as error:
        run_with_service(
            handler,
            lambda service: service.search(request("carbon")),
        )

    assert error.value.status_code == 503
    assert error.value.code == "upstream_invalid_response"


def test_cache_avoids_duplicate_upstream_requests() -> None:
    calls = 0

    def handler(incoming: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            200,
            json={"message": {"total-results": 0, "items": []}},
        )

    async def callback(service):
        first = await service.search(request("carbon"))
        second = await service.search(request("carbon"))
        return first, second

    first, second = run_with_service(handler, callback)

    assert calls == 1
    assert first.items == second.items == []
    assert first.retrieved_at == second.retrieved_at


def test_health_transitions_from_unknown_to_ready_and_degraded() -> None:
    def handler(incoming: httpx.Request) -> httpx.Response:
        if incoming.url.params.get("query") == "success":
            return httpx.Response(
                200,
                json={"message": {"total-results": 0, "items": []}},
            )
        return httpx.Response(503)

    async def callback(service):
        initial = service.health()
        await service.search(request("success"))
        ready = service.health()
        with pytest.raises(LiteratureError):
            await service.search(request("failure"))
        degraded = service.health()
        return initial, ready, degraded

    initial, ready, degraded = run_with_service(handler, callback)

    assert initial.status == "unknown"
    assert initial.configured is True
    assert ready.status == "ready"
    assert ready.last_success_at is not None
    assert degraded.status == "degraded"
    assert degraded.last_error_at is not None