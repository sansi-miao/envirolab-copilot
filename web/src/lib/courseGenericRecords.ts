import type { CourseReference } from "./course.ts";
import { csvCell, parseNumericInput, readString, todayLocalDate } from "./courseCommon.ts";
import {
  MANUAL_DATA_LABEL,
  SYNTHETIC_DATA_LABEL,
  rawRecordStateLabels,
  type RawCheckIssue,
  type RawRecordState,
} from "./courseRawRecords.ts";

export const GENERIC_DRAFT_VERSION = 1 as const;
export const MAX_GENERIC_ROWS = 20;
export const MAX_GENERIC_SAMPLE_ID_LENGTH = 60;
export const MAX_GENERIC_MEASUREMENT_LENGTH = 60;
export const MAX_GENERIC_READING_LENGTH = 40;
export const MAX_GENERIC_UNIT_LENGTH = 24;
export const MAX_GENERIC_RECORD_NO_LENGTH = 60;
export const MAX_GENERIC_NOTE_LENGTH = 300;

export interface GenericRawRow {
  id: string;
  sampleId: string;
  measurement: string;
  reading: string;
  unit: string;
  note: string;
}

export interface GenericRawDraft {
  version: typeof GENERIC_DRAFT_VERSION;
  sessionId: string;
  measuredAt: string;
  recordNo: string;
  rows: GenericRawRow[];
  isTeachingSample: boolean;
  updatedAt: string;
}

export interface GenericSessionConfig {
  sessionId: "2" | "4" | "8";
  order: number;
  pageTitle: string;
  english: string;
  method: string;
  standards: string;
  purpose: string;
  syntheticNote: string;
  sampleLabel: string;
  samplePlaceholder: string;
  measurementPlaceholder: string;
  unitPlaceholder: string;
  measurementOptions: string[];
  unitOptions: string[];
  defaultMeasurement: string;
  defaultUnit: string;
  allowNegativeReading: boolean;
  pending: string[];
  references: CourseReference[];
  syntheticRecordNo: string;
  syntheticRows: Array<Omit<GenericRawRow, "id">>;
}

export interface GenericRowEvaluation {
  rowId: string;
  index: number;
  hasInput: boolean;
  state: RawRecordState;
  complete: boolean;
  readingValue: number | null;
  issues: RawCheckIssue[];
}

export interface GenericRawEvaluation {
  hasInput: boolean;
  state: RawRecordState;
  complete: boolean;
  startedRowCount: number;
  completeRowCount: number;
  filledRequiredCount: number;
  requiredFieldCount: number;
  issues: RawCheckIssue[];
  rowIssues: Record<string, RawCheckIssue[]>;
  rowStates: Record<string, RawRecordState>;
}

const BOOK_REFERENCE: CourseReference = {
  label: "《环境监测实验技术》",
  detail: "施文健、周化岚主编，北京大学出版社，2009，ISBN 978-7-301-14454-1。",
};

