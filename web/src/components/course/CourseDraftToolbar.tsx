import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Info,
  LoaderCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { formatSavedTime } from "../../lib/courseCommon";
import type { DraftSaveState } from "../../hooks/useCourseDraft";

interface CourseDraftToolbarProps {
  hasContent: boolean;
  saveState: DraftSaveState;
  lastSavedAt: string | null;
  restoredAt: string | null;
  storageError: string | null;
  notice?: string;
  storageNote: string;
  restoredNote?: string;
  teachingLabel: string;
  teachingConfirmTitle: string;
  teachingConfirmBody: ReactNode;
  clearConfirmTitle: string;
  clearConfirmBody: ReactNode;
  onLoadTeaching: () => void;
  onClear: () => boolean;
  onRetrySave: () => void;
  onDismissRestored: () => void;
}

export function CourseDraftToolbar({
  hasContent,
  saveState,
  lastSavedAt,
  restoredAt,
  storageError,
  notice,
  storageNote,
  restoredNote = "草稿来自当前浏览器，不会写入网址。可以继续编辑，也可以清空后重新开始。",
  teachingLabel,
  teachingConfirmTitle,
  teachingConfirmBody,
  clearConfirmTitle,
  clearConfirmBody,
  onLoadTeaching,
  onClear,
  onRetrySave,
  onDismissRestored,
}: CourseDraftToolbarProps) {
  const [confirmTeaching, setConfirmTeaching] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const saveText =
    saveState === "pending"
      ? "正在保存到本机…"
      : saveState === "saved"
        ? `已保存到本机 · ${lastSavedAt ? formatSavedTime(lastSavedAt) : "刚刚"}`
        : saveState === "error"
          ? "本地草稿保存失败"
          : "尚未开始编辑";

  function requestTeaching() {
    setConfirmClear(false);
    if (hasContent) {
      setConfirmTeaching(true);
      return;
    }
    onLoadTeaching();
  }

  function applyTeaching() {
    setConfirmTeaching(false);
    onLoadTeaching();
  }

  function requestClear() {
    setConfirmTeaching(false);
    setConfirmClear(true);
  }

  function handleClear() {
    if (!onClear()) return;
    setConfirmClear(false);
    setConfirmTeaching(false);
  }

  return (
    <>
      {restoredAt && (
        <div className="course-restored" role="status">
          <FolderOpen size={18} strokeWidth={1.5} aria-hidden="true" />
          <div className="course-restored__copy">
            <strong>
              {restoredAt
                ? `已恢复保存于 ${formatSavedTime(restoredAt)} 的本地草稿`
                : "已恢复本地草稿"}
            </strong>
            <p>{restoredNote}</p>
          </div>
          <div className="course-restored__actions">
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={onDismissRestored}
            >
              继续编辑
            </button>
            <button
              type="button"
              className="button button--quiet button--small"
              onClick={requestClear}
            >
              清空本地草稿
            </button>
          </div>
        </div>
      )}

      <div className="course-utility-bar">
        <div className="course-save-state">
          <span className={`course-save-state__icon course-save-state__icon--${saveState}`}>
            {saveState === "pending" ? (
              <LoaderCircle size={16} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
            ) : saveState === "saved" ? (
              <ShieldCheck size={16} strokeWidth={1.5} aria-hidden="true" />
            ) : saveState === "error" ? (
              <AlertTriangle size={16} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Save size={16} strokeWidth={1.5} aria-hidden="true" />
            )}
          </span>
          <div>
            <strong>{saveText}</strong>
            <p>{storageNote}</p>
          </div>
        </div>
        <div className="course-utility-actions">
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={requestTeaching}
          >
            <RefreshCw size={13} strokeWidth={1.5} aria-hidden="true" />
            {teachingLabel}
          </button>
          <button
            type="button"
            className="button button--quiet button--small"
            onClick={requestClear}
            disabled={!hasContent}
          >
            <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
            清空表单
          </button>
        </div>
      </div>

      {confirmTeaching && (
        <div className="course-confirm" role="alert">
          <Info size={16} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <strong>{teachingConfirmTitle}</strong>
            <p>{teachingConfirmBody}</p>
          </div>
          <div className="course-confirm__actions">
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => setConfirmTeaching(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="button button--primary button--small"
              onClick={applyTeaching}
            >
              载入并替换
            </button>
          </div>
        </div>
      )}

      {confirmClear && (
        <div className="course-confirm course-confirm--danger" role="alert">
          <AlertTriangle size={16} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <strong>{clearConfirmTitle}</strong>
            <p>{clearConfirmBody}</p>
          </div>
          <div className="course-confirm__actions">
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => setConfirmClear(false)}
            >
              保留数据
            </button>
            <button
              type="button"
              className="button button--danger button--small"
              onClick={handleClear}
            >
              确认清空
            </button>
          </div>
        </div>
      )}

      {storageError && (
        <div className="course-storage-warning" role="alert">
          <AlertTriangle size={16} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <strong>本地草稿没有保存成功</strong>
            <p>{storageError}</p>
          </div>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={onRetrySave}
          >
            <Save size={13} strokeWidth={1.5} aria-hidden="true" />
            重试保存
          </button>
        </div>
      )}

      {notice && (
        <p className="course-notice" role="status">
          <CheckCircle2 size={14} strokeWidth={1.5} aria-hidden="true" />
          {notice}
        </p>
      )}
    </>
  );
}