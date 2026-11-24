import assert from "node:assert/strict";

import {
  GENERIC_DRAFT_VERSION,
  buildGenericCsv,
  clearGenericDraft,
  createEmptyGenericDraft,
  createEmptyGenericRow,
  createGenericSyntheticDraft,
  evaluateGenericDraft,
  genericDraftKey,
  genericSessionConfigs,
  getGenericSessionConfig,
  hasGenericContent,
  loadGenericDraft,
  parseGenericDraft,
  saveGenericDraft,
  serializeGenericDraft,
} from "../src/lib/courseGenericRecords.ts";
import {
  MANUAL_DATA_LABEL,
  SYNTHETIC_DATA_LABEL,
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
  return rows;
}

function config(sessionId) {
  const value = getGenericSessionConfig(sessionId);
  assert.ok(value, `missing config ${sessionId}`);
  return value;
}

function synthetic(sessionId) {
  return createGenericSyntheticDraft(config(sessionId));
}

test("第 2、4、8 课次提供共用配置", () => {
  assert.equal(genericSessionConfigs.length, 3);
  assert.deepEqual(
    genericSessionConfigs.map((item) => item.sessionId),
    ["2", "4", "8"],
  );
  assert.equal(config("2").order, 2);
  assert.equal(config("4").order, 4);
  assert.equal(config("8").order, 8);
  assert.equal(getGenericSessionConfig("3"), null);
});

test("空草稿不报缺失，也不把空白当作 0", () => {
  for (const sessionId of ["2", "4", "8"]) {
    const item = config(sessionId);
    const draft = createEmptyGenericDraft(item);
    const evaluation = evaluateGenericDraft(item, draft);
    assert.equal(evaluation.hasInput, false);
    assert.equal(evaluation.issues.length, 0);
    assert.equal(evaluation.state, "empty");
    assert.equal(evaluation.filledRequiredCount, 1);
    assert.equal(evaluation.startedRowCount, 0);
    assert.equal(hasGenericContent(draft), false);
    assert.equal(rawRecordStateLabels[evaluation.state], "未开始");
  }
});

test("三个合成样例都完整并可导出", () => {
  for (const sessionId of ["2", "4", "8"]) {
    const item = config(sessionId);
    const draft = createGenericSyntheticDraft(item);
    const evaluation = evaluateGenericDraft(item, draft);
    assert.equal(evaluation.hasInput, true);
    assert.equal(evaluation.issues.length, 0, `${sessionId}: ${JSON.stringify(evaluation.issues)}`);
    assert.equal(evaluation.state, "complete");
    assert.equal(evaluation.complete, true);
    assert.equal(evaluation.startedRowCount, item.syntheticRows.length);
    assert.equal(evaluation.completeRowCount, item.syntheticRows.length);
    assert.equal(draft.isTeachingSample, true);
    assert.equal(draft.sessionId, sessionId);
  }
});

test("第 8 课次合成样例包含同一测点的两个测量项目", () => {
  const item = config("8");
  const draft = synthetic("8");
  assert.equal(draft.rows.length, 2);
  assert.equal(new Set(draft.rows.map((row) => row.sampleId)).size, 1);
  assert.deepEqual(
    draft.rows.map((row) => row.measurement),
    ["空气温度", "相对湿度"],
  );
});

test("已填测量行缺少编号、项目、读数或单位时报错", () => {
  const item = config("2");
  const draft = createEmptyGenericDraft(item);
  draft.recordNo = "R-1";
  draft.rows = [
    {
      ...createEmptyGenericRow(),
      sampleId: "",
      measurement: "",
      reading: "",
      unit: "",
      note: "观察",
    },
  ];
  const evaluation = evaluateGenericDraft(item, draft);
  assert.equal(evaluation.state, "partial");
  assert.equal(evaluation.issues.length >= 4, true);
  assert.equal(evaluation.rowIssues[draft.rows[0].id].length >= 4, true);
  assert.equal(evaluation.completeRowCount, 0);
});

