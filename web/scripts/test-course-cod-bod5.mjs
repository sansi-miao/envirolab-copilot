import assert from "node:assert/strict";

import {
  BOD5_DRAFT_KEY,
  BOD5_DRAFT_VERSION,
  COD_DRAFT_KEY,
  COD_DRAFT_VERSION,
  MAX_RAW_NOTE_LENGTH,
  SYNTHETIC_DATA_LABEL,
  buildBod5Csv,
  buildCodCsv,
  createBod5SyntheticDraft,
  createCodSyntheticDraft,
  createEmptyBod5Draft,
  createEmptyCodDraft,
  evaluateBod5Draft,
  evaluateCodDraft,
  hasBod5Content,
  hasCodContent,
  parseBod5Draft,
  parseCodDraft,
  rawRecordStateLabels,
} from "../src/lib/courseRawRecords.ts";

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

function completeCod(overrides = {}) {
  return {
    ...createEmptyCodDraft(),
    sampleId: "WW-COD-01",
    measuredAt: "2026-11-22",
    reading: "18.6",
    unit: "mg/L",
    recordNo: "REC-COD-01",
    ...overrides,
  };
}

function completeBod(overrides = {}) {
  return {
    ...createEmptyBod5Draft(),
    sampleId: "WW-BOD-01",
    first: { date: "2026-11-17", reading: "8.4", unit: "mg/L" },
    second: { date: "2026-11-22", reading: "3.1", unit: "mg/L" },
    ...overrides,
  };
}

console.log("COD and BOD5 raw-record logic tests");

test("COD empty draft has no errors and is not zero", () => {
  const draft = createEmptyCodDraft();
  const evaluation = evaluateCodDraft(draft);
  assert.equal(hasCodContent(draft), false);
  assert.equal(evaluation.hasInput, false);
  assert.equal(evaluation.state, "empty");
  assert.equal(evaluation.readingValue, null);
  assert.equal(evaluation.issues.length, 0);
  assert.equal(rawRecordStateLabels[evaluation.state], "未开始");
});

test("COD synthetic sample is explicitly flagged and complete", () => {
  const draft = createCodSyntheticDraft();
  const evaluation = evaluateCodDraft(draft);
  assert.equal(draft.isTeachingSample, true);
  assert.equal(hasCodContent(draft), true);
  assert.equal(evaluation.complete, true);
  assert.equal(evaluation.readingValue, 24.8);
  assert.equal(evaluation.filledRequiredCount, 5);
  assert.equal(evaluation.issues.length, 0);
});

test("COD reading without sample context reports missing fields", () => {
  const draft = { ...createEmptyCodDraft(), reading: "18.6" };
  const evaluation = evaluateCodDraft(draft);
  assert.equal(evaluation.hasInput, true);
  assert.equal(evaluation.complete, false);
  assert.ok(evaluation.issues.some((issue) => issue.field === "sampleId"));
  assert.ok(evaluation.issues.some((issue) => issue.field === "recordNo"));
  assert.ok(evaluation.issues.some((issue) => issue.field === "unit"));
});

test("COD zero is a valid raw reading, not an empty value", () => {
  const evaluation = evaluateCodDraft(completeCod({ reading: "0" }));
  assert.equal(evaluation.complete, true);
  assert.equal(evaluation.readingValue, 0);
  assert.equal(evaluation.issues.length, 0);
});

test("COD negative and non-numeric readings are invalid", () => {
  const negative = evaluateCodDraft(completeCod({ reading: "-1.2" }));
  assert.equal(negative.state, "invalid");
  assert.equal(negative.readingValue, null);
  assert.ok(negative.issues.some((issue) => /负数/.test(issue.message)));

  const invalid = evaluateCodDraft(completeCod({ reading: "abc" }));
  assert.equal(invalid.state, "invalid");
  assert.ok(invalid.issues.some((issue) => /有效数字/.test(issue.message)));
});

test("COD requires an instrument unit and raw record number", () => {
  const noUnit = evaluateCodDraft(completeCod({ unit: " " }));
  assert.equal(noUnit.complete, false);
  assert.ok(noUnit.issues.some((issue) => issue.field === "unit"));

  const noRecord = evaluateCodDraft(completeCod({ recordNo: "" }));
  assert.equal(noRecord.complete, false);
  assert.ok(noRecord.issues.some((issue) => issue.field === "recordNo"));
});

