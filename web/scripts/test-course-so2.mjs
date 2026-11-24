import assert from "node:assert/strict";

import {
  SO2_DRAFT_KEY,
  SO2_DRAFT_VERSION,
  SO2_FORMULA_NOTE,
  SO2_STANDARD_MASSES,
  buildSo2Csv,
  createEmptySo2Draft,
  createSo2SyntheticDraft,
  evaluateSo2Draft,
  hasSo2Content,
  parseSo2Draft,
  serializeSo2Draft,
  so2RecordStateLabels,
  so2ResultStatusLabels,
} from "../src/lib/courseSo2Records.ts";
import { SYNTHETIC_DATA_LABEL } from "../src/lib/courseRawRecords.ts";

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL ${name}`);
    console.error(error?.stack ?? error);
  }
}

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(
    typeof actual === "number" && Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, got ${actual}`,
  );
}

function draftWith(overrides = {}) {
  return {
    ...createSo2SyntheticDraft(),
    ...overrides,
  };
}

function parseCsv(csv) {
  const text = csv.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\r" && text[index + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      index += 1;
    } else {
      cell += character;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function rowObject(header, row) {
  return Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""]));
}

console.log("SO2 standard-curve and sample-calculation logic tests");

test("SO2 draft key and six standard masses are fixed", () => {
  assert.equal(SO2_DRAFT_KEY, "envirolab.course.so2.draft.v1");
  assert.equal(SO2_DRAFT_VERSION, 1);
  assert.deepEqual([...SO2_STANDARD_MASSES], [0, 1, 5, 10, 15, 20]);
  assert.ok(SO2_FORMULA_NOTE.includes("Bs = 1 ÷ b"));
});

test("empty SO2 draft has blank V0, blank standards and no zero substitution", () => {
  const draft = createEmptySo2Draft();
  const evaluation = evaluateSo2Draft(draft);
  assert.equal(hasSo2Content(draft), false);
  assert.equal(draft.standardAbsorbances.length, 6);
  assert.ok(draft.standardAbsorbances.every((value) => value === ""));
  assert.equal(draft.sampleVolumeL, "");
  assert.equal(draft.sampleAbsorbance, "");
  assert.equal(draft.blankAbsorbance, "");
  assert.equal(evaluation.hasInput, false);
  assert.equal(evaluation.state, "empty");
  assert.equal(evaluation.curve.status, "empty");
  assert.equal(evaluation.curve.fit, null);
  assert.equal(evaluation.curve.bs, null);
  assert.equal(evaluation.sampleAmountUg, null);
  assert.equal(evaluation.resultMgM3, null);
  assert.equal(evaluation.resultStatus, "empty");
  assert.equal(evaluation.issues.length, 0);
  assert.equal(so2RecordStateLabels[evaluation.state], "未开始");
  assert.equal(so2ResultStatusLabels[evaluation.resultStatus], "未计算");
});

test("synthetic SO2 sample reaches the expected fit and result", () => {
  const draft = createSo2SyntheticDraft();
  const evaluation = evaluateSo2Draft(draft);
  assert.equal(draft.isTeachingSample, true);
  assert.equal(hasSo2Content(draft), true);
  assert.equal(evaluation.complete, true);
  assert.equal(evaluation.state, "complete");
  assert.equal(evaluation.resultStatus, "ready");
  assert.equal(evaluation.issues.length, 0);
  assert.equal(evaluation.curve.completeCount, 6);
  assert.equal(evaluation.curve.allValid, true);
  assert.equal(evaluation.curve.slopeValid, true);
  near(evaluation.curve.fit?.slope, 0.05);
  near(evaluation.curve.fit?.intercept, 0.01);
  near(evaluation.curve.fit?.r2, 1);
  near(evaluation.curve.bs, 20);
  near(evaluation.sampleAmountUg, 5);
  near(evaluation.resultMgM3, 0.25);
  assert.equal(evaluation.resultMgM3, 0.25);
});

test("sample formula subtracts A0 once and does not subtract the fit intercept again", () => {
  const draft = createSo2SyntheticDraft();
  const evaluation = evaluateSo2Draft(draft);
  assert.ok(evaluation.curve.fit && evaluation.curve.fit.intercept > 0);
  assert.equal(evaluation.resultMgM3, 0.25);
  assert.notEqual(evaluation.resultMgM3, 0.24);
});

