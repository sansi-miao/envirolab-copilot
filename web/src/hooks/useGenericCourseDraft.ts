import { useMemo } from "react";

import {
  clearGenericDraft,
  createEmptyGenericDraft,
  hasGenericContent,
  loadGenericDraft,
  saveGenericDraft,
  type GenericRawDraft,
  type GenericSessionConfig,
} from "../lib/courseGenericRecords";
import { useCourseDraft, type CourseDraftAdapter } from "./useCourseDraft";

export function useGenericCourseDraft(config: GenericSessionConfig) {
  const adapter = useMemo<CourseDraftAdapter<GenericRawDraft>>(
    () => ({
      load: () => loadGenericDraft(config),
      save: (draft) => saveGenericDraft(config, draft),
      clear: () => clearGenericDraft(config),
      createEmpty: () => createEmptyGenericDraft(config),
      hasContent: hasGenericContent,
    }),
    [config],
  );
  return useCourseDraft(adapter);
}