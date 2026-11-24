import {
  csvCell,
  dateDaysAgo,
  parseNumericInput,
  readString,
  todayLocalDate,
  type NumericInput,
} from "./courseCommon.ts";

export const COD_DRAFT_KEY = "envirolab.course.cod.draft.v1";
export const COD_DRAFT_VERSION = 1;
export const BOD5_DRAFT_KEY = "envirolab.course.bod5.draft.v1";
export const BOD5_DRAFT_VERSION = 1;
export const MAX_RAW_SAMPLE_ID_LENGTH = 60;
export const MAX_RAW_RECORD_NO_LENGTH = 60;
export const MAX_RAW_NOTE_LENGTH = 300;
export const MAX_RAW_READING_LENGTH = 40;
export const MAX_RAW_UNIT_LENGTH = 24;
export const SYNTHETIC_DATA_LABEL = "教学合成样例（非真实测量）";
export const MANUAL_DATA_LABEL = "课程手填原始记录";

export type RawRecordState = "empty" | "partial" | "invalid" | "complete";
export type BodStageId = "first" | "second";

export const rawRecordStateLabels: Record<RawRecordState, string> = {
  empty: "未开始",
  partial: "未齐全",
  invalid: "需修正",
  complete: "已齐全",
};

export interface RawCheckIssue {
  id: string;
  field: string;
  level: "error" | "warning";
  message: string;
}

export interface RawReadingCheck {
  reading: NumericInput;
  unit: string;
  hasInput: boolean;
  missingReading: boolean;
  invalidReading: boolean;
  missingUnit: boolean;
  complete: boolean;
  readingValue: number | null;
  issues: RawCheckIssue[];
}

export interface CodDraft {
  version: typeof COD_DRAFT_VERSION;
  sampleId: string;
  measuredAt: string;
  reading: string;
  unit: string;
  recordNo: string;
  note: string;
  isTeachingSample: boolean;
  updatedAt: string;
}

export interface CodEvaluation {
  hasInput: boolean;
  state: RawRecordState;
  complete: boolean;
  readingValue: number | null;
  readingCheck: RawReadingCheck;
  filledRequiredCount: number;
  requiredFieldCount: number;
  issues: RawCheckIssue[];
}

export interface BodStageFields {
  date: string;
  reading: string;
  unit: string;
}

export interface Bod5Draft {
  version: typeof BOD5_DRAFT_VERSION;
  sampleId: string;
  first: BodStageFields;
  second: BodStageFields;
  note: string;
  isTeachingSample: boolean;
  updatedAt: string;
}

export interface BodStageEvaluation {
  stage: BodStageId;
  label: string;
  fields: BodStageFields;
  hasInput: boolean;
  state: RawRecordState;
  complete: boolean;
  missingFields: string[];
  invalidFields: string[];
  readingValue: number | null;
  issues: RawCheckIssue[];
}

export interface Bod5Evaluation {
  hasInput: boolean;
  sampleComplete: boolean;
  bothComplete: boolean;
  recordComplete: boolean;
  state: RawRecordState;
  first: BodStageEvaluation;
  second: BodStageEvaluation;
  issues: RawCheckIssue[];
}

function createStage(date = ""): BodStageFields {
  return { date, reading: "", unit: "" };
}

export function createEmptyCodDraft(): CodDraft {
  return {
    version: COD_DRAFT_VERSION,
    sampleId: "",
    measuredAt: todayLocalDate(),
    reading: "",
    unit: "",
    recordNo: "",
    note: "",
    isTeachingSample: false,
    updatedAt: new Date().toISOString(),
  };
}

export function createCodSyntheticDraft(): CodDraft {
  return {
    version: COD_DRAFT_VERSION,
    sampleId: "SYN-COD-01",
    measuredAt: todayLocalDate(),
    reading: "24.8",
    unit: "mg/L（仪器直读）",
    recordNo: "SYN-COD-R01",
    note: "教学合成样例：仅用于核对原始记录、校验和 CSV，数值不是真实测量，也不由本页计算 COD。",
    isTeachingSample: true,
    updatedAt: new Date().toISOString(),
  };
}

export function createEmptyBod5Draft(): Bod5Draft {
  return {
    version: BOD5_DRAFT_VERSION,
    sampleId: "",
    first: createStage(),
    second: createStage(),
    note: "",
    isTeachingSample: false,
    updatedAt: new Date().toISOString(),
  };
}

