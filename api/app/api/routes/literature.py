import logging
import time
from uuid import uuid4

from fastapi import APIRouter, Request

from app.core.config import RateLimitConfig, get_trusted_proxy_ips
from app.schemas.literature import (
    LiteratureHealthResponse,
    LiteratureSearchRequest,
    LiteratureSearchResponse,
)
from app.services.literature import CrossrefService, LiteratureError
from app.services.rate_limit import InMemoryRateLimiter, SqliteRateLimiter

router = APIRouter(prefix="/literature", tags=["literature"])
logger = logging.getLogger("app.literature")


def _client_ip(request: Request, trusted_proxies: tuple[str, ...]) -> str:
    peer = request.client.host if request.client else "unknown"
    if peer not in trusted_proxies:
        return peer
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        candidate = forwarded.split(",", 1)[0].strip()
        if candidate:
            return candidate
    return peer


def _service(request: Request) -> CrossrefService:
    service = getattr(request.app.state, "literature_service", None)
    if service is None:
        raise LiteratureError(
            503,
            "service_unavailable",
            "文献服务尚未就绪，请稍后重试。",
        )
    return service


def _limiter(request: Request) -> InMemoryRateLimiter | SqliteRateLimiter:
    limiter = getattr(request.app.state, "rate_limiter", None)
    if limiter is None:
        raise LiteratureError(
            503,
            "service_unavailable",
            "文献服务尚未就绪，请稍后重试。",
        )
    return limiter


def _rate_limit_config(request: Request) -> RateLimitConfig:
    return getattr(request.app.state, "rate_limit_config", RateLimitConfig())


@router.post("/search", response_model=LiteratureSearchResponse)
async def search_literature(
    payload: LiteratureSearchRequest,
    request: Request,
) -> LiteratureSearchResponse:
    limiter = _limiter(request)
    config = _rate_limit_config(request)
    trusted_proxies = getattr(
        request.app.state,
        "trusted_proxy_ips",
        get_trusted_proxy_ips(),
    )
    ip_address = _client_ip(request, trusted_proxies)

    ip_decision = await limiter.consume(
        f"ip:{ip_address}",
        config.per_ip_limit,
        config.per_ip_window,
    )
    if not ip_decision.allowed:
        raise LiteratureError(
            429,
            "rate_limited",
            "请求过于频繁，请稍后重试。",
            retry_after=ip_decision.retry_after,
        )

    global_decision = await limiter.consume(
        "global",
        config.global_limit,
        config.global_window,
    )
    if not global_decision.allowed:
        raise LiteratureError(
            429,
            "rate_limited",
            "请求过于频繁，请稍后重试。",
            retry_after=global_decision.retry_after,
        )

    request_id = uuid4().hex
    started = time.perf_counter()
    try:
        response = await _service(request).search(payload)
    except LiteratureError as error:
        logger.warning(
            "literature_search status=%s code=%s duration_ms=%.1f "
            "source=crossref request_id=%s",
            error.status_code,
            error.code,
            (time.perf_counter() - started) * 1000,
            request_id,
        )
        raise
    logger.info(
        "literature_search status=200 duration_ms=%.1f "
        "source=crossref request_id=%s",
        (time.perf_counter() - started) * 1000,
        request_id,
    )
    return response


@router.get("/health", response_model=LiteratureHealthResponse)
def literature_health(request: Request) -> LiteratureHealthResponse:
    service = getattr(request.app.state, "literature_service", None)
    if service is None:
        return LiteratureHealthResponse(
            status="degraded",
            configured=False,
            checked_at=None,
            last_success_at=None,
            last_error_at=None,
        )
    return service.health()