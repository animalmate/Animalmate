import React from "react";
import { Icon } from "../display/Icon.jsx";

/** 빈 상태: 아이콘 + 제목 + 설명 + 액션 유도 */
export function EmptyState({ icon = "doc", title, description, action, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "48px 24px", gap: 6, ...style }}>
      <span style={{ width: 64, height: 64, borderRadius: 20, background: "var(--blue-50)", color: "var(--blue-400)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
        <Icon name={icon} size={30} strokeWidth={1.6} />
      </span>
      <h3 style={{ margin: 0, font: "var(--text-h3)", color: "var(--text-title)" }}>{title}</h3>
      {description && <p style={{ margin: 0, font: "var(--text-body)", color: "var(--text-muted)", maxWidth: 300 }}>{description}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
