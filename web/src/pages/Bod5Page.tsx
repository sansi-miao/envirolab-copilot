import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Download,
  FileSpreadsheet,
  Info,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";

import { CourseDraftToolbar } from "../components/course/CourseDraftToolbar";
import {
  CourseIssueList,
  CourseMetric,
  CourseRawStateChip,
  CourseSyntheticBanner,
} from "../components/course/CourseElements";
import { CourseGuidePanels } from "../components/course/CourseGuidePanels";
import { PublicStandardReference } from "../components/course/PublicStandardReference";
import { PageHeader } from "../components/ui/PageHeader";
import { useBod5Draft } from "../hooks/useRawCourseDrafts";
import { downloadTextFile } from "../lib/analysis";
import {
  COURSE_SESSION_BOD5_FIRST_ID,
  COURSE_SESSION_BOD5_SECOND_ID,
  bod5EntryMeta,
  bod5References,
  getCourseSession,
} from "../lib/course";
import { safeFileStem } from "../lib/courseCommon";
import { bod5PublicStandard } from "../lib/coursePublicStandards";
import {
  MAX_RAW_NOTE_LENGTH,
  MAX_RAW_SAMPLE_ID_LENGTH,
  MAX_RAW_UNIT_LENGTH,
  buildBod5Csv,
  createBod5SyntheticDraft,
  evaluateBod5Draft,
  hasBod5Content,
  rawRecordStateLabels,
  type Bod5Draft,
  type BodStageEvaluation,
  type BodStageFields,
} from "../lib/courseRawRecords";

function stageTone(state: BodStageEvaluation["state"]) {
  return state === "invalid"
    ? ("danger" as const)
    : state === "partial"
      ? ("warning" as const)
      : state === "complete"
        ? ("positive" as const)
        : undefined;
}

function stageDetail(stage: BodStageEvaluation) {
  if (!stage.complete && !stage.hasInput) return "尚未填写，不按 0 处理";
  if (stage.missingFields.length > 0) return `缺少：${stage.missingFields.join("、")}`;
  if (stage.complete) return "字段齐全，不代表质控合格";
  return "字段需修正";
}

function StageCard({
  stage,
  title,
  courseLabel,
  current,
  onFieldChange,
}: {
  stage: BodStageEvaluation;
  title: string;
  courseLabel: string;
  current: boolean;
  onFieldChange: (stage: "first" | "second", field: keyof BodStageFields, value: string) => void;
}) {
  const errorFor = (field: string) =>
    stage.issues.some((issue) => issue.field === field && issue.level === "error");
  const missingText =
    stage.missingFields.length > 0 ? stage.missingFields.join("、") : "";

  return (
    <section
      className={`course-stage-card ${current ? "course-stage-card--current" : ""}`}
      aria-labelledby={`bod-stage-${stage.stage}-title`}
      aria-current={current ? "step" : undefined}
    >
      <div className="course-stage-card__head">
        <div>
          <span className="course-stage-card__course">{courseLabel}</span>
          <h3 id={`bod-stage-${stage.stage}-title`}>{title}</h3>
        </div>
        <div className="course-stage-card__chips">
          {current && <span className="course-method-chip">当前入口</span>}
          <CourseRawStateChip state={stage.state} />
        </div>
      </div>
      <p className="course-stage-card__note">
        只保存原始字段。首段和次段分别判断是否齐全，缺失不会按 0 处理。
      </p>

      <div className="course-stage-fields">
        <div className="course-field">
          <label className="course-field__label" htmlFor={`bod-${stage.stage}-date`}>
            日期 <em>必填</em>
          </label>
          <input
            id={`bod-${stage.stage}-date`}
            type="date"
            className="field course-input"
            value={stage.fields.date}
            aria-invalid={errorFor("date") || undefined}
            onChange={(event) => onFieldChange(stage.stage, "date", event.target.value)}
          />
        </div>
        <div className="course-field">
          <label className="course-field__label" htmlFor={`bod-${stage.stage}-reading`}>
            原始读数 <em>必填</em>
          </label>
          <input
            id={`bod-${stage.stage}-reading`}
            className="field course-input"
            inputMode="decimal"
            autoComplete="off"
            maxLength={40}
            value={stage.fields.reading}
            aria-invalid={errorFor("reading") || undefined}
            placeholder="按原始记录填写"
            onChange={(event) => onFieldChange(stage.stage, "reading", event.target.value)}
          />
        </div>
        <div className="course-field">
          <label className="course-field__label" htmlFor={`bod-${stage.stage}-unit`}>
            仪器单位 <em>必填</em>
          </label>
          <input
            id={`bod-${stage.stage}-unit`}
            className="field course-input"
            autoComplete="off"
            maxLength={MAX_RAW_UNIT_LENGTH}
            value={stage.fields.unit}
            aria-invalid={errorFor("unit") || undefined}
            placeholder="如 mg/L"
            onChange={(event) => onFieldChange(stage.stage, "unit", event.target.value)}
          />
        </div>
      </div>

      <p
        className={`course-stage-card__completeness ${
          stage.state === "complete"
            ? "course-stage-card__completeness--ok"
            : stage.state === "invalid"
              ? "course-stage-card__completeness--danger"
              : stage.state === "partial"
                ? "course-stage-card__completeness--warn"
                : ""
        }`}
      >
        {!stage.hasInput
          ? "尚未填写，空白不按 0 处理。"
          : stage.state === "complete"
            ? "日期、原始读数和单位已填写齐全。"
            : `${missingText ? `缺少：${missingText}。` : ""}${
                stage.invalidFields.length > 0
                  ? `${stage.invalidFields.join("、")}需要修正。`
                  : ""
              }缺失不按 0 处理。`}
      </p>
    </section>
  );
}

