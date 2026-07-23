'use client';
import { useEffect, useState } from 'react';

/** 재전송 쿨다운 카운트다운(초). start(60) 호출 시 60→0. */
export function useCooldown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((x) => (x <= 1 ? 0 : x - 1)), 1000);
    return () => clearInterval(t);
  }, [left]);
  return { left, start: (s: number) => setLeft(s) };
}
