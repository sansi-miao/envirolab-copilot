import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  bod5PublicStandard,
  calculateBod5Standard,
  calculateCodStandard,
  codPublicStandard,
} from "../src/lib/coursePublicStandards.ts";
import {
  createEmptyBod5Draft,
  createEmptyCodDraft,
  evaluateBod5Draft,
  evaluateCodDraft,
} from "../src/lib/courseRawRecords.ts";

const catalog = JSON.parse(
  readFileSync(new URL("../src/data/catalog.json", import.meta.url), "utf8"),
);

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

function closeTo(actual, expected, tolerance = 1e-9) {
  assert.notEqual(actual, null, "expected a number, got null");
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, got ${actual}`,
  );
}

const codExample = {
  fasConcentration: 0.1,
  blankTitrationMl: 24.5,
  sampleTitrationMl: 20.0,
  refluxSampleVolumeMl: 10.0,
  dilutionFactor: 1,
};

const bodUndiluted = {
  sampleBefore: 8.0,
  sampleAfter: 3.0,
};

const bodSeeded = {
  ...bodUndiluted,
  blankBefore: 8.5,
  blankAfter: 8.0,
};

const bodDiluted = {
  ...bodSeeded,
  f1: 0.8,
  f2: 0.2,
};

console.log("Public COD/BOD5 standard reference tests");

test("COD standard example computes 360 mg/L with no issues", () => {
  const result = calculateCodStandard(codExample);
  closeTo(result.value, 360);
  assert.equal(result.issues.length, 0);
});

test("COD dilution factor applies after the sample-volume term", () => {
  const result = calculateCodStandard({ ...codExample, dilutionFactor: 2 });
  closeTo(result.value, 720);
  assert.ok(result.issues.some((issue) => issue.level === "warning" && /700 mg\/L/.test(issue.message)));
});

test("COD rejects non-positive concentration, sample volume and dilution factor", () => {
  const concentration = calculateCodStandard({ ...codExample, fasConcentration: 0 });
  assert.equal(concentration.value, null);
  assert.ok(concentration.issues.some((issue) => issue.level === "error"));

  const sampleVolume = calculateCodStandard({ ...codExample, refluxSampleVolumeMl: 0 });
  assert.equal(sampleVolume.value, null);
  assert.ok(sampleVolume.issues.some((issue) => issue.level === "error"));

  const dilution = calculateCodStandard({ ...codExample, dilutionFactor: 0 });
  assert.equal(dilution.value, null);
  assert.ok(dilution.issues.some((issue) => issue.level === "error"));
});

test("COD zero titration difference stays zero rather than becoming empty", () => {
  const result = calculateCodStandard({ ...codExample, sampleTitrationMl: 24.5 });
  closeTo(result.value, 0);
  assert.equal(result.issues.length, 0);
});

test("COD negative difference returns a negative value and a review warning", () => {
  const result = calculateCodStandard({ ...codExample, sampleTitrationMl: 26.0 });
  closeTo(result.value, -120);
  assert.ok(result.issues.some((issue) => issue.level === "warning" && /负值/.test(issue.message)));
});

test("BOD5 formula (3) computes 5.0 mg/L from the sample depletion", () => {
  const result = calculateBod5Standard("undiluted", bodUndiluted);
  closeTo(result.value, 5);
  assert.equal(result.issues.length, 0);
});

test("BOD5 formula (4) subtracts the seeded blank depletion", () => {
  const result = calculateBod5Standard("undilutedSeeded", bodSeeded);
  closeTo(result.value, 4.5);
  assert.equal(result.issues.length, 0);
});

test("BOD5 formula (5) multiplies f1 and divides by f2", () => {
  const result = calculateBod5Standard("diluted", bodDiluted);
  closeTo(result.value, 23);
  assert.equal(result.issues.length, 0);
});

test("BOD5 diluted mode requires both f1 and f2", () => {
  const noF1 = calculateBod5Standard("diluted", { ...bodDiluted, f1: undefined });
  assert.equal(noF1.value, null);
  assert.ok(noF1.issues.some((issue) => issue.level === "error" && /f₁/.test(issue.message)));

  const noF2 = calculateBod5Standard("diluted", { ...bodDiluted, f2: undefined });
  assert.equal(noF2.value, null);
  assert.ok(noF2.issues.some((issue) => issue.level === "error" && /f₂/.test(issue.message)));
});

test("BOD5 rejects out-of-range f1 and f2", () => {
  const highF1 = calculateBod5Standard("diluted", { ...bodDiluted, f1: 1.2 });
  assert.equal(highF1.value, null);

  const zeroF2 = calculateBod5Standard("diluted", { ...bodDiluted, f2: 0 });
  assert.equal(zeroF2.value, null);

  const highF2 = calculateBod5Standard("diluted", { ...bodDiluted, f2: 1.2 });
  assert.equal(highF2.value, null);
});

test("BOD5 warns when the undiluted result exceeds 6 mg/L", () => {
  const result = calculateBod5Standard("undiluted", { sampleBefore: 9.0, sampleAfter: 1.0 });
  closeTo(result.value, 8);
  assert.ok(
    result.issues.some((issue) => issue.level === "warning" && /6 mg\/L/.test(issue.message)),
  );
});

test("BOD5 does not coerce a negative depletion to zero", () => {
  const result = calculateBod5Standard("undiluted", { sampleBefore: 3.0, sampleAfter: 8.0 });
  closeTo(result.value, -5);
  assert.ok(result.issues.some((issue) => issue.level === "warning" && /负值/.test(issue.message)));
});

test("BOD5 seeded and diluted modes require blank dissolved oxygen", () => {
  const result = calculateBod5Standard("undilutedSeeded", bodUndiluted);
  assert.equal(result.value, null);
  assert.ok(result.issues.some((issue) => issue.level === "error" && /空白/.test(issue.message)));
});

test("BOD5 flags a negative blank depletion for review", () => {
  const result = calculateBod5Standard("undilutedSeeded", {
    ...bodUndiluted,
    blankBefore: 8.0,
    blankAfter: 8.5,
  });
  closeTo(result.value, 5.5);
  assert.ok(
    result.issues.some(
      (issue) => issue.level === "warning" && /空白耗氧量/.test(issue.message),
    ),
  );
});

test("COD public metadata points to the official page and PDF", () => {
  assert.equal(codPublicStandard.code, "HJ 828—2017");
  assert.equal(codPublicStandard.issuedAt, "2017-03-30");
  assert.equal(codPublicStandard.effectiveAt, "2017-05-01");
  const source = codPublicStandard.sources.find((item) => item.id === "mee-hj828-2017");
  assert.ok(source);
  assert.equal(
    source.pageUrl,
    "https://www.mee.gov.cn/ywgz/fgbz/bz/bzwb/jcffbz/201704/t20170410_409547.shtml",
  );
  assert.match(source.pdfUrl, /^https:\/\/www\.mee\.gov\.cn\/.+\.pdf$/);
});

test("BOD5 public metadata points to the official page and PDF", () => {
  assert.equal(bod5PublicStandard.code, "HJ 505—2009");
  assert.equal(bod5PublicStandard.issuedAt, "2009-10-20");
  assert.equal(bod5PublicStandard.effectiveAt, "2009-12-01");
  const source = bod5PublicStandard.sources.find((item) => item.id === "mee-hj505-2009");
  assert.ok(source);
  assert.equal(
    source.pageUrl,
    "https://www.mee.gov.cn/ywgz/fgbz/bz/bzwb/jcffbz/200911/t20091106_181277.shtml",
  );
  assert.match(source.pdfUrl, /^https:\/\/www\.mee\.gov\.cn\/.+\.pdf$/);
});

test("COD fields and formula include V2 and the dilution factor", () => {
  const symbols = codPublicStandard.fields.map((field) => field.symbol);
  assert.ok(symbols.includes("V₂"));
  assert.ok(symbols.includes("f"));
  assert.match(codPublicStandard.formulas[0].expression, /V₂/);
  assert.match(codPublicStandard.formulas[0].expression, /× f$/);
});

test("BOD5 exposes formulas (3), (4) and (5) exactly", () => {
  assert.deepEqual(
    bod5PublicStandard.formulas.map((formula) => formula.code),
    ["标准式 (3)", "标准式 (4)", "标准式 (5)"],
  );
  assert.deepEqual(
    bod5PublicStandard.formulas.map((formula) => formula.expression),
    ["ρ = ρ₁ − ρ₂", "ρ = (ρ₁ − ρ₂) − (ρ₃ − ρ₄)", "ρ = [(ρ₁ − ρ₂) − (ρ₃ − ρ₄) × f₁] ÷ f₂"],
  );
});

test("BOD5 dilution table matches HJ 505-2009 Table 2", () => {
  assert.deepEqual(bod5PublicStandard.dilutionTable, [
    { expected: "6–12", multiple: "2" },
    { expected: "10–30", multiple: "5" },
    { expected: "20–60", multiple: "10" },
    { expected: "40–120", multiple: "20" },
    { expected: "100–300", multiple: "50" },
    { expected: "200–600", multiple: "100" },
    { expected: "400–1200", multiple: "200" },
    { expected: "1000–3000", multiple: "500" },
    { expected: "2000–6000", multiple: "1000" },
  ]);
});

test("BOD5 quality-control criteria include blank limits and standard check", () => {
  const quality = bod5PublicStandard.qualityControl ?? [];
  assert.ok(quality.some((item) => item.label.includes("稀释空白") && item.value === "≤0.5 mg/L"));
  assert.ok(
    quality.some(
      (item) => item.label.includes("未稀释接种") && item.value === "≤1.5 mg/L",
    ),
  );
  assert.ok(
    quality.some(
      (item) => item.label.includes("葡萄糖-谷氨酸") && item.value === "180–230 mg/L",
    ),
  );
  assert.ok(quality.some((item) => item.label.includes("平行样")));
});

test("Teaching sources are public university or higher-education pages", () => {
  const teaching = codPublicStandard.sources.filter((source) => source.kind === "teaching");
  assert.equal(teaching.length, 2);
  assert.ok(teaching.some((source) => source.pageUrl.includes("clgc.xatu.edu.cn")));
  assert.ok(teaching.some((source) => source.pageUrl.includes("chinaooc.com.cn")));
  assert.ok(teaching.every((source) => source.pageUrl.startsWith("https://")));
});

test("All public examples are synthetic and match the calculation functions", () => {
  const codExamples = codPublicStandard.examples;
  assert.equal(codExamples.length, 1);
  closeTo(codExamples[0].resultValue, 360);
  assert.match(codExamples[0].note, /合成数据/);

  const bodExamples = bod5PublicStandard.examples;
  assert.equal(bodExamples.length, 3);
  assert.deepEqual(
    bodExamples.map((example) => Number(example.resultValue?.toFixed(1))),
    [5.0, 4.5, 23.0],
  );
  assert.ok(bodExamples.every((example) => /合成数据/.test(example.note)));
  assert.match(bod5PublicStandard.exampleNote, /不会写入课堂草稿/);
});

test("Catalog COD formula and source agree with the public standard", () => {
  const entry = catalog.experiments.find((item) => item.id === "water-cod-dichromate");
  assert.ok(entry);
  assert.equal(entry.version, 2);
  assert.equal(entry.formulas[0].expression, codPublicStandard.formulas[0].expression);
  assert.ok(entry.formulas[0].symbols.some((symbol) => symbol.startsWith("V₂")));
  assert.ok(entry.formulas[0].symbols.some((symbol) => symbol.startsWith("f：")));
  assert.equal(entry.papers[0].url, codPublicStandard.sources[0].pageUrl);
});

test("Catalog BOD5 exposes three standard formulas and the official source", () => {
  const entry = catalog.experiments.find((item) => item.id === "water-bod5-dilution-seeding");
  assert.ok(entry);
  assert.equal(entry.version, 2);
  assert.deepEqual(
    entry.formulas.map((formula) => formula.expression),
    bod5PublicStandard.formulas.map((formula) => formula.expression),
  );
  assert.equal(entry.papers[0].url, bod5PublicStandard.sources[0].pageUrl);
});

test("Classroom COD and BOD5 empty records remain empty, not zero", () => {
  assert.equal(evaluateCodDraft(createEmptyCodDraft()).state, "empty");
  assert.equal(evaluateBod5Draft(createEmptyBod5Draft()).state, "empty");
  assert.equal(evaluateBod5Draft(createEmptyBod5Draft()).first.readingValue, null);
});

test("Classroom notes explicitly keep the existing raw-record flow", () => {
  assert.match(codPublicStandard.classroomNote, /保持不变/);
  assert.match(codPublicStandard.classroomNote, /不自动/);
  assert.match(bod5PublicStandard.classroomNote, /保持不变/);
  assert.match(bod5PublicStandard.classroomNote, /不自动计算 BOD₅/);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);