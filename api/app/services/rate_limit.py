import asyncio
import math
import sqlite3
import threading
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from app.core.config import RateLimitSettings


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    retry_after: int | None = None


class InMemoryRateLimiter:
    def __init__(self, clock=time.monotonic) -> None:
        self.clock = clock
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    async def consume(
        self,
        bucket: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        now = self.clock()
        cutoff = now - window_seconds
        with self._lock:
            events = self._events.setdefault(bucket, deque())
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, math.ceil(events[0] + window_seconds - now))
                return RateLimitDecision(False, retry_after)
            events.append(now)
        return RateLimitDecision(True)


class SqliteRateLimiter:
    """Shared on-disk counter for multiple workers on the same host."""

    def __init__(self, path: Path, clock=time.time) -> None:
        self.path = path
        self.clock = clock
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.path, timeout=5.0) as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute("PRAGMA busy_timeout = 5000")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS rate_limit_events (
                    bucket TEXT NOT NULL,
                    ts REAL NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS ix_rate_limit_events_bucket_ts
                ON rate_limit_events (bucket, ts)
                """
            )

    async def consume(
        self,
        bucket: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        return await asyncio.to_thread(
            self._consume_sync,
            bucket,
            limit,
            window_seconds,
        )

    def _consume_sync(
        self,
        bucket: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        now = self.clock()
        cutoff = now - window_seconds
        with sqlite3.connect(self.path, timeout=5.0) as connection:
            connection.execute("PRAGMA busy_timeout = 5000")
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "DELETE FROM rate_limit_events WHERE ts <= ?",
                (cutoff,),
            )
            count, oldest = connection.execute(
                """
                SELECT COUNT(*), MIN(ts)
                FROM rate_limit_events
                WHERE bucket = ? AND ts > ?
                """,
                (bucket, cutoff),
            ).fetchone()
            if count >= limit:
                retry_after = max(
                    1,
                    math.ceil((oldest or now) + window_seconds - now),
                )
                connection.commit()
                return RateLimitDecision(False, retry_after)
            connection.execute(
                "INSERT INTO rate_limit_events (bucket, ts) VALUES (?, ?)",
                (bucket, now),
            )
            connection.commit()
        return RateLimitDecision(True)


def build_rate_limiter(settings: RateLimitSettings) -> InMemoryRateLimiter | SqliteRateLimiter:
    if settings.backend == "sqlite":
        return SqliteRateLimiter(settings.database_path)
    return InMemoryRateLimiter()