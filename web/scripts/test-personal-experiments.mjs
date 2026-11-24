import assert from "node:assert/strict";

import { parseDataset } from "../src/lib/analysis.ts";
import {
  PERSONAL_EXPERIMENTS_STORAGE_KEY,
  MAX_PERSONAL_CELL_LENGTH,
  MAX_PERSONAL_EXPERIMENTS,
  MAX_PERSONAL_ROWS,
  applyPersonalImport,
  buildPersonalCsv,
  countFilledPersonalRows,
  createPersonalExperiment,
  deletePersonalExperiment,
  getPersonalExperiment,
  hasPersonalData,
  listPersonalExperiments,
  parsePersonalImport,
  personalPhotoDraftId,
  savePersonalExperiment,
} from "../src/lib/personalExperiments.ts";

let passed = 0;
const failures = [];
const values = new Map();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  writable: true,
  value: {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    get length() {
      return values.size;
    },
  },
});

function resetStorage() {
  values.clear();
}

function test(name, fn) {
  try {
    resetStorage();
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

function importedRecord(name = "导入实验") {
  const experiment = createPersonalExperiment(name);
  const preview = parsePersonalImport(
    "采样点\t温度\t备注\nA-01\t24.6\t\nA-02\t\t现场补记\n",
    "field.tsv",
  );
  return applyPersonalImport(experiment, preview);
}

test("实验名称为空时不允许新建", () => {
  assert.throws(() => createPersonalExperiment("   "), /请先填写实验名称/);
  assert.equal(listPersonalExperiments().length, 0);
});

test("填写名称后建立默认三列表格和本地记录", () => {
  const experiment = createPersonalExperiment("  宿舍温湿度观测  ");
  assert.equal(experiment.name, "宿舍温湿度观测");
  assert.equal(experiment.columns.length, 3);
  assert.deepEqual(
    experiment.columns.map((column) => column.name),
    ["测量项目", "读数", "备注"],
  );
  assert.equal(experiment.rows.length, 3);
  assert.equal(getPersonalExperiment(experiment.id)?.name, "宿舍温湿度观测");
  assert.equal(hasPersonalData(experiment), false);
});

test("两份个人实验各自独立保存和更新", () => {
  const first = createPersonalExperiment("实验甲");
  const second = createPersonalExperiment("实验乙");
  const updatedFirst = savePersonalExperiment({
    ...first,
    rows: first.rows.map((row, index) =>
      index === 0 ? { ...row, values: ["温度", "24.6", ""] } : row,
    ),
  });
  assert.equal(updatedFirst.id, first.id);
  assert.equal(getPersonalExperiment(first.id)?.rows[0].values[1], "24.6");
  assert.equal(getPersonalExperiment(second.id)?.rows[0].values[1], "");
  assert.equal(countFilledPersonalRows(getPersonalExperiment(first.id)), 1);
  assert.equal(countFilledPersonalRows(getPersonalExperiment(second.id)), 0);
});

test("刷新后可从本地存储恢复表格和照片元数据", () => {
  const experiment = createPersonalExperiment("照片记录");
  const photo = {
    draftId: personalPhotoDraftId(experiment.id),
    fileName: "现场.jpg",
    width: 1200,
    height: 900,
    addedAt: "2026-11-20T10:00:00.000Z",
  };
  savePersonalExperiment({ ...experiment, photo });
  const restored = getPersonalExperiment(experiment.id);
  assert.ok(restored);
  assert.deepEqual(restored.photo, photo);
  assert.equal(restored.name, "照片记录");
});

test("个人照片 draftId 稳定且满足 IndexedDB 键长度", () => {
  const experiment = createPersonalExperiment("照片键");
  const first = personalPhotoDraftId(experiment.id);
  assert.equal(first, personalPhotoDraftId(experiment.id));
  assert.equal(first.length <= 80, true);
  assert.match(first, /^personal-photo-pe-/);
});

test("列表按最近更新排序，删除只影响目标记录", () => {
  const first = createPersonalExperiment("较早记录");
  const second = createPersonalExperiment("较晚记录");
  const list = listPersonalExperiments();
  assert.equal(list[0].id, second.id);
  const before = Date.now();
  while (Date.now() === before) {
    // 等待系统时钟前进，确保保存写入新的 updatedAt。
  }
  savePersonalExperiment({
    ...first,
    name: "较早记录（更新）",
  });
  assert.equal(listPersonalExperiments()[0].id, first.id);
  deletePersonalExperiment(first.id);
  assert.equal(getPersonalExperiment(first.id), null);
  assert.equal(getPersonalExperiment(second.id)?.name, "较晚记录");
});

test("最多保存 30 份个人实验并在超限时提示", () => {
  for (let index = 0; index < MAX_PERSONAL_EXPERIMENTS; index += 1) {
    createPersonalExperiment(`记录 ${index + 1}`);
  }
  assert.throws(() => createPersonalExperiment("第 31 份"), /最多保存 30 份/);
});

test("损坏的本地存储不会阻止页面读取", () => {
  values.set(PERSONAL_EXPERIMENTS_STORAGE_KEY, "{broken json");
  assert.deepEqual(listPersonalExperiments(), []);
});

test("导入允许单列表格，现有数据分析仍要求两列", () => {
  const text = "温度\n24.6\n25.1";
  assert.throws(() => parseDataset(text, "one.csv"), /至少需要两列数据/);
  const preview = parsePersonalImport(text, "one.csv");
  assert.deepEqual(preview.headers, ["温度"]);
  assert.equal(preview.rows.length, 2);
  assert.deepEqual(preview.rows[0], ["24.6"]);
});

test("导入预览解析 TSV、保留空白单元格并显示分隔符", () => {
  const preview = parsePersonalImport(
    "采样点\t温度\t备注\nA-01\t24.6\t\nA-02\t\t现场补记\n",
    "field.tsv",
  );
  assert.deepEqual(preview.headers, ["采样点", "温度", "备注"]);
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.delimiter, "\t");
  assert.deepEqual(preview.rows[0], ["A-01", "24.6", ""]);
  assert.deepEqual(preview.rows[1], ["A-02", "", "现场补记"]);
  assert.equal(preview.warnings.length, 0);
});

test("导入失败给出可理解提示", () => {
  assert.throws(() => parsePersonalImport("   ", "empty.csv"), /请先选择/);
  assert.throws(
    () => parsePersonalImport("温度,湿度\n", "header-only.csv"),
    /只有表头，没有数据行/,
  );
  assert.throws(
    () => parsePersonalImport("温度\n", "header-only-one.csv"),
    /只有表头，没有数据行/,
  );
});

test("导入替换表格但保留名称和照片", () => {
  const experiment = createPersonalExperiment("保留名称");
  const photo = {
    draftId: personalPhotoDraftId(experiment.id),
    fileName: "讲义.jpg",
    width: 800,
    height: 600,
    addedAt: "2026-11-20T10:00:00.000Z",
  };
  const withPhoto = savePersonalExperiment({ ...experiment, photo });
  const preview = parsePersonalImport(
    "样品,吸光度\nS-1,0.123\nS-2,0.456\n",
    "absorbance.csv",
  );
  const imported = applyPersonalImport(withPhoto, preview);
  assert.equal(imported.name, "保留名称");
  assert.deepEqual(imported.photo, photo);
  assert.equal(imported.source, "import");
  assert.equal(imported.importedFileName, "absorbance.csv");
  assert.equal(imported.columns.length, 2);
  assert.equal(imported.rows.length, 2);
  assert.equal(imported.rows[1].values[1], "0.456");
});

test("导入列数和行数超限时截断并给出警告", () => {
  const header = Array.from({ length: 22 }, (_, index) => `列${index + 1}`).join(",");
  const data = Array.from({ length: MAX_PERSONAL_ROWS + 2 }, () =>
    Array.from({ length: 22 }, () => "1").join(","),
  ).join("\n");
  const preview = parsePersonalImport(`${header}\n${data}\n`, "wide.csv");
  assert.equal(preview.headers.length, 20);
  assert.equal(preview.rows.length, MAX_PERSONAL_ROWS);
  assert.equal(preview.rows[0].length, 20);
  assert.equal(preview.warnings.some((warning) => warning.includes("只导入前 20 列")), true);
  assert.equal(preview.warnings.some((warning) => warning.includes("只导入前 500 行")), true);
});

test("CSV 导出包含自定义列名和单位", () => {
  const experiment = createPersonalExperiment("单位导出");
  const withData = savePersonalExperiment({
    ...experiment,
    columns: [
      { id: "c1", name: "温度", unit: "°C" },
      { id: "c2", name: "相对湿度", unit: "%" },
      { id: "c3", name: "备注", unit: "" },
    ],
    rows: [
      { id: "r1", values: ["24.6", "52", ""] },
      { id: "r2", values: ["", "55", "补测"] },
    ],
    source: "manual",
  });
  const rows = parseCsv(buildPersonalCsv(withData));
  assert.deepEqual(rows[0], ["温度（°C）", "相对湿度（%）", "备注"]);
  assert.deepEqual(rows[1], ["24.6", "52", ""]);
  assert.deepEqual(rows[2], ["", "55", "补测"]);
  assert.equal(buildPersonalCsv(withData).startsWith("\uFEFF"), true);
});

test("CSV 导出跳过全空行但保留部分空白", () => {
  const experiment = createPersonalExperiment("空白导出");
  const withData = savePersonalExperiment({
    ...experiment,
    columns: [
      { id: "c1", name: "点位", unit: "" },
      { id: "c2", name: "读数", unit: "mg/L" },
      { id: "c3", name: "备注", unit: "" },
    ],
    rows: [
      { id: "r1", values: ["A", "0.12", ""] },
      { id: "r2", values: ["", "", ""] },
      { id: "r3", values: ["B", "", "缺读数"] },
    ],
  });
  const rows = parseCsv(buildPersonalCsv(withData));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], ["A", "0.12", ""]);
  assert.deepEqual(rows[2], ["B", "", "缺读数"]);
});

