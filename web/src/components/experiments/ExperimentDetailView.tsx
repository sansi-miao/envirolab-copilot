import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpenCheck,
  CalendarDays,
  ExternalLink,
  FileText,
  FlaskConical,
  LineChart,
  ShieldCheck,
} from "lucide-react";

import {
  calculationStatusLabels,
  evidenceStatusLabels,
  formatArchiveDate,
  reviewStatusLabels,
  sourceAccessLabels,
  type ExperimentDetail,
  type ExperimentSummary,
} from "../../lib/experiments";
import { StatusBadge } from "./StatusBadge";

function DetailSection({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="detail-section">
      <div className="detail-section__head">
        <span className="detail-section__index">{index}</span>
        <h2 className="detail-section__title">{title}</h2>
      </div>
      <div className="detail-section__body">{children}</div>
    </section>
  );
}

function ItemList({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  return (
    <ul className={`item-list ${ordered ? "item-list--ordered" : ""}`}>
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>
          {ordered ? (
            <span className="item-list__index">{String(index + 1).padStart(2, "0")}</span>
          ) : (
            <span className="item-list__bullet" aria-hidden="true" />
          )}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function ExperimentDetailView({
  experiment,
  related,
  onBack,
  onSelectRelated,
}: {
  experiment: ExperimentDetail;
  related: ExperimentSummary[];
  onBack: () => void;
  onSelectRelated: (id: string) => void;
}) {
  const { method } = experiment;

  return (
    <div>
      <button type="button" onClick={onBack} className="record-back">
        <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
        返回实验列表
      </button>

      <header className="record-hero">
        <div className="record-meta">
          <span>{experiment.discipline_name}</span>
          <span className="record-meta__separator">/</span>
          <span>{experiment.id}</span>
          <span className="record-meta__separator">/</span>
          <span>v{experiment.version}</span>
        </div>
        <h1 className="record-title">{experiment.name}</h1>
        <p className="record-english">{experiment.english_name}</p>
        <p className="record-summary">{experiment.summary}</p>
        <div className="record-statuses">
          <StatusBadge kind="evidence" status={experiment.evidence_status} />
          <StatusBadge kind="review" status={experiment.review_status} />
          <StatusBadge kind="calculation" status={experiment.calculation_status} />
        </div>

        <div className="record-actions">
          <a
            href={`#/analysis?experiment=${encodeURIComponent(experiment.id)}`}
            className="button button--primary button--small"
          >
            <LineChart size={14} strokeWidth={1.5} aria-hidden="true" />
            用这份方法分析数据
          </a>
          <span>上传 CSV 后生成图表与数据质量初检，关联本实验的方法与变量。</span>
        </div>

        <dl className="record-facts">
          <div>
            <dt className="record-fact__label">资料完整度</dt>
            <dd className="record-fact__value">{experiment.completeness}%</dd>
          </div>
          <div>
            <dt className="record-fact__label">实验步骤</dt>
            <dd className="record-fact__value">{method.steps.length} 步</dd>
          </div>
          <div>
            <dt className="record-fact__label">实验材料</dt>
            <dd className="record-fact__value">{method.materials.length} 项</dd>
          </div>
          <div>
            <dt className="record-fact__label">参考来源</dt>
            <dd className="record-fact__value">{experiment.papers.length} 篇</dd>
          </div>
        </dl>
      </header>

      <div className="record-layout">
        <div className="record-main">
          <DetailSection index="01" title="实验目的与原理">
            <div className="space-y-4">
              <div>
                <h3 className="micro-label">实验目的</h3>
                <p className="body-copy mt-1.5">{method.purpose}</p>
              </div>
              <div>
                <h3 className="micro-label">实验原理</h3>
                <p className="body-copy mt-1.5">{method.principle}</p>
              </div>
            </div>
          </DetailSection>

          <DetailSection index="02" title="实验材料与仪器">
            <div className="detail-columns">
              <div>
                <h3 className="micro-label">实验材料</h3>
                <div className="mt-2"><ItemList items={method.materials} /></div>
              </div>
              <div>
                <h3 className="micro-label">实验仪器</h3>
                <div className="mt-2"><ItemList items={method.instruments} /></div>
              </div>
            </div>
          </DetailSection>

          <DetailSection index="03" title="实验步骤">
            <ItemList items={method.steps} ordered />
          </DetailSection>

          <DetailSection index="04" title="实验变量与控制条件">
            <div className="grid gap-5 md:grid-cols-3">
              {[
                ["自变量", method.independent_variables],
                ["因变量", method.dependent_variables],
                ["控制变量", method.controlled_variables],
              ].map(([label, items]) => (
                <div key={label as string}>
                  <h3 className="micro-label">{label as string}</h3>
                  <div className="mt-2"><ItemList items={items as string[]} /></div>
                </div>
              ))}
            </div>
          </DetailSection>

          <DetailSection index="05" title="计算公式与适用条件">
            <div>
              {experiment.formulas.map((formula, index) => (
                <article key={formula.id} className="formula-card">
                  <div className="formula-card__head">
                    <h3 className="formula-card__name">{formula.name}</h3>
                    <span className="formula-card__index">EQ {String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="formula-plate">{formula.expression}</div>
                  <div className="formula-card__body">
                    <p className="formula-description">{formula.description}</p>
                    <dl className="formula-facts">
                      <div>
                        <dt className="micro-label">符号与参数</dt>
                        <dd className="mt-2"><ItemList items={formula.symbols} /></dd>
                      </div>
                      <div>
                        <dt className="micro-label">单位</dt>
                        <dd className="body-copy mt-1.5">{formula.units}</dd>
                      </div>
                      <div className="condition-box">
                        <dt className="micro-label">适用条件</dt>
                        <dd><p>{formula.applicable_conditions}</p></dd>
                      </div>
                    </dl>
                  </div>
                </article>
              ))}
            </div>
          </DetailSection>

          <DetailSection index="06" title="数据处理与不确定性">
            <p className="body-copy">{method.data_processing}</p>
            {method.limitations.length > 0 && (
              <div className="mt-4 rounded-[9px] bg-surface-soft p-4">
                <h3 className="micro-label">限制与安全说明</h3>
                <div className="mt-2"><ItemList items={method.limitations} /></div>
              </div>
            )}
          </DetailSection>

          <DetailSection index="07" title="参考文献与原始资料">
            <div className="paper-list">
              {experiment.papers.map((paper) => (
                <article key={paper.id} className="paper-item">
                  <h3 className="paper-item__title">{paper.title}</h3>
                  <p className="paper-item__meta">
                    {paper.authors.join("；")} · {paper.year ?? "年份待补充"} · {paper.venue}
                  </p>
                  <div className="paper-item__tags">
                    <span className="paper-item__tag">{sourceAccessLabels[paper.source_access]}</span>
                    <span className="paper-item__tag">{paper.doi ? `DOI ${paper.doi}` : "未登记 DOI"}</span>
                  </div>
                  {paper.notes && <p className="paper-item__meta">{paper.notes}</p>}
                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="paper-item__link"
                  >
                    查看原始资料
                    <ExternalLink size={12} strokeWidth={1.5} aria-hidden="true" />
                  </a>
                </article>
              ))}
            </div>
          </DetailSection>
        </div>

        <aside className="record-aside">
          <section className="aside-panel">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
              <h2 className="aside-panel__title">档案完整度</h2>
            </div>
            <div className="integrity-score">
              <span className="integrity-score__value">{experiment.completeness}</span>
              <span className="integrity-score__unit">/ 100</span>
            </div>
            <div
              className="integrity-bar"
              role="progressbar"
              aria-label="实验资料完整度"
              aria-valuenow={experiment.completeness}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="integrity-bar__fill" style={{ width: `${experiment.completeness}%` }} />
            </div>
            <dl className="integrity-list">
              <div className="integrity-row">
                <dt>证据状态</dt>
                <dd className="integrity-row__value">{evidenceStatusLabels[experiment.evidence_status]}</dd>
              </div>
              <div className="integrity-row">
                <dt>审核状态</dt>
                <dd className="integrity-row__value">{reviewStatusLabels[experiment.review_status]}</dd>
              </div>
              <div className="integrity-row">
                <dt>计算模块</dt>
                <dd className="integrity-row__value">{calculationStatusLabels[experiment.calculation_status]}</dd>
              </div>
            </dl>
            <div className="mt-3 space-y-2 border-t border-line pt-3 text-[9.5px] text-ink-400">
              <p className="flex items-center gap-2">
                <CalendarDays size={12} strokeWidth={1.5} aria-hidden="true" />
                创建 {formatArchiveDate(experiment.created_at)}
              </p>
              <p className="flex items-center gap-2">
                <CalendarDays size={12} strokeWidth={1.5} aria-hidden="true" />
                更新 {formatArchiveDate(experiment.updated_at)}
              </p>
            </div>
          </section>

          <section className="aside-panel">
            <div className="flex items-center gap-2">
              <FlaskConical size={15} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
              <h2 className="aside-panel__title">相关实验</h2>
            </div>
            {related.length > 0 ? (
              <div className="related-list">
                {related.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectRelated(item.id)}
                    className="related-item"
                  >
                    <span className="min-w-0">
                      <span className="related-item__name">{item.name}</span>
                      <span className="related-item__meta">{item.discipline_name}</span>
                    </span>
                    <ArrowUpRight size={12} strokeWidth={1.5} className="mt-1 shrink-0 text-ink-300" aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[10px] leading-5 text-ink-400">暂无可推荐的相关实验</p>
            )}
          </section>

          <section className="aside-panel">
            <div className="flex items-center gap-2">
              <FileText size={15} strokeWidth={1.5} className="text-ink-400" aria-hidden="true" />
              <h2 className="aside-panel__title">来源说明</h2>
            </div>
            <p className="aside-note mt-3">
              来源已核验表示链接与资料身份可追溯，不等于实验已由平台复现或审核。审核状态与计算模块状态始终独立展示。
            </p>
            <div className="mt-3 flex items-center gap-2 text-[9px] text-ink-400">
              <BookOpenCheck size={12} strokeWidth={1.5} aria-hidden="true" />
              每条公式保留适用条件
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}