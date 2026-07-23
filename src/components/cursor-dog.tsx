'use client';
// 커서를 따라다니는 장식용 강아지 (SVG + requestAnimationFrame, 외부 라이브러리·캔버스 없음).
// 로그인/가입·부원 챗봇·모집(/recruit) 등 "가벼운" 화면에만 붙인다(운영진 콘솔엔 넣지 않는다).
// 가드레일: pointer:fine 에서만 마운트, reduced-motion이면 정지, pointer-events:none, 콘텐츠 아래(z<0),
// 토글은 localStorage 저장(기본 on), transform 속성만 조작, 탭 비활성 시 rAF 정지.
import { useEffect, useRef, useState } from 'react';

const KEY = 'am:cursor-dog';
const GROUND_MARGIN = 10; // 발밑을 뷰포트 하단에서 살짝 띄운다.

type State = 'idle' | 'run' | 'jump' | 'lookup' | 'reach';

export function CursorDog() {
  const [hydrated, setHydrated] = useState(false);
  const [pointerFine, setPointerFine] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [enabled, setEnabled] = useState(true);

  const dogRef = useRef<SVGGElement>(null);
  const tailRef = useRef<SVGGElement>(null);
  const blegRef = useRef<SVGGElement>(null);
  const flegRef = useRef<SVGGElement>(null);
  const headRef = useRef<SVGGElement>(null);

  // 환경 감지(pointer:fine / reduced-motion) + 저장된 토글값 로드.
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)');
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setPointerFine(fine.matches);
      setReduced(rm.matches);
    };
    sync();
    fine.addEventListener('change', sync);
    rm.addEventListener('change', sync);
    setEnabled(localStorage.getItem(KEY) !== 'off');
    setHydrated(true);
    return () => {
      fine.removeEventListener('change', sync);
      rm.removeEventListener('change', sync);
    };
  }, []);

  // 애니메이션 루프.
  useEffect(() => {
    if (!enabled || !pointerFine) return;
    const dog = dogRef.current;
    const tail = tailRef.current;
    const bleg = blegRef.current;
    const fleg = flegRef.current;
    const head = headRef.current;
    if (!dog || !tail || !bleg || !fleg || !head) return;

    // reduced-motion: 루프를 돌리지 않고 지면 중앙에 정지 상태로 배치.
    if (reduced) {
      dog.setAttribute(
        'transform',
        `translate(${(window.innerWidth / 2).toFixed(2)} ${(window.innerHeight - GROUND_MARGIN).toFixed(2)}) scale(1 1)`,
      );
      return;
    }

    const cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2, on: false };
    let x = window.innerWidth / 2;
    let dir: 1 | -1 = 1;
    let jumpActive = false;
    let jumpStart = 0;
    let lastJumpEnd = -Infinity;
    let last = performance.now();
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      cursor.x = e.clientX;
      cursor.y = e.clientY;
      cursor.on = true;
    };
    const onLeave = () => {
      cursor.on = false; // 커서가 화면 밖 → idle + 중앙 복귀.
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);

    const frame = () => {
      const now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05; // 탭 복귀 시 순간이동 방지.
      const t = now / 1000;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const groundY = vh - GROUND_MARGIN;

      // 이동: 커서 X를 목표로 감쇠 추종.
      const targetX = (cursor.on ? cursor.x : vw / 2) - 22;
      const dx = targetX - x;
      x += dx * Math.min(dt * 6, 1);

      // 방향: 히스테리시스(±2)로 떨림 방지.
      if (dx < -2) dir = -1;
      else if (dx > 2) dir = 1;

      // 상태 판정(위에서부터 먼저 맞는 것).
      const adx = Math.abs(dx);
      const topZone = cursor.on && cursor.y <= vh * 0.35; // 화면 상단 35%
      const botZone = cursor.on && cursor.y >= vh * 0.7; // 화면 하단 30%
      let state: State;
      if (topZone && adx < 110) state = 'jump';
      else if (topZone) state = 'lookup';
      else if (botZone && adx < 80) state = 'reach';
      else if (adx > 25) state = 'run';
      else state = 'idle';

      // 점프 상태머신: 지속 0.62s, 쿨다운 1.0s(연속 점프 방지).
      if (state === 'jump' && !jumpActive && now - lastJumpEnd > 1000) {
        jumpActive = true;
        jumpStart = now;
      }
      let jumpY = 0;
      // 쿨다운 중 점프 조건이면 착지 대신 '올려다보기'로 표현.
      let visual: State = state === 'jump' && !jumpActive ? 'lookup' : state;
      if (jumpActive) {
        const p = (now - jumpStart) / 620;
        if (p >= 1) {
          jumpActive = false;
          lastJumpEnd = now;
        } else {
          jumpY = Math.sin((1 - p) * Math.PI) * 48;
          visual = 'jump';
        }
      }

      // 포즈 계산(다리·머리·꼬리).
      let legFront = 0;
      let legBack = 0;
      let headTilt = 0;
      let headRise = 0;
      let tailK = 7;
      let tailA = 12;
      switch (visual) {
        case 'run':
          legFront = Math.sin(t * 15) * 30;
          legBack = -legFront; // 뒷다리는 앞다리와 반대 위상.
          tailK = 13;
          tailA = 22;
          break;
        case 'jump':
          legFront = -40;
          legBack = -40;
          headTilt = -16;
          tailK = 13;
          tailA = 22;
          break;
        case 'lookup':
          headTilt = -26;
          tailK = 13;
          tailA = 22;
          break;
        case 'reach':
          legFront = -72;
          legBack = 4;
          headTilt = 14;
          headRise = -6; // 머리 6px 상승.
          tailK = 13;
          tailA = 22;
          break;
        default: // idle
          headTilt = Math.sin(t * 1.6) * 3;
          break;
      }

      // transform 속성만 조작(레이아웃 유발 속성 금지). 루트: translate + scale(dir).
      dog.setAttribute('transform', `translate(${x.toFixed(2)} ${(groundY - jumpY).toFixed(2)}) scale(${dir} 1)`);
      tail.setAttribute('transform', `rotate(${(Math.sin(t * tailK) * tailA).toFixed(2)} -26 -36)`);
      fleg.setAttribute('transform', `rotate(${legFront.toFixed(2)} 12 -17)`);
      bleg.setAttribute('transform', `rotate(${legBack.toFixed(2)} -19 -17)`);
      head.setAttribute('transform', `translate(19 ${(-54 + headRise).toFixed(2)}) rotate(${headTilt.toFixed(2)})`);

      raf = requestAnimationFrame(frame);
    };

    // 탭 비활성 시 rAF 자동 정지, 복귀 시 dt 리셋 후 재개.
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, pointerFine, reduced]);

  function toggle() {
    setEnabled((v) => {
      const next = !v;
      localStorage.setItem(KEY, next ? 'on' : 'off');
      return next;
    });
  }

  // SSR/하이드레이션 정합을 위해 감지 전에는 아무것도 렌더하지 않는다.
  // 터치 기기(pointer:fine 아님)는 토글조차 마운트하지 않는다.
  if (!hydrated || !pointerFine) return null;

  return (
    <>
      {enabled ? (
        <svg
          aria-hidden="true"
          width="100%"
          height="100%"
          className="pointer-events-none fixed inset-0 h-full w-full"
          style={{ zIndex: -1 }}
        >
          {/* 원점 = 발밑 중앙. 색상은 하드코딩 유지(다크모드에서도 동일한 강아지). */}
          <g id="dog" ref={dogRef}>
            <g id="tail" ref={tailRef}>
              <path d="M-26 -36 q -16 -4 -13 -22" stroke="#D9B487" strokeWidth="7" strokeLinecap="round" fill="none" />
            </g>
            <g id="bleg" ref={blegRef}>
              <rect x="-24" y="-17" width="10" height="19" rx="5" fill="#D9B487" />
            </g>
            <ellipse cx="-4" cy="-32" rx="25" ry="18" fill="#E8C79A" />
            <g id="fleg" ref={flegRef}>
              <rect x="7" y="-17" width="10" height="19" rx="5" fill="#E8C79A" />
            </g>
            <g id="head" ref={headRef} transform="translate(19,-54)">
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
      ) : null}

      <button
        type="button"
        onClick={toggle}
        aria-label={enabled ? '커서 강아지 끄기' : '커서 강아지 켜기'}
        title={enabled ? '커서 강아지 끄기' : '커서 강아지 켜기'}
        className="fixed bottom-3 right-3 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white/90 text-base shadow-card backdrop-blur transition-colors hover:bg-cream-50"
      >
        <span style={{ opacity: enabled ? 1 : 0.35 }}>🐾</span>
      </button>
    </>
  );
}