export function createBod5SyntheticDraft(): Bod5Draft {
  return {
    version: BOD5_DRAFT_VERSION,
    sampleId: "SYN-BOD5-01",
    first: { date: dateDaysAgo(5), reading: "8.4", unit: "mg/L" },
    second: { date: todayLocalDate(), reading: "3.1", unit: "mg/L" },
    note: "教学合成样例：两段均已填写，仅用于核对本地续填和 CSV；数值不是真实测量，也不由本页计算 BOD₅。",
    isTeachingSample: true,
    updatedAt: new Date().toISOString(),
  };
}

export function hasCodContent(draft: CodDraft) {
  return Boolean(
    draft.sampleId.trim() ||
      draft.reading.trim() ||
      draft.unit.trim() ||
      draft.recordNo.trim() ||
      draft.note.trim(),
  );
}

export function hasBod5Content(draft: Bod5Draft) {
  return Boolean(
    draft.sampleId.trim() ||
      draft.note.trim() ||
      draft.first.date.trim() ||
      draft.first.reading.trim() ||
      draft.first.unit.trim() ||
      draft.second.date.trim() ||
      draft.second.reading.trim() ||
      draft.second.unit.trim(),
  );
}

function makeIssue(
  prefix: string,
  field: string,
  level: "error" | "warning",
  message: string,
): RawCheckIssue {
  return { id: `${prefix}-${field}-${level}`, field, level, message };
}

function checkReading(
  prefix: string,
  readingRaw: string,
  unitRaw: string,
): RawReadingCheck {
  const reading = parseNumericInput(readingRaw);
  const unit = unitRaw.trim();
  const hasInput = readingRaw.trim() !== "" || unitRaw.trim() !== "";
  const issues: RawCheckIssue[] = [];
  const missingReading = reading.kind === "blank";
  const invalidReading =
    reading.kind === "invalid" || (reading.kind === "value" && reading.value < 0);
  const missingUnit = unit === "";

  if (missingReading) {
    issues.push(
      makeIssue(prefix, "reading", "error", "原始读数不能为空；缺失不按 0 处理。"),
    );
  } else if (reading.kind === "invalid") {
    issues.push(
      makeIssue(prefix, "reading", "error", "原始读数不是有效数字，请保留原始记录并核对输入。"),
    );
  } else if (reading.kind === "value" && reading.value < 0) {
    issues.push(makeIssue(prefix, "reading", "error", "原始读数不能为负数。"));
  }

  if (missingUnit) {
    issues.push(makeIssue(prefix, "unit", "error", "仪器单位不能为空，本页不做单位换算。"));
  }

  return {
    reading,
    unit,
    hasInput,
    missingReading,
    invalidReading,
    missingUnit,
    complete: !missingReading && !invalidReading && !missingUnit,
    readingValue: reading.kind === "value" && reading.value >= 0 ? reading.value : null,
    issues,
  };
}

export function evaluateCodDraft(draft: CodDraft): CodEvaluation {
  const hasInput = hasCodContent(draft);
  const readingCheck = checkReading("cod", draft.reading, draft.unit);
  const issues: RawCheckIssue[] = [];

  if (hasInput) {
    if (!draft.sampleId.trim()) {
      issues.push(makeIssue("cod", "sampleId", "error", "样品编号不能为空。"));
    }
    if (!draft.measuredAt.trim()) {
      issues.push(makeIssue("cod", "measuredAt", "error", "测定日期不能为空。"));
    }
    if (!draft.recordNo.trim()) {
      issues.push(makeIssue("cod", "recordNo", "error", "原始记录编号不能为空。"));
    }
    issues.push(...readingCheck.issues);
  }

  const state: RawRecordState = !hasInput
    ? "empty"
    : readingCheck.invalidReading
      ? "invalid"
      : issues.length > 0
        ? "partial"
        : "complete";

  const filledRequiredCount = [
    Boolean(draft.sampleId.trim()),
    Boolean(draft.measuredAt.trim()),
    Boolean(draft.recordNo.trim()),
    readingCheck.readingValue !== null,
    Boolean(readingCheck.unit),
  ].filter(Boolean).length;

  return {
    hasInput,
    state,
    complete: hasInput && issues.length === 0,
    readingValue: readingCheck.readingValue,
    readingCheck,
    filledRequiredCount,
    requiredFieldCount: 5,
    issues,
  };
}