export const genericSessionConfigs: GenericSessionConfig[] = [
  {
    sessionId: "2",
    order: 2,
    pageTitle: "第 2 课次 空气中甲醛的原始记录",
    english: "Formaldehyde in ambient air",
    method: "空气采样 · 分光光度法（课堂方法待确认）",
    standards: "公开方法参考 · GB/T 15516-1995",
    purpose:
      "保存采样点或样品编号、测定日期、测量项目、原始读数、单位、原始记录编号和备注。课堂方法、采样体积和换算规则尚未确认，本页只做原始记录与字段检查。",
    syntheticNote:
      "合成样例只用于核对字段、刷新恢复和 CSV 导出。甲醛数值不是真实测量，开始真实记录前请清空表单。",
    sampleLabel: "采样点或样品编号",
    samplePlaceholder: "例如 AIR-F-01",
    measurementPlaceholder: "如 甲醛质量浓度、吸光度",
    unitPlaceholder: "如 mg/m³、μg/m³、A",
    measurementOptions: ["甲醛质量浓度", "吸光度", "采样体积", "吸收液体积"],
    unitOptions: ["mg/m³", "μg/m³", "A（吸光度）", "L", "mL"],
    defaultMeasurement: "",
    defaultUnit: "",
    allowNegativeReading: false,
    pending: [
      "课堂采用空气采样还是其他采样方式、吸收液配方和采样流量待讲义确认。",
      "原始读数究竟是浓度、吸光度还是采样体积，需要按课堂记录表逐项标明。",
      "采样体积、标准状态换算、标准曲线和稀释倍数待讲义确认。",
      "本页不把原始读数自动换算为甲醛浓度，也不判断结果是否达标。",
      "平行样、空白、质控样和修约规则以课程讲义为准。",
    ],
    references: [
      {
        label: "GB/T 15516-1995《空气质量 甲醛的测定 乙酰丙酮分光光度法》",
        detail:
          "全国标准信息公共服务平台标准页。该公开方法采用乙酰丙酮分光光度法；课堂采样、吸收液和计算是否一致待讲义确认。",
        href: "https://std.samr.gov.cn/gb/search/gbDetailed?id=h5/HUTl223M=&mode=p",
        actionLabel: "打开标准页",
      },
      BOOK_REFERENCE,
    ],
    syntheticRecordNo: "SYN-FORM-R01",
    syntheticRows: [
      {
        sampleId: "SYN-AIR-02",
        measurement: "甲醛质量浓度",
        reading: "0.062",
        unit: "mg/m³",
        note: "教学合成数据，仅用于演示原始记录、刷新恢复和 CSV 导出。",
      },
    ],
  },
  {
    sessionId: "4",
    order: 4,
    pageTitle: "第 4 课次 水中挥发酚的原始记录",
    english: "Volatile phenols in water",
    method: "4-氨基安替比林分光光度法 · HJ 503-2009（课堂方法待确认）",
    standards: "公开方法参考 · HJ 503-2009",
    purpose:
      "保存样品编号、测定日期、测量项目、原始读数、单位、原始记录编号和备注。蒸馏、萃取、显色条件和质控细节尚未确认，本页不做浓度计算或合格判断。",
    syntheticNote:
      "合成样例只用于核对字段、刷新恢复和 CSV 导出。挥发酚数值不是真实测量，开始真实记录前请清空表单。",
    sampleLabel: "样品编号",
    samplePlaceholder: "例如 WW-PH-01",
    measurementPlaceholder: "如 质量浓度、吸光度",
    unitPlaceholder: "如 mg/L、μg/L、A",
    measurementOptions: [
      "挥发酚（以苯酚计）质量浓度",
      "吸光度",
      "蒸馏体积",
      "萃取液体积",
    ],
    unitOptions: ["mg/L", "μg/L", "A（吸光度）", "mL"],
    defaultMeasurement: "",
    defaultUnit: "",
    allowNegativeReading: false,
    pending: [
      "课堂采用萃取分光光度法还是直接分光光度法待讲义确认。",
      "蒸馏、萃取、显色温度与静置时间等操作条件待讲义确认。",
      "原始读数是质量浓度、吸光度还是其他记录值，需要按课堂记录表标明。",
      "标准曲线、空白、质控样、稀释倍数和计算公式待讲义确认。",
      "本页不计算挥发酚浓度，也不判断结果是否合格或达标。",
    ],
    references: [
      {
        label: "HJ 503-2009《水质 挥发酚的测定 4-氨基安替比林分光光度法》",
        detail:
          "全国标准信息公共服务平台标准页。公开标准包含萃取和直接分光光度法；课堂采用哪一种、记录如何对应待讲义确认。",
        href: "https://std.samr.gov.cn/hb/search/stdHBDetailedCNF?id=A3A77F58526A0B1FE05397BE0A0AD4FA",
        actionLabel: "打开标准页",
      },
      BOOK_REFERENCE,
    ],
    syntheticRecordNo: "SYN-PHENOL-R01",
    syntheticRows: [
      {
        sampleId: "SYN-WATER-04",
        measurement: "挥发酚（以苯酚计）质量浓度",
        reading: "0.018",
        unit: "mg/L",
        note: "教学合成数据，仅用于演示原始记录、刷新恢复和 CSV 导出。",
      },
    ],
  },
  {
    sessionId: "8",
    order: 8,
    pageTitle: "第 8 课次 人居环境舒适度的原始记录",
    english: "Human settlement comfort",
    method: "环境指标记录 · PMV/PPD 参考（课堂规则待确认）",
    standards: "公开方法参考 · GB/T 18049-2017",
    purpose:
      "按房间或点位保存温度、湿度、风速、PMV 等测量项目的原始读数和单位。评价指标、测点布置与分级规则尚未确认，本页只做字段检查与导出。",
    syntheticNote:
      "合成样例包含空气温度和相对湿度两行，只用于核对多行记录、刷新恢复和 CSV 导出。数值不是真实测量。",
    sampleLabel: "房间或点位编号",
    samplePlaceholder: "例如 ROOM-A-01",
    measurementPlaceholder: "如 空气温度、相对湿度、PMV",
    unitPlaceholder: "如 °C、%、m/s、—",
    measurementOptions: ["空气温度", "相对湿度", "风速", "黑球温度", "PMV", "PPD"],
    unitOptions: ["°C", "%", "m/s", "—"],
    defaultMeasurement: "",
    defaultUnit: "",
    allowNegativeReading: true,
    pending: [
      "本校采用的舒适度指标、测点数量、测点高度和记录时段待讲义确认。",
      "温度、湿度、风速、黑球温度等项目的仪器与单位待课程记录表确认。",
      "PMV/PPD 需要哪些环境与人体参数、是否由软件计算，均待教师确认。",
      "舒适度分级、报告阈值和合格判断在本轮不启用。",
      "负读数会按原始数值保留，因为 PMV 等指标可能为负；请结合测量项目核对。",
    ],
    references: [
      {
        label: "本校课程讲义与记录表",
        detail:
          "尚未提供。当前只按通用原始记录字段开放录入，讲义确认后补齐测点、仪器和评价规则。",
      },
      {
        label: "GB/T 18049-2017《热环境的人类工效学 通过计算 PMV 和 PPD 指数与局部热舒适准则对热舒适进行分析测定与解释》",
        detail:
          "全国标准信息公共服务平台可检索的 PMV/PPD 公开方法参考；本校是否采用该指标体系和分级规则待讲义确认。",
        href: "https://openstd.samr.gov.cn/bzgk/gb/std_list?p.p1=0&p.p2=GB%2FT%201804&p.p90=circulation_date&p.p91=desc",
        actionLabel: "打开标准检索页",
      },
    ],
    syntheticRecordNo: "SYN-ROOM-R01",
    syntheticRows: [
      {
        sampleId: "SYN-ROOM-01",
        measurement: "空气温度",
        reading: "24.6",
        unit: "°C",
        note: "",
      },
      {
        sampleId: "SYN-ROOM-01",
        measurement: "相对湿度",
        reading: "52",
        unit: "%",
        note: "教学合成数据，仅用于演示同一测点的多个测量项目。",
      },
    ],
  },
];

