'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * ABOUT 의 활동 사진. 스크롤을 내리면 한 장씩 스르륵 나타난다.
 *
 * ── 왜 CSS 스크롤 타임라인을 걷어냈나 (2026-08-28) ──────────────────────
 * 처음에는 `animation-timeline: view()` 로만 만들었다. 자바스크립트가 없어 깔끔했지만
 * **두 개의 조용한 스위치**가 달려 있었다:
 *   ① `@supports` — 지원하지 않는 브라우저에서는 아무 일도 안 일어난다.
 *   ② `prefers-reduced-motion` — 움직임 줄이기 설정이면 **효과가 통째로 꺼진다.**
 * Windows 11 의 "애니메이션 효과" 를 꺼 둔 사람은 ②에 걸려 사진이 그냥 떠 있는 것을 본다.
 * 둘 다 "정상 동작"이라 QA 도 통과시켰다 — 요청한 사람 눈에는 고장인데.
 *
 * 지금은 IntersectionObserver 로 바꿨다(전 브라우저 지원). 움직임 배려는 **끄는 것이 아니라
 * 줄이는 것**으로 바꿨다: 움직임 줄이기 설정이면 밀려 올라오는 이동(translate)만 빼고
 * 서서히 나타나는 것(opacity)은 그대로 둔다. WCAG 2.3.3 이 걱정하는 것은 이동·확대 같은
 * **모션**이지 투명도가 아니다. 그래서 누구에게나 "나타나는" 것은 보인다.
 *
 * ── 내용이 스크립트 뒤에 숨지 않게 ────────────────────────────────────
 * 서버는 사진을 **보이는 상태로** 그린다. 마운트한 뒤에야(= 자바스크립트가 도는 것이 확인된
 * 뒤에야) 아직 화면 밖인 것을 숨긴다. 스크립트가 죽으면 숨기는 코드도 실행되지 않으므로
 * 사진은 계속 보인다. 이미 화면에 걸린 사진은 처음부터 목록에 넣어 **깜빡임 없이** 통과시킨다.
 */

interface Photo {
  src: string;
  width: number;
  height: number;
  alt: string;
}

// 원본(1440×1800, 장당 1.4MB)을 1000px webp 로 줄여 둔 것 — 공개 페이지라 용량이 곧 이탈이다.
// width/height 를 적어 두면 사진이 도착하기 전에도 자리를 잡아 아래 내용이 밀리지 않는다.
const PHOTOS: Photo[] = [
  {
    src: '/about/shelter.webp',
    width: 1000,
    height: 1250,
    alt: '보호소 조리실 앞에 모여든 강아지들과 방역복을 입고 밥을 준비하는 부원들',
  },
  {
    src: '/about/cleaning.webp',
    width: 1000,
    height: 1250,
    alt: '견사 바닥을 밀대로 물청소하는 부원들',
  },
  {
    src: '/about/walk.webp',
    width: 1000,
    height: 1248,
    alt: '목줄을 잡고 강아지들을 산책시키는 부원들',
  },
];

/** 화면 아래에서 이만큼 올라오면 나타내기 시작한다 — 다 올라온 뒤에 뜨면 이미 늦다. */
const REVEAL_MARGIN = 0.12; // 뷰포트 높이의 12%

export function ActivityPhotos() {
  const containerRef = useRef<HTMLDivElement>(null);
  // armed = 자바스크립트가 돈다는 것이 확인됨. 이 값이 false 인 동안에는 아무것도 숨기지 않는다.
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState<Set<number>>(new Set());

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (items.length === 0) return;

    // 지원하지 않는 환경이면 숨기지 않고 그대로 둔다(효과만 없다).
    if (typeof IntersectionObserver === 'undefined') return;

    // 이미 화면에 걸려 있는 것은 **처음부터 보이는 쪽**에 넣는다. 숨겼다가 곧바로 다시
    // 보여 주면 한 프레임 깜빡인다 — 들어와 있는 것을 가릴 이유도 없다.
    const already = new Set<number>();
    const limit = window.innerHeight * (1 - REVEAL_MARGIN);
    items.forEach((el, i) => {
      if (el.getBoundingClientRect().top < limit) already.add(i);
    });
    setShown(already);
    setArmed(true);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const i = Number((entry.target as HTMLElement).dataset.reveal);
          setShown((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
          observer.unobserve(entry.target); // 한 번 나타난 사진은 다시 숨기지 않는다
        }
      },
      { rootMargin: `0px 0px -${Math.round(REVEAL_MARGIN * 100)}% 0px` }
    );
    items.forEach((el, i) => {
      if (!already.has(i)) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="space-y-14 sm:space-y-24">
      {PHOTOS.map((p, i) => {
        // armed 가 false 면(서버 렌더·스크립트 없음) 언제나 보이는 상태다.
        const hidden = armed && !shown.has(i);
        return (
          <div
            key={p.src}
            data-reveal={i}
            className={`transition-[opacity,transform] duration-700 ease-out will-change-[opacity,transform] motion-reduce:duration-500 sm:w-[78%] ${
              i % 2 === 1 ? 'sm:ml-auto' : 'sm:mr-auto'
            } ${
              hidden
                ? // 움직임을 줄이도록 설정한 사람에게는 **이동만** 뺀다(서서히 나타나는 것은 유지).
                  'translate-y-8 opacity-0 motion-reduce:translate-y-0'
                : 'translate-y-0 opacity-100'
            }`}
          >
            <img
              src={p.src}
              width={p.width}
              height={p.height}
              alt={p.alt}
              loading="lazy"
              decoding="async"
              className="w-full rounded-3xl border border-cream-200 shadow-card"
            />
          </div>
        );
      })}
    </div>
  );
}
