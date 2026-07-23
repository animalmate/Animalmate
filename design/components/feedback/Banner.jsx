import React from "react";
import { Icon } from "../display/Icon.jsx";

/** 인라인 배너: 정보/경고/오류/성공. 스팸함 안내·미완성 필드·삭제 불가 안내 등 */
export function Banner({ kind = "info", title, children, icon, action, style }) {
  const M = {
    info: ["info", "var(--info-100)", "var(--info-700)"],
    warning: ["alert", "var(--warning-100)", "var(--warning-700)"],
    error: ["alert", "var(--error-100)", "var(--error-700)"],
    success: ["check", "var(--success-100)", "var(--success-700)"],
  };
  const [defIcon, bg, fg] = M[kind] || M.info;
  return (
    <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-md)", background: bg, color: fg, font: "var(--text-body)", alignItems: "flex-start", ...style }}>
      <Icon name={icon || defIcon} size={18} style={{ marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <strong style={{ display: "block", font: "var(--text-label)", marginBottom: children ? 2 : 0 }}>{title}</strong>}
        {children}
      </div>
      {action}
    </div>
  );
}
