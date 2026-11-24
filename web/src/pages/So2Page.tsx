import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Download,
  FileSpreadsheet,
  Info,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";

import { ResearchChart } from "../components/analysis/ResearchChart";
import { CourseDraftToolbar } from "../components/course/CourseDraftToolbar";
import {
  CourseIssueList,
  CourseMetric,
  CourseStatusChip,
  CourseSyntheticBanner,
  type CourseRecordStatus,
} from "../components/course/CourseElements";
import { CourseGuidePanels } from "../components/course/CourseGuidePanels";
import { PageHeader } from "../components/ui/PageHeader";
import { useSo2Draft } from "../hooks/useRawCourseDrafts";
import { downloadTextFile, formatNumber, type LinearFit } from "../lib/analysis";
import {
  COURSE_SESSION_SO2_ID,
  so2EntryMeta,
  so2References,
} from "../lib/course";
import { safeFileStem } from "../lib/courseCommon";
import {
  MAX_SO2_ABSORBANCE_LENGTH,
  MAX_SO2_VOLUME_LENGTH,
  SO2_FIT_NOTE,
  SO2_FORMULA_NOTE,
  SO2_SCOPE_NOTE,
  SO2_STANDARD_MASSES,
  buildSo2Csv,
  createSo2SyntheticDraft,
  evaluateSo2Draft,
  hasSo2Content,
  so2CurveStatusLabels,
  so2RecordStateLabels,
  so2ResultStatusLabels,
  type So2StandardReading,
} from "../lib/courseSo2Records";

type So2TextField =
  | "sampleId"
  | "measuredAt"
  | "recordRef"
  | "note"
  | "sampleAbsorbance"
  | "blankAbsorbance"
  | "sampleVolumeL";

const recordStatusMap: Record<string, CourseRecordStatus> = {
  empty: "empty",
  partial: "missing",
  invalid: "invalid",
  review: "review",
  complete: "valid",
};

const curveStatusMap: Record<string, CourseRecordStatus> = {
  empty: "empty",
  partial: "missing",
  invalid: "invalid",
  ready: "valid",
};

const resultStatusMap: Record<string, CourseRecordStatus> = {
  empty: "empty",
  blocked: "missing",
  review: "review",
  ready: "valid",
};

function standardStatus(reading: So2StandardReading) {
  if (reading.valid) return { status: "valid" as const, label: "有效" };
  if (reading.invalid) return { status: "invalid" as const, label: "需修正" };
  return { status: "empty" as const, label: "空白" };
}

function equationText(fit: LinearFit | null) {
  if (!fit) return "尚未拟合";
  const sign = fit.intercept < 0 ? "−" : "+";
  return `y = ${formatNumber(fit.slope, 5)}x ${sign} ${formatNumber(Math.abs(fit.intercept), 5)}`;
}

