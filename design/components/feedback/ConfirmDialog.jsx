import React from "react";
import { Button } from "../buttons/Button.jsx";

/** 확인 다이얼로그. danger=true면 확인 버튼이 destructive */
export function ConfirmDialog({ open = true, title, description, confirmLabel = "확인", cancelLabel = "취소", danger = false, loading = false, onConfirm, onCancel, children }) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(46,41,33,.45)" }}
      onClick={(e) => e.target === e.currentTarget && onCancel && onCancel()}>
      <div style={{ width: "100%", maxWidth: 400, background: "var(--surface-card)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-modal)", padding: 24 }}>
        <h2 style={{ margin: 0, font: "var(--text-h2)", color: "var(--text-title)" }}>{title}</h2>
        {description && <p style={{ margin: "10px 0 0", font: "var(--text-body)", color: "var(--text-body)" }}>{description}</p>}
        {children}
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <Button variant="secondary" block onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={danger ? "destructive" : "primary"} block loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
