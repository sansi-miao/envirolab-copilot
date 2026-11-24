import {
  computeLinearFit,
  formatNumber,
  type AnalysisPoint,
  type LinearFit,
} from "./analysis.ts";
import {
  csvCell,
  parseNumericInput,
  readString,
  todayLocalDate,
  type NumericInput,
} from "./courseCommon.ts";
import {
  MANUAL_DATA_LABEL,
  SYNTHETIC_DATA_LABEL,
  type RawCheckIssue,
} from "./courseRawRecords.ts";

export const SO2_DRAFT_KEY = "envirolab.course.so2.draft.v1";
export const SO2_DRAFT_VERSION = 1;
export const SO2_STANDARD_MASSES = [0, 1, 5, 10, 15, 20] as const;
export const MAX_SO2_ABSORBANCE_LENGTH = 40;
export const MAX_SO2_VOLUME_LENGTH = 40;
export const SO2_FORMULA_NOTE =
  "C = (A − A₀) × Bs ÷ V₀；Bs = 1 ÷ b。Bs 以 μg/吸光度、V₀ 以 L 计时，μg/L 与 mg/m³ 数值相同，不再乘 1000。";
export const SO2_FIT_NOTE =
  "六点普通最小二乘拟合，不强制过原点；R² 只描述拟合，不设合格线。样品空白只按公式扣除 A₀ 一次，未再减拟合截距。";
export const SO2_SCOPE_NOTE =
  "本轮只做读数记录、标准曲线和样品计算；讲义第 29 页标准溶液标定公式不纳入本轮样品计算。";

export type So2RecordState = "empty" | "partial" | "invalid" | "review" | "complete";
export type So2ResultStatus = "empty" | "blocked" | "review" | "ready";
export type So2IssueKind = "missing" | "invalid" | "review";

export interface So2CheckIssue extends RawCheckIssue {
  kind: So2IssueKind;
}

export const so2RecordStateLabels: Record<So2RecordState, string> = {
  empty: "未开始",
  partial: "未齐全",
  invalid: "需修正",
  review: "需复核",
  complete: "已齐全",
};

export const so2ResultStatusLabels: Record<So2ResultStatus, string> = {
  empty: "未计算",
  blocked: "暂停计算",
  review: "计算值需复核",
  ready: "计算完成（待教师复核）",
};

export const so2CurveStatusLabels = {
  empty: "未填写",
  partial: "未齐全",
  invalid: "需修正",
  ready: "已拟合",
} as const;

export interface So2Draft {
  version: typeof SO2_DRAFT_VERSION;
  sampleId: string;
  measuredAt: string;
  recordRef: string;
  note: string;
  sampleAbsorbance: string;
  blankAbsorbance: string;
  sampleVolumeL: string;
  standardAbsorbances: string[];
  isTeachingSample: boolean;
  updatedAt: string;
}

export interface So2ReadingCheck {
  field: string;
  label: string;
  raw: string;
  hasInput: boolean;
  reading: NumericInput;
  value: number | null;
  valid: boolean;
  missing: boolean;
  invalid: boolean;
  issues: So2CheckIssue[];
}

export interface So2StandardReading {
  index: number;
  massUg: number;
  raw: string;
  hasInput: boolean;
  value: number | null;
  valid: boolean;
  missing: boolean;
  invalid: boolean;
  issues: So2CheckIssue[];
}

export interface So2CurveEvaluation {
  readings: So2StandardReading[];
  points: AnalysisPoint[];
  hasInput: boolean;
  completeCount: number;
  missingCount: number;
  invalidCount: number;
  allValid: boolean;
  fit: LinearFit | null;
  slopeValid: boolean;
  bs: number | null;
  status: keyof typeof so2CurveStatusLabels;
  issues: So2CheckIssue[];
}

export interface So2SampleEvaluation {
  hasMetadataInput: boolean;
  hasReadingInput: boolean;
  hasInput: boolean;
  metadataComplete: boolean;
  readingsComplete: boolean;
  sampleAbsorbance: So2ReadingCheck;
  blankAbsorbance: So2ReadingCheck;
  volume: So2ReadingCheck;
  amountUg: number | null;
  resultMgM3: number | null;
  belowBlank: boolean;
  outOfRange: boolean;
  canCalculate: boolean;
  resultStatus: So2ResultStatus;
  blockedReason: string;
  issues: So2CheckIssue[];
}

