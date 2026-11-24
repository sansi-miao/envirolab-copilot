const DATABASE_NAME = "envirolab-quick-record";
const DATABASE_VERSION = 1;
const STORE_NAME = "photo-drafts";
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;
const NOTE_LIMIT = 300;
const DRAFT_ID_LIMIT = 80;

export const QUICK_RECORD_PHOTO_DRAFT_ID = "current";

export interface PhotoDraft {
  id: string;
  imageDataUrl: string;
  note: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreparedPhoto {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器不支持 IndexedDB，无法保存图片草稿。"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("无法打开本地图片草稿存储，请确认浏览器允许站点使用本地存储。"));
    request.onblocked = () =>
      reject(new Error("图片草稿存储被其他页面占用，请关闭重复标签页后重试。"));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("本地图片草稿读写失败。"));
  });
}

function finishTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error("本地图片草稿保存失败，可能是浏览器存储空间不足。"));
    transaction.onabort = () => reject(new Error("本地图片草稿保存被中止。"));
  });
}

function normalizeDraftId(draftId: string | undefined) {
  return draftId?.trim().slice(0, DRAFT_ID_LIMIT) || QUICK_RECORD_PHOTO_DRAFT_ID;
}

function normalizeDraft(value: unknown, draftId: string): PhotoDraft | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PhotoDraft>;
  if (
    typeof candidate.imageDataUrl !== "string" ||
    !candidate.imageDataUrl.startsWith("data:image/") ||
    typeof candidate.note !== "string" ||
    typeof candidate.fileName !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    id: draftId,
    imageDataUrl: candidate.imageDataUrl,
    note: candidate.note.slice(0, NOTE_LIMIT),
    fileName: candidate.fileName,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}

export async function loadPhotoDraft(
  draftId: string = QUICK_RECORD_PHOTO_DRAFT_ID,
): Promise<PhotoDraft | null> {
  const key = normalizeDraftId(draftId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    return normalizeDraft(await requestValue(request), key);
  } finally {
    database.close();
  }
}

export async function savePhotoDraft(input: {
  imageDataUrl: string;
  note: string;
  fileName: string;
  createdAt?: string;
  draftId?: string;
}): Promise<PhotoDraft> {
  if (!input.imageDataUrl.startsWith("data:image/")) {
    throw new Error("图片预览数据不完整，请重新选择图片。");
  }
  const now = new Date().toISOString();
  const draft: PhotoDraft = {
    id: normalizeDraftId(input.draftId),
    imageDataUrl: input.imageDataUrl,
    note: input.note.trim().slice(0, NOTE_LIMIT),
    fileName: input.fileName,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(draft);
    await finishTransaction(transaction);
    return draft;
  } finally {
    database.close();
  }
}

export async function deletePhotoDraft(
  draftId: string = QUICK_RECORD_PHOTO_DRAFT_ID,
): Promise<void> {
  const key = normalizeDraftId(draftId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    await finishTransaction(transaction);
  } finally {
    database.close();
  }
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取这张图片，请换一张 JPG、PNG 或 WebP 图片。"));
    };
    image.src = url;
  });
}

export async function preparePhotoFile(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件，例如 JPG、PNG 或 WebP。");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("图片超过 20 MB，请先压缩后再试。");
  }

  const image = await loadImageElement(file);
  const edge = Math.max(image.naturalWidth, image.naturalHeight);
  if (edge === 0) {
    throw new Error("图片尺寸无效，请换一张图片。");
  }
  const scale = Math.min(1, MAX_IMAGE_EDGE / edge);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器无法处理这张图片，请换一个浏览器或图片。");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("图片编码失败，请换一张图片重试。");
  }
  return {
    dataUrl,
    fileName: file.name || "实验图片.jpg",
    width,
    height,
  };
}

export const PHOTO_NOTE_LIMIT = NOTE_LIMIT;