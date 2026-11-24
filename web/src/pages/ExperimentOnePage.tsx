import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Droplets,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Image as ImageIcon,
  Info,
  LoaderCircle,
  MoveHorizontal,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { PhotoRecord } from "../components/analysis/PhotoRecord";
import { ResearchChart } from "../components/analysis/ResearchChart";
import { CourseDraftToolbar } from "../components/course/CourseDraftToolbar";
import { CourseIssueList, CourseMetric, CourseStatusChip } from "../components/course/CourseElements";
import { CourseGuidePanels } from "../components/course/CourseGuidePanels";
import { PageHeader } from "../components/ui/PageHeader";
import { useExperimentOneDraft } from "../hooks/useExperimentOneDraft";
import { downloadTextFile } from "../lib/analysis";
import { experimentOneMeta, experimentOneReferences } from "../lib/course";
import { safeFileStem } from "../lib/courseCommon";
import {
  MAX_GROUP_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_SAMPLE_ID_LENGTH,
  MAX_SOLIDS_ROWS,
  MAX_TURBIDITY_ROWS,
  buildSolidsCsv,
  buildSummaryMarkdown,
  buildTurbidityCsv,
  createSolidsRow,
  createTeachingDraft,
  createTurbidityRow,
  evaluateCommon,
  evaluateSolids,
  evaluateTurbidity,
  formatQuantity,
  getSolidsChartPoints,
  getTurbidityChartPoints,
  hasDraftContent,
  rowStatusLabels,
  type CourseRecordTab,
  type SolidsRow,
  type TurbidityRow,
} from "../lib/courseExperiment1";

const SOLIDS_CHART_ID = "course-solids-chart";
const TURBIDITY_CHART_ID = "course-turbidity-chart";
const PHOTO_DRAFT_ID = "course-experiment-1";

