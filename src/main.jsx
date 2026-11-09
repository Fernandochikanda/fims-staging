import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Top-level error boundary — catches any error that the page-level
// PageErrorBoundary doesn't catch (e.g. during login transition, or
// errors outside the page content area). Shows a friendly error screen
// instead of a blank white page.
class TopLevelErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[TopLevelError]", error, errorInfo);
  }

  handleReload = () => {
    localStorage.removeItem("fims_current_user");
    localStorage.removeItem("fims_current_page");
    location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          justifyContent: "center", alignItems: "center", background: "#f3f4f6", padding: 20,
        }}>
          <div style={{
            background: "#fff", padding: 32, borderRadius: 12, maxWidth: 400,
            boxShadow: "0 4px 6px rgba(0,0,0,0.05)", textAlign: "center",
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: "#A32D2D" }}>
              Algo deu errado
            </h2>
            <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
              {this.state.error?.message || "Erro desconhecido"}
            </p>
            <button
              onClick={this.handleReload}
              style={{
                padding: "10px 20px", background: "#1E2A3A", color: "#fff",
                border: "none", borderRadius: 6, cursor: "pointer",
                fontSize: 14, fontWeight: 500,
              }}
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TopLevelErrorBoundary>
      <App />
    </TopLevelErrorBoundary>
  </React.StrictMode>
);
