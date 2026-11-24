import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Info,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";

import { CourseDraftToolbar } from "../components/course/CourseDraftToolbar";
import {
  CourseMetric,
  CourseIssueList,
  CourseRawStateChip,
  CourseSyntheticBanner,
} from "../components/course/CourseElements";
import { CourseGuidePanels } from "../components/course/CourseGuidePanels";
import { PublicStandardReference } from "../components/course/PublicStandardReference";
import { PageHeader } from "../components/ui/PageHeader";
import { useCodDraft } from "../hooks/useRawCourseDrafts";
import { downloadTextFile } from "../lib/analysis";
import {
  COURSE_SESSION_COD_ID,
  codEntryMeta,
  codReferences,
} from "../lib/course";
import { safeFileStem } from "../lib/courseCommon";
import { codPublicStandard } from "../lib/coursePublicStandards";
import {
  MANUAL_DATA_LABEL,
  MAX_RAW_NOTE_LENGTH,
  MAX_RAW_RECORD_NO_LENGTH,
  MAX_RAW_SAMPLE_ID_LENGTH,
  MAX_RAW_UNIT_LENGTH,
  buildCodCsv,
  createCodSyntheticDraft,
  evaluateCodDraft,
  hasCodContent,
  rawRecordStateLabels,
  } from "../lib/courseRawRecords";

type CodTextField = "sampleId" | "measuredAt" | "reading" | "unit" | "recordNo" | "note";

