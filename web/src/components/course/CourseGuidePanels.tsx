import type { CourseReference } from "../../lib/course";

export function CourseGuidePanels({
  pending,
  references,
}: {
  pending: string[];
  references: CourseReference[];
}) {
  return (
    <div className="course-reference-grid">
      <section className="course-rules" aria-labelledby="course-rules-title">
        <div className="course-panel-head course-panel-head--tight">
          <h2 id="course-rules-title">待课程讲义确认</h2>
        </div>
        <ul>
          {pending.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="course-references" aria-labelledby="course-references-title">
        <div className="course-panel-head course-panel-head--tight">
          <h2 id="course-references-title">公开参考与已有档案</h2>
        </div>
        <ul>
          {references.map((reference) => (
            <li key={reference.label}>
              <strong>{reference.label}</strong>
              <p>{reference.detail}</p>
              {reference.href && (
                <a
                  className="action-link"
                  href={reference.href}
                  target={reference.href.startsWith("#") ? undefined : "_blank"}
                  rel={reference.href.startsWith("#") ? undefined : "noreferrer"}
                >
                  {reference.actionLabel ?? "打开已有实验档案"}
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}