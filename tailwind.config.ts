import type { Config } from 'tailwindcss';

// 애니멀메이트 디자인 시스템 토큰(design/handoff/tailwind.config.js 와 1:1).
// 라운드는 Tailwind 기본 스케일 사용(배지 rounded-lg=8 · 입력/버튼 rounded-xl=12 · 카드 rounded-2xl=16).
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        blue: { 50: '#F1F6FC', 100: '#DFEAF8', 200: '#BDD5F0', 300: '#94B9E6', 400: '#6E9CDC', 500: '#5588D2', 600: '#3E6FB9', 700: '#345C99', 800: '#2C4B7C', 900: '#253D64' },
        coral: { 50: '#FEF2F2', 100: '#FDE3E4', 300: '#F7A2A6', 500: '#EE5A60', 600: '#D8434B', 700: '#B23239' },
        amber: { 50: '#FDF6E7', 100: '#FAEBC8', 300: '#F6CB6F', 500: '#F0A72A', 600: '#C97F0A', 700: '#8F5C05' },
        // 중립색 — **명도·색상각은 그대로 두고 채도만 0.65 배**로 내린 값이다
        // (2026-08-06, 07-DECISIONS 108·109).
        //
        // 예전 값은 cream·ink 전 계열이 색상각 38~42°(노랑-주황)에 몰려 있어, 바탕만이 아니라
        // 글자색까지 갈색이라 화면 전체가 누렇게 보였다. 채도를 0.30 배까지 내린 판(A)과
        // 원래 값의 **한가운데**가 지금 값이다 — 누런 기는 빠지고 온기는 남는 지점.
        //
        // 명도를 건드리지 않았으므로 대비비는 그대로거나 높다: 본문 8.53→8.64,
        // 툴바 테두리 3.13→3.22(WCAG 1.4.11 의 3:1 유지).
        // ⚠ `ink-500` 만 명도를 0.2%p 더 내렸다 — 산술 중간값(#777167)은 보조 글씨 대비가
        //   4.45:1 로 4.5 기준에 **미달**한다(예전 값도 4.40 으로 미달이었다). 지금 값은 4.51.
        cream: { 25: '#FCFBF8', 50: '#F8F5F0', 100: '#F0ECE3', 200: '#E4DDCF' },
        ink: { 100: '#ECE9E3', 200: '#D9D5CC', 300: '#BBB5AA', 400: '#948F84', 500: '#767067', 700: '#4A463D', 900: '#2C2823' },
        primary: '#5588D2',
        success: { DEFAULT: '#2F8A57', 100: '#DFF2E6', 700: '#226A42' },
        warning: { DEFAULT: '#C97F0A', 100: '#FAEBC8', 700: '#8F5C05' },
        error: { DEFAULT: '#D8434B', 100: '#FDE3E4', 700: '#B23239' },
        info: { DEFAULT: '#3E6FB9', 100: '#DFEAF8', 700: '#2C4B7C' },
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', '"Apple SD Gothic Neo"', '"Noto Sans KR"', 'sans-serif'],
        mono: ['"SF Mono"', 'ui-monospace', '"Nanum Gothic Coding"', 'Consolas', 'monospace'],
      },
      // 그림자도 ink 에서 온다(card·raised=ink-700, modal=ink-900). 색만 중립으로 옮기면
      // 그림자가 혼자 누런 채로 남아 카드 밑에 노란 테가 돈다.
      boxShadow: {
        card: '0 1px 3px rgba(74,70,61,.07), 0 1px 2px rgba(74,70,61,.05)',
        raised: '0 4px 12px rgba(74,70,61,.10), 0 2px 4px rgba(74,70,61,.06)',
        modal: '0 12px 32px rgba(44,40,35,.18), 0 4px 8px rgba(44,40,35,.08)',
      },
      height: { control: '48px', 'control-sm': '36px' },
      minHeight: { tap: '44px' },
    },
  },
  plugins: [],
} satisfies Config;
