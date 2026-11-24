import type { ReactNode } from "react";

import { SignalMark } from "./SignalMark";

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="section-heading">
        {eyebrow && (
          <p className="eyebrow">
            <SignalMark />
            {eyebrow}
          </p>
        )}
        <h2 className="section-heading__title">{title}</h2>
        {description && <p className="section-heading__description">{description}</p>}
      </div>
      {action}
    </div>
  );
}