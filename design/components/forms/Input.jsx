import React from "react";

export const inputStyle = (invalid) => ({
  height: "var(--control-h)", padding: "0 14px", borderRadius: "var(--radius-md)",
  border: `1.5px solid ${invalid ? "var(--error-600)" : "var(--border-default)"}`,
  background: "var(--surface-card)", font: "var(--text-body)", color: "var(--text-title)",
  width: "100%", transition: "border-color .15s",
});

/** 텍스트/이메일/숫자/date/time/datetime-local 입력 */
export function Input({ type = "text", invalid = false, style, ...rest }) {
  return <input type={type} aria-invalid={invalid || undefined} style={{ ...inputStyle(invalid), ...style }} {...rest} />;
}
