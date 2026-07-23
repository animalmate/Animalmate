import React from "react";

/** 주요 버튼. variant: primary|secondary|destructive|text · size: md|sm · loading 스피너 */
export function Button({ variant = "primary", size = "md", loading = false, disabled = false, icon, block = false, children, style, ...rest }) {
  const h = size === "sm" ? "var(--control-h-sm)" : "var(--control-h)";
  const pad = size === "sm" ? "0 14px" : "0 18px";
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    height: h, minHeight: h, padding: pad, borderRadius: "var(--radius-md)",
    font: "var(--text-btn)", cursor: disabled || loading ? "not-allowed" : "pointer",
    border: "1px solid transparent", transition: "background .15s, color .15s, border-color .15s",
    width: block ? "100%" : "auto", whiteSpace: "nowrap", opacity: disabled ? 0.5 : 1,
  };
  const V = {
    primary: { background: "var(--color-primary)", color: "var(--text-on-primary)" },
    secondary: { background: "var(--surface-card)", color: "var(--text-title)", borderColor: "var(--border-strong)" },
    destructive: { background: "var(--error-600)", color: "#fff" },
    text: { background: "transparent", color: "var(--text-link)", height: "auto", minHeight: 0, padding: size === "sm" ? "4px 6px" : "6px 8px" },
  };
  return (
    <button disabled={disabled || loading} style={{ ...base, ...V[variant], ...style }} {...rest}>
      {loading && <span style={{ width: 16, height: 16, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: 99, animation: "am-spin .7s linear infinite", opacity: 0.9 }} />}
      {!loading && icon}
      {children}
    </button>
  );
}