test("COD CSV keeps raw values, BOM and synthetic label without calculation", () => {
  const draft = createCodSyntheticDraft();
  const csv = buildCodCsv(draft, evaluateCodDraft(draft));
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /样品编号/);
  assert.match(csv, /原始读数/);
  assert.match(csv, /仪器单位/);
  assert.match(csv, /原始记录编号/);
  assert.match(csv, /SYN-COD-01/);
  assert.match(csv, new RegExp(SYNTHETIC_DATA_LABEL));
  assert.match(csv, /仅保存原始记录/);
  assert.match(csv, /未计算 COD 浓度/);
});

test("COD CSV leaves a missing reading blank instead of writing zero", () => {
  const draft = completeCod({ reading: "", unit: "mg/L" });
  const evaluation = evaluateCodDraft(draft);
  const csv = buildCodCsv(draft, evaluation);
  assert.equal(evaluation.readingValue, null);
  assert.match(csv, /WW-COD-01,2026-11-22,,mg\/L,/);
  assert.doesNotMatch(csv, /2026-11-22,0,mg\/L/);
});

test("COD parser rejects other versions and clamps stored text", () => {
  const draft = createCodSyntheticDraft();
  assert.ok(parseCodDraft(JSON.stringify(draft)));
  assert.equal(parseCodDraft(JSON.stringify({ ...draft, version: 999 })), null);
  assert.equal(parseCodDraft("not-json"), null);
  const parsed = parseCodDraft(
    JSON.stringify({ ...draft, note: "x".repeat(MAX_RAW_NOTE_LENGTH + 20) }),
  );
  assert.equal(parsed?.note.length, MAX_RAW_NOTE_LENGTH);
  assert.equal(parsed?.version, COD_DRAFT_VERSION);
});

test("COD and BOD5 use separate draft keys", () => {
  assert.notEqual(COD_DRAFT_KEY, BOD5_DRAFT_KEY);
  assert.equal(COD_DRAFT_VERSION, 1);
  assert.equal(BOD5_DRAFT_VERSION, 1);
});

test("BOD5 empty two-stage record is empty, not complete and not zero", () => {
  const draft = createEmptyBod5Draft();
  const evaluation = evaluateBod5Draft(draft);
  assert.equal(hasBod5Content(draft), false);
  assert.equal(evaluation.state, "empty");
  assert.equal(evaluation.first.state, "empty");
  assert.equal(evaluation.second.state, "empty");
  assert.equal(evaluation.first.readingValue, null);
  assert.equal(evaluation.second.readingValue, null);
  assert.equal(evaluation.issues.length, 0);
});

test("BOD5 first stage can be complete while second is still missing", () => {
  const draft = {
    ...createEmptyBod5Draft(),
    sampleId: "WW-BOD-01",
    first: { date: "2026-11-17", reading: "8.4", unit: "mg/L" },
  };
  const evaluation = evaluateBod5Draft(draft);
  assert.equal(evaluation.first.state, "complete");
  assert.equal(evaluation.second.state, "empty");
  assert.equal(evaluation.bothComplete, false);
  assert.equal(evaluation.recordComplete, false);
  assert.ok(evaluation.issues.some((issue) => issue.field === "continuation"));
  assert.equal(evaluation.second.readingValue, null);
});

test("BOD5 partial stage lists missing fields and not zero", () => {
  const draft = {
    ...createEmptyBod5Draft(),
    sampleId: "WW-BOD-01",
    first: { date: "2026-11-17", reading: "8.4", unit: "" },
  };
  const evaluation = evaluateBod5Draft(draft);
  assert.equal(evaluation.first.state, "partial");
  assert.deepEqual(evaluation.first.missingFields, ["仪器单位"]);
  assert.equal(evaluation.first.complete, false);
  assert.equal(evaluation.first.readingValue, 8.4);
});

test("BOD5 second-stage-only entry warns that first stage is incomplete", () => {
  const draft = {
    ...createEmptyBod5Draft(),
    sampleId: "WW-BOD-01",
    second: { date: "2026-11-22", reading: "3.1", unit: "mg/L" },
  };
  const evaluation = evaluateBod5Draft(draft);
  assert.equal(evaluation.second.state, "complete");
  assert.equal(evaluation.first.state, "empty");
  assert.ok(evaluation.issues.some((issue) => issue.field === "missing-first"));
});

test("BOD5 zero is valid and negative or non-numeric readings are invalid", () => {
  const draft = completeBod({
    second: { date: "2026-11-22", reading: "0", unit: "mg/L" },
  });
  const zero = evaluateBod5Draft(draft);
  assert.equal(zero.second.state, "complete");
  assert.equal(zero.second.readingValue, 0);

  const negative = evaluateBod5Draft(
    completeBod({ first: { date: "2026-11-17", reading: "-0.2", unit: "mg/L" } }),
  );
  assert.equal(negative.first.state, "invalid");
  assert.equal(negative.first.readingValue, null);

  const invalid = evaluateBod5Draft(
    completeBod({ second: { date: "2026-11-22", reading: "abc", unit: "mg/L" } }),
  );
  assert.equal(invalid.second.state, "invalid");
});