export interface So2Evaluation {
  hasInput: boolean;
  state: So2RecordState;
  complete: boolean;
  curve: So2CurveEvaluation;
  sample: So2SampleEvaluation;
  issues: So2CheckIssue[];
  sampleAmountUg: number | null;
  resultMgM3: number | null;
  resultStatus: So2ResultStatus;
}

function makeIssue(
  prefix: string,
  field: string,
  kind: So2IssueKind,
  message: string,
): So2CheckIssue {
  return {
    id: `${prefix}-${field}-${kind}`,
    field,
    kind,
    level: kind === "review" ? "warning" : "error",
    message,
  };
}

function checkNonNegativeReading(
  field: string,
  label: string,
  raw: string,
  prefix: string,
  missingMessage: string,
  invalidMessage: string,
  negativeMessage: string,
): So2ReadingCheck {
  const reading = parseNumericInput(raw);
  const issues: So2CheckIssue[] = [];
  const missing = reading.kind === "blank";
  const invalid =
    reading.kind === "invalid" || (reading.kind === "value" && reading.value < 0);

  if (missing) {
    issues.push(makeIssue(prefix, field, "missing", missingMessage));
  } else if (reading.kind === "invalid") {
    issues.push(makeIssue(prefix, field, "invalid", invalidMessage));
  } else if (reading.kind === "value" && reading.value < 0) {
    issues.push(makeIssue(prefix, field, "invalid", negativeMessage));
  }

  return {
    field,
    label,
    raw,
    hasInput: raw.trim() !== "",
    reading,
    value: reading.kind === "value" && reading.value >= 0 ? reading.value : null,
    valid: !missing && !invalid,
    missing,
    invalid,
    issues,
  };
}

function checkVolume(raw: string): So2ReadingCheck {
  const reading = parseNumericInput(raw);
  const issues: So2CheckIssue[] = [];
  const missing = reading.kind === "blank";
  const invalid =
    reading.kind === "invalid" || (reading.kind === "value" && reading.value <= 0);

  if (missing) {
    issues.push(
      makeIssue(
        "so2",
        "sampleVolumeL",
        "missing",
        "标况采样体积 V₀ 不能为空；本页不预填 20 L，也不把采样器实测体积自动当作 V₀。",
      ),
    );
  } else if (reading.kind === "invalid") {
    issues.push(
      makeIssue(
        "so2",
        "sampleVolumeL",
        "invalid",
        "标况采样体积 V₀ 不是有效数字，请填写按课堂要求换算后的体积。",
      ),
    );
  } else if (reading.kind === "value" && reading.value <= 0) {
    issues.push(
      makeIssue(
        "so2",
        "sampleVolumeL",
        "invalid",
        "标况采样体积 V₀ 必须大于 0 L，当前值无法用于计算。",
      ),
    );
  }

  return {
    field: "sampleVolumeL",
    label: "标况采样体积 V₀",
    raw,
    hasInput: raw.trim() !== "",
    reading,
    value: reading.kind === "value" && reading.value > 0 ? reading.value : null,
    valid: !missing && !invalid,
    missing,
    invalid,
    issues,
  };
}

export function createEmptySo2Draft(): So2Draft {
  return {
    version: SO2_DRAFT_VERSION,
    sampleId: "",
    measuredAt: todayLocalDate(),
    recordRef: "",
    note: "",
    sampleAbsorbance: "",
    blankAbsorbance: "",
    sampleVolumeL: "",
    standardAbsorbances: SO2_STANDARD_MASSES.map(() => ""),
    isTeachingSample: false,
    updatedAt: new Date().toISOString(),
  };
}

