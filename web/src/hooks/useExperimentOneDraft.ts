import {
  clearExperimentOneDraft,
  createEmptyDraft,
  hasDraftContent,
  loadExperimentOneDraft,
  saveExperimentOneDraft,
} from "../lib/courseExperiment1";
import { useCourseDraft, type CourseDraftAdapter } from "./useCourseDraft";

export type { DraftSaveState } from "./useCourseDraft";

const experimentOneAdapter: CourseDraftAdapter<ReturnType<typeof createEmptyDraft>> = {
  load: loadExperimentOneDraft,
  save: saveExperimentOneDraft,
  clear: clearExperimentOneDraft,
  createEmpty: createEmptyDraft,
  hasContent: hasDraftContent,
};

export function useExperimentOneDraft() {
  return useCourseDraft(experimentOneAdapter);
}