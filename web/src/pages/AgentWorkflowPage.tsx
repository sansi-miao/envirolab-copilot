import { useEffect, useState } from "react";
import {
  BookOpenCheck,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  FileCode2,
  Info,
  LayoutTemplate,
  LineChart,
  ListChecks,
  PenLine,
  ShieldCheck,
  Target,
  Terminal,
  Wrench,
} from "lucide-react";

import { PageHeader } from "../components/ui/PageHeader";
import {
  AGENT_WORKFLOW_PROMPT,
  AGENT_WORKFLOW_UPDATED_AT,
  AGENT_WORKFLOW_VERSION,
  agentWorkflowAcceptance,
  agentWorkflowBoundaries,
  agentWorkflowStages,
  agentWorkflowTools,
} from "../lib/agentWorkflow";

const stageIcons = [
  Target,
  BookOpenCheck,
  ClipboardList,
  Terminal,
  LineChart,
  PenLine,
  LayoutTemplate,
];

function buildWorkflowDocument() {
  const stageSections = agentWorkflowStages
    .map(
      (stage, index) =>
        `### ${String(index + 1).padStart(2, "0")} ${stage.title}\n\n${stage.detail}\n\n交付物：${stage.artifacts.join(" · ")}`,
    )
    .join("\n\n");

  const toolRows = agentWorkflowTools
    .map((tool) => `- **${tool.name}**（${tool.level}）：${tool.detail}`)
    .join("\n");

  return [
    "# EnviroLab Copilot Agent 科研工作流模板",
    "",
    `版本：${AGENT_WORKFLOW_VERSION} · 更新：${AGENT_WORKFLOW_UPDATED_AT}`,
    "",
    "这是可以复制到你自己的 Agent 的中文科研工作流提示词。本站只提供模板，不代管模型密钥，也不执行文献检索、计算或排版。",
    "",
    "## 工作流阶段",
    "",
    stageSections,
    "",
    "## 工具与权限",
    "",
    toolRows,
    "",
    "## 硬性边界",
    "",
    ...agentWorkflowBoundaries.map((item) => `- ${item}`),
    "",
    "## 验收标准",
    "",
    ...agentWorkflowAcceptance.map((item) => `- ${item}`),
    "",
    "## 完整提示词",
    "",
    "```text",
    AGENT_WORKFLOW_PROMPT,
    "```",
    "",
  ].join("\n");
}