export function createSo2SyntheticDraft(): So2Draft {
  return {
    version: SO2_DRAFT_VERSION,
    sampleId: "SYN-SO2-05",
    measuredAt: todayLocalDate(),
    recordRef: "SYN-SO2-P30",
    note: "教学合成样例：六点标准吸光度、A、A₀ 与 V₀ 仅用于核对拟合、计算和 CSV；不是真实测量，也不能作为达标结论。",
    sampleAbsorbance: "0.260",
    blankAbsorbance: "0.010",
    sampleVolumeL: "20",
    standardAbsorbances: ["0.010", "0.060", "0.260", "0.510", "0.760", "1.010"],
    isTeachingSample: true,
    updatedAt: new Date().toISOString(),
  };
}

export function hasSo2Content(draft: So2Draft) {
  return Boolean(
    draft.sampleId.trim() ||
      draft.recordRef.trim() ||
      draft.note.trim() ||
      draft.sampleAbsorbance.trim() ||
      draft.blankAbsorbance.trim() ||
      draft.sampleVolumeL.trim() ||
      draft.standardAbsorbances.some((value) => value.trim()),
  );
}

function evaluateCurve(draft: So2Draft): So2CurveEvaluation {
  const readings: So2StandardReading[] = SO2_STANDARD_MASSES.map((massUg, index) => {
    const raw = draft.standardAbsorbances[index] ?? "";
    const reading = parseNumericInput(raw);
    const issues: So2CheckIssue[] = [];
    const field = `standard-${index}`;
    const missing = reading.kind === "blank";
    const invalid =
      reading.kind === "invalid" || (reading.kind === "value" && reading.value < 0);

    if (raw.trim() !== "") {
      if (reading.kind === "invalid") {
        issues.push(
          makeIssue(
            "so2",
            field,
            "invalid",
            `标准点 ${massUg} μg 的 570 nm 吸光度不是有效数字，请按原始记录核对。`,
          ),
        );
      } else if (reading.kind === "value" && reading.value < 0) {
        issues.push(
          makeIssue(
            "so2",
            field,
            "invalid",
            `标准点 ${massUg} μg 的 570 nm 吸光度不能为负数。`,
          ),
        );
      } else if (reading.kind === "value") {
        // Valid reading; no issue.
      }
    } else {
      issues.push(
        makeIssue(
          "so2",
          field,
          "missing",
          `标准点 ${massUg} μg 的 570 nm 吸光度尚未填写；缺失不按 0 处理。`,
        ),
      );
    }

    return {
      index,
      massUg,
      raw,
      hasInput: raw.trim() !== "",
      value: reading.kind === "value" && reading.value >= 0 ? reading.value : null,
      valid: !missing && !invalid,
      missing,
      invalid,
      issues,
    };
  });

  const hasInput = readings.some((reading) => reading.hasInput);
  const completeCount = readings.filter((reading) => reading.valid).length;
  const missingCount = readings.filter((reading) => reading.missing).length;
  const invalidCount = readings.filter((reading) => reading.invalid).length;
  const allValid = completeCount === readings.length;
  const points: AnalysisPoint[] = readings
    .filter(
      (reading): reading is So2StandardReading & { value: number } =>
        reading.valid && reading.value !== null,
    )
    .map((reading) => ({
      x: reading.massUg,
      y: reading.value,
      row: reading.index + 1,
      xLabel: `${reading.massUg} μg`,
      yLabel: formatNumber(reading.value, 6),
    }));

  let fit: LinearFit | null = null;
  let slopeValid = false;
  let bs: number | null = null;
  const issues: So2CheckIssue[] = [];
  if (hasInput) {
    issues.push(...readings.flatMap((reading) => reading.issues));
  }

  if (allValid && points.length === readings.length) {
    fit = computeLinearFit(points);
    if (!fit) {
      issues.push(
        makeIssue(
          "so2",
          "standardCurve",
          "invalid",
          "六点吸光度没有可拟合的变化（斜率无法计算），不能得到计算因子 Bs；请核对标准曲线记录。",
        ),
      );
    } else if (fit.slope <= 0) {
      issues.push(
        makeIssue(
          "so2",
          "standardCurve",
          "invalid",
          `拟合斜率 b = ${formatNumber(fit.slope, 5)} 为非正数，不能计算 Bs；请核对标准点顺序、空白和吸光度。`,
        ),
      );
    } else {
      slopeValid = true;
      bs = 1 / fit.slope;
    }
  }

  const status: So2CurveEvaluation["status"] = !hasInput
    ? "empty"
    : invalidCount > 0 || (allValid && !slopeValid)
      ? "invalid"
      : allValid
        ? "ready"
        : "partial";

  return {
    readings,
    points,
    hasInput,
    completeCount,
    missingCount,
    invalidCount,
    allValid,
    fit,
    slopeValid,
    bs,
    status,
    issues,
  };
}

