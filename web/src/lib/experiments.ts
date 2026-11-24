export type EvidenceStatus = "source_verified" | "partially_verified" | "needs_supplement" | "ai_draft";
export type ReviewStatus = "verified" | "pending_review" | "ai_draft";
export type CalculationStatus = "not_implemented" | "in_development" | "implemented_untested" | "tested";
export type SourceAccess =
  | "official_document"
  | "official_metadata"
  | "open_textbook"
  | "open_dataset"
  | "peer_reviewed_fulltext"
  | "abstract_only";

export interface Discipline {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  experiment_count: number;
}

export interface ExperimentSummary {
  id: string;
  name: string;
  english_name: string;
  discipline_id: string;
  discipline_name: string;
  summary: string;
  tags: string[];
  evidence_status: EvidenceStatus;
  review_status: ReviewStatus;
  calculation_status: CalculationStatus;
  completeness: number;
  updated_at: string;
}

export interface ExperimentMethod {
  purpose: string;
  principle: string;
  materials: string[];
  instruments: string[];
  steps: string[];
  independent_variables: string[];
  dependent_variables: string[];
  controlled_variables: string[];
  data_processing: string;
  limitations: string[];
}

export interface ExperimentFormula {
  id: string;
  name: string;
  expression: string;
  description: string;
  symbols: string[];
  units: string;
  applicable_conditions: string;
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  doi: string | null;
  url: string;
  source_type: string;
  source_access: SourceAccess;
  notes: string | null;
}

export interface ExperimentDetail extends ExperimentSummary {
  version: number;
  created_at: string;
  method: ExperimentMethod;
  formulas: ExperimentFormula[];
  papers: Paper[];
}

export interface ExperimentListResponse {
  items: ExperimentSummary[];
  total: number;
  limit: number;
  offset: number;
}

export const getApiBase = () => {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  return (configured || "/api").replace(/\/+$/, "");
};

export function isStaticCatalogMode() {
  return import.meta.env.VITE_STATIC_CATALOG === "true";
}

interface StaticSeed {
  disciplines: Array<{
    id: string;
    name: string;
    description: string;
    sort_order: number;
  }>;
  experiments: ExperimentDetail[];
}

let staticCatalogPromise: Promise<StaticSeed> | null = null;

function loadStaticCatalog() {
  if (!staticCatalogPromise) {
    staticCatalogPromise = import("../data/catalog.json")
      .then((module) => module.default as unknown as StaticSeed)
      .catch((error) => {
        staticCatalogPromise = null;
        throw error;
      });
  }
  return staticCatalogPromise;
}

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

function toSummary(experiment: ExperimentDetail): ExperimentSummary {
  const {
    id,
    name,
    english_name,
    discipline_id,
    discipline_name,
    summary,
    tags,
    evidence_status,
    review_status,
    calculation_status,
    completeness,
    updated_at,
  } = experiment;
  return {
    id,
    name,
    english_name,
    discipline_id,
    discipline_name,
    summary,
    tags,
    evidence_status,
    review_status,
    calculation_status,
    completeness,
    updated_at,
  };
}

function staticMatches(experiment: ExperimentSummary, query: string) {
  const needle = query.toLocaleLowerCase();
  return (
    experiment.name.toLocaleLowerCase().includes(needle) ||
    experiment.english_name.toLocaleLowerCase().includes(needle) ||
    experiment.summary.toLocaleLowerCase().includes(needle) ||
    experiment.tags.some((tag) => tag.toLocaleLowerCase().includes(needle))
  );
}