function WorkflowStageList() {
  return (
    <ol className="agent-stage-list">
      {agentWorkflowStages.map((stage, index) => {
        const Icon = stageIcons[index];
        return (
          <li key={stage.id} className="agent-stage">
            <span className="agent-stage__number">{String(index + 1).padStart(2, "0")}</span>
            <div className="agent-stage__body">
              <div className="agent-stage__top">
                <div>
                  <h3 className="agent-stage__title">
                    <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
                    {stage.title}
                  </h3>
                  <p className="agent-stage__detail">{stage.detail}</p>
                </div>
                <span className="status-chip status-chip--neutral">{stage.gate}</span>
              </div>
              <div className="agent-stage__artifacts" aria-label="阶段交付物">
                {stage.artifacts.map((artifact) => (
                  <code key={artifact} className="agent-stage__artifact">
                    {artifact}
                  </code>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function AgentWorkflowPage() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function handleCopy() {
    setCopyState("idle");
    try {
      await navigator.clipboard.writeText(AGENT_WORKFLOW_PROMPT);
      setCopyState("copied");
      return;
    } catch {
      try {
        const helper = document.createElement("textarea");
        helper.value = AGENT_WORKFLOW_PROMPT;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        const copied = document.execCommand("copy");
        helper.remove();
        if (!copied) throw new Error("copy unavailable");
        setCopyState("copied");
      } catch {
        setCopyState("error");
      }
    }
  }

  function handleDownload() {
    const blob = new Blob([buildWorkflowDocument()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `envirolab-agent-workflow-${AGENT_WORKFLOW_VERSION}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="page-frame agent-workflow-page">
      <PageHeader
        eyebrow="Agent workflow template · Research operations"
        title="把完整科研工作流交给你的 Agent"
        description="一份可复制的通用中文提示词，覆盖检索、全文阅读、证据卡、计算仿真、科研绘图、论文写作和排版交付，并明确每个阶段的人工确认点。"
        actions={
          <>
            <span className="status-chip status-chip--neutral">
              <FileCode2 size={12} strokeWidth={1.5} aria-hidden="true" />
              {AGENT_WORKFLOW_VERSION} · {AGENT_WORKFLOW_UPDATED_AT}
            </span>
            <button type="button" className="button button--primary button--small" onClick={handleCopy}>
              {copyState === "copied" ? (
                <Check size={13} strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Copy size={13} strokeWidth={1.5} aria-hidden="true" />
              )}
              {copyState === "copied" ? "已复制" : "复制提示词"}
            </button>
            <button type="button" className="button button--secondary button--small" onClick={handleDownload}>
              <Download size={13} strokeWidth={1.5} aria-hidden="true" />
              下载 Markdown
            </button>
          </>
        }
      />

      <div className="agent-workflow-notice" role="note">
        <Info size={15} strokeWidth={1.5} aria-hidden="true" />
        <p>
          <strong>这是提示词模板，不是本站已经接入的 AI 服务。</strong>
          复制到你自己的 Agent 后，文献检索、模型推理、MATLAB 和排版能力取决于对方配置了哪些工具与权限。本站不代管 API Key，也不执行这些任务。
        </p>
      </div>

      <div className="agent-workflow-layout">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="agent-panel" aria-labelledby="agent-stages-title">
            <div className="agent-panel__head">
              <div>
                <h2 id="agent-stages-title" className="agent-panel__title">
                  <ClipboardList size={15} strokeWidth={1.5} aria-hidden="true" />
                  七阶段研究流水线
                </h2>
                <p className="agent-panel__intro">
                  每个阶段都有明确交付物和停止条件。阶段 1 的计划、阶段 3 的证据卡、阶段 6 的稿件和最终提交版必须由人确认。
                </p>
              </div>
              <span className="status-chip status-chip--neutral">人工确认贯穿全程</span>
            </div>
            <WorkflowStageList />
          </section>

          <section className="agent-panel agent-prompt" aria-labelledby="agent-prompt-title">
            <div className="agent-panel__head">
              <div>
                <h2 id="agent-prompt-title" className="agent-panel__title">
                  <FileCode2 size={15} strokeWidth={1.5} aria-hidden="true" />
                  完整提示词
                </h2>
                <p className="agent-panel__intro">
                  直接复制给支持工具调用的 Agent。文本框内可滚动查看全文；提示词会先收集研究输入，再按阶段执行，不会跳过缺失数据或访问权限。
                </p>
              </div>
              <div className="agent-prompt__actions">
                <button type="button" className="button button--secondary button--small" onClick={handleCopy}>
                  {copyState === "copied" ? (
                    <Check size={13} strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Copy size={13} strokeWidth={1.5} aria-hidden="true" />
                  )}
                  {copyState === "copied" ? "已复制到剪贴板" : "复制全文"}
                </button>
              </div>
            </div>

            <div className="agent-prompt__code-wrap">
              <pre
                className="agent-prompt__code"
                tabIndex={0}
                aria-label={`Agent 科研工作流提示词，版本 ${AGENT_WORKFLOW_VERSION}`}
              >
                {AGENT_WORKFLOW_PROMPT}
              </pre>
            </div>

            {copyState === "error" && (
              <p className="agent-copy-error" role="alert">
                浏览器没有允许自动复制。请在上方文本框中手动选择全文，或下载 Markdown 文件。
              </p>
            )}

            <p className="agent-prompt__foot">
              <Info size={12} strokeWidth={1.5} aria-hidden="true" />
              版本 {AGENT_WORKFLOW_VERSION} · 更新于 {AGENT_WORKFLOW_UPDATED_AT} ·
              可复制和修改，用于自己的研究项目时请保留来源说明。
            </p>
          </section>

          <section className="agent-panel" aria-labelledby="agent-acceptance-title">
            <h2 id="agent-acceptance-title" className="agent-panel__title">
              <ListChecks size={15} strokeWidth={1.5} aria-hidden="true" />
              交付验收标准
            </h2>
            <p className="agent-panel__intro">
              不是“看起来完成”，而是每项结论、数据、图和方法都能被另一个人复核。
            </p>
            <ul className="agent-acceptance-grid">
              {agentWorkflowAcceptance.map((item) => (
                <li key={item} className="agent-acceptance">
                  <CheckCircle2 size={13} strokeWidth={1.5} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="aside-panel" aria-labelledby="agent-usage-title">
            <h2 id="agent-usage-title" className="aside-panel__title">
              怎么用
            </h2>
            <ol className="agent-usage">
              <li className="agent-usage__item">
                <span className="agent-usage__index">1</span>
                <div className="agent-usage__body">
                  <strong>复制完整提示词</strong>
                  <p>粘贴到 Claude Code、Codex、Cursor 或你自己的 Agent 对话框。</p>
                </div>
              </li>
              <li className="agent-usage__item">
                <span className="agent-usage__index">2</span>
                <div className="agent-usage__body">
                  <strong>补齐研究输入</strong>
                  <p>给主题、数据、目标格式和可用工具，不要让 Agent 自己猜。</p>
                </div>
              </li>
              <li className="agent-usage__item">
                <span className="agent-usage__index">3</span>
                <div className="agent-usage__body">
                  <strong>逐阶段审查产物</strong>
                  <p>先看检索计划和证据卡，再放行计算、绘图和写作。</p>
                </div>
              </li>
            </ol>
          </section>

          <section className="aside-panel" aria-labelledby="agent-tools-title">
            <div className="flex items-center gap-2">
              <Wrench size={15} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
              <h2 id="agent-tools-title" className="aside-panel__title">
                工具与权限
              </h2>
            </div>
            <p className="mt-1 text-[9.5px] leading-4 text-ink-500">
              没有这些工具时，Agent 应明确说明缺口，而不是编造结果。
            </p>
            <div className="agent-tool-list">
              {agentWorkflowTools.map((tool) => (
                <div key={tool.name} className="agent-tool">
                  <div className="agent-tool__top">
                    <span className="agent-tool__name">{tool.name}</span>
                    <span className="agent-tool__level">{tool.level}</span>
                  </div>
                  <p className="agent-tool__detail">{tool.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="notice-panel agent-boundary-panel" aria-labelledby="agent-boundary-title">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} strokeWidth={1.5} className="text-amber" aria-hidden="true" />
              <h2 id="agent-boundary-title" className="notice-panel__title">
                硬性边界
              </h2>
            </div>
            <ul className="agent-boundary-list">
              {agentWorkflowBoundaries.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
