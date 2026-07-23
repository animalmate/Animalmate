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
        cream: { 25: '#FDFBF7', 50: '#FAF6EE', 100: '#F4EDDF', 200: '#EADFC9' },
        ink: { 100: '#EFEAE0', 200: '#DDD6C8', 300: '#BFB7A6', 400: '#99917F', 500: '#7B7263', 700: '#4E4739', 900: '#2E2921' },
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
      boxShadow: {
        card: '0 1px 3px rgba(78,71,57,.07), 0 1px 2px rgba(78,71,57,.05)',
        raised: '0 4px 12px rgba(78,71,57,.10), 0 2px 4px rgba(78,71,57,.06)',
        modal: '0 12px 32px rgba(46,41,33,.18), 0 4px 8px rgba(46,41,33,.08)',
      },
      height: { control: '48px', 'control-sm': '36px' },
      minHeight: { tap: '44px' },
    },
  },
  plugins: [],
} satisfies Config;
