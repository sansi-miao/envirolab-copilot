import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Compass,
  ExternalLink,
  FileSearch,
  FlaskConical,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";

import { PageHeader } from "../components/ui/PageHeader";
import { getExperiments, isStaticCatalogMode } from "../lib/experiments";
import {
  getLiteratureHealth,
  LiteratureApiError,
  openAccessLabels,
  searchLiterature,
  type LiteratureHealthResponse,
  type LiteratureMode,
  type LiteratureSearchParams,
  type LiteratureSearchResponse,
} from "../lib/literature";

const exampleDrafts = [
  "活性炭吸附水中 COD",
  "微塑料 淡水 毒性",
];

const modeLabels: Record<LiteratureMode, string> = {
  keyword: "关键词",
  doi: "DOI",
};

function formatAuthors(authors: string[]) {
  if (authors.length === 0) return "作者信息缺失";
  if (authors.length <= 6) return authors.join(" · ");
  return `${authors.slice(0, 6).join(" · ")} 等`;
}

function healthLabel(health: LiteratureHealthResponse | null) {
  if (!health) return "检索后更新服务状态";
  if (health.status === "ready") return "Crossref 已响应";
  if (health.status === "degraded") return "Crossref 最近失败";
  return "Crossref 状态未知";
}

function healthTone(health: LiteratureHealthResponse | null) {
  if (!health) return "status-chip--neutral";
  if (health.status === "ready") return "status-chip--positive";
  if (health.status === "degraded") return "status-chip--warning";
  return "status-chip--neutral";
}

function parseYear(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d{4}$/.test(trimmed)) throw new Error(`${label}请输入四位年份。`);
  const year = Number(trimmed);
  if (year < 1000 || year > 2100) throw new Error(`${label}需要在 1000 到 2100 之间。`);
  return year;
}

function normalizeDoiDraft(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
}

