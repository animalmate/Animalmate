// 서버 래퍼 — 동적 렌더링 고정(이유는 login/page.tsx 주석 참고: nonce CSP + 정적 프리렌더 충돌).
import { SignupForm } from './form';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <SignupForm />;
}
