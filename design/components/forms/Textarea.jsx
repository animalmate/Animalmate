import React from "react";

/** 여러 줄 입력 (본문 양식 등) */
export function Textarea({ invalid = false, rows = 5, style, ...rest }) {
  return <textarea rows={rows} aria-invalid={invalid || undefined} style={{
    padding: "12px 14px", borderRadius: "var(--radius-md)", resize: "vertical",
    border: `1.5px solid ${invalid ? "var(--error-600)" : "var(--border-default)"}`,
    background: "var(--surface-card)", font: "var(--text-body)", color: "var(--text-title)",
    width: "100%", lineHeight: 1.6, transition: "border-color .15s", ...style,
  }} {...rest} />;
}