test("a missing standard point pauses the curve and the sample result", () => {
  const standards = [...createSo2SyntheticDraft().standardAbsorbances];
  standards[2] = "";
  const evaluation = evaluateSo2Draft(draftWith({ standardAbsorbances: standards }));
  assert.equal(evaluation.curve.status, "partial");
  assert.equal(evaluation.curve.allValid, false);
  assert.equal(evaluation.curve.fit, null);
  assert.equal(evaluation.curve.bs, null);
  assert.equal(evaluation.sampleAmountUg, null);
  assert.equal(evaluation.resultMgM3, null);
  assert.equal(evaluation.resultStatus, "blocked");
  assert.equal(evaluation.state, "partial");
  assert.ok(
    evaluation.curve.issues.some(
      (issue) => issue.field === "standard-2" && issue.kind === "missing",
    ),
  );
  assert.ok(evaluation.curve.issues.some((issue) => issue.message.includes("不按 0 处理")));
});

test("an invalid standard absorbance blocks the curve", () => {
  const standards = [...createSo2SyntheticDraft().standardAbsorbances];
  standards[1] = "abc";
  const evaluation = evaluateSo2Draft(draftWith({ standardAbsorbances: standards }));
  assert.equal(evaluation.curve.status, "invalid");
  assert.equal(evaluation.state, "invalid");
  assert.equal(evaluation.resultMgM3, null);
  assert.ok(
    evaluation.curve.issues.some(
      (issue) => issue.field === "standard-1" && issue.kind === "invalid",
    ),
  );
});

test("constant standard absorbances cannot produce a positive slope", () => {
  const evaluation = evaluateSo2Draft(
    draftWith({ standardAbsorbances: ["0.480", "0.480", "0.480", "0.480", "0.480", "0.480"] }),
  );
  assert.equal(evaluation.curve.fit, null);
  assert.equal(evaluation.curve.slopeValid, false);
  assert.equal(evaluation.curve.bs, null);
  assert.equal(evaluation.state, "invalid");
  assert.equal(evaluation.resultMgM3, null);
  assert.ok(
    evaluation.curve.issues.some((issue) => issue.field === "standardCurve" && issue.kind === "invalid"),
  );
});

test("a descending standard curve is reported as a non-positive slope", () => {
  const evaluation = evaluateSo2Draft(
    draftWith({ standardAbsorbances: ["1.010", "0.840", "0.660", "0.490", "0.310", "0.140"] }),
  );
  assert.ok(evaluation.curve.fit && evaluation.curve.fit.slope < 0);
  assert.equal(evaluation.curve.slopeValid, false);
  assert.equal(evaluation.curve.bs, null);
  assert.equal(evaluation.state, "invalid");
  assert.equal(evaluation.resultMgM3, null);
  assert.ok(evaluation.curve.issues.some((issue) => issue.message.includes("非正数")));
});

test("missing sample absorbance pauses the result and names the field", () => {
  const evaluation = evaluateSo2Draft(draftWith({ sampleAbsorbance: "" }));
  assert.equal(evaluation.curve.slopeValid, true);
  assert.equal(evaluation.sample.canCalculate, false);
  assert.equal(evaluation.resultMgM3, null);
  assert.equal(evaluation.resultStatus, "blocked");
  assert.equal(evaluation.state, "partial");
  assert.ok(
    evaluation.issues.some(
      (issue) => issue.field === "sampleAbsorbance" && issue.kind === "missing",
    ),
  );
});

test("blank A0 stays blank instead of using the 0 ug standard tube", () => {
  const evaluation = evaluateSo2Draft(draftWith({ blankAbsorbance: "" }));
  assert.equal(evaluation.resultMgM3, null);
  assert.equal(evaluation.resultStatus, "blocked");
  assert.ok(
    evaluation.issues.some(
      (issue) => issue.field === "blankAbsorbance" && issue.kind === "missing",
    ),
  );
  assert.ok(evaluation.issues.some((issue) => issue.message.includes("不自动采用 0 μg 标准管")));
});

test("blank V0 is not prefilled and pauses calculation", () => {
  const evaluation = evaluateSo2Draft(draftWith({ sampleVolumeL: "" }));
  assert.equal(evaluation.resultMgM3, null);
  assert.equal(evaluation.resultStatus, "blocked");
  assert.ok(
    evaluation.issues.some(
      (issue) => issue.field === "sampleVolumeL" && issue.kind === "missing",
    ),
  );
  assert.ok(evaluation.issues.some((issue) => issue.message.includes("不预填 20 L")));
});

test("zero, negative and non-numeric V0 are invalid", () => {
  for (const value of ["0", "-1", "abc"]) {
    const evaluation = evaluateSo2Draft(draftWith({ sampleVolumeL: value }));
    assert.equal(evaluation.resultMgM3, null);
    assert.equal(evaluation.resultStatus, "blocked");
    assert.equal(evaluation.state, "invalid");
    assert.ok(
      evaluation.issues.some(
        (issue) => issue.field === "sampleVolumeL" && issue.kind === "invalid",
      ),
      `V0=${value} should be invalid`,
    );
  }
});

