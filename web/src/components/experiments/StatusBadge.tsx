import type { CalculationStatus, EvidenceStatus, ReviewStatus } from "../../lib/experiments";
import { calculationStatusLabels, evidenceStatusLabels, reviewStatusLabels } from "../../lib/experiments";

type Props =
  | { kind: "review"; status: ReviewStatus }
  | { kind: "evidence"; status: EvidenceStatus }
  | { kind: "calculation"; status: CalculationStatus };

type Tone = "accent" | "positive" | "warning" | "neutral";

function resolveStatus(props: Props): { label: string; tone: Tone } {
  if (props.kind === "review") {
    const tone: Tone =
      props.status === "verified" ? "positive" : props.status === "pending_review" ? "warning" : "neutral";
    return { label: reviewStatusLabels[props.status], tone };
  }

  if (props.kind === "evidence") {
    const tone: Tone =
      props.status === "source_verified"
        ? "accent"
        : props.status === "partially_verified" || props.status === "needs_supplement"
          ? "warning"
          : "neutral";
    return { label: evidenceStatusLabels[props.status], tone };
  }

  const tone: Tone =
    props.status === "tested"
      ? "positive"
      : props.status === "implemented_untested" || props.status === "in_development"
        ? "accent"
        : "neutral";
  return { label: calculationStatusLabels[props.status], tone };
}

export function StatusBadge(props: Props) {
  const { label, tone } = resolveStatus(props);
  return (
    <span className={`status-chip status-chip--${tone}`}>
      <span className="status-chip__dot" aria-hidden="true" />
      {label}
    </span>
  );
}