function evaluateSample(
  draft: So2Draft,
  curve: So2CurveEvaluation,
): So2SampleEvaluation {
  const sampleAbsorbance = checkNonNegativeReading(
    "sampleAbsorbance",
    "样品吸光度 A",
    draft.sampleAbsorbance,
    "so2",
    "样品吸光度 A 不能为空；缺失不按 0 处理。",
    "样品吸光度 A 不是有效数字，请按原始记录核对。",
    "样品吸光度 A 不能为负数。",
  );
  const blankAbsorbance = checkNonNegativeReading(
    "blankAbsorbance",
    "试剂空白吸光度 A₀",
    draft.blankAbsorbance,
    "so2",
    "试剂空白吸光度 A₀ 不能为空；本页不自动采用 0 μg 标准管吸光度。",
    "试剂空白吸光度 A₀ 不是有效数字，请按原始记录核对。",
    "试剂空白吸光度 A₀ 不能为负数。",
  );
  const volume = checkVolume(draft.sampleVolumeL);

  const hasMetadataInput = Boolean(
    draft.sampleId.trim() || draft.recordRef.trim(),
  );
  const hasReadingInput = Boolean(
    draft.sampleAbsorbance.trim() ||
      draft.blankAbsorbance.trim() ||
      draft.sampleVolumeL.trim(),
  );
  const hasInput = Boolean(hasMetadataInput || hasReadingInput || draft.note.trim());
  const metadataComplete = Boolean(
    draft.sampleId.trim() && draft.measuredAt.trim() && draft.recordRef.trim(),
  );
  const readingsComplete = Boolean(
    sampleAbsorbance.valid && blankAbsorbance.valid && volume.valid,
  );
  const sampleFieldsActive = hasMetadataInput || hasReadingInput;
  const issues: So2CheckIssue[] = [];

  if (sampleFieldsActive) {
    if (!draft.sampleId.trim()) {
      issues.push(
        makeIssue("so2", "sampleId", "missing", "样品编号不能为空。"),
      );
    }
    if (!draft.measuredAt.trim()) {
      issues.push(
        makeIssue("so2", "measuredAt", "missing", "测定日期不能为空。"),
      );
    }
    if (!draft.recordRef.trim()) {
      issues.push(
        makeIssue(
          "so2",
          "recordRef",
          "missing",
          "原始记录编号或页码不能为空，方便与讲义和记录表对照。",
        ),
      );
    }
    issues.push(...sampleAbsorbance.issues, ...blankAbsorbance.issues, ...volume.issues);
  }

  if (sampleFieldsActive && !curve.hasInput) {
    issues.push(
      makeIssue(
        "so2",
        "standardCurve",
        "missing",
        "标准曲线六个标准点的 570 nm 吸光度尚未填写，无法得到斜率 b 和 Bs，样品结果暂停计算。",
      ),
    );
  }

  const canCalculate = Boolean(
    curve.allValid && curve.slopeValid && curve.bs !== null && readingsComplete,
  );
  let amountUg: number | null = null;
  let resultMgM3: number | null = null;
  let belowBlank = false;
  let outOfRange = false;

  if (
    canCalculate &&
    sampleAbsorbance.value !== null &&
    blankAbsorbance.value !== null &&
    volume.value !== null &&
    curve.bs !== null
  ) {
    const difference = sampleAbsorbance.value - blankAbsorbance.value;
    belowBlank = difference < -1e-12;
    amountUg = difference * curve.bs;
    resultMgM3 = amountUg / volume.value;
    outOfRange = amountUg < -1e-9 || amountUg > SO2_STANDARD_MASSES[SO2_STANDARD_MASSES.length - 1] + 1e-9;

    if (belowBlank) {
      issues.push(
        makeIssue(
          "so2",
          "blankAbsorbance",
          "review",
          "样品吸光度 A 低于试剂空白 A₀，按公式计算的推算量为负值。原始读数已保留，请复核空白、比色和记录；未填 0，也未给出达标结论。",
        ),
      );
    } else if (outOfRange) {
      issues.push(
        makeIssue(
          "so2",
          "sampleAbsorbance",
          "review",
          `样品推算量 ${formatNumber(amountUg, 5)} μg 超出标准曲线 0–20 μg 范围；原始读数已保留，请复核或按教师要求处理后重测。`,
        ),
      );
    }
  }

  const blockedReason = !curve.hasInput
    ? "标准曲线尚未填写"
    : !curve.allValid
      ? "标准曲线六点吸光度未齐全"
      : !curve.slopeValid
        ? "标准曲线斜率无效"
        : !readingsComplete
          ? "样品 A、A₀ 或 V₀ 未齐全"
          : "";

  const resultStatus: So2ResultStatus = !hasInput
    ? "empty"
    : !canCalculate
      ? "blocked"
      : belowBlank || outOfRange
        ? "review"
        : "ready";

  return {
    hasMetadataInput,
    hasReadingInput,
    hasInput,
    metadataComplete,
    readingsComplete,
    sampleAbsorbance,
    blankAbsorbance,
    volume,
    amountUg,
    resultMgM3,
    belowBlank,
    outOfRange,
    canCalculate,
    resultStatus,
    blockedReason,
    issues,
  };
}

