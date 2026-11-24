import { BookOpen, Compass, FlaskConical, LineChart } from "lucide-react";

import { SignalMark } from "../ui/SignalMark";

export type ResearchOverview = {
  experiments: number | null;
  disciplines: number | null;
  verifiedSources: number | null;
};

export function WorkflowPreview({ overview }: { overview: ResearchOverview }) {
  const archiveCount = overview.experiments === null ? "—" : String(overview.experiments);
  const disciplineCount = overview.disciplines === null ? "—" : String(overview.disciplines);
  const verifiedCount = overview.verifiedSources === null ? "—" : String(overview.verifiedSources);

  const stages = [
    {
      title: "研究问题已形成",
      detail: "变量、现象和研究意图被保留在同一个上下文",
      state: "Ready",
      tone: "ready",
      icon: Compass,
    },
    {
      title: "文献证据检索",
      detail: "OpenAlex · Crossref · Europe PMC",
      state: "Planned",
      tone: "planned",
      icon: BookOpen,
    },
    {
      title: "实验档案匹配",
      detail: `${archiveCount} 个可追溯记录 · ${disciplineCount} 个学科`,
      state: "Available",
      tone: "available",
      icon: FlaskConical,
    },
    {
      title: "确定性与结果解释",
      detail: "Python 计算模块、单位校验与适用条件",
      state: "Planned",
      tone: "planned",
      icon: LineChart,
    },
  ];

  return (
    <section aria-label="科研工作流预览" className="trace-panel">
      <div className="trace-head">
        <div>
          <p className="trace-kicker">Research trace</p>
          <h2 className="trace-title">From question to evidence</h2>
        </div>
        <span className="trace-mode">Workflow preview</span>
      </div>

      <div className="trace-question">
        <p className="trace-question__label">示例研究问题</p>
        <p className="trace-question__text">温度如何影响水的黏度，并改变管道流动阻力？</p>
        <div className="trace-vars" aria-label="研究变量">
          <span className="trace-var">temperature</span>
          <span className="trace-var">viscosity</span>
          <span className="trace-var">pressure drop</span>
        </div>
      </div>

      <ol className="trace-stages">
        {stages.map((stage) => {
          const Icon = stage.icon;
          return (
            <li key={stage.title} className={`trace-stage trace-stage--${stage.tone}`}>
              <span className="trace-stage__icon">
                <Icon size={13} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <div className="trace-stage__body">
                <div className="trace-stage__top">
                  <h3 className="trace-stage__title">{stage.title}</h3>
                  <span className="trace-stage__state">{stage.state}</span>
                </div>
                <p className="trace-stage__detail">{stage.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="trace-footer">
        <SignalMark />
        <span>每条结果都保留证据与适用边界</span>
        <span className="trace-footer__count">{verifiedCount} source-linked</span>
      </div>
    </section>
  );
}