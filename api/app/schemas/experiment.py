from datetime import datetime
from enum import StrEnum
from typing import Self
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class EvidenceStatus(StrEnum):
    SOURCE_VERIFIED = "source_verified"
    PARTIALLY_VERIFIED = "partially_verified"
    NEEDS_SUPPLEMENT = "needs_supplement"
    AI_DRAFT = "ai_draft"


class ReviewStatus(StrEnum):
    VERIFIED = "verified"
    PENDING_REVIEW = "pending_review"
    AI_DRAFT = "ai_draft"


class CalculationStatus(StrEnum):
    NOT_IMPLEMENTED = "not_implemented"
    IN_DEVELOPMENT = "in_development"
    IMPLEMENTED_UNTESTED = "implemented_untested"
    TESTED = "tested"


class SourceType(StrEnum):
    STANDARD = "standard"
    TEXTBOOK = "textbook"
    GOVERNMENT = "government"
    JOURNAL = "journal"
    DATASET = "dataset"


class SourceAccess(StrEnum):
    OFFICIAL_DOCUMENT = "official_document"
    OFFICIAL_METADATA = "official_metadata"
    OPEN_TEXTBOOK = "open_textbook"
    OPEN_DATASET = "open_dataset"
    PEER_REVIEWED_FULLTEXT = "peer_reviewed_fulltext"
    ABSTRACT_ONLY = "abstract_only"


class DisciplineSeed(StrictModel):
    id: str = Field(pattern=r"^[a-z0-9_]{2,50}$")
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=5, max_length=300)
    sort_order: int = Field(ge=1, le=100)


class DisciplineResponse(DisciplineSeed):
    experiment_count: int = Field(ge=0)


class Paper(StrictModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{2,99}$")
    title: str = Field(min_length=5, max_length=500)
    authors: list[str] = Field(min_length=1)
    year: int | None = Field(default=None, ge=1000, le=2100)
    venue: str = Field(min_length=2, max_length=200)
    doi: str | None = None
    url: str
    source_type: SourceType
    source_access: SourceAccess
    notes: str | None = None

    @field_validator("doi")
    @classmethod
    def validate_doi(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if not normalized.startswith("10.") or "/" not in normalized:
            raise ValueError("DOI must use the form 10.xxxx/identifier")
        return normalized

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Source URL must be an absolute HTTP(S) URL")
        return value


class Formula(StrictModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{2,99}$")
    name: str = Field(min_length=2, max_length=160)
    expression: str = Field(min_length=1, max_length=1000)
    description: str = Field(min_length=3, max_length=1000)
    symbols: list[str] = Field(min_length=1)
    units: str = Field(min_length=1, max_length=200)
    applicable_conditions: str = Field(min_length=3, max_length=1500)


class EvidenceTargetType(StrEnum):
    METHOD = "method"
    STEP = "step"
    FORMULA = "formula"


class EvidenceItem(StrictModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{2,119}$")
    source_id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{2,99}$")
    experiment_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{2,79}$")
    version_id: str = Field(min_length=1, max_length=120)
    target_type: EvidenceTargetType
    target_id: str | None = Field(default=None, max_length=160)
    page: str | None = Field(default=None, max_length=80)
    section: str | None = Field(default=None, max_length=200)
    table_or_figure: str | None = Field(default=None, max_length=120)
    excerpt: str | None = Field(default=None, max_length=5000)
    note: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_evidence_text(self) -> Self:
        if self.target_type != EvidenceTargetType.METHOD and not self.target_id:
            raise ValueError("target_id is required for step and formula evidence")
        if not (self.excerpt and self.excerpt.strip()) and not (self.note and self.note.strip()):
            raise ValueError("Evidence requires an excerpt or a note")
        return self


class ExperimentMethod(StrictModel):
    purpose: str = Field(min_length=5, max_length=1500)
    principle: str = Field(min_length=5, max_length=3000)
    materials: list[str] = Field(min_length=1)
    instruments: list[str] = Field(min_length=1)
    steps: list[str] = Field(min_length=1)
    independent_variables: list[str] = Field(min_length=1)
    dependent_variables: list[str] = Field(min_length=1)
    controlled_variables: list[str] = Field(min_length=1)
    data_processing: str = Field(min_length=5, max_length=2500)
    limitations: list[str] = Field(default_factory=list)


class ExperimentSummary(StrictModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{2,79}$")
    name: str = Field(min_length=3, max_length=200)
    english_name: str = Field(min_length=3, max_length=300)
    discipline_id: str
    discipline_name: str = ""
    summary: str = Field(min_length=5, max_length=1200)
    tags: list[str] = Field(min_length=1)
    evidence_status: EvidenceStatus
    review_status: ReviewStatus
    calculation_status: CalculationStatus
    completeness: int = Field(ge=0, le=100)
    updated_at: datetime


class ExperimentDetail(ExperimentSummary):
    version: int = Field(ge=1)
    created_at: datetime
    method: ExperimentMethod
    formulas: list[Formula] = Field(min_length=1)
    papers: list[Paper] = Field(min_length=1)
    evidence: list[EvidenceItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_nested_ids(self) -> Self:
        formula_ids = [formula.id for formula in self.formulas]
        paper_ids = [paper.id for paper in self.papers]
        evidence_ids = [item.id for item in self.evidence]
        if len(formula_ids) != len(set(formula_ids)):
            raise ValueError("Formula IDs must be unique within an experiment version")
        if len(paper_ids) != len(set(paper_ids)):
            raise ValueError("Paper IDs must be unique within an experiment")
        if len(evidence_ids) != len(set(evidence_ids)):
            raise ValueError("Evidence IDs must be unique within an experiment version")
        return self


class ExperimentVersionSummary(StrictModel):
    version: int = Field(ge=1)
    evidence_status: EvidenceStatus
    review_status: ReviewStatus
    calculation_status: CalculationStatus
    completeness: int = Field(ge=0, le=100)
    created_at: datetime
    updated_at: datetime
    is_current: bool
    formula_count: int = Field(ge=0)


class ExperimentListResponse(StrictModel):
    items: list[ExperimentSummary]
    total: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)


class SeedCollection(StrictModel):
    disciplines: list[DisciplineSeed] = Field(min_length=16, max_length=16)
    experiments: list[ExperimentDetail] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_ids(self) -> Self:
        discipline_ids = [item.id for item in self.disciplines]
        experiment_ids = [item.id for item in self.experiments]
        if len(discipline_ids) != len(set(discipline_ids)):
            raise ValueError("Discipline IDs must be unique")
        if len(experiment_ids) != len(set(experiment_ids)):
            raise ValueError("Experiment IDs must be unique")
        known = set(discipline_ids)
        missing = [item.id for item in self.experiments if item.discipline_id not in known]
        if missing:
            raise ValueError(f"Experiments reference unknown disciplines: {missing}")
        return self
