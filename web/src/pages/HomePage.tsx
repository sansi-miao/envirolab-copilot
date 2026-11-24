import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Copy,
  FileCode2,
  FlaskConical,
  FolderKanban,
  LineChart,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

import { ExperimentCard } from "../components/experiments/ExperimentCard";
import { QuestionComposer } from "../components/research/QuestionComposer";
import { SectionHeading } from "../components/ui/SectionHeading";
import { SignalMark } from "../components/ui/SignalMark";
import { countAnalysisSessions } from "../lib/analysisSessions";
import {
  getDisciplines,
  getExperiments,
  isStaticCatalogMode,
  type ExperimentSummary,
} from "../lib/experiments";

interface HomeOverview {
  experiments: ExperimentSummary[];
  total: number;
  disciplines: number;
}

const checks = [
  {
    icon: AlertTriangle,
    title: "缺失值与无效数字",
    text: "标出空单元格、占位符和无法解析的数值，避免它们被静默忽略。",
  },
  {
    icon: Copy,
    title: "完全重复的行",
    text: "发现重复录入的数据，避免同一个点被重复计入统计。",
  },
  {
    icon: Activity,
    title: "异常值与离散程度",
    text: "用四分位距提示偏离较大的值，并计算标准差和变异系数。",
  },
  {
    icon: LineChart,
    title: "线性拟合质量",
    text: "数值型 X、Y 会给出斜率、截距、R² 与相关系数，并注明外推边界。",
  },
];

