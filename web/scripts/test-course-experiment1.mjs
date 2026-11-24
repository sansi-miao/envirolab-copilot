import assert from "node:assert/strict";

import {
  MAX_SAMPLE_ID_LENGTH,
  MAX_SOLIDS_ROWS,
  buildSolidsCsv,
  buildSummaryMarkdown,
  buildTurbidityCsv,
  clearExperimentOneDraft,
  createEmptyDraft,
  createSolidsRow,
  createTeachingDraft,
  createTurbidityRow,
  evaluateCommon,
  evaluateSolids,
  evaluateTurbidity,
  formatQuantity,
  formatSavedTime,
  getSolidsChartPoints,
  getTurbidityChartPoints,
  hasDraftContent,
  normalizeTurbidityUnit,
  parseExperimentOneDraft,
  parseNumericInput,
  saveExperimentOneDraft,
  serializeExperimentOneDraft,
} from "../src/lib/courseExperiment1.ts";

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

function approx(actual, expected, label = "value", tolerance = 1e-9) {
  assert.equal(typeof actual, "number", `${label} should be a number, got ${String(actual)}`);
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

console.log("Experiment 1 pure logic tests");

test("teaching solids: mg and g both convert to 50.0 mg/L", () => {
  const draft = createTeachingDraft();
  const evaluation = evaluateSolids(draft.solidsRows);
  assert.equal(evaluation.tableHasInput, true);
  assert.equal(evaluation.computedCount, 2);
  assert.equal(evaluation.missingCount, 0);
  assert.equal(evaluation.invalidCount, 0);
  assert.equal(evaluation.reviewCount, 0);
  assert.equal(evaluation.issues.length, 0);
  assert.equal(evaluation.rows[0].status, "valid");
  assert.equal(evaluation.rows[1].status, "valid");
  approx(evaluation.rows[0].beforeMg, 125, "row 1 before mg");
  approx(evaluation.rows[1].beforeMg, 125, "row 2 before mg");
  approx(evaluation.rows[0].massDifferenceMg, 5, "row 1 mass difference");
  approx(evaluation.rows[1].massDifferenceMg, 5, "row 2 mass difference");
  approx(evaluation.rows[0].concentrationMgL, 50, "row 1 concentration");
  approx(evaluation.rows[1].concentrationMgL, 50, "row 2 concentration");
  approx(evaluation.meanConcentrationMgL, 50, "mean concentration");
  assert.equal(formatQuantity(evaluation.meanConcentrationMgL), "50.0");
});

test("teaching turbidity: 10.2 NTU mean with one missing row counted separately", () => {
  const draft = createTeachingDraft();
  const evaluation = evaluateTurbidity(draft.turbidityRows);
  assert.equal(evaluation.tableHasInput, true);
  assert.equal(evaluation.validCount, 3);
  assert.equal(evaluation.missingCount, 1);
  assert.equal(evaluation.invalidCount, 0);
  assert.equal(evaluation.aggregationPaused, false);
  assert.deepEqual(evaluation.units, ["NTU"]);
  assert.equal(evaluation.meanUnit, "NTU");
  approx(evaluation.mean, 10.2, "turbidity mean");
  assert.equal(formatQuantity(evaluation.mean), "10.2");
  assert.deepEqual(
    evaluation.rows.map((row) => row.status),
    ["valid", "valid", "valid", "missing"],
  );
  assert.equal(evaluation.issues.length, 1);
  assert.match(evaluation.issues[0].message, /缺失/);
});

test("empty tables are neither errors nor zero", () => {
  const draft = createEmptyDraft();
  const solids = evaluateSolids(draft.solidsRows);
  const turbidity = evaluateTurbidity(draft.turbidityRows);
  assert.equal(solids.tableHasInput, false);
  assert.equal(solids.issues.length, 0);
  assert.equal(solids.computedCount, 0);
  assert.equal(solids.meanConcentrationMgL, null);
  assert.equal(solids.rows[0].status, "empty");
  assert.equal(turbidity.tableHasInput, false);
  assert.equal(turbidity.issues.length, 0);
  assert.equal(turbidity.validCount, 0);
  assert.equal(turbidity.mean, null);
  assert.equal(turbidity.rows[0].status, "empty");
  assert.equal(hasDraftContent(draft), false);
});

test("blank row in a started solids table is missing, not zero", () => {
  const rows = [
    createSolidsRow({ before: "100", after: "105", volume: "100" }),
    createSolidsRow(),
  ];
  const evaluation = evaluateSolids(rows);
  assert.equal(evaluation.computedCount, 1);
  assert.equal(evaluation.missingCount, 1);
  assert.equal(evaluation.rows[1].status, "missing");
  assert.equal(evaluation.rows[1].concentrationMgL, null);
  assert.equal(evaluation.issues.length, 1);
  approx(evaluation.meanConcentrationMgL, 50, "mean with one missing row");
});

test("volume zero and non-numeric mass block calculation", () => {
  const zeroVolume = evaluateSolids([
    createSolidsRow({ before: "100", after: "105", volume: "0" }),
  ]);
  assert.equal(zeroVolume.invalidCount, 1);
  assert.equal(zeroVolume.rows[0].status, "invalid");
  assert.equal(zeroVolume.rows[0].concentrationMgL, null);
  assert.equal(zeroVolume.issues.length, 1);

  const badMass = evaluateSolids([
    createSolidsRow({ before: "abc", after: "105", volume: "100" }),
  ]);
  assert.equal(badMass.invalidCount, 1);
  assert.equal(badMass.rows[0].status, "invalid");
  assert.equal(badMass.rows[0].concentrationMgL, null);
  assert.match(badMass.issues[0].message, /不是有效数字/);
});

test("zero mass difference is valid and formats as 0.0", () => {
  const evaluation = evaluateSolids([
    createSolidsRow({ before: "0", after: "0", volume: "100" }),
  ]);
  assert.equal(evaluation.rows[0].status, "valid");
  approx(evaluation.rows[0].massDifferenceMg, 0, "zero mass difference");
  approx(evaluation.rows[0].concentrationMgL, 0, "zero concentration");
  assert.equal(formatQuantity(evaluation.rows[0].concentrationMgL), "0.0");
});

test("mass reversal is a retained negative result with review warning", () => {
  const evaluation = evaluateSolids([
    createSolidsRow({ before: "130", after: "125", volume: "100" }),
  ]);
  assert.equal(evaluation.rows[0].status, "review");
  assert.equal(evaluation.reviewCount, 1);
  assert.equal(evaluation.computedCount, 1);
  approx(evaluation.rows[0].concentrationMgL, -50, "negative concentration");
  assert.equal(evaluation.meanIncludesReview, true);
  assert.equal(evaluation.issues.length, 1);
  assert.equal(evaluation.issues[0].level, "warning");
  assert.equal(getSolidsChartPoints(evaluation).length, 1);
});

test("turbidity zero is valid and negative is invalid", () => {
  const zero = evaluateTurbidity([
    createTurbidityRow({ reading: "0", unit: "NTU" }),
    createTurbidityRow({ reading: "0", unit: "NTU" }),
  ]);
  assert.equal(zero.validCount, 2);
  approx(zero.mean, 0, "zero mean");
  assert.equal(formatQuantity(zero.mean), "0.0");

  const negative = evaluateTurbidity([createTurbidityRow({ reading: "-1", unit: "NTU" })]);
  assert.equal(negative.validCount, 0);
  assert.equal(negative.invalidCount, 1);
  assert.equal(negative.mean, null);
  assert.match(negative.issues[0].message, /负数/);
});

test("turbidity unit normalization and mixed-unit pause", () => {
  assert.equal(normalizeTurbidityUnit(" ntu "), "NTU");
  assert.equal(normalizeTurbidityUnit("Fnu"), "FNU");
  assert.equal(normalizeTurbidityUnit("NTU-equivalent"), "NTU-equivalent");

  const normalized = evaluateTurbidity([
    createTurbidityRow({ reading: "10.2", unit: " ntu " }),
    createTurbidityRow({ reading: "10.0", unit: "NTU" }),
  ]);
  assert.deepEqual(normalized.units, ["NTU"]);
  assert.equal(normalized.aggregationPaused, false);
  approx(normalized.mean, 10.1, "normalized unit mean");

  const mixed = evaluateTurbidity([
    createTurbidityRow({ reading: "10.2", unit: "NTU" }),
    createTurbidityRow({ reading: "10.0", unit: "FNU" }),
  ]);
  assert.equal(mixed.validCount, 2);
  assert.equal(mixed.aggregationPaused, true);
  assert.equal(mixed.mean, null);
  assert.deepEqual(mixed.units, ["NTU", "FNU"]);
  assert.equal(mixed.issues.length, 1);
  assert.equal(mixed.issues[0].level, "warning");
  assert.equal(getTurbidityChartPoints(mixed).length, 0);

  const missingUnit = evaluateTurbidity([createTurbidityRow({ reading: "10", unit: "" })]);
  assert.equal(missingUnit.invalidCount, 1);
  assert.equal(missingUnit.mean, null);
  assert.match(missingUnit.issues[0].message, /单位/);
});

test("turbidity blank row after input is missing, not zero", () => {
  const evaluation = evaluateTurbidity([
    createTurbidityRow({ reading: "10", unit: "NTU" }),
    createTurbidityRow({ reading: "", unit: "" }),
  ]);
  assert.equal(evaluation.validCount, 1);
  assert.equal(evaluation.missingCount, 1);
  assert.equal(evaluation.rows[1].status, "missing");
  assert.equal(evaluation.issues.length, 1);
  assert.match(evaluation.issues[0].message, /缺失/);
});

test("chart points exclude invalid readings and keep row labels", () => {
  const draft = createTeachingDraft();
  const solids = getSolidsChartPoints(evaluateSolids(draft.solidsRows));
  assert.equal(solids.length, 2);
  assert.deepEqual(
    solids.map((point) => point.xLabel),
    ["第 1 次", "第 2 次"],
  );
  assert.deepEqual(
    solids.map((point) => point.yLabel),
    ["50.0", "50.0"],
  );

  const turbidity = getTurbidityChartPoints(evaluateTurbidity(draft.turbidityRows));
  assert.equal(turbidity.length, 3);
  assert.deepEqual(
    turbidity.map((point) => point.yLabel),
    ["10.2", "10.0", "10.4"],
  );
});

test("numeric parsing preserves zero and distinguishes blank from invalid", () => {
  assert.deepEqual(parseNumericInput("   "), { kind: "blank" });
  assert.deepEqual(parseNumericInput("abc"), { kind: "invalid" });
  assert.deepEqual(parseNumericInput("0"), { kind: "value", value: 0 });
  assert.deepEqual(parseNumericInput("1e3"), { kind: "value", value: 1000 });
  assert.deepEqual(parseNumericInput("−5"), { kind: "value", value: -5 });
  assert.deepEqual(parseNumericInput("1 000"), { kind: "value", value: 1000 });
});

test("quantity formatting keeps lab precision readable", () => {
  assert.equal(formatQuantity(null), "—");
  assert.equal(formatQuantity(0), "0.0");
  assert.equal(formatQuantity(50), "50.0");
  assert.equal(formatQuantity(10.25, 2), "10.25");
  assert.equal(formatQuantity(10.256, 2), "10.26");
  assert.equal(formatQuantity(0.0005), "0.0005");
  assert.equal(formatQuantity(0.0001234), "0.000123");
  assert.equal(formatQuantity(-50), "-50.0");
  assert.equal(formatQuantity(1234.5), "1234.5");
  assert.equal(formatSavedTime("2026-11-22T10:30:00"), "11-22 10:30");
  assert.equal(formatSavedTime("not-a-date"), "时间未知");
});

test("common fields are required for summary export only", () => {
  const draft = createTeachingDraft();
  assert.equal(evaluateCommon(draft).length, 0);
  assert.equal(evaluateCommon({ sampleId: "", measuredAt: "" }).length, 2);
  assert.equal(evaluateCommon({ sampleId: "S-1", measuredAt: "" }).length, 1);
});

test("draft round-trips through storage serialization", () => {
  const draft = createTeachingDraft();
  draft.activeTab = "turbidity";
  draft.note = '含逗号,并含"引号"';
  const parsed = parseExperimentOneDraft(serializeExperimentOneDraft(draft));
  assert.ok(parsed);
  assert.equal(parsed.sampleId, draft.sampleId);
  assert.equal(parsed.activeTab, "turbidity");
  assert.equal(parsed.note, draft.note);
  assert.equal(parsed.solidsRows.length, 2);
  assert.equal(parsed.turbidityRows.length, 4);
  assert.equal(hasDraftContent(parsed), true);
});

test("invalid drafts are rejected and duplicate ids are repaired", () => {
  assert.equal(parseExperimentOneDraft(null), null);
  assert.equal(parseExperimentOneDraft("{bad json"), null);
  assert.equal(
    parseExperimentOneDraft(JSON.stringify({ ...createEmptyDraft(), version: 99 })),
    null,
  );

  const raw = JSON.stringify({
    ...createEmptyDraft(),
    solidsRows: [
      { id: "dup", before: "1", after: "2", massUnit: "mg", volume: "10" },
      { id: "dup", before: "3", after: "4", massUnit: "mg", volume: "10" },
    ],
    turbidityRows: [
      { id: "dup-t", reading: "1", unit: "NTU" },
      { id: "dup-t", reading: "2", unit: "NTU" },
    ],
  });
  const parsed = parseExperimentOneDraft(raw);
  assert.ok(parsed);
  assert.notEqual(parsed.solidsRows[0].id, parsed.solidsRows[1].id);
  assert.notEqual(parsed.turbidityRows[0].id, parsed.turbidityRows[1].id);
  assert.equal(parsed.sampleId, "");
  assert.equal(parsed.group, "");
});

test("draft row count and field lengths are bounded", () => {
  const raw = JSON.stringify({
    ...createEmptyDraft(),
    sampleId: "x".repeat(200),
    solidsRows: Array.from({ length: MAX_SOLIDS_ROWS + 5 }, (_, index) => ({
      before: String(index),
      after: String(index + 1),
      massUnit: "mg",
      volume: "100",
    })),
  });
  const parsed = parseExperimentOneDraft(raw);
  assert.ok(parsed);
  assert.equal(parsed.sampleId.length, MAX_SAMPLE_ID_LENGTH);
  assert.equal(parsed.solidsRows.length, MAX_SOLIDS_ROWS);
  assert.equal(parsed.turbidityRows.length, 1);
});

test("summary includes teaching values, checks and pending rules", () => {
  const draft = createTeachingDraft();
  const summary = buildSummaryMarkdown(
    draft,
    evaluateSolids(draft.solidsRows),
    evaluateTurbidity(draft.turbidityRows),
    new Date("2026-11-22T10:30:00"),
  );
  assert.match(summary, /# 实验一 废水悬浮固体及浊度/);
  assert.match(summary, /样品编号：教学水样-01/);
  assert.match(summary, /组均值：10\.2 NTU/);
  assert.match(summary, /有效读数：3 行；缺失：1 行；需修正：0 行/);
  assert.match(summary, /缺失：0 行；需修正：0 行；需复查：0 行/);
  assert.match(summary, /浓度均值：50\.0 mg\/L/);
  assert.match(summary, /待课程讲义确认/);
  assert.match(summary, /水样体积按 mL 录入/);
  assert.ok(!summary.includes("undefined"));
  assert.ok(!summary.includes("NaN"));
});

test("CSV exports include BOM, sample context, status and escaped quotes", () => {
  const draft = createTeachingDraft();
  const solids = evaluateSolids(draft.solidsRows);
  const turbidity = evaluateTurbidity(draft.turbidityRows);
  const solidsCsv = buildSolidsCsv(draft, solids);
  assert.ok(solidsCsv.startsWith("\uFEFF"));
  assert.equal(solidsCsv.split("\r\n").filter(Boolean).length, 3);
  assert.match(solidsCsv, /教学水样-01/);
  assert.match(solidsCsv, /50\.0/);
  assert.match(solidsCsv, /有效/);

  const turbidityCsv = buildTurbidityCsv(draft, turbidity);
  assert.ok(turbidityCsv.startsWith("\uFEFF"));
  assert.match(turbidityCsv, /缺失/);
  assert.match(turbidityCsv, /10\.2/);
  assert.match(turbidityCsv, /汇总/);

  draft.sampleId = 'A,"B"';
  const quoted = buildSolidsCsv(draft, solids);
  assert.match(quoted, /"A,""B"""/);
});

test("storage helpers fail safely outside a browser", () => {
  assert.throws(() => saveExperimentOneDraft(createEmptyDraft()), /不支持本地草稿存储/);
  assert.doesNotThrow(() => clearExperimentOneDraft());
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  process.exitCode = 1;
}