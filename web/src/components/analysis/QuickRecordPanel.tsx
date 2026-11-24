import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ImagePlus,
  Info,
  PencilLine,
  Plus,
  Table2,
  Trash2,
} from "lucide-react";

import {
  parseNumericValue,
  profileColumns,
  suggestConfig,
  type AnalysisConfig,
  type ParsedDataset,
} from "../../lib/analysis";
import { PhotoRecord } from "./PhotoRecord";

type QuickTab = "manual" | "photo";
type ManualColumn = { id: string; name: string };
type ManualRow = { id: string; cells: Record<string, string> };

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

const SAMPLE_COLUMN = "sample-column";
const VALUE_COLUMN = "value-column";
const UNIT_COLUMN = "unit-column";

const defaultColumns: ManualColumn[] = [
  { id: SAMPLE_COLUMN, name: "样本或组别" },
  { id: VALUE_COLUMN, name: "测量值" },
  { id: UNIT_COLUMN, name: "单位" },
];

function createRows(count = 3): ManualRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: nextId("row"),
    cells: {
      [SAMPLE_COLUMN]: `样本 ${index + 1}`,
      [VALUE_COLUMN]: "",
      [UNIT_COLUMN]: "",
    },
  }));
}

function uniqueHeaders(columns: ManualColumn[]) {
  const seen = new Map<string, number>();
  return columns.map((column, index) => {
    const base = column.name.trim() || `列 ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}（${count}）`;
  });
}

function makeDataset(
  columns: ManualColumn[],
  rows: ManualRow[],
  recordLabel?: string,
): { dataset: ParsedDataset; config: AnalysisConfig; units: string[] } {
  const headers = uniqueHeaders(columns);
  const label = recordLabel?.trim().slice(0, 80);
  const dataset: ParsedDataset = {
    fileName: label ? `随手记录 · ${label}` : "随手记录 · 手填数据",
    headers,
    rows: rows.map((row) => columns.map((column) => (row.cells[column.id] ?? "").trim())),
    delimiter: ",",
    truncated: false,
    warnings: [],
  };
  const profiles = profileColumns(dataset);
  const config = suggestConfig(dataset, profiles);
  const unitColumn = columns.find((column) => /单位|unit/i.test(column.name));
  const unitIndex = unitColumn ? columns.findIndex((column) => column.id === unitColumn.id) : -1;
  const units =
    unitIndex >= 0
      ? [...new Set(dataset.rows.map((row) => row[unitIndex]?.trim()).filter(Boolean))]
      : [];
  if (units.length === 1) config.yUnit = units[0];
  if (units.length > 1) {
    dataset.warnings.push(`单位列包含多个值：${units.join("、")}。请在图表设置中核对 Y 轴单位。`);
  }
  return { dataset, config, units };
}

