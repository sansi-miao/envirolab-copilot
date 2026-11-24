import asyncio

from starlette.requests import Request

from app.api.routes.literature import _client_ip
from app.services.rate_limit import InMemoryRateLimiter, SqliteRateLimiter


def test_in_memory_limiter_tracks_a_rolling_window() -> None:
    now = [100.0]
    limiter = InMemoryRateLimiter(clock=lambda: now[0])

    async def run():
        first = await limiter.consume("ip:test", 2, 10)
        second = await limiter.consume("ip:test", 2, 10)
        blocked = await limiter.consume("ip:test", 2, 10)
        now[0] += 5
        still_blocked = await limiter.consume("ip:test", 2, 10)
        now[0] += 5.1
        allowed_again = await limiter.consume("ip:test", 2, 10)
        return first, second, blocked, still_blocked, allowed_again

    first, second, blocked, still_blocked, allowed_again = asyncio.run(run())

    assert first.allowed and second.allowed
    assert not blocked.allowed
    assert blocked.retry_after == 10
    assert not still_blocked.allowed
    assert still_blocked.retry_after == 5
    assert allowed_again.allowed


def test_sqlite_limiter_is_shared_between_instances(tmp_path) -> None:
    now = [1000.0]
    path = tmp_path / "shared-rate-limit.sqlite3"
    worker_a = SqliteRateLimiter(path, clock=lambda: now[0])
    worker_b = SqliteRateLimiter(path, clock=lambda: now[0])

    async def run():
        first = await worker_a.consume("global", 2, 30)
        second = await worker_a.consume("global", 2, 30)
        blocked = await worker_b.consume("global", 2, 30)
        now[0] += 31
        allowed_again = await worker_b.consume("global", 2, 30)
        return first, second, blocked, allowed_again

    first, second, blocked, allowed_again = asyncio.run(run())

    assert first.allowed and second.allowed
    assert not blocked.allowed
    assert blocked.retry_after == 30
    assert allowed_again.allowed


def test_client_ip_only_uses_forwarded_header_from_trusted_proxy() -> None:
    forwarded = Request(
        {
            "type": "http",
            "client": ("10.0.0.5", 1234),
            "headers": [(b"x-forwarded-for", b"203.0.113.9, 10.0.0.5")],
        }
    )
    direct = Request(
        {
            "type": "http",
            "client": ("198.51.100.7", 1234),
            "headers": [(b"x-forwarded-for", b"203.0.113.9")],
        }
    )

    assert _client_ip(forwarded, ("10.0.0.5",)) == "203.0.113.9"
    assert _client_ip(direct, ("10.0.0.5",)) == "198.51.100.7"