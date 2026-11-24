import {
  csvCell,
  formatQuantity,
  formatSavedTime,
  parseNumericInput,
  readString,
  todayLocalDate,
  type NumericInput,
} from "./courseCommon.ts";

export { formatQuantity, formatSavedTime, parseNumericInput, todayLocalDate };
export type { NumericInput };

export const EXPERIMENT_ONE_DRAFT_KEY = "envirolab.course.experiment1.draft.v1";
export const EXPERIMENT_ONE_DRAFT_VERSION = 1;
export const MAX_SOLIDS_ROWS = 24;
export const MAX_TURBIDITY_ROWS = 24;
export const MAX_SAMPLE_ID_LENGTH = 60;
export const MAX_GROUP_LENGTH = 40;
export const MAX_NOTE_LENGTH = 300;

export const MASS_UNITS = ["mg", "g"] as const;
export type MassUnit = (typeof MASS_UNITS)[number];
export type ProjectId = "solids" | "turbidity";
export type CourseRecordTab = ProjectId | "photo";
export type RowStatus = "empty" | "valid" | "review" | "missing" | "invalid";

export interface SolidsRow {
  id: string;
  before: string;
  after: string;
  massUnit: MassUnit;
  volume: string;
}

export interface TurbidityRow {
  id: string;
  reading: string;
  unit: string;
}

export interface ExperimentOneDraft {
  version: typeof EXPERIMENT_ONE_DRAFT_VERSION;
  sampleId: string;
  group: string;
  measuredAt: string;
  note: string;
  solidsRows: SolidsRow[];
  turbidityRows: TurbidityRow[];
  activeTab: CourseRecordTab;
  updatedAt: string;
}

export interface CourseIssue {
  id: string;
  project: ProjectId | "common";
  rowId?: string;
  rowNumber?: number;
  field?: "before" | "after" | "volume" | "reading" | "unit" | "sampleId" | "measuredAt";
  column?: string;
  level: "error" | "warning";
  message: string;
}

export interface SolidsRowResult {
  rowId: string;
  rowNumber: number;
  touched: boolean;
  status: RowStatus;
  before: NumericInput;
  after: NumericInput;
  volume: NumericInput;
  beforeMg: number | null;
  afterMg: number | null;
  massDifferenceMg: number | null;
  concentrationMgL: number | null;
  issues: CourseIssue[];
}

export interface SolidsEvaluation {
  rows: SolidsRowResult[];
  issues: CourseIssue[];
  tableHasInput: boolean;
  computedCount: number;
  missingCount: number;
  invalidCount: number;
  reviewCount: number;
  meanConcentrationMgL: number | null;
  meanIncludesReview: boolean;
}

export interface TurbidityRowResult {
  rowId: string;
  rowNumber: number;
  touched: boolean;
  status: RowStatus;
  reading: NumericInput;
  unit: string;
  issues: CourseIssue[];
}

export interface TurbidityEvaluation {
  rows: TurbidityRowResult[];
  issues: CourseIssue[];
  tableHasInput: boolean;
  validCount: number;
  missingCount: number;
  invalidCount: number;
  mean: number | null;
  meanUnit: string | null;
  units: string[];
  aggregationPaused: boolean;
}

export interface CourseChartPoint {
  x: number;
  y: number;
  row: number;
  xLabel: string;
  yLabel: string;
}

export const rowStatusLabels: Record<RowStatus, string> = {
  empty: "空行",
  valid: "有效",
  review: "需复查",
  missing: "缺失",
  invalid: "需修正",
};

let idCounter = 0;