test("A below A0 keeps a negative formula value and flags review without zeroing", () => {
  const evaluation = evaluateSo2Draft(
    draftWith({ sampleAbsorbance: "0.005", blankAbsorbance: "0.010" }),
  );
  assert.equal(evaluation.curve.slopeValid, true);
  assert.equal(evaluation.sample.belowBlank, true);
  assert.equal(evaluation.sample.outOfRange, true);
  assert.equal(evaluation.resultStatus, "review");
  assert.equal(evaluation.state, "review");
  assert.notEqual(evaluation.resultMgM3, 0);
  assert.ok(evaluation.resultMgM3 !== null && evaluation.resultMgM3 < 0);
  near(evaluation.sampleAmountUg, -0.1);
  near(evaluation.resultMgM3, -0.005);
  assert.ok(
    evaluation.issues.some(
      (issue) => issue.field === "blankAbsorbance" && issue.kind === "review",
    ),
  );
});

test("a sample amount above 20 ug is kept and flagged for review", () => {
  const evaluation = evaluateSo2Draft(
    draftWith({ sampleAbsorbance: "1.260", blankAbsorbance: "0.010" }),
  );
  assert.equal(evaluation.sample.outOfRange, true);
  assert.equal(evaluation.sample.belowBlank, false);
  assert.equal(evaluation.resultStatus, "review");
  assert.equal(evaluation.state, "review");
  near(evaluation.sampleAmountUg, 25);
  near(evaluation.resultMgM3, 1.25);
  assert.ok(
    evaluation.issues.some(
      (issue) => issue.field === "sampleAbsorbance" && issue.kind === "review",
    ),
  );
});

test("a sample amount at the 20 ug boundary is not flagged", () => {
  const evaluation = evaluateSo2Draft(
    draftWith({ sampleAbsorbance: "1.010", blankAbsorbance: "0.010" }),
  );
  assert.equal(evaluation.sample.outOfRange, false);
  assert.equal(evaluation.sample.belowBlank, false);
  assert.equal(evaluation.resultStatus, "ready");
  assert.equal(evaluation.state, "complete");
  near(evaluation.sampleAmountUg, 20);
  near(evaluation.resultMgM3, 1);
  assert.equal(evaluation.issues.length, 0);
});

test("a low R2 is reported but does not invent an acceptance threshold", () => {
  const evaluation = evaluateSo2Draft(
    draftWith({
      standardAbsorbances: ["0.010", "0.500", "0.060", "0.900", "0.100", "1.010"],
      sampleAbsorbance: "0.010",
    }),
  );
  assert.ok(evaluation.curve.fit);
  assert.ok(evaluation.curve.fit.r2 < 0.5);
  assert.ok(evaluation.curve.fit.slope > 0);
  assert.equal(evaluation.resultStatus, "ready");
  assert.equal(evaluation.state, "complete");
  assert.equal(evaluation.issues.length, 0);
});

test("missing sample metadata does not block the formula but leaves the record incomplete", () => {
  const evaluation = evaluateSo2Draft(draftWith({ sampleId: "", recordRef: "" }));
  assert.equal(evaluation.sample.metadataComplete, false);
  assert.equal(evaluation.sample.canCalculate, true);
  near(evaluation.resultMgM3, 0.25);
  assert.equal(evaluation.resultStatus, "ready");
  assert.equal(evaluation.state, "partial");
  assert.ok(evaluation.issues.some((issue) => issue.field === "sampleId"));
  assert.ok(evaluation.issues.some((issue) => issue.field === "recordRef"));
});

test("draft round-trip preserves all six standards, A, A0, V0 and the synthetic flag", () => {
  const draft = createSo2SyntheticDraft();
  const parsed = parseSo2Draft(serializeSo2Draft(draft));
  assert.ok(parsed);
  assert.deepEqual(parsed.standardAbsorbances, draft.standardAbsorbances);
  assert.equal(parsed.sampleAbsorbance, "0.260");
  assert.equal(parsed.blankAbsorbance, "0.010");
  assert.equal(parsed.sampleVolumeL, "20");
  assert.equal(parsed.sampleId, "SYN-SO2-05");
  assert.equal(parsed.recordRef, "SYN-SO2-P30");
  assert.equal(parsed.isTeachingSample, true);
  const evaluation = evaluateSo2Draft(parsed);
  near(evaluation.curve.bs, 20);
  near(evaluation.resultMgM3, 0.25);
});

test("draft parser rejects another version and normalizes malformed standards", () => {
  assert.equal(parseSo2Draft("not json"), null);
  assert.equal(parseSo2Draft(JSON.stringify({ version: 2 })), null);
  const parsed = parseSo2Draft(
    JSON.stringify({
      version: 1,
      sampleId: "SO2-01",
      measuredAt: "2026-11-22",
      recordRef: "P30",
      sampleAbsorbance: "0.260",
      blankAbsorbance: "0.010",
      sampleVolumeL: "20",
      standardAbsorbances: ["0.010", "0.060"],
      isTeachingSample: false,
    }),
  );
  assert.ok(parsed);
  assert.equal(parsed.standardAbsorbances.length, 6);
  assert.equal(parsed.standardAbsorbances[1], "0.060");
  assert.equal(parsed.standardAbsorbances[2], "");
  assert.equal(parsed.standardAbsorbances[5], "");
});