test("BOD5 complete two-stage record has no errors", () => {
  const draft = completeBod();
  const evaluation = evaluateBod5Draft(draft);
  assert.equal(evaluation.first.state, "complete");
  assert.equal(evaluation.second.state, "complete");
  assert.equal(evaluation.bothComplete, true);
  assert.equal(evaluation.recordComplete, true);
  assert.equal(evaluation.issues.length, 0);
});

test("BOD5 mixed stage units pause no calculation and add a review warning", () => {
  const draft = completeBod({
    second: { date: "2026-11-22", reading: "3.1", unit: "µmol/L" },
  });
  const evaluation = evaluateBod5Draft(draft);
  assert.equal(evaluation.bothComplete, true);
  assert.ok(evaluation.issues.some((issue) => issue.field === "units"));
  assert.equal(evaluation.first.readingValue, 8.4);
  assert.equal(evaluation.second.readingValue, 3.1);
});

test("BOD5 second date before first date adds a review warning", () => {
  const draft = completeBod({
    first: { date: "2026-11-22", reading: "8.4", unit: "mg/L" },
    second: { date: "2026-11-17", reading: "3.1", unit: "mg/L" },
  });
  const evaluation = evaluateBod5Draft(draft);
  assert.ok(evaluation.issues.some((issue) => issue.field === "date-order"));
});

test("BOD5 complete stages without sample id are not record-complete", () => {
  const draft = completeBod({ sampleId: "" });
  const evaluation = evaluateBod5Draft(draft);
  assert.equal(evaluation.bothComplete, true);
  assert.equal(evaluation.sampleComplete, false);
  assert.equal(evaluation.recordComplete, false);
  assert.ok(evaluation.issues.some((issue) => issue.field === "sampleId"));
});

test("BOD5 synthetic sample has both stages and a clear label", () => {
  const draft = createBod5SyntheticDraft();
  const evaluation = evaluateBod5Draft(draft);
  assert.equal(draft.isTeachingSample, true);
  assert.equal(evaluation.first.state, "complete");
  assert.equal(evaluation.second.state, "complete");
  assert.match(draft.note, /教学合成样例/);
});

test("BOD5 CSV contains both stages, statuses, missing fields and no calculation", () => {
  const draft = completeBod({
    first: { date: "2026-11-17", reading: "8.4", unit: "mg/L" },
    second: { date: "2026-11-22", reading: "", unit: "" },
  });
  const evaluation = evaluateBod5Draft(draft);
  const csv = buildBod5Csv(draft, evaluation);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /首段日期/);
  assert.match(csv, /次段原始读数/);
  assert.match(csv, /两段是否齐全/);
  assert.match(csv, /WW-BOD-01/);
  assert.match(csv, /2026-11-17/);
  assert.match(csv, /首段缺失字段/);
  assert.match(csv, /仪器单位/);
  assert.match(csv, /未计算 BOD₅/);
  assert.doesNotMatch(csv, /2026-11-22,0,/);
});

test("BOD5 synthetic CSV marks synthetic data explicitly", () => {
  const draft = createBod5SyntheticDraft();
  const csv = buildBod5Csv(draft, evaluateBod5Draft(draft));
  assert.match(csv, new RegExp(SYNTHETIC_DATA_LABEL));
  assert.match(csv, /已齐全/);
});

test("BOD5 parser rejects other versions and normalizes both stages", () => {
  const draft = createBod5SyntheticDraft();
  const parsed = parseBod5Draft(JSON.stringify(draft));
  assert.equal(parsed?.first.reading, "8.4");
  assert.equal(parsed?.second.unit, "mg/L");
  assert.equal(parsed?.version, BOD5_DRAFT_VERSION);
  assert.equal(parseBod5Draft(JSON.stringify({ ...draft, version: 2 })), null);
  assert.equal(parseBod5Draft("[]"), null);
  const fallback = parseBod5Draft(JSON.stringify({ version: 1, sampleId: "S" }));
  assert.deepEqual(fallback?.first, { date: "", reading: "", unit: "" });
});

test("BOD5 content detection includes second-stage-only input", () => {
  const draft = createEmptyBod5Draft();
  assert.equal(hasBod5Content(draft), false);
  draft.second.reading = "3.1";
  assert.equal(hasBod5Content(draft), true);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);