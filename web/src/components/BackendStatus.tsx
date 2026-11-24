import { useEffect, useState } from "react";

import { getApiBase, isStaticCatalogMode } from "../lib/experiments";

type Status = "checking" | "online" | "offline" | "static";

const statusContent: Record<Status, { label: string; dot: string; detail: string }> = {
  checking: {
    label: "检测服务",
    dot: "status-dot--checking",
    detail: "正在请求数据服务健康检查",
  },
  online: {
    label: "数据服务正常",
    dot: "status-dot--online",
    detail: "实验档案数据服务健康检查已通过",
  },
  offline: {
    label: "数据服务未连接",
    dot: "status-dot--offline",
    detail: "数据服务未启动或尚未配置",
  },
  static: {
    label: "静态档案可用",
    dot: "status-dot--online",
    detail: "实验档案已随页面打包，无需连接后端服务",
  },
};

export function BackendStatus({ showLabel = true }: { showLabel?: boolean }) {
  const staticMode = isStaticCatalogMode();
  const [status, setStatus] = useState<Status>(staticMode ? "static" : "checking");

  useEffect(() => {
    if (staticMode) return;
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 4000);

    async function checkHealth() {
      try {
        const response = await fetch(`${getApiBase()}/health`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Health check failed");
        const result = await response.json();
        if (result.status !== "ok" || result.service !== "envirolab-copilot-api") {
          throw new Error("Invalid health response");
        }
        setStatus("online");
      } catch {
        if (active) setStatus("offline");
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void checkHealth();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [staticMode]);

  const content = statusContent[status];

  return (
    <div
      className="flex items-center gap-2 text-[10.5px] text-ink-500"
      title={content.detail}
      role="status"
    >
      <span className={`status-dot ${content.dot}`} aria-hidden="true" />
      <span className={showLabel ? "whitespace-nowrap" : "hidden whitespace-nowrap sm:inline"}>
        {content.label}
      </span>
    </div>
  );
}