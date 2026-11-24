import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Info,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { CourseDraftToolbar } from "../components/course/CourseDraftToolbar";
import {
  CourseIssueList,
  CourseMetric,
  CourseRawStateChip,
  CourseSyntheticBanner,
} from "../components/course/CourseElements";
import { CourseGuidePanels } from "../components/course/CourseGuidePanels";
import { PageHeader } from "../components/ui/PageHeader";
import { useGenericCourseDraft } from "../hooks/useGenericCourseDraft";
import { downloadTextFile } from "../lib/analysis";
import { safeFileStem } from "../lib/courseCommon";
import {
  MAX_GENERIC_MEASUREMENT_LENGTH,
  MAX_GENERIC_NOTE_LENGTH,
  MAX_GENERIC_READING_LENGTH,
  MAX_GENERIC_RECORD_NO_LENGTH,
  MAX_GENERIC_ROWS,
  MAX_GENERIC_SAMPLE_ID_LENGTH,
  MAX_GENERIC_UNIT_LENGTH,
  buildGenericCsv,
  createEmptyGenericRow,
  createGenericSyntheticDraft,
  evaluateGenericDraft,
  getGenericSessionConfig,
  type GenericRawRow,
  type GenericSessionConfig,
} from "../lib/courseGenericRecords";

type RowField = "sampleId" | "measurement" | "reading" | "unit" | "note";

