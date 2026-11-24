import { useCallback, useEffect, useRef, useState } from "react";

export type DraftSaveState = "idle" | "pending" | "saved" | "error";

export interface CourseDraftAdapter<T> {
  load: () => T | null;
  save: (draft: T) => T;
  clear: () => void;
  createEmpty: () => T;
  hasContent: (draft: T) => boolean;
}

function storageMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "浏览器本地存储空间不足，草稿未保存。当前输入仍保留，请先导出 CSV 或摘要备份。";
  }
  if (error instanceof Error && error.message) return error.message;
  return "浏览器本地存储不可用，草稿未保存。当前输入仍保留，请先导出备份。";
}

export function useCourseDraft<T>(adapter: CourseDraftAdapter<T>) {
  const [draft, setDraft] = useState<T>(() => adapter.createEmpty());
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<DraftSaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const draftRef = useRef(draft);
  const hydratedRef = useRef(false);
  const dirtyRef = useRef(false);
  const skipNextSaveRef = useRef(true);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    hydratedRef.current = hydrated;
  }, [hydrated]);

  useEffect(() => {
    let loaded: T | null = null;
    try {
      loaded = adapterRef.current.load();
    } catch (error) {
      setStorageError(storageMessage(error));
    }
    skipNextSaveRef.current = true;
    if (loaded) {
      setDraft(loaded);
      const updatedAt = (loaded as { updatedAt?: unknown }).updatedAt;
      setLastSavedAt(typeof updatedAt === "string" ? updatedAt : null);
      if (adapterRef.current.hasContent(loaded)) {
        setRestoredAt(typeof updatedAt === "string" ? updatedAt : null);
        setSaveState("saved");
      }
    }
    setHydrated(true);
  }, []);

  const persist = useCallback((next: T) => {
    try {
      const stored = adapterRef.current.save(next);
      dirtyRef.current = false;
      const updatedAt = (stored as { updatedAt?: unknown }).updatedAt;
      setLastSavedAt(typeof updatedAt === "string" ? updatedAt : null);
      setSaveState("saved");
      setStorageError(null);
      return true;
    } catch (error) {
      dirtyRef.current = true;
      setSaveState("error");
      setStorageError(storageMessage(error));
      return false;
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (!dirtyRef.current) return;
    setSaveState("pending");
    const timer = window.setTimeout(() => {
      persist(draftRef.current);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draft, hydrated, persist]);

  useEffect(() => {
    const flush = () => {
      if (!hydratedRef.current || !dirtyRef.current) return;
      try {
        adapterRef.current.save(draftRef.current);
      } catch {
        // The visible warning already explains storage failures; unload has no UI.
      }
    };
    const handleBeforeUnload = () => flush();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flush();
    };
  }, []);

  const updateDraft = useCallback((updater: (current: T) => T) => {
    dirtyRef.current = true;
    setSaveState("pending");
    setDraft((current) => updater(current));
  }, []);

  const replaceDraft = useCallback((next: T) => {
    dirtyRef.current = true;
    setSaveState("pending");
    setRestoredAt(null);
    setDraft(next);
  }, []);

  const clearDraft = useCallback(() => {
    try {
      adapterRef.current.clear();
    } catch (error) {
      setStorageError(storageMessage(error));
      return false;
    }
    dirtyRef.current = false;
    skipNextSaveRef.current = true;
    setDraft(adapterRef.current.createEmpty());
    setLastSavedAt(null);
    setRestoredAt(null);
    setSaveState("idle");
    setStorageError(null);
    return true;
  }, []);

  const retrySave = useCallback(() => {
    persist(draftRef.current);
  }, [persist]);

  const dismissRestoredNotice = useCallback(() => setRestoredAt(null), []);

  return {
    draft,
    hydrated,
    saveState,
    lastSavedAt,
    restoredAt,
    storageError,
    updateDraft,
    replaceDraft,
    clearDraft,
    retrySave,
    dismissRestoredNotice,
  };
}