export function Bod5Page({ sessionId }: { sessionId: string }) {
  const currentSession =
    getCourseSession(sessionId) ?? getCourseSession(COURSE_SESSION_BOD5_FIRST_ID);
  const currentStage = sessionId === COURSE_SESSION_BOD5_SECOND_ID ? "second" : "first";
  const otherSessionId =
    currentStage === "first" ? COURSE_SESSION_BOD5_SECOND_ID : COURSE_SESSION_BOD5_FIRST_ID;
  const otherStageLabel = currentStage === "first" ? "次段" : "首段";
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
  } = useBod5Draft();
  const [notice, setNotice] = useState("");
  const evaluation = useMemo(() => evaluateBod5Draft(draft), [draft]);
  const hasContent = hasBod5Content(draft);
  const stem = `${safeFileStem(draft.sampleId) || "BOD5未命名样品"}-两段原始记录`;

  function updateSampleField(field: "sampleId" | "note", value: string) {
    setNotice("");
    updateDraft((current) => ({ ...current, [field]: value }));
  }

  function updateStageField(
    stage: "first" | "second",
    field: keyof BodStageFields,
    value: string,
  ) {
    setNotice("");
    updateDraft((current) => ({
      ...current,
      [stage]: { ...current[stage], [field]: value },
    }));
  }

  function applySynthetic() {
    replaceDraft(createBod5SyntheticDraft());
    setNotice("已载入两段合成样例。首段和次段都会显示“已齐全”，并持续标注为教学合成数据。");
  }

  function handleClear() {
    if (!clearDraft()) return false;
    setNotice("已清空 BOD₅ 两段共用草稿。");
    return true;
  }

  function handleExportCsv() {
    downloadTextFile(
      `${stem}-BOD5.csv`,
      buildBod5Csv(draft, evaluation),
      "text/csv;charset=utf-8",
    );
    setNotice(
      `CSV 已生成：首段${rawRecordStateLabels[evaluation.first.state]}，次段${
        rawRecordStateLabels[evaluation.second.state]
      }；文件不计算 BOD₅，缺失字段保持空白。`,
    );
  }

  return (
    <div className="page-frame course-detail course-raw-detail">
      <PageHeader
        eyebrow={`第 ${currentSession?.order ?? 6} 课次 · 环境监测课程`}
        title={
          currentStage === "first"
            ? "实验六 BOD₅ 测定（一）"
            : "实验七 BOD₅ 测定（二）"
        }
        description={bod5EntryMeta.purpose}
        actions={
          <>
            <a className="button button--secondary" href="#/course">
              <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
              返回课程总览
            </a>
            <a
              className="button button--secondary"
              href={`#/course?session=${otherSessionId}`}
            >
              <ArrowLeftRight size={14} strokeWidth={1.5} aria-hidden="true" />
              切换到{otherStageLabel}
            </a>
          </>
        }
      />

      {!hydrated ? (
        <div className="course-loading" role="status">
          <LoaderCircle size={18} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
          正在读取当前浏览器里的 BOD₅ 两段草稿…
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
            storageNote="第 6 和第 7 课次读写同一份 BOD₅ 本地草稿。"
            teachingLabel="载入两段合成样例"
            teachingConfirmTitle="替换当前 BOD₅ 两段记录？"
            teachingConfirmBody="合成样例会覆盖首段、次段和备注，用于核对两课次共用草稿、刷新恢复和 CSV。样例明确标注为教学合成数据，不代表真实测量。"
            clearConfirmTitle="清空 BOD₅ 两段记录？"
            clearConfirmBody="这会删除当前浏览器里的 BOD₅ 共用草稿，首段和次段都会清空，无法撤销。"
            onLoadTeaching={applySynthetic}
            onClear={handleClear}
            onRetrySave={retrySave}
            onDismissRestored={dismissRestoredNotice}
          />

          {draft.isTeachingSample && (
            <CourseSyntheticBanner>{bod5EntryMeta.syntheticNote}</CourseSyntheticBanner>
          )}

          <section className="course-sample" aria-labelledby="bod-sample-title">
            <div className="course-panel-head">
              <div>
                <h2 id="bod-sample-title">两课次共用样品</h2>
                <p>第 6 课次和第 7 课次打开同一份本地记录；样品编号只填一次。</p>
              </div>
              <span className="course-local-chip">
                <ShieldCheck size={13} strokeWidth={1.5} aria-hidden="true" />
                {draft.isTeachingSample ? "合成样例" : "同一本地草稿"}
              </span>
            </div>
            <div className="course-field-grid course-field-grid--raw">
              <div className="course-field">
                <label className="course-field__label" htmlFor="bod-sample-id">
                  样品编号 <em>必填</em>
                </label>
                <input
                  id="bod-sample-id"
                  className="field course-input"
                  value={draft.sampleId}
                  maxLength={MAX_RAW_SAMPLE_ID_LENGTH}
                  autoComplete="off"
                  aria-invalid={evaluation.issues.some((issue) => issue.field === "sampleId") || undefined}
                  placeholder="例如 WW-BOD-01"
                  onChange={(event) => updateSampleField("sampleId", event.target.value)}
                />
              </div>
              <div className="course-field course-field--wide">
                <label className="course-field__label" htmlFor="bod-note">
                  两段共用备注（可选）
                </label>
                <textarea
                  id="bod-note"
                  className="field course-textarea"
                  rows={2}
                  maxLength={MAX_RAW_NOTE_LENGTH}
                  value={draft.note}
                  placeholder="例如：稀释倍数、接种、培养条件或异常现象。"
                  onChange={(event) => updateSampleField("note", event.target.value)}
                />
              </div>
            </div>
            <div className="course-field-footer">
              <span>样品编号、两段读数和单位都不会写入网址，也不会上传服务器。</span>
              <span>
                {draft.note.length} / {MAX_RAW_NOTE_LENGTH}
              </span>
            </div>
          </section>

          <section className="course-record" aria-labelledby="bod-record-title">
            <div className="course-section-head">
              <div>
                <h2 id="bod-record-title">首段与次段</h2>
                <p>
                  当前从{currentStage === "first" ? "第 6 课次的首段" : "第 7 课次的次段"}进入，
                  两段仍显示在同一页面。补齐任一段后，可切换到另一课次继续。
                </p>
              </div>
              <span className="course-map__count">同一份本地草稿</span>
            </div>

            <div className="course-stage-grid">
              <StageCard
                stage={evaluation.first}
                title="首段记录"
                courseLabel="第 6 课次 · 培养前"
                current={currentStage === "first"}
                onFieldChange={updateStageField}
              />
              <StageCard
                stage={evaluation.second}
                title="次段记录"
                courseLabel="第 7 课次 · 培养后"
                current={currentStage === "second"}
                onFieldChange={updateStageField}
              />
            </div>

            <dl className="course-metrics">
              <CourseMetric
                label="首段状态"
                value={rawRecordStateLabels[evaluation.first.state]}
                detail={stageDetail(evaluation.first)}
                tone={stageTone(evaluation.first.state)}
              />
              <CourseMetric
                label="次段状态"
                value={rawRecordStateLabels[evaluation.second.state]}
                detail={stageDetail(evaluation.second)}
                tone={stageTone(evaluation.second.state)}
              />
              <CourseMetric
                label="两段字段"
                value={evaluation.bothComplete ? "已齐全" : "未齐全"}
                detail={evaluation.bothComplete ? "仍需教师复核" : "缺失不按 0 处理"}
                tone={evaluation.bothComplete ? "positive" : "warning"}
              />
              <CourseMetric
                label="BOD₅ 浓度"
                value="未计算"
                detail="待讲义确认稀释、接种与空白校正规则"
              />
            </dl>

            <div className="course-analysis-grid course-analysis-grid--single">
              <CourseIssueList
                title="两段记录检查"
                issues={evaluation.issues}
                hasInput={evaluation.hasInput}
                emptyMessage="尚未填写 BOD₅。空表不会报缺失，首段和次段都不会被当作 0。"
                okMessage="首段和次段字段均已齐全，样品编号已填写；本页不计算 BOD₅，仍需按讲义复核。"
              />
              <div className="course-rule-note course-rule-note--panel">
                <Info size={14} strokeWidth={1.5} aria-hidden="true" />
                <p>
                  首段和次段各自判断日期、原始读数与单位是否齐全。读数可以为 0，但不能为负数；
                  单位不一致只会提示复查，不会自动换算。次段可单独续填，但首段未齐全时会提示核对。
                </p>
              </div>
            </div>
          </section>

          <section className="course-handoff" aria-labelledby="bod-handoff-title">
            <div className="course-panel-head">
              <div>
                <h2 id="bod-handoff-title">导出两段原始记录</h2>
                <p>CSV 一行包含首段、次段、各自状态和缺失字段，不计算 BOD₅。</p>
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
                导出 BOD₅ 两段 CSV
              </button>
            </div>
            <p className="course-handoff__note">
              <Download size={13} strokeWidth={1.5} aria-hidden="true" /> 文件由当前浏览器直接生成，
              不调用后端。合成样例与手填记录会在 CSV 的“数据标注”列区分。
            </p>
          </section>

          <CourseGuidePanels pending={bod5EntryMeta.pending} references={bod5References} />

          <PublicStandardReference standard={bod5PublicStandard} />

          <p className="course-session-ref">
            当前入口：<code>#/course?session={sessionId}</code> · 另一段：
            <code>#/course?session={otherSessionId}</code>
          </p>
        </>
      )}
    </div>
  );
}