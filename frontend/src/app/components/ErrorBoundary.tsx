import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught React ErrorBoundary exception:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="w-full h-full min-h-[60vh] flex flex-col items-center justify-center p-6 text-center select-none">
          <div
            className="clay-card p-8 max-w-md w-full flex flex-col items-center"
            style={{ borderRadius: 28 }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 22,
                background: "linear-gradient(135deg, #FEE2E2 0%, #FCA5A5 100%)",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 6px 16px rgba(239, 68, 68, 0.25)",
                marginBottom: 16,
              }}
            >
              <AlertTriangle size={32} className="text-[#DC2626]" />
            </div>

            <h2 className="text-[20px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] mb-2">
              Something unexpected happened
            </h2>

            <p className="text-[13px] text-[#7A748A] dark:text-[#9E98B4] leading-relaxed mb-6">
              Aura encountered a temporary interface issue. Your conversation and account data are completely safe.
            </p>

            {this.state.error && (
              <div className="w-full clay-card-flat p-3 text-left mb-6 overflow-hidden">
                <p className="text-[11px] font-mono text-[#DC2626] truncate">
                  {this.state.error.message || "Unknown error"}
                </p>
              </div>
            )}

            <div className="flex gap-3 w-full">
              <button
                onClick={this.handleReset}
                className="clay-button flex-1 py-2.5 px-4 rounded-full font-bold text-xs text-[#7B59DC] flex items-center justify-center gap-2 cursor-pointer border-none outline-none"
              >
                <RefreshCw size={14} />
                Try Again
              </button>

              <button
                onClick={this.handleReload}
                className="clay-card-flat flex-1 py-2.5 px-4 rounded-full font-bold text-xs text-[#4B4B60] dark:text-[#D8D2E8] flex items-center justify-center gap-2 cursor-pointer border-none outline-none"
              >
                <Home size={14} />
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
