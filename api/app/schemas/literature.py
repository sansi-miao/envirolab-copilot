import re
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LiteratureModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LiteratureMode(StrEnum):
    KEYWORD = "keyword"
    DOI = "doi"


class OpenAccessStatus(StrEnum):
    UNKNOWN = "unknown"
    OPEN = "open"
    CLOSED = "closed"


_DOI_PREFIX = re.compile(
    r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)",
    re.IGNORECASE,
)
_DOI_PATTERN = re.compile(r"^10\.\d{4,9}/\S+$")


def normalize_doi(value: str) -> str | None:
    normalized = _DOI_PREFIX.sub("", value.strip()).lower()
    if len(normalized) > 200 or not _DOI_PATTERN.fullmatch(normalized):
        return None
    return normalized


class LiteratureSearchRequest(LiteratureModel):
    query: str
    mode: LiteratureMode
    year_from: int | None = Field(default=None, ge=1000, le=2100)
    year_to: int | None = Field(default=None, ge=1000, le=2100)
    page: int = Field(default=1, ge=1, le=100)
    page_size: int = Field(default=20, ge=1, le=50)

    @model_validator(mode="after")
    def validate_query(self):
        if self.mode is LiteratureMode.DOI:
            if self.year_from is not None or self.year_to is not None:
                raise ValueError("DOI searches do not accept year filters")
            normalized = normalize_doi(self.query)
            if normalized is None:
                raise ValueError("Invalid DOI")
            self.query = normalized
        else:
            normalized = self.query.strip()
            if not normalized:
                raise ValueError("Query cannot be empty")
            if len(normalized) > 200:
                raise ValueError("Query must be at most 200 characters")
            self.query = normalized

        if (
            self.year_from is not None
            and self.year_to is not None
            and self.year_from > self.year_to
        ):
            raise ValueError("year_from cannot be greater than year_to")
        return self


class LiteratureItem(LiteratureModel):
    doi: str | None = None
    title: str | None = None
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    venue: str | None = None
    url: str
    open_access_status: OpenAccessStatus = OpenAccessStatus.UNKNOWN


class LiteratureSearchResponse(LiteratureModel):
    query: str
    mode: LiteratureMode
    source: Literal["crossref"] = "crossref"
    retrieved_at: str
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    items: list[LiteratureItem] = Field(default_factory=list)


class LiteratureHealthResponse(LiteratureModel):
    status: Literal["unknown", "ready", "degraded"]
    source: Literal["crossref"] = "crossref"
    configured: bool
    checked_at: str | None = None
    last_success_at: str | None = None
    last_error_at: str | None = None