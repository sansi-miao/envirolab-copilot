export type Delimiter = "," | "\t" | ";";
export type ColumnKind = "numeric" | "text";
export type ChartType = "line" | "scatter" | "bar";
export type QualityLevel = "pass" | "note" | "warn" | "fail";

export interface ParsedDataset {
  fileName: string;
  headers: string[];
  rows: string[][];
  delimiter: Delimiter;
  truncated: boolean;
  warnings: string[];
}

export interface DatasetColumn {
  index: number;
  name: string;
  kind: ColumnKind;
  numericCount: number;
  missingCount: number;
  invalidCount: number;
}

export interface AnalysisConfig {
  xIndex: number;
  yIndex: number;
  chartType: ChartType;
  title: string;
  xUnit: string;
  yUnit: string;
}

export interface AnalysisPoint {
  x: number | string;
  y: number;
  row: number;
  xLabel: string;
  yLabel: string;
}

export interface AnalysisStats {
  n: number;
  mean: number;
  sd: number;
  sem: number | null;
  median: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  cv: number | null;
}

export interface LinearFit {
  slope: number;
  intercept: number;
  r2: number;
  r: number;
}

export interface QualityIssue {
  id: string;
  level: QualityLevel;
  title: string;
  detail: string;
}

export type VerdictTone = "ready" | "review" | "insufficient";

export interface QualityVerdict {
  tone: VerdictTone;
  title: string;
  detail: string;
}

export interface AnalysisResult {
  points: AnalysisPoint[];
  stats: AnalysisStats | null;
  fit: LinearFit | null;
  issues: QualityIssue[];
  verdict: QualityVerdict;
  numericX: boolean;
  totalRows: number;
  validPairs: number;
  duplicateRows: number;
  outlierCount: number;
}

export const MAX_ROWS = 20000;
export const MAX_FILE_BYTES = 12 * 1024 * 1024;

const MISSING_MARKERS = new Set([
  "",
  "-",
  "--",
  "—",
  "–",
  "na",
  "n/a",
  "null",
  "none",
  "nan",
  "缺测",
  "缺失",
]);

const DELIMITER_LABELS: Record<Delimiter, string> = {
  ",": "逗号",
  "\t": "制表符",
  ";": "分号",
};

function isMissing(value: string) {
  return MISSING_MARKERS.has(value.trim().toLowerCase());
}

