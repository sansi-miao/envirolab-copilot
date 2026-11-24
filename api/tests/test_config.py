import pytest

from app.core.config import DEFAULT_CORS_ORIGINS, parse_cors_origins


def test_cors_defaults_keep_local_development_origins() -> None:
    assert parse_cors_origins(None) == list(DEFAULT_CORS_ORIGINS)


def test_cors_adds_explicit_production_origin_without_dropping_local() -> None:
    origins = parse_cors_origins("https://app.example.com,https://app.example.com/")

    assert origins[:2] == list(DEFAULT_CORS_ORIGINS)
    assert origins.count("https://app.example.com") == 1


def test_cors_rejects_wildcard() -> None:
    with pytest.raises(ValueError, match="wildcard"):
        parse_cors_origins("*")


@pytest.mark.parametrize(
    "origin",
    [
        "app.example.com",
        "https://app.example.com/path",
        "https://user:secret@app.example.com",
        "https://app.example.com?debug=1",
    ],
)
def test_cors_rejects_invalid_origin(origin: str) -> None:
    with pytest.raises(ValueError, match="Invalid CORS origin"):
        parse_cors_origins(origin)