export function DiscoverPage({ initialDraft }: { initialDraft: string }) {
  const staticMode = isStaticCatalogMode();
  const [draft, setDraft] = useState(initialDraft);
  const [mode, setMode] = useState<LiteratureMode>("keyword");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LiteratureSearchResponse | null>(null);
  const [searchError, setSearchError] = useState<LiteratureApiError | null>(null);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [health, setHealth] = useState<LiteratureHealthResponse | null>(null);
  const [retryAfter, setRetryAfter] = useState(0);
  const [archiveTotal, setArchiveTotal] = useState<number | null>(null);
  const [externalQuery, setExternalQuery] = useState<string | null>(null);
  const [externalMode, setExternalMode] = useState<LiteratureMode>("keyword");
  const controllerRef = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const lastRequestRef = useRef<LiteratureSearchParams | null>(null);

  useEffect(() => {
    if (initialDraft) setDraft(initialDraft);
  }, [initialDraft]);

  useEffect(() => {
    const controller = new AbortController();
    getExperiments({ limit: 1 }, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setArchiveTotal(response.total);
      })
      .catch(() => {
        // The archive count is independent from literature search.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setTimeout(() => {
      setRetryAfter((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfter]);

  async function refreshHealth() {
    if (staticMode) return;
    try {
      const nextHealth = await getLiteratureHealth();
      setHealth(nextHealth);
    } catch {
      // A health check failure must not replace the search error already shown.
    }
  }

  async function runSearch(params: LiteratureSearchParams) {
    if (staticMode) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setLoading(true);
    setSearchError(null);
    setResult(null);
    setRetryAfter(0);

    try {
      const response = await searchLiterature(params, controller.signal);
      if (controller.signal.aborted || sequence !== requestSequence.current) return;
      setResult(response);
      setSearchedQuery(response.query);
      void refreshHealth();
    } catch (error) {
      if (controller.signal.aborted || sequence !== requestSequence.current) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      const apiError =
        error instanceof LiteratureApiError
          ? error
          : new LiteratureApiError(0, "unknown_error", "文献检索失败，请稍后重试。");
      setSearchError(apiError);
      setSearchedQuery(params.query);
      setRetryAfter(apiError.retryAfter ?? 0);
      void refreshHealth();
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) {
      setFormError("请先写下一个研究问题或检索关键词。");
      return;
    }
    if (trimmed.length > 200) {
      setFormError("检索草稿不能超过 200 个字符。");
      return;
    }

    if (staticMode) {
      const query = mode === "doi" ? normalizeDoiDraft(trimmed) : trimmed;
      if (mode === "doi" && !/^10\.\d{4,9}\//.test(query)) {
        setFormError("请输入 DOI，例如 10.1000/example。");
        return;
      }
      setFormError("");
      setExternalQuery(query);
      setExternalMode(mode);
      setResult(null);
      setSearchError(null);
      setSearchedQuery(query);
      setLoading(false);
      return;
    }

    let parsedFrom: number | undefined;
    let parsedTo: number | undefined;
    try {
      if (mode === "keyword") {
        parsedFrom = parseYear(yearFrom, "起始年份");
        parsedTo = parseYear(yearTo, "结束年份");
        if (parsedFrom !== undefined && parsedTo !== undefined && parsedFrom > parsedTo) {
          throw new Error("起始年份不能大于结束年份。");
        }
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "年份范围不合法。");
      return;
    }

    const params: LiteratureSearchParams = {
      query: trimmed,
      mode,
      yearFrom: parsedFrom,
      yearTo: parsedTo,
      page: 1,
      pageSize: 20,
    };
    lastRequestRef.current = params;
    setFormError("");
    void runSearch(params);
  }

  function retrySearch() {
    if (loading || retryAfter > 0) return;
    const previous = lastRequestRef.current;
    if (previous) {
      void runSearch(previous);
    }
  }

  const hasSearched = staticMode
    ? externalQuery !== null
    : loading || result !== null || searchError !== null;
  const resultCount = result?.items.length ?? 0;

  return (
    <div className="page-frame">
      <PageHeader
        eyebrow={staticMode ? "Literature discovery · External links" : "Literature discovery · Crossref"}
        title="把研究问题变成可核验的文献线索"
        description={
          staticMode
            ? "静态版不向 Crossref 发请求。先确认检索词或 DOI，再打开外部检索入口；本站不保存检索结果，也不把外部结果自动写入档案。"
            : "先编辑检索草稿，再明确点击搜索。结果保留 DOI、来源链接和检索时间，不生成摘要，也不把开放状态当成全文证据。"
        }
        actions={
          <>
            <span className="status-chip status-chip--positive">
              <ShieldCheck size={12} strokeWidth={1.5} aria-hidden="true" />
              {staticMode ? "静态版 · 仅外部入口" : "Crossref 检索已接入"}
            </span>
            <a href="#/analysis" className="button button--secondary button--small">
              <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
              转到数据分析
            </a>
          </>
        }
      />

      <div className="discovery-layout">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="question-brief" aria-labelledby="search-draft-title">
            <div className="discovery-panel-head">
              <div>
                <p className="eyebrow">
                  <Compass size={12} strokeWidth={1.5} aria-hidden="true" />
                  Search brief
                </p>
                <h2 id="search-draft-title" className="discovery-panel-title">检索草稿</h2>
              </div>
              <span className={`status-chip ${staticMode ? "status-chip--neutral" : healthTone(health)}`}>
                {staticMode ? "外部入口 · 不发送站内请求" : healthLabel(health)}
              </span>
            </div>

            <form onSubmit={handleSubmit} className="literature-form" aria-busy={loading}>
              <div className="literature-form__top">
                <div className="segmented literature-mode" role="group" aria-label="检索模式">
                  {(Object.keys(modeLabels) as LiteratureMode[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={mode === value}
                      className="segmented__button"
                      onClick={() => {
                        setMode(value);
                        setFormError("");
                      }}
                    >
                      {modeLabels[value]}
                    </button>
                  ))}
                </div>
                <span className="literature-count">{draft.length} / 200</span>
              </div>

              <label className="literature-draft">
                <span className="sr-only">检索草稿</span>
                <textarea
                  value={draft}
                  maxLength={200}
                  rows={3}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    if (formError) setFormError("");
                  }}
                  placeholder={mode === "doi" ? "10.1000/example" : "例如：活性炭投加量对水中 COD 去除率的影响"}
                  className="literature-draft__textarea"
                />
              </label>

              {mode === "keyword" && (
                <div className="literature-filters">
                  {!staticMode && (
                    <>
                      <label className="analysis-field">
                        <span className="analysis-field__label">起始年份（可选）</span>
                        <input
                          value={yearFrom}
                          inputMode="numeric"
                          maxLength={4}
                          onChange={(event) => setYearFrom(event.target.value)}
                          placeholder="2015"
                          className="field"
                        />
                      </label>
                      <label className="analysis-field">
                        <span className="analysis-field__label">结束年份（可选）</span>
                        <input
                          value={yearTo}
                          inputMode="numeric"
                          maxLength={4}
                          onChange={(event) => setYearTo(event.target.value)}
                          placeholder="2026"
                          className="field"
                        />
                      </label>
                    </>
                  )}
                  <div className="literature-examples">
                    <span>试试</span>
                    {exampleDrafts.map((example) => (
                      <button
                        key={example}
                        type="button"
                        className="literature-example"
                        onClick={() => {
                          setDraft(example);
                          setFormError("");
                        }}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {formError && (
                <p role="alert" className="literature-form__error">
                  <AlertTriangle size={13} strokeWidth={1.5} aria-hidden="true" />
                  {formError}
                </p>
              )}

              <div className="literature-actions">
                <button type="submit" className="button button--primary">
                  {loading ? (
                    <LoaderCircle size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Search size={14} strokeWidth={1.5} aria-hidden="true" />
                  )}
                  {staticMode
                    ? mode === "doi"
                      ? "打开 DOI 页面"
                      : "打开外部文献检索"
                    : loading
                      ? "正在检索，可重新提交"
                      : "搜索文献"}
                </button>
                <p className="literature-actions__note">
                  {staticMode
                    ? mode === "keyword"
                      ? "确认后在新标签页打开 Crossref 或 OpenAlex；本站不发送检索请求。"
                      : "DOI 会去除常见前缀并转为小写，然后打开 doi.org。"
                    : mode === "keyword"
                      ? "关键词会原样发送到 Crossref，不自动翻译或改写。"
                      : "DOI 会去除常见前缀并转为小写后查询单条记录。"}
                </p>
              </div>
            </form>

            <p className="literature-privacy">
              <ShieldCheck size={12} strokeWidth={1.5} aria-hidden="true" />
              {staticMode
                ? "检索词只保留在当前页面内存，不写入 URL 或浏览器存储；打开外部链接后，检索由外部网站处理。"
                : "研究问题只保留在当前页面内存，不写入 URL 或浏览器存储；检索结果刷新后清空。"}
            </p>
          </section>

          <section className="literature-results" aria-live="polite" aria-busy={loading}>
            <div className="literature-results__head">
              <div>
                <p className="eyebrow">
                  <FileSearch size={12} strokeWidth={1.5} aria-hidden="true" />
                  {staticMode ? "External reference links" : "Crossref results"}
                </p>
                <h2 className="discovery-panel-title">
                  {staticMode ? "外部参考资料" : "检索结果"}
                </h2>
              </div>
              {result && !staticMode && (
                <span className="status-chip status-chip--neutral">
                  {result.total.toLocaleString("zh-CN")} 条命中
                </span>
              )}
            </div>

            {!hasSearched && (
              <div className="literature-state literature-state--idle">
                <span className="literature-state__icon">
                  <BookOpen size={19} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <h3>
                  {staticMode ? "静态版不发起站内检索" : "草稿就绪后，由你决定何时检索"}
                </h3>
                <p>
                  {staticMode
                    ? "确认关键词或 DOI 后，点击按钮才会在新标签页打开外部检索入口。这里不会请求后端，也不会写入公共档案。"
                    : "上面的内容不会自动发送。点击“搜索文献”后，才会请求 Crossref 并替换当前结果。"}
                </p>
              </div>
            )}

            {staticMode && externalQuery && (
              <div className="literature-external">
                <span className="literature-state__icon">
                  <ExternalLink size={19} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <h3>已准备好外部检索：{externalQuery}</h3>
                <p>
                  点击下面的链接会在新标签页打开外部服务。检索结果由外部网站返回，不会自动写入本站的公共实验档案。
                </p>
                <div className="literature-external__links">
                  {externalMode === "doi" ? (
                    <a
                      href={`https://doi.org/${encodeURIComponent(externalQuery)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      打开 DOI 页面
                      <ExternalLink size={13} strokeWidth={1.5} aria-hidden="true" />
                    </a>
                  ) : (
                    <>
                      <a
                        href={`https://search.crossref.org/?q=${encodeURIComponent(externalQuery)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Crossref 检索
                        <ExternalLink size={13} strokeWidth={1.5} aria-hidden="true" />
                      </a>
                      <a
                        href={`https://openalex.org/works?search=${encodeURIComponent(externalQuery)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        OpenAlex 检索
                        <ExternalLink size={13} strokeWidth={1.5} aria-hidden="true" />
                      </a>
                    </>
                  )}
                </div>
                <p className="literature-external__note">
                  外部服务可能需要网络连接；请自行核对文献题录、全文可读性和版本信息。
                </p>
              </div>
            )}

            {loading && (
              <div className="literature-skeletons" aria-label="正在加载文献结果">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="literature-skeleton" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            )}

            {searchError && !loading && (
              <div className="literature-error" role="alert">
                <span className="literature-error__icon">
                  <AlertTriangle size={18} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3>这次检索没有完成</h3>
                  <p>{searchError.message}</p>
                  <p className="literature-error__meta">
                    错误码：{searchError.code}
                    {searchedQuery ? ` · 草稿：${searchedQuery}` : ""}
                  </p>
                  <div className="literature-error__actions">
                    <button
                      type="button"
                      className="button button--secondary button--small"
                      onClick={retrySearch}
                      disabled={loading || retryAfter > 0}
                    >
                      <RefreshCw size={13} strokeWidth={1.5} aria-hidden="true" />
                      {retryAfter > 0 ? `请等待 ${retryAfter} 秒` : "重试上一次检索"}
                    </button>
                    <span>也可以修改草稿后重新搜索。</span>
                  </div>
                </div>
              </div>
            )}

            {result && !loading && result.items.length === 0 && (
              <div className="literature-state literature-state--empty">
                <span className="literature-state__icon">
                  <FileSearch size={19} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <h3>没有找到匹配文献</h3>
                <p>
                  Crossref 对“{result.query}”返回 0 条结果。可以缩短关键词、去掉年份限制，或改用更通用的术语。
                </p>
              </div>
            )}

            {result && !loading && result.items.length > 0 && (
              <>
                <div className="literature-summary">
                  <span>
                    本次返回 {resultCount} 条，共 {result.total.toLocaleString("zh-CN")} 条命中
                  </span>
                  <span>
                    {result.mode === "doi" ? "DOI 记录" : "关键词检索"} · {result.source} ·{" "}
                    {new Date(result.retrieved_at).toLocaleString("zh-CN")}
                  </span>
                </div>
                <ol className="literature-list">
                  {result.items.map((item, index) => (
                    <li key={`${item.doi ?? item.url}-${index}`} className="literature-item">
                      <span className="literature-item__index">{String(index + 1).padStart(2, "0")}</span>
                      <div className="literature-item__body">
                        <div className="literature-item__top">
                          <h3 className="literature-item__title">{item.title ?? "标题未知"}</h3>
                          {item.year !== null && <span className="literature-item__year">{item.year}</span>}
                        </div>
                        <p className="literature-item__authors">{formatAuthors(item.authors)}</p>
                        <p className="literature-item__meta">
                          {item.venue ?? "来源信息缺失"}
                          {item.doi && <> · DOI {item.doi}</>}
                        </p>
                        <div className="literature-item__footer">
                          <span className="status-chip status-chip--neutral">
                            {openAccessLabels[item.open_access_status]}
                          </span>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="literature-item__link"
                          >
                            查看来源
                            <ArrowUpRight size={13} strokeWidth={1.5} aria-hidden="true" />
                          </a>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
                {result.total > result.items.length && (
                  <p className="literature-more">
                    当前为第 {result.page} 页，每页最多 {result.page_size} 条。首版暂不提供翻页，缩小关键词或年份范围可以更快定位。
                  </p>
                )}
              </>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="aside-panel">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
              <h2 className="aside-panel__title">这次检索的边界</h2>
            </div>
            <ul className="discovery-boundaries">
              {staticMode ? (
                <>
                  <li>静态版不向站内后端发送文献请求，只打开外部检索入口。</li>
                  <li>外部结果不会自动写入公共实验档案，也不会保存在本站。</li>
                  <li>关键词或 DOI 由你确认后才离开本站；外部网站有自己的隐私规则。</li>
                  <li>不下载或阅读全文，开放获取状态需要你自行核对。</li>
                </>
              ) : (
                <>
                  <li>只检索 Crossref 元数据，不下载或阅读全文。</li>
                  <li>开放获取状态没有证据时显示“未知”，不推断全文可读。</li>
                  <li>关键词由你确认后发送；后端不会自动翻译或扩写。</li>
                  <li>超时、限流和上游故障会显示错误码，可原样重试。</li>
                </>
              )}
            </ul>
          </section>

          <section className="aside-panel">
            <div className="flex items-center gap-2">
              <FlaskConical size={15} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
              <h2 className="aside-panel__title">已有实验档案</h2>
            </div>
            <div className="integrity-score">
              <span className="integrity-score__value">{archiveTotal ?? "—"}</span>
              <span className="integrity-score__unit">records</span>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-ink-400">
              文献检索和实验档案相互独立。即使 Crossref 暂时不可用，已有实验方法仍可查阅。
            </p>
            <a href="#/experiments" className="button button--secondary button--small mt-4 w-full">
              打开实验资源
              <ArrowUpRight size={13} strokeWidth={1.5} aria-hidden="true" />
            </a>
          </section>

          <section className="aside-panel">
            <h2 className="aside-panel__title">文献数据源</h2>
            <div className="source-list">
              <div className="source-row">
                <span>Crossref</span>
                <span className="source-row__status source-row__status--active">
                  {staticMode ? "外部入口" : "已接入"}
                </span>
              </div>
              {["OpenAlex", "Semantic Scholar", "Europe PMC", "arXiv"].map((source) => {
                const external = staticMode && source === "OpenAlex";
                return (
                  <div key={source} className="source-row">
                    <span>{source}</span>
                    <span className={`source-row__status ${external ? "source-row__status--active" : ""}`}>
                      {external ? "外部入口" : "规划中"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="notice-panel">
            <div className="flex items-center gap-2">
              <Info size={13} strokeWidth={1.5} className="text-ink-400" aria-hidden="true" />
              <h2 className="notice-panel__title">当前边界</h2>
            </div>
            <p className="notice-panel__text">
              {staticMode
                ? "静态版只提供外部检索入口，不在站内保存文献结果。AI 摘要、全文阅读和自动方法提取尚未接入，外部检索不能替代阅读原文和导师判断。"
                : "AI 摘要、全文阅读和自动方法提取尚未接入。当前结果只用于定位文献，不替代阅读原文和导师判断。"}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