export function parseNumericValue(value: string): number | null {
  if (isMissing(value)) return null;
  const normalized = value
    .trim()
    .replace(/[−–—]/g, "-")
    .replace(/[,，]/g, "")
    .replace(/\s+/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function countDelimiter(line: string, delimiter: string) {
  let count = 0;
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(text: string): Delimiter {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates: Delimiter[] = ["\t", ",", ";"];
  let best: Delimiter = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = countDelimiter(firstLine, candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : ",";
}

function parseRows(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.trim() === "") {
      field = "";
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      if (text[index + 1] !== "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function isNumericHeaderRow(row: string[]) {
  const cells = row.filter((cell) => cell.trim() !== "");
  if (cells.length === 0) return false;
  const numeric = cells.filter((cell) => parseNumericValue(cell) !== null).length;
  return numeric / cells.length > 0.5;
}

function normalizeHeaders(firstRow: string[], width: number) {
  const seen = new Map<string, number>();
  return Array.from({ length: width }, (_, index) => {
    const raw = (firstRow[index] ?? "").trim();
    const base = raw || `列 ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}（${count}）`;
  });
}

export interface ParseDatasetOptions {
  minColumns?: number;
}

export function parseDataset(
  text: string,
  fileName = "粘贴的数据",
  options: ParseDatasetOptions = {},
): ParsedDataset {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\u0000/g, "");
  if (!cleaned.trim()) {
    throw new Error("文件内容为空，请检查后重新上传。");
  }

  const delimiter = detectDelimiter(cleaned);
  const parsed = parseRows(cleaned, delimiter);
  const nonEmpty = parsed.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) {
    throw new Error("没有找到可解析的数据行。");
  }

  const warnings: string[] = [];
  const width = Math.max(...nonEmpty.map((row) => row.length));
  const minColumns = Math.max(1, Math.floor(options.minColumns ?? 2));
  if (width < minColumns) {
    throw new Error(
      minColumns === 1
        ? "没有找到可用的数据列，请检查表头和数据。"
        : "至少需要两列数据（例如 X 轴和 Y 轴）。",
    );
  }

  let headerRow = nonEmpty[0];
  let dataRows = nonEmpty.slice(1);
  if (isNumericHeaderRow(headerRow)) {
    warnings.push("首行看起来是数据而不是表头，已自动生成列名。");
    headerRow = [];
    dataRows = nonEmpty;
  }

  const headers = normalizeHeaders(headerRow, width);
  const maximum = MAX_ROWS;
  const truncated = dataRows.length > maximum;
  if (truncated) {
    warnings.push(`数据超过 ${maximum.toLocaleString("zh-CN")} 行，本次只分析前 ${maximum.toLocaleString("zh-CN")} 行。`);
    dataRows = dataRows.slice(0, maximum);
  }

  const inconsistent = dataRows.filter((row) => row.length !== width).length;
  if (inconsistent > 0) {
    warnings.push(`有 ${inconsistent} 行的列数与表头不一致，缺失单元格按空值处理。`);
  }

  const rows = dataRows.map((row) =>
    Array.from({ length: width }, (_, index) => (row[index] ?? "").trim()),
  );

  if (rows.length === 0) {
    throw new Error("只有表头，没有数据行。");
  }

  return {
    fileName,
    headers,
    rows,
    delimiter,
    truncated,
    warnings,
  };
}

export function profileColumns(dataset: ParsedDataset): DatasetColumn[] {
  return dataset.headers.map((name, index) => {
    let numericCount = 0;
    let missingCount = 0;
    let invalidCount = 0;

    for (const row of dataset.rows) {
      const cell = row[index] ?? "";
      if (isMissing(cell)) {
        missingCount += 1;
      } else if (parseNumericValue(cell) !== null) {
        numericCount += 1;
      } else {
        invalidCount += 1;
      }
    }

    const nonMissing = numericCount + invalidCount;
    const numericRatio = nonMissing > 0 ? numericCount / nonMissing : 0;
    return {
      index,
      name,
      kind: numericCount > 0 && numericRatio >= 0.8 ? "numeric" : "text",
      numericCount,
      missingCount,
      invalidCount,
    };
  });
}

function looksMonotonic(values: number[]) {
  let increasing = true;
  let decreasing = true;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] < values[index - 1]) increasing = false;
    if (values[index] > values[index - 1]) decreasing = false;
  }
  return increasing || decreasing;
}

export function suggestConfig(
  dataset: ParsedDataset,
  columns: DatasetColumn[],
): AnalysisConfig {
  const numeric = columns.filter((column) => column.kind === "numeric");
  let y = numeric.find((column) => column.index !== 0) ?? numeric[0] ?? columns[1] ?? columns[0];
  let x = columns.find((column) => column.index !== y.index) ?? columns[0];

  if (numeric.length === 1 && columns[0]?.index === numeric[0]?.index) {
    y = numeric[0];
    x = columns[1] ?? columns[0];
  }

  let chartType: ChartType = "line";
  if (x.kind !== "numeric") {
    chartType = "bar";
  } else {
    const numericX = dataset.rows
      .map((row) => parseNumericValue(row[x.index] ?? ""))
      .filter((value): value is number => value !== null);
    if (numericX.length < 3 || !looksMonotonic(numericX)) {
      chartType = "scatter";
    }
  }

  const baseTitle = y && x ? `${y.name} 随 ${x.name} 的变化` : "实验数据图表";
  return {
    xIndex: x?.index ?? 0,
    yIndex: y?.index ?? 1,
    chartType,
    title: baseTitle,
    xUnit: "",
    yUnit: "",
  };
}

