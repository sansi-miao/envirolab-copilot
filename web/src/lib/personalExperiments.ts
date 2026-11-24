import { parseDataset, type Delimiter } from "./analysis.ts";
import { csvCell } from "./courseCommon.ts";

export const PERSONAL_EXPERIMENT_VERSION = 1 as const;
export const PERSONAL_EXPERIMENTS_STORAGE_KEY = "envirolab.personal-experiments.v1";
export const MAX_PERSONAL_EXPERIMENTS = 30;
export const MAX_PERSONAL_COLUMNS = 20;
export const MAX_PERSONAL_ROWS = 500;
export const MAX_PERSONAL_NAME_LENGTH = 80;
export const MAX_PERSONAL_HEADER_LENGTH = 40;
export const MAX_PERSONAL_UNIT_LENGTH = 24;
export const MAX_PERSONAL_CELL_LENGTH = 200;
export const MAX_PERSONAL_FILE_BYTES = 12 * 1024 * 1024;

export interface PersonalColumn {
  id: string;
  name: string;
  unit: string;
}

export interface PersonalRow {
  id: string;
  values: string[];
}

export interface PersonalPhotoMeta {
  draftId: string;
  fileName: string;
  width: number;
  height: number;
  addedAt: string;
}

export interface PersonalExperiment {
  version: typeof PERSONAL_EXPERIMENT_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  columns: PersonalColumn[];
  rows: PersonalRow[];
  source: "manual" | "import";
  importedFileName: string;
  photo: PersonalPhotoMeta | null;
}

export interface PersonalImportPreview {
  headers: string[];
  rows: string[][];
  fileName: string;
  delimiter: Delimiter;
  warnings: string[];
}

interface PersonalStore {
  version: typeof PERSONAL_EXPERIMENT_VERSION;
  items: PersonalExperiment[];
}

let idCounter = 0;

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function storageAvailable() {
  return typeof localStorage !== "undefined";
}

function readStore(): PersonalStore {
  if (!storageAvailable()) return { version: PERSONAL_EXPERIMENT_VERSION, items: [] };
  let parsed: unknown;
  try {
    const raw = localStorage.getItem(PERSONAL_EXPERIMENTS_STORAGE_KEY);
    if (!raw) return { version: PERSONAL_EXPERIMENT_VERSION, items: [] };
    parsed = JSON.parse(raw);
  } catch {
    return { version: PERSONAL_EXPERIMENT_VERSION, items: [] };
  }
  const record =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  const items = Array.isArray(record?.items)
    ? record.items
    : Array.isArray(parsed)
      ? parsed
      : [];
  return {
    version: PERSONAL_EXPERIMENT_VERSION,
    items: items
      .map((item) => normalizeExperiment(item))
      .filter((item): item is PersonalExperiment => Boolean(item))
      .slice(0, MAX_PERSONAL_EXPERIMENTS),
  };
}

function writeStore(store: PersonalStore) {
  if (!storageAvailable()) {
    throw new Error("当前浏览器不支持本地存储，无法保存个人实验。");
  }
  try {
    localStorage.setItem(PERSONAL_EXPERIMENTS_STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new Error("浏览器本地存储空间不足。请先导出 CSV，再删除不再使用的个人实验。");
    }
    throw new Error("个人实验保存失败，请检查浏览器是否允许本地存储。");
  }
}

function normalizeColumn(value: unknown, index: number): PersonalColumn {
  if (!value || typeof value !== "object") {
    return {
      id: makeId("col"),
      name: `列 ${index + 1}`,
      unit: "",
    };
  }
  const record = value as Record<string, unknown>;
  return {
    id: text(record.id, 80) || makeId("col"),
    name: text(record.name, MAX_PERSONAL_HEADER_LENGTH),
    unit: text(record.unit, MAX_PERSONAL_UNIT_LENGTH),
  };
}

