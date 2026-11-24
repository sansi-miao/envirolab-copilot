import asyncio
import json
import time
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote, urlparse

import httpx

from app.schemas.literature import (
    LiteratureHealthResponse,
    LiteratureItem,
    LiteratureMode,
    LiteratureSearchRequest,
    LiteratureSearchResponse,
    OpenAccessStatus,
    normalize_doi,
)

CROSSREF_WORKS_URL = "https://api.crossref.org/works"


class LiteratureError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        retry_after: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retry_after = retry_after


@dataclass(frozen=True)
class CrossrefSettings:
    mailto: str | None = None
    user_agent: str = "EnviroLabCopilot/0.1.0"
    connect_timeout: float = 3.0
    read_timeout: float = 7.0
    total_timeout: float = 10.0
    max_connections: int = 4
    max_response_bytes: int = 2 * 1024 * 1024
    cache_entries: int = 256
    cache_ttl_seconds: float = 300.0


class TTLCache:
    def __init__(
        self,
        capacity: int,
        ttl_seconds: float,
        clock=time.monotonic,
    ) -> None:
        self.capacity = capacity
        self.ttl_seconds = ttl_seconds
        self.clock = clock
        self._items: OrderedDict[tuple, tuple[float, LiteratureSearchResponse]] = (
            OrderedDict()
        )

    def get(self, key: tuple) -> LiteratureSearchResponse | None:
        cached = self._items.get(key)
        if cached is None:
            return None
        expires_at, value = cached
        if expires_at <= self.clock():
            self._items.pop(key, None)
            return None
        self._items.move_to_end(key)
        return value

    def set(self, key: tuple, value: LiteratureSearchResponse) -> None:
        if self.capacity <= 0:
            return
        self._items.pop(key, None)
        while len(self._items) >= self.capacity:
            self._items.popitem(last=False)
        self._items[key] = (self.clock() + self.ttl_seconds, value)


