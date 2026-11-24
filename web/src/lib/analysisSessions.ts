import type { AnalysisConfig, Delimiter } from "./analysis";

const STORAGE_KEY = "envirolab.analysis-sessions.v1";
const MAX_SESSIONS = 30;

export interface AnalysisSession {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  experimentId?: string;
  experimentName?: string;
  fileName: string;
  headers: string[];
  rows: string[][];
  delimiter?: Delimiter;
  config: AnalysisConfig;
  summary: string;
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isSession(value: unknown): value is AnalysisSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AnalysisSession>;
  return (
    typeof session.id === "string" &&
    typeof session.name === "string" &&
    typeof session.fileName === "string" &&
    Array.isArray(session.headers) &&
    Array.isArray(session.rows) &&
    Boolean(session.config) &&
    typeof session.config === "object"
  );
}

export function listAnalysisSessions(): AnalysisSession[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isSession)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch {
    return [];
  }
}

export function getAnalysisSession(id: string): AnalysisSession | null {
  return listAnalysisSessions().find((session) => session.id === id) ?? null;
}

export function saveAnalysisSession(
  input: Omit<AnalysisSession, "id" | "createdAt" | "updatedAt"> & { id?: string },
): AnalysisSession {
  const sessions = listAnalysisSessions();
  const existing = input.id ? sessions.find((session) => session.id === input.id) : undefined;
  const now = new Date().toISOString();
  const session: AnalysisSession = {
    ...input,
    id: existing?.id ?? input.id ?? makeId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const next = [session, ...sessions.filter((item) => item.id !== session.id)].slice(0, MAX_SESSIONS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      throw new Error("浏览器本地存储空间不足。请删除旧记录，或减少数据行数后再保存。");
    }
    throw new Error("无法保存到浏览器存储，请检查浏览器隐私设置。");
  }
  return session;
}

export function deleteAnalysisSession(id: string) {
  const next = listAnalysisSessions().filter((session) => session.id !== id);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    throw new Error("无法更新浏览器本地记录。");
  }
}

export function countAnalysisSessions() {
  return listAnalysisSessions().length;
}

export function formatSessionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
