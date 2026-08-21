'use client';
// 커서를 따라다니는 장식용 강아지 (SVG + requestAnimationFrame, 외부 라이브러리·캔버스 없음).
// 로그인/가입·부원 챗봇·모집(/recruit) 등 "가벼운" 화면에만 붙인다(운영진 콘솔엔 넣지 않는다).
// 가드레일: pointer:fine 에서만 마운트, reduced-motion이면 정지, pointer-events:none, 콘텐츠 아래(z<0),
// 토글은 localStorage 저장(기본 on), transform 만 조작, 탭 비활성 시 rAF 정지.
//
// ── 움직임이 끊겨 보이던 이유 (2026-08-21) ────────────────────────────────
// 해상도 문제가 아니다. SVG 는 벡터라 화면 배율만큼 선명하게 그려진다. 끊김의 원인은 셋이었다.
//
//  1) **뷰포트 전체를 덮는 SVG 안에서** 매 프레임 `setAttribute('transform', …)` 을 했다.
//     SVG 속성 변경은 GPU 합성이 아니라 **다시 그리기**다. 화면만 한 레이어를 프레임마다 다시
//     그렸고, 강아지가 `z-index:-1` 라 그 위에 겹친 본문까지 함께 다시 합성됐다.
//     → 강아지를 **작은 상자(140×125)** 에 담고, 이동은 상자의 **CSS transform** 으로 옮긴다.
//       `will-change: transform` 으로 자기 레이어를 갖게 하면 이동은 합성만으로 끝난다.
//
//  2) **뛰기/서기 상태가 경계에서 떨렸다.** `|dx| > 25` 하나로 판정해서, 커서가 그 언저리에
//     머물면 매 프레임 run↔idle 이 뒤집히고 다리가 애니메이션 ↔ 0 으로 튀었다. 이게 눈에는
//     "끊김"으로 보인다. → **히스테리시스**(28에서 뛰기 시작, 18 아래에서 멈춤).
//
//  3) 상태가 바뀌는 순간 다리·머리 각도가 **한 프레임에 점프**했다. → 자세를 목표값으로
//     **감쇠 추종**시켜 전환을 잇는다. 값이 실제로 바뀔 때만 속성을 쓴다(서기 중에는 쓰기 0회).
import { useEffect, useRef, useState } from 'react';

const KEY = 'am:cursor-dog';
/**
 * 발밑을 뷰포트 하단에서 띄우는 기본값.
 *
 * 화면 맨 아래에 글자를 두는 페이지는 이 값을 키워 강아지가 **그 위에 서게** 한다.
 * 강아지는 z<0 라 글자 뒤에 그려지지만, 몸통이 겹치면 얇은 회색 글씨는 그냥 안 읽힌다
 * (2026-07-29 로그인 크레딧에서 실제로 그랬다 — 스크린샷으로 발견).
 */
const DEFAULT_GROUND_MARGIN = 10;

/**
 * 강아지를 담는 상자. 원점(0,0) = **발밑 중앙**이 상자 안 (OX, OY) 에 온다.
 * 꼬리·귀·점프하지 않은 다리가 모두 들어가도록 여유를 뒀다(로컬 x −52~50, y −92~5).
 */
const BOX = { w: 140, h: 125, ox: 70, oy: 110 } as const;

type State = 'idle' | 'run' | 'jump' | 'lookup' | 'reach';

/** 프레임률과 무관한 감쇠 추종. dt 가 달라도 같은 시간 상수(1/k 초)로 따라간다. */
const approach = (cur: number, target: number, k: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-k * dt));