export function evaluateSo2Draft(draft: So2Draft): So2Evaluation {
  const curve = evaluateCurve(draft);
  const sample = evaluateSample(draft, curve);
  const hasInput = curve.hasInput || sample.hasInput;
  const issues = [...curve.issues, ...sample.issues];
  const hasInvalid = issues.some((issue) => issue.kind === "invalid");
  const hasMissing = issues.some((issue) => issue.kind === "missing");
  const hasReview = issues.some((issue) => issue.kind === "review");
  const fieldsComplete = Boolean(
    curve.allValid &&
      curve.slopeValid &&
      sample.metadataComplete &&
      sample.readingsComplete,
  );
  const recordComplete = fieldsComplete && issues.length === 0;
  const state: So2RecordState = !hasInput
    ? "empty"
    : hasInvalid
      ? "invalid"
      : hasMissing || !fieldsComplete
        ? "partial"
        : hasReview
          ? "review"
          : "complete";
  const resultStatus: So2ResultStatus = !hasInput
    ? "empty"
    : !sample.canCalculate
      ? "blocked"
      : sample.resultStatus;

  return {
    hasInput,
    state,
    complete: recordComplete,
    curve,
    sample,
    issues,
    sampleAmountUg: sample.amountUg,
    resultMgM3: sample.resultMgM3,
    resultStatus,
  };
}

function issueText(issues: So2CheckIssue[]) {
  return issues.map((issue) => issue.message).join("；") || "无阻断项";
}

function csvNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "";
  return String(Number(value.toPrecision(10)));
}

function fitEquation(fit: LinearFit | null) {
  if (!fit) return "";
  const sign = fit.intercept < 0 ? "−" : "+";
  return `y = ${formatNumber(fit.slope, 6)}x ${sign} ${formatNumber(Math.abs(fit.intercept), 6)}`;
}