test("hasSo2Content detects standards-only and sample-only input", () => {
  const standardsOnly = { ...createEmptySo2Draft(), standardAbsorbances: ["", "0.060", "", "", "", ""] };
  const sampleOnly = { ...createEmptySo2Draft(), sampleId: "SO2-01" };
  assert.equal(hasSo2Content(standardsOnly), true);
  assert.equal(hasSo2Content(sampleOnly), true);
  assert.equal(hasSo2Content(createEmptySo2Draft()), false);
});

test("CSV keeps the six standards, fit, Bs, sample result, unit and review status", () => {
  const draft = createSo2SyntheticDraft();
  const evaluation = evaluateSo2Draft(draft);
  const csv = buildSo2Csv(draft, evaluation);
  assert.ok(csv.startsWith("\uFEFF"));
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  const record = rowObject(rows[0], rows[1]);
  assert.equal(record["数据标注"], SYNTHETIC_DATA_LABEL);
  assert.equal(record["课表课次"], "第5课次");
  assert.ok(record["讲义位置"].includes("第28–30页"));
  assert.ok(record["讲义位置"].includes("第29页标定公式不纳入"));
  assert.equal(record["标准质量序列(μg)"], "0;1;5;10;15;20");
  for (const mass of SO2_STANDARD_MASSES) {
    assert.ok(Object.hasOwn(record, `标准点${mass}μg吸光度`));
  }
  assert.equal(record["标准点0μg吸光度"], "0.010");
  assert.equal(record["标准点1μg吸光度"], "0.060");
  assert.equal(record["标准点5μg吸光度"], "0.260");
  assert.equal(record["标准点10μg吸光度"], "0.510");
  assert.equal(record["标准点15μg吸光度"], "0.760");
  assert.equal(record["标准点20μg吸光度"], "1.010");
  assert.equal(record["样品吸光度A"], "0.260");
  assert.equal(record["试剂空白吸光度A0"], "0.010");
  assert.equal(record["标况采样体积V0(L)"], "20");
  assert.equal(record["拟合斜率b"], "0.05");
  assert.equal(record["拟合截距a"], "0.01");
  assert.equal(record["R²"], "1");
  assert.equal(record["计算因子Bs(μg/吸光度)"], "20");
  assert.equal(record["样品推算量(μg)"], "5");
  assert.equal(record["计算结果C(mg/m³)"], "0.25");
  assert.equal(record["结果单位"], "mg/m³");
  assert.equal(record["结果状态"], "计算完成（待教师复核）");
  assert.equal(record["记录状态"], "已齐全");
  assert.ok(record["拟合口径"].includes("不强制过原点"));
  assert.ok(record["拟合口径"].includes("不设合格线"));
  assert.ok(record["计算说明"].includes("0.25 mg/m³"));
  assert.ok(record["计算说明"].includes("未判断是否达标"));
});

test("CSV for a paused calculation leaves the result blank and records why", () => {
  const draft = draftWith({ sampleVolumeL: "" });
  const evaluation = evaluateSo2Draft(draft);
  const csv = buildSo2Csv(draft, evaluation);
  const rows = parseCsv(csv);
  const record = rowObject(rows[0], rows[1]);
  assert.equal(record["结果状态"], "暂停计算");
  assert.equal(record["计算结果C(mg/m³)"], "");
  assert.equal(record["样品推算量(μg)"], "");
  assert.equal(record["标况采样体积V0(L)"], "");
  assert.ok(record["复核提示"].includes("V₀ 不能为空"));
  assert.ok(record["计算说明"].includes("未计算"));
});

test("CSV keeps a flagged negative result instead of writing zero", () => {
  const draft = draftWith({ sampleAbsorbance: "0.005", blankAbsorbance: "0.010" });
  const evaluation = evaluateSo2Draft(draft);
  const csv = buildSo2Csv(draft, evaluation);
  const rows = parseCsv(csv);
  const record = rowObject(rows[0], rows[1]);
  assert.equal(record["结果状态"], "计算值需复核");
  assert.equal(record["记录状态"], "需复核");
  assert.equal(record["计算结果C(mg/m³)"], "-0.005");
  assert.ok(record["复核提示"].includes("低于试剂空白"));
  assert.ok(record["计算说明"].includes("未判断是否达标"));
});

const summary = `${passed} passed, ${failures.length} failed`;
console.log(`\nSO2 test summary: ${summary}`);
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`- ${failure.name}`);
  }
  process.exitCode = 1;
}