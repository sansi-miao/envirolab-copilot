from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    UniqueConstraint,
)

metadata = MetaData()

disciplines = Table(
    "disciplines",
    metadata,
    Column("id", String(50), primary_key=True),
    Column("name", String(80), nullable=False, unique=True),
    Column("description", Text, nullable=False),
    Column("sort_order", Integer, nullable=False),
)

experiments = Table(
    "experiments",
    metadata,
    Column("id", String(80), primary_key=True),
    Column("name", String(200), nullable=False),
    Column("english_name", String(300), nullable=False),
    Column("discipline_id", String(50), ForeignKey("disciplines.id"), nullable=False),
    Column("summary", Text, nullable=False),
    Column("current_version", Integer, nullable=False, default=1),
    Column("is_public", Boolean, nullable=False, default=True),
    Column("owner_id", String(100), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
    Index("ix_experiments_discipline", "discipline_id"),
    Index("ix_experiments_name", "name"),
    Index("ix_experiments_public", "is_public"),
    Index("ix_experiments_owner", "owner_id"),
)

experiment_versions = Table(
    "experiment_versions",
    metadata,
    Column("id", String(120), primary_key=True),
    Column("experiment_id", String(80), ForeignKey("experiments.id"), nullable=False),
    Column("version", Integer, nullable=False),
    Column("evidence_status", String(40), nullable=False),
    Column("review_status", String(40), nullable=False),
    Column("calculation_status", String(40), nullable=False),
    Column("completeness", Integer, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
    UniqueConstraint("experiment_id", "version", name="uq_experiment_version"),
    Index("ix_experiment_version_review", "review_status"),
)

experiment_methods = Table(
    "experiment_methods",
    metadata,
    Column("experiment_id", String(80), ForeignKey("experiments.id"), primary_key=True),
    Column("version_id", String(120), ForeignKey("experiment_versions.id"), primary_key=True),
    Column("purpose", Text, nullable=False),
    Column("principle", Text, nullable=False),
    Column("materials", JSON, nullable=False),
    Column("instruments", JSON, nullable=False),
    Column("steps", JSON, nullable=False),
    Column("independent_variables", JSON, nullable=False),
    Column("dependent_variables", JSON, nullable=False),
    Column("controlled_variables", JSON, nullable=False),
    Column("data_processing", Text, nullable=False),
    Column("limitations", JSON, nullable=False),
)

experiment_formulas = Table(
    "experiment_formulas",
    metadata,
    Column("version_id", String(120), ForeignKey("experiment_versions.id"), primary_key=True),
    Column("id", String(100), primary_key=True),
    Column("experiment_id", String(80), ForeignKey("experiments.id"), nullable=False),
    Column("name", String(160), nullable=False),
    Column("expression", Text, nullable=False),
    Column("description", Text, nullable=False),
    Column("symbols", JSON, nullable=False),
    Column("units", String(200), nullable=False),
    Column("applicable_conditions", Text, nullable=False),
    Index("ix_formula_experiment", "experiment_id"),
    Index("ix_formula_version", "version_id"),
)

papers = Table(
    "papers",
    metadata,
    Column("id", String(100), primary_key=True),
    Column("title", String(500), nullable=False),
    Column("authors", JSON, nullable=False),
    Column("year", Integer, nullable=True),
    Column("venue", String(200), nullable=False),
    Column("doi", String(255), nullable=True, unique=True),
    Column("url", Text, nullable=False),
    Column("source_type", String(40), nullable=False),
    Column("source_access", String(40), nullable=False),
    Column("notes", Text, nullable=True),
    Index("ix_papers_doi", "doi"),
)

experiment_papers = Table(
    "experiment_papers",
    metadata,
    Column("experiment_id", String(80), ForeignKey("experiments.id"), primary_key=True),
    Column("paper_id", String(100), ForeignKey("papers.id"), primary_key=True),
    Column("relation", String(80), nullable=False, default="method_source"),
)

evidence_items = Table(
    "evidence_items",
    metadata,
    Column("id", String(120), primary_key=True),
    Column("source_id", String(100), ForeignKey("papers.id"), nullable=False),
    Column("experiment_id", String(80), ForeignKey("experiments.id"), nullable=False),
    Column("version_id", String(120), ForeignKey("experiment_versions.id"), nullable=False),
    Column("target_type", String(20), nullable=False),
    Column("target_id", String(160), nullable=True),
    Column("page", String(80), nullable=True),
    Column("section", String(200), nullable=True),
    Column("table_or_figure", String(120), nullable=True),
    Column("excerpt", Text, nullable=True),
    Column("note", Text, nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Index("ix_evidence_experiment", "experiment_id"),
    Index("ix_evidence_version", "version_id"),
    Index("ix_evidence_source", "source_id"),
)

experiment_tags = Table(
    "experiment_tags",
    metadata,
    Column("experiment_id", String(80), ForeignKey("experiments.id"), primary_key=True),
    Column("tag", String(80), primary_key=True),
    Index("ix_experiment_tags_tag", "tag"),
)