class CrossrefService:
    def __init__(
        self,
        client: httpx.AsyncClient,
        settings: CrossrefSettings | None = None,
        clock=time.monotonic,
    ) -> None:
        self.client = client
        self.settings = settings or CrossrefSettings()
        self._cache = TTLCache(
            self.settings.cache_entries,
            self.settings.cache_ttl_seconds,
            clock,
        )
        self._checked_at: str | None = None
        self._last_success_at: str | None = None
        self._last_error_at: str | None = None
        self._last_result: str | None = None

    def health(self) -> LiteratureHealthResponse:
        return LiteratureHealthResponse(
            status=self._last_result or "unknown",
            configured=True,
            checked_at=self._checked_at,
            last_success_at=self._last_success_at,
            last_error_at=self._last_error_at,
        )

    async def search(
        self,
        request: LiteratureSearchRequest,
    ) -> LiteratureSearchResponse:
        key = (
            request.mode.value,
            request.query,
            request.year_from,
            request.year_to,
            request.page,
            request.page_size,
        )
        cached = self._cache.get(key)
        if cached is not None:
            return cached

        try:
            result = await self._fetch(request)
        except LiteratureError:
            self._mark_error()
            raise
        except Exception as error:
            self._mark_error()
            raise LiteratureError(
                503,
                "service_unavailable",
                "文献服务暂时不可用，请稍后重试。",
            ) from error

        self._mark_success()
        self._cache.set(key, result)
        return result

    def _mark_success(self) -> None:
        now = self._now()
        self._checked_at = now
        self._last_success_at = now
        self._last_result = "ready"

    def _mark_error(self) -> None:
        now = self._now()
        self._checked_at = now
        self._last_error_at = now
        self._last_result = "degraded"

    async def _fetch(self, request: LiteratureSearchRequest) -> LiteratureSearchResponse:
        url, params = self._request_target(request)
        headers = {
            "Accept": "application/json",
            "User-Agent": self.settings.user_agent,
        }
        try:
            async with asyncio.timeout(self.settings.total_timeout):
                async with self.client.stream(
                    "GET",
                    url,
                    params=params,
                    headers=headers,
                ) as response:
                    if response.status_code == 404 and request.mode is LiteratureMode.DOI:
                        return self._empty_response(request)
                    if response.status_code == 429:
                        raise LiteratureError(
                            429,
                            "rate_limited",
                            "文献服务请求过于频繁，请稍后重试。",
                            retry_after=self._retry_after(response),
                        )
                    if response.status_code != 200:
                        raise LiteratureError(
                            503,
                            "service_unavailable",
                            "文献服务暂时不可用，请稍后重试。",
                            retry_after=(
                                self._retry_after(response)
                                if response.status_code >= 500
                                else None
                            ),
                        )
                    body = await self._read_body(response)
        except LiteratureError:
            raise
        except (TimeoutError, httpx.TimeoutException) as error:
            raise LiteratureError(
                504,
                "upstream_timeout",
                "文献服务响应超时，请稍后重试。",
            ) from error
        except httpx.HTTPError as error:
            raise LiteratureError(
                503,
                "service_unavailable",
                "文献服务暂时不可用，请稍后重试。",
            ) from error

        try:
            payload = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise LiteratureError(
                503,
                "upstream_invalid_response",
                "文献服务返回了无法解析的数据，请稍后重试。",
            ) from error

        return self._parse_response(request, payload)

    def _request_target(
        self,
        request: LiteratureSearchRequest,
    ) -> tuple[str, dict[str, str | int]]:
        params: dict[str, str | int] = {}
        if self.settings.mailto:
            params["mailto"] = self.settings.mailto

        if request.mode is LiteratureMode.DOI:
            return (
                f"{CROSSREF_WORKS_URL}/{quote(request.query, safe='/')}",
                params,
            )

        params["query"] = request.query
        params["rows"] = request.page_size
        params["offset"] = (request.page - 1) * request.page_size
        filters: list[str] = []
        if request.year_from is not None:
            filters.append(f"from-pub-date:{request.year_from}-01-01")
        if request.year_to is not None:
            filters.append(f"until-pub-date:{request.year_to}-12-31")
        if filters:
            params["filter"] = ",".join(filters)
        return CROSSREF_WORKS_URL, params

    async def _read_body(self, response: httpx.Response) -> bytes:
        body = bytearray()
        async for chunk in response.aiter_bytes():
            body.extend(chunk)
            if len(body) > self.settings.max_response_bytes:
                raise LiteratureError(
                    503,
                    "upstream_response_too_large",
                    "文献服务返回的数据过大，请缩小检索范围后重试。",
                )
        return bytes(body)

    def _parse_response(
        self,
        request: LiteratureSearchRequest,
        payload: Any,
    ) -> LiteratureSearchResponse:
        if not isinstance(payload, dict):
            raise self._invalid_response()

        message = payload.get("message")
        if request.mode is LiteratureMode.DOI:
            if not isinstance(message, dict):
                raise self._invalid_response()
            raw_items = [message]
            total = 1
        else:
            if not isinstance(message, dict):
                raise self._invalid_response()
            raw_items = message.get("items")
            if not isinstance(raw_items, list):
                raise self._invalid_response()
            total = message.get("total-results", len(raw_items))
            if isinstance(total, bool) or not isinstance(total, int) or total < 0:
                total = len(raw_items)

        items: list[LiteratureItem] = []
        seen: set[str] = set()
        for raw_item in raw_items:
            item = self._parse_item(raw_item)
            if item is None:
                continue
            key = item.doi or item.url
            if key in seen:
                continue
            seen.add(key)
            items.append(item)

        return LiteratureSearchResponse(
            query=request.query,
            mode=request.mode,
            retrieved_at=self._now(),
            total=total,
            page=request.page,
            page_size=request.page_size,
            items=items,
        )

    def _parse_item(self, raw_item: Any) -> LiteratureItem | None:
        if not isinstance(raw_item, dict):
            return None

        raw_doi = raw_item.get("DOI")
        doi = normalize_doi(raw_doi) if isinstance(raw_doi, str) else None
        url = f"https://doi.org/{doi}" if doi else self._item_url(raw_item)
        if url is None:
            return None

        title = self._first_string(raw_item.get("title"))
        authors = self._authors(raw_item.get("author"))
        year = self._year(raw_item)
        venue = (
            self._first_string(raw_item.get("container-title"))
            or self._first_string(raw_item.get("short-container-title"))
            or self._first_string(raw_item.get("publisher"))
        )
        return LiteratureItem(
            doi=doi,
            title=title,
            authors=authors,
            year=year,
            venue=venue,
            url=url,
            open_access_status=OpenAccessStatus.UNKNOWN,
        )

    def _item_url(self, item: dict[str, Any]) -> str | None:
        candidates = [item.get("URL")]
        resource = item.get("resource")
        if isinstance(resource, dict) and isinstance(resource.get("primary"), dict):
            candidates.append(resource["primary"].get("URL"))
        links = item.get("link")
        if isinstance(links, list) and links and isinstance(links[0], dict):
            candidates.append(links[0].get("URL"))

        for candidate in candidates:
            if not isinstance(candidate, str):
                continue
            candidate = candidate.strip()
            parsed = urlparse(candidate)
            if parsed.scheme in {"http", "https"} and parsed.netloc:
                return candidate
        return None

    def _authors(self, raw_authors: Any) -> list[str]:
        if not isinstance(raw_authors, list):
            return []
        authors: list[str] = []
        for raw_author in raw_authors:
            if not isinstance(raw_author, dict):
                continue
            name = raw_author.get("name")
            if isinstance(name, str) and name.strip():
                authors.append(name.strip())
                continue
            parts = [
                part.strip()
                for part in (raw_author.get("given"), raw_author.get("family"))
                if isinstance(part, str) and part.strip()
            ]
            if parts:
                authors.append(" ".join(parts))
        return authors

    def _year(self, item: dict[str, Any]) -> int | None:
        for key in (
            "published-print",
            "published-online",
            "issued",
            "published",
            "created",
        ):
            date = item.get(key)
            if not isinstance(date, dict):
                continue
            date_parts = date.get("date-parts")
            if (
                isinstance(date_parts, list)
                and date_parts
                and isinstance(date_parts[0], list)
                and date_parts[0]
            ):
                year = date_parts[0][0]
                if isinstance(year, int) and not isinstance(year, bool) and 1000 <= year <= 2100:
                    return year
        return None

    @staticmethod
    def _first_string(value: Any) -> str | None:
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str) and item.strip():
                    return item.strip()
        return None

    def _empty_response(
        self,
        request: LiteratureSearchRequest,
    ) -> LiteratureSearchResponse:
        return LiteratureSearchResponse(
            query=request.query,
            mode=request.mode,
            retrieved_at=self._now(),
            total=0,
            page=request.page,
            page_size=request.page_size,
            items=[],
        )

    @staticmethod
    def _invalid_response() -> LiteratureError:
        return LiteratureError(
            503,
            "upstream_invalid_response",
            "文献服务返回了无法解析的数据，请稍后重试。",
        )

    @staticmethod
    def _retry_after(response: httpx.Response) -> int | None:
        raw_value = response.headers.get("retry-after")
        if raw_value is None:
            return None
        try:
            seconds = int(raw_value.strip())
        except ValueError:
            return None
        return max(1, seconds)

    @staticmethod
    def _now() -> str:
        return (
            datetime.now(timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z")
        )