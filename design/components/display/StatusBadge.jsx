import React, { useState } from "react";

/** 예약 상태 배지 5종 */
export function StatusBadge({ status = "draft", style }) {
  const M = {
    draft: ["작성중", "--status-draft-bg", "--status-draft-fg"],
    ready: ["완성", "--status-ready-bg", "--status-ready-fg"],
    scheduled: ["발행 대기", "--status-scheduled-bg", "--status-scheduled-fg"],
    published: ["발행됨", "--status-published-bg", "--status-published-fg"],
    failed: ["실패", "--status-failed-bg", "--status-failed-fg"],
  };
  const [label, bg, fg] = M[status] || M.draft;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "4px 12px", font: "var(--text-badge)", background: `var(${bg})`, color: `var(${fg})`, whiteSpace: "nowrap", ...style }}>
      <i style={{ width: 7, height: 7, borderRadius: 99, background: "currentColor" }} />
      {label}
    </span>
  );
}
