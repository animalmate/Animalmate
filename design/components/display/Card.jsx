import React from "react";

/** 기본 카드 컨테이너. title/action은 옵션 — 있으면 헤더 행이 생긴다. */
export function Card({ title, action, children, padding = 20, style }) {
  return (
    <div style={{ background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card)", padding, ...style }}>
      {(title || action) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          {title ? <h3 style={{ margin: 0, font: "var(--text-h3)", color: "var(--text-title)" }}>{title}</h3> : <span />}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
