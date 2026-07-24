'use client';
// 챗봇 마스코트 강아지 — 홈/커서 강아지와 같은 도안(cursor-dog.tsx)의 정지형 버전.
// 상태에 반응한다: idle(가만히·머리 까딱) → thinking(꼬리 빠르게 흔듦) → answer(한 번 점프 후 idle).
// transform 속성만 조작(cursor-dog 와 같은 기법: 피벗 기준 rotate). reduced-motion 이면 정지 포즈.

import { useEffect, useRef } from 'react';

export type DogMood = 'idle' | 'thinking' | 'answer';

export function ChatDog({ mood, answerNonce = 0, size = 96 }: { mood: DogMood; answerNonce?: number; size?: number }) {
  const rootRef = useRef<SVGGElement>(null);
  const tailRef = useRef<SVGGElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const moodRef = useRef<DogMood>(mood);
  const jumpRef = useRef<{ active: boolean; start: number }>({ active: false, start: 0 });

  // 최신 mood 를 ref 로(루프를 재시작하지 않고 읽는다).
  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  // answer 로 진입할 때마다 점프를 한 번 촉발(nonce 변화로 감지).
  useEffect(() => {
    if (mood === 'answer') jumpRef.current = { active: true, start: performance.now() };
  }, [mood, answerNonce]);

  useEffect(() => {
    const root = rootRef.current;
    const tail = tailRef.current;
    const head = headRef.current;
    if (!root || !tail || !head) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      root.setAttribute('transform', 'translate(0 0)');
      tail.setAttribute('transform', 'rotate(0 -26 -36)');
      head.setAttribute('transform', 'translate(19 -54)');
      return;
    }

    let raf = 0;
    const frame = () => {
      const now = performance.now();
      const t = now / 1000;
      const m = moodRef.current;

      // 점프(한 번, 0.62s 아치).
      let jumpY = 0;
      const j = jumpRef.current;
      if (j.active) {
        const p = (now - j.start) / 620;
        if (p >= 1) j.active = false;
        else jumpY = Math.sin(p * Math.PI) * 26;
      }

      // 꼬리: thinking 이거나 점프 중이면 빠르고 크게, 아니면 잔잔하게.
      const excited = m === 'thinking' || j.active;
      const tailK = excited ? 17 : 5;
      const tailA = excited ? 26 : 9;

      // 머리: idle 에서 천천히 까딱, 점프하면 살짝 든다.
      const headTilt = j.active ? -14 : Math.sin(t * 1.6) * 3;

      root.setAttribute('transform', `translate(0 ${(-jumpY).toFixed(2)})`);
      tail.setAttribute('transform', `rotate(${(Math.sin(t * tailK) * tailA).toFixed(2)} -26 -36)`);
      head.setAttribute('transform', `translate(19 -54) rotate(${headTilt.toFixed(2)})`);
      raf = requestAnimationFrame(frame);
    };

    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <svg width={size} height={size} viewBox="-48 -84 96 92" aria-hidden="true" className="overflow-visible">
      {/* 발밑 그림자 */}
      <ellipse cx="-2" cy="-2" rx="26" ry="5" fill="#2E2921" opacity="0.08" />
      <g ref={rootRef}>
        <g ref={tailRef}>
          <path d="M-26 -36 q -16 -4 -13 -22" stroke="#D9B487" strokeWidth="7" strokeLinecap="round" fill="none" />
        </g>
        <rect x="-24" y="-17" width="10" height="19" rx="5" fill="#D9B487" />
        <ellipse cx="-4" cy="-32" rx="25" ry="18" fill="#E8C79A" />
        <rect x="7" y="-17" width="10" height="19" rx="5" fill="#E8C79A" />
        <g ref={headRef} transform="translate(19,-54)">
          <path d="M-13 -9 q -9 -13 -1 -17 q 8 -1 9 12 z" fill="#C79A6A" />
          <path d="M13 -9 q 9 -13 1 -17 q -8 -1 -9 12 z" fill="#C79A6A" />
          <circle cx="0" cy="0" r="17" fill="#E8C79A" />
          <ellipse cx="11" cy="6" rx="10" ry="8" fill="#F5E2C6" />
          <circle cx="17" cy="4" r="3.5" fill="#3B2B1E" />
          <circle cx="-3" cy="-3" r="2.6" fill="#3B2B1E" />
          <circle cx="9" cy="-5" r="2.6" fill="#3B2B1E" />
        </g>
      </g>
    </svg>
  );
}