function evaluateBodStage(
  stage: BodStageId,
  label: string,
  fields: BodStageFields,
): BodStageEvaluation {
  const hasInput = Boolean(
    fields.date.trim() || fields.reading.trim() || fields.unit.trim(),
  );
  const readingCheck = checkReading(`bod-${stage}`, fields.reading, fields.unit);
  const issues: RawCheckIssue[] = [];
  const missingFields: string[] = [];
  const invalidFields: string[] = [];

  if (fields.date.trim() === "") missingFields.push("日期");
  if (readingCheck.missingReading) missingFields.push("原始读数");
  if (readingCheck.missingUnit) missingFields.push("仪器单位");
  if (readingCheck.invalidReading) invalidFields.push("原始读数");

  if (hasInput) {
    if (!fields.date.trim()) {
      issues.push(makeIssue(`bod-${stage}`, "date", "error", "日期不能为空。"));
    }
    issues.push(...readingCheck.issues);
  }

  const state: RawRecordState = !hasInput
    ? "empty"
    : readingCheck.invalidReading
      ? "invalid"
      : issues.length > 0
        ? "partial"
        : "complete";

  return {
    stage,
    label,
    fields,
    hasInput,
    state,
    complete: hasInput && issues.length === 0,
    missingFields,
    invalidFields,
    readingValue: readingCheck.readingValue,
    issues,
  };
}

export function evaluateBod5Draft(draft: Bod5Draft): Bod5Evaluation {
  const first = evaluateBodStage("first", "首段", draft.first);
  const second = evaluateBodStage("second", "次段", draft.second);
  const hasInput = hasBod5Content(draft);
  const sampleComplete = Boolean(draft.sampleId.trim());
  const issues: RawCheckIssue[] = [];
  const warnings: RawCheckIssue[] = [];

  if (hasInput && !sampleComplete) {
    issues.push(
      makeIssue(
        "bod",
        "sampleId",
        "error",
        "样品编号不能为空；首段和次段共用同一份本地样品记录。",
      ),
    );
  }
  if (first.hasInput) issues.push(...first.issues);
  if (second.hasInput) issues.push(...second.issues);

  if (first.hasInput && first.complete && !second.hasInput) {
    warnings.push(
      makeIssue(
        "bod",
        "continuation",
        "warning",
        "首段已齐全，次段尚未填写。可以等到第 7 课次继续补录。",
      ),
    );
  }
  if (second.hasInput && !first.complete) {
    warnings.push(
      makeIssue(
        "bod",
        "missing-first",
        "warning",
        "次段已有内容，但首段尚未齐全；请确认两段属于同一份样品。",
      ),
    );
  }
  if (
    first.complete &&
    second.complete &&
    first.readingValue !== null &&
    second.readingValue !== null &&
    first.fields.unit.trim() &&
    second.fields.unit.trim() &&
    first.fields.unit.trim() !== second.fields.unit.trim()
  ) {
    warnings.push(
      makeIssue(
        "bod",
        "units",
        "warning",
        `首段单位为 ${first.fields.unit.trim()}，次段为 ${second.fields.unit.trim()}；本页不自动换算，请确认记录是否一致。`,
      ),
    );
  }
  if (
    first.fields.date.trim() &&
    second.fields.date.trim() &&
    second.fields.date.trim() < first.fields.date.trim()
  ) {
    warnings.push(
      makeIssue("bod", "date-order", "warning", "次段日期早于首段日期，请核对培养记录。"),
    );
  }

  const allIssues = [...issues, ...warnings];
  const bothComplete = first.complete && second.complete;
  const state: RawRecordState = !hasInput
    ? "empty"
    : issues.some((issue) => issue.level === "error" && issue.id.includes("reading"))
      ? "invalid"
      : allIssues.some((issue) => issue.level === "error")
        ? "partial"
        : bothComplete && sampleComplete
          ? "complete"
          : "partial";

  return {
    hasInput,
    sampleComplete,
    bothComplete,
    recordComplete: bothComplete && sampleComplete,
    state,
    first,
    second,
    issues: allIssues,
  };
}

function issueText(issues: RawCheckIssue[]) {
  return issues.map((issue) => issue.message).join("；");
}

function dataLabel(draft: { isTeachingSample: boolean }) {
  return draft.isTeachingSample ? SYNTHETIC_DATA_LABEL : MANUAL_DATA_LABEL;
}

