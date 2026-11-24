import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RotateCcw, ShieldCheck } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error && error.message ? error.message : "页面遇到了未预期的错误。",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route render error", error, info.componentStack);
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: "" });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: "" });
  };

  private handleHome = () => {
    window.location.hash = "/home";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="page-frame">
        <section className="route-error" role="alert" aria-labelledby="route-error-title">
          <span className="route-error__icon" aria-hidden="true">
            <AlertTriangle size={22} strokeWidth={1.5} />
          </span>
          <div className="route-error__body">
            <p className="eyebrow">页面错误隔离</p>
            <h1 id="route-error-title" className="route-error__title">
              当前页面没有正常加载
            </h1>
            <p className="route-error__text">
              导航和其他页面仍然可用。已保存的数值草稿和图片草稿不会被这个错误清理。
            </p>
            <p className="route-error__detail">{this.state.message}</p>
            <div className="route-error__actions">
              <button type="button" className="button button--primary" onClick={this.handleRetry}>
                <RotateCcw size={14} strokeWidth={1.5} aria-hidden="true" />
                重新尝试
              </button>
              <button type="button" className="button button--secondary" onClick={this.handleHome}>
                <Home size={14} strokeWidth={1.5} aria-hidden="true" />
                回到科研概览
              </button>
            </div>
            <p className="route-error__hint">
              <ShieldCheck size={13} strokeWidth={1.5} aria-hidden="true" />
              如果重复出现，可先导出其他页面的记录，再刷新浏览器。
            </p>
          </div>
        </section>
      </div>
    );
  }
}