import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FilePlus,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Info,
  LoaderCircle,
  Save,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  SlidersHorizontal,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";

import { QuickRecordPanel } from "../components/analysis/QuickRecordPanel";
import { ResearchChart } from "../components/analysis/ResearchChart";
import { PageHeader } from "../components/ui/PageHeader";
import {
  analyzeDataset,
  buildSummaryMarkdown,
  delimiterLabel,
  downloadTextFile,
  formatNumber,
  MAX_FILE_BYTES,
  normalizeConfig,
  parseDataset,
  profileColumns,
  suggestConfig,
  type AnalysisConfig,
  type AnalysisResult,
  type ChartType,
  type DatasetColumn,
  type ParsedDataset,
  type QualityIssue,
  type QualityLevel,
  type VerdictTone,
} from "../lib/analysis";
import {
  formatSessionDate,
  getAnalysisSession,
  saveAnalysisSession,
} from "../lib/analysisSessions";
import { getExperiment, type ExperimentDetail } from "../lib/experiments";

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  line: "折线图",
  scatter: "散点图",
  bar: "柱状图",
};

const LEVEL_LABELS: Record<QualityLevel, string> = {
  fail: "阻塞",
  warn: "需核对",
  note: "说明",
  pass: "通过",
};

const LEVEL_ORDER: Record<QualityLevel, number> = {
  fail: 0,
  warn: 1,
  note: 2,
  pass: 3,
};

function safeFileStem(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60) || "实验数据";
}

interface DataOrigin {
  id?: string;
  name?: string;
}

function QualityIcon({ level }: { level: QualityLevel }) {
  if (level === "fail") return <XCircle size={14} strokeWidth={1.6} aria-hidden="true" />;
  if (level === "warn") return <AlertTriangle size={14} strokeWidth={1.6} aria-hidden="true" />;
  if (level === "pass") return <CheckCircle2 size={14} strokeWidth={1.6} aria-hidden="true" />;
  return <Info size={14} strokeWidth={1.6} aria-hidden="true" />;
}

function VerdictIcon({ tone }: { tone: VerdictTone }) {
  if (tone === "ready") return <ShieldCheck size={18} strokeWidth={1.5} aria-hidden="true" />;
  if (tone === "review") return <ShieldAlert size={18} strokeWidth={1.5} aria-hidden="true" />;
  return <ShieldX size={18} strokeWidth={1.5} aria-hidden="true" />;
}

