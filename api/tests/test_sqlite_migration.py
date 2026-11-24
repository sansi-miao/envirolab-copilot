import json

import pytest
from sqlalchemy import create_engine, inspect, text

from app.db import session as db_session
from app.db.models import metadata

FORMULA_SELECT = (
    "SELECT version_id, id, experiment_id, name, expression, description, "
    "symbols, units, applicable_conditions FROM experiment_formulas "
    "ORDER BY experiment_id, id"
)


def legacy_rows() -> list[dict[str, str]]:
    return [
        {
            "experiment_id": "water-cod-dichromate",
            "id": "cod-formula",
            "version_id": "water-cod-dichromate:v1",
            "name": "COD 计算",
            "expression": "COD = (V1 - V2) * C * 8000 / V",
            "description": "重铬酸盐法计算式",
            "symbols": json.dumps({"V1": "mL", "V2": "mL"}, ensure_ascii=False),
            "units": "mg/L",
            "applicable_conditions": "消解后滴定",
        },
        {
            "experiment_id": "water-cod-dichromate",
            "id": "cod-blank-formula",
            "version_id": "water-cod-dichromate:v1",
            "name": "空白校正",
            "expression": "V0 = V1 - V2",
            "description": "空白滴定体积",
            "symbols": json.dumps({"V1": "mL", "V2": "mL"}, ensure_ascii=False),
            "units": "mL",
            "applicable_conditions": "空白实验",
        },
        {
            "experiment_id": "water-ph-electrode",
            "id": "ph-formula",
            "version_id": "water-ph-electrode:v1",
            "name": "pH 计算",
            "expression": "pH = -log10(H+)",
            "description": "电极法计算式",
            "symbols": json.dumps({"H+": "mol/L"}, ensure_ascii=False),
            "units": "无量纲",
            "applicable_conditions": "25 摄氏度",
        },
    ]