export function HomePage({ onAskQuestion }: { onAskQuestion: (question: string) => void }) {
  const staticMode = isStaticCatalogMode();
  const [overview, setOverview] = useState<HomeOverview | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [savedCount] = useState(() => countAnalysisSessions());

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    Promise.all([
      getDisciplines(controller.signal),
      getExperiments({ limit: 3 }, controller.signal),
    ])
      .then(([disciplines, experiments]) => {
        if (controller.signal.aborted) return;
        setOverview({
          experiments: experiments.items,
          total: experiments.total,
          disciplines: disciplines.length,
        });
      })
      .catch((requestError: Error) => {
        if (!controller.signal.aborted) setError(requestError.message);
      });
    return () => controller.abort();
  }, [retryKey]);

  function selectExperiment(id: string) {
    window.location.hash = `/experiments?id=${encodeURIComponent(id)}`;
  }

  return (
    <div className="page-frame home-focus">
      <section className="home-intro">
        <div className="home-copy">
          <p className="eyebrow">
            <SignalMark />
            大学实验课程 · 科研训练
          </p>
          <h1 className="home-title">
            <span className="home-title__line">查实验，传数据，</span>
            <span className="home-title__line">看懂结果。</span>
          </h1>
          <p className="home-lede">
            面向大学实验课程的科研工作流：从研究问题出发检索文献，查阅真实实验步骤，上传数据生成图表并检查质量。
          </p>

          <QuestionComposer onSubmit={onAskQuestion} />

          <div className="home-actions">
            <a href="#/analysis" className="button button--primary home-actions__primary">
              <UploadCloud size={15} strokeWidth={1.5} aria-hidden="true" />
              上传数据开始分析
            </a>
            <a href="#/experiments" className="button button--secondary">
              <FlaskConical size={15} strokeWidth={1.5} aria-hidden="true" />
              浏览实验档案
            </a>
          </div>

          <p className="home-note">
            <ShieldCheck size={13} strokeWidth={1.5} aria-hidden="true" />
            支持 CSV、TSV 与 Excel 粘贴 · 文件不上传服务器 · 无需账户
          </p>

          <div className="home-quick">
            <a href="#/projects" className="home-quick__link">
              <FolderKanban size={13} strokeWidth={1.5} aria-hidden="true" />
              我的项目
              {savedCount > 0 && <span className="home-quick__count">{savedCount}</span>}
            </a>
            <span className="home-quick__meta">
              {overview
                ? `${overview.total} 份公开实验档案 · ${overview.disciplines} 个学科`
                : "正在读取实验档案概览…"}
            </span>
          </div>
        </div>

        <aside className="home-workflow" aria-labelledby="workflow-title">
          <div className="home-workflow__head">
            <div>
              <p className="home-workflow__label">一次完整的实验数据分析</p>
              <h2 id="workflow-title" className="home-workflow__title">从方法到图表，三步完成</h2>
            </div>
            <span className="status-chip status-chip--positive">
              <span className="status-dot status-dot--online" aria-hidden="true" />
              当前可用
            </span>
          </div>

          <div className="workflow-steps">
            <a href="#/experiments" className="workflow-step">
              <span className="workflow-step__num">1</span>
              <span className="workflow-step__body">
                <strong>查实验方法和变量</strong>
                <small>实验步骤、材料仪器、公式适用条件与文献来源</small>
              </span>
              <span className="workflow-step__meta">
                {overview ? `${overview.total} 份档案` : "实验档案"}
              </span>
              <ArrowRight size={13} strokeWidth={1.5} className="workflow-step__arrow" aria-hidden="true" />
            </a>

            <a href="#/analysis" className="workflow-step">
              <span className="workflow-step__num">2</span>
              <span className="workflow-step__body">
                <strong>上传实验数据</strong>
                <small>CSV、TSV，或从 Excel 直接复制粘贴</small>
              </span>
              <span className="workflow-step__meta">本地解析</span>
              <ArrowRight size={13} strokeWidth={1.5} className="workflow-step__arrow" aria-hidden="true" />
            </a>

            <a href="#/analysis" className="workflow-step">
              <span className="workflow-step__num">3</span>
              <span className="workflow-step__body">
                <strong>生成图表与质量初检</strong>
                <small>折线、散点、柱状图，附缺失、重复、异常值与拟合结果</small>
              </span>
              <span className="workflow-step__meta">自动完成</span>
              <ArrowRight size={13} strokeWidth={1.5} className="workflow-step__arrow" aria-hidden="true" />
            </a>
          </div>

          <p className="home-workflow__note">
            <ShieldCheck size={12} strokeWidth={1.5} aria-hidden="true" />
            质量初检帮助你发现数据问题，不替代统计检验和导师判断。
          </p>

          <a href="#/agent-workflow" className="home-workflow__template">
            <FileCode2 size={13} strokeWidth={1.5} aria-hidden="true" />
            把完整科研工作流交给你的 Agent
            <ArrowRight size={12} strokeWidth={1.5} aria-hidden="true" />
          </a>
        </aside>
      </section>

      <section className="home-section" aria-labelledby="featured-title">
        <SectionHeading
          eyebrow="Start from a real protocol"
          title="从一份真实实验开始"
          description="每条档案都可以查看完整步骤、变量、公式和原始来源。查到方法后，直接上传你的实验数据。"
          action={
            <a href="#/experiments" className="action-link">
              查看全部实验档案
              <ArrowRight size={12} strokeWidth={1.5} aria-hidden="true" />
            </a>
          }
        />

        {error && (
          <div role="alert" className="inline-alert mt-4">
            <AlertTriangle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p>实验档案暂时读取失败：{error}</p>
              <button
                type="button"
                className="action-link mt-2"
                onClick={() => setRetryKey((value) => value + 1)}
              >
                重新读取
              </button>
            </div>
          </div>
        )}

        {!error && !overview && (
          <div className="home-featured home-featured--loading" aria-hidden="true">
            {[0, 1, 2].map((item) => (
              <div key={item} className="home-skeleton" />
            ))}
          </div>
        )}

        {overview && (
          <div className="home-featured">
            {overview.experiments.map((experiment, index) => (
              <ExperimentCard
                key={experiment.id}
                experiment={experiment}
                index={index}
                onSelect={selectExperiment}
              />
            ))}
          </div>
        )}
      </section>

      <section className="home-section" aria-labelledby="checks-title">
        <SectionHeading
          eyebrow="What gets checked"
          title="上传后会检查什么"
          description="这些都是数据层面的基础检查，结果会逐条列出，不会用一个“可靠/不可靠”的模糊分数掩盖问题。"
        />
        <div className="home-checks">
          {checks.map((check) => {
            const Icon = check.icon;
            return (
              <article key={check.title} className="home-check">
                <span className="home-check__icon">
                  <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <h3 className="home-check__title">{check.title}</h3>
                <p className="home-check__text">{check.text}</p>
              </article>
            );
          })}
        </div>
        <div className="home-checks__action">
          <a href="#/analysis" className="button button--primary button--small">
            用一份数据试试
            <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
          </a>
          <span>文件在当前浏览器内解析，关闭页面后不会留在服务器上。</span>
        </div>
      </section>

      <section className="home-upcoming" aria-label="当前版本">
        <span className="home-upcoming__label">当前版本</span>
        <p>
          {staticMode
            ? "课程支持悬浮固体、浊度和 SO₂ 的计算与图表。静态版文献页提供外部检索入口，检索结果在外部网站查看。AI 摘要、全文阅读和知识数据库尚未接入。"
            : "课程支持悬浮固体、浊度和 SO₂ 的计算与图表。文献页可检索 Crossref 题录并打开原始来源。AI 摘要、全文阅读和知识数据库尚未接入。"}
        </p>
      </section>
    </div>
  );
}
