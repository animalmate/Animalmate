// 서버 래퍼 — 이 페이지를 동적 렌더링으로 고정한다.
// nonce 기반 CSP(src/middleware.ts)는 요청마다 nonce 가 바뀌므로, 정적 프리렌더된 페이지는
// 빌드 시점 nonce 가 박혀 응답 헤더의 nonce 와 어긋난다 → 스크립트가 전부 차단돼 화면이 깨진다.
// force-dynamic 으로 매 요청 렌더링해 nonce 가 스크립트에 정확히 붙게 한다.
import { LoginForm } from './form';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <LoginForm />;
}