function ManualEntry({
  onAnalyze,
  recordLabel,
}: {
  onAnalyze: (dataset: ParsedDataset, config: AnalysisConfig) => void;
  recordLabel?: string;
}) {
  const [columns, setColumns] = useState<ManualColumn[]>(defaultColumns);
  const [rows, setRows] = useState<ManualRow[]>(() => createRows());
  const [error, setError] = useState("");

  const unitColumn = columns.find((column) => /单位|unit/i.test(column.name));
  const units = unitColumn
    ? [
        ...new Set(
          rows
            .map((row) => (row.cells[unitColumn.id] ?? "").trim())
            .filter((value) => value !== ""),
        ),
      ]
    : [];

  function updateColumn(columnId: string, name: string) {
    setColumns((current) =>
      current.map((column) => (column.id === columnId ? { ...column, name } : column)),
    );
    if (error) setError("");
  }

  function addColumn() {
    const customCount = Math.max(0, columns.length - 3) + 1;
    const id = nextId("column");
    setColumns((current) => [...current, { id, name: `自定义列 ${customCount}` }]);
    setRows((current) =>
      current.map((row) => ({ ...row, cells: { ...row.cells, [id]: "" } })),
    );
    if (error) setError("");
  }

  function removeColumn(columnId: string) {
    if (columns.length <= 2) {
      setError("至少保留两列，才能生成图表。");
      return;
    }
    setColumns((current) => current.filter((column) => column.id !== columnId));
    setRows((current) =>
      current.map((row) => {
        const nextCells = { ...row.cells };
        delete nextCells[columnId];
        return { ...row, cells: nextCells };
      }),
    );
    if (error) setError("");
  }

  function addRow() {
    const nextRow: ManualRow = {
      id: nextId("row"),
      cells: Object.fromEntries(columns.map((column) => [column.id, ""])),
    };
    nextRow.cells[columns[0]?.id ?? SAMPLE_COLUMN] = `样本 ${rows.length + 1}`;
    setRows((current) => [...current, nextRow]);
    if (error) setError("");
  }

  function removeRow(rowId: string) {
    if (rows.length <= 1) {
      setError("至少保留一行数据。");
      return;
    }
    setRows((current) => current.filter((row) => row.id !== rowId));
    if (error) setError("");
  }

  function updateCell(rowId: string, columnId: string, value: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId ? { ...row, cells: { ...row.cells, [columnId]: value } } : row,
      ),
    );
    if (error) setError("");
  }

  function handleAnalyze() {
    const hasContent = rows.some((row) =>
      columns.some((column) => (row.cells[column.id] ?? "").trim() !== ""),
    );
    if (!hasContent) {
      setError("请至少填写一组读数。");
      return;
    }
    const hasNumber = rows.some((row) =>
      columns.some((column) => parseNumericValue(row.cells[column.id] ?? "") !== null),
    );
    if (!hasNumber) {
      setError("还没有检测到数值。请在「测量值」或自定义列中填写至少一个数字。");
      return;
    }
    const { dataset, config } = makeDataset(columns, rows, recordLabel);
    onAnalyze(dataset, config);
  }

  return (
    <div className="manual-entry">
      <div className="manual-entry__meta">
        <span>{rows.length} 行</span>
        <span>{columns.length} 列</span>
        {units.length === 1 && <span>单位：{units[0]}</span>}
        {units.length > 1 && (
          <span className="manual-entry__unit-warning">
            <AlertTriangle size={11} strokeWidth={1.5} aria-hidden="true" />
            单位不一致：{units.join("、")}
          </span>
        )}
      </div>

      <div className="manual-table-wrap">
        <table
          className="manual-table"
          style={{ minWidth: `${columns.length * 94 + 34}px` }}
        >
          <caption className="sr-only">手填实验数据表格</caption>
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={column.id} scope="col">
                  <div className="manual-table__header-cell">
                    <input
                      value={column.name}
                      maxLength={40}
                      aria-label={`第 ${index + 1} 列名称`}
                      onChange={(event) => updateColumn(column.id, event.target.value)}
                      className="manual-table__header-input"
                    />
                    {columns.length > 2 && (
                      <button
                        type="button"
                        className="manual-table__icon-button"
                        aria-label={`删除第 ${index + 1} 列`}
                        title="删除这一列"
                        onClick={() => removeColumn(column.id)}
                      >
                        <Trash2 size={12} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th scope="col" className="manual-table__row-actions">
                <span className="sr-only">行操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id}>
                {columns.map((column, columnIndex) => {
                  const isFirst = columnIndex === 0;
                  const isUnit = /单位|unit/i.test(column.name);
                  return (
                    <td key={column.id}>
                      <input
                        value={row.cells[column.id] ?? ""}
                        aria-label={`第 ${rowIndex + 1} 行，${column.name || `第 ${columnIndex + 1} 列`}`}
                        inputMode={isFirst || isUnit ? "text" : "decimal"}
                        autoComplete="off"
                        placeholder={
                          isFirst ? `样本 ${rowIndex + 1}` : isUnit ? "如 mg/L" : "如 12.4"
                        }
                        onChange={(event) =>
                          updateCell(row.id, column.id, event.target.value)
                        }
                        className="manual-table__cell-input"
                      />
                    </td>
                  );
                })}
                <td className="manual-table__row-actions">
                  <button
                    type="button"
                    className="manual-table__icon-button"
                    aria-label={`删除第 ${rowIndex + 1} 行`}
                    title="删除这一行"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length <= 1}
                  >
                    <Trash2 size={12} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="manual-entry__footer">
        <div className="manual-entry__edit-actions">
          <button type="button" className="button button--secondary button--small" onClick={addRow}>
            <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
            添加行
          </button>
          <button type="button" className="button button--quiet button--small" onClick={addColumn}>
            <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
            添加列
          </button>
        </div>
        <button type="button" className="button button--primary" onClick={handleAnalyze}>
          <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
          生成图表并检查质量
        </button>
      </div>

      {error && (
        <p role="alert" className="quick-inline-message quick-inline-message--error">
          <AlertTriangle size={13} strokeWidth={1.5} aria-hidden="true" />
          {error}
        </p>
      )}

      <p className="manual-entry__note">
        <Info size={12} strokeWidth={1.5} aria-hidden="true" />
        空单元格会按缺失值保留，不会被自动填成 0。表头可以直接修改，也可以添加自定义列。
      </p>
    </div>
  );
}

export function QuickRecordPanel({
  onAnalyze,
  recordLabel,
}: {
  onAnalyze: (dataset: ParsedDataset, config: AnalysisConfig) => void;
  recordLabel?: string;
}) {
  const [tab, setTab] = useState<QuickTab>("manual");

  return (
    <section className="quick-record" aria-labelledby="quick-record-title">
      <div className="quick-record__head">
        <div className="quick-record__intro">
          <p className="eyebrow">
            <PencilLine size={12} strokeWidth={1.5} aria-hidden="true" />
            Quick record
          </p>
          <h2 id="quick-record-title" className="quick-record__title">
            只有几组读数或一张图片？现在就能开始
          </h2>
          <p className="quick-record__description">
            手填表格可以直接复用下方的图表与质量检查；图片文件先作为本地草稿留存，数值稍后补录。
          </p>
        </div>
        <div className="segmented quick-record__tabs" role="group" aria-label="随手记录方式">
          <button
            type="button"
            className="segmented__button"
            aria-pressed={tab === "manual"}
            onClick={() => setTab("manual")}
          >
            <Table2 size={13} strokeWidth={1.5} aria-hidden="true" />
            手填数据
          </button>
          <button
            type="button"
            className="segmented__button"
            aria-pressed={tab === "photo"}
            onClick={() => setTab("photo")}
          >
            <ImagePlus size={13} strokeWidth={1.5} aria-hidden="true" />
            图片文件
          </button>
        </div>
      </div>

      <div hidden={tab !== "manual"}>
        <ManualEntry onAnalyze={onAnalyze} recordLabel={recordLabel} />
      </div>
      <div hidden={tab !== "photo"}>
        <PhotoRecord onSwitchToManual={() => setTab("manual")} />
      </div>
    </section>
  );
}