import React from "react";

/** 스켈레톤 셔머 블록. variant: line | card */
export function Skeleton({ variant = "line", width = "100%", height, count = 1, style }) {
  const h = height || (variant === "card" ? 96 : 14);
  const block = (i) => (
    <div key={i} style={{
      width, height: h, borderRadius: variant === "card" ? "var(--radius-lg)" : 7,
      background: "linear-gradient(90deg, var(--ink-100) 25%, var(--cream-100) 50%, var(--ink-100) 75%)",
      backgroundSize: "200% 100%", animation: "am-shimmer 1.4s ease infinite", ...style,
    }} />
  );
  if (count === 1) return block(0);
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{Array.from({ length: count }, (_, i) => block(i))}</div>;
}
