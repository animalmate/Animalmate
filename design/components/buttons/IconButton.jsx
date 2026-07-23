import React from "react";

/** 아이콘 전용 버튼. label(aria) 필수. variant: ghost|solid|danger */
export function IconButton({ icon, label, variant = "ghost", size = 40, style, ...rest }) {
  const V = {
    ghost: { background: "transparent", color: "var(--text-muted)" },
    solid: { background: "var(--surface-sunken)", color: "var(--text-title)" },
    danger: { background: "transparent", color: "var(--error-600)" },
  };
  return (
    <button aria-label={label} title={label} style={{
      width: size, height: size, minWidth: 44, minHeight: 44, display: "inline-flex",
      alignItems: "center", justifyContent: "center", border: "none", borderRadius: "var(--radius-md)",
      cursor: "pointer", transition: "background .15s, color .15s", ...V[variant], ...style,
    }} {...rest}>
      {icon}
    </button>
  );
}
