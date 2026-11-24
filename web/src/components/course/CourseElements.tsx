import { CheckCircle2, FlaskConical } from "lucide-react";
import type { ReactNode } from "react";

import {
  rawRecordStateLabels,
  type RawRecordState,
} from "../../lib/courseRawRecords";

export type CourseRecordStatus = "valid" | "review" | "missing" | "invalid" | "empty";

export interface CourseCheckIssue {
  id: string;
  level: "error" | "warning";
  message: string;
}

export function CourseStatusChip({
  status,
  label,
}: {
  status: CourseRecordStatus;
  label: string;
}) {
  return (
    <span className={`status-chip course-status course-status--${status}`}>
      <span className="status-chip__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

const rawStateStatus: Record<RawRecordState, CourseRecordStatus> = {
  empty: "empty",
  partial: "missing",
  invalid: "invalid",
  complete: "valid",
};

export function CourseRawStateChip({ state }: { state: RawRecordState }) {
  return <CourseStatusChip status={rawStateStatus[state]} label={rawRecordStateLabels[state]} />;
}

export function CourseSyntheticBanner({ children }: { children: ReactNode }) {
  return (
    <section className="course-synthetic-banner" role="note">
      <span className="course-synthetic-banner__icon" aria-hidden="true">
        <FlaskConical size={17} strokeWidth={1.5} />
      </span>
      <div>
        <strong>当前为教学合成样例</strong>
        <p>{children}</p>
      </div>
    </section>
  );
}

export function CourseMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: "warning" | "danger" | "positive";
}) {
  return (
    <div className="course-metric">
      <dt>{label}</dt>
      <dd className={tone ? `course-metric__value course-metric__value--${tone}` : "course-metric__value"}>
        {value}
        {detail && <small className="course-metric__detail">{detail}</small>}
      </dd>
    </div>
  );
}

export function CourseIssueList({
  title,
  issues,
  hasInput,
  emptyMessage,
  okMessage,
}: {
  title: string;
  issues: CourseCheckIssue[];
  hasInput: boolean;
  emptyMessage: string;
  okMessage: string;
}) {
  const errors = issues.filter((issue) => issue.level === "error").length;
  const warnings = issues.filter((issue) => issue.level === "warning").length;

  return (
    <section className="course-checks" aria-label={title}>
      <div className="course-panel-head course-panel-head--tight">
        <h3>{title}</h3>
        {hasInput && (
          <span className={`course-check-count ${errors > 0 ? "course-check-count--danger" : ""}`}>
            {errors > 0 ? `${errors} 项需修正` : "无阻断项"}
            {warnings > 0 ? ` · ${warnings} 项需复查` : ""}
          </span>
        )}
      </div>
      {!hasInput ? (
        <p className="course-checks__empty">{emptyMessage}</p>
      ) : issues.length === 0 ? (
        <p className="course-checks__ok">
          <CheckCircle2 size={15} strokeWidth={1.5} aria-hidden="true" />
          {okMessage}
        </p>
      ) : (
        <ul className="course-check-list">
          {issues.map((issue) => (
            <li key={issue.id} className={`course-check-item course-check-item--${issue.level}`}>
              <span>{issue.level === "error" ? "需修正" : "需复查"}</span>
              <p>{issue.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}