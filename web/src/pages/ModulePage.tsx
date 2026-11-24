import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FlaskConical,
  FolderKanban,
  LineChart,
  LockKeyhole,
} from "lucide-react";

import { PageHeader } from "../components/ui/PageHeader";
import { getExperiments } from "../lib/experiments";
import type { NavigationItem } from "../lib/navigation";

export function ModulePage({ module }: { module: NavigationItem }) {
  const [archiveTotal, setArchiveTotal] = useState<number | null>(null);
  const Icon = module.icon;

  useEffect(() => {
    const controller = new AbortController();
    getExperiments({ limit: 1 }, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setArchiveTotal(response.total);
      })
      .catch(() => {
        // The page does not invent a count when the archive service is unavailable.
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="page-frame">
      <PageHeader
        eyebrow={`${module.english} · Planned`}
        title={module.title}
        description={module.description}
        actions={
          <>
            <span className="status-chip status-chip--warning">
              <LockKeyhole size={12} strokeWidth={1.5} aria-hidden="true" />
              尚未开放
            </span>
            <a href="#/" className="button button--quiet button--small">
              <ArrowLeft size={13} strokeWidth={1.5} aria-hidden="true" />
              返回概览
            </a>
          </>
        }
      />

      <div className="module-status">
        <section className="module-status__main">
          <span className="module-status__icon">
            <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <p className="module-status__label">开发中</p>
          <h2 className="module-status__title">这个功能还没有接入真实服务</h2>
          <p className="module-status__text">
            我们不会用演示数据或看起来能点、实际没有结果的控件来填充页面。当前可以先完成“查实验 → 传数据 → 看图表”的完整流程。
          </p>

          <div className="module-status__actions">
            <a href="#/experiments" className="button button--primary">
              <FlaskConical size={14} strokeWidth={1.5} aria-hidden="true" />
              浏览实验档案
              {archiveTotal !== null && <span className="button__meta">{archiveTotal} 份</span>}
            </a>
            <a href="#/analysis" className="button button--secondary">
              <LineChart size={14} strokeWidth={1.5} aria-hidden="true" />
              上传数据做分析
            </a>
            <a href="#/projects" className="button button--quiet">
              <FolderKanban size={14} strokeWidth={1.5} aria-hidden="true" />
              我的项目
            </a>
          </div>

          <div className="module-status__flow" aria-label="当前可用流程">
            <span>1 查阅实验方法</span>
            <ArrowRight size={12} strokeWidth={1.5} aria-hidden="true" />
            <span>2 上传实验数据</span>
            <ArrowRight size={12} strokeWidth={1.5} aria-hidden="true" />
            <span>3 图表与质量初检</span>
            <ArrowRight size={12} strokeWidth={1.5} aria-hidden="true" />
            <span>4 保存到我的项目</span>
          </div>
        </section>

        <aside className="module-status__aside">
          <h2 className="aside-panel__title">规划中的能力</h2>
          <ul className="module-status__features">
            {module.features.map((feature, index) => (
              <li key={feature}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {feature}
              </li>
            ))}
          </ul>
          <p className="module-status__note">
            这些能力需要新的后端服务或数据源。当前版本只做前端可验证的部分，不提前承诺结果。
          </p>
        </aside>
      </div>
    </div>
  );
}
