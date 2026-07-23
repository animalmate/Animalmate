import type { Config } from 'tailwindcss';

// 최소 설정. 커스텀 색상/장식은 시안(docs/06-DESIGN.md) 도착 후 확장.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
