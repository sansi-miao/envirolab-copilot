import {
  clearBod5Draft,
  clearCodDraft,
  createEmptyBod5Draft,
  createEmptyCodDraft,
  hasBod5Content,
  hasCodContent,
  loadBod5Draft,
  loadCodDraft,
  saveBod5Draft,
  saveCodDraft,
} from "../lib/courseRawRecords";
import {
  clearSo2Draft,
  createEmptySo2Draft,
  hasSo2Content,
  loadSo2Draft,
  saveSo2Draft,
} from "../lib/courseSo2Records";
import { useCourseDraft, type CourseDraftAdapter } from "./useCourseDraft";

const codAdapter: CourseDraftAdapter<ReturnType<typeof createEmptyCodDraft>> = {
  load: loadCodDraft,
  save: saveCodDraft,
  clear: clearCodDraft,
  createEmpty: createEmptyCodDraft,
  hasContent: hasCodContent,
};

const bod5Adapter: CourseDraftAdapter<ReturnType<typeof createEmptyBod5Draft>> = {
  load: loadBod5Draft,
  save: saveBod5Draft,
  clear: clearBod5Draft,
  createEmpty: createEmptyBod5Draft,
  hasContent: hasBod5Content,
};

const so2Adapter: CourseDraftAdapter<ReturnType<typeof createEmptySo2Draft>> = {
  load: loadSo2Draft,
  save: saveSo2Draft,
  clear: clearSo2Draft,
  createEmpty: createEmptySo2Draft,
  hasContent: hasSo2Content,
};

export function useCodDraft() {
  return useCourseDraft(codAdapter);
}

export function useBod5Draft() {
  return useCourseDraft(bod5Adapter);
}

export function useSo2Draft() {
  return useCourseDraft(so2Adapter);
}