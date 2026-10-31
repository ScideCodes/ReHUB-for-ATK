import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "./Button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught application error:", error, errorInfo);
  }

  private handleReset = () => {
    try {
      window.localStorage.removeItem("atk-hub-session");
      window.localStorage.removeItem("atk-hub-finish");
    } catch { /* Reload still works when browser storage is blocked. */ }
    window.location.reload();
  };

  private handleReload = () => {
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "var(--hub-bg, #07090e)",
            color: "var(--hub-text, #f0f4fc)",
            fontFamily: "var(--font-sans, system-ui, sans-serif)",
          }}
        >
          <div
            style={{
              maxWidth: "480px",
              width: "100%",
              padding: "32px",
              borderRadius: "20px",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              backdropFilter: "blur(20px)",
              textAlign: "center",
              boxShadow: "0 16px 40px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.12)",
                color: "#ef4444",
                marginBottom: "16px",
              }}
            >
              <AlertTriangle size={24} />
            </div>
            <h1
              style={{
                fontSize: "18px",
                fontWeight: 600,
                margin: "0 0 8px 0",
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                fontSize: "13px",
                lineHeight: "1.5",
                color: "var(--hub-text-muted, #8b9bb4)",
                margin: "0 0 20px 0",
              }}
            >
              {this.state.error?.message ||
                "An unexpected error interrupted the configurator."}
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
              }}
            >
              <Button
                variant="ghost"
                icon={<RefreshCw size={15} />}
                onClick={this.handleReload}
              >
                Reload
              </Button>
              <Button
                variant="secondary"
                icon={<RotateCcw size={15} />}
                onClick={this.handleReset}
              >
                Reset session
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
