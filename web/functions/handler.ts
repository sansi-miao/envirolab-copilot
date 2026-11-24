import { seed } from "./seed.ts";

interface Formula {
  id: string;
  name: string;
  expression: string;
  description: string;
  symbols: string[];
  units: string;
  applicable_conditions: string;
}

interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  doi: string | null;
  url: string;
  source_type: string;
  source_access: string;
  notes: string | null;
}

interface Experiment {
  id: string;
  name: string;
  english_name: string;
  discipline_id: string;
  discipline_name: string;
  summary: string;
  tags: string[];
  evidence_status: string;
  review_status: string;
  calculation_status: string;
  completeness: number;
  updated_at: string;
  version: number;
  created_at: string;
  method: Record<string, unknown>;
  formulas: Formula[];
  papers: Paper[];
}

interface Discipline {
  id: string;
  name: string;
  description: string;
  sort_order: number;
}

const experiments = seed.experiments as Experiment[];
const disciplines = seed.disciplines as Discipline[];
const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...headers },
  });
}

function summary(experiment: Experiment) {
  return {
    id: experiment.id,
    name: experiment.name,
    english_name: experiment.english_name,
    discipline_id: experiment.discipline_id,
    discipline_name: experiment.discipline_name,
    summary: experiment.summary,
    tags: experiment.tags,
    evidence_status: experiment.evidence_status,
    review_status: experiment.review_status,
    calculation_status: experiment.calculation_status,
    completeness: experiment.completeness,
    updated_at: experiment.updated_at,
  };
}

function detail(experiment: Experiment) {
  return {
    ...summary(experiment),
    version: experiment.version,
    created_at: experiment.created_at,
    method: experiment.method,
    formulas: experiment.formulas,
    papers: experiment.papers,
    evidence: [],
  };
}

function compareByName(left: Experiment, right: Experiment) {
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  return 0;
}

function filterExperiments(query: string | null, disciplineId: string | null) {
  return experiments
    .filter((experiment) => !disciplineId || experiment.discipline_id === disciplineId)
    .filter((experiment) => {
      if (!query) return true;
      const needle = query.toLocaleLowerCase();
      return (
        experiment.name.toLocaleLowerCase().includes(needle) ||
        experiment.english_name.toLocaleLowerCase().includes(needle) ||
        experiment.summary.toLocaleLowerCase().includes(needle) ||
        experiment.tags.some((tag) => tag.toLocaleLowerCase().includes(needle))
      );
    })
    .sort(compareByName);
}

function listResponse(url: URL, requireQuery: boolean) {
  const query = url.searchParams.get("q");
  if (requireQuery && !query) {
    return json({ detail: "Query parameter q is required" }, 422);
  }
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
    return json({ detail: "Invalid pagination" }, 422);
  }
  const items = filterExperiments(query, url.searchParams.get("discipline_id"));
  return json({
    items: items.slice(offset, offset + limit).map(summary),
    total: items.length,
    limit,
    offset,
  });
}

function relatedResponse(experiment: Experiment, url: URL) {
  const limit = Number(url.searchParams.get("limit") ?? "4");
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    return json({ detail: "Invalid limit" }, 422);
  }
  const sourceTags = new Set(experiment.tags);
  const scored = experiments
    .filter((candidate) => candidate.id !== experiment.id)
    .map((candidate) => {
      const sharedTags = candidate.tags.filter((tag) => sourceTags.has(tag)).length;
      const sameDiscipline = candidate.discipline_id === experiment.discipline_id ? 1 : 0;
      return { candidate, score: sharedTags * 2 + sameDiscipline };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || compareByName(left.candidate, right.candidate));
  return json({
    items: scored.slice(0, limit).map((item) => summary(item.candidate)),
    total: scored.length,
    limit,
    offset: 0,
  });
}

export function handler(request: Request): Response {
  if (request.method !== "GET") {
    return json({ detail: "Method Not Allowed" }, 405, { Allow: "GET" });
  }

  const url = new URL(request.url);
  const markerIndex = url.pathname.indexOf("/api");
  if (markerIndex < 0) {
    return json({ detail: "Not Found" }, 404);
  }
  const segments = url.pathname
    .slice(markerIndex + 4)
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (segments.length === 1 && segments[0] === "health") {
    return json({ status: "ok", service: "envirolab-copilot-api", version: "0.1.0" });
  }

  if (segments.length === 1 && segments[0] === "disciplines") {
    return json(
      disciplines.map((discipline) => ({
        ...discipline,
        experiment_count: experiments.filter(
          (experiment) => experiment.discipline_id === discipline.id,
        ).length,
      })),
    );
  }

  if (segments.length === 1 && segments[0] === "experiments") {
    return listResponse(url, false);
  }

  if (segments.length === 2 && segments[0] === "experiments" && segments[1] === "search") {
    return listResponse(url, true);
  }

  if (segments[0] !== "experiments" || !segments[1]) {
    return json({ detail: "Not Found" }, 404);
  }

  const experiment = experiments.find((item) => item.id === segments[1]);
  if (!experiment) {
    return json({ detail: "Experiment not found" }, 404);
  }

  if (segments.length === 3 && segments[2] === "related") {
    return relatedResponse(experiment, url);
  }

  if (segments.length === 3 && segments[2] === "versions") {
    return json([
      {
        version: experiment.version,
        evidence_status: experiment.evidence_status,
        review_status: experiment.review_status,
        calculation_status: experiment.calculation_status,
        completeness: experiment.completeness,
        created_at: experiment.created_at,
        updated_at: experiment.updated_at,
        is_current: true,
        formula_count: experiment.formulas.length,
      },
    ]);
  }

  if (segments.length === 4 && segments[2] === "versions") {
    if (Number(segments[3]) !== experiment.version) {
      return json({ detail: "Experiment version not found" }, 404);
    }
    return json(detail(experiment));
  }

  if (segments.length === 2) {
    const requestedVersion = url.searchParams.get("version");
    if (requestedVersion && Number(requestedVersion) !== experiment.version) {
      return json({ detail: "Experiment version not found" }, 404);
    }
    return json(detail(experiment));
  }

  return json({ detail: "Not Found" }, 404);
}
