import { ArrowUpRight, BookOpen } from "lucide-react";

import { formatArchiveDate, type ExperimentSummary } from "../../lib/experiments";
import { StatusBadge } from "./StatusBadge";

export function ExperimentCard({
  experiment,
  index,
  onSelect,
}: {
  experiment: ExperimentSummary;
  index: number;
  onSelect: (id: string) => void;
}) {
  return (
    <article className="experiment-card">
      <button
        type="button"
        onClick={() => onSelect(experiment.id)}
        className="experiment-card__button"
        aria-label={`查看实验：${experiment.name}`}
      >
        <div className="experiment-card__meta">
          <span className="flex min-w-0 items-center gap-2">
            <span className="experiment-card__index">{String(index + 1).padStart(2, "0")}</span>
            <span className="truncate">{experiment.discipline_name}</span>
          </span>
          <span className="shrink-0 font-mono tabular-nums">{experiment.completeness}%</span>
        </div>

        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="experiment-card__title">{experiment.name}</h2>
            <p className="experiment-card__english">{experiment.english_name}</p>
          </div>
          <ArrowUpRight
            size={16}
            strokeWidth={1.5}
            className="experiment-card__arrow mt-1 shrink-0"
            aria-hidden="true"
          />
        </div>

        <p className="experiment-card__summary">{experiment.summary}</p>

        <ul className="experiment-card__tags" aria-label="实验标签">
          {experiment.tags.slice(0, 3).map((tag) => (
            <li key={tag} className="experiment-card__tag">{tag}</li>
          ))}
          {experiment.tags.length > 3 && (
            <li className="px-1 py-1 text-[9px] text-ink-300">+{experiment.tags.length - 3}</li>
          )}
        </ul>

        <div className="experiment-card__statuses">
          <StatusBadge kind="evidence" status={experiment.evidence_status} />
          <StatusBadge kind="review" status={experiment.review_status} />
        </div>

        <div className="experiment-card__footer">
          <span>
            <BookOpen size={12} strokeWidth={1.5} aria-hidden="true" />
            来源可追溯
          </span>
          <span>更新 {formatArchiveDate(experiment.updated_at)}</span>
        </div>
      </button>
    </article>
  );
}