async function listStaticExperiments(
  params: { q?: string; disciplineId?: string; limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<ExperimentListResponse> {
  const catalog = await loadStaticCatalog();
  ensureNotAborted(signal);
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;
  const query = params.q?.trim() ?? "";
  const items = catalog.experiments
    .filter(
      (experiment) =>
        (!params.disciplineId || experiment.discipline_id === params.disciplineId) &&
        (!query || staticMatches(experiment, query)),
    )
    .map(toSummary)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
  };
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("无法连接数据服务，请稍后重试");
  }
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const result = await response.json();
      if (typeof result.detail === "string") message = result.detail;
    } catch {
      // The status code remains sufficient when the server returns no JSON body.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function getDisciplines(signal?: AbortSignal): Promise<Discipline[]> {
  if (!isStaticCatalogMode()) {
    return request<Discipline[]>("/disciplines", signal);
  }
  const catalog = await loadStaticCatalog();
  ensureNotAborted(signal);
  const counts = new Map<string, number>();
  for (const experiment of catalog.experiments) {
    counts.set(experiment.discipline_id, (counts.get(experiment.discipline_id) ?? 0) + 1);
  }
  return catalog.disciplines
    .map((discipline) => ({
      ...discipline,
      experiment_count: counts.get(discipline.id) ?? 0,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function getExperiments(
  params: { q?: string; disciplineId?: string; limit?: number; offset?: number },
  signal?: AbortSignal,
) {
  if (isStaticCatalogMode()) return listStaticExperiments(params, signal);
  const search = new URLSearchParams({
    limit: String(params.limit ?? 100),
    offset: String(params.offset ?? 0),
  });
  if (params.q) search.set("q", params.q);
  if (params.disciplineId) search.set("discipline_id", params.disciplineId);
  return request<ExperimentListResponse>(`/experiments?${search}`, signal);
}

export function searchExperiments(query: string, disciplineId?: string, signal?: AbortSignal) {
  if (isStaticCatalogMode()) {
    return listStaticExperiments(
      { q: query, disciplineId, limit: 100, offset: 0 },
      signal,
    );
  }
  const search = new URLSearchParams({ q: query, limit: "100", offset: "0" });
  if (disciplineId) search.set("discipline_id", disciplineId);
  return request<ExperimentListResponse>(`/experiments/search?${search}`, signal);
}

export async function getExperiment(id: string, signal?: AbortSignal): Promise<ExperimentDetail> {
  if (!isStaticCatalogMode()) {
    return request<ExperimentDetail>(`/experiments/${encodeURIComponent(id)}`, signal);
  }
  const catalog = await loadStaticCatalog();
  ensureNotAborted(signal);
  const experiment = catalog.experiments.find((item) => item.id === id);
  if (!experiment) throw new Error("没有找到这个实验档案");
  return experiment;
}

export async function getRelatedExperiments(
  id: string,
  signal?: AbortSignal,
): Promise<ExperimentListResponse> {
  if (!isStaticCatalogMode()) {
    return request<ExperimentListResponse>(
      `/experiments/${encodeURIComponent(id)}/related`,
      signal,
    );
  }
  const catalog = await loadStaticCatalog();
  ensureNotAborted(signal);
  const source = catalog.experiments.find((item) => item.id === id);
  if (!source) throw new Error("没有找到这个实验档案");
  const sourceTags = new Set(source.tags);
  const scored = catalog.experiments
    .filter((candidate) => candidate.id !== id)
    .map((candidate) => {
      const sharedTags = candidate.tags.filter((tag) => sourceTags.has(tag)).length;
      const sameDiscipline = candidate.discipline_id === source.discipline_id ? 1 : 0;
      return { candidate, score: sharedTags * 2 + sameDiscipline };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.candidate.name.localeCompare(b.candidate.name, "zh-CN"),
    );
  return {
    items: scored.slice(0, 4).map((item) => toSummary(item.candidate)),
    total: scored.length,
    limit: 4,
    offset: 0,
  };
}

export const reviewStatusLabels: Record<ReviewStatus, string> = {
  verified: "已审核",
  pending_review: "待审核",
  ai_draft: "AI 草案",
};

export const evidenceStatusLabels: Record<EvidenceStatus, string> = {
  source_verified: "来源已核验",
  partially_verified: "部分核验",
  needs_supplement: "待补充",
  ai_draft: "AI 草案",
};

export const calculationStatusLabels: Record<CalculationStatus, string> = {
  not_implemented: "计算模块未实现",
  in_development: "计算模块开发中",
  implemented_untested: "计算模块待测试",
  tested: "计算模块已测试",
};

export const sourceAccessLabels: Record<SourceAccess, string> = {
  official_document: "官方文档",
  official_metadata: "官方元数据",
  open_textbook: "开放教材",
  open_dataset: "开放数据集",
  peer_reviewed_fulltext: "同行评审全文",
  abstract_only: "仅摘要",
};

export function formatArchiveDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
