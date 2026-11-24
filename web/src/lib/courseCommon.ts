export type NumericInput =
  | { kind: "blank" }
  | { kind: "invalid" }
  | { kind: "value"; value: number };

export function todayLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateDaysAgo(days: number, date = new Date()) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() - days);
  return todayLocalDate(shifted);
}

export function parseNumericInput(raw: string): NumericInput {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "blank" };
  const normalized = trimmed
    .replace(/[−–—]/g, "-")
    .replace(/[,，]/g, "")
    .replace(/\s+/g, "");
  if (!normalized) return { kind: "invalid" };
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { kind: "invalid" };
  return { kind: "value", value };
}

export function formatQuantity(value: number | null, maxFractionDigits = 2) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value === 0) return "0.0";
  const absolute = Math.abs(value);
  if (absolute < 0.01) {
    return value
      .toPrecision(3)
      .replace(/(\.\d*?[1-9])0+$/, "$1")
      .replace(/\.0+$/, "");
  }
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: maxFractionDigits,
    useGrouping: false,
  }).format(value);
}

export function formatSavedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

export function readString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

export function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function safeFileStem(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}