function normalizeRow(value: unknown, columnCount: number): PersonalRow {
  const record =
    value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const sourceValues = Array.isArray(record?.values) ? record.values : [];
  return {
    id: text(record?.id, 80) || makeId("row"),
    values: Array.from({ length: columnCount }, (_, index) =>
      text(sourceValues[index], MAX_PERSONAL_CELL_LENGTH),
    ),
  };
}

function normalizePhoto(value: unknown): PersonalPhotoMeta | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const draftId = text(record.draftId, 80);
  const fileName = text(record.fileName, 160);
  if (!draftId || !fileName) return null;
  return {
    draftId,
    fileName,
    width: numberValue(record.width),
    height: numberValue(record.height),
    addedAt: text(record.addedAt, 40) || new Date().toISOString(),
  };
}

function normalizeExperiment(value: unknown): PersonalExperiment | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = text(record.id, 80);
  if (!id) return null;
  const columnsSource = Array.isArray(record.columns) ? record.columns : [];
  const columns = columnsSource
    .slice(0, MAX_PERSONAL_COLUMNS)
    .map((column, index) => normalizeColumn(column, index));
  const normalizedColumns =
    columns.length > 0
      ? columns
      : [
          { id: makeId("col"), name: "测量项目", unit: "" },
          { id: makeId("col"), name: "读数", unit: "" },
        ];
  const rowsSource = Array.isArray(record.rows) ? record.rows : [];
  const rows = rowsSource
    .slice(0, MAX_PERSONAL_ROWS)
    .map((row) => normalizeRow(row, normalizedColumns.length));
  const createdAt = text(record.createdAt, 40) || new Date().toISOString();
  return {
    version: PERSONAL_EXPERIMENT_VERSION,
    id,
    name: text(record.name, MAX_PERSONAL_NAME_LENGTH).trim() || "未命名实验",
    createdAt,
    updatedAt: text(record.updatedAt, 40) || createdAt,
    columns: normalizedColumns,
    rows: rows.length > 0 ? rows : [normalizeRow(null, normalizedColumns.length)],
    source: record.source === "import" ? "import" : "manual",
    importedFileName: text(record.importedFileName, 160),
    photo: normalizePhoto(record.photo),
  };
}

export function createPersonalColumn(name = ""): PersonalColumn {
  return { id: makeId("col"), name, unit: "" };
}

export function createPersonalRow(columnCount: number): PersonalRow {
  return {
    id: makeId("row"),
    values: Array.from({ length: Math.max(1, columnCount) }, () => ""),
  };
}

export function personalPhotoDraftId(experimentId: string) {
  return `personal-photo-${experimentId}`.slice(0, 80);
}

export function listPersonalExperiments(): PersonalExperiment[] {
  return readStore().items.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getPersonalExperiment(id: string) {
  return listPersonalExperiments().find((item) => item.id === id) ?? null;
}

export function createPersonalExperiment(name: string): PersonalExperiment {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("请先填写实验名称，再开始记录。");
  }
  if (readStore().items.length >= MAX_PERSONAL_EXPERIMENTS) {
    throw new Error(`最多保存 ${MAX_PERSONAL_EXPERIMENTS} 份个人实验，请先导出并删除不再使用的记录。`);
  }
  const now = new Date().toISOString();
  const experiment: PersonalExperiment = {
    version: PERSONAL_EXPERIMENT_VERSION,
    id: makeId("pe"),
    name: trimmed.slice(0, MAX_PERSONAL_NAME_LENGTH),
    createdAt: now,
    updatedAt: now,
    columns: [
      createPersonalColumn("测量项目"),
      createPersonalColumn("读数"),
      createPersonalColumn("备注"),
    ],
    rows: [createPersonalRow(3), createPersonalRow(3), createPersonalRow(3)],
    source: "manual",
    importedFileName: "",
    photo: null,
  };
  return savePersonalExperiment(experiment);
}