export function createRowId(prefix: "s" | "t" = "s") {
  idCounter += 1;
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${idCounter}-${random}`;
}

export function createSolidsRow(overrides: Partial<Omit<SolidsRow, "id">> & { id?: string } = {}): SolidsRow {
  return {
    id: overrides.id ?? createRowId("s"),
    before: overrides.before ?? "",
    after: overrides.after ?? "",
    massUnit: overrides.massUnit === "g" ? "g" : "mg",
    volume: overrides.volume ?? "",
  };
}

export function createTurbidityRow(
  overrides: Partial<Omit<TurbidityRow, "id">> & { id?: string } = {},
): TurbidityRow {
  return {
    id: overrides.id ?? createRowId("t"),
    reading: overrides.reading ?? "",
    unit: overrides.unit ?? "NTU",
  };
}

export function createEmptyDraft(): ExperimentOneDraft {
  return {
    version: EXPERIMENT_ONE_DRAFT_VERSION,
    sampleId: "",
    group: "",
    measuredAt: todayLocalDate(),
    note: "",
    solidsRows: [createSolidsRow()],
    turbidityRows: [createTurbidityRow()],
    activeTab: "solids",
    updatedAt: new Date().toISOString(),
  };
}

export function createTeachingDraft(): ExperimentOneDraft {
  return {
    version: EXPERIMENT_ONE_DRAFT_VERSION,
    sampleId: "教学水样-01",
    group: "第 1 组",
    measuredAt: todayLocalDate(),
    note: "内置教学示例：悬浮固体分别用 mg 和 g 录入；浊度保留 1 行缺失。",
    solidsRows: [
      createSolidsRow({ before: "125.0", after: "130.0", massUnit: "mg", volume: "100.0" }),
      createSolidsRow({ before: "0.1250", after: "0.1300", massUnit: "g", volume: "100.0" }),
    ],
    turbidityRows: [
      createTurbidityRow({ reading: "10.2", unit: "NTU" }),
      createTurbidityRow({ reading: "10.0", unit: "NTU" }),
      createTurbidityRow({ reading: "10.4", unit: "NTU" }),
      createTurbidityRow({ reading: "", unit: "NTU" }),
    ],
    activeTab: "solids",
    updatedAt: new Date().toISOString(),
  };
}

export function hasDraftContent(draft: ExperimentOneDraft) {
  return Boolean(
    draft.sampleId.trim() ||
      draft.group.trim() ||
      draft.note.trim() ||
      draft.solidsRows.some((row) => row.before.trim() || row.after.trim() || row.volume.trim()) ||
      draft.turbidityRows.some((row) => row.reading.trim()),
  );
}

export function normalizeTurbidityUnit(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  return upper === "NTU" || upper === "FNU" || upper === "FTU" ? upper : trimmed;
}

function makeIssue(input: {
  project: ProjectId | "common";
  row?: { rowId: string; rowNumber: number };
  field?: CourseIssue["field"];
  column?: string;
  level: "error" | "warning";
  message: string;
  idSuffix?: string;
}): CourseIssue {
  const id = [
    input.project,
    input.row?.rowId ?? "table",
    input.field ?? "general",
    input.idSuffix ?? input.level,
  ].join("-");
  const prefix = input.row ? `第 ${input.row.rowNumber} 行 · ` : "";
  return {
    id,
    project: input.project,
    rowId: input.row?.rowId,
    rowNumber: input.row?.rowNumber,
    field: input.field,
    column: input.column,
    level: input.level,
    message: `${prefix}${input.column ? `${input.column}：` : ""}${input.message}`,
  };
}

export function evaluateSolids(rows: SolidsRow[]): SolidsEvaluation {
  const tableHasInput = rows.some(
    (row) => row.before.trim() !== "" || row.after.trim() !== "" || row.volume.trim() !== "",
  );
  const results: SolidsRowResult[] = rows.map((row, index) => {
    const rowRef = { rowId: row.id, rowNumber: index + 1 };
    const touched = row.before.trim() !== "" || row.after.trim() !== "" || row.volume.trim() !== "";
    const before = parseNumericInput(row.before);
    const after = parseNumericInput(row.after);
    const volume = parseNumericInput(row.volume);
    const issues: CourseIssue[] = [];

    if (!touched) {
      const status: RowStatus = tableHasInput ? "missing" : "empty";
      if (status === "missing") {
        issues.push(
          makeIssue({
            project: "solids",
            row: rowRef,
            column: "整行",
            level: "error",
            message: "该平行行尚未填写，已单独计入缺失，不按 0 处理。",
            idSuffix: "missing-row",
          }),
        );
      }
      return {
        rowId: row.id,
        rowNumber: index + 1,
        touched,
        status,
        before,
        after,
        volume,
        beforeMg: null,
        afterMg: null,
        massDifferenceMg: null,
        concentrationMgL: null,
        issues,
      };
    }

    let missingFields = 0;
    let invalidFields = 0;

    function checkMass(field: "before" | "after", value: NumericInput, column: string) {
      if (value.kind === "blank") {
        missingFields += 1;
        issues.push(
          makeIssue({
            project: "solids",
            row: rowRef,
            field,
            column,
            level: "error",
            message: "不能为空。",
            idSuffix: "missing",
          }),
        );
      } else if (value.kind === "invalid") {
        invalidFields += 1;
        issues.push(
          makeIssue({
            project: "solids",
            row: rowRef,
            field,
            column,
            level: "error",
            message: "不是有效数字，请保留原始输入并改为数值。",
            idSuffix: "invalid",
          }),
        );
      }
    }

    checkMass("before", before, "称量前质量");
    checkMass("after", after, "称量后质量");

    if (volume.kind === "blank") {
      missingFields += 1;
      issues.push(
        makeIssue({
          project: "solids",
          row: rowRef,
          field: "volume",
          column: "水样体积",
          level: "error",
          message: "不能为空，且必须大于 0 mL。",
          idSuffix: "missing",
        }),
      );
    } else if (volume.kind === "invalid") {
      invalidFields += 1;
      issues.push(
        makeIssue({
          project: "solids",
          row: rowRef,
          field: "volume",
          column: "水样体积",
          level: "error",
          message: "不是有效数字，请保留原始输入并改为数值。",
          idSuffix: "invalid",
        }),
      );
    } else if (volume.value <= 0) {
      invalidFields += 1;
      issues.push(
        makeIssue({
          project: "solids",
          row: rowRef,
          field: "volume",
          column: "水样体积",
          level: "error",
          message: "必须大于 0 mL，当前值无法用于浓度计算。",
          idSuffix: "zero",
        }),
      );
    }

    const factor = row.massUnit === "g" ? 1000 : 1;
    const beforeMg = before.kind === "value" ? before.value * factor : null;
    const afterMg = after.kind === "value" ? after.value * factor : null;
    const massDifferenceMg =
      beforeMg !== null && afterMg !== null ? afterMg - beforeMg : null;
    const concentrationMgL =
      massDifferenceMg !== null && volume.kind === "value" && volume.value > 0
        ? (massDifferenceMg * 1000) / volume.value
        : null;
    const review = massDifferenceMg !== null && massDifferenceMg < 0;

    if (review) {
      issues.push(
        makeIssue({
          project: "solids",
          row: rowRef,
          field: "after",
          column: "称量后质量",
          level: "warning",
          message: "小于称量前质量，质量差为负，请复查顺序或称量记录。结果仍保留。",
          idSuffix: "review",
        }),
      );
    }

    const status: RowStatus =
      invalidFields > 0 ? "invalid" : missingFields > 0 ? "missing" : review ? "review" : "valid";

    return {
      rowId: row.id,
      rowNumber: index + 1,
      touched,
      status,
      before,
      after,
      volume,
      beforeMg,
      afterMg,
      massDifferenceMg,
      concentrationMgL,
      issues,
    };
  });

  const computed = results.filter((row) => row.concentrationMgL !== null);
  const meanConcentrationMgL =
    computed.length > 0
      ? computed.reduce((sum, row) => sum + (row.concentrationMgL ?? 0), 0) / computed.length
      : null;
  const reviewCount = results.filter((row) => row.status === "review").length;

  return {
    rows: results,
    issues: results.flatMap((row) => row.issues),
    tableHasInput,
    computedCount: computed.length,
    missingCount: results.filter((row) => row.status === "missing").length,
    invalidCount: results.filter((row) => row.status === "invalid").length,
    reviewCount,
    meanConcentrationMgL,
    meanIncludesReview: reviewCount > 0 && computed.length > 0,
  };
}

export function evaluateTurbidity(rows: TurbidityRow[]): TurbidityEvaluation {
  const tableHasInput = rows.some((row) => row.reading.trim() !== "");
  const results: TurbidityRowResult[] = rows.map((row, index) => {
    const rowRef = { rowId: row.id, rowNumber: index + 1 };
    const touched = row.reading.trim() !== "";
    const reading = parseNumericInput(row.reading);
    const unit = normalizeTurbidityUnit(row.unit);
    const issues: CourseIssue[] = [];

    if (!touched) {
      const status: RowStatus = tableHasInput ? "missing" : "empty";
      if (status === "missing") {
        issues.push(
          makeIssue({
            project: "turbidity",
            row: rowRef,
            column: "整行",
            level: "error",
            message: "该平行行尚未填写读数，已单独计入缺失，不按 0 处理。",
            idSuffix: "missing-row",
          }),
        );
      }
      return {
        rowId: row.id,
        rowNumber: index + 1,
        touched,
        status,
        reading,
        unit,
        issues,
      };
    }

    if (reading.kind === "blank") {
      issues.push(
        makeIssue({
          project: "turbidity",
          row: rowRef,
          field: "reading",
          column: "仪器读数",
          level: "error",
          message: "不能为空。",
          idSuffix: "missing",
        }),
      );
    } else if (reading.kind === "invalid") {
      issues.push(
        makeIssue({
          project: "turbidity",
          row: rowRef,
          field: "reading",
          column: "仪器读数",
          level: "error",
          message: "不是有效数字，请保留原始输入并改为数值。",
          idSuffix: "invalid",
        }),
      );
    } else if (reading.value < 0) {
      issues.push(
        makeIssue({
          project: "turbidity",
          row: rowRef,
          field: "reading",
          column: "仪器读数",
          level: "error",
          message: "不能为负数。",
          idSuffix: "negative",
        }),
      );
    }

    if (!unit) {
      issues.push(
        makeIssue({
          project: "turbidity",
          row: rowRef,
          field: "unit",
          column: "仪器单位",
          level: "error",
          message: "不能为空，例如 NTU、FNU 或 FTU。",
          idSuffix: "unit",
        }),
      );
    }

    const hasError = issues.some((issue) => issue.level === "error");
    return {
      rowId: row.id,
      rowNumber: index + 1,
      touched,
      status: hasError ? "invalid" : "valid",
      reading,
      unit,
      issues,
    };
  });

  const validRows = results.filter(
    (row) =>
      row.status === "valid" &&
      row.reading.kind === "value" &&
      row.reading.value >= 0 &&
      row.unit !== "",
  );
  const units = [...new Set(validRows.map((row) => row.unit))];
  const aggregationPaused = units.length > 1;
  const mean =
    units.length === 1 && validRows.length > 0
      ? validRows.reduce((sum, row) => sum + (row.reading.kind === "value" ? row.reading.value : 0), 0) /
        validRows.length
      : null;
  const tableIssues: CourseIssue[] = [];
  if (aggregationPaused) {
    tableIssues.push(
      makeIssue({
        project: "turbidity",
        column: "组均值",
        level: "warning",
        message: `检测到 ${units.join("、")} 等不同单位，已暂停组均值。请统一仪器单位后再计算。`,
        idSuffix: "mixed-units",
      }),
    );
  }

  return {
    rows: results,
    issues: [...results.flatMap((row) => row.issues), ...tableIssues],
    tableHasInput,
    validCount: validRows.length,
    missingCount: results.filter((row) => row.status === "missing").length,
    invalidCount: results.filter((row) => row.status === "invalid").length,
    mean,
    meanUnit: units.length === 1 ? units[0] : null,
    units,
    aggregationPaused,
  };
}

export function evaluateCommon(
  draft: Pick<ExperimentOneDraft, "sampleId" | "measuredAt">,
): CourseIssue[] {
  const issues: CourseIssue[] = [];
  if (!draft.sampleId.trim()) {
    issues.push(
      makeIssue({
        project: "common",
        field: "sampleId",
        column: "样品编号",
        level: "error",
        message: "导出摘要前必须填写，两张表共用这个编号。",
        idSuffix: "missing",
      }),
    );
  }
  if (!draft.measuredAt.trim()) {
    issues.push(
      makeIssue({
        project: "common",
        field: "measuredAt",
        column: "测定日期",
        level: "error",
        message: "导出摘要前必须填写。",
        idSuffix: "missing",
      }),
    );
  }
  return issues;
}

export function getSolidsChartPoints(evaluation: SolidsEvaluation): CourseChartPoint[] {
  return evaluation.rows
    .filter((row) => row.concentrationMgL !== null)
    .map((row) => ({
      x: row.rowNumber,
      y: row.concentrationMgL as number,
      row: row.rowNumber,
      xLabel: `第 ${row.rowNumber} 次`,
      yLabel: formatQuantity(row.concentrationMgL),
    }));
}

export function getTurbidityChartPoints(evaluation: TurbidityEvaluation): CourseChartPoint[] {
  if (evaluation.aggregationPaused) return [];
  return evaluation.rows
    .filter(
      (row) =>
        row.status === "valid" &&
        row.reading.kind === "value" &&
        row.reading.value >= 0,
    )
    .map((row) => ({
      x: row.rowNumber,
      y: row.reading.kind === "value" ? row.reading.value : 0,
      row: row.rowNumber,
      xLabel: `第 ${row.rowNumber} 次`,
      yLabel: formatQuantity(row.reading.kind === "value" ? row.reading.value : null),
    }));
}

function markdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function displayRaw(value: string) {
  const trimmed = value.trim();
  return trimmed ? markdownCell(trimmed) : "—";
}

function displayQuantity(value: number | null) {
  return value === null ? "—" : formatQuantity(value);
}

function issueLines(issues: CourseIssue[]) {
  if (issues.length === 0) return ["- 未发现阻断性问题。空行不会被当作 0。"];
  return issues.map((issue) => {
    const level = issue.level === "error" ? "需修正" : "需复查";
    return `- [${level}] ${issue.message}`;
  });
}

export function buildSummaryMarkdown(
  draft: ExperimentOneDraft,
  solids: SolidsEvaluation,
  turbidity: TurbidityEvaluation,
  generatedAt = new Date(),
) {
  const lines: string[] = [];
  lines.push(
    "# 实验一 废水悬浮固体及浊度",
    "",
    "> 环境监测课程 · 本摘要用于核对和继续录入，不是正式实验报告。",
    "",
    "## 样品信息",
    "",
    `- 样品编号：${displayRaw(draft.sampleId)}`,
    `- 组别：${displayRaw(draft.group)}`,
    `- 测定日期：${displayRaw(draft.measuredAt)}`,
    `- 导出时间：${generatedAt.toLocaleString("zh-CN")}`,
    `- 备注：${displayRaw(draft.note)}`,
    "",
    "## 悬浮固体（重量法）",
    "",
    "公式：C（mg/L） = [m后（mg） − m前（mg）] × 1000 ÷ V（mL）",
    "",
    "| 平行 | 称量前 | 称量后 | 质量单位 | 水样体积 (mL) | 质量差 (mg) | 浓度 (mg/L) | 状态 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const row of solids.rows) {
    lines.push(
      `| ${row.rowNumber} | ${displayRaw(draft.solidsRows[row.rowNumber - 1]?.before ?? "")} | ${displayRaw(
        draft.solidsRows[row.rowNumber - 1]?.after ?? "",
      )} | ${draft.solidsRows[row.rowNumber - 1]?.massUnit ?? "mg"} | ${displayRaw(
        draft.solidsRows[row.rowNumber - 1]?.volume ?? "",
      )} | ${displayQuantity(row.massDifferenceMg)} | ${displayQuantity(row.concentrationMgL)} | ${
        rowStatusLabels[row.status]
      } |`,
    );
  }
  lines.push(
    "",
    `- 已计算：${solids.computedCount} 行`,
    `- 浓度均值：${displayQuantity(solids.meanConcentrationMgL)}${
      solids.meanConcentrationMgL === null ? "" : " mg/L"
    }${solids.meanIncludesReview ? "（包含需复查行，未自动剔除）" : ""}`,
    `- 缺失：${solids.missingCount} 行；需修正：${solids.invalidCount} 行；需复查：${solids.reviewCount} 行`,
    "",
    "## 浊度（浊度计法）",
    "",
    "| 平行 | 仪器读数 | 仪器单位 | 状态 |",
    "| --- | --- | --- | --- |",
  );
  for (const row of turbidity.rows) {
    const source = draft.turbidityRows[row.rowNumber - 1];
    lines.push(
      `| ${row.rowNumber} | ${displayRaw(source?.reading ?? "")} | ${displayRaw(source?.unit ?? "")} | ${
        rowStatusLabels[row.status]
      } |`,
    );
  }
  lines.push(
    "",
    `- 有效读数：${turbidity.validCount} 行；缺失：${turbidity.missingCount} 行；需修正：${turbidity.invalidCount} 行`,
    `- 仪器单位：${turbidity.units.length > 0 ? turbidity.units.join("、") : "—"}`,
    `- 组均值：${
      turbidity.mean === null
        ? turbidity.aggregationPaused
          ? "未计算（仪器单位不一致）"
          : "未计算"
        : `${formatQuantity(turbidity.mean)} ${turbidity.meanUnit ?? ""}`.trim()
    }`,
    "",
    "## 数据检查",
    "",
    ...issueLines([...solids.issues, ...turbidity.issues]),
    "",
    "## 单位与计算规则（待课程讲义确认）",
    "",
    "- 水样体积按 mL 录入；如果讲义采用 L，需要先换算。",
    "- 悬浮固体质量可用 mg 或 g，本摘要统一折算为 mg 后计算。",
    "- 浊度组均值只在仪器单位一致时计算。",
    "- 浓度显示 1 至 2 位小数，正式报告修约规则以讲义为准。",
    "- 平行样数量、空白、质控样和异常值处理要求以讲义为准。",
    "",
    "> 现场照片只保存在当前浏览器，不写入本摘要。",
    "",
  );
  return lines.join("\n");
}

function rowIssueText(issues: CourseIssue[]) {
  return issues.map((issue) => issue.message).join("；");
}

export function buildSolidsCsv(draft: ExperimentOneDraft, evaluation: SolidsEvaluation) {
  const header = [
    "样品编号",
    "组别",
    "测定日期",
    "平行",
    "称量前",
    "称量后",
    "质量单位",
    "水样体积(mL)",
    "质量差(mg)",
    "浓度(mg/L)",
    "状态",
    "检查提示",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const row of evaluation.rows) {
    const source = draft.solidsRows[row.rowNumber - 1];
    lines.push(
      [
        draft.sampleId,
        draft.group,
        draft.measuredAt,
        row.rowNumber,
        source?.before ?? "",
        source?.after ?? "",
        source?.massUnit ?? "mg",
        source?.volume ?? "",
        row.massDifferenceMg === null ? "" : formatQuantity(row.massDifferenceMg),
        row.concentrationMgL === null ? "" : formatQuantity(row.concentrationMgL),
        rowStatusLabels[row.status],
        rowIssueText(row.issues),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function buildTurbidityCsv(draft: ExperimentOneDraft, evaluation: TurbidityEvaluation) {
  const header = [
    "样品编号",
    "组别",
    "测定日期",
    "平行",
    "仪器读数",
    "仪器单位",
    "状态",
    "检查提示",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const row of evaluation.rows) {
    const source = draft.turbidityRows[row.rowNumber - 1];
    lines.push(
      [
        draft.sampleId,
        draft.group,
        draft.measuredAt,
        row.rowNumber,
        source?.reading ?? "",
        source?.unit ?? "",
        rowStatusLabels[row.status],
        rowIssueText(row.issues),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const summaryRows = [
    [],
    ["汇总", "有效行", "缺失行", "需修正行", "组均值", "单位"],
    [
      "浊度",
      evaluation.validCount,
      evaluation.missingCount,
      evaluation.invalidCount,
      evaluation.mean === null ? "未计算" : formatQuantity(evaluation.mean),
      evaluation.meanUnit ?? "",
    ],
  ];
  for (const summary of summaryRows) {
    lines.push(summary.map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function ensureUniqueRows<T extends { id: string }>(rows: T[], prefix: "s" | "t"): T[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    let id = row.id || createRowId(prefix);
    while (seen.has(id)) id = createRowId(prefix);
    seen.add(id);
    return { ...row, id };
  });
}

function normalizeSolidsRows(value: unknown): SolidsRow[] {
  if (!Array.isArray(value)) return [createSolidsRow()];
  const rows = value.slice(0, MAX_SOLIDS_ROWS).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    return [
      {
        id: readString(row.id, 80) || createRowId("s"),
        before: readString(row.before, 40),
        after: readString(row.after, 40),
        massUnit: row.massUnit === "g" ? ("g" as const) : ("mg" as const),
        volume: readString(row.volume, 40),
      },
    ];
  });
  return ensureUniqueRows(rows.length > 0 ? rows : [createSolidsRow()], "s");
}

function normalizeTurbidityRows(value: unknown): TurbidityRow[] {
  if (!Array.isArray(value)) return [createTurbidityRow()];
  const rows = value.slice(0, MAX_TURBIDITY_ROWS).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    return [
      {
        id: readString(row.id, 80) || createRowId("t"),
        reading: readString(row.reading, 40),
        unit: readString(row.unit, 16) || "NTU",
      },
    ];
  });
  return ensureUniqueRows(rows.length > 0 ? rows : [createTurbidityRow()], "t");
}

export function parseExperimentOneDraft(raw: string | null): ExperimentOneDraft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== EXPERIMENT_ONE_DRAFT_VERSION) return null;
  const activeTab =
    record.activeTab === "turbidity" || record.activeTab === "photo"
      ? record.activeTab
      : "solids";
  return {
    version: EXPERIMENT_ONE_DRAFT_VERSION,
    sampleId: readString(record.sampleId, MAX_SAMPLE_ID_LENGTH),
    group: readString(record.group, MAX_GROUP_LENGTH),
    measuredAt: readString(record.measuredAt, 20) || todayLocalDate(),
    note: readString(record.note, MAX_NOTE_LENGTH),
    solidsRows: normalizeSolidsRows(record.solidsRows),
    turbidityRows: normalizeTurbidityRows(record.turbidityRows),
    activeTab,
    updatedAt: readString(record.updatedAt, 40) || new Date().toISOString(),
  };
}

export function serializeExperimentOneDraft(draft: ExperimentOneDraft) {
  return JSON.stringify(draft);
}

export function loadExperimentOneDraft(): ExperimentOneDraft | null {
  if (typeof localStorage === "undefined") return null;
  return parseExperimentOneDraft(localStorage.getItem(EXPERIMENT_ONE_DRAFT_KEY));
}

export function saveExperimentOneDraft(draft: ExperimentOneDraft): ExperimentOneDraft {
  if (typeof localStorage === "undefined") {
    throw new Error("当前浏览器不支持本地草稿存储。");
  }
  const stored: ExperimentOneDraft = {
    ...draft,
    version: EXPERIMENT_ONE_DRAFT_VERSION,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(EXPERIMENT_ONE_DRAFT_KEY, serializeExperimentOneDraft(stored));
  return stored;
}

export function clearExperimentOneDraft() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(EXPERIMENT_ONE_DRAFT_KEY);
}

export function fieldInputId(project: ProjectId, rowId: string, field: string) {
  return `course-${project}-${rowId}-${field}`;
}