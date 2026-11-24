import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";

import { PageHeader } from "../components/ui/PageHeader";
import { downloadTextFile } from "../lib/analysis";
import { formatSessionDate } from "../lib/analysisSessions";
import { safeFileStem } from "../lib/courseCommon";
import {
  MAX_PERSONAL_CELL_LENGTH,
  MAX_PERSONAL_COLUMNS,
  MAX_PERSONAL_FILE_BYTES,
  MAX_PERSONAL_HEADER_LENGTH,
  MAX_PERSONAL_NAME_LENGTH,
  MAX_PERSONAL_ROWS,
  MAX_PERSONAL_UNIT_LENGTH,
  applyPersonalImport,
  buildPersonalCsv,
  countFilledPersonalRows,
  createPersonalColumn,
  createPersonalRow,
  getPersonalExperiment,
  hasPersonalData,
  parsePersonalImport,
  personalPhotoDraftId,
  savePersonalExperiment,
  type PersonalExperiment,
  type PersonalImportPreview,
} from "../lib/personalExperiments";
import {
  deletePhotoDraft,
  loadPhotoDraft,
  preparePhotoFile,
  savePhotoDraft,
} from "../lib/photoDrafts";

type SaveState = "saving" | "saved" | "error";

const DELIMITER_LABELS = {
  ",": "逗号",
  "\t": "制表符",
  ";": "分号",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function PersonalExperimentPage({ experimentId }: { experimentId: string }) {
  const [record, setRecord] = useState<PersonalExperiment | null>(() =>
    getPersonalExperiment(experimentId),
  );
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(() => record?.updatedAt ?? "");
  const [notice, setNotice] = useState("");
  const [removeColumnId, setRemoveColumnId] = useState("");
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<PersonalImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(Boolean(record?.photo));
  const [photoConfirm, setPhotoConfirm] = useState(false);
  const latestRef = useRef(record);
  const importInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    latestRef.current = record;
    if (!record) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      try {
        const saved = savePersonalExperiment(record);
        setLastSavedAt(saved.updatedAt);
        setSaveError("");
        setSaveState("saved");
      } catch (error) {
        setSaveError(errorMessage(error, "个人实验保存失败，请检查浏览器本地存储。"));
        setSaveState("error");
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [record]);

  useEffect(() => {
    const flush = () => {
      const current = latestRef.current;
      if (!current) return;
      try {
        savePersonalExperiment(current);
      } catch {
        // The visible save state already reports storage failures.
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", handleVisibility);
      flush();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!record?.photo) {
      setPhotoUrl("");
      setPhotoLoading(false);
      return;
    }
    setPhotoLoading(true);
    setPhotoError("");
    loadPhotoDraft(record.photo.draftId)
      .then((draft) => {
        if (cancelled) return;
        if (draft) {
          setPhotoUrl(draft.imageDataUrl);
        } else {
          setPhotoUrl("");
          setPhotoError("已关联的照片数据不在当前浏览器中，可以重新选择一张照片。");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPhotoError(errorMessage(error, "无法读取已关联的照片。"));
        }
      })
      .finally(() => {
        if (!cancelled) setPhotoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [record?.id, record?.photo?.draftId]);

  function changeRecord(updater: (current: PersonalExperiment) => PersonalExperiment) {
    setNotice("");
    setRecord((current) => (current ? updater(current) : current));
  }

  function updateName(value: string) {
    changeRecord((current) => ({ ...current, name: value }));
  }

  function updateColumn(columnId: string, field: "name" | "unit", value: string) {
    changeRecord((current) => ({
      ...current,
      columns: current.columns.map((column) =>
        column.id === columnId ? { ...column, [field]: value } : column,
      ),
    }));
  }

  function updateCell(rowId: string, columnIndex: number, value: string) {
    changeRecord((current) => ({
      ...current,
      rows: current.rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              values: row.values.map((cell, index) => (index === columnIndex ? value : cell)),
            }
          : row,
      ),
    }));
  }

  function addColumn() {
    if (!record) return;
    if (record.columns.length >= MAX_PERSONAL_COLUMNS) {
      setNotice(`最多保留 ${MAX_PERSONAL_COLUMNS} 列，请先导出或删除不再使用的列。`);
      return;
    }
    changeRecord((current) => ({
      ...current,
      columns: [...current.columns, createPersonalColumn(`列 ${current.columns.length + 1}`)],
      rows: current.rows.map((row) => ({ ...row, values: [...row.values, ""] })),
    }));
  }

  function removeColumn() {
    if (!record || !removeColumnId || record.columns.length <= 1) return;
    const index = record.columns.findIndex((column) => column.id === removeColumnId);
    if (index < 0) return;
    changeRecord((current) => ({
      ...current,
      columns: current.columns.filter((column) => column.id !== removeColumnId),
      rows: current.rows.map((row) => ({
        ...row,
        values: row.values.filter((_, valueIndex) => valueIndex !== index),
      })),
    }));
    setRemoveColumnId("");
  }

  function addRow() {
    if (!record) return;
    if (record.rows.length >= MAX_PERSONAL_ROWS) {
      setNotice(`最多保留 ${MAX_PERSONAL_ROWS} 行，请先导出后新建下一份记录。`);
      return;
    }
    changeRecord((current) => ({
      ...current,
      rows: [...current.rows, createPersonalRow(current.columns.length)],
    }));
  }

  function removeRow(rowId: string) {
    if (!record || record.rows.length <= 1) return;
    changeRecord((current) => ({
      ...current,
      rows: current.rows.filter((row) => row.id !== rowId),
    }));
  }

  function previewImport(text: string, fileName: string) {
    setImportBusy(true);
    setImportError("");
    setImportPreview(null);
    try {
      setImportPreview(parsePersonalImport(text, fileName));
    } catch (error) {
      setImportError(errorMessage(error, "导入失败，请检查文件或粘贴内容。"));
    } finally {
      setImportBusy(false);
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportError("");
    setImportPreview(null);
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      setImportError("暂不支持 Excel 二进制文件。请在 Excel 中“另存为 CSV”，或直接复制表格后粘贴。");
      return;
    }
    if (file.size > MAX_PERSONAL_FILE_BYTES) {
      setImportError("文件超过 12 MB，请拆分后再导入。");
      return;
    }
    setImportBusy(true);
    try {
      const text = await file.text();
      setImportPreview(parsePersonalImport(text, file.name));
    } catch (error) {
      setImportError(errorMessage(error, "文件读取或解析失败，请检查格式后重试。"));
    } finally {
      setImportBusy(false);
    }
  }

  function cancelImportPreview() {
    setImportPreview(null);
    setImportText("");
    setImportError("");
  }

  function applyImportPreview() {
    if (!record || !importPreview) return;
    const preview = importPreview;
    setRecord(applyPersonalImport(record, preview));
    setImportPreview(null);
    setImportText("");
    setImportError("");
    setNotice(
      `已应用导入数据：${preview.rows.length} 行 × ${preview.headers.length} 列。实验名称和照片保持不变。`,
    );
  }

  async function handlePhotoFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !record) return;
    setPhotoBusy(true);
    setPhotoError("");
    setNotice("");
    try {
      const prepared = await preparePhotoFile(file);
      const draft = await savePhotoDraft({
        imageDataUrl: prepared.dataUrl,
        note: "个人实验参考照片",
        fileName: prepared.fileName,
        draftId: personalPhotoDraftId(record.id),
      });
      setPhotoUrl(prepared.dataUrl);
      setPhotoConfirm(false);
      changeRecord((current) => ({
        ...current,
        photo: {
          draftId: draft.id,
          fileName: draft.fileName,
          width: prepared.width,
          height: prepared.height,
          addedAt: new Date().toISOString(),
        },
      }));
      setNotice("照片已保存在当前浏览器，并关联到这份实验。");
    } catch (error) {
      setPhotoError(errorMessage(error, "照片保存失败，请换一张图片或检查浏览器存储。"));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!record?.photo) return;
    setPhotoBusy(true);
    setPhotoError("");
    try {
      await deletePhotoDraft(record.photo.draftId);
      setPhotoUrl("");
      setPhotoConfirm(false);
      changeRecord((current) => ({ ...current, photo: null }));
      setNotice("照片已从当前浏览器移除，其他数据不受影响。");
    } catch (error) {
      setPhotoError(errorMessage(error, "照片删除失败，请稍后再试。"));
    } finally {
      setPhotoBusy(false);
    }
  }

  function retrySave() {
    const current = latestRef.current;
    if (!current) return;
    try {
      const saved = savePersonalExperiment(current);
      setLastSavedAt(saved.updatedAt);
      setSaveError("");
      setSaveState("saved");
    } catch (error) {
      setSaveError(errorMessage(error, "个人实验保存失败，请检查浏览器本地存储。"));
      setSaveState("error");
    }
  }

  function exportCsv() {
    if (!record) return;
    downloadTextFile(
      `${safeFileStem(record.name) || "我的实验"}-实验记录.csv`,
      buildPersonalCsv(record),
      "text/csv;charset=utf-8",
    );
    setNotice("CSV 已导出。空白单元格保持空白，全空行不写入文件。");
  }

  if (!record) {
    return (
      <div className="page-frame">
        <PageHeader
          eyebrow="My experiment · Browser only"
          title="找不到这份实验"
          description="记录可能已被删除，或保存在另一个浏览器中。"
          actions={
            <a className="button button--secondary" href="#/projects">
              <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
              返回我的项目
            </a>
          }
        />
        <div role="alert" className="inline-alert mt-5">
          <AlertCircle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>当前浏览器没有找到编号为“{experimentId}”的个人实验。</p>
        </div>
      </div>
    );
  }

  const filledRows = countFilledPersonalRows(record);
  const hasExistingData = hasPersonalData(record);
  const removeColumnIndex = record.columns.findIndex((column) => column.id === removeColumnId);
  const removeColumnName =
    removeColumnIndex >= 0
      ? record.columns[removeColumnIndex].name.trim() || `列${removeColumnIndex + 1}`
      : "";

  return (
    <div className="page-frame personal-page">
      <PageHeader
        eyebrow="My experiment · Browser only"
        title="我的实验记录"
        description="手填表头、单位和多行读数，或导入 CSV / TSV / Excel 粘贴数据。记录和照片只保存在当前浏览器。"
        actions={
          <>
            <a className="button button--secondary" href="#/projects">
              <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
              返回我的项目
            </a>
            <button type="button" className="button button--primary" onClick={exportCsv}>
              <Download size={14} strokeWidth={1.5} aria-hidden="true" />
              导出 CSV
            </button>
          </>
        }
      />

      <section className="course-sample personal-editor" aria-labelledby="personal-editor-title">
        <div className="course-panel-head">
          <div>
            <h2 id="personal-editor-title">实验名称与数据表</h2>
            <p>列名、单位和每个读数都能继续修改。空单元格保持空白，不会被补成 0。</p>
          </div>
          <span className="course-local-chip">
            <ShieldCheck size={13} strokeWidth={1.5} aria-hidden="true" />
            仅本地保存
          </span>
        </div>

        <label className="course-field personal-name-field">
          <span className="course-field__label">
            实验名称 <em>必填</em>
          </span>
          <input
            className="field course-input"
            value={record.name}
            maxLength={MAX_PERSONAL_NAME_LENGTH}
            aria-invalid={!record.name.trim() || undefined}
            onChange={(event) => updateName(event.target.value)}
          />
          {!record.name.trim() && <span className="course-field__hint">请填写名称，CSV 文件名会使用它。</span>}
        </label>

        <div
          className={`personal-savebar personal-savebar--${saveState}`}
          role="status"
          aria-live="polite"
        >
          {saveState === "saving" ? (
            <LoaderCircle size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
          ) : saveState === "saved" ? (
            <CheckCircle2 size={14} strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <AlertCircle size={14} strokeWidth={1.5} aria-hidden="true" />
          )}
          <span>
            {saveState === "saving"
              ? "正在保存到当前浏览器…"
              : saveState === "saved"
                ? `已保存${lastSavedAt ? ` · ${formatSessionDate(lastSavedAt)}` : ""}`
                : saveError}
          </span>
          {saveState === "error" && (
            <button type="button" className="action-link" onClick={retrySave}>
              <RefreshCw size={12} strokeWidth={1.5} aria-hidden="true" />
              重试保存
            </button>
          )}
        </div>

        {notice && <p className="course-notice">{notice}</p>}

        {removeColumnId && (
          <div className="personal-column-confirm" role="alert">
            <p>
              删除第 {removeColumnIndex + 1} 列“{removeColumnName}”会同时删除这一列的全部数据，无法撤销。
            </p>
            <div>
              <button type="button" className="button button--danger button--small" onClick={removeColumn}>
                确认删除列
              </button>
              <button
                type="button"
                className="button button--quiet button--small"
                onClick={() => setRemoveColumnId("")}
              >
                保留列
              </button>
            </div>
          </div>
        )}

        <div className="course-table-scroll personal-table-scroll">
          <table
            className="course-table course-table--personal"
            style={{ minWidth: `${54 + record.columns.length * 184}px` }}
          >
            <caption className="sr-only">个人实验数据表</caption>
            <thead>
              <tr>
                <th scope="col" className="course-table__index">行</th>
                {record.columns.map((column, index) => (
                  <th key={column.id} scope="col">
                    <div className="personal-column-head">
                      <div className="personal-column-head__title">
                        <input
                          className="course-cell-input personal-column-name"
                          value={column.name}
                          maxLength={MAX_PERSONAL_HEADER_LENGTH}
                          autoComplete="off"
                          aria-label={`第 ${index + 1} 列名称`}
                          placeholder={`列 ${index + 1}`}
                          onChange={(event) => updateColumn(column.id, "name", event.target.value)}
                        />
                        <button
                          type="button"
                          className="course-row-remove"
                          aria-label={`删除第 ${index + 1} 列`}
                          title="删除这一列"
                          disabled={record.columns.length <= 1}
                          onClick={() => setRemoveColumnId(column.id)}
                        >
                          <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
                        </button>
                      </div>
                      <input
                        className="course-cell-input personal-column-unit"
                        value={column.unit}
                        maxLength={MAX_PERSONAL_UNIT_LENGTH}
                        autoComplete="off"
                        aria-label={`第 ${index + 1} 列单位`}
                        placeholder="单位（可选）"
                        onChange={(event) => updateColumn(column.id, "unit", event.target.value)}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {record.rows.map((row, rowIndex) => (
                <tr key={row.id}>
                  <td className="course-table__index">{rowIndex + 1}</td>
                  {record.columns.map((column, columnIndex) => (
                    <td key={column.id}>
                      <input
                        className="course-cell-input personal-cell-input"
                        value={row.values[columnIndex] ?? ""}
                        maxLength={MAX_PERSONAL_CELL_LENGTH}
                        autoComplete="off"
                        aria-label={`第 ${rowIndex + 1} 行，${column.name.trim() || `列${columnIndex + 1}`}`}
                        placeholder={column.unit.trim() ? `数值（${column.unit.trim()}）` : "填写读数"}
                        onChange={(event) => updateCell(row.id, columnIndex, event.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="course-table-footer">
          <span>
            {record.rows.length} 行 × {record.columns.length} 列 · 非空 {filledRows} 行 · 最多{" "}
            {MAX_PERSONAL_ROWS} 行 / {MAX_PERSONAL_COLUMNS} 列
          </span>
          <div className="personal-table-actions">
            <button type="button" className="button button--secondary button--small" onClick={addColumn}>
              <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
              添加列
            </button>
            <button type="button" className="button button--secondary button--small" onClick={addRow}>
              <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
              添加行
            </button>
          </div>
        </div>

        {record.rows.length > 1 && (
          <div className="personal-row-tools">
            {record.rows.map((row, index) => (
              <button
                key={row.id}
                type="button"
                className="action-link"
                onClick={() => removeRow(row.id)}
              >
                <Trash2 size={11} strokeWidth={1.5} aria-hidden="true" />
                删除第 {index + 1} 行
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="course-sample personal-import" aria-labelledby="personal-import-title">
        <div className="course-panel-head">
          <div>
            <h2 id="personal-import-title">导入本地数据</h2>
            <p>
              支持 CSV、TSV，或从 Excel 复制整块表格后粘贴。先预览列名和数据，确认后才替换当前表格。
            </p>
          </div>
          {record.importedFileName && (
            <span className="status-chip status-chip--neutral">
              上次导入：{record.importedFileName}
            </span>
          )}
        </div>

        <div className="personal-import__grid">
          <div className="personal-import__file">
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              className="sr-only"
              onChange={handleImportFile}
            />
            <button
              type="button"
              className="button button--secondary"
              disabled={importBusy}
              onClick={() => importInputRef.current?.click()}
            >
              {importBusy ? (
                <LoaderCircle size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
              ) : (
                <Upload size={14} strokeWidth={1.5} aria-hidden="true" />
              )}
              选择 CSV / TSV 文件
            </button>
            <p>不接收 .xlsx / .xls 二进制文件；可先在 Excel 中另存为 CSV。</p>
          </div>
          <label className="course-field">
            <span className="course-field__label">或粘贴 Excel 表格</span>
            <textarea
              className="field course-textarea"
              value={importText}
              rows={5}
              placeholder={"把 Excel 中的表头和数据整块粘贴到这里，例如：\n采样点\t温度\t湿度\nA-01\t24.6\t52"}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportPreview(null);
                setImportError("");
              }}
            />
          </label>
        </div>

        <div className="personal-import__actions">
          <button
            type="button"
            className="button button--primary button--small"
            disabled={!importText.trim() || importBusy}
            onClick={() => previewImport(importText, "粘贴的数据")}
          >
            预览粘贴数据
          </button>
          {importText && (
            <button
              type="button"
              className="button button--quiet button--small"
              onClick={() => {
                setImportText("");
                setImportPreview(null);
                setImportError("");
              }}
            >
              清空粘贴内容
            </button>
          )}
        </div>

        {importError && (
          <div role="alert" className="inline-alert personal-import__error">
            <AlertCircle size={17} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p>{importError}</p>
              <p className="personal-import__keep-hint">当前表格内容没有改变，可以继续编辑或重新导入。</p>
            </div>
          </div>
        )}

        {importPreview && (
          <div className="personal-import-preview" aria-label="导入预览">
            <div className="personal-import-preview__head">
              <div>
                <h3>导入预览 · {importPreview.fileName}</h3>
                <p>
                  {importPreview.rows.length} 行 × {importPreview.headers.length} 列 ·{" "}
                  {DELIMITER_LABELS[importPreview.delimiter]}分隔
                </p>
              </div>
              <span className="status-chip status-chip--accent">
                <FileSpreadsheet size={12} strokeWidth={1.5} aria-hidden="true" />
                尚未写入
              </span>
            </div>
            {importPreview.warnings.length > 0 && (
              <ul className="personal-import-preview__warnings">
                {importPreview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            <div className="course-table-scroll personal-preview-scroll">
              <table className="course-table course-table--import-preview">
                <thead>
                  <tr>
                    {importPreview.headers.map((header, index) => (
                      <th key={`${header}-${index}`} scope="col">
                        {header || `列 ${index + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.slice(0, 5).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {importPreview.headers.map((_, columnIndex) => (
                        <td key={columnIndex}>{row[columnIndex] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {importPreview.rows.length > 5 && (
              <p className="personal-import-preview__more">
                仅预览前 5 行，应用后会写入全部 {importPreview.rows.length} 行。
              </p>
            )}
            <div className="personal-import-preview__actions">
              {hasExistingData && (
                <p>应用后会替换当前 {filledRows} 行数据；实验名称和已关联照片保留。</p>
              )}
              <button type="button" className="button button--primary button--small" onClick={applyImportPreview}>
                {hasExistingData ? "确认替换当前表格" : "应用到当前表格"}
              </button>
              <button type="button" className="button button--quiet button--small" onClick={cancelImportPreview}>
                取消预览
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="course-sample personal-photo" aria-labelledby="personal-photo-title">
        <div className="course-panel-head">
          <div>
            <h2 id="personal-photo-title">参考照片</h2>
            <p>可以附一张现场照片或讲义照片，方便对照采样位置、装置和记录条件。</p>
          </div>
          <span className="status-chip status-chip--neutral">
            {record.photo ? "已关联 1 张" : "未附照片"}
          </span>
        </div>

        <div className="personal-photo__layout">
          <div className="personal-photo__stage">
            {photoLoading ? (
              <div className="personal-photo__empty" role="status">
                <LoaderCircle size={18} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
                正在读取照片…
              </div>
            ) : photoUrl ? (
              <img src={photoUrl} alt="实验参考照片预览" className="personal-photo__image" />
            ) : (
              <div className="personal-photo__empty">
                <Camera size={22} strokeWidth={1.5} aria-hidden="true" />
                还没有关联照片
              </div>
            )}
          </div>
          <div className="personal-photo__side">
            <p>
              照片会压缩到最长边 1600 px，并与这份实验一起保存在当前浏览器。更换或删除记录前，请先导出需要长期保留的内容。
            </p>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/*"
              className="sr-only"
              onChange={handlePhotoFile}
            />
            <div className="personal-photo__actions">
              <button
                type="button"
                className="button button--secondary button--small"
                disabled={photoBusy}
                onClick={() => photoInputRef.current?.click()}
              >
                {photoBusy ? (
                  <LoaderCircle size={13} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Camera size={13} strokeWidth={1.5} aria-hidden="true" />
                )}
                {record.photo ? "更换照片" : "选择照片"}
              </button>
              {record.photo && !photoConfirm && (
                <button
                  type="button"
                  className="button button--quiet button--small project-record__delete"
                  disabled={photoBusy}
                  onClick={() => setPhotoConfirm(true)}
                >
                  <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
                  移除照片
                </button>
              )}
            </div>
            {photoConfirm && (
              <div className="personal-photo__confirm" role="alert">
                <p>移除后照片无法恢复，数据表和其他记录不受影响。</p>
                <div>
                  <button
                    type="button"
                    className="button button--danger button--small"
                    disabled={photoBusy}
                    onClick={removePhoto}
                  >
                    确认移除
                  </button>
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    onClick={() => setPhotoConfirm(false)}
                  >
                    保留照片
                  </button>
                </div>
              </div>
            )}
            {record.photo && (
              <p className="personal-photo__meta">
                {record.photo.fileName}
                {record.photo.width > 0 && record.photo.height > 0
                  ? ` · ${record.photo.width} × ${record.photo.height}`
                  : ""}
              </p>
            )}
            {photoError && (
              <p role="alert" className="personal-photo__error">
                {photoError}
              </p>
            )}
            <p className="personal-photo__privacy">照片不上传服务器，也不会写入 CSV。</p>
          </div>
        </div>
      </section>

      <p className="course-session-ref">
        个人实验路由：<code>#/projects?experiment={record.id}</code>
      </p>
    </div>
  );
}