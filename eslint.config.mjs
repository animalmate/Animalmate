// ESLint 최소 설정 — 타입체커(tsconfig strict + noUnused*)가 못 잡는 빈칸만 메운다.
// 목적은 딱 둘이다:
//   1) React 훅 규칙 — 의존성 배열 실수로 무한 렌더 루프가 나는 걸 코드 쓰는 시점에 잡는다.
//      (2026-07-28 대기실 배정표에서 실제로 터졌고, Playwright 콘솔을 보고서야 발견했다.)
//   2) Next 필수 룰 — App Router 에서 조용히 깨지는 패턴(inline-script-id 등).
// 스타일·포맷 룰은 일부러 넣지 않는다. 그건 타입체커와 리뷰의 몫.
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'drizzle/**', // 마이그레이션 SQL 스냅샷(생성물)
      'design/**', // 디자인 킷(외부 도구가 넣어 준 산출물 — 우리가 고치는 코드가 아니다)
      'public/**',
      'next-env.d.ts',
      '.omc/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,mts,js,mjs}'],
    // 효력 없는 eslint-disable 주석은 오류로 잡는다. 규칙 이름을 잘못 적거나 코드가 바뀌어
    // 더는 걸리지 않게 된 주석이 남아 있으면, 그 자리를 검사하고 있다고 착각하게 된다.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      // 훅 규칙은 경고가 아니라 오류로 둔다 — 이걸 흘려보내면 설정한 의미가 없다.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // 이 프로젝트는 next/image·next/link 를 한 곳도 쓰지 않는다(전 화면이 <img> 와 <a>).
      // 404 페이지는 JS 없이 동작해야 해서 일부러 순수 <a> 를 쓰고, 이미지는 로고 정도라
      // 최적화 파이프라인을 붙일 이유가 없었다. 화면마다 disable 주석을 흩뿌리는 대신 여기서 끈다.
      // 나중에 next/image·next/link 를 도입하기로 하면 이 두 줄을 지우는 것이 첫 단계다.
      '@next/next/no-img-element': 'off',
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
];