export function CursorDog({ groundMargin = DEFAULT_GROUND_MARGIN }: { groundMargin?: number } = {}) {
  const [hydrated, setHydrated] = useState(false);
  const [pointerFine, setPointerFine] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [enabled, setEnabled] = useState(true);

  const wrapRef = useRef<HTMLDivElement>(null);
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
    const wrap = wrapRef.current;
    const tail = tailRef.current;
    const bleg = blegRef.current;
    const fleg = flegRef.current;
    const head = headRef.current;
    if (!wrap || !tail || !bleg || !fleg || !head) return;

    /** 상자를 놓는다. x = 발밑 중앙, y = 발밑 높이(둘 다 뷰포트 좌표). */
    const place = (px: number, py: number, sx: number) => {
      wrap.style.transform = `translate3d(${(px - BOX.ox).toFixed(1)}px, ${(py - BOX.oy).toFixed(1)}px, 0) scaleX(${sx})`;
    };

    // reduced-motion: 루프를 돌리지 않고 지면 중앙에 정지 상태로 배치.
    if (reduced) {
      place(window.innerWidth / 2, window.innerHeight - groundMargin, 1);
      return;
    }

    const cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2, on: false };
    let x = window.innerWidth / 2;
    let dir: 1 | -1 = 1;
    let running = false; // 히스테리시스용 — '지금 뛰는 중인가'.
    let jumpActive = false;
    let jumpStart = 0;
    let lastJumpEnd = -Infinity;
    let last = performance.now();
    let raf = 0;

    // 실제로 그려지고 있는 자세. 목표값으로 감쇠 추종해서 상태가 바뀔 때 튀지 않게 한다.
    const pose = { fleg: 0, bleg: 0, tilt: 0, rise: 0, tail: 0 };
    // 마지막으로 **쓴** 값. 바뀌지 않았으면 setAttribute 를 건너뛴다(서기 중에는 쓰기가 없다).
    const drawn = { fleg: NaN, bleg: NaN, tilt: NaN, rise: NaN, tail: NaN };

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
      const groundY = vh - groundMargin;

      // 이동: 커서 X를 목표로 감쇠 추종(프레임률 무관 — 60·120·144Hz 에서 같은 속도).
      const targetX = (cursor.on ? cursor.x : vw / 2) - 22;
      const dx = targetX - x;
      x = approach(x, targetX, 6, dt);

      // 방향: 히스테리시스(±2)로 떨림 방지.
      if (dx < -2) dir = -1;
      else if (dx > 2) dir = 1;

      // 뛰기/서기도 히스테리시스로 가른다. 문턱이 하나면 커서가 그 언저리에 머물 때
      // 매 프레임 뒤집혀 다리가 튄다(이게 "끊겨 보인다"의 정체였다).
      const adx = Math.abs(dx);
      if (running ? adx < 18 : adx > 28) running = !running;

      // 상태 판정(위에서부터 먼저 맞는 것).
      const topZone = cursor.on && cursor.y <= vh * 0.35; // 화면 상단 35%
      const botZone = cursor.on && cursor.y >= vh * 0.7; // 화면 하단 30%
      let state: State;
      if (topZone && adx < 110) state = 'jump';
      else if (topZone) state = 'lookup';
      else if (botZone && adx < 80) state = 'reach';
      else if (running) state = 'run';
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

      // 목표 포즈(다리·머리·꼬리). 실제 각도는 아래에서 여기로 감쇠 추종한다.
      let legFront = 0;
      let legBack = 0;
      let headTilt = 0;
      let headRise = 0;
      let tailK = 7;
      let tailA = 12;
      switch (visual) {
        case 'run':
          // 감쇠 필터를 한 번 지나며 진폭이 조금 줄어드는 만큼 키워 둔다(30 → 34).
          legFront = Math.sin(t * 15) * 34;
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

      // 자세 추종(τ≈40ms). 뛰는 다리(2.4Hz)는 그대로 따라가면서 상태 전환만 이어 준다.
      pose.fleg = approach(pose.fleg, legFront, 25, dt);
      pose.bleg = approach(pose.bleg, legBack, 25, dt);
      pose.tilt = approach(pose.tilt, headTilt, 20, dt);
      pose.rise = approach(pose.rise, headRise, 20, dt);
      pose.tail = approach(pose.tail, Math.sin(t * tailK) * tailA, 30, dt);

      // 이동은 **상자의 CSS transform** — 자기 레이어에서 합성만 하고 다시 그리지 않는다.
      place(x, groundY - jumpY, dir);

      // 팔다리는 SVG 속성이라 쓸 때마다 다시 그린다. **값이 실제로 변했을 때만** 쓴다.
      const write = (el: Element, key: keyof typeof drawn, value: number, attr: string) => {
        if (Math.abs(value - drawn[key]) < 0.05) return;
        drawn[key] = value;
        el.setAttribute('transform', attr);
      };
      write(tail, 'tail', pose.tail, `rotate(${pose.tail.toFixed(1)} -26 -36)`);
      write(fleg, 'fleg', pose.fleg, `rotate(${pose.fleg.toFixed(1)} 12 -17)`);
      write(bleg, 'bleg', pose.bleg, `rotate(${pose.bleg.toFixed(1)} -19 -17)`);
      // 머리는 기울기·높이 둘 다 한 속성에 들어간다 — 둘 중 하나만 변해도 다시 쓴다.
      if (Math.abs(pose.tilt - drawn.tilt) >= 0.05 || Math.abs(pose.rise - drawn.rise) >= 0.05) {
        drawn.tilt = pose.tilt;
        drawn.rise = pose.rise;
        head.setAttribute('transform', `translate(19 ${(-54 + pose.rise).toFixed(1)}) rotate(${pose.tilt.toFixed(1)})`);
      }

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
  }, [enabled, pointerFine, reduced, groundMargin]);

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
        <div
          ref={wrapRef}
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0"
          style={{
            width: BOX.w,
            height: BOX.h,
            zIndex: -1,
            // 자기 합성 레이어를 갖게 해서, 움직여도 본문을 다시 그리지 않는다.
            willChange: 'transform',
            // 좌우 반전은 **발밑**을 중심으로 — 상자 가운데를 쓰면 뒤집을 때 옆으로 밀린다.
            transformOrigin: `${BOX.ox}px ${BOX.oy}px`,
            // 첫 프레임 전에 왼쪽 위 구석에 잠깐 보이지 않게.
            transform: 'translate3d(-9999px, -9999px, 0)',
          }}
        >
          {/* viewBox 원점 = 발밑 중앙. 색상은 하드코딩 유지(다크모드에서도 동일한 강아지). */}
          <svg
            width={BOX.w}
            height={BOX.h}
            viewBox={`${-BOX.ox} ${-BOX.oy} ${BOX.w} ${BOX.h}`}
            className="block h-full w-full overflow-visible"
          >
            <g id="dog">
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
        </div>
      ) : null}

      <button
        type="button"
        onClick={toggle}
        aria-label={enabled ? '커서 강아지 끄기' : '커서 강아지 켜기'}
        title={enabled ? '커서 강아지 끄기' : '커서 강아지 켜기'}
        // 44px = 최소 터치 타깃. 지원자용 공개 화면(모바일 비중이 높다)에도 나오므로 맞춘다.
        className="fixed bottom-3 right-3 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-ink-200 bg-white/90 text-base shadow-card backdrop-blur transition-colors hover:bg-cream-50"
      >
        <span style={{ opacity: enabled ? 1 : 0.35 }}>🐾</span>
      </button>
    </>
  );
}
