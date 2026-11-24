import { getApiBase } from "./experiments";

export type LiteratureMode = "keyword" | "doi";
export type OpenAccessStatus = "unknown" | "open" | "closed";

export interface LiteratureSearchParams {
  query: string;
  mode: LiteratureMode;
  yearFrom?: number;
  yearTo?: number;
  page?: number;
  pageSize?: number;
}

export interface LiteratureItem {
  doi: string | null;
  title: string | null;
  authors: string[];
  year: number | null;
  venue: string | null;
  url: string;
  open_access_status: OpenAccessStatus;
}

export interface LiteratureSearchResponse {
  query: string;
  mode: LiteratureMode;
  source: "crossref";
  retrieved_at: string;
  total: number;
  page: number;
  page_size: number;
  items: LiteratureItem[];
}

export interface LiteratureHealthResponse {
  status: "unknown" | "ready" | "degraded";
  source: "crossref";
  configured: boolean;
  checked_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
}

export class LiteratureApiError extends Error {
  status: number;
  code: string;
  retryAfter: number | null;

  constructor(status: number, code: string, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "LiteratureApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function fallbackMessage(status: number) {
  if (status === 429) return "请求过于频繁，请稍后重试。";
  if (status === 504) return "文献服务响应超时，请稍后重试。";
  if (status === 503) return "文献服务暂时不可用，请稍后重试。";
  if (status === 422) return "检索草稿不合法，请检查关键词、DOI、年份和分页范围。";
  return `文献检索失败（${status}）。`;
}

async function readError(response: Response) {
  let code = "request_failed";
  let message = fallbackMessage(response.status);
  let retryAfter: number | null = null;
  try {
    const body = (await response.json()) as {
      error?: { code?: unknown; message?: unknown; retry_after?: unknown };
    };
    if (typeof body.error?.code === "string") code = body.error.code;
    if (typeof body.error?.message === "string" && body.error.message.trim()) {
      message = body.error.message;
    }
    if (typeof body.error?.retry_after === "number") retryAfter = body.error.retry_after;
  } catch {
    // Keep the status-based fallback when the server returns no JSON envelope.
  }
  const headerRetry = Number(response.headers.get("retry-after"));
  if (Number.isFinite(headerRetry) && headerRetry > 0) retryAfter = Math.ceil(headerRetry);
  return new LiteratureApiError(response.status, code, message, retryAfter);
}

export async function searchLiterature(
  params: LiteratureSearchParams,
  signal?: AbortSignal,
): Promise<LiteratureSearchResponse> {
  const body: Record<string, unknown> = {
    query: params.query,
    mode: params.mode,
    page: params.page ?? 1,
    page_size: params.pageSize ?? 20,
  };
  if (params.mode === "keyword") {
    if (params.yearFrom !== undefined) body.year_from = params.yearFrom;
    if (params.yearTo !== undefined) body.year_to = params.yearTo;
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBase()}/literature/search`, {
      method: "POST",
      signal,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new LiteratureApiError(0, "network_error", "无法连接文献服务，请确认本地后端已启动后重试。");
  }

  if (!response.ok) throw await readError(response);
  return response.json() as Promise<LiteratureSearchResponse>;
}

export async function getLiteratureHealth(
  signal?: AbortSignal,
): Promise<LiteratureHealthResponse> {
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}/literature/health`, {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new LiteratureApiError(0, "network_error", "无法读取文献服务状态。");
  }
  if (!response.ok) throw await readError(response);
  return response.json() as Promise<LiteratureHealthResponse>;
}

export const openAccessLabels: Record<OpenAccessStatus, string> = {
  unknown: "开放状态未知",
  open: "开放获取",
  closed: "非开放获取",
};