test("空白读数保持未齐全而不是伪装成 0 读数", () => {
  const item = config("4");
  const draft = synthetic("4");
  const template = { ...draft.rows[0] };

  draft.rows = [{ ...template, reading: "" }];
  let evaluation = evaluateGenericDraft(item, draft);
  assert.equal(evaluation.state, "partial");
  assert.equal(evaluation.hasInput, true);
  assert.equal(evaluation.issues.some((issue) => issue.field.endsWith(":reading")), true);
  assert.equal(evaluation.complete, false);

  draft.rows = [{ ...template, reading: "0" }];
  evaluation = evaluateGenericDraft(item, draft);
  assert.equal(evaluation.state, "complete");
  assert.equal(evaluation.issues.length, 0);
});

test("甲醛和挥发酚拒绝负读数，舒适度允许 PMV 负值", () => {
  for (const sessionId of ["2", "4"]) {
    const item = config(sessionId);
    const draft = synthetic(sessionId);
    draft.rows = [{ ...draft.rows[0], reading: "-0.01" }];
    const evaluation = evaluateGenericDraft(item, draft);
    assert.equal(evaluation.state, "invalid");
    assert.match(evaluation.issues[0].message, /不能为负数/);
  }

  const item = config("8");
  const draft = synthetic("8");
  draft.rows = [
    {
      ...draft.rows[0],
      measurement: "PMV",
      reading: "-0.4",
      unit: "—",
    },
  ];
  const evaluation = evaluateGenericDraft(item, draft);
  assert.equal(evaluation.state, "complete");
  assert.equal(evaluation.issues.length, 0);
});

test("非法读数会标记为需修正", () => {
  const item = config("2");
  const draft = synthetic("2");
  draft.rows = [{ ...draft.rows[0], reading: "零点零六" }];
  const evaluation = evaluateGenericDraft(item, draft);
  assert.equal(evaluation.state, "invalid");
  assert.match(evaluation.issues[0].message, /不是有效数字/);
  assert.equal(evaluation.filledRequiredCount < evaluation.requiredFieldCount, true);
});

test("日期和记录编号缺失时保留空白并报告", () => {
  const item = config("2");
  const draft = synthetic("2");
  draft.measuredAt = "";
  draft.recordNo = "";
  const evaluation = evaluateGenericDraft(item, draft);
  assert.equal(evaluation.state, "partial");
  assert.equal(evaluation.issues.some((issue) => issue.field === "measuredAt"), true);
  assert.equal(evaluation.issues.some((issue) => issue.field === "recordNo"), true);
});

test("只填记录编号时导出空白测量行而不是伪造 0", () => {
  const item = config("2");
  const draft = createEmptyGenericDraft(item);
  draft.recordNo = "REC-ONLY";
  draft.rows = [createEmptyGenericRow()];
  const evaluation = evaluateGenericDraft(item, draft);
  const rows = parseCsv(buildGenericCsv(item, draft, evaluation));
  assert.equal(rows.length, 2);
  assert.equal(rows[1][2], "");
  assert.equal(rows[1][5], "");
  assert.equal(rows[1][6], "");
  assert.equal(rows[1][11], MANUAL_DATA_LABEL);
});

test("CSV 只包含已填测量行，空白单元保持空白", () => {
  const item = config("2");
  const draft = synthetic("2");
  draft.rows = [
    { ...draft.rows[0], note: "" },
    createEmptyGenericRow(),
    {
      ...createEmptyGenericRow(),
      sampleId: "AIR-F-02",
      measurement: "吸光度",
      reading: "",
      unit: "A（吸光度）",
      note: "缺读数，待补",
    },
  ];
  const evaluation = evaluateGenericDraft(item, draft);
  const rows = parseCsv(buildGenericCsv(item, draft, evaluation));
  assert.equal(rows.length, 3);
  assert.equal(rows[1][2], "SYN-AIR-02");
  assert.equal(rows[1][8], "");
  assert.equal(rows[2][2], "AIR-F-02");
  assert.equal(rows[2][5], "");
  assert.equal(rows[2][8], "缺读数，待补");
});

