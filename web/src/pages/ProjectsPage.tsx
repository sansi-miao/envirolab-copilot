import { useState } from "react";
import {
  ArrowRight,
  Camera,
  Download,
  FileSpreadsheet,
  FlaskConical,
  FolderOpen,
  HardDrive,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { PageHeader } from "../components/ui/PageHeader";
import { downloadTextFile } from "../lib/analysis";
import {
  deleteAnalysisSession,
  formatSessionDate,
  listAnalysisSessions,
  type AnalysisSession,
} from "../lib/analysisSessions";
import {
  buildPersonalCsv,
  countFilledPersonalRows,
  deletePersonalExperiment,
  listPersonalExperiments,
  type PersonalExperiment,
} from "../lib/personalExperiments";
import { deletePhotoDraft } from "../lib/photoDrafts";

const CHART_LABELS: Record<string, string> = {
  line: "折线图",
  scatter: "散点图",
  bar: "柱状图",
};

type DeleteTarget =
  | { kind: "analysis"; id: string }
  | { kind: "personal"; id: string }
  | null;

function safeFileStem(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60) || "分析摘要";
}

export function ProjectsPage() {
  const [sessions, setSessions] = useState<AnalysisSession[]>(() => listAnalysisSessions());
  const [personal, setPersonal] = useState<PersonalExperiment[]>(() => listPersonalExperiments());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [error, setError] = useState("");

  function refresh() {
    setSessions(listAnalysisSessions());
    setPersonal(listPersonalExperiments());
  }

  function handleDeleteAnalysis(id: string) {
    try {
      deleteAnalysisSession(id);
      setDeleteTarget(null);
      setError("");
      refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败，请稍后再试。");
    }
  }

  async function handleDeletePersonal(experiment: PersonalExperiment) {
    try {
      deletePersonalExperiment(experiment.id);
      if (experiment.photo) {
        await deletePhotoDraft(experiment.photo.draftId).catch(() => undefined);
      }
      setDeleteTarget(null);
      setError("");
      refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败，请稍后再试。");
    }
  }

  function downloadSummary(session: AnalysisSession) {
    downloadTextFile(
      `${safeFileStem(session.name)}-分析摘要.md`,
      session.summary,
      "text/markdown;charset=utf-8",
    );
  }

  function downloadPersonalCsv(experiment: PersonalExperiment) {
    downloadTextFile(
      `${safeFileStem(experiment.name) || "我的实验"}-实验记录.csv`,
      buildPersonalCsv(experiment),
      "text/csv;charset=utf-8",
    );
  }

  return (
    <div className="page-frame">
      <PageHeader
        eyebrow="Local research records · Browser only"
        title="我的项目"
        description="个人实验和保存过的数据分析都留在这个浏览器里。可以重新打开继续编辑、导出 CSV 或摘要，也可以删除记录。不需要账户，也不会上传原始数据。"
        actions={
          <>
            <span className="status-chip status-chip--positive">
              <ShieldCheck size={12} strokeWidth={1.5} aria-hidden="true" />
              仅本地保存
            </span>
            <a href="#/projects?view=new" className="button button--primary button--small">
              <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
              新建我的实验
            </a>
            <a href="#/analysis" className="button button--secondary button--small">
              <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
              新建数据分析
            </a>
          </>
        }
      />

      <section className="notice-panel mt-5" aria-label="本地存储说明">
        <HardDrive size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
        <div>
          <p className="notice-panel__title">记录和照片保存在当前浏览器</p>
          <p className="notice-panel__text">
            清理浏览器网站数据、切换浏览器或无痕模式，都会让记录消失。重要实验请导出 CSV；分析图表请下载摘要和 SVG 另行保存。
          </p>
        </div>
      </section>

      {error && (
        <div role="alert" className="inline-alert mt-4">
          <p>{error}</p>
        </div>
      )}

      <section className="project-records" aria-labelledby="personal-records-title">
        <div className="project-records__head">
          <h2 id="personal-records-title" className="analysis-panel-title">我的个人实验</h2>
          <span className="analysis-panel-subtitle">
            {personal.length} 份 · 数据与照片只在本机
          </span>
        </div>

        {personal.length === 0 ? (
          <div className="project-empty-state project-empty-state--compact">
            <span className="project-empty-state__icon">
              <FlaskConical size={20} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <h3 className="project-empty-state__title">公共目录找不到实验时，可以自己建一份</h3>
            <p className="project-empty-state__text">
              填一个实验名称就能开始。手填表头和读数，或导入 CSV、TSV 和 Excel 粘贴表格，还可以附一张现场或讲义照片。
            </p>
            <div className="project-empty-state__actions">
              <a href="#/projects?view=new" className="button button--primary">
                <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
                新建我的实验
              </a>
              <a href="#/experiments" className="button button--secondary">
                <FlaskConical size={14} strokeWidth={1.5} aria-hidden="true" />
                先查公共实验档案
              </a>
            </div>
            <div className="project-empty-state__steps">
              <span>1. 填写实验名称</span>
              <span>2. 手填或导入数据</span>
              <span>3. 导出 CSV</span>
            </div>
          </div>
        ) : (
          <ul className="project-list">
            {personal.map((experiment) => (
              <li key={experiment.id} className="project-record">
                <span className="project-record__icon">
                  <FlaskConical size={16} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div className="project-record__body">
                  <div className="project-record__title-row">
                    <h3 className="project-record__name">{experiment.name}</h3>
                    {experiment.source === "import" && (
                      <span className="project-record__tag">
                        <FileSpreadsheet size={11} strokeWidth={1.5} aria-hidden="true" />
                        导入数据
                      </span>
                    )}
                    {experiment.photo && (
                      <span className="project-record__tag">
                        <Camera size={11} strokeWidth={1.5} aria-hidden="true" />
                        含照片
                      </span>
                    )}
                  </div>
                  <p className="project-record__meta">
                    {formatSessionDate(experiment.updatedAt)} · {experiment.rows.length} 行 ×{" "}
                    {experiment.columns.length} 列 · 非空 {countFilledPersonalRows(experiment)} 行
                    {experiment.importedFileName ? ` · ${experiment.importedFileName}` : ""}
                  </p>
                </div>
                <div className="project-record__actions">
                  <a
                    href={`#/projects?experiment=${encodeURIComponent(experiment.id)}`}
                    className="button button--secondary button--small"
                  >
                    打开继续编辑
                  </a>
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    onClick={() => downloadPersonalCsv(experiment)}
                  >
                    <Download size={13} strokeWidth={1.5} aria-hidden="true" />
                    CSV
                  </button>
                  <button
                    type="button"
                    className="button button--quiet button--small project-record__delete"
                    aria-label={`删除实验：${experiment.name}`}
                    onClick={() => setDeleteTarget({ kind: "personal", id: experiment.id })}
                  >
                    <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
                    删除
                  </button>
                </div>
                {deleteTarget?.kind === "personal" && deleteTarget.id === experiment.id && (
                  <div className="project-record__confirm" role="alert">
                    <p>删除后无法恢复，关联照片也会从当前浏览器移除。重要数据请先导出 CSV。</p>
                    <div className="project-record__confirm-actions">
                      <button
                        type="button"
                        className="button button--danger button--small"
                        onClick={() => handleDeletePersonal(experiment)}
                      >
                        确认删除实验
                      </button>
                      <button
                        type="button"
                        className="button button--quiet button--small"
                        onClick={() => setDeleteTarget(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="project-records" aria-labelledby="analysis-records-title">
        <div className="project-records__head">
          <h2 id="analysis-records-title" className="analysis-panel-title">数据分析记录</h2>
          <span className="analysis-panel-subtitle">
            {sessions.length} 条 · 按最近更新排序
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="project-empty-state project-empty-state--compact">
            <span className="project-empty-state__icon">
              <FolderOpen size={20} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <h3 className="project-empty-state__title">还没有保存过数据分析</h3>
            <p className="project-empty-state__text">
              上传一份实验数据，生成图表和质量初检后，点击“保存到我的项目”，记录就会出现在这里。
            </p>
            <div className="project-empty-state__actions">
              <a href="#/analysis" className="button button--primary">
                上传数据开始分析
                <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
              </a>
              <a href="#/experiments" className="button button--secondary">
                <FlaskConical size={14} strokeWidth={1.5} aria-hidden="true" />
                先浏览实验档案
              </a>
            </div>
            <div className="project-empty-state__steps">
              <span>1. 上传 CSV</span>
              <span>2. 选择 X / Y 列</span>
              <span>3. 保存记录</span>
            </div>
          </div>
        ) : (
          <ul className="project-list">
            {sessions.map((session) => (
              <li key={session.id} className="project-record">
                <span className="project-record__icon">
                  <FileSpreadsheet size={16} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div className="project-record__body">
                  <div className="project-record__title-row">
                    <h3 className="project-record__name">{session.name}</h3>
                    {session.experimentName && session.experimentId && (
                      <a
                        href={`#/experiments?id=${encodeURIComponent(session.experimentId)}`}
                        className="project-record__experiment"
                      >
                        <FlaskConical size={11} strokeWidth={1.5} aria-hidden="true" />
                        {session.experimentName}
                      </a>
                    )}
                  </div>
                  <p className="project-record__meta">
                    {formatSessionDate(session.updatedAt)} · {session.rows.length.toLocaleString("zh-CN")} 行 ×{" "}
                    {session.headers.length} 列 · {CHART_LABELS[session.config.chartType] ?? "图表"} ·{" "}
                    {session.fileName}
                  </p>
                </div>
                <div className="project-record__actions">
                  <a
                    href={`#/analysis?session=${encodeURIComponent(session.id)}${
                      session.experimentId ? `&experiment=${encodeURIComponent(session.experimentId)}` : ""
                    }`}
                    className="button button--secondary button--small"
                  >
                    打开分析
                  </a>
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    onClick={() => downloadSummary(session)}
                  >
                    <Download size={13} strokeWidth={1.5} aria-hidden="true" />
                    摘要
                  </button>
                  <button
                    type="button"
                    className="button button--quiet button--small project-record__delete"
                    aria-label={`删除记录：${session.name}`}
                    onClick={() => setDeleteTarget({ kind: "analysis", id: session.id })}
                  >
                    <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
                    删除
                  </button>
                </div>
                {deleteTarget?.kind === "analysis" && deleteTarget.id === session.id && (
                  <div className="project-record__confirm" role="alert">
                    <p>删除后无法恢复。重要结果请先下载摘要和图表。</p>
                    <div className="project-record__confirm-actions">
                      <button
                        type="button"
                        className="button button--danger button--small"
                        onClick={() => handleDeleteAnalysis(session.id)}
                      >
                        确认删除
                      </button>
                      <button
                        type="button"
                        className="button button--quiet button--small"
                        onClick={() => setDeleteTarget(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}