function GenericRecordPage({ config }: { config: GenericSessionConfig }) {
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
  } = useGenericCourseDraft(config);
  const [notice, setNotice] = useState("");
  const evaluation = useMemo(() => evaluateGenericDraft(config, draft), [config, draft]);
  const hasContent = evaluation.hasInput;
  const startedRows = draft.rows.filter((row) =>
    Boolean(
      row.sampleId.trim() ||
        row.measurement.trim() ||
        row.reading.trim() ||
        row.unit.trim() ||
        row.note.trim(),
    ),
  );
  const sampleLabelList = [...new Set(startedRows.map((row) => row.sampleId.trim()).filter(Boolean))];
  const stemSample = safeFileStem(sampleLabelList[0] ?? "") || `第${config.order}课次`;
  const measurementListId = `generic-measurements-${config.sessionId}`;
  const unitListId = `generic-units-${config.sessionId}`;

  function updateGlobal(field: "measuredAt" | "recordNo", value: string) {
    setNotice("");
    updateDraft((current) => ({ ...current, [field]: value }));
  }

  function updateRow(rowId: string, field: RowField, value: string) {
    setNotice("");
    updateDraft((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    }));
  }

  function addRow() {
    if (draft.rows.length >= MAX_GENERIC_ROWS) {
      setNotice(`每份记录最多保留 ${MAX_GENERIC_ROWS} 行，请先导出现有内容。`);
      return;
    }
    setNotice("");
    updateDraft((current) => ({
      ...current,
      rows: [...current.rows, createEmptyGenericRow()],
    }));
  }

  function removeRow(rowId: string) {
    if (draft.rows.length <= 1) return;
    setNotice("");
    updateDraft((current) => ({
      ...current,
      rows: current.rows.filter((row) => row.id !== rowId),
    }));
  }

  function applySynthetic() {
    replaceDraft(createGenericSyntheticDraft(config));
    setNotice("已载入教学合成样例。多行字段和“教学合成数据”标注可用于核对导出，不代表真实测量。");
  }

  function handleClear() {
    if (!clearDraft()) return false;
    setNotice(`已清空第 ${config.order} 课次的本地原始记录。`);
    return true;
  }

  function handleExportCsv() {
    downloadTextFile(
      `${stemSample}-第${config.order}课次原始记录.csv`,
      buildGenericCsv(config, draft, evaluation),
      "text/csv;charset=utf-8",
    );
    setNotice(
      evaluation.issues.length > 0
        ? `CSV 已生成，仍有 ${evaluation.issues.length} 项检查提示；空白值保持空白，不补 0。`
        : "CSV 已生成，包含已填写测量行的原始字段和教学数据标注。",
    );
  }

  function rowHasError(rowId: string, field: RowField) {
    return (evaluation.rowIssues[rowId] ?? []).some((issue) => issue.field === `${rowId}:${field}`);
  }

  return (
    <div className="page-frame course-detail course-raw-detail">
      <PageHeader
        eyebrow={`第 ${config.order} 课次 · 环境监测课程`}
        title={config.pageTitle}
        description={config.purpose}
        actions={
          <>
            <a className="button button--secondary" href="#/course">
              <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
              返回课程总览
            </a>
            <a className="button button--quiet" href="#/projects?view=new">
              公共目录找不到？新建我的实验
            </a>
          </>
        }
      />

      {!hydrated ? (
        <div className="course-loading" role="status">
          <LoaderCircle size={18} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
          正在读取当前浏览器里的第 {config.order} 课次草稿…
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
            storageNote={`第 ${config.order} 课次原始记录只保存在当前浏览器。`}
            teachingLabel="载入合成样例"
            teachingConfirmTitle={`替换第 ${config.order} 课次当前记录？`}
            teachingConfirmBody="合成样例会覆盖现有手填字段，用于核对多行字段、刷新恢复和 CSV。样例明确标注为教学合成数据，不代表真实测量。"
            clearConfirmTitle={`清空第 ${config.order} 课次原始记录？`}
            clearConfirmBody="这会删除当前浏览器里的本课次草稿和全部手填字段，清空后无法撤销。"
            onLoadTeaching={applySynthetic}
            onClear={handleClear}
            onRetrySave={retrySave}
            onDismissRestored={dismissRestoredNotice}
          />

          {draft.isTeachingSample && (
            <CourseSyntheticBanner>{config.syntheticNote}</CourseSyntheticBanner>
          )}

          <section className="course-sample" aria-labelledby="generic-sample-title">
            <div className="course-panel-head">
              <div>
                <h2 id="generic-sample-title">样品、测点与原始记录</h2>
                <p>
                  {config.method}。每行保留一个样品或测点的一个测量项目；空白行不会导出，空白值不会补 0。
                </p>
              </div>
              <span className="course-local-chip">
                <ShieldCheck size={13} strokeWidth={1.5} aria-hidden="true" />
                {draft.isTeachingSample ? "合成样例" : "不上传服务器"}
              </span>
            </div>

            <div className="course-field-grid course-generic-meta-grid">
              <div className="course-field">
                <label className="course-field__label" htmlFor={`generic-date-${config.sessionId}`}>
                  测定日期 <em>必填</em>
                </label>
                <input
                  id={`generic-date-${config.sessionId}`}
                  type="date"
                  className="field course-input"
                  value={draft.measuredAt}
                  aria-invalid={
                    evaluation.issues.some((issue) => issue.field === "measuredAt") || undefined
                  }
                  onChange={(event) => updateGlobal("measuredAt", event.target.value)}
                />
              </div>
              <div className="course-field">
                <label className="course-field__label" htmlFor={`generic-record-${config.sessionId}`}>
                  原始记录编号 <em>必填</em>
                </label>
                <input
                  id={`generic-record-${config.sessionId}`}
                  className="field course-input"
                  value={draft.recordNo}
                  maxLength={MAX_GENERIC_RECORD_NO_LENGTH}
                  autoComplete="off"
                  aria-invalid={
                    evaluation.issues.some((issue) => issue.field === "recordNo") || undefined
                  }
                  placeholder="例如 REC-2026-01"
                  onChange={(event) => updateGlobal("recordNo", event.target.value)}
                />
              </div>
            </div>

            <div className="course-table-intro">
              <span>{config.sampleLabel}</span>
              <span>
                字段：{config.sampleLabel}、测量项目、原始读数、单位、备注
              </span>
            </div>

            <datalist id={measurementListId}>
              {config.measurementOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <datalist id={unitListId}>
              {config.unitOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>

            <div className="course-table-scroll">
              <table className="course-table course-table--generic">
                <caption className="sr-only">第 {config.order} 课次原始记录</caption>
                <thead>
                  <tr>
                    <th scope="col" className="course-table__index">行</th>
                    <th scope="col">样品或点位编号</th>
                    <th scope="col">测量项目</th>
                    <th scope="col">原始读数</th>
                    <th scope="col">单位</th>
                    <th scope="col">备注</th>
                    <th scope="col">行状态</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.rows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="course-table__index">{index + 1}</td>
                      <td>
                        <input
                          className="course-cell-input"
                          value={row.sampleId}
                          maxLength={MAX_GENERIC_SAMPLE_ID_LENGTH}
                          autoComplete="off"
                          aria-label={`第 ${index + 1} 行，${config.sampleLabel}`}
                          aria-invalid={rowHasError(row.id, "sampleId") || undefined}
                          placeholder={config.samplePlaceholder}
                          onChange={(event) => updateRow(row.id, "sampleId", event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="course-cell-input"
                          value={row.measurement}
                          maxLength={MAX_GENERIC_MEASUREMENT_LENGTH}
                          autoComplete="off"
                          list={measurementListId}
                          aria-label={`第 ${index + 1} 行，测量项目`}
                          aria-invalid={rowHasError(row.id, "measurement") || undefined}
                          placeholder={config.measurementPlaceholder}
                          onChange={(event) => updateRow(row.id, "measurement", event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="course-cell-input"
                          value={row.reading}
                          maxLength={MAX_GENERIC_READING_LENGTH}
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label={`第 ${index + 1} 行，原始读数`}
                          aria-invalid={rowHasError(row.id, "reading") || undefined}
                          placeholder={config.allowNegativeReading ? "如 24.6 或 -0.4" : "按原记录填写"}
                          onChange={(event) => updateRow(row.id, "reading", event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="course-cell-input course-cell-input--unit"
                          value={row.unit}
                          maxLength={MAX_GENERIC_UNIT_LENGTH}
                          autoComplete="off"
                          list={unitListId}
                          aria-label={`第 ${index + 1} 行，单位`}
                          aria-invalid={rowHasError(row.id, "unit") || undefined}
                          placeholder={config.unitPlaceholder}
                          onChange={(event) => updateRow(row.id, "unit", event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="course-cell-input"
                          value={row.note}
                          maxLength={MAX_GENERIC_NOTE_LENGTH}
                          autoComplete="off"
                          aria-label={`第 ${index + 1} 行，备注`}
                          placeholder="可选，如空白、平行样或异常现象"
                          onChange={(event) => updateRow(row.id, "note", event.target.value)}
                        />
                      </td>
                      <td>
                        <CourseRawStateChip state={evaluation.rowStates[row.id] ?? "empty"} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="course-row-remove"
                          aria-label={`删除第 ${index + 1} 行`}
                          title="删除这一行"
                          disabled={draft.rows.length <= 1}
                          onClick={() => removeRow(row.id)}
                        >
                          <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="course-table-footer">
              <span>
                已填 {evaluation.startedRowCount} 行 · 齐全 {evaluation.completeRowCount} 行 · 空白行不计入导出
              </span>
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={addRow}
                disabled={draft.rows.length >= MAX_GENERIC_ROWS}
              >
                <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
                添加测量行
              </button>
            </div>

            <div className="course-raw-status-row">
              <div>
                <span className="course-field__label">记录状态</span>
                <CourseRawStateChip state={evaluation.state} />
              </div>
              <span className="course-raw-status-row__hint">
                {evaluation.hasInput
                  ? evaluation.complete
                    ? "已填测量行字段齐全，可以导出 CSV。"
                    : evaluation.state === "invalid"
                      ? "读数或字段需修正，CSV 仍可导出并保留原文。"
                      : "还有字段未齐全，CSV 仍可导出并保留空白。"
                  : "尚未开始填写，空表不会被当作 0。"}
              </span>
            </div>

            <dl className="course-metrics">
              <CourseMetric
                label="记录状态"
                value={
                  evaluation.state === "empty"
                    ? "未开始"
                    : evaluation.complete
                      ? "已齐全"
                      : evaluation.state === "invalid"
                        ? "需修正"
                        : "未齐全"
                }
                tone={
                  evaluation.state === "invalid"
                    ? "danger"
                    : evaluation.state === "partial"
                      ? "warning"
                      : evaluation.state === "complete"
                        ? "positive"
                        : undefined
                }
              />
              <CourseMetric
                label="已填测量行"
                value={`${evaluation.startedRowCount} 行`}
                detail={`齐全 ${evaluation.completeRowCount} 行`}
              />
              <CourseMetric
                label="必填字段"
                value={`${evaluation.filledRequiredCount} / ${evaluation.requiredFieldCount}`}
                detail="日期、记录编号，以及每行编号/项目/读数/单位"
              />
              <CourseMetric
                label="计算与判定"
                value="未启用"
                detail="等待课程讲义确认公式、阈值与分级规则"
              />
            </dl>

            <div className="course-analysis-grid course-analysis-grid--single">
              <CourseIssueList
                title="原始记录字段检查"
                issues={evaluation.issues}
                hasInput={evaluation.hasInput}
                emptyMessage="尚未填写原始记录。空表不会报缺失，也不会被当作 0。"
                okMessage="已填测量行的必要字段齐全。本页仍不计算浓度、指数或正式结论。"
              />
              <div className="course-rule-note course-rule-note--panel">
                <Info size={14} strokeWidth={1.5} aria-hidden="true" />
                <p>
                  {config.allowNegativeReading
                    ? "原始读数可以是负数（例如 PMV），本页按原值保存；空白和非法文本会提示。"
                    : "原始读数为 0 会按有效输入保存；空白、非法文本和负数会分别提示。"}
                  单位不做换算。合成样例会一直保留标注，开始真实记录前请清空表单。
                </p>
              </div>
            </div>
          </section>

          <section className="course-handoff" aria-labelledby="generic-handoff-title">
            <div className="course-panel-head">
              <div>
                <h2 id="generic-handoff-title">导出原始记录</h2>
                <p>CSV 包含已填测量行、字段状态、数据标注和检查提示，不包含自动计算结果。</p>
              </div>
              <span className="status-chip status-chip--neutral">本机生成</span>
            </div>
            <p className="course-handoff__sample">
              当前样品或点位：
              <strong>{sampleLabelList.join("、") || "未填写"}</strong>
            </p>
            <div className="course-handoff__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={handleExportCsv}
                disabled={!hasContent}
              >
                <FileSpreadsheet size={14} strokeWidth={1.5} aria-hidden="true" />
                导出第 {config.order} 课次 CSV
              </button>
            </div>
            <p className="course-handoff__note">
              <Download size={13} strokeWidth={1.5} aria-hidden="true" /> 文件由当前浏览器直接生成，
              不调用后端。教学合成数据会在 CSV 中明确标注。
            </p>
          </section>

          <CourseGuidePanels pending={config.pending} references={config.references} />

          <p className="course-session-ref">
            课程路由：<code>#/course?session={config.sessionId}</code>
          </p>
        </>
      )}
    </div>
  );
}

export function CourseGenericPage({ sessionId }: { sessionId: string }) {
  const config = getGenericSessionConfig(sessionId);
  if (!config) {
    return (
      <div className="page-frame">
        <PageHeader
          eyebrow="环境监测课程"
          title="未找到这个课次的录入页"
          description="请返回课程总览，从 8 个课次中重新选择。"
          actions={
            <a className="button button--secondary" href="#/course">
              <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
              返回课程总览
            </a>
          }
        />
      </div>
    );
  }
  return <GenericRecordPage key={config.sessionId} config={config} />;
}