export function CodPage() {
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
  } = useCodDraft();
  const [notice, setNotice] = useState("");
  const evaluation = useMemo(() => evaluateCodDraft(draft), [draft]);
  const hasContent = hasCodContent(draft);
  const stem = `${safeFileStem(draft.sampleId) || "COD未命名样品"}-${draft.measuredAt || "日期未填"}`;

  function updateField(field: CodTextField, value: string) {
    setNotice("");
    updateDraft((current) => ({ ...current, [field]: value }));
  }

  function applySynthetic() {
    replaceDraft(createCodSyntheticDraft());
    setNotice("已载入合成样例。字段、CSV 和“教学合成样例”标注可用于核对，不代表真实测量。");
  }

  function handleClear() {
    if (!clearDraft()) return false;
    setNotice("已清空 COD 原始记录草稿。");
    return true;
  }

  function handleExportCsv() {
    downloadTextFile(
      `${stem}-COD原始记录.csv`,
      buildCodCsv(draft, evaluation),
      "text/csv;charset=utf-8",
    );
    setNotice(
      evaluation.issues.length > 0
        ? `CSV 已生成，仍有 ${evaluation.issues.length} 项检查提示；文件保留空白与提示，不补 0。`
        : "CSV 已生成，包含原始字段和“未计算 COD 浓度”说明。",
    );
  }

  function hasFieldError(field: string) {
    return evaluation.issues.some((issue) => issue.field === field);
  }

  return (
    <div className="page-frame course-detail course-raw-detail">
      <PageHeader
        eyebrow="第 3 课次 · 环境监测课程"
        title="实验三 COD 原始记录"
        description={codEntryMeta.purpose}
        actions={
          <>
            <a className="button button--secondary" href="#/course">
              <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
              返回课程总览
            </a>
            <a
              className="button button--quiet"
              href="#/experiments?id=water-cod-dichromate"
            >
              查看 COD 方法档案
            </a>
          </>
        }
      />

      {!hydrated ? (
        <div className="course-loading" role="status">
          <LoaderCircle size={18} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
          正在读取当前浏览器里的 COD 草稿…
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
            storageNote="COD 原始记录草稿只保存在当前浏览器。"
            teachingLabel="载入合成样例"
            teachingConfirmTitle="替换当前 COD 原始记录？"
            teachingConfirmBody="合成样例会覆盖现有手填字段，用于核对校验和 CSV。样例明确标注为教学合成数据，不代表真实测量。"
            clearConfirmTitle="清空 COD 原始记录？"
            clearConfirmBody="这会删除当前浏览器里的 COD 草稿和全部手填字段，清空后无法撤销。"
            onLoadTeaching={applySynthetic}
            onClear={handleClear}
            onRetrySave={retrySave}
            onDismissRestored={dismissRestoredNotice}
          />

          {draft.isTeachingSample && (
            <CourseSyntheticBanner>{codEntryMeta.syntheticNote}</CourseSyntheticBanner>
          )}

          <section className="course-sample" aria-labelledby="cod-sample-title">
            <div className="course-panel-head">
              <div>
                <h2 id="cod-sample-title">样品与原始记录</h2>
                <p>只保存手填原文；原始读数不会自动换算为 COD 浓度。</p>
              </div>
              <span className="course-local-chip">
                <ShieldCheck size={13} strokeWidth={1.5} aria-hidden="true" />
                {draft.isTeachingSample ? "合成样例" : "不上传服务器"}
              </span>
            </div>
            <div className="course-field-grid course-field-grid--raw">
              <div className="course-field">
                <label className="course-field__label" htmlFor="cod-sample-id">
                  样品编号 <em>必填</em>
                </label>
                <input
                  id="cod-sample-id"
                  className="field course-input"
                  value={draft.sampleId}
                  maxLength={MAX_RAW_SAMPLE_ID_LENGTH}
                  autoComplete="off"
                  aria-invalid={hasFieldError("sampleId") || undefined}
                  placeholder="例如 WW-COD-01"
                  onChange={(event) => updateField("sampleId", event.target.value)}
                />
              </div>
              <div className="course-field">
                <label className="course-field__label" htmlFor="cod-measured-at">
                  测定日期 <em>必填</em>
                </label>
                <input
                  id="cod-measured-at"
                  type="date"
                  className="field course-input"
                  value={draft.measuredAt}
                  aria-invalid={hasFieldError("measuredAt") || undefined}
                  onChange={(event) => updateField("measuredAt", event.target.value)}
                />
              </div>
              <div className="course-field">
                <label className="course-field__label" htmlFor="cod-record-no">
                  原始记录编号 <em>必填</em>
                </label>
                <input
                  id="cod-record-no"
                  className="field course-input"
                  value={draft.recordNo}
                  maxLength={MAX_RAW_RECORD_NO_LENGTH}
                  autoComplete="off"
                  aria-invalid={hasFieldError("recordNo") || undefined}
                  placeholder="例如 REC-COD-01"
                  onChange={(event) => updateField("recordNo", event.target.value)}
                />
              </div>
              <div className="course-field">
                <label className="course-field__label" htmlFor="cod-reading">
                  原始读数 <em>必填</em>
                </label>
                <input
                  id="cod-reading"
                  className="field course-input"
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={40}
                  value={draft.reading}
                  aria-invalid={hasFieldError("reading") || undefined}
                  placeholder="按原始记录填写"
                  onChange={(event) => updateField("reading", event.target.value)}
                />
              </div>
              <div className="course-field">
                <label className="course-field__label" htmlFor="cod-unit">
                  仪器单位 <em>必填</em>
                </label>
                <input
                  id="cod-unit"
                  className="field course-input"
                  autoComplete="off"
                  maxLength={MAX_RAW_UNIT_LENGTH}
                  value={draft.unit}
                  aria-invalid={hasFieldError("unit") || undefined}
                  placeholder="如 mg/L（仪器直读）"
                  onChange={(event) => updateField("unit", event.target.value)}
                />
              </div>
              <div className="course-field course-field--wide">
                <label className="course-field__label" htmlFor="cod-note">
                  备注（可选）
                </label>
                <textarea
                  id="cod-note"
                  className="field course-textarea"
                  rows={2}
                  maxLength={MAX_RAW_NOTE_LENGTH}
                  value={draft.note}
                  placeholder="例如：稀释倍数、空白编号、质控样或异常现象。"
                  onChange={(event) => updateField("note", event.target.value)}
                />
              </div>
            </div>
            <div className="course-field-footer">
              <span>读数与单位按原记录保存；本页不计算 COD，也不判断结果是否合格。</span>
              <span>
                {draft.note.length} / {MAX_RAW_NOTE_LENGTH}
              </span>
            </div>

            <div className="course-raw-status-row">
              <div>
                <span className="course-field__label">记录状态</span>
                <CourseRawStateChip state={evaluation.state} />
              </div>
              <span className="course-raw-status-row__hint">
                {evaluation.hasInput
                  ? evaluation.complete
                    ? "必填字段齐全，可以导出 CSV。"
                    : evaluation.state === "invalid"
                      ? "读数或字段需修正，CSV 仍可导出并保留原文。"
                      : "还有字段未齐全，CSV 仍可导出并保留空白。"
                  : "尚未开始填写，空表不会被当作 0。"}
              </span>
            </div>

            <dl className="course-metrics">
              <CourseMetric
                label="记录状态"
                value={rawRecordStateLabels[evaluation.state]}
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
                label="必填字段"
                value={`${evaluation.filledRequiredCount} / ${evaluation.requiredFieldCount}`}
                detail="样品号、日期、原始读数、单位、记录编号"
              />
              <CourseMetric
                label="数据来源"
                value={draft.isTeachingSample ? "合成样例" : MANUAL_DATA_LABEL}
                tone={draft.isTeachingSample ? "warning" : undefined}
              />
              <CourseMetric
                label="课程浓度"
                value="未计算"
                detail="待讲义确认原始读数含义与计算公式"
              />
            </dl>

            <div className="course-analysis-grid course-analysis-grid--single">
              <CourseIssueList
                title="COD 原始记录检查"
                issues={evaluation.issues}
                hasInput={evaluation.hasInput}
                emptyMessage="尚未填写 COD 原始记录。空表不会报缺失，也不会被当作 0。"
                okMessage="必填字段齐全。本页仍不计算 COD 浓度，正式处理需按讲义和教师要求复核。"
              />
              <div className="course-rule-note course-rule-note--panel">
                <Info size={14} strokeWidth={1.5} aria-hidden="true" />
                <p>
                  原始读数为 0 会按有效输入保存；空白、非法文本和负数会分别提示。仪器单位不做换算。
                  合成样例会一直保留标注，开始真实记录前请清空表单。
                </p>
              </div>
            </div>
          </section>

          <section className="course-handoff" aria-labelledby="cod-handoff-title">
            <div className="course-panel-head">
              <div>
                <h2 id="cod-handoff-title">导出原始记录</h2>
                <p>CSV 只包含原始字段、状态、数据标注和检查提示，不包含 COD 计算结果。</p>
              </div>
              <span className="status-chip status-chip--neutral">本机生成</span>
            </div>
            <p className="course-handoff__sample">
              当前样品编号：
              <strong>{draft.sampleId.trim() || "未填写"}</strong>
            </p>
            <div className="course-handoff__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={handleExportCsv}
                disabled={!hasContent}
              >
                <FileSpreadsheet size={14} strokeWidth={1.5} aria-hidden="true" />
                导出 COD CSV
              </button>
            </div>
            <p className="course-handoff__note">
              <Download size={13} strokeWidth={1.5} aria-hidden="true" /> 文件由当前浏览器直接生成，
              不调用后端。教学合成样例会在 CSV 中明确标注。
            </p>
          </section>

          <CourseGuidePanels pending={codEntryMeta.pending} references={codReferences} />

          <PublicStandardReference standard={codPublicStandard} />

          <p className="course-session-ref">
            课程路由：<code>#/course?session={COURSE_SESSION_COD_ID}</code>
          </p>
        </>
      )}
    </div>
  );
}