import React, { useState } from "react";
import { Icon } from "../display/Icon.jsx";

/** 가입코드 복사 버튼. 클릭 시 "복사됨" 2초 표시 */
export function CopyButton({ value, label = "복사", size = "md", style }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    try { navigator.clipboard && navigator.clipboard.writeText(value); } catch (e) {}
    setDone(true); setTimeout(() => setDone(false), 2000);
  };
  const sm = size === "sm";
  return (
    <button onClick={copy} style={{
      display: "inline-flex", alignItems: "center", gap: 6, height: sm ? "var(--control-h-sm)" : "var(--control-h)",
      minHeight: 44, padding: "0 14px", borderRadius: "var(--radius-md)", cursor: "pointer",
      border: "1px solid var(--border-strong)", background: done ? "var(--success-100)" : "var(--surface-card)",
      color: done ? "var(--success-700)" : "var(--text-title)", font: "var(--text-btn)", transition: "background .15s, color .15s", ...style,
    }}>
      <Icon name={done ? "check" : "copy"} size={16} />
      {done ? "복사됨" : label}
    </button>
  );
}