export function savePersonalExperiment(experiment: PersonalExperiment): PersonalExperiment {
  const normalized = normalizeExperiment(experiment);
  if (!normalized) {
    throw new Error("实验记录不完整，无法保存。");
  }
  const store = readStore();
  const exists = store.items.some((item) => item.id === normalized.id);
  if (!exists && store.items.length >= MAX_PERSONAL_EXPERIMENTS) {
    throw new Error(`最多保存 ${MAX_PERSONAL_EXPERIMENTS} 份个人实验，请先导出并删除不再使用的记录。`);
  }
  const saved: PersonalExperiment = {
    ...normalized,
    updatedAt: new Date().toISOString(),
  };
  const items = exists
    ? store.items.map((item) => (item.id === saved.id ? saved : item))
    : [saved, ...store.items];
  items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  writeStore({ version: PERSONAL_EXPERIMENT_VERSION, items });
  return saved;
}

export function deletePersonalExperiment(id: string) {
  const store = readStore();
  const items = store.items.filter((item) => item.id !== id);
  writeStore({ version: PERSONAL_EXPERIMENT_VERSION, items });
}

export function hasPersonalData(experiment: PersonalExperiment) {
  return experiment.rows.some((row) => row.values.some((value) => value.trim() !== ""));
}

export function countFilledPersonalRows(experiment: PersonalExperiment) {
  return experiment.rows.filter((row) => row.values.some((value) => value.trim() !== "")).length;
}

export function parsePersonalImport(text: string, fileName = "粘贴的数据"): PersonalImportPreview {
  if (!text.trim()) {
    throw new Error("请先选择 CSV / TSV 文件，或把 Excel 表格粘贴到输入框。");
  }
  if (text.length > MAX_PERSONAL_FILE_BYTES) {
    throw new Error("导入内容超过 12 MB，请拆分后再试。");
  }
  const dataset = parseDataset(text, fileName, { minColumns: 1 });
  const warnings = [...dataset.warnings];
  let headers = dataset.headers;
  let rows = dataset.rows;
  if (headers.length > MAX_PERSONAL_COLUMNS) {
    headers = headers.slice(0, MAX_PERSONAL_COLUMNS);
    rows = rows.map((row) => row.slice(0, MAX_PERSONAL_COLUMNS));
    warnings.push(`列数超过 ${MAX_PERSONAL_COLUMNS}，本次只导入前 ${MAX_PERSONAL_COLUMNS} 列。`);
  }
  if (rows.length > MAX_PERSONAL_ROWS) {
    rows = rows.slice(0, MAX_PERSONAL_ROWS);
    warnings.push(`数据超过 ${MAX_PERSONAL_ROWS} 行，本次只导入前 ${MAX_PERSONAL_ROWS} 行。`);
  }
  return {
    headers,
    rows,
    fileName,
    delimiter: dataset.delimiter,
    warnings,
  };
}

export function applyPersonalImport(
  experiment: PersonalExperiment,
  preview: PersonalImportPreview,
): PersonalExperiment {
  const columns = preview.headers.map((name) => ({
    ...createPersonalColumn(name),
  }));
  return {
    ...experiment,
    columns,
    rows: preview.rows.map((values) => ({
      id: makeId("row"),
      values: columns.map((_, index) => (values[index] ?? "").slice(0, MAX_PERSONAL_CELL_LENGTH)),
    })),
    source: "import",
    importedFileName: preview.fileName,
    updatedAt: new Date().toISOString(),
  };
}

export function personalCsvHeader(column: PersonalColumn, index: number) {
  const name = column.name.trim() || `列${index + 1}`;
  const unit = column.unit.trim();
  return unit ? `${name}（${unit}）` : name;
}

export function buildPersonalCsv(experiment: PersonalExperiment) {
  const header = experiment.columns.map((column, index) => personalCsvHeader(column, index));
  const dataRows = experiment.rows.filter((row) =>
    row.values.some((value) => value.trim() !== ""),
  );
  const lines = [header.map(csvCell).join(",")];
  for (const row of dataRows) {
    lines.push(
      experiment.columns
        .map((_, index) => csvCell(row.values[index] ?? ""))
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}