function QualityPanel({ result }: { result: AnalysisResult }) {
  const issues = [...result.issues].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const warnings = result.issues.filter((issue) => issue.level === "warn" || issue.level === "fail").length;

  return (
    <section className="quality-panel" aria-labelledby="quality-title">
      <div className="quality-panel__head">
        <h2 id="quality-title" className="aside-panel__title">数据质量初检</h2>
        <span className="status-chip status-chip--neutral">{warnings > 0 ? `${warnings} 项需关注` : "基础检查通过"}</span>
      </div>
      <div className={`quality-verdict quality-verdict--${result.verdict.tone}`}>
        <VerdictIcon tone={result.verdict.tone} />
        <div>
          <p className="quality-verdict__title">{result.verdict.title}</p>
          <p className="quality-verdict__detail">{result.verdict.detail}</p>
        </div>
      </div>
      <ul className="quality-list">
        {issues.map((issue: QualityIssue) => (
          <li key={issue.id} className={`quality-item quality-item--${issue.level}`}>
            <span className="quality-item__icon">
              <QualityIcon level={issue.level} />
            </span>
            <div className="min-w-0">
              <p className="quality-item__title">
                {issue.title}
                <span className="quality-item__level">{LEVEL_LABELS[issue.level]}</span>
              </p>
              <p className="quality-item__detail">{issue.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="quality-panel__caveat">
        这是数据质量初检，只回答“数据是否完整、是否有明显异常”。它不判断实验设计是否合理，也不替代统计检验、误差分析或导师判断。
      </p>
    </section>
  );
}

function FitPanel({
  result,
  chartType,
  xName,
  yName,
}: {
  result: AnalysisResult;
  chartType: ChartType;
  xName: string;
  yName: string;
}) {
  return (
    <section className="aside-panel fit-panel" aria-labelledby="fit-title">
      <h2 id="fit-title" className="aside-panel__title">线性拟合</h2>
      {result.fit ? (
        <>
          <p className="fit-panel__equation">
            y = {formatNumber(result.fit.slope, 5)}x {result.fit.intercept >= 0 ? "+" : "-"}{" "}
            {formatNumber(Math.abs(result.fit.intercept), 5)}
          </p>
          <dl className="fit-panel__facts">
            <div>
              <dt>R²</dt>
              <dd>{formatNumber(result.fit.r2)}</dd>
            </div>
            <div>
              <dt>相关系数 r</dt>
              <dd>{formatNumber(result.fit.r)}</dd>
            </div>
            <div>
              <dt>有效点</dt>
              <dd>{result.validPairs}</dd>
            </div>
          </dl>
          <p className="fit-panel__note">
            拟合基于当前数据范围，不能外推到测量区间之外。R² 高不等于因果关系成立。
          </p>
        </>
      ) : (
        <p className="fit-panel__empty">
          {chartType === "bar"
            ? "当前为分类柱状图，未执行线性拟合。"
            : result.validPairs < 3
              ? "有效数据点少于 3 个，无法计算线性拟合。"
              : "X 轴不是数值列，或数值没有变化，未执行线性拟合。"}
          {result.validPairs >= 3 && chartType !== "bar" ? ` 当前变量：${xName} → ${yName}。` : ""}
        </p>
      )}
    </section>
  );
}

export function AnalysisPage({
  experimentId,
  sessionId,
  draftName,
}: {
  experimentId: string;
  sessionId: string;
  draftName: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [config, setConfig] = useState<AnalysisConfig | null>(null);
  const [dataOrigin, setDataOrigin] = useState<DataOrigin | null>(null);
  const [experiment, setExperiment] = useState<ExperimentDetail | null>(null);
  const [experimentError, setExperimentError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [reading, setReading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [savedConfigSignature, setSavedConfigSignature] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [previewRows, setPreviewRows] = useState(8);
  const [configOpen, setConfigOpen] = useState(false);

  const columns = useMemo(() => (dataset ? profileColumns(dataset) : []), [dataset]);
  const xColumn: DatasetColumn | undefined = config ? columns[config.xIndex] : undefined;
  const yColumn: DatasetColumn | undefined = config ? columns[config.yIndex] : undefined;
  const numericColumns = useMemo(
    () => columns.filter((column) => column.kind === "numeric"),
    [columns],
  );

  const result = useMemo(() => {
    if (!dataset || !config || !yColumn) return null;
    return analyzeDataset(dataset, columns, config);
  }, [dataset, columns, config, yColumn]);

  const originName =
    dataOrigin?.name ??
    (dataOrigin?.id && experiment?.id === dataOrigin.id ? experiment.name : undefined);

  useEffect(() => {
    if (!experimentId) {
      setExperiment(null);
      setExperimentError("");
      return;
    }
    const controller = new AbortController();
    setExperiment(null);
    setExperimentError("");
    getExperiment(experimentId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setExperiment(response);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setExperimentError(error.message);
      });
    return () => controller.abort();
  }, [experimentId]);

  useEffect(() => {
    if (!experiment) return;
    setDataOrigin((current) =>
      current && current.id === experiment.id && current.name !== experiment.name
        ? { ...current, name: experiment.name }
        : current,
    );
  }, [experiment]);

  useEffect(() => {
    if (!sessionId) return;
    const session = getAnalysisSession(sessionId);
    if (!session) {
      setUploadError("没有找到这条本地记录，可能已被删除或来自其他浏览器。");
      return;
    }
    const restored: ParsedDataset = {
      fileName: session.fileName,
      headers: session.headers,
      rows: session.rows,
      delimiter: session.delimiter ?? ",",
      truncated: false,
      warnings: [],
    };
    const restoredColumns = profileColumns(restored);
    if (restoredColumns.length < 2) {
      setUploadError("这条记录缺少足够的列，无法恢复分析。");
      return;
    }
    if (!restoredColumns.some((column) => column.kind === "numeric")) {
      setUploadError("这条记录没有数值列，无法恢复图表与统计。");
      return;
    }
    const restoredConfig = normalizeConfig(session.config, restoredColumns);
    setDataset(restored);
    setConfig(restoredConfig);
    setDataOrigin(
      session.experimentId || session.experimentName
        ? { id: session.experimentId, name: session.experimentName }
        : null,
    );
    setActiveSessionId(session.id);
    setSavedConfigSignature(JSON.stringify(restoredConfig));
    setSaveName(session.name);
    setSaveOpen(false);
    setSaveError("");
    setSaveNotice(`已打开本地记录，保存于 ${formatSessionDate(session.updatedAt)}。`);
    setUploadError("");
    setPreviewRows(8);
    setConfigOpen(false);
  }, [sessionId]);

  useEffect(() => {
    if (!dataset) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("analysis-workspace")?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dataset]);

  function applyDataset(parsed: ParsedDataset, restoredConfig?: AnalysisConfig) {
    const nextColumns = profileColumns(parsed);
    if (!nextColumns.some((column) => column.kind === "numeric")) {
      setDataset(null);
      setConfig(null);
      setDataOrigin(null);
      setActiveSessionId(null);
      setSavedConfigSignature(null);
      setSaveOpen(false);
      setSaveNotice("");
      setUploadError("没有检测到可计算的数值列。请确认数据中至少有一列是数字，例如浓度、吸光度或时间。");
      return;
    }
    const nextConfig = restoredConfig
      ? normalizeConfig(restoredConfig, nextColumns)
      : suggestConfig(parsed, nextColumns);
    setDataset(parsed);
    setConfig(nextConfig);
    setDataOrigin(
      experimentId
        ? {
            id: experimentId,
            name: experiment?.id === experimentId ? experiment.name : undefined,
          }
        : draftName.trim()
          ? { name: draftName.trim() }
          : null,
    );
    setUploadError("");
    setSaveError("");
    setSaveNotice("");
    setSaveOpen(false);
    setResetConfirm(false);
    setPreviewRows(8);
    setConfigOpen(false);
    setActiveSessionId(null);
    setSavedConfigSignature(null);
  }

  async function readFile(file: File) {
    setUploadError("");
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      setUploadError("暂不支持 Excel 二进制文件。请在 Excel 中“另存为 CSV”，或直接复制表格后粘贴。");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadError("文件超过 12 MB。请先精简数据，或拆分为多个 CSV 文件。");
      return;
    }
    setReading(true);
    try {
      const text = await file.text();
      const parsed = parseDataset(text, file.name);
      applyDataset(parsed);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "无法读取该文件。");
    } finally {
      setReading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void readFile(file);
  }

  function handlePasteParse() {
    try {
      const parsed = parseDataset(pasteValue, "粘贴的数据");
      applyDataset(parsed);
      setPasteOpen(false);
      setPasteValue("");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "无法解析粘贴内容。");
    }
  }

  function changeChartType(chartType: ChartType) {
    if (!config) return;
    if (chartType === "scatter" && xColumn?.kind !== "numeric") return;
    setConfig({ ...config, chartType });
  }

  function changeXColumn(index: number) {
    if (!config) return;
    const nextX = columns[index];
    const nextType = config.chartType === "scatter" && nextX?.kind !== "numeric" ? "line" : config.chartType;
    setConfig({ ...config, xIndex: index, chartType: nextType });
  }

  function beginReset() {
    setResetConfirm(true);
  }

  function resetData() {
    setDataset(null);
    setConfig(null);
    setDataOrigin(null);
    setActiveSessionId(null);
    setSavedConfigSignature(null);
    setUploadError("");
    setSaveError("");
    setSaveNotice("");
    setSaveOpen(false);
    setResetConfirm(false);
    setPasteOpen(false);
    setPasteValue("");
    setPreviewRows(8);
    setConfigOpen(false);
    if (window.location.hash.includes("session=")) {
      const query = experimentId ? `?experiment=${encodeURIComponent(experimentId)}` : "";
      window.history.replaceState(null, "", `#/analysis${query}`);
    }
  }

  function continueOriginalAnalysis() {
    const params = new URLSearchParams();
    if (activeSessionId && !unsaved) params.set("session", activeSessionId);
    if (dataOrigin?.id) params.set("experiment", dataOrigin.id);
    const query = params.toString();
    window.location.hash = `/analysis${query ? `?${query}` : ""}`;
  }

  function startForCurrentExperiment() {
    setDataset(null);
    setConfig(null);
    setDataOrigin(null);
    setActiveSessionId(null);
    setSavedConfigSignature(null);
    setUploadError("");
    setSaveError("");
    setSaveNotice("");
    setSaveOpen(false);
    setSaveName("");
    setResetConfirm(false);
    setPasteOpen(false);
    setPasteValue("");
    setPreviewRows(8);
    setConfigOpen(false);
    const query = experimentId ? `?experiment=${encodeURIComponent(experimentId)}` : "";
    window.location.hash = `/analysis${query}`;
  }

  function handleExportSvg() {
    const source = document.getElementById("analysis-chart-svg") as SVGSVGElement | null;
    if (!source) return;
    const clone = source.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll(".chart-hover-layer").forEach((element) => element.remove());
    const xml = new XMLSerializer().serializeToString(clone);
    downloadTextFile(
      `${safeFileStem(config?.title ?? dataset?.fileName ?? "实验数据")}.svg`,
      `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`,
      "image/svg+xml;charset=utf-8",
    );
  }

  function handleExportSummary() {
    if (!dataset || !config || !result) return;
    const summary = buildSummaryMarkdown(dataset, columns, config, result, {
      experimentName: originName,
    });
    downloadTextFile(
      `${safeFileStem(config.title || dataset.fileName)}-分析摘要.md`,
      summary,
      "text/markdown;charset=utf-8",
    );
  }

  function openSave() {
    if (!dataset || !config || !result) return;
    setSaveName((current) => {
      if (current.trim()) return current;
      const base = originName ?? config.title ?? "实验数据分析";
      return `${base} · ${new Date().toLocaleDateString("zh-CN")}`.slice(0, 60);
    });
    setSaveOpen(true);
    setSaveError("");
    setSaveNotice("");
  }

  function handleSave() {
    if (!dataset || !config || !result || !yColumn) return;
    const name = saveName.trim();
    if (!name) {
      setSaveError("请给这条分析记录起一个名字。");
      return;
    }
    const summary = buildSummaryMarkdown(dataset, columns, config, result, {
      experimentName: originName,
    });
    try {
      const session = saveAnalysisSession({
        id: activeSessionId ?? undefined,
        name,
        experimentId: dataOrigin?.id,
        experimentName: originName,
        fileName: dataset.fileName,
        headers: dataset.headers,
        rows: dataset.rows,
        delimiter: dataset.delimiter,
        config,
        summary,
      });
      setActiveSessionId(session.id);
      setSavedConfigSignature(JSON.stringify(config));
      setSaveOpen(false);
      setSaveError("");
      setSaveNotice(`已保存到“我的项目”，保存在当前浏览器中。`);
      window.location.hash = `/analysis?session=${encodeURIComponent(session.id)}${
        dataOrigin?.id ? `&experiment=${encodeURIComponent(dataOrigin.id)}` : ""
      }`;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败，请稍后再试。");
    }
  }

  const hasData = Boolean(dataset && config);
  const attributionMismatch = Boolean(hasData && experimentId && experimentId !== dataOrigin?.id);
  const preview = dataset ? dataset.rows.slice(0, previewRows) : [];
  const configSignature = config ? JSON.stringify(config) : "";
  const isDirty = Boolean(hasData && activeSessionId && savedConfigSignature !== configSignature);
  const unsaved = hasData && (!activeSessionId || isDirty);

  return (
    <div className="page-frame">
      <PageHeader
        eyebrow="Lab data analysis · Browser only"
        title="记录或上传实验数据，先检查再画图"
        description="只有几组读数时可以手填表格直接生成图表；也可以选择一张图片文件存为本地草稿，稍后补录数值。仍支持 CSV、TSV，或从 Excel 直接粘贴，所有数据只在当前浏览器内处理。"
        actions={
          <>
            <span className="status-chip status-chip--positive">
              <ShieldCheck size={12} strokeWidth={1.5} aria-hidden="true" />
              数据不上传
            </span>
            <a href="#/experiments" className="button button--secondary button--small">
              <FlaskConical size={13} strokeWidth={1.5} aria-hidden="true" />
              先看实验方法
            </a>
          </>
        }
      />

      {experimentId && (
        <section className="analysis-context" aria-label="关联实验">
          <span className="analysis-context__icon">
            <FlaskConical size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="analysis-context__label">关联实验</p>
            {experiment ? (
              <>
                <h2 className="analysis-context__title">{experiment.name}</h2>
                <p className="analysis-context__meta">
                  {experiment.method.dependent_variables.length > 0
                    ? `因变量：${experiment.method.dependent_variables.join("、")}`
                    : experiment.summary}
                </p>
              </>
            ) : experimentError ? (
              <p className="analysis-context__meta">关联实验读取失败：{experimentError}。数据分析仍可正常使用。</p>
            ) : (
              <p className="analysis-context__meta">正在读取实验方法与变量信息…</p>
            )}
          </div>
          <a href={`#/experiments?id=${encodeURIComponent(experimentId)}`} className="action-link shrink-0">
            查看完整步骤
            <ArrowRight size={12} strokeWidth={1.5} aria-hidden="true" />
          </a>
        </section>
      )}

      {draftName && !hasData && (
        <section className="analysis-context analysis-context--draft" aria-label="空白记录">
          <span className="analysis-context__icon">
            <FilePlus size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="analysis-context__label">空白记录 · 已保留搜索关键词</p>
            <h2 className="analysis-context__title analysis-context__title--wrap">{draftName}</h2>
            <p className="analysis-context__meta">
              填写数据并生成图表后，会以这个名字保存为随手记录。数据只留在当前浏览器。
            </p>
          </div>
        </section>
      )}

      {attributionMismatch && (
        <section className="analysis-attribution" role="alert" aria-labelledby="attribution-title">
          <span className="analysis-attribution__icon">
            <AlertTriangle size={17} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div className="analysis-attribution__body">
            <p id="attribution-title" className="analysis-attribution__title">
              当前数据不属于实验“{experiment?.name ?? experimentId}”
            </p>
            <p className="analysis-attribution__text">
              {dataOrigin?.id
                ? `这份分析的数据来源是“${originName ?? dataOrigin.id}”。切换实验不会改写原数据的归属。`
                : "这份分析还没有关联实验。切换实验不会自动把旧数据改挂到新实验。"}
            </p>
            <div className="analysis-attribution__actions">
              <button type="button" className="button button--primary button--small" onClick={continueOriginalAnalysis}>
                继续原分析
              </button>
              <button type="button" className="button button--secondary button--small" onClick={startForCurrentExperiment}>
                为新实验开始分析
              </button>
            </div>
            <p className="analysis-attribution__note">
              {unsaved
                ? "当前分析尚未保存；为新实验开始分析会丢弃这些未保存数据。"
                : "原分析已保存，可随时从“我的项目”重新打开。"}
            </p>
          </div>
        </section>
      )}

      {!hasData && (
        <>
          <QuickRecordPanel
            onAnalyze={(parsed, quickConfig) => applyDataset(parsed, quickConfig)}
            recordLabel={draftName || undefined}
          />

          <div className="intake-divider">
            <span>或上传已有数据文件</span>
          </div>

          <div className="analysis-intake">
            <div>
            <div
              className={`analysis-dropzone ${dragActive ? "is-dragging" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <span className="analysis-dropzone__icon">
                {reading ? (
                  <LoaderCircle size={22} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
                ) : (
                  <UploadCloud size={22} strokeWidth={1.5} aria-hidden="true" />
                )}
              </span>
              <h2 className="analysis-dropzone__title">
                {reading ? "正在读取文件…" : "拖入实验数据文件"}
              </h2>
              <p className="analysis-dropzone__text">
                首行为列名，至少两列。支持 CSV、TSV；也可以从 Excel 复制整张表后直接粘贴。
              </p>
              <div className="analysis-dropzone__actions">
                <label className={`button button--primary ${reading ? "is-disabled" : ""}`}>
                  选择文件
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                    className="sr-only"
                    disabled={reading}
                    onChange={handleFileChange}
                  />
                </label>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => {
                    setPasteOpen((current) => !current);
                    setUploadError("");
                  }}
                >
                  <ClipboardPaste size={14} strokeWidth={1.5} aria-hidden="true" />
                  粘贴数据
                </button>
              </div>
              <p className="analysis-dropzone__note">
                <ShieldCheck size={12} strokeWidth={1.5} aria-hidden="true" />
                文件只在浏览器内解析，不会上传服务器
              </p>
            </div>

            {pasteOpen && (
              <section className="analysis-paste" aria-labelledby="paste-title">
                <div className="analysis-paste__head">
                  <label id="paste-title" htmlFor="analysis-paste-input" className="micro-label">
                    粘贴表格内容
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="关闭粘贴区域"
                    onClick={() => setPasteOpen(false)}
                  >
                    <X size={14} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
                <textarea
                  id="analysis-paste-input"
                  value={pasteValue}
                  onChange={(event) => setPasteValue(event.target.value)}
                  rows={8}
                  className="analysis-paste__textarea"
                  placeholder={"浓度(mg/L)\t吸光度\n0\t0.032\n10\t0.118\n20\t0.221"}
                />
                <div className="analysis-paste__actions">
                  <button
                    type="button"
                    className="button button--primary button--small"
                    disabled={!pasteValue.trim()}
                    onClick={handlePasteParse}
                  >
                    解析并生成图表
                  </button>
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    onClick={() => setPasteOpen(false)}
                  >
                    取消
                  </button>
                </div>
              </section>
            )}

            {uploadError && (
              <div role="alert" className="inline-alert mt-4">
                <AlertCircle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
                <p>{uploadError}</p>
              </div>
            )}
          </div>

          <aside className="analysis-intake__side">
            <h2 className="analysis-intake__side-title">上传后会得到</h2>
            <ul className="analysis-intake__list">
              <li>折线图、散点图或柱状图，可下载 SVG</li>
              <li>均值、标准差、标准误、中位数与变异系数</li>
              <li>线性拟合、R² 与相关系数</li>
              <li>缺失、重复、异常值的初步检查</li>
            </ul>
            <div className="analysis-intake__note">
              <Info size={13} strokeWidth={1.5} aria-hidden="true" />
              <p>质量初检不替代统计检验和导师判断。它帮助你发现数据问题，不替你下科学结论。</p>
            </div>
            <a href="#/experiments" className="action-link">
              还不知道怎么处理数据？先看实验档案
              <ArrowRight size={12} strokeWidth={1.5} aria-hidden="true" />
            </a>
          </aside>
          </div>
        </>
      )}

      {hasData && dataset && config && xColumn && yColumn && result && (
        <div id="analysis-workspace" className="analysis-workspace">
          <section className="analysis-filebar" aria-label="数据文件与操作">
            <div className="analysis-filebar__file">
              <span className="analysis-filebar__icon">
                <FileSpreadsheet size={17} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="analysis-filebar__name">{dataset.fileName}</p>
                <p className="analysis-filebar__meta">
                  {dataset.rows.length.toLocaleString("zh-CN")} 行 × {dataset.headers.length} 列 ·{" "}
                  {delimiterLabel(dataset.delimiter)}分隔
                  {dataset.truncated ? " · 已截断" : ""}
                </p>
              </div>
            </div>
            <div className="analysis-filebar__actions">
              {activeSessionId && (
                <span className={`status-chip ${isDirty ? "status-chip--warning" : "status-chip--positive"}`}>
                  {isDirty ? (
                    <AlertTriangle size={12} strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <CheckCircle2 size={12} strokeWidth={1.5} aria-hidden="true" />
                  )}
                  {isDirty ? "有未保存修改" : "已保存"}
                </span>
              )}
              <button
                type="button"
                className="button button--quiet button--small"
                aria-expanded={configOpen}
                aria-controls="analysis-config"
                onClick={() => setConfigOpen((current) => !current)}
              >
                <SlidersHorizontal size={13} strokeWidth={1.5} aria-hidden="true" />
                {configOpen ? "收起设置" : "图表设置"}
              </button>
              <button type="button" className="button button--secondary button--small" onClick={openSave}>
                <Save size={13} strokeWidth={1.5} aria-hidden="true" />
                {activeSessionId ? (
                  "保存更改"
                ) : (
                  <>
                    <span className="hidden sm:inline">保存到我的项目</span>
                    <span className="sm:hidden">保存记录</span>
                  </>
                )}
              </button>
              <button type="button" className="button button--quiet button--small" onClick={beginReset}>
                更换数据
              </button>
            </div>
          </section>

          {resetConfirm && (
            <div className="analysis-reset" role="alert">
              <div>
                <p className="analysis-reset__title">确认更换数据？</p>
                <p className="analysis-reset__text">
                  {unsaved
                    ? "当前分析还没有保存到“我的项目”，更换后会丢失。"
                    : "当前分析已保存，可以从“我的项目”重新打开。"}
                </p>
              </div>
              <div className="analysis-reset__actions">
                <button type="button" className="button button--secondary button--small" onClick={resetData}>
                  确认更换
                </button>
                <button
                  type="button"
                  className="button button--quiet button--small"
                  onClick={() => setResetConfirm(false)}
                >
                  继续分析
                </button>
              </div>
            </div>
          )}

          {saveOpen && (
            <section className="analysis-savebar" aria-labelledby="save-title">
              <div className="analysis-savebar__head">
                <div>
                  <h2 id="save-title" className="micro-label">保存到我的项目</h2>
                  <p className="analysis-savebar__note">记录保存在当前浏览器，不上传服务器。</p>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="关闭保存面板"
                  onClick={() => setSaveOpen(false)}
                >
                  <X size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
              <div className="analysis-savebar__row">
                <label className="analysis-savebar__field">
                  <span className="sr-only">记录名称</span>
                  <input
                    autoFocus
                    value={saveName}
                    maxLength={60}
                    onChange={(event) => setSaveName(event.target.value)}
                    placeholder="例如：叶绿素 a 标准曲线分析"
                    className="field"
                  />
                </label>
                <button type="button" className="button button--primary" onClick={handleSave}>
                  {activeSessionId ? "更新记录" : "保存记录"}
                </button>
              </div>
              {saveError && <p role="alert" className="analysis-savebar__error">{saveError}</p>}
            </section>
          )}

          {saveNotice && (
            <div className="analysis-save-notice" role="status">
              <CheckCircle2 size={14} strokeWidth={1.5} aria-hidden="true" />
              <span>{saveNotice}</span>
              <a href="#/projects" className="action-link ml-auto">
                查看我的项目
                <ArrowRight size={12} strokeWidth={1.5} aria-hidden="true" />
              </a>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭保存提示"
                onClick={() => setSaveNotice("")}
              >
                <X size={13} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
          )}

          {configOpen && (
            <section id="analysis-config" className="analysis-config" aria-labelledby="config-title">
              <div className="analysis-config__head">
                <h2 id="config-title" className="micro-label">图表设置</h2>
                <span className="analysis-config__hint">修改后图表与统计会自动更新</span>
              </div>
            <div className="analysis-config__grid">
              <div className="analysis-field">
                <span className="analysis-field__label">图表类型</span>
                <div className="segmented" role="group" aria-label="图表类型">
                  {(Object.keys(CHART_TYPE_LABELS) as ChartType[]).map((type) => {
                    const disabled = type === "scatter" && xColumn.kind !== "numeric";
                    return (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={config.chartType === type}
                        disabled={disabled}
                        title={disabled ? "散点图需要数值型 X 轴" : undefined}
                        onClick={() => changeChartType(type)}
                        className="segmented__button"
                      >
                        {CHART_TYPE_LABELS[type]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="analysis-field">
                <span className="analysis-field__label">X 轴列</span>
                <select
                  value={config.xIndex}
                  onChange={(event) => changeXColumn(Number(event.target.value))}
                  className="field"
                >
                  {columns.map((column) => (
                    <option key={column.index} value={column.index}>
                      {column.name}（{column.kind === "numeric" ? "数值" : "文本"}）
                    </option>
                  ))}
                </select>
              </label>
              <label className="analysis-field">
                <span className="analysis-field__label">Y 轴列</span>
                <select
                  value={config.yIndex}
                  onChange={(event) => setConfig({ ...config, yIndex: Number(event.target.value) })}
                  className="field"
                  disabled={numericColumns.length === 0}
                >
                  {numericColumns.length === 0 ? (
                    <option value={config.yIndex}>未检测到数值列</option>
                  ) : (
                    numericColumns.map((column) => (
                      <option key={column.index} value={column.index}>
                        {column.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="analysis-field">
                <span className="analysis-field__label">X 轴单位（可选）</span>
                <input
                  value={config.xUnit}
                  maxLength={12}
                  onChange={(event) => setConfig({ ...config, xUnit: event.target.value })}
                  placeholder="例如 s、mg/L"
                  className="field"
                />
              </label>
              <label className="analysis-field">
                <span className="analysis-field__label">Y 轴单位（可选）</span>
                <input
                  value={config.yUnit}
                  maxLength={12}
                  onChange={(event) => setConfig({ ...config, yUnit: event.target.value })}
                  placeholder="例如 A、%"
                  className="field"
                />
              </label>
              <label className="analysis-field analysis-field--wide">
                <span className="analysis-field__label">图表标题</span>
                <input
                  value={config.title}
                  maxLength={80}
                  onChange={(event) => setConfig({ ...config, title: event.target.value })}
                  placeholder="例如：吸光度随叶绿素 a 浓度的变化"
                  className="field"
                />
              </label>
              </div>
            </section>
          )}

          {result.stats === null && (
            <div role="alert" className="inline-alert mt-4">
              <AlertCircle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p>没有可用于分析的数据点。</p>
                <p>请检查 X、Y 列的选择，或修复原始数据中的空值与文字。</p>
              </div>
            </div>
          )}

          <div className="analysis-layout">
            <div className="analysis-main">
              <section className="analysis-chart-panel" aria-labelledby="chart-title">
                <div className="analysis-chart-panel__head">
                  <div>
                    <h2 id="chart-title" className="analysis-panel-title">研究图表</h2>
                    <p className="analysis-panel-subtitle">
                      {CHART_TYPE_LABELS[config.chartType]} · {xColumn.name} → {yColumn.name} ·{" "}
                      {result.validPairs} 个有效点
                    </p>
                  </div>
                  <span className="analysis-chart-panel__badge">SVG · 矢量输出</span>
                </div>
                <ResearchChart
                  svgId="analysis-chart-svg"
                  points={result.points}
                  chartType={config.chartType}
                  title={config.title}
                  xName={xColumn.name}
                  yName={yColumn.name}
                  xUnit={config.xUnit}
                  yUnit={config.yUnit}
                  fit={result.fit}
                  numericX={result.numericX}
                />
                <div className="analysis-chart-panel__actions">
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    disabled={result.points.length === 0}
                    onClick={handleExportSvg}
                  >
                    <Download size={13} strokeWidth={1.5} aria-hidden="true" />
                    下载图表 SVG
                  </button>
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    disabled={result.points.length === 0}
                    onClick={handleExportSummary}
                  >
                    <FileText size={13} strokeWidth={1.5} aria-hidden="true" />
                    导出分析摘要
                  </button>
                </div>
              </section>

              <section className="analysis-stats-panel" aria-labelledby="stats-title">
                <div className="analysis-panel-head">
                  <h2 id="stats-title" className="analysis-panel-title">描述统计</h2>
                  <span className="analysis-panel-subtitle">基于 {result.stats?.n ?? 0} 个有效 Y 值</span>
                </div>
                <dl className="analysis-stats">
                  <div>
                    <dt>有效数据点</dt>
                    <dd>{result.stats?.n ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>均值</dt>
                    <dd>{formatNumber(result.stats?.mean)}</dd>
                  </div>
                  <div>
                    <dt>标准差</dt>
                    <dd>{formatNumber(result.stats?.sd)}</dd>
                  </div>
                  <div>
                    <dt>标准误</dt>
                    <dd>{formatNumber(result.stats?.sem)}</dd>
                  </div>
                  <div>
                    <dt>中位数</dt>
                    <dd>{formatNumber(result.stats?.median)}</dd>
                  </div>
                  <div>
                    <dt>最小值</dt>
                    <dd>{formatNumber(result.stats?.min)}</dd>
                  </div>
                  <div>
                    <dt>最大值</dt>
                    <dd>{formatNumber(result.stats?.max)}</dd>
                  </div>
                  <div>
                    <dt>Y 变异系数</dt>
                    <dd>{result.stats?.cv === null || result.stats?.cv === undefined ? "—" : `${formatNumber(result.stats.cv)}%`}</dd>
                  </div>
                </dl>
                <p className="analysis-stats__note">
                  变异系数按全部 Y 值计算，包含自变量设计范围带来的变化；判断重复性请看数据质量初检中的组内变异。
                </p>
              </section>

              <section className="analysis-preview-panel" aria-labelledby="preview-title">
                <div className="analysis-panel-head">
                  <div>
                    <h2 id="preview-title" className="analysis-panel-title">数据预览</h2>
                    <p className="analysis-panel-subtitle">
                      第 2 行对应原始表格的首条数据。统计与图表使用全部有效行。
                    </p>
                  </div>
                  {dataset.rows.length > 8 && (
                    <button
                      type="button"
                      className="button button--quiet button--small"
                      onClick={() => setPreviewRows((current) => (current === 8 ? 25 : 8))}
                    >
                      {previewRows === 8 ? "显示前 25 行" : "收起"}
                    </button>
                  )}
                </div>
                <div className="analysis-table-wrap">
                  <table className="analysis-table">
                    <caption className="sr-only">已解析的实验数据，前 {preview.length} 行</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="analysis-table__row-number">行</th>
                        {columns.map((column) => (
                          <th key={column.index} scope="col">
                            <span>{column.name}</span>
                            <span className="analysis-table__kind">
                              {column.kind === "numeric" ? "数值" : "文本"}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          <th scope="row" className="analysis-table__row-number">{rowIndex + 2}</th>
                          {columns.map((column) => {
                            const value = row[column.index] ?? "";
                            return (
                              <td key={column.index}>
                                {value.trim() === "" ? (
                                  <span className="analysis-table__missing">缺失</span>
                                ) : (
                                  value
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {dataset.rows.length > previewRows && (
                  <p className="analysis-preview__note">
                    当前展示前 {previewRows} 行，共 {dataset.rows.length.toLocaleString("zh-CN")} 行。
                  </p>
                )}
              </section>
            </div>

            <aside className="analysis-aside">
              <QualityPanel result={result} />
              <FitPanel
                result={result}
                chartType={config.chartType}
                xName={xColumn.name}
                yName={yColumn.name}
              />
              <section className="aside-panel">
                <h2 className="aside-panel__title">图表的边界</h2>
                <p className="aside-note mt-3">
                  图表只呈现你上传的数据。显著性检验、误差传播、对照组差异和实验外推需要额外的统计方法及实验设计信息。
                </p>
                <a href="#/experiments" className="action-link mt-3">
                  查看实验档案中的数据处理说明
                  <ArrowRight size={12} strokeWidth={1.5} aria-hidden="true" />
                </a>
              </section>
            </aside>
          </div>
        </div>
      )}

      {!hasData && (
        <p className="analysis-local-note">
          <ShieldCheck size={12} strokeWidth={1.5} aria-hidden="true" />
          所有数据解析都在本机完成。关闭页面后，未保存的数据不会留在服务器上。
        </p>
      )}
    </div>
  );
}
