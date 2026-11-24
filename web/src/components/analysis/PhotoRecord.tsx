import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  FolderOpen,
  ImagePlus,
  Info,
  LoaderCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  deletePhotoDraft,
  loadPhotoDraft,
  PHOTO_NOTE_LIMIT,
  preparePhotoFile,
  QUICK_RECORD_PHOTO_DRAFT_ID,
  savePhotoDraft,
  type PhotoDraft,
} from "../../lib/photoDrafts";

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PhotoRecord({
  onSwitchToManual,
  draftId = QUICK_RECORD_PHOTO_DRAFT_ID,
}: {
  onSwitchToManual: () => void;
  draftId?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelOverwriteRef = useRef<HTMLButtonElement>(null);
  const [photo, setPhoto] = useState<{ dataUrl: string; fileName: string } | null>(null);
  const [note, setNote] = useState("");
  const [savedDraft, setSavedDraft] = useState<PhotoDraft | null>(null);
  const [pendingReplacement, setPendingReplacement] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSavedDraft(null);
    setLoadingDraft(true);
    loadPhotoDraft(draftId)
      .then((draft) => {
        if (!cancelled) setSavedDraft(draft);
      })
      .catch((loadError: Error) => {
        if (!cancelled) setError(loadError.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingDraft(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  useEffect(() => {
    if (confirmOverwrite) cancelOverwriteRef.current?.focus();
  }, [confirmOverwrite]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setNotice("");
    setConfirmOverwrite(false);
    setBusy(true);
    try {
      const prepared = await preparePhotoFile(file);
      setPhoto({ dataUrl: prepared.dataUrl, fileName: prepared.fileName });
      setNote("");
      setPendingReplacement(Boolean(savedDraft));
      setNotice(
        savedDraft
          ? `图片已载入预览（${prepared.width} × ${prepared.height}）。已有草稿，保存时会先确认是否覆盖。`
          : `图片已载入预览（${prepared.width} × ${prepared.height}）。尚未保存。`,
      );
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "无法读取这张图片。");
    } finally {
      setBusy(false);
    }
  }

  function clearCurrentPhoto() {
    setPhoto(null);
    setConfirmOverwrite(false);
    setPendingReplacement(false);
    setError("");
    setNotice("已从当前编辑区移除图片，本地草稿不受影响。");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function persistDraft() {
    if (!photo || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const draft = await savePhotoDraft({
        imageDataUrl: photo.dataUrl,
        note,
        fileName: photo.fileName,
        createdAt: savedDraft?.createdAt,
        draftId,
      });
      setSavedDraft(draft);
      setConfirmOverwrite(false);
      setPendingReplacement(false);
      setNotice("图片草稿已保存在当前浏览器。刷新页面后可以重新打开。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "图片草稿保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!photo) {
      setError("请先选择一张图片文件。");
      return;
    }
    if (savedDraft && (pendingReplacement || photo.dataUrl !== savedDraft.imageDataUrl)) {
      setError("");
      setNotice("");
      setConfirmOverwrite(true);
      return;
    }
    await persistDraft();
  }

  function handleCancelOverwrite() {
    setConfirmOverwrite(false);
    setPendingReplacement(false);
    setError("");
    if (savedDraft) {
      setPhoto({ dataUrl: savedDraft.imageDataUrl, fileName: savedDraft.fileName });
      setNote(savedDraft.note);
      setNotice("已取消覆盖，保留了原来的图片和备注。");
    }
  }

  function handleOpenSaved() {
    if (!savedDraft) return;
    setPhoto({ dataUrl: savedDraft.imageDataUrl, fileName: savedDraft.fileName });
    setNote(savedDraft.note);
    setConfirmOverwrite(false);
    setPendingReplacement(false);
    setError("");
    setNotice(`已打开 ${formatSavedAt(savedDraft.updatedAt)} 保存的图片草稿。`);
  }

  async function handleDeleteSaved() {
    setBusy(true);
    setConfirmOverwrite(false);
    setPendingReplacement(false);
    setError("");
    setNotice("");
    try {
      await deletePhotoDraft(draftId);
      setSavedDraft(null);
      setPhoto(null);
      setNote("");
      setNotice("已删除本地图片草稿。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除图片草稿失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="quick-photo">
      <input
        ref={fileInputRef}
        id="photo-file-input"
        type="file"
        accept="image/*"
        aria-label="选择图片文件"
        className="sr-only"
        disabled={busy}
        onChange={(event) => void handleFileChange(event)}
      />
      {savedDraft && (
        <div className="photo-draft-banner">
          <span className="photo-draft-banner__icon">
            <FolderOpen size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="photo-draft-banner__title">当前浏览器里有一条图片草稿</p>
            <p className="photo-draft-banner__meta">
              保存于 {formatSavedAt(savedDraft.updatedAt)}
              {savedDraft.note ? ` · ${savedDraft.note}` : " · 无备注"}
            </p>
          </div>
          <div className="photo-draft-banner__actions">
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={handleOpenSaved}
              disabled={busy}
            >
              <FolderOpen size={13} strokeWidth={1.5} aria-hidden="true" />
              打开草稿
            </button>
            <button
              type="button"
              className="button button--quiet button--small"
              onClick={() => void handleDeleteSaved()}
              disabled={busy}
            >
              <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
              删除草稿
            </button>
          </div>
        </div>
      )}

      <div className="quick-photo__grid">
        <div className="photo-stage">
          {photo ? (
            <>
              <img
                src={photo.dataUrl}
                alt={`实验图片预览：${photo.fileName}`}
                className="photo-stage__image"
              />
              <div className="photo-stage__overlay">
                <span>{photo.fileName}</span>
                <div className="photo-stage__overlay-actions">
                  <label
                    htmlFor="photo-file-input"
                    className={`button button--secondary button--small ${busy ? "is-disabled" : ""}`}
                  >
                    <ImagePlus size={13} strokeWidth={1.5} aria-hidden="true" />
                    更换图片
                  </label>
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={clearCurrentPhoto}
                    disabled={busy}
                  >
                    <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
                    删除图片
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="photo-stage__empty">
              <span className="photo-stage__icon">
                {busy ? (
                  <LoaderCircle size={22} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus size={22} strokeWidth={1.5} aria-hidden="true" />
                )}
              </span>
              <h3>先选一张图片，留住现场</h3>
              <p>
                从电脑或手机中选择一张图片文件。图片会在浏览器内缩小后保存，不上传服务器。
              </p>
              <div className="photo-stage__actions">
                <label
                  htmlFor="photo-file-input"
                  className={`button button--primary ${busy ? "is-disabled" : ""}`}
                >
                  <ImagePlus size={14} strokeWidth={1.5} aria-hidden="true" />
                  选择图片文件
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="photo-side">
          <div className="photo-side__field">
            <label htmlFor="photo-note" className="analysis-field__label">
              备注（可选）
            </label>
            <textarea
              id="photo-note"
              value={note}
              maxLength={PHOTO_NOTE_LIMIT}
              rows={4}
              onChange={(event) => setNote(event.target.value)}
              placeholder="例如：第 3 组活性炭投加后的色度，记录于通风橱前。"
              className="photo-side__textarea"
            />
            <span className="photo-side__count">
              {note.length} / {PHOTO_NOTE_LIMIT}
            </span>
          </div>

          <div className="photo-side__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => void handleSave()}
              disabled={busy || !photo || confirmOverwrite}
            >
              {busy ? (
                <LoaderCircle size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
              ) : (
                <Save size={14} strokeWidth={1.5} aria-hidden="true" />
              )}
              保存图片草稿
            </button>
            <button type="button" className="button button--secondary" onClick={onSwitchToManual}>
              <RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" />
              改用手填数据
            </button>
          </div>

          {confirmOverwrite && (
            <div
              className="photo-overwrite"
              role="alert"
              aria-labelledby="photo-overwrite-title"
              aria-describedby="photo-overwrite-text"
            >
              <div className="photo-overwrite__head">
                <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" />
                <div>
                  <p id="photo-overwrite-title" className="photo-overwrite__title">
                    保存会覆盖已有草稿
                  </p>
                  <p id="photo-overwrite-text" className="photo-overwrite__text">
                    当前浏览器里已有保存于 {savedDraft ? formatSavedAt(savedDraft.updatedAt) : "较早时间"}{" "}
                    的图片草稿。继续保存会替换旧图片和旧备注，且无法恢复；取消会恢复原来的图片和备注。
                  </p>
                </div>
              </div>
              <div className="photo-overwrite__actions">
                <button
                  ref={cancelOverwriteRef}
                  type="button"
                  className="button button--secondary button--small"
                  onClick={handleCancelOverwrite}
                  disabled={busy}
                >
                  取消，保留旧草稿
                </button>
                <button
                  type="button"
                  className="button button--danger button--small"
                  onClick={() => void persistDraft()}
                  disabled={busy}
                >
                  {busy ? (
                    <LoaderCircle size={13} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <AlertTriangle size={13} strokeWidth={1.5} aria-hidden="true" />
                  )}
                  覆盖并保存
                </button>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="quick-inline-message quick-inline-message--error">
              <AlertTriangle size={13} strokeWidth={1.5} aria-hidden="true" />
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="quick-inline-message quick-inline-message--positive">
              <ShieldCheck size={13} strokeWidth={1.5} aria-hidden="true" />
              {notice}
            </p>
          )}
          {loadingDraft && (
            <p className="quick-inline-message">
              <LoaderCircle size={13} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
              正在读取本地草稿…
            </p>
          )}

          <div className="photo-side__privacy">
            <Info size={13} strokeWidth={1.5} aria-hidden="true" />
            <p>
              图片只保存在当前浏览器的 IndexedDB 中，不发送到服务器，也不调用图像识别。清除站点数据后草稿会消失。
            </p>
          </div>

          <p className="photo-side__hint">
            图片本身不产生数值。需要画图或质量检查时，请切换到「手填数据」录入读数。
          </p>
        </div>
      </div>
    </div>
  );
}