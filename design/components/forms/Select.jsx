import React from "react";

/** 셀렉트(드롭다운). options: [{value, label}] 또는 문자열 배열 */
export function Select({ options = [], placeholder, invalid = false, style, ...rest }) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select aria-invalid={invalid || undefined} style={{
        height: "var(--control-h)", padding: "0 40px 0 14px", borderRadius: "var(--radius-md)",
        border: `1.5px solid ${invalid ? "var(--error-600)" : "var(--border-default)"}`,
        background: "var(--surface-card)", font: "var(--text-body)", color: "var(--text-title)",
        width: "100%", appearance: "none", WebkitAppearance: "none", cursor: "pointer", ...style,
      }} {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const v = typeof o === "string" ? { value: o, label: o } : o;
          return <option key={v.value} value={v.value}>{v.label}</option>;
        })}
      </select>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