test("CSV 对逗号、引号和换行做转义", () => {
  const experiment = createPersonalExperiment("转义");
  const withData = savePersonalExperiment({
    ...experiment,
    columns: [
      { id: "c1", name: "点位,编号", unit: "" },
      { id: "c2", name: '备注"项', unit: "" },
    ],
    rows: [
      { id: "r1", values: ['A,1', '他说"好"'] },
      { id: "r2", values: ["B", "第一行\n第二行"] },
    ],
  });
  const rows = parseCsv(buildPersonalCsv(withData));
  assert.deepEqual(rows[0], ["点位,编号", '备注"项']);
  assert.deepEqual(rows[1], ["A,1", '他说"好"']);
  assert.deepEqual(rows[2], ["B", "第一行\n第二行"]);
});

test("导入数据导出时保持列与行完整", () => {
  const imported = importedRecord("导入后导出");
  const rows = parseCsv(buildPersonalCsv(imported));
  assert.deepEqual(rows[0], ["采样点", "温度", "备注"]);
  assert.deepEqual(rows[1], ["A-01", "24.6", ""]);
  assert.deepEqual(rows[2], ["A-02", "", "现场补记"]);
  assert.equal(rows.length, 3);
});

test("超长单元格保存时按上限截断", () => {
  const experiment = createPersonalExperiment("长度");
  const withLong = savePersonalExperiment({
    ...experiment,
    rows: [
      {
        id: "row-long",
        values: ["x".repeat(MAX_PERSONAL_CELL_LENGTH + 50), "", ""],
      },
    ],
  });
  assert.equal(withLong.rows[0].values[0].length, MAX_PERSONAL_CELL_LENGTH);
});