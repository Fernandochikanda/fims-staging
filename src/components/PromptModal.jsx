// /src/components/PromptModal.jsx
// Replaces native window.prompt() and window.confirm() with a proper modal.
//
// Usage (driven by App.jsx state, see showPrompt/showConfirm helpers):
//   <PromptModal
//     title="Recusar Tarefa"
//     message="Indique o motivo da recusa:"
//     placeholder="Ex: Conflito de agenda..."
//     confirmLabel="Recusar"
//     danger
//     requireInput           // confirm button disabled until input non-empty
//     showInput              // false = confirm-style (no text field)
//     onConfirm={(value) => ...}   // value is string (prompt) or true (confirm)
//     onCancel={() => ...}
//   />

import { useState, useEffect, useRef } from "react";
import { Icon } from "../lib/icons";

export default function PromptModal({
  title,
  message,
  placeholder = "",
  defaultValue = "",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  requireInput = false,
  showInput = true,
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  const trimmed = (value || "").trim();
  const canSubmit = !requireInput || trimmed.length > 0;

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm(showInput ? trimmed : true);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) handleConfirm();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div
            style={{
              fontSize: 15,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: danger ? "#A32D2D" : undefined,
            }}
          >
            {danger && <Icon name="alert" size={16} />}
            {title}
          </div>
          <button className="icon-btn" onClick={onCancel}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-body">
          {message && (
            <div style={{ fontSize: 14, color: "#374151", marginBottom: 12, lineHeight: 1.5 }}>
              {message}
            </div>
          )}
          {showInput && (
            <input
              ref={inputRef}
              type="text"
              className="form-input"
              value={value}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{ width: "100%" }}
            />
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className="btn"
            disabled={!canSubmit}
            onClick={handleConfirm}
            style={
              danger
                ? { background: "#A32D2D", color: "#fff", opacity: canSubmit ? 1 : 0.5 }
                : undefined
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
