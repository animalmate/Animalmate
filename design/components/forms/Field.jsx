import React from "react";

/** 라벨 + 힌트 + 오류를 감싸는 폼 필드 래퍼 */
export function Field({ label, hint, error, required = false, htmlFor, children, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label && (
        <label htmlFor={htmlFor} style={{ font: "var(--text-label)", color: "var(--text-title)" }}>
          {label}{required && <span style={{ color: "var(--error-600)", marginLeft: 3 }}>*</span>}
        </label>
      )}
      {children}
      {error
        ? <p role="alert" style={{ margin: 0, font: "var(--text-caption)", color: "var(--error-600)" }}>{error}</p>
        : hint && <p style={{ margin: 0, font: "var(--text-caption)", color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  );
}
