import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, Menu, Settings, ShieldCheck, X } from "lucide-react";

import { BackendStatus } from "../BackendStatus";
import { SignalMark } from "../ui/SignalMark";
import {
  getNavigationItem,
  navigation,
  navigationGroups,
  type NavigationItem,
  type RouteId,
} from "../../lib/navigation";

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <a href="#/" onClick={onNavigate} className="brand">
      <span className="brand-mark" aria-hidden="true">
        <SignalMark />
      </span>
      <span>
        <span className="brand-name">EnviroLab Copilot</span>
        <span className="brand-subtitle">Research intelligence platform</span>
      </span>
    </a>
  );
}

function Navigation({
  route,
  onNavigate,
}: {
  route: RouteId;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="核心功能">
      {navigationGroups.map((group) => {
        const items = navigation.filter((item) => item.group === group);
        return (
          <div key={group} className="nav-group">
            <p className="nav-group-label">{group}</p>
            <ul className="nav-list">
              {items.map((item) => {
                const Icon = item.icon;
                const active = item.id === route;
                return (
                  <li key={item.id}>
                    <a
                      href={`#/${item.id}`}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      title={item.available ? undefined : "该功能尚未开放"}
                      className={`nav-link ${item.available ? "" : "nav-link--planned"}`}
                    >
                      <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                      <span>{item.label}</span>
                      <span className="nav-link__english" aria-hidden="true">{item.english}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function WorkspaceFooter() {
  return (
    <div className="sidebar-footer">
      <div className="sidebar-status">
        <div className="sidebar-status__label">
          <span className="sidebar-status__eyebrow">系统状态</span>
          <BackendStatus />
        </div>
        <p className="sidebar-status__text">公开实验档案 · 本地数据分析</p>
      </div>
      <div className="workspace-user">
        <span className="workspace-user__avatar" aria-hidden="true">G</span>
        <div className="min-w-0">
          <p className="workspace-user__name">Guest workspace</p>
          <p className="workspace-user__meta">本地记录 · 无需账户</p>
        </div>
        <button
          type="button"
          className="icon-button ml-auto"
          disabled
          title="账户系统接入后开放设置"
          aria-label="设置暂不可用"
        >
          <Settings size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function Topbar({
  current,
  onOpenMenu,
}: {
  current: NavigationItem;
  onOpenMenu: () => void;
}) {
  return (
    <header className="app-topbar">
      <div className="app-topbar__inner">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="icon-button mobile-menu-button"
            aria-label="打开功能导航"
            onClick={onOpenMenu}
          >
            <Menu size={17} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <div className="breadcrumb">
            <span className="hidden sm:inline">Research workspace</span>
            <ChevronRight size={12} strokeWidth={1.5} className="hidden text-ink-300 sm:block" aria-hidden="true" />
            <span className="breadcrumb__current">{current.english}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="topbar-badge">
            <ShieldCheck size={12} strokeWidth={1.5} aria-hidden="true" />
            数据本地处理
          </span>
          <span className="hidden sm:block">
            <BackendStatus showLabel={false} />
          </span>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ route, children }: { route: RouteId; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const current = getNavigationItem(route);

  useEffect(() => setMenuOpen(false), [route]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <a href="#main-content" className="skip-link">跳到主要内容</a>

      <aside className="app-sidebar">
        <Brand />
        <Navigation route={route} />
        <WorkspaceFooter />
      </aside>

      <div className="workspace-shell">
        <Topbar current={current} onOpenMenu={() => setMenuOpen(true)} />
        <main id="main-content" className="workspace-main" tabIndex={-1}>
          <div key={route} className="page-enter">{children}</div>
        </main>
      </div>

      {menuOpen && (
        <div className="mobile-nav-backdrop">
          <button
            type="button"
            aria-label="关闭功能导航"
            className="absolute inset-0"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="mobile-nav" role="dialog" aria-modal="true" aria-label="功能导航">
            <div className="mobile-nav__head">
              <Brand onNavigate={() => setMenuOpen(false)} />
              <button
                type="button"
                aria-label="关闭功能导航"
                className="icon-button"
                onClick={() => setMenuOpen(false)}
              >
                <X size={17} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
            <Navigation route={route} onNavigate={() => setMenuOpen(false)} />
            <WorkspaceFooter />
          </aside>
        </div>
      )}
    </div>
  );
}