export function buildSo2Csv(draft: So2Draft, evaluation: So2Evaluation) {
  const { curve, sample } = evaluation;
  const header = [
    "数据标注",
    "课表课次",
    "讲义位置",
    "样品编号",
    "测定日期",
    "原始记录编号或页码",
    "样品吸光度A",
    "试剂空白吸光度A0",
    "标况采样体积V0(L)",
    "标准质量序列(μg)",
    ...SO2_STANDARD_MASSES.map((mass) => `标准点${mass}μg吸光度`),
    "有效标准点数",
    "拟合方程",
    "拟合斜率b",
    "拟合截距a",
    "R²",
    "计算因子Bs(μg/吸光度)",
    "样品推算量(μg)",
    "计算结果C(mg/m³)",
    "结果单位",
    "结果状态",
    "记录状态",
    "复核提示",
    "备注",
    "拟合口径",
    "计算说明",
  ];
  const lines = [header.map(csvCell).join(",")];
  const calculation =
    evaluation.resultMgM3 === null
      ? "未计算；本页不把缺失字段按 0 处理。"
      : `C = (${draft.sampleAbsorbance.trim() || "A"} − ${
          draft.blankAbsorbance.trim() || "A₀"
        }) × ${csvNumber(curve.bs)} ÷ ${
          draft.sampleVolumeL.trim() || "V₀"
        } = ${csvNumber(evaluation.resultMgM3)} mg/m³；未判断是否达标。`;
  lines.push(
    [
      draft.isTeachingSample ? SYNTHETIC_DATA_LABEL : MANUAL_DATA_LABEL,
      "第5课次",
      "讲义实验四《实验四 空气中SO₂的测定》第28–30页（第29页标定公式不纳入）",
      draft.sampleId,
      draft.measuredAt,
      draft.recordRef,
      draft.sampleAbsorbance,
      draft.blankAbsorbance,
      draft.sampleVolumeL,
      SO2_STANDARD_MASSES.join(";"),
      ...draft.standardAbsorbances.map((value, index) => value || ""),
      String(curve.completeCount),
      fitEquation(curve.fit),
      csvNumber(curve.fit?.slope ?? null),
      csvNumber(curve.fit?.intercept ?? null),
      csvNumber(curve.fit?.r2 ?? null),
      csvNumber(curve.bs),
      csvNumber(evaluation.sampleAmountUg),
      csvNumber(evaluation.resultMgM3),
      "mg/m³",
      so2ResultStatusLabels[evaluation.resultStatus],
      so2RecordStateLabels[evaluation.state],
      issueText(evaluation.issues),
      draft.note,
      `${SO2_FIT_NOTE} ${SO2_SCOPE_NOTE}`,
      calculation,
    ]
      .map(csvCell)
      .join(","),
  );
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function parseSo2Draft(raw: string | null): So2Draft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== SO2_DRAFT_VERSION) return null;
  const standards = Array.isArray(record.standardAbsorbances)
    ? record.standardAbsorbances
    : [];
  return {
    version: SO2_DRAFT_VERSION,
    sampleId: readString(record.sampleId, 60),
    measuredAt: readString(record.measuredAt, 20) || todayLocalDate(),
    recordRef: readString(record.recordRef, 60),
    note: readString(record.note, 300),
    sampleAbsorbance: readString(record.sampleAbsorbance, MAX_SO2_ABSORBANCE_LENGTH),
    blankAbsorbance: readString(record.blankAbsorbance, MAX_SO2_ABSORBANCE_LENGTH),
    sampleVolumeL: readString(record.sampleVolumeL, MAX_SO2_VOLUME_LENGTH),
    standardAbsorbances: SO2_STANDARD_MASSES.map((_, index) =>
      readString(standards[index], MAX_SO2_ABSORBANCE_LENGTH),
    ),
    isTeachingSample: record.isTeachingSample === true,
    updatedAt: readString(record.updatedAt, 40) || new Date().toISOString(),
  };
}

export function serializeSo2Draft(draft: So2Draft) {
  return JSON.stringify(draft);
}

export function loadSo2Draft(): So2Draft | null {
  if (typeof localStorage === "undefined") return null;
  return parseSo2Draft(localStorage.getItem(SO2_DRAFT_KEY));
}

export function saveSo2Draft(draft: So2Draft): So2Draft {
  if (typeof localStorage === "undefined") {
    throw new Error("当前浏览器不支持本地草稿存储。");
  }
  const stored: So2Draft = {
    ...draft,
    version: SO2_DRAFT_VERSION,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(SO2_DRAFT_KEY, serializeSo2Draft(stored));
  return stored;
}

export function clearSo2Draft() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SO2_DRAFT_KEY);
}