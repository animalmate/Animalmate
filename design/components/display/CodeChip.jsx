import React from "react";

/** 인라인 코드/플레이스홀더 칩: {{간결_날짜}} 등 */
export function CodeChip({ children, hint, style }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, ...style }}>
      <code style={{ font: "var(--text-code)", background: "var(--surface-sunken)", border: "1px solid var(--border-default)", borderRadius: 6, padding: "1px 7px", color: "var(--ink-700)", whiteSpace: "nowrap" }}>{children}</code>
      {hint && <span style={{ font: "var(--text-caption)", color: "var(--text-muted)" }}>{hint}</span>}
    </span>
  );
}
