import React, { useState, useEffect, useRef } from "react";
import { Button } from "./Button.jsx";

/** 카운트다운 재전송 버튼: 클릭 → seconds초 비활성 후 재활성 */
export function CountdownButton({ seconds = 60, onResend, children = "코드 재전송", autoStart = false, style }) {
  const [left, setLeft] = useState(autoStart ? seconds : 0);
  const timer = useRef(null);
  useEffect(() => {
    if (left <= 0) { clearInterval(timer.current); return; }
    timer.current = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(timer.current);
  }, [left > 0]);
  const start = () => { onResend && onResend(); setLeft(seconds); };
  const active = left <= 0;
  return (
    <Button variant="secondary" disabled={!active} onClick={active ? start : undefined} style={style}>
      {active ? children : `${children} (${left}s)`}
    </Button>
  );
}
