/**
 * ABOUT 의 활동 사진. 스크롤을 내리면 한 장씩 스르륵 올라오며 나타난다.
 *
 * **클라이언트 컴포넌트가 아니다** — 자바스크립트 없이 CSS 스크롤 타임라인(`animation-timeline:
 * view()`)만 쓴다(`.reveal-on-scroll`, globals.css). 그래서:
 *   - 라이브러리(GSAP·Framer Motion)를 새로 넣지 않는다.
 *   - 애니메이션이 메인 스레드 밖에서 돌아 스크롤이 끊기지 않는다.
 *   - 지원하지 않는 브라우저에서는 **사진이 그냥 처음부터 보인다**. 내용이 스크립트 뒤에 숨지 않는다.
 *   - 움직임을 줄이도록 설정한 사람에게는 효과가 아예 걸리지 않는다.
 *
 * 사진은 좌우로 번갈아 붙이고 사이를 넉넉히 띄운다 — 격자로 촘촘히 붙이면 앨범처럼 보이고,
 * 이 칸의 목적은 "우리가 이런 걸 한다"를 한 장씩 보여 주는 것이다.
 *
 * **사진 밑 설명은 달지 않는다**(2026-08-28 사용자 지시). 사진이 이미 말하고 있어서, 밑에 한 줄을
 * 더 붙이면 설명이 아니라 잡음이 된다. `alt` 는 남긴다 — 화면에 보이는 글이 아니라 사진을 볼 수
 * 없는 사람에게 읽어 주는 값이고, 그것까지 빼면 이 칸이 통째로 비어 버린다.
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

export function ActivityPhotos() {
  return (
    <div className="space-y-14 sm:space-y-24">
      {PHOTOS.map((p, i) => (
        <img
          key={p.src}
          src={p.src}
          width={p.width}
          height={p.height}
          alt={p.alt}
          loading="lazy"
          decoding="async"
          // 설명이 사라져 사진 하나만 남았으므로 <figure> 로 감싸지 않는다 —
          // 캡션 없는 figure 는 의미도 없고 정렬만 한 겹 더 만든다.
          className={`reveal-on-scroll w-full rounded-3xl border border-cream-200 shadow-card sm:w-[78%] ${
            i % 2 === 1 ? 'sm:ml-auto' : 'sm:mr-auto'
          }`}
        />
      ))}
    </div>
  );
}