export function getGenericSessionConfig(sessionId: string) {
  return genericSessionConfigs.find((config) => config.sessionId === sessionId) ?? null;
}

export function genericDraftKey(config: GenericSessionConfig) {
  return `envirolab.course.generic.v1.${config.sessionId}`;
}

let rowCounter = 0;

function makeRowId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `row-${crypto.randomUUID()}`;
  }
  rowCounter += 1;
  return `row-${Date.now().toString(36)}-${rowCounter}`;
}

export function createEmptyGenericRow(): GenericRawRow {
  return {
    id: makeRowId(),
    sampleId: "",
    measurement: "",
    reading: "",
    unit: "",
    note: "",
  };
}

export function createEmptyGenericDraft(config: GenericSessionConfig): GenericRawDraft {
  return {
    version: GENERIC_DRAFT_VERSION,
    sessionId: config.sessionId,
    measuredAt: todayLocalDate(),
    recordNo: "",
    rows: [createEmptyGenericRow()],
    isTeachingSample: false,
    updatedAt: new Date().toISOString(),
  };
}

export function createGenericSyntheticDraft(config: GenericSessionConfig): GenericRawDraft {
  return {
    version: GENERIC_DRAFT_VERSION,
    sessionId: config.sessionId,
    measuredAt: todayLocalDate(),
    recordNo: config.syntheticRecordNo,
    rows: config.syntheticRows.map((row, index) => ({
      ...row,
      id: `syn-${config.sessionId}-${index + 1}`,
    })),
    isTeachingSample: true,
    updatedAt: new Date().toISOString(),
  };
}

export function isGenericRowStarted(row: GenericRawRow) {
  return Boolean(
    row.sampleId.trim() ||
      row.measurement.trim() ||
      row.reading.trim() ||
      row.unit.trim() ||
      row.note.trim(),
  );
}

export function hasGenericContent(draft: GenericRawDraft) {
  return Boolean(draft.recordNo.trim() || draft.rows.some(isGenericRowStarted));
}

function makeIssue(
  config: GenericSessionConfig,
  rowId: string | null,
  field: string,
  level: "error" | "warning",
  message: string,
): RawCheckIssue {
  return {
    id: `generic-${config.sessionId}-${rowId ?? "record"}-${field}-${level}`,
    field: rowId ? `${rowId}:${field}` : field,
    level,
    message,
  };
}