export function ExperimentOnePage() {
  const {
    draft,
    hydrated,
    saveState,
    lastSavedAt,
    restoredAt,
    storageError,
    updateDraft,
    replaceDraft,
    clearDraft,
    retrySave,
    dismissRestoredNotice,
  } = useExperimentOneDraft();
  const [exportError, setExportError] = useState("");
  const [notice, setNotice] = useState("");

  const solids = useMemo(() => evaluateSolids(draft.solidsRows), [draft.solidsRows]);
  const turbidity = useMemo(() => evaluateTurbidity(draft.turbidityRows), [draft.turbidityRows]);
  const commonIssues = useMemo(() => evaluateCommon(draft), [draft]);
  const solidsChartPoints = useMemo(() => getSolidsChartPoints(solids), [solids]);
  const turbidityChartPoints = useMemo(() => getTurbidityChartPoints(turbidity), [turbidity]);
  const hasContent = hasDraftContent(draft);

  const stem = `${safeFileStem(draft.sampleId) || "实验一未命名样品"}-${draft.measuredAt || "日期未填"}`;
  const activeTab = draft.activeTab;

  function updateSampleField(
    field: "sampleId" | "group" | "measuredAt" | "note",
    value: string,
  ) {
    setNotice("");
    if (field === "sampleId" || field === "measuredAt") setExportError("");
    updateDraft((current) => ({ ...current, [field]: value }));
  }

  function updateSolidsRow(rowId: string, patch: Partial<SolidsRow>) {
    setNotice("");
    updateDraft((current) => ({
      ...current,
      solidsRows: current.solidsRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    }));
  }

  function updateTurbidityRow(rowId: string, patch: Partial<TurbidityRow>) {
    setNotice("");
    updateDraft((current) => ({
      ...current,
      turbidityRows: current.turbidityRows.map((row) =>
        row.id === rowId ? { ...row, ...patch } : row,
      ),
    }));
  }

  function addSolidsRow() {
    setNotice("");
    updateDraft((current) => {
      if (current.solidsRows.length >= MAX_SOLIDS_ROWS) return current;
      return { ...current, solidsRows: [...current.solidsRows, createSolidsRow()] };
    });
  }

  function addTurbidityRow() {
    setNotice("");
    updateDraft((current) => {
      if (current.turbidityRows.length >= MAX_TURBIDITY_ROWS) return current;
      const lastUnit = current.turbidityRows.at(-1)?.unit ?? "NTU";
      return {
        ...current,
        turbidityRows: [...current.turbidityRows, createTurbidityRow({ unit: lastUnit })],
      };
    });
  }

  function removeSolidsRow(rowId: string) {
    setNotice("");
    updateDraft((current) => {
      if (current.solidsRows.length <= 1) return current;
      return { ...current, solidsRows: current.solidsRows.filter((row) => row.id !== rowId) };
    });
  }

  function removeTurbidityRow(rowId: string) {
    setNotice("");
    updateDraft((current) => {
      if (current.turbidityRows.length <= 1) return current;
      return {
        ...current,
        turbidityRows: current.turbidityRows.filter((row) => row.id !== rowId),
      };
    });
  }

  function selectTab(tab: CourseRecordTab) {
    if (draft.activeTab === tab) return;
    updateDraft((current) => ({ ...current, activeTab: tab }));
  }

  function applyTeachingSample() {
    replaceDraft(createTeachingDraft());
    setExportError("");
    setNotice(
      "已载入教学示例：悬浮固体两行均为 50.0 mg/L，浊度均值为 10.2 NTU。可以直接对照修改。",
    );
  }

  function handleClear() {
    if (!clearDraft()) return false;
    setExportError("");
    setNotice("已清空数值草稿和两张表。现场照片草稿不会被删除。");
    return true;
  }

  function handleExportSummary() {
    if (commonIssues.length > 0) {
      const labels = commonIssues.map((issue) => issue.column).filter(Boolean).join("、");
      setExportError(`导出摘要前请先填写：${labels}。CSV 可以随时导出。`);
      const firstField = commonIssues[0]?.field;
      const targetId = firstField === "sampleId" ? "course-sample-id" : "course-measured-at";
      document.getElementById(targetId)?.focus();
      return;
    }
    setExportError("");
    downloadTextFile(
      `${stem}-实验一摘要.md`,
      buildSummaryMarkdown(draft, solids, turbidity),
      "text/markdown;charset=utf-8",
    );
    setNotice("交接摘要已生成下载，包含两张表、数据检查和待确认规则。");
  }

  function handleExportSolidsCsv() {
    downloadTextFile(
      `${stem}-悬浮固体.csv`,
      buildSolidsCsv(draft, solids),
      "text/csv;charset=utf-8",
    );
    setExportError("");
    setNotice("悬浮固体 CSV 已生成下载，可用表格软件打开。");
  }

  function handleExportTurbidityCsv() {
    downloadTextFile(
      `${stem}-浊度.csv`,
      buildTurbidityCsv(draft, turbidity),
      "text/csv;charset=utf-8",
    );
    setExportError("");
    setNotice("浊度 CSV 已生成下载，并附带有效行与组均值汇总。");
  }

  function handleExportChart(svgId: string, suffix: string) {
    const source = document.getElementById(svgId);
    if (!(source instanceof SVGSVGElement)) {
      setExportError("图表还没有生成，暂时无法导出 SVG。");
      return;
    }
    const clone = source.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll(".chart-hover-layer").forEach((node) => node.remove());
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    downloadTextFile(
      `${stem}-${suffix}.svg`,
      `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`,
      "image/svg+xml;charset=utf-8",
    );
    setExportError("");
    setNotice(`${suffix}已生成下载。`);
  }

  return (
    <div className="page-frame course-detail">
      <PageHeader
        eyebrow="第 1 课次 · 环境监测课程"
        title="实验一 废水悬浮固体及浊度"
        description={experimentOneMeta.purpose}
        actions={
          <a className="button button--secondary" href="#/course">
            <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
            返回课程总览
          </a>
        }
      />

      {!hydrated ? (
        <div className="course-loading" role="status">
          <LoaderCircle size={18} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
          正在读取当前浏览器里的数值草稿…
        </div>
      ) : (
        <>
          <CourseDraftToolbar
            hasContent={hasContent}
            saveState={saveState}
            lastSavedAt={lastSavedAt}
            restoredAt={restoredAt}
            storageError={storageError}
            notice={notice}
            storageNote="数值草稿只保存在当前浏览器；现场照片使用独立草稿。"
            teachingLabel="载入教学示例"
            teachingConfirmTitle="替换当前全部数值？"
            teachingConfirmBody="载入教学示例会覆盖样品信息和两张表，但不会删除现场照片草稿。只有一行悬浮固体使用 g，另一行使用 mg，用于核对单位折算。"
            clearConfirmTitle="清空数值草稿和两张表？"
            clearConfirmBody="这会删除当前浏览器里的实验一数值草稿，并清空样品信息与两张表。现场照片草稿不受影响；清空后无法撤销。"
            onLoadTeaching={applyTeachingSample}
            onClear={handleClear}
            onRetrySave={retrySave}
            onDismissRestored={dismissRestoredNotice}
          />

          <section className="course-sample" aria-labelledby="course-sample-title">
            <div className="course-panel-head">
              <div>
                <h2 id="course-sample-title">样品信息</h2>
                <p>两张表共用同一个样品编号；可以只填悬浮固体或只填浊度。</p>
              </div>
              <span className="course-local-chip">
                <ShieldCheck size={13} strokeWidth={1.5} aria-hidden="true" />
                不上传服务器
              </span>
            </div>
            <div className="course-field-grid">
              <div className="course-field">
                <label className="course-field__label" htmlFor="course-sample-id">
                  样品编号 <em>摘要必填</em>
                </label>
                <input
                  id="course-sample-id"
                  className="field course-input"
                  value={draft.sampleId}
                  maxLength={MAX_SAMPLE_ID_LENGTH}
                  autoComplete="off"
                  placeholder="例如 WW-2026-01"
                  onChange={(event) => updateSampleField("sampleId", event.target.value)}
                />
              </div>
              <div className="course-field">
                <label className="course-field__label" htmlFor="course-group">
                  组别（可选）
                </label>
                <input
                  id="course-group"
                  className="field course-input"
                  value={draft.group}
                  maxLength={MAX_GROUP_LENGTH}
                  autoComplete="off"
                  placeholder="例如 第 1 组"
                  onChange={(event) => updateSampleField("group", event.target.value)}
                />
              </div>
              <div className="course-field">
                <label className="course-field__label" htmlFor="course-measured-at">
                  测定日期 <em>摘要必填</em>
                </label>
                <input
                  id="course-measured-at"
                  type="date"
                  className="field course-input"
                  value={draft.measuredAt}
                  onChange={(event) => updateSampleField("measuredAt", event.target.value)}
                />
              </div>
              <div className="course-field course-field--wide">
                <label className="course-field__label" htmlFor="course-note">
                  备注（可选）
                </label>
                <textarea
                  id="course-note"
                  className="field course-textarea"
                  rows={2}
                  maxLength={MAX_NOTE_LENGTH}
                  value={draft.note}
                  placeholder="例如：水样取自曝气池出口，悬浮固体平行两份，浊度平行三份。"
                  onChange={(event) => updateSampleField("note", event.target.value)}
                />
              </div>
            </div>
            <div className="course-field-footer">
              <span>样品编号不会写入网址，也不会同步到其他设备。</span>
              <span>
                {draft.note.length} / {MAX_NOTE_LENGTH}
              </span>
            </div>
          </section>

          <section className="course-record" aria-labelledby="course-record-title">
            <div className="course-section-head">
              <div>
                <h2 id="course-record-title">记录与计算</h2>
                <p>两张表独立校验；空表不报缺失，开始填写后的空白行才计入缺失。</p>
              </div>
              <span className="course-map__count">本地实时计算</span>
            </div>

            <div className="course-tabs" role="group" aria-label="实验一记录表切换">
              <button
                type="button"
                id="course-tab-solids"
                className="course-tab"
                aria-pressed={activeTab === "solids"}
                aria-controls="course-panel-solids"
                onClick={() => selectTab("solids")}
              >
                <FlaskConical size={15} strokeWidth={1.5} aria-hidden="true" />
                悬浮固体
                <span className="course-tab__meta">
                  {solids.tableHasInput ? `${solids.computedCount}/${solids.rows.length} 行` : "未填"}
                </span>
              </button>
              <button
                type="button"
                id="course-tab-turbidity"
                className="course-tab"
                aria-pressed={activeTab === "turbidity"}
                aria-controls="course-panel-turbidity"
                onClick={() => selectTab("turbidity")}
              >
                <Droplets size={15} strokeWidth={1.5} aria-hidden="true" />
                浊度
                <span className="course-tab__meta">
                  {turbidity.tableHasInput ? `${turbidity.validCount}/${turbidity.rows.length} 有效` : "未填"}
                </span>
              </button>
              <button
                type="button"
                id="course-tab-photo"
                className="course-tab"
                aria-pressed={activeTab === "photo"}
                aria-controls="course-panel-photo"
                onClick={() => selectTab("photo")}
              >
                <ImageIcon size={15} strokeWidth={1.5} aria-hidden="true" />
                现场照片
                <span className="course-tab__meta">独立草稿</span>
              </button>
            </div>

            <div
              id="course-panel-solids"
              className="course-panel"
              hidden={activeTab !== "solids"}
              aria-labelledby="course-tab-solids"
            >
              <div className="course-panel-head">
                <div>
                  <h3>悬浮固体（重量法）</h3>
                  <p className="course-formula">{experimentOneMeta.formula}</p>
                </div>
                <span className="course-method-chip">GB 11901-89</span>
              </div>
              <div className="course-rule-note">
                <Info size={14} strokeWidth={1.5} aria-hidden="true" />
                <p>
                  称量质量可以逐行选择 mg 或 g，计算时会先折算成 mg。水样体积按 mL 填写；
                  如果讲义采用 L，请先换算。平行样数量与质控要求待课程讲义确认。
                </p>
              </div>

              <p className="course-table-hint">
                <MoveHorizontal size={14} strokeWidth={1.5} aria-hidden="true" />
                表格可左右滑动；最后一列是删除操作。
              </p>
              <div
                className="course-table-scroll"
                role="region"
                aria-label="悬浮固体数据表，可左右滚动"
                tabIndex={0}
              >
                <table className="course-table course-table--solids">
                  <caption className="sr-only">
                    悬浮固体平行样：称量前、称量后、质量单位、水样体积、质量差和浓度。
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">平行</th>
                      <th scope="col">称量前</th>
                      <th scope="col">单位</th>
                      <th scope="col">称量后</th>
                      <th scope="col">水样体积 (mL)</th>
                      <th scope="col">质量差 (mg)</th>
                      <th scope="col">浓度 (mg/L)</th>
                      <th scope="col">状态</th>
                      <th scope="col">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solids.rows.map((result, index) => {
                      const row = draft.solidsRows[index];
                      if (!row) return null;
                      const beforeIssue = result.issues.some(
                        (issue) => issue.field === "before" && issue.level === "error",
                      );
                      const afterIssue = result.issues.some(
                        (issue) => issue.field === "after" && issue.level === "error",
                      );
                      const volumeIssue = result.issues.some(
                        (issue) => issue.field === "volume" && issue.level === "error",
                      );
                      return (
                        <tr key={row.id} className={`course-table__row course-table__row--${result.status}`}>
                          <th scope="row" className="course-table__index">
                            {result.rowNumber}
                          </th>
                          <td>
                            <input
                              className="course-cell-input"
                              inputMode="decimal"
                              autoComplete="off"
                              maxLength={40}
                              value={row.before}
                              aria-label={`第 ${result.rowNumber} 行称量前质量`}
                              aria-invalid={beforeIssue || undefined}
                              placeholder="如 125.0"
                              onChange={(event) => updateSolidsRow(row.id, { before: event.target.value })}
                            />
                          </td>
                          <td>
                            <select
                              className="course-cell-select"
                              value={row.massUnit}
                              aria-label={`第 ${result.rowNumber} 行质量单位`}
                              onChange={(event) =>
                                updateSolidsRow(row.id, {
                                  massUnit: event.target.value === "g" ? "g" : "mg",
                                })
                              }
                            >
                              <option value="mg">mg</option>
                              <option value="g">g</option>
                            </select>
                          </td>
                          <td>
                            <input
                              className="course-cell-input"
                              inputMode="decimal"
                              autoComplete="off"
                              maxLength={40}
                              value={row.after}
                              aria-label={`第 ${result.rowNumber} 行称量后质量`}
                              aria-invalid={afterIssue || undefined}
                              placeholder="如 130.0"
                              onChange={(event) => updateSolidsRow(row.id, { after: event.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              className="course-cell-input"
                              inputMode="decimal"
                              autoComplete="off"
                              maxLength={40}
                              value={row.volume}
                              aria-label={`第 ${result.rowNumber} 行水样体积，单位 mL`}
                              aria-invalid={volumeIssue || undefined}
                              placeholder="如 100.0"
                              onChange={(event) => updateSolidsRow(row.id, { volume: event.target.value })}
                            />
                          </td>
                          <td className="course-table__computed">
                            {result.massDifferenceMg === null
                              ? "—"
                              : formatQuantity(result.massDifferenceMg)}
                          </td>
                          <td className="course-table__computed course-table__computed--strong">
                            {result.concentrationMgL === null
                              ? "—"
                              : formatQuantity(result.concentrationMgL)}
                          </td>
                          <td>
                            <CourseStatusChip status={result.status} label={rowStatusLabels[result.status]} />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="course-row-remove"
                              onClick={() => removeSolidsRow(row.id)}
                              disabled={draft.solidsRows.length <= 1}
                              aria-label={`删除第 ${result.rowNumber} 行`}
                              title={
                                draft.solidsRows.length <= 1
                                  ? "至少保留一行"
                                  : "删除这一行"
                              }
                            >
                              <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="course-table-footer">
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={addSolidsRow}
                  disabled={draft.solidsRows.length >= MAX_SOLIDS_ROWS}
                >
                  <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
                  添加平行样
                </button>
                <span>
                  {draft.solidsRows.length} / {MAX_SOLIDS_ROWS} 行
                  {draft.solidsRows.length >= MAX_SOLIDS_ROWS ? " · 已达上限" : ""}
                </span>
              </div>

              <dl className="course-metrics">
                <CourseMetric label="已计算平行样" value={`${solids.computedCount} 行`} />
                <CourseMetric
                  label="浓度均值"
                  value={
                    solids.meanConcentrationMgL === null
                      ? "—"
                      : `${formatQuantity(solids.meanConcentrationMgL)} mg/L`
                  }
                  detail={solids.meanIncludesReview ? "包含需复查行，未自动剔除" : undefined}
                  tone={solids.meanIncludesReview ? "warning" : undefined}
                />
                <CourseMetric
                  label="缺失 / 需修正"
                  value={`${solids.missingCount} / ${solids.invalidCount} 行`}
                  tone={solids.invalidCount > 0 ? "danger" : solids.missingCount > 0 ? "warning" : undefined}
                />
                <CourseMetric
                  label="需复查"
                  value={`${solids.reviewCount} 行`}
                  tone={solids.reviewCount > 0 ? "warning" : undefined}
                />
              </dl>

              <div className="course-analysis-grid">
                <div className="course-chart-panel">
                  <div className="course-panel-head">
                    <div>
                      <h3>平行样浓度</h3>
                      <p>只绘制已经算出浓度的行；缺失或错误行不会补成 0。</p>
                    </div>
                    <span className="analysis-chart-panel__badge">n = {solidsChartPoints.length}</span>
                  </div>
                  {solidsChartPoints.length > 0 ? (
                    <ResearchChart
                      svgId={SOLIDS_CHART_ID}
                      points={solidsChartPoints}
                      chartType="bar"
                      title="悬浮固体浓度（按平行样）"
                      xName="平行样"
                      yName="浓度"
                      xUnit=""
                      yUnit="mg/L"
                      fit={null}
                      numericX={false}
                    />
                  ) : (
                    <div className="course-chart-empty">
                      <p>至少完成一行称量质量和体积后显示柱状图。</p>
                      <p>空白行不会被画成 0。</p>
                    </div>
                  )}
                  <div className="course-chart-actions">
                    <button
                      type="button"
                      className="button button--secondary button--small"
                      onClick={() => handleExportChart(SOLIDS_CHART_ID, "悬浮固体图")}
                      disabled={solidsChartPoints.length === 0}
                    >
                      <Download size={13} strokeWidth={1.5} aria-hidden="true" />
                      导出图表 SVG
                    </button>
                    <button
                      type="button"
                      className="button button--quiet button--small"
                      onClick={handleExportSolidsCsv}
                    >
                      <FileSpreadsheet size={13} strokeWidth={1.5} aria-hidden="true" />
                      导出本表 CSV
                    </button>
                  </div>
                </div>

                <CourseIssueList
                  title="悬浮固体检查"
                  issues={solids.issues}
                  hasInput={solids.tableHasInput}
                  emptyMessage="尚未填写悬浮固体。空表不会报缺失，也不会被当作 0。"
                  okMessage="当前已填写的平行样都有可计算浓度，未发现需复查项。"
                />
              </div>
            </div>

            <div
              id="course-panel-turbidity"
              className="course-panel"
              hidden={activeTab !== "turbidity"}
              aria-labelledby="course-tab-turbidity"
            >
              <div className="course-panel-head">
                <div>
                  <h3>浊度（浊度计法）</h3>
                  <p className="course-formula">组均值 = Σ仪器读数 ÷ 有效读数数（仅在同一仪器单位下计算）</p>
                </div>
                <span className="course-method-chip">HJ 1075-2019</span>
              </div>
              <div className="course-rule-note">
                <Info size={14} strokeWidth={1.5} aria-hidden="true" />
                <p>
                  仪器读数可以为 0，但不能为负数。单位可以填写 NTU、FNU、FTU 或其他仪器单位；
                  一旦同时出现不同单位，组均值和图表会暂停，统一单位后自动恢复。
                </p>
              </div>

              <p className="course-table-hint">
                <MoveHorizontal size={14} strokeWidth={1.5} aria-hidden="true" />
                表格可左右滑动；最后一列是删除操作。
              </p>
              <div
                className="course-table-scroll"
                role="region"
                aria-label="浊度数据表，可左右滚动"
                tabIndex={0}
              >
                <table className="course-table course-table--turbidity">
                  <caption className="sr-only">浊度平行样仪器读数和仪器单位。</caption>
                  <thead>
                    <tr>
                      <th scope="col">平行</th>
                      <th scope="col">仪器读数</th>
                      <th scope="col">仪器单位</th>
                      <th scope="col">状态</th>
                      <th scope="col">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {turbidity.rows.map((result, index) => {
                      const row = draft.turbidityRows[index];
                      if (!row) return null;
                      const readingIssue = result.issues.some(
                        (issue) => issue.field === "reading" && issue.level === "error",
                      );
                      const unitIssue = result.issues.some(
                        (issue) => issue.field === "unit" && issue.level === "error",
                      );
                      return (
                        <tr key={row.id} className={`course-table__row course-table__row--${result.status}`}>
                          <th scope="row" className="course-table__index">
                            {result.rowNumber}
                          </th>
                          <td>
                            <input
                              className="course-cell-input"
                              inputMode="decimal"
                              autoComplete="off"
                              maxLength={40}
                              value={row.reading}
                              aria-label={`第 ${result.rowNumber} 行浊度仪器读数`}
                              aria-invalid={readingIssue || undefined}
                              placeholder="如 10.2"
                              onChange={(event) =>
                                updateTurbidityRow(row.id, { reading: event.target.value })
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="course-cell-input course-cell-input--unit"
                              list="course-turbidity-units"
                              autoComplete="off"
                              maxLength={16}
                              value={row.unit}
                              aria-label={`第 ${result.rowNumber} 行浊度仪器单位`}
                              aria-invalid={unitIssue || undefined}
                              placeholder="NTU"
                              onChange={(event) =>
                                updateTurbidityRow(row.id, { unit: event.target.value })
                              }
                            />
                          </td>
                          <td>
                            <CourseStatusChip status={result.status} label={rowStatusLabels[result.status]} />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="course-row-remove"
                              onClick={() => removeTurbidityRow(row.id)}
                              disabled={draft.turbidityRows.length <= 1}
                              aria-label={`删除第 ${result.rowNumber} 行`}
                              title={
                                draft.turbidityRows.length <= 1
                                  ? "至少保留一行"
                                  : "删除这一行"
                              }
                            >
                              <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <datalist id="course-turbidity-units">
                  <option value="NTU" />
                  <option value="FNU" />
                  <option value="FTU" />
                </datalist>
              </div>
              <div className="course-table-footer">
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={addTurbidityRow}
                  disabled={draft.turbidityRows.length >= MAX_TURBIDITY_ROWS}
                >
                  <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
                  添加平行样
                </button>
                <span>
                  {draft.turbidityRows.length} / {MAX_TURBIDITY_ROWS} 行
                  {draft.turbidityRows.length >= MAX_TURBIDITY_ROWS ? " · 已达上限" : ""}
                </span>
              </div>

              <dl className="course-metrics">
                <CourseMetric label="有效读数" value={`${turbidity.validCount} 行`} />
                <CourseMetric
                  label="组均值"
                  value={
                    turbidity.aggregationPaused
                      ? "已暂停"
                      : turbidity.mean === null
                        ? "—"
                        : `${formatQuantity(turbidity.mean)} ${turbidity.meanUnit ?? ""}`.trim()
                  }
                  detail={turbidity.aggregationPaused ? "仪器单位不一致，统一后自动计算" : undefined}
                  tone={turbidity.aggregationPaused ? "warning" : undefined}
                />
                <CourseMetric
                  label="缺失 / 需修正"
                  value={`${turbidity.missingCount} / ${turbidity.invalidCount} 行`}
                  tone={
                    turbidity.invalidCount > 0
                      ? "danger"
                      : turbidity.missingCount > 0
                        ? "warning"
                        : undefined
                  }
                />
                <CourseMetric
                  label="仪器单位"
                  value={turbidity.units.length > 0 ? turbidity.units.join("、") : "—"}
                  tone={turbidity.aggregationPaused ? "warning" : undefined}
                />
              </dl>

              <div className="course-analysis-grid">
                <div className="course-chart-panel">
                  <div className="course-panel-head">
                    <div>
                      <h3>平行样浊度读数</h3>
                      <p>单位一致时才绘图；混合单位会暂停，不强行求均值。</p>
                    </div>
                    <span className="analysis-chart-panel__badge">n = {turbidityChartPoints.length}</span>
                  </div>
                  {turbidity.aggregationPaused ? (
                    <div className="course-chart-empty course-chart-empty--warning">
                      <p>检测到不同仪器单位，组均值和图表已暂停。</p>
                      <p>把单位统一为同一种后会自动恢复。</p>
                    </div>
                  ) : turbidityChartPoints.length > 0 ? (
                    <ResearchChart
                      svgId={TURBIDITY_CHART_ID}
                      points={turbidityChartPoints}
                      chartType="bar"
                      title="浊度仪器读数（按平行样）"
                      xName="平行样"
                      yName="仪器读数"
                      xUnit=""
                      yUnit={turbidity.meanUnit ?? ""}
                      fit={null}
                      numericX={false}
                    />
                  ) : (
                    <div className="course-chart-empty">
                      <p>至少填写一行有效读数和单位后显示柱状图。</p>
                      <p>空白行不会被画成 0。</p>
                    </div>
                  )}
                  <div className="course-chart-actions">
                    <button
                      type="button"
                      className="button button--secondary button--small"
                      onClick={() => handleExportChart(TURBIDITY_CHART_ID, "浊度图")}
                      disabled={turbidityChartPoints.length === 0}
                    >
                      <Download size={13} strokeWidth={1.5} aria-hidden="true" />
                      导出图表 SVG
                    </button>
                    <button
                      type="button"
                      className="button button--quiet button--small"
                      onClick={handleExportTurbidityCsv}
                    >
                      <FileSpreadsheet size={13} strokeWidth={1.5} aria-hidden="true" />
                      导出本表 CSV
                    </button>
                  </div>
                </div>

                <CourseIssueList
                  title="浊度检查"
                  issues={turbidity.issues}
                  hasInput={turbidity.tableHasInput}
                  emptyMessage="尚未填写浊度。空表不会报缺失，也不会被当作 0。"
                  okMessage="当前有效读数可以按同一单位计算组均值。"
                />
              </div>
            </div>

            <div
              id="course-panel-photo"
              className="course-panel"
              hidden={activeTab !== "photo"}
              aria-labelledby="course-tab-photo"
            >
              <div className="course-panel-head">
                <div>
                  <h3>现场照片（可选）</h3>
                  <p>照片使用独立的本地草稿，不会覆盖数值；也不参与计算和摘要导出。</p>
                </div>
                <span className="course-method-chip">IndexedDB</span>
              </div>
              <PhotoRecord
                draftId={PHOTO_DRAFT_ID}
                onSwitchToManual={() => selectTab("solids")}
              />
            </div>
          </section>

          <section className="course-handoff" aria-labelledby="course-handoff-title">
            <div className="course-panel-head">
              <div>
                <h2 id="course-handoff-title">导出与交接</h2>
                <p>摘要包含两张表、检查结果和待确认规则；CSV 适合继续在表格软件里处理。</p>
              </div>
              <span className="status-chip status-chip--neutral">本机生成</span>
            </div>
            <p className="course-handoff__sample">
              当前样品编号：
              <strong>{draft.sampleId.trim() || "未填写"}</strong>
            </p>
            {commonIssues.length > 0 && (
              <p className="course-handoff__requirement">
                <Info size={13} strokeWidth={1.5} aria-hidden="true" />
                导出摘要还需要填写：
                {commonIssues.map((issue) => issue.column).filter(Boolean).join("、")}。CSV 不受影响。
              </p>
            )}
            {exportError && (
              <p className="course-inline-error" role="alert">
                <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" />
                {exportError}
              </p>
            )}
            <div className="course-handoff__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={handleExportSummary}
                disabled={!hasContent}
              >
                <FileText size={14} strokeWidth={1.5} aria-hidden="true" />
                导出交接摘要 Markdown
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={handleExportSolidsCsv}
              >
                <FileSpreadsheet size={14} strokeWidth={1.5} aria-hidden="true" />
                导出悬浮固体 CSV
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={handleExportTurbidityCsv}
              >
                <FileSpreadsheet size={14} strokeWidth={1.5} aria-hidden="true" />
                导出浊度 CSV
              </button>
            </div>
            <p className="course-handoff__note">
              摘要和 CSV 都从当前浏览器直接生成，不调用后端；现场照片不会写入这些文件。正式报告仍需按课程讲义和教师要求复核。
            </p>
          </section>

          <CourseGuidePanels
            pending={experimentOneMeta.pending}
            references={experimentOneReferences}
          />
        </>
      )}
    </div>
  );
}