export function normalizeConfig(
  config: AnalysisConfig,
  columns: DatasetColumn[],
): AnalysisConfig {
  const x = columns[config.xIndex] ?? columns[0];
  const numeric = columns.filter((column) => column.kind === "numeric");
  const y = numeric.find((column) => column.index === config.yIndex) ?? numeric[0];
  if (!x || !y) return config;

  let chartType = config.chartType;
  if (chartType === "scatter" && x.kind !== "numeric") chartType = "line";
  if (chartType !== "bar" && y.kind !== "numeric") chartType = "bar";

  return { ...config, xIndex: x.index, yIndex: y.index, chartType };
}

function sortedQuantile(sorted: number[], quantile: number) {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function computeStats(values: number[]): AnalysisStats | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / n;
  const variance =
    n > 1 ? sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const q1 = sortedQuantile(sorted, 0.25);
  const q3 = sortedQuantile(sorted, 0.75);
  return {
    n,
    mean,
    sd,
    sem: n > 1 ? sd / Math.sqrt(n) : null,
    median: sortedQuantile(sorted, 0.5),
    min: sorted[0],
    max: sorted[n - 1],
    q1,
    q3,
    cv: n > 1 && mean !== 0 ? (sd / Math.abs(mean)) * 100 : null,
  };
}

export function computeLinearFit(points: AnalysisPoint[]): LinearFit | null {
  const numeric = points.filter(
    (point): point is AnalysisPoint & { x: number } => typeof point.x === "number",
  );
  if (numeric.length < 3) return null;

  const meanX = numeric.reduce((sum, point) => sum + point.x, 0) / numeric.length;
  const meanY = numeric.reduce((sum, point) => sum + point.y, 0) / numeric.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;

  for (const point of numeric) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  if (sxx === 0 || syy === 0) return null;
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r = sxy / Math.sqrt(sxx * syy);
  return { slope, intercept, r, r2: r * r };
}

function formatIssueValue(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumSignificantDigits: 4 }).format(value);
}

