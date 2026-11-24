import { ExternalLink, FlaskConical, Info, ShieldCheck } from "lucide-react";

import type { PublicStandard } from "../../lib/coursePublicStandards";

function StandardLimitList({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: string; detail?: string }>;
}) {
  return (
    <section className="course-public-standard__block">
      <h3>{title}</h3>
      <dl className="course-public-standard__limits">
        {items.map((item) => (
          <div key={`${title}-${item.label}`}>
            <dt>{item.label}</dt>
            <dd>
              <span>{item.value}</span>
              {item.detail && <small>{item.detail}</small>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PublicStandardReference({ standard }: { standard: PublicStandard }) {
  return (
    <section
      className="course-public-standard"
      aria-labelledby={`public-standard-${standard.id}`}
      data-course-public-standard={standard.id}
    >
      <header className="course-public-standard__head">
        <div className="course-public-standard__head-copy">
          <p className="course-public-standard__kicker">
            <ShieldCheck size={13} strokeWidth={1.5} aria-hidden="true" />
            公开标准参考 · 只读
          </p>
          <h2 id={`public-standard-${standard.id}`} className="course-public-standard__title">
            {standard.code}「{standard.title}」
          </h2>
          <p className="course-public-standard__summary">{standard.summary}</p>
        </div>
        <span className="course-public-standard__badge">
          <ShieldCheck size={12} strokeWidth={1.5} aria-hidden="true" />
          不参与课堂计算
        </span>
      </header>

      <div className="course-public-standard__meta">
        <span>{standard.issuer}</span>
        <span>发布 {standard.issuedAt}</span>
        <span>实施 {standard.effectiveAt}</span>
        <span>方法：{standard.method}</span>
      </div>

      <div className="course-public-standard__grid">
        <section className="course-public-standard__block">
          <h3>适用范围</h3>
          <ul className="course-public-standard__list">
            {standard.scope.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <StandardLimitList title="量程与检出" items={standard.limits} />
      </div>

      <section className="course-public-standard__block">
        <h3>字段、符号与单位</h3>
        <div className="course-table-scroll" tabIndex={0}>
          <table className="course-table course-table--reference">
            <thead>
              <tr>
                <th scope="col">符号</th>
                <th scope="col">字段</th>
                <th scope="col">单位</th>
                <th scope="col">说明</th>
              </tr>
            </thead>
            <tbody>
              {standard.fields.map((field) => (
                <tr key={`${standard.id}-${field.symbol}`}>
                  <td className="course-standard-field__symbol">{field.symbol}</td>
                  <td>{field.name}</td>
                  <td className="course-standard-field__unit">{field.unit}</td>
                  <td>{field.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="course-public-standard__block">
        <h3>计算公式与适用条件</h3>
        <div className="course-standard-formulas">
          {standard.formulas.map((formula) => (
            <article key={formula.id} className="course-standard-formula">
              <div className="course-standard-formula__head">
                <div>
                  <span className="course-standard-formula__code">{formula.code}</span>
                  <h4>{formula.name}</h4>
                </div>
                <span className="course-standard-formula__scope">{formula.applicable}</span>
              </div>
              <code className="course-standard-formula__expression">{formula.expression}</code>
              <ul className="course-standard-formula__notes">
                {formula.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {standard.dilutionTable && (
        <section className="course-public-standard__block">
          <h3>BOD₅ 预期值与稀释倍数</h3>
          <div className="course-table-scroll" tabIndex={0}>
            <table className="course-table course-table--reference course-table--dilution">
              <thead>
                <tr>
                  <th scope="col">预期 BOD₅（mg/L）</th>
                  <th scope="col">稀释倍数</th>
                </tr>
              </thead>
              <tbody>
                {standard.dilutionTable.map((row) => (
                  <tr key={row.expected}>
                    <td>{row.expected}</td>
                    <td className="course-standard-field__unit">{row.multiple}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {standard.dilutionNote && (
            <p className="course-public-standard__note">{standard.dilutionNote}</p>
          )}
        </section>
      )}

      {standard.qualityControl && (
        <StandardLimitList title="质量控制判据" items={standard.qualityControl} />
      )}

      <section className="course-public-standard__block">
        <h3>关键操作与保存条件</h3>
        <ul className="course-public-standard__list">
          {standard.conditions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="course-public-standard__block">
        <h3>结果表达</h3>
        <ul className="course-public-standard__list">
          {standard.reporting.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="course-public-standard__block">
        <div className="course-public-standard__section-head">
          <div>
            <h3>标准示例校验</h3>
            <p>以下数值全部为合成数据，只用于核对公开标准公式、单位和有效数字。</p>
          </div>
          <span className="course-standard-verified">
            <FlaskConical size={12} strokeWidth={1.5} aria-hidden="true" />
            纯函数计算
          </span>
        </div>
        <div className="course-standard-examples">
          {standard.examples.map((example) => (
            <article key={example.id} className="course-standard-example">
              <div className="course-standard-example__head">
                <div>
                  <span className="course-standard-example__code">{example.code}</span>
                  <h4>{example.title}</h4>
                </div>
                <span className="course-standard-example__synthetic">合成数据</span>
              </div>
              <dl className="course-standard-example__inputs">
                {example.rows.map((row) => (
                  <div key={`${example.id}-${row.symbol}`}>
                    <dt>
                      {row.label} <code>{row.symbol}</code>
                    </dt>
                    <dd>
                      {row.value} <small>{row.unit}</small>
                    </dd>
                  </div>
                ))}
              </dl>
              <code className="course-standard-example__substitution">{example.substitution}</code>
              <p className="course-standard-example__result">
                计算结果 <strong>{example.resultDisplay}</strong> {example.resultUnit}
              </p>
              <p className="course-standard-example__note">{example.note}</p>
            </article>
          ))}
        </div>
        <p className="course-public-standard__note">{standard.exampleNote}</p>
      </section>

      <section className="course-public-standard__block">
        <h3>出处与核验说明</h3>
        <ul className="course-public-standard__sources">
          {standard.sources.map((source) => (
            <li key={source.id}>
              <div className="course-public-standard__source-head">
                <span
                  className={`course-public-standard__source-kind course-public-standard__source-kind--${source.kind}`}
                >
                  {source.kind === "official" ? "官方标准" : "高校公开教学"}
                </span>
                <strong>{source.label}</strong>
              </div>
              <p className="course-public-standard__source-meta">
                {source.publisher} · {source.date}
              </p>
              <p>{source.note}</p>
              <div className="course-public-standard__source-links">
                <a
                  href={source.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="action-link"
                >
                  {source.kind === "official" ? "打开标准页" : "打开教学资料"}
                  <ExternalLink size={11} strokeWidth={1.5} aria-hidden="true" />
                </a>
                {source.pdfUrl && (
                  <a
                    href={source.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="action-link"
                  >
                    打开标准 PDF
                    <ExternalLink size={11} strokeWidth={1.5} aria-hidden="true" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="course-rule-note course-rule-note--info">
        <Info size={14} strokeWidth={1.5} aria-hidden="true" />
        <p>{standard.classroomNote}</p>
      </div>
    </section>
  );
}