export function So2Page() {
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
  } = useSo2Draft();
  const [notice, setNotice] = useState("");
  const evaluation = useMemo(() => evaluateSo2Draft(draft), [draft]);
  const hasContent = hasSo2Content(draft);
  const stem = `${safeFileStem(draft.sampleId) || "SO2未命名样品"}-${draft.measuredAt || "日期未填"}`;
  const { curve, sample } = evaluation;

  function updateField(field: So2TextField, value: string) {
    setNotice("");
    updateDraft((current) => ({ ...current, [field]: value }));
  }

  function updateStandard(index: number, value: string) {
    setNotice("");
    updateDraft((current) => ({
      ...current,
      standardAbsorbances: SO2_STANDARD_MASSES.map(
        (_, massIndex) => (massIndex === index ? value : current.standardAbsorbances[massIndex] ?? ""),
      ),
    }));
  }

  function hasFieldError(field: string) {
    return evaluation.issues.some((issue) => issue.field === field && issue.level === "error");
  }

  function applySynthetic() {
    replaceDraft(createSo2SyntheticDraft());
    setNotice(
      "已载入 SO₂ 合成样例。六点应拟合为 b = 0.05、Bs = 20，样品 C = 0.25 mg/m³；数据持续标注为教学合成。",
    );
  }

  function handleClear() {
    if (!clearDraft()) return false;
    setNotice("已清空 SO₂ 标准曲线与样品草稿。");
    return true;
  }

  function handleExportCsv() {
    downloadTextFile(
      `${stem}-SO2标准曲线与样品.csv`,
      buildSo2Csv(draft, evaluation),
      "text/csv;charset=utf-8",
    );
    const resultText =
      evaluation.resultMgM3 === null
        ? "样品结果暂未计算"
        : `样品 C = ${formatNumber(evaluation.resultMgM3, 6)} mg/m³`;
    setNotice(
      evaluation.issues.length > 0
        ? `SO₂ CSV 已生成，包含六点标准、A/A₀/V₀、斜率、Bs 和复核状态；${resultText}，仍有 ${evaluation.issues.length} 项提示。`
        : `SO₂ CSV 已生成，包含六点标准、A/A₀/V₀、斜率、Bs、结果和单位；${resultText}。`,
    );
  }

  const resultTone =
    evaluation.resultStatus === "review"
      ? ("warning" as const)
      : evaluation.resultStatus === "ready"
        ? ("positive" as const)
        : evaluation.state === "invalid"
          ? ("danger" as const)
          : undefined;
  const resultDetail =
    evaluation.resultStatus === "empty"
      ? "尚未填写样品结果所需字段"
      : evaluation.resultStatus === "blocked"
        ? `暂停计算：${sample.blockedReason || "必填字段未齐全"}`
        : sample.belowBlank
          ? "A 低于 A₀，负值保留待复核"
          : sample.outOfRange
            ? "推算量超出 0–20 μg，待复核"
            : "按讲义公式计算，仍需教师复核";
  const difference =
    sample.sampleAbsorbance.value !== null && sample.blankAbsorbance.value !== null
      ? sample.sampleAbsorbance.value - sample.blankAbsorbance.value
      : null;
  const curveChip = curveStatusMap[curve.status] ?? "empty";
  const resultChip = resultStatusMap[evaluation.resultStatus] ?? "empty";
  const issueOkMessage = !sample.hasInput
    ? "六个标准点字段齐全，曲线可以拟合。下一步填写样品信息、A、A₀ 和 V₀ 后才会计算 C。"
    : evaluation.resultStatus === "ready"
      ? "必填字段齐全，已按讲义公式计算样品浓度；本页不给达标结论，仍需教师复核。"
      : "标准曲线与样品字段正在检查；缺失字段保持空白，结果不会按 0 处理。";

  return (
    <div className="page-frame course-detail course-raw-detail">
      <PageHeader
        eyebrow={`${so2EntryMeta.courseLabel} · ${so2EntryMeta.handoutLabel}`}
        title={so2EntryMeta.title}
        description={so2EntryMeta.purpose}
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
          正在读取当前浏览器里的 SO₂ 草稿…
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
            storageNote="SO₂ 标准曲线、样品信息和计算结果草稿只保存在当前浏览器。"
            teachingLabel="载入合成样例"
            teachingConfirmTitle="替换当前 SO₂ 草稿？"
            teachingConfirmBody="合成样例会覆盖六个标准点、样品信息、A、A₀、V₀ 和备注，用于核对拟合、计算和 CSV。样例明确标注为教学合成数据，不代表真实测量。"
            clearConfirmTitle="清空 SO₂ 标准曲线与样品？"
            clearConfirmBody="这会删除当前浏览器里的 SO₂ 草稿和全部手填读数，清空后无法撤销。"
            onLoadTeaching={applySynthetic}
            onClear={handleClear}
            onRetrySave={retrySave}
            onDismissRestored={dismissRestoredNotice}
          />

          {draft.isTeachingSample && (
            <CourseSyntheticBanner>{so2EntryMeta.syntheticNote}</CourseSyntheticBanner>
          )}

          <div className="course-rule-note course-rule-note--info" role="note">
            <BookOpen size={14} strokeWidth={1.5} aria-hidden="true" />
            <p>
              <strong>
                {so2EntryMeta.courseLabel} · {so2EntryMeta.handoutLabel}
              </strong>
              。{SO2_SCOPE_NOTE}
              样品页只采用讲义第 30 页的样品公式，V₀ 由学生填写，不预填 20 L。
            </p>
          </div>

          <section className="course-sample" aria-labelledby="so2-sample-title">
            <div className="course-panel-head">
              <div>
                <h2 id="so2-sample-title">样品与测定读数</h2>
                <p>样品信息、A、A₀ 与 V₀ 分开填写；A₀ 不自动使用 0 μg 标准管读数。</p>
              </div>
              <span className="course-local-chip">
                <ShieldCheck size={13} strokeWidth={1.5} aria-hidden="true" />
                {draft.isTeachingSample ? "合成样例" : "不上传服务器"}
              </span>
            </div>

            <div className="course-field-grid course-field-grid--raw">
              <div className="course-field">
                <label className="course-field__label" htmlFor="so2-sample-id">
                  样品编号 <em>必填</em>
                </label>
                <input
                  id="so2-sample-id"
                  className="field course-input"
                  value={draft.sampleId}
                  maxLength={60}
                  autoComplete="off"
                  aria-invalid={hasFieldError("sampleId") || undefined}
                  placeholder="例如 AMB-SO2-01"
                  onChange={(event) => updateField("sampleId", event.target.value)}
                />
              </div>
              <div className="course-field">
                <label className="course-field__label" htmlFor="so2-measured-at">
                  测定日期 <em>必填</em>
                </label>
                <input
                  id="so2-measured-at"
                  type="date"
                  className="field course-input"
                  value={draft.measuredAt}
                  aria-invalid={hasFieldError("measuredAt") || undefined}
                  onChange={(event) => updateField("measuredAt", event.target.value)}
                />
              </div>
              <div className="course-field">
                <label className="course-field__label" htmlFor="so2-record-ref">
                  原始记录编号或页码 <em>必填</em>
                </label>
                <input
                  id="so2-record-ref"
                  className="field course-input"
                  value={draft.recordRef}
                  maxLength={60}
                  autoComplete="off"
                  aria-invalid={hasFieldError("recordRef") || undefined}
                  placeholder="如 REC-SO2-01 或讲义 P30"
                  onChange={(event) => updateField("recordRef", event.target.value)}
                />
              </div>
              <div className="course-field course-field--wide">
                <label className="course-field__label" htmlFor="so2-note">
                  备注（可选）
                </label>
                <textarea
                  id="so2-note"
                  className="field course-textarea"
                  rows={2}
                  maxLength={300}
                  value={draft.note}
                  placeholder="例如：采样地点、吸收液批号、异常现象或教师补充说明。"
                  onChange={(event) => updateField("note", event.target.value)}
                />
              </div>
            </div>

            <div className="course-field-grid course-field-grid--so2-readings">
              <div className="course-field">
                <label className="course-field__label" htmlFor="so2-sample-absorbance">
                  样品吸光度 A <em>必填</em>
                </label>
                <input
                  id="so2-sample-absorbance"
                  className="field course-input"
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={MAX_SO2_ABSORBANCE_LENGTH}
                  value={draft.sampleAbsorbance}
                  aria-invalid={hasFieldError("sampleAbsorbance") || undefined}
                  placeholder="570 nm 实测样品"
                  onChange={(event) => updateField("sampleAbsorbance", event.target.value)}
                />
              </div>
              <div className="course-field">
                <label className="course-field__label" htmlFor="so2-blank-absorbance">
                  试剂空白吸光度 A₀ <em>必填</em>
                </label>
                <input
                  id="so2-blank-absorbance"
                  className="field course-input"
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={MAX_SO2_ABSORBANCE_LENGTH}
                  value={draft.blankAbsorbance}
                  aria-invalid={hasFieldError("blankAbsorbance") || undefined}
                  placeholder="按试剂空白单独填写"
                  onChange={(event) => updateField("blankAbsorbance", event.target.value)}
                />
                <span className="course-field__hint">不自动采用 0 μg 标准管吸光度。</span>
              </div>
              <div className="course-field">
                <label className="course-field__label" htmlFor="so2-sample-volume">
                  标况采样体积 V₀（L） <em>必填</em>
                </label>
                <input
                  id="so2-sample-volume"
                  className="field course-input"
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={MAX_SO2_VOLUME_LENGTH}
                  value={draft.sampleVolumeL}
                  aria-invalid={hasFieldError("sampleVolumeL") || undefined}
                  placeholder="按课堂换算后填写"
                  onChange={(event) => updateField("sampleVolumeL", event.target.value)}
                />
                <span className="course-field__hint">
                  本页不预填 20 L，也不把采样器实测体积自动当作 V₀。
                </span>
              </div>
            </div>

            <div className="course-field-footer">
              <span>读数按原始记录保存；本页不做标况换算，也不判断采样是否有效。</span>
              <span>{draft.note.length} / 300</span>
            </div>
          </section>

          <section className="course-standard" aria-labelledby="so2-curve-title">
            <div className="course-panel-head">
              <div>
                <h2 id="so2-curve-title">标准曲线（讲义表 1-1）</h2>
                <p>
                  按讲义预填 SO₂ 质量 0、1、5、10、15、20 μg，只填写各管 570 nm 吸光度；
                  缺失不按 0 处理。
                </p>
              </div>
              <CourseStatusChip status={curveChip} label={so2CurveStatusLabels[curve.status]} />
            </div>

            <p className="course-table-hint">
              <Info size={12} strokeWidth={1.5} aria-hidden="true" />
              吸光度默认保持空白；至少六点齐全后才进行拟合。
            </p>
            <div className="course-table-scroll">
              <table className="course-table course-table--so2">
                <thead>
                  <tr>
                    <th scope="col">标准点</th>
                    <th scope="col">570 nm 吸光度</th>
                    <th scope="col">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {curve.readings.map((reading) => {
                    const chip = standardStatus(reading);
                    return (
                      <tr key={reading.massUg}>
                        <th scope="row">
                          <span className="course-so2-mass">{reading.massUg} μg</span>
                          <small>{reading.massUg === 0 ? "空白标准" : "标准管"}</small>
                        </th>
                        <td>
                          <input
                            className="course-cell-input"
                            inputMode="decimal"
                            autoComplete="off"
                            maxLength={MAX_SO2_ABSORBANCE_LENGTH}
                            value={reading.raw}
                            aria-label={`标准点 ${reading.massUg} μg 的 570 nm 吸光度`}
                            aria-invalid={reading.invalid || undefined}
                            placeholder="待填"
                            onChange={(event) => updateStandard(reading.index, event.target.value)}
                          />
                        </td>
                        <td>
                          <CourseStatusChip status={chip.status} label={chip.label} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="course-table-footer">
              <span>六点缺一不拟合；空白标准也必须按原始记录填写。</span>
              <span>
                {curve.completeCount} / {SO2_STANDARD_MASSES.length} 点有效
              </span>
            </div>

            <div className="course-chart-panel course-chart-panel--so2">
              <div className="course-panel-head course-panel-head--tight">
                <div>
                  <h3>散点与拟合线</h3>
                  <p>横轴为 SO₂ 质量（μg），纵轴为吸光度；虚线为六点最小二乘直线。</p>
                </div>
                <span className="course-method-chip">{equationText(curve.fit)}</span>
              </div>
              {curve.points.length === 0 ? (
                <div className="course-chart-empty" role="status">
                  <strong>标准曲线尚未开始</strong>
                  <span>填写六个标准点的 570 nm 吸光度后，这里会显示散点、拟合线和拟合方程。</span>
                  <span>缺失的标准点保持空白，不会按 0 绘制。</span>
                </div>
              ) : (
                <ResearchChart
                  svgId="so2-standard-curve"
                  points={curve.points}
                  chartType="scatter"
                  title="SO₂ 标准曲线（570 nm）"
                  xName="SO₂ 含量"
                  yName="吸光度"
                  xUnit="μg"
                  yUnit="A"
                  fit={curve.fit}
                  numericX
                />
              )}
              <p className="course-chart-note">
                {curve.allValid
                  ? `六点已填入，${curve.slopeValid ? "斜率可用于计算 Bs。" : "但斜率非正或无法拟合，样品结果暂停。"}`
                  : curve.hasInput
                    ? `已填入 ${curve.completeCount} / 6 点；补齐六点后才拟合。`
                    : "尚未填写标准点，图表保持空白。"}
              </p>
              <p className="course-table-footer">{SO2_FIT_NOTE}</p>
            </div>

            <dl className="course-metrics">
              <CourseMetric
                label="拟合斜率 b"
                value={curve.fit ? formatNumber(curve.fit.slope, 6) : "—"}
                detail="不强制过原点"
                tone={curve.slopeValid ? "positive" : curve.allValid ? "danger" : undefined}
              />
              <CourseMetric
                label="拟合截距 a"
                value={curve.fit ? formatNumber(curve.fit.intercept, 6) : "—"}
                detail="只用于绘线，不参与样品 C"
              />
              <CourseMetric
                label="R²"
                value={curve.fit ? formatNumber(curve.fit.r2, 5) : "—"}
                detail="只描述拟合，不设合格线"
              />
              <CourseMetric
                label="计算因子 Bs"
                value={curve.bs ? formatNumber(curve.bs, 6) : "—"}
                detail="Bs = 1 ÷ b（μg/吸光度）"
                tone={curve.slopeValid ? "positive" : curve.allValid ? "danger" : undefined}
              />
            </dl>
          </section>

          <section className="course-result" aria-labelledby="so2-result-title">
            <div className="course-panel-head">
              <div>
                <h2 id="so2-result-title">样品结果</h2>
                <p>按讲义第 30 页公式计算浓度，单位 mg/m³；本页不判断是否达标。</p>
              </div>
              <CourseStatusChip
                status={resultStatusMap[evaluation.resultStatus] ?? "empty"}
                label={so2ResultStatusLabels[evaluation.resultStatus]}
              />
            </div>

            <div className="course-raw-status-row">
              <div>
                <span className="course-field__label">记录状态</span>
                <CourseStatusChip
                  status={recordStatusMap[evaluation.state] ?? "empty"}
                  label={so2RecordStateLabels[evaluation.state]}
                />
              </div>
              <div>
                <span className="course-field__label">结果状态</span>
                <CourseStatusChip status={resultChip} label={so2ResultStatusLabels[evaluation.resultStatus]} />
              </div>
              <span className="course-raw-status-row__hint">{resultDetail}</span>
            </div>

            <p className="course-so2-formula">
              <code>C = (A − A₀) × Bs ÷ V₀</code>
              <span>{SO2_FORMULA_NOTE}</span>
            </p>

            <dl className="course-metrics">
              <CourseMetric
                label="A − A₀"
                value={difference === null ? "—" : formatNumber(difference, 6)}
                detail="只扣试剂空白一次"
                tone={sample.belowBlank ? "warning" : undefined}
              />
              <CourseMetric
                label="样品推算量"
                value={
                  evaluation.sampleAmountUg === null
                    ? "—"
                    : `${formatNumber(evaluation.sampleAmountUg, 6)} μg`
                }
                detail="由 A、A₀ 与 Bs 反推"
                tone={
                  sample.outOfRange ? "warning" : evaluation.sampleAmountUg !== null ? "positive" : undefined
                }
              />
              <CourseMetric
                label="样品浓度 C"
                value={
                  evaluation.resultMgM3 === null
                    ? "—"
                    : `${formatNumber(evaluation.resultMgM3, 6)} mg/m³`
                }
                detail={resultDetail}
                tone={resultTone}
              />
              <CourseMetric label="达标判断" value="未判断" detail="不自动给出达标或超标结论" />
            </dl>

            <div className="course-analysis-grid">
              <CourseIssueList
                title="曲线与样品检查"
                issues={evaluation.issues}
                hasInput={evaluation.hasInput}
                emptyMessage="尚未填写 SO₂ 标准曲线或样品。空表不会报缺失，也不会被当作 0。"
                okMessage={issueOkMessage}
              />
              <div className="course-rule-note course-rule-note--panel">
                <Info size={14} strokeWidth={1.5} aria-hidden="true" />
                <p>
                  样品推算量超出 0–20 μg 或 A 低于 A₀ 时，读数仍保留并提示复核，不会填成 0，
                  也不会自动给出达标结论。缺失字段、V₀ 非正数或斜率非正数时暂停计算。
                </p>
              </div>
            </div>
          </section>

          <section className="course-handoff" aria-labelledby="so2-handoff-title">
            <div className="course-panel-head">
              <div>
                <h2 id="so2-handoff-title">导出曲线与样品结果</h2>
                <p>
                  CSV 保留六个标准点及吸光度、A、A₀、V₀、斜率、Bs、计算结果、单位和复核状态，
                  便于手算核对。
                </p>
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
                导出 SO₂ CSV
              </button>
            </div>
            <p className="course-handoff__note">
              <Download size={13} strokeWidth={1.5} aria-hidden="true" /> 文件由当前浏览器直接生成，
              不调用后端。合成样例会在 CSV 的“数据标注”列明确标注；第 29 页标定公式不写入计算。
            </p>
          </section>

          <CourseGuidePanels pending={so2EntryMeta.pending} references={so2References} />

          <p className="course-session-ref">
            课程路由：<code>#/course?session={COURSE_SESSION_SO2_ID}</code>
          </p>
        </>
      )}
    </div>
  );
}