test("合成 CSV 带 BOM、数据标注和未计算说明", () => {
  const item = config("4");
  const draft = synthetic("4");
  const evaluation = evaluateGenericDraft(item, draft);
  const csv = buildGenericCsv(item, draft, evaluation);
  assert.equal(csv.startsWith("\uFEFF"), true);
  assert.equal(csv.includes(SYNTHETIC_DATA_LABEL), true);
  assert.equal(csv.includes("仅保存原始记录；未计算浓度、指数或正式结论，未判断结果是否合格。"), true);
  assert.equal(csv.includes("第 4 课次"), true);
  assert.equal(csv.includes("挥发酚（以苯酚计）质量浓度"), true);
  assert.equal(csv.includes("mg/L"), true);
});

test("手填记录使用手填数据标注", () => {
  const item = config("8");
  const draft = synthetic("8");
  draft.isTeachingSample = false;
  const evaluation = evaluateGenericDraft(item, draft);
  const csv = buildGenericCsv(item, draft, evaluation);
  assert.equal(csv.includes(MANUAL_DATA_LABEL), true);
  assert.equal(csv.includes(SYNTHETIC_DATA_LABEL), false);
});

test("草稿解析拒绝版本或课次不匹配的数据", () => {
  const item = config("2");
  const draft = synthetic("2");
  const serialized = serializeGenericDraft(draft);
  assert.equal(parseGenericDraft(serialized, item)?.sessionId, "2");
  assert.equal(parseGenericDraft(serialized, config("4")), null);
  assert.equal(parseGenericDraft("not-json", item), null);
  assert.equal(
    parseGenericDraft(JSON.stringify({ ...draft, version: 99 }), item),
    null,
  );
});

test("草稿解析会裁剪超长字段并补足空行", () => {
  const item = config("2");
  const parsed = parseGenericDraft(
    JSON.stringify({
      version: GENERIC_DRAFT_VERSION,
      sessionId: "2",
      measuredAt: "2026-11-20",
      recordNo: "R-1",
      rows: [{ id: "row-a", sampleId: "S", measurement: "M", reading: "1", unit: "A", note: "n".repeat(999) }],
      isTeachingSample: false,
      updatedAt: "2026-11-20T00:00:00.000Z",
    }),
    item,
  );
  assert.ok(parsed);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].note.length, 300);
  assert.equal(parsed.rows[0].id, "row-a");

  const emptyRows = parseGenericDraft(
    JSON.stringify({
      version: GENERIC_DRAFT_VERSION,
      sessionId: "2",
      rows: [],
      updatedAt: "2026-11-20T00:00:00.000Z",
    }),
    item,
  );
  assert.ok(emptyRows);
  assert.equal(emptyRows.rows.length, 1);
});

test("本地保存、读取和清空按课次隔离", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  const item2 = config("2");
  const item4 = config("4");
  const draft2 = synthetic("2");
  saveGenericDraft(item2, draft2);
  saveGenericDraft(item4, synthetic("4"));
  assert.equal(loadGenericDraft(item2)?.recordNo, draft2.recordNo);
  assert.equal(loadGenericDraft(item4)?.recordNo, "SYN-PHENOL-R01");
  assert.equal(genericDraftKey(item2), "envirolab.course.generic.v1.2");
  clearGenericDraft(item2);
  assert.equal(loadGenericDraft(item2), null);
  assert.equal(loadGenericDraft(item4)?.recordNo, "SYN-PHENOL-R01");
  delete globalThis.localStorage;
});

console.log(`\nGeneric course tests: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  process.exitCode = 1;
}