export function buildCodCsv(draft: CodDraft, evaluation: CodEvaluation) {
  const header = [
    "样品编号",
    "测定日期",
    "原始读数",
    "仪器单位",
    "原始记录编号",
    "记录状态",
    "数据标注",
    "备注",
    "检查提示",
    "说明",
  ];
  const lines = [header.map(csvCell).join(",")];
  lines.push(
    [
      draft.sampleId,
      draft.measuredAt,
      draft.reading,
      draft.unit,
      draft.recordNo,
      rawRecordStateLabels[evaluation.state],
      dataLabel(draft),
      draft.note,
      issueText(evaluation.issues),
      "仅保存原始记录；未计算 COD 浓度，未提供正式结论。",
    ]
      .map(csvCell)
      .join(","),
  );
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function buildBod5Csv(draft: Bod5Draft, evaluation: Bod5Evaluation) {
  const header = [
    "样品编号",
    "首段日期",
    "首段原始读数",
    "首段仪器单位",
    "次段日期",
    "次段原始读数",
    "次段仪器单位",
    "首段状态",
    "次段状态",
    "两段是否齐全",
    "首段缺失字段",
    "次段缺失字段",
    "数据标注",
    "备注",
    "检查提示",
    "说明",
  ];
  const lines = [header.map(csvCell).join(",")];
  lines.push(
    [
      draft.sampleId,
      draft.first.date,
      draft.first.reading,
      draft.first.unit,
      draft.second.date,
      draft.second.reading,
      draft.second.unit,
      rawRecordStateLabels[evaluation.first.state],
      rawRecordStateLabels[evaluation.second.state],
      evaluation.bothComplete ? "是" : "否",
      evaluation.first.missingFields.join("、"),
      evaluation.second.missingFields.join("、"),
      dataLabel(draft),
      draft.note,
      issueText(evaluation.issues),
      "仅保存首段和次段原始记录；未计算 BOD₅、差值或培养结论。",
    ]
      .map(csvCell)
      .join(","),
  );
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function normalizeStage(value: unknown): BodStageFields {
  if (!value || typeof value !== "object") return createStage();
  const record = value as Record<string, unknown>;
  return {
    date: readString(record.date, 20),
    reading: readString(record.reading, MAX_RAW_READING_LENGTH),
    unit: readString(record.unit, MAX_RAW_UNIT_LENGTH),
  };
}

export function parseCodDraft(raw: string | null): CodDraft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== COD_DRAFT_VERSION) return null;
  return {
    version: COD_DRAFT_VERSION,
    sampleId: readString(record.sampleId, MAX_RAW_SAMPLE_ID_LENGTH),
    measuredAt: readString(record.measuredAt, 20) || todayLocalDate(),
    reading: readString(record.reading, MAX_RAW_READING_LENGTH),
    unit: readString(record.unit, MAX_RAW_UNIT_LENGTH),
    recordNo: readString(record.recordNo, MAX_RAW_RECORD_NO_LENGTH),
    note: readString(record.note, MAX_RAW_NOTE_LENGTH),
    isTeachingSample: record.isTeachingSample === true,
    updatedAt: readString(record.updatedAt, 40) || new Date().toISOString(),
  };
}

export function parseBod5Draft(raw: string | null): Bod5Draft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== BOD5_DRAFT_VERSION) return null;
  return {
    version: BOD5_DRAFT_VERSION,
    sampleId: readString(record.sampleId, MAX_RAW_SAMPLE_ID_LENGTH),
    first: normalizeStage(record.first),
    second: normalizeStage(record.second),
    note: readString(record.note, MAX_RAW_NOTE_LENGTH),
    isTeachingSample: record.isTeachingSample === true,
    updatedAt: readString(record.updatedAt, 40) || new Date().toISOString(),
  };
}

export function serializeCodDraft(draft: CodDraft) {
  return JSON.stringify(draft);
}

export function serializeBod5Draft(draft: Bod5Draft) {
  return JSON.stringify(draft);
}

export function loadCodDraft(): CodDraft | null {
  if (typeof localStorage === "undefined") return null;
  return parseCodDraft(localStorage.getItem(COD_DRAFT_KEY));
}

export function saveCodDraft(draft: CodDraft): CodDraft {
  if (typeof localStorage === "undefined") {
    throw new Error("当前浏览器不支持本地草稿存储。");
  }
  const stored: CodDraft = {
    ...draft,
    version: COD_DRAFT_VERSION,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(COD_DRAFT_KEY, serializeCodDraft(stored));
  return stored;
}

export function clearCodDraft() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(COD_DRAFT_KEY);
}

export function loadBod5Draft(): Bod5Draft | null {
  if (typeof localStorage === "undefined") return null;
  return parseBod5Draft(localStorage.getItem(BOD5_DRAFT_KEY));
}

export function saveBod5Draft(draft: Bod5Draft): Bod5Draft {
  if (typeof localStorage === "undefined") {
    throw new Error("当前浏览器不支持本地草稿存储。");
  }
  const stored: Bod5Draft = {
    ...draft,
    version: BOD5_DRAFT_VERSION,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(BOD5_DRAFT_KEY, serializeBod5Draft(stored));
  return stored;
}

export function clearBod5Draft() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(BOD5_DRAFT_KEY);
}