function evaluateRow(
  config: GenericSessionConfig,
  row: GenericRawRow,
  index: number,
): GenericRowEvaluation {
  const hasInput = isGenericRowStarted(row);
  const issues: RawCheckIssue[] = [];
  const reading = parseNumericInput(row.reading);
  const missingReading = reading.kind === "blank";
  const invalidNumber = reading.kind === "invalid";
  const negativeReading = reading.kind === "value" && reading.value < 0;
  let invalidReading = invalidNumber;

  if (hasInput) {
    if (!row.sampleId.trim()) {
      issues.push(makeIssue(config, row.id, "sampleId", "error", "样品或点位编号不能为空。"));
    }
    if (!row.measurement.trim()) {
      issues.push(
        makeIssue(config, row.id, "measurement", "error", "测量项目不能为空；课堂方法未确认时可以手填。"),
      );
    }
    if (missingReading) {
      issues.push(
        makeIssue(config, row.id, "reading", "error", "原始读数不能为空；缺失不按 0 处理。"),
      );
    } else if (invalidNumber) {
      issues.push(
        makeIssue(config, row.id, "reading", "error", "原始读数不是有效数字，请保留原始记录并核对输入。"),
      );
    } else if (negativeReading && !config.allowNegativeReading) {
      invalidReading = true;
      issues.push(
        makeIssue(config, row.id, "reading", "error", "原始读数不能为负数，请核对记录。"),
      );
    }
    if (!row.unit.trim()) {
      issues.push(
        makeIssue(config, row.id, "unit", "error", "单位不能为空；本页不做单位换算。"),
      );
    }
  }

  const state: RawRecordState = !hasInput
    ? "empty"
    : invalidReading
      ? "invalid"
      : issues.length > 0
        ? "partial"
        : "complete";

  return {
    rowId: row.id,
    index,
    hasInput,
    state,
    complete: hasInput && issues.length === 0,
    readingValue:
      reading.kind === "value" && (config.allowNegativeReading || reading.value >= 0)
        ? reading.value
        : null,
    issues,
  };
}

export function evaluateGenericDraft(
  config: GenericSessionConfig,
  draft: GenericRawDraft,
): GenericRawEvaluation {
  const hasInput = hasGenericContent(draft);
  const rows = draft.rows.map((row, index) => evaluateRow(config, row, index));
  const startedRows = rows.filter((row) => row.hasInput);
  const issues: RawCheckIssue[] = [];
  const rowIssues: Record<string, RawCheckIssue[]> = {};
  const rowStates: Record<string, RawRecordState> = {};

  for (const row of rows) {
    rowIssues[row.rowId] = row.issues;
    rowStates[row.rowId] = row.state;
  }

  if (hasInput) {
    if (!draft.measuredAt.trim()) {
      issues.push(makeIssue(config, null, "measuredAt", "error", "测定日期不能为空。"));
    }
    if (!draft.recordNo.trim()) {
      issues.push(makeIssue(config, null, "recordNo", "error", "原始记录编号不能为空。"));
    }
    if (startedRows.length === 0) {
      issues.push(
        makeIssue(config, null, "rows", "error", "至少填写一行样品或测点记录，空白行不会导出。"),
      );
    }
    for (const row of startedRows) {
      issues.push(...row.issues);
    }
  }

  const hasInvalidReading = startedRows.some((row) => row.state === "invalid");
  const state: RawRecordState = !hasInput
    ? "empty"
    : hasInvalidReading
      ? "invalid"
      : issues.length > 0
        ? "partial"
        : "complete";

  const rowRequired = 4;
  const rowFilled = startedRows.reduce((count, row) => {
    const source = draft.rows.find((item) => item.id === row.rowId);
    if (!source) return count;
    return (
      count +
      [
        Boolean(source.sampleId.trim()),
        Boolean(source.measurement.trim()),
        row.readingValue !== null,
        Boolean(source.unit.trim()),
      ].filter(Boolean).length
    );
  }, 0);

  return {
    hasInput,
    state,
    complete: hasInput && issues.length === 0 && startedRows.length > 0,
    startedRowCount: startedRows.length,
    completeRowCount: startedRows.filter((row) => row.complete).length,
    filledRequiredCount:
      (draft.measuredAt.trim() ? 1 : 0) + (draft.recordNo.trim() ? 1 : 0) + rowFilled,
    requiredFieldCount: 2 + startedRows.length * rowRequired,
    issues,
    rowIssues,
    rowStates,
  };
}

function issueText(issues: RawCheckIssue[]) {
  return issues.map((issue) => issue.message).join("；");
}

