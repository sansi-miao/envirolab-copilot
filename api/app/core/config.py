import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from app.services.literature import CrossrefSettings

DEFAULT_CORS_ORIGINS = (
    "http://127.0.0.1:5173",
    "http://localhost:5173",
)
PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_RATE_LIMIT_DB = PROJECT_ROOT / "data" / "literature_rate_limit.sqlite3"


@dataclass(frozen=True)
class RateLimitConfig:
    per_ip_limit: int = 10
    per_ip_window: int = 60
    global_limit: int = 30
    global_window: int = 60


@dataclass(frozen=True)
class RateLimitSettings:
    backend: str
    database_path: Path
    config: RateLimitConfig


def parse_cors_origins(raw: str | None) -> list[str]:
    origins = list(DEFAULT_CORS_ORIGINS)
    if raw is None or not raw.strip():
        return origins

    for item in raw.split(","):
        origin = item.strip()
        if not origin:
            continue
        if origin == "*":
            raise ValueError(
                "CORS_ORIGINS must list explicit origins; the wildcard '*' is not allowed"
            )
        parsed = urlparse(origin)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.path not in {"", "/"}
            or parsed.params
            or parsed.query
            or parsed.fragment
            or parsed.username
            or parsed.password
        ):
            raise ValueError(f"Invalid CORS origin: {origin}")
        normalized = f"{parsed.scheme}://{parsed.netloc}"
        if normalized not in origins:
            origins.append(normalized)
    return origins


def get_cors_origins() -> list[str]:
    return parse_cors_origins(os.getenv("CORS_ORIGINS"))


def _env_int(name: str, default: int, minimum: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer") from error
    if value < minimum:
        raise ValueError(f"{name} must be at least {minimum}")
    return value


def _env_float(name: str, default: float, minimum: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw)
    except ValueError as error:
        raise ValueError(f"{name} must be a number") from error
    if value < minimum:
        raise ValueError(f"{name} must be at least {minimum}")
    return value


def get_literature_settings() -> CrossrefSettings:
    mailto = (os.getenv("CROSSREF_MAILTO") or "").strip() or None
    user_agent = (
        os.getenv("CROSSREF_USER_AGENT") or ""
    ).strip() or "EnviroLabCopilot/0.1.0"
    return CrossrefSettings(
        mailto=mailto,
        user_agent=user_agent,
        connect_timeout=_env_float("CROSSREF_CONNECT_TIMEOUT", 3.0, 0.1),
        read_timeout=_env_float("CROSSREF_READ_TIMEOUT", 7.0, 0.1),
        total_timeout=_env_float("CROSSREF_TOTAL_TIMEOUT", 10.0, 0.1),
        max_connections=_env_int("CROSSREF_MAX_CONNECTIONS", 4, 1),
        max_response_bytes=_env_int(
            "LITERATURE_MAX_RESPONSE_BYTES",
            2 * 1024 * 1024,
            1024,
        ),
        cache_entries=_env_int("LITERATURE_CACHE_ENTRIES", 256, 0),
        cache_ttl_seconds=_env_float("LITERATURE_CACHE_TTL_SECONDS", 300.0, 0.0),
    )


def get_rate_limit_settings() -> RateLimitSettings:
    backend = (os.getenv("LITERATURE_RATE_LIMIT_BACKEND") or "sqlite").strip().lower()
    if backend not in {"memory", "sqlite"}:
        raise ValueError("LITERATURE_RATE_LIMIT_BACKEND must be 'memory' or 'sqlite'")
    raw_path = (os.getenv("LITERATURE_RATE_LIMIT_DB") or "").strip()
    database_path = Path(raw_path) if raw_path else DEFAULT_RATE_LIMIT_DB
    if not database_path.is_absolute():
        database_path = PROJECT_ROOT / database_path
    return RateLimitSettings(
        backend=backend,
        database_path=database_path,
        config=RateLimitConfig(
            per_ip_limit=_env_int("LITERATURE_RATE_LIMIT_PER_IP", 10, 1),
            per_ip_window=_env_int("LITERATURE_RATE_LIMIT_PER_IP_WINDOW", 60, 1),
            global_limit=_env_int("LITERATURE_RATE_LIMIT_GLOBAL", 30, 1),
            global_window=_env_int("LITERATURE_RATE_LIMIT_GLOBAL_WINDOW", 60, 1),
        ),
    )


def get_trusted_proxy_ips() -> tuple[str, ...]:
    raw = os.getenv("TRUSTED_PROXY_IPS") or ""
    return tuple(item.strip() for item in raw.split(",") if item.strip())