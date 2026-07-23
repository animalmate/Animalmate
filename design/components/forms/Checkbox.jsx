import React from "react";

/** 체크박스 + 라벨 (터치 타깃 44px) */
export function Checkbox({ label, checked, onChange, disabled = false, style }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, minHeight: 44, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, font: "var(--text-body)", color: "var(--text-title)", ...style }}>
      <span style={{ position: "relative", width: 22, height: 22, flex: "none" }}>
        <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled}
          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "inherit", margin: 0 }} />
        <span style={{
          position: "absolute", inset: 0, borderRadius: 7, transition: "background .15s, border-color .15s",
          border: `1.5px solid ${checked ? "var(--color-primary)" : "var(--border-strong)"}`,
          background: checked ? "var(--color-primary)" : "var(--surface-card)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {checked && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
        </span>
      </span>
      {label}
    </label>
  );
}
