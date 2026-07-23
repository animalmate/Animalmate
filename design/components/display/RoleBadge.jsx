import React from "react";

/** 역할 배지: 부원/운영진/회장단/관리자 */
export function RoleBadge({ role = "member", style }) {
  const M = {
    member: ["부원", "var(--ink-100)", "var(--ink-500)"],
    staff: ["운영진", "var(--blue-100)", "var(--blue-700)"],
    board: ["회장단", "var(--amber-100)", "var(--amber-700)"],
    sysadmin: ["관리자", "var(--ink-900)", "#fff"],
  };
  const [label, bg, fg] = M[role] || M.member;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "3px 10px", font: "var(--text-badge)", background: bg, color: fg, whiteSpace: "nowrap", ...style }}>
      {label}
    </span>
  );
}
