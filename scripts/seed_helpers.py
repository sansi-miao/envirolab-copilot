DISCIPLINE_DEFINITIONS = [
    ("math_statistics", "数学与统计学"),
    ("physics", "物理学"),
    ("chemistry", "化学"),
    ("biology", "生物学"),
    ("medicine_biomedical", "医学与生物医学"),
    ("earth_geography", "地球科学与地理学"),
    ("environmental_engineering", "环境科学与工程"),
    ("mechanical_engineering", "机械工程"),
    ("electrical_electronic", "电气与电子工程"),
    ("civil_architecture", "土木与建筑工程"),
    ("materials_science", "材料科学"),
    ("computer_ai", "计算机科学与人工智能"),
    ("agriculture_food", "农业与食品科学"),
    ("psychology_behavior", "心理与行为科学"),
    ("economics_management", "经济与管理科学"),
    ("astronomy_space", "天文学与空间科学"),
]

DISCIPLINES = [
    {
        "id": discipline_id,
        "name": name,
        "description": f"{name}相关实验、方法和可追溯资料",
        "sort_order": index,
    }
    for index, (discipline_id, name) in enumerate(DISCIPLINE_DEFINITIONS, start=1)
]
DISCIPLINE_NAMES = dict(DISCIPLINE_DEFINITIONS)


def paper(
    paper_id,
    title,
    authors,
    year,
    venue,
    url,
    source_access="official_document",
    source_type="standard",
    notes=None,
):
    return {
        "id": paper_id,
        "title": title,
        "authors": authors,
        "year": year,
        "venue": venue,
        "doi": None,
        "url": url,
        "source_type": source_type,
        "source_access": source_access,
        "notes": notes,
    }


def formula(formula_id, name, expression, description, symbols, units, applicable_conditions):
    return {
        "id": formula_id,
        "name": name,
        "expression": expression,
        "description": description,
        "symbols": symbols,
        "units": units,
        "applicable_conditions": applicable_conditions,
    }


def experiment(
    experiment_id,
    name,
    english_name,
    discipline_id,
    summary,
    tags,
    method,
    formulas,
    papers,
    evidence_status="source_verified",
    completeness=92,
):
    return {
        "id": experiment_id,
        "name": name,
        "english_name": english_name,
        "discipline_id": discipline_id,
        "discipline_name": DISCIPLINE_NAMES[discipline_id],
        "summary": summary,
        "tags": tags,
        "evidence_status": evidence_status,
        "review_status": "pending_review",
        "calculation_status": "not_implemented",
        "completeness": completeness,
        "updated_at": "2026-11-17T00:00:00Z",
        "version": 1,
        "created_at": "2026-11-17T00:00:00Z",
        "method": method,
        "formulas": formulas,
        "papers": papers,
    }