export function analyzeDataset(
  dataset: ParsedDataset,
  columns: DatasetColumn[],
  config: AnalysisConfig,
): AnalysisResult {
  const xColumn = columns[config.xIndex] ?? columns[0];
  const yColumn = columns[config.yIndex] ?? columns[1] ?? columns[0];
  const numericX = xColumn.kind === "numeric" && config.chartType !== "bar";
  const issues: QualityIssue[] = [];

  let missingX = 0;
  let missingY = 0;
  let invalidX = 0;
  let invalidY = 0;
  let duplicateRows = 0;
  const points: AnalysisPoint[] = [];
  const seenRows = new Map<string, number>();

  dataset.rows.forEach((row, rowIndex) => {
    const xRaw = row[xColumn.index] ?? "";
    const yRaw = row[yColumn.index] ?? "";
    if (isMissing(xRaw)) missingX += 1;
    if (isMissing(yRaw)) missingY += 1;

    const yValue = parseNumericValue(yRaw);
    if (!isMissing(yRaw) && yValue === null) invalidY += 1;

    const key = row.join("\u0001");
    const seen = seenRows.get(key);
    if (seen !== undefined) {
      duplicateRows += 1;
    } else {
      seenRows.set(key, rowIndex);
    }

    if (yValue === null) return;

    if (numericX) {
      const xValue = parseNumericValue(xRaw);
      if (!isMissing(xRaw) && xValue === null) invalidX += 1;
      if (xValue === null) return;
      points.push({ x: xValue, y: yValue, row: rowIndex + 2, xLabel: xRaw, yLabel: yRaw });
    } else {
      if (isMissing(xRaw)) return;
      points.push({ x: xRaw, y: yValue, row: rowIndex + 2, xLabel: xRaw, yLabel: yRaw });
    }
  });

  const stats = computeStats(points.map((point) => point.y));
  const fit = numericX ? computeLinearFit(points) : null;

  const totalSelected = dataset.rows.length * 2;
  const missingSelected = missingX + missingY;
  const invalidSelected = invalidX + invalidY;

  if (missingSelected > 0) {
    const severe = missingSelected / totalSelected > 0.2;
    issues.push({
      id: "missing",
      level: severe ? "fail" : "warn",
      title: severe ? "缺失值比例过高" : "存在缺失值",
      detail: `X 列缺失 ${missingX} 个，Y 列缺失 ${missingY} 个。缺失行不会进入图表和统计，请确认是否应该补录。`,
    });
  } else {
    issues.push({
      id: "missing",
      level: "pass",
      title: "未发现缺失值",
      detail: "所选 X、Y 列均有完整记录。",
    });
  }

  if (invalidSelected > 0) {
    issues.push({
      id: "invalid",
      level: "warn",
      title: "存在无法解析的数值",
      detail: `X 列 ${invalidX} 个，Y 列 ${invalidY} 个非空单元格不是有效数字，已从图表中排除。请检查单位、全角字符或文字备注。`,
    });
  }

  if (points.length < 3) {
    issues.push({
      id: "sample",
      level: "fail",
      title: "有效数据点不足",
      detail: `当前只有 ${points.length} 个有效数据点，至少需要 3 个才能计算离散程度和趋势。`,
    });
  } else if (points.length < 6) {
    issues.push({
      id: "sample",
      level: "warn",
      title: "样本量偏少",
      detail: `当前有 ${points.length} 个有效数据点。描述性结论可以查看，但不足以支撑较强的统计判断。`,
    });
  } else {
    issues.push({
      id: "sample",
      level: "pass",
      title: "样本量满足基础分析",
      detail: `当前有 ${points.length} 个有效数据点。`,
    });
  }

  if (duplicateRows > 0) {
    issues.push({
      id: "duplicate",
      level: "warn",
      title: "存在完全重复的行",
      detail: `检测到 ${duplicateRows} 行与前面的记录完全相同。重复录入会放大该点在图表和统计中的权重，请核对原始数据。`,
    });
  } else {
    issues.push({
      id: "duplicate",
      level: "pass",
      title: "未发现完全重复的行",
      detail: "所有数据行内容均不重复。",
    });
  }

  let outlierCount = 0;
  const outlierLabels: string[] = [];
  if (stats && stats.n >= 4) {
    const iqr = stats.q3 - stats.q1;
    if (iqr > 0) {
      const lower = stats.q1 - 1.5 * iqr;
      const upper = stats.q3 + 1.5 * iqr;
      for (const point of points) {
        if (point.y < lower || point.y > upper) {
          outlierCount += 1;
          if (outlierLabels.length < 3) {
            outlierLabels.push(`第 ${point.row} 行（${formatIssueValue(point.y)}）`);
          }
        }
      }
    }
    if (outlierCount > 0) {
      issues.push({
        id: "outlier",
        level: "warn",
        title: "检测到可能的异常值",
        detail: `按 1.5×IQR 规则发现 ${outlierCount} 个偏离较大的值：${outlierLabels.join("、")}。先回查原始记录，不要为了“好看”直接删除。`,
      });
    } else {
      issues.push({
        id: "outlier",
        level: "pass",
        title: "未检测到明显异常值",
        detail: "按 1.5×IQR 规则，Y 值落在常规范围内。异常值检查不能代替对实验过程的复核。",
      });
    }
  } else {
    issues.push({
      id: "outlier",
      level: "note",
      title: "异常值检查未执行",
      detail: "有效数据点少于 4 个，四分位距不足以判断异常值。",
    });
  }

  if (stats && stats.n >= 2 && stats.min === stats.max) {
    issues.push({
      id: "variance",
      level: "fail",
      title: "Y 列没有变化",
      detail: "所选 Y 列的值完全相同，无法绘图或分析趋势。请确认是否选错列。",
    });
  }

  if (numericX && config.chartType === "line" && points.length >= 3) {
    const xValues = points.map((point) => point.x as number);
    if (!looksMonotonic(xValues)) {
      issues.push({
        id: "order",
        level: "note",
        title: "X 轴原始顺序不单调",
        detail: "折线图已按 X 值升序绘制，以避免连线来回折返。",
      });
    }
    const uniqueX = new Set(xValues);
    if (uniqueX.size < xValues.length) {
      issues.push({
        id: "replicates",
        level: "note",
        title: "存在重复 X 值",
        detail: "同一 X 值出现多次，可能来自重复测量。折线图会按原始顺序连接这些点，比较时请留意。",
      });
    }
  }

  const replicateGroups = new Map<string, number[]>();
  for (const point of points) {
    const key = `${typeof point.x}:${point.x}`;
    const values = replicateGroups.get(key);
    if (values) values.push(point.y);
    else replicateGroups.set(key, [point.y]);
  }
  let repeatedGroupCount = 0;
  let maxReplicateCv: number | null = null;
  let maxReplicateCvX = "";
  for (const [key, values] of replicateGroups) {
    if (values.length < 2) continue;
    const groupStats = computeStats(values);
    if (!groupStats || groupStats.mean === 0) continue;
    repeatedGroupCount += 1;
    const groupCv = (groupStats.sd / Math.abs(groupStats.mean)) * 100;
    if (maxReplicateCv === null || groupCv > maxReplicateCv) {
      maxReplicateCv = groupCv;
      maxReplicateCvX = key.slice(key.indexOf(":") + 1);
    }
  }

  if (maxReplicateCv !== null) {
    issues.push({
      id: "replicate-cv",
      level: maxReplicateCv > 30 ? "warn" : maxReplicateCv > 10 ? "note" : "pass",
      title: `重复测量变异系数最高 ${formatIssueValue(maxReplicateCv)}%`,
      detail: `在 ${repeatedGroupCount} 组重复 X 值中，组内变异系数最高出现在 X = ${maxReplicateCvX}。${
        maxReplicateCv > 30
          ? "组内波动较大，请检查平行样操作、仪器漂移或读数稳定性。"
          : "重复测量之间的波动处于可继续核对的范围。不同实验的合理范围不同，这个数值仅作参考。"
      }`,
    });
  } else {
    issues.push({
      id: "replicate-cv",
      level: "note",
      title: "无法评估重复测量变异",
      detail:
        "当前每个 X 值只有一次测量。整体 Y 值的变异系数包含自变量设计范围带来的变化，不能单独用于判断实验重复性。增加平行样或重复测量后才能评估。",
    });
  }

  if (fit) {
    issues.push({
      id: "fit",
      level: "note",
      title: `线性拟合 R² = ${formatIssueValue(fit.r2)}`,
      detail:
        fit.r2 >= 0.9
          ? "当前数据范围内的线性关系较强。拟合结果不能直接说明因果关系，也不能外推到测量范围之外。"
          : fit.r2 >= 0.7
            ? "存在中等程度的线性关系。先检查数据范围和异常值，再决定是否使用线性模型。"
            : "线性关系较弱。也许变量关系不是线性的，或数据中存在较大波动。不要强行用 R² 支撑结论。",
    });
  }

  for (const warning of dataset.warnings) {
    issues.push({
      id: `parse-${issues.length}`,
      level: "note",
      title: "解析提示",
      detail: warning,
    });
  }

  if (dataset.truncated) {
    issues.push({
      id: "truncated",
      level: "warn",
      title: "数据已截断",
      detail: `为保证浏览器性能，只分析了前 ${MAX_ROWS.toLocaleString("zh-CN")} 行。`,
    });
  }

  const hasFail = issues.some((issue) => issue.level === "fail");
  const hasWarn = issues.some((issue) => issue.level === "warn");
  const verdict: QualityVerdict = hasFail
    ? {
        tone: "insufficient",
        title: "数据不足，暂不能分析",
        detail: "先修正标红的问题，再重新上传或调整列选择。",
      }
    : hasWarn
      ? {
          tone: "review",
          title: "建议先核对数据",
          detail: "基础检查发现需要确认的问题。修正后再把结果用于报告或计算。",
        }
      : {
          tone: "ready",
          title: "可以继续分析",
          detail: "基础检查未发现阻塞问题。请结合实验设计、对照和重复测量解释结果。",
        };

  return {
    points,
    stats,
    fit,
    issues,
    verdict,
    numericX,
    totalRows: dataset.rows.length,
    validPairs: points.length,
    duplicateRows,
    outlierCount,
  };
}

