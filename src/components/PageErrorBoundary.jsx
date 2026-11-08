// /src/components/PageErrorBoundary.jsx
// Page-level ErrorBoundary — catches crashes in a single page WITHOUT
// blanking the whole app. Sidebar + Topbar stay visible and functional.
//
// Usage:
//   <PageErrorBoundary key={page} onBack={() => navigate("dashboard")}>
//     {pageContent}
//   </PageErrorBoundary>
//
// The `key` prop should change when the page changes so the boundary resets.

import { Component } from "react";

export default class PageErrorBoundary extends Component {
  state = { hasError: false, error: null, errorStack: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error, errorStack: error?.stack };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[PageErrorBoundary]", error, errorInfo);
    // Best-effort audit log — don't crash if logging fails
    try {
      const stored = localStorage.getItem("fims_current_user");
      const user = stored ? JSON.parse(stored) : null;
      const userName = user?.name || "Sistema";
      const logEntry = {
        id: Date.now() + Math.random().toString(36).slice(2),
        timestamp: new Date().toISOString(),
        user: userName,
        action: "Erro de Página",
        type: "error",
        detail: `${error?.message || "Erro desconhecido"} — ${window.location.hash || window.location.pathname}`,
      };
      const existing = JSON.parse(localStorage.getItem("fims_logs") || "[]");
      localStorage.setItem("fims_logs", JSON.stringify([logEntry, ...existing].slice(0, 200)));
    } catch (e) {
      // Silent — logging is best-effort
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorStack: null });
  };

  handleBack = () => {
    this.setState({ hasError: false, error: null, errorStack: null });
    if (this.props.onBack) this.props.onBack();
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || "Erro desconhecido";
      return (
        <div
          style={{
            minHeight: "60vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 28,
              borderRadius: 10,
              maxWidth: 480,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h2
              style={{
                fontSize: 17,
                fontWeight: 600,
                marginBottom: 8,
                color: "#A32D2D",
              }}
            >
              Esta página encontrou um erro
            </h2>
            <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>
              A página não pôde ser carregada, mas o resto da aplicação funciona
              normalmente. Pode navegar para outra secção ou tentar novamente.
            </p>
            <p
              style={{
                color: "#9ca3af",
                fontSize: 11,
                marginBottom: 20,
                fontFamily: "monospace",
                background: "#f9fafb",
                padding: "8px 12px",
                borderRadius: 4,
                wordBreak: "break-word",
                maxHeight: 80,
                overflow: "auto",
              }}
            >
              {errorMsg}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="btn btn-secondary" onClick={this.handleRetry}>
                Tentar novamente
              </button>
              <button className="btn btn-primary" onClick={this.handleBack}>
                Voltar ao Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
