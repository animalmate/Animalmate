import React from "react";
import { Icon } from "../display/Icon.jsx";

/** 토스트 1개 (표시 자체는 상위에서 fixed 컨테이너로) */
export function Toast({ kind = "info", children, onClose, style }) {
  const M = {
    success: ["check", "var(--success-600)"],
    error: ["alert", "var(--error-600)"],
    info: ["info", "var(--info-600)"],
  };
  const [icon, color] = M[kind] || M.info;
  return (
    <div role="status" style={{
      display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", minHeight: 48,
      background: "var(--ink-900)", color: "#fff", borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-raised)", font: "var(--text-body)", maxWidth: 420,
      animation: "am-toast-in .2s ease-out", ...style,
    }}>
      <span style={{ color, background: "#fff", borderRadius: 99, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <Icon name={icon} size={14} strokeWidth={2.4} />
      </span>
      <span style={{ flex: 1 }}>{children}</span>
      {onClose && (
        <button onClick={onClose} aria-label="닫기" style={{ border: "none", background: "transparent", color: "rgba(255,255,255,.7)", cursor: "pointer", padding: 4, display: "flex" }}>
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}
