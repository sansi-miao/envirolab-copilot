import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Database,
  ExternalLink,
  FilePlus,
  FlaskConical,
  LineChart,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { ExperimentCard } from "../components/experiments/ExperimentCard";
import { ExperimentDetailView } from "../components/experiments/ExperimentDetailView";
import { PageHeader } from "../components/ui/PageHeader";
import {
  getDisciplines,
  getExperiment,
  getExperiments,
  getRelatedExperiments,
  isStaticCatalogMode,
  searchExperiments,
  type Discipline,
  type ExperimentDetail,
  type ExperimentListResponse,
  type ExperimentSummary,
} from "../lib/experiments";

type SortOption = "updated" | "name" | "completeness";

const sortLabels: Record<SortOption, string> = {
  updated: "最近更新",
  name: "名称 A–Z",
  completeness: "最高完整度",
};

export function ExperimentsPage({ selectedId }: { selectedId: string }) {
  const staticMode = isStaticCatalogMode();
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [disciplineError, setDisciplineError] = useState("");
  const [result, setResult] = useState<ExperimentListResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [disciplineId, setDisciplineId] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("updated");
  const [retryKey, setRetryKey] = useState(0);
  const [detail, setDetail] = useState<ExperimentDetail | null>(null);
  const [related, setRelated] = useState<ExperimentSummary[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [referenceQuery, setReferenceQuery] = useState("");

  useEffect(() => {
    setReferenceQuery("");
  }, [query, disciplineId]);

  useEffect(() => {
    const controller = new AbortController();
    getDisciplines(controller.signal)
      .then(setDisciplines)
      .catch((error: Error) => {
        if (!controller.signal.aborted) setDisciplineError(error.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true);
    setListError("");
    const request = query
      ? searchExperiments(query, disciplineId || undefined, controller.signal)
      : getExperiments({ disciplineId: disciplineId || undefined }, controller.signal);
    request
      .then(setResult)
      .catch((error: Error) => {
        if (!controller.signal.aborted) setListError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false);
      });
    return () => controller.abort();
  }, [query, disciplineId, retryKey]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setRelated([]);
      setDetailError("");
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    setRelated([]);
    window.scrollTo(0, 0);
    getExperiment(selectedId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setDetail(response);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setDetailError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    getRelatedExperiments(selectedId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setRelated(response.items);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRelated([]);
      });
    return () => controller.abort();
  }, [selectedId]);

  const sortedItems = useMemo(() => {
    const items = [...(result?.items ?? [])];
    if (sortBy === "name") {
      return items.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    }
    if (sortBy === "completeness") {
      return items.sort((a, b) => b.completeness - a.completeness);
    }
    return items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [result, sortBy]);

  const verifiedCount = useMemo(
    () => result?.items.filter((item) => item.evidence_status === "source_verified").length ?? 0,
    [result],
  );
  const pendingCount = useMemo(
    () => result?.items.filter((item) => item.review_status === "pending_review").length ?? 0,
    [result],
  );
  const selectedDiscipline = disciplines.find((item) => item.id === disciplineId);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchInput.trim());
  }

  function resetFilters() {
    setSearchInput("");
    setQuery("");
    setDisciplineId("");
    setSortBy("updated");
  }

  function selectExperiment(id: string) {
    window.location.hash = `/experiments?id=${encodeURIComponent(id)}`;
  }

  function backToList() {
    window.location.hash = "/experiments";
  }

  const hasFilters = Boolean(query || disciplineId);

  if (selectedId) {
    return (
      <div className="page-frame">
        {detailLoading && (
          <div className="loading-panel" role="status">
            <LoaderCircle size={20} strokeWidth={1.5} className="loading-panel__icon animate-spin" aria-hidden="true" />
            <p className="mt-3 text-xs">正在读取完整实验档案</p>
          </div>
        )}
        {!detailLoading && detailError && (
          <div role="alert" className="inline-alert">
            <AlertCircle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p>无法加载实验详情：{detailError}</p>
              <button type="button" onClick={backToList} className="action-link mt-3">
                <ArrowLeft size={13} strokeWidth={1.5} aria-hidden="true" />
                返回实验列表
              </button>
            </div>
          </div>
        )}
        {!detailLoading && detail && (
          <ExperimentDetailView
            experiment={detail}
            related={related}
            onBack={backToList}
            onSelectRelated={selectExperiment}
          />
        )}
      </div>
    );
  }

  return (
    <div className="page-frame">
      <PageHeader
        eyebrow={staticMode ? "Experiment archive · Static catalog" : "Experiment archive · Read only"}
        title="实验档案与步骤"
        description={
          staticMode
            ? "按学科检索随页面打包的公开实验档案，查看目的、材料、步骤、变量、公式适用条件与原始文献。没有网络服务时也能浏览已收录内容。"
            : "按学科检索真实实验档案，查看目的、材料、步骤、变量、公式适用条件与原始文献。查到方法后，可以直接上传自己的数据。"
        }
        actions={
          <>
            <span className="status-chip status-chip--accent">
              <Database size={12} strokeWidth={1.5} aria-hidden="true" />
              {staticMode ? "静态档案 · 随页面加载" : "真实档案服务"}
            </span>
            <span className="status-chip status-chip--neutral">
              <LockKeyhole size={12} strokeWidth={1.5} aria-hidden="true" />
              只读访问
            </span>
          </>
        }
      />

      <div className="archive-next-step">
        <div className="archive-next-step__copy">
          <span className="archive-next-step__icon">
            <LineChart size={15} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div>
            <p className="archive-next-step__title">查到方法后，下一步是处理你的实验数据</p>
            <p className="archive-next-step__text">上传 CSV 或从 Excel 粘贴，自动生成图表并检查缺失、重复和异常值。</p>
          </div>
        </div>
        <a href="#/analysis" className="button button--secondary button--small">
          上传数据
          <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
        </a>
      </div>

      <dl className="archive-metrics" aria-label="实验档案概览">
        <div className="archive-metric">
          <dt className="archive-metric__label">实验档案</dt>
          <dd className="archive-metric__value">{result?.total ?? "—"}</dd>
          <dd className="archive-metric__note">{staticMode ? "随页面打包的只读记录" : "公开只读记录"}</dd>
        </div>
        <div className="archive-metric">
          <dt className="archive-metric__label">学科分类</dt>
          <dd className="archive-metric__value">{disciplines.length || "—"}</dd>
          <dd className="archive-metric__note">完整分类目录</dd>
        </div>
        <div className="archive-metric">
          <dt className="archive-metric__label">来源已核验</dt>
          <dd className="archive-metric__value">{result ? verifiedCount : "—"}</dd>
          <dd className="archive-metric__note">当前结果集</dd>
        </div>
        <div className="archive-metric">
          <dt className="archive-metric__label">待审核</dt>
          <dd className="archive-metric__value">{result ? pendingCount : "—"}</dd>
          <dd className="archive-metric__note">不冒充已验证</dd>
        </div>
      </dl>

      <section aria-label="实验搜索与筛选" className="archive-toolbar">
        <form onSubmit={handleSearch} role="search" className="archive-toolbar__form">
          <label className="search-field block">
            <span className="sr-only">搜索实验</span>
            <Search size={16} strokeWidth={1.5} aria-hidden="true" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="搜索实验名称、原理或标签"
              className="field"
            />
          </label>
          <label>
            <span className="sr-only">按学科筛选</span>
            <select
              value={disciplineId}
              onChange={(event) => setDisciplineId(event.target.value)}
              className="field"
            >
              <option value="">全部学科</option>
              {disciplines.map((discipline) => (
                <option key={discipline.id} value={discipline.id}>
                  {discipline.name}（{discipline.experiment_count}）
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">排序方式</span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
              className="field"
            >
              {(Object.keys(sortLabels) as SortOption[]).map((option) => (
                <option key={option} value={option}>{sortLabels[option]}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className="button button--primary flex-1 lg:flex-none">搜索</button>
            {hasFilters && (
              <button type="button" onClick={resetFilters} className="button button--secondary">
                重置
              </button>
            )}
          </div>
        </form>
        <div className="archive-toolbar__meta">
          <SlidersHorizontal size={12} strokeWidth={1.5} aria-hidden="true" />
          {query ? `关键词“${query}” · ` : ""}
          {selectedDiscipline?.name ?? "全部学科"} · {sortLabels[sortBy]} ·{" "}
          {staticMode ? "结果由内置静态目录返回" : "结果由真实档案服务返回"}
        </div>
      </section>

      <div className="archive-layout">
        <aside className="discipline-panel" aria-label="学科分类筛选">
          <div className="discipline-panel__head">
            <h2 className="discipline-panel__title">学科分类</h2>
            <span className="discipline-panel__count">{disciplines.length}</span>
          </div>
          {disciplineError && <p className="px-2 py-2 text-[10px] text-danger">{disciplineError}</p>}
          <div className="discipline-list">
            <button
              type="button"
              onClick={() => setDisciplineId("")}
              aria-pressed={!disciplineId}
              className="discipline-button"
            >
              <span>全部学科</span>
              <span className="discipline-button__count">{result?.total ?? "—"}</span>
            </button>
            {disciplines.map((discipline) => (
              <button
                key={discipline.id}
                type="button"
                onClick={() => setDisciplineId(discipline.id)}
                aria-pressed={disciplineId === discipline.id}
                className="discipline-button"
              >
                <span>{discipline.name}</span>
                <span className="discipline-button__count">{discipline.experiment_count}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[11px] text-ink-500" role="status" aria-live="polite">
              {listLoading ? "正在更新实验列表" : `共 ${result?.total ?? 0} 个实验档案`}
            </p>
            {listLoading && (
              <LoaderCircle size={14} strokeWidth={1.5} className="animate-spin text-ink-400" aria-hidden="true" />
            )}
          </div>

          {listError && (
            <div role="alert" className="inline-alert mb-4">
              <AlertCircle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p>实验数据加载失败：{listError}</p>
                <button
                  type="button"
                  onClick={() => setRetryKey((value) => value + 1)}
                  className="action-link mt-2"
                >
                  <RefreshCw size={12} strokeWidth={1.5} aria-hidden="true" />
                  重新请求
                </button>
              </div>
            </div>
          )}

          {listLoading && !result ? (
            <div className="loading-panel" role="status">
              <LoaderCircle size={20} strokeWidth={1.5} className="loading-panel__icon animate-spin" aria-hidden="true" />
              <p className="mt-3 text-xs">{staticMode ? "正在读取内置实验目录" : "正在通过档案服务读取实验"}</p>
            </div>
          ) : result?.items.length === 0 ? (
            <div className="empty-panel">
              <span className="empty-panel__icon">
                <FlaskConical size={18} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <h2 className="empty-panel__title">没有匹配的实验</h2>
              <p className="empty-panel__text">
                {query
                  ? `档案中没有找到“${query}”。这个关键词仍然保留着，你可以用它去外部查找参考资料，或从一条空白记录开始。`
                  : "尝试更换关键词、学科筛选或排序条件。"}
              </p>
              <div className="archive-empty-actions">
                {query && (
                  <button
                    type="button"
                    onClick={() => setReferenceQuery(query)}
                    className="button button--secondary button--small"
                  >
                    <BookOpen size={13} strokeWidth={1.5} aria-hidden="true" />
                    查找参考资料
                  </button>
                )}
                {query && (
                  <a
                    href={`#/analysis?name=${encodeURIComponent(query)}`}
                    className="button button--primary button--small"
                  >
                    <FilePlus size={13} strokeWidth={1.5} aria-hidden="true" />
                    开始空白记录
                  </a>
                )}
                {query && (
                  <a
                    href="#/projects?view=new"
                    className="button button--secondary button--small"
                  >
                    <FlaskConical size={13} strokeWidth={1.5} aria-hidden="true" />
                    新建我的实验
                  </a>
                )}
                {hasFilters && (
                  <button type="button" onClick={resetFilters} className="button button--quiet button--small">
                    清除筛选
                  </button>
                )}
              </div>
              {query && (
                <p className="archive-empty-hint">
                  空白记录会使用“{query}”作为记录名称，数据只保存在当前浏览器。
                </p>
              )}
              {referenceQuery && (
                <section className="archive-reference" aria-label="外部参考资料入口">
                  <div className="archive-reference__head">
                    <BookOpen size={14} strokeWidth={1.5} aria-hidden="true" />
                    <h3>外部参考资料入口 · “{referenceQuery}”</h3>
                  </div>
                  <p>
                    以下链接会离开本站，在外部服务中检索。结果不会自动写入公共实验档案，是否采用需要你自行核对原文。
                  </p>
                  <div className="archive-reference__links">
                    <a
                      href={`https://search.crossref.org/?q=${encodeURIComponent(referenceQuery)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Crossref 检索
                      <ExternalLink size={12} strokeWidth={1.5} aria-hidden="true" />
                    </a>
                    <a
                      href={`https://openalex.org/works?search=${encodeURIComponent(referenceQuery)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      OpenAlex 检索
                      <ExternalLink size={12} strokeWidth={1.5} aria-hidden="true" />
                    </a>
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="experiment-grid">
              {sortedItems.map((experiment, index) => (
                <ExperimentCard
                  key={experiment.id}
                  experiment={experiment}
                  index={index}
                  onSelect={selectExperiment}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}