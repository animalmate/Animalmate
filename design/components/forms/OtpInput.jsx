import React, { useRef } from "react";

/** 6자리 OTP 코드 입력 — 칸 분리, 붙여넣기 지원, 자동 포커스 이동 */
export function OtpInput({ length = 6, value = "", onChange, invalid = false, style }) {
  const refs = useRef([]);
  const chars = Array.from({ length }, (_, i) => value[i] || "");
  const set = (next) => onChange && onChange(next.slice(0, length));
  const handle = (i, e) => {
    const v = e.target.value.replace(/\D/g, "");
    if (!v) { set(chars.map((c, j) => (j === i ? "" : c)).join("")); return; }
    if (v.length > 1) { // 붙여넣기
      set((value.slice(0, i) + v).slice(0, length));
      const end = Math.min(i + v.length, length - 1);
      refs.current[end] && refs.current[end].focus();
      return;
    }
    set(chars.map((c, j) => (j === i ? v : c)).join(""));
    if (i < length - 1) refs.current[i + 1] && refs.current[i + 1].focus();
  };
  const key = (i, e) => {
    if (e.key === "Backspace" && !chars[i] && i > 0) refs.current[i - 1] && refs.current[i - 1].focus();
  };
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "space-between", ...style }}>
      {chars.map((c, i) => (
        <input key={i} ref={(el) => (refs.current[i] = el)} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"}
          value={c} onChange={(e) => handle(i, e)} onKeyDown={(e) => key(i, e)} onFocus={(e) => e.target.select()}
          aria-label={`코드 ${i + 1}번째 자리`}
          style={{
            width: "100%", maxWidth: 52, height: 56, textAlign: "center", borderRadius: "var(--radius-md)",
            border: `1.5px solid ${invalid ? "var(--error-600)" : c ? "var(--color-primary)" : "var(--border-default)"}`,
            background: "var(--surface-card)", font: "700 22px/1 var(--font-sans)", color: "var(--text-title)",
            transition: "border-color .15s", padding: 0,
          }} />
      ))}
    </div>
  );
}