function dataLabel(draft: GenericRawDraft) {
  return draft.isTeachingSample ? SYNTHETIC_DATA_LABEL : MANUAL_DATA_LABEL;
}

export function buildGenericCsv(
  config: GenericSessionConfig,
  draft: GenericRawDraft,
  evaluation: GenericRawEvaluation,
) {
  const header = [
    "课次",
    "实验名称",
    "样品或点位编号",
    "测定日期",
    "测量项目",
    "原始读数",
    "单位",
    "原始记录编号",
    "备注",
    "行状态",
    "记录状态",
    "数据标注",
    "检查提示",
    "说明",
  ];
  const startedRows = draft.rows.filter(isGenericRowStarted);
  const exportRows =
    startedRows.length > 0
      ? startedRows
      : [
          {
            id: "blank",
            sampleId: "",
            measurement: "",
            reading: "",
            unit: "",
            note: "",
          },
        ];
  const lines = [header.map(csvCell).join(",")];

  for (const row of exportRows) {
    const rowIssueList = evaluation.rowIssues[row.id] ?? [];
    const rowIssues =
      rowIssueList.length > 0
        ? rowIssueList
        : row.id === "blank"
          ? evaluation.issues
          : [];
    lines.push(
      [
        `第 ${config.order} 课次`,
        config.pageTitle,
        row.sampleId,
        draft.measuredAt,
        row.measurement,
        row.reading,
        row.unit,
        draft.recordNo,
        row.note,
        rowStatesLabel(evaluation, row.id),
        rawRecordStateLabels[evaluation.state],
        dataLabel(draft),
        issueText(rowIssues),
        "仅保存原始记录；未计算浓度、指数或正式结论，未判断结果是否合格。",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function rowStatesLabel(evaluation: GenericRawEvaluation, rowId: string) {
  const state = evaluation.rowStates[rowId];
  return state ? rawRecordStateLabels[state] : rawRecordStateLabels.empty;
}

function normalizeRow(value: unknown): GenericRawRow {
  if (!value || typeof value !== "object") return createEmptyGenericRow();
  const record = value as Record<string, unknown>;
  return {
    id: readString(record.id, 80) || makeRowId(),
    sampleId: readString(record.sampleId, MAX_GENERIC_SAMPLE_ID_LENGTH),
    measurement: readString(record.measurement, MAX_GENERIC_MEASUREMENT_LENGTH),
    reading: readString(record.reading, MAX_GENERIC_READING_LENGTH),
    unit: readString(record.unit, MAX_GENERIC_UNIT_LENGTH),
    note: readString(record.note, MAX_GENERIC_NOTE_LENGTH),
  };
}

export function parseGenericDraft(
  raw: string | null,
  config: GenericSessionConfig,
): GenericRawDraft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== GENERIC_DRAFT_VERSION || record.sessionId !== config.sessionId) {
    return null;
  }
  const parsedRows = Array.isArray(record.rows)
    ? record.rows.slice(0, MAX_GENERIC_ROWS).map(normalizeRow)
    : [];
  return {
    version: GENERIC_DRAFT_VERSION,
    sessionId: config.sessionId,
    measuredAt: readString(record.measuredAt, 20) || todayLocalDate(),
    recordNo: readString(record.recordNo, MAX_GENERIC_RECORD_NO_LENGTH),
    rows: parsedRows.length > 0 ? parsedRows : [createEmptyGenericRow()],
    isTeachingSample: record.isTeachingSample === true,
    updatedAt: readString(record.updatedAt, 40) || new Date().toISOString(),
  };
}

export function serializeGenericDraft(draft: GenericRawDraft) {
  return JSON.stringify(draft);
}

export function loadGenericDraft(config: GenericSessionConfig): GenericRawDraft | null {
  if (typeof localStorage === "undefined") return null;
  return parseGenericDraft(localStorage.getItem(genericDraftKey(config)), config);
}

export function saveGenericDraft(
  config: GenericSessionConfig,
  draft: GenericRawDraft,
): GenericRawDraft {
  if (typeof localStorage === "undefined") {
    throw new Error("当前浏览器不支持本地草稿存储。");
  }
  const stored: GenericRawDraft = {
    ...draft,
    version: GENERIC_DRAFT_VERSION,
    sessionId: config.sessionId,
    rows: draft.rows.slice(0, MAX_GENERIC_ROWS),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(genericDraftKey(config), serializeGenericDraft(stored));
  return stored;
}

export function clearGenericDraft(config: GenericSessionConfig) {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(genericDraftKey(config));
}