export function formatNumber(value: number | null | undefined, digits = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute >= 100000 || absolute < 0.001)) {
    return value.toExponential(2);
  }
  return new Intl.NumberFormat("zh-CN", { maximumSignificantDigits: digits }).format(value);
}

export function formatSigned(value: number, digits = 3) {
  const formatted = formatNumber(Math.abs(value), digits);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

export function delimiterLabel(delimiter: Delimiter) {
  return DELIMITER_LABELS[delimiter];
}

export function buildSummaryMarkdown(
  dataset: ParsedDataset,
  columns: DatasetColumn[],
  config: AnalysisConfig,
  result: AnalysisResult,
  context?: { experimentName?: string },
) {
  const xColumn = columns[config.xIndex];
  const yColumn = columns[config.yIndex];
  const chartLabels: Record<ChartType, string> = {
    line: "折线图",
    scatter: "散点图",
    bar: "柱状图",
  };
  const stats = result.stats;
  const lines: string[] = [
    `# ${config.title || "实验数据分析摘要"}`,
    "",
    `- 生成时间：${new Intl.DateTimeFormat("zh-CN", { dateStyle: "long", timeStyle: "short" }).format(new Date())}`,
    `- 数据文件：${dataset.fileName}`,
    `- 数据规模：${dataset.rows.length} 行 × ${dataset.headers.length} 列`,
    `- 图表：${chartLabels[config.chartType]}，X = ${xColumn?.name ?? "—"}${config.xUnit ? `（${config.xUnit}）` : ""}，Y = ${yColumn?.name ?? "—"}${config.yUnit ? `（${config.yUnit}）` : ""}`,
    context?.experimentName ? `- 关联实验：${context.experimentName}` : "",
    "",
    "## 描述统计",
    "",
    "| 指标 | 数值 |",
    "| --- | --- |",
    `| 有效数据点 | ${stats?.n ?? 0} |`,
    `| 均值 | ${formatNumber(stats?.mean)} |`,
    `| 标准差 | ${formatNumber(stats?.sd)} |`,
    `| 标准误 | ${formatNumber(stats?.sem)} |`,
    `| 中位数 | ${formatNumber(stats?.median)} |`,
    `| 最小值 | ${formatNumber(stats?.min)} |`,
    `| 最大值 | ${formatNumber(stats?.max)} |`,
    `| Y 变异系数（含设计变化） | ${stats?.cv === null || stats?.cv === undefined ? "—" : `${formatNumber(stats.cv)}%`} |`,
    "",
  ];

  if (result.fit) {
    lines.push(
      "## 线性拟合",
      "",
      `y = ${formatNumber(result.fit.slope, 5)}x ${result.fit.intercept >= 0 ? "+" : "-"} ${formatNumber(Math.abs(result.fit.intercept), 5)}`,
      "",
      `- R² = ${formatNumber(result.fit.r2)}`,
      `- 相关系数 r = ${formatNumber(result.fit.r)}`,
      "",
    );
  }

  lines.push("## 数据质量初检", "", `结论：${result.verdict.title}。${result.verdict.detail}`, "");
  for (const issue of result.issues) {
    const prefix =
      issue.level === "fail" ? "[阻塞]" : issue.level === "warn" ? "[核对]" : issue.level === "pass" ? "[通过]" : "[说明]";
    lines.push(`- ${prefix} ${issue.title}：${issue.detail}`);
  }
  lines.push(
    "",
    "> 本摘要由浏览器内的基础数据检查生成，不替代统计检验、实验设计审查或导师判断。",
    "",
  );

  return lines.filter((line) => line !== null).join("\n");
}

export function downloadTextFile(fileName: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