def create_legacy_formula_table(engine, rows: list[dict[str, str]]) -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE experiment_formulas (
                    experiment_id VARCHAR(80) NOT NULL,
                    id VARCHAR(100) NOT NULL,
                    version_id VARCHAR(120) NOT NULL,
                    name VARCHAR(160) NOT NULL,
                    expression TEXT NOT NULL,
                    description TEXT NOT NULL,
                    symbols JSON NOT NULL,
                    units VARCHAR(200) NOT NULL,
                    applicable_conditions TEXT NOT NULL,
                    PRIMARY KEY (experiment_id, id)
                )
                """
            )
        )
        insert_formulas(connection, rows)


def insert_formulas(connection, rows: list[dict[str, str]]) -> None:
    connection.execute(
        text(
            """
            INSERT INTO experiment_formulas (
                experiment_id, id, version_id, name, expression, description,
                symbols, units, applicable_conditions
            ) VALUES (
                :experiment_id, :id, :version_id, :name, :expression, :description,
                :symbols, :units, :applicable_conditions
            )
            """
        ),
        rows,
    )


def formula_rows(engine) -> list[dict[str, str]]:
    with engine.connect() as connection:
        return [
            dict(row)
            for row in connection.execute(text(FORMULA_SELECT)).mappings().all()
        ]


def ordered(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    return sorted(rows, key=lambda row: (row["experiment_id"], row["id"]))


def formula_primary_key(engine) -> set[str]:
    return set(
        inspect(engine)
        .get_pk_constraint("experiment_formulas")
        .get("constrained_columns", [])
    )


def test_migrates_legacy_formula_table_and_is_idempotent(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'legacy.db').as_posix()}")
    rows = legacy_rows()
    create_legacy_formula_table(engine, rows)

    db_session.initialize_database(engine)

    assert formula_primary_key(engine) == {"version_id", "id"}
    assert "experiment_formulas_legacy" not in inspect(engine).get_table_names()
    assert formula_rows(engine) == ordered(rows)

    db_session.initialize_database(engine)

    assert formula_rows(engine) == ordered(rows)
    engine.dispose()


def test_conflicting_same_key_aborts_and_preserves_legacy(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'conflict.db').as_posix()}")
    rows = legacy_rows()
    create_legacy_formula_table(engine, rows)

    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE experiment_formulas "
                "RENAME TO experiment_formulas_legacy"
            )
        )
    metadata.create_all(engine)
    conflicting = {**rows[0], "expression": "COD = 999"}
    with engine.begin() as connection:
        insert_formulas(connection, [conflicting])

    with pytest.raises(RuntimeError, match="conflict"):
        db_session.initialize_database(engine)

    assert "experiment_formulas_legacy" in inspect(engine).get_table_names()
    assert formula_rows(engine) == ordered([conflicting])
    with engine.connect() as connection:
        legacy_expression = connection.execute(
            text(
                "SELECT expression FROM experiment_formulas_legacy "
                "WHERE version_id = :version_id AND id = :id"
            ),
            {"version_id": rows[0]["version_id"], "id": rows[0]["id"]},
        ).scalar_one()
    assert legacy_expression == rows[0]["expression"]

    with engine.begin() as connection:
        connection.execute(
            text(
                "DELETE FROM experiment_formulas "
                "WHERE version_id = :version_id AND id = :id"
            ),
            {"version_id": rows[0]["version_id"], "id": rows[0]["id"]},
        )
    db_session.initialize_database(engine)

    assert formula_primary_key(engine) == {"version_id", "id"}
    assert "experiment_formulas_legacy" not in inspect(engine).get_table_names()
    assert formula_rows(engine) == ordered(rows)
    engine.dispose()


def test_recovers_after_rename_before_new_table_exists(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'renamed.db').as_posix()}")
    rows = legacy_rows()
    create_legacy_formula_table(engine, rows)

    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE experiment_formulas "
                "RENAME TO experiment_formulas_legacy"
            )
        )

    db_session.initialize_database(engine)

    assert formula_primary_key(engine) == {"version_id", "id"}
    assert "experiment_formulas_legacy" not in inspect(engine).get_table_names()
    assert formula_rows(engine) == ordered(rows)
    engine.dispose()


def test_recovers_interrupted_migration_with_partial_copy(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'interrupted.db').as_posix()}")
    rows = legacy_rows()
    create_legacy_formula_table(engine, rows)

    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE experiment_formulas "
                "RENAME TO experiment_formulas_legacy"
            )
        )
    metadata.create_all(engine)
    with engine.begin() as connection:
        insert_formulas(connection, rows[:1])

    db_session.initialize_database(engine)

    assert formula_primary_key(engine) == {"version_id", "id"}
    assert "experiment_formulas_legacy" not in inspect(engine).get_table_names()
    assert formula_rows(engine) == ordered(rows)
    engine.dispose()


def test_failed_copy_rolls_back_and_can_retry(tmp_path, monkeypatch) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'rollback.db').as_posix()}")
    rows = legacy_rows()
    create_legacy_formula_table(engine, rows)
    original_copy = db_session._copy_formulas_from_legacy

    def fail_copy(_connection) -> None:
        raise RuntimeError("simulated interruption")

    monkeypatch.setattr(db_session, "_copy_formulas_from_legacy", fail_copy)
    with pytest.raises(RuntimeError, match="simulated interruption"):
        db_session.initialize_database(engine)

    table_names = set(inspect(engine).get_table_names())
    if "experiment_formulas_legacy" in table_names:
        with engine.connect() as connection:
            legacy_count = connection.execute(
                text("SELECT COUNT(*) FROM experiment_formulas_legacy")
            ).scalar_one()
        assert legacy_count == len(rows)
    else:
        assert formula_primary_key(engine) == {"experiment_id", "id"}
        assert formula_rows(engine) == ordered(rows)

    monkeypatch.setattr(db_session, "_copy_formulas_from_legacy", original_copy)
    db_session.initialize_database(engine)

    assert formula_primary_key(engine) == {"version_id", "id"}
    assert "experiment_formulas_legacy" not in inspect(engine).get_table_names()
    assert formula_rows(engine) == ordered(rows)
    engine.dispose()