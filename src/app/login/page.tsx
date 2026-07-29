// 서버 래퍼 — 이 페이지를 동적 렌더링으로 고정한다.
// nonce 기반 CSP(src/middleware.ts)는 요청마다 nonce 가 바뀌므로, 정적 프리렌더된 페이지는
// 빌드 시점 nonce 가 박혀 응답 헤더의 nonce 와 어긋난다 → 스크립트가 전부 차단돼 화면이 깨진다.
// force-dynamic 으로 매 요청 렌더링해 nonce 가 스크립트에 정확히 붙게 한다.
import { LoginForm } from './form';
import { contactEmail } from '@/legal/privacy';

export const dynamic = 'force-dynamic';

export default function Page() {
  // 크레딧의 연락처는 /privacy 와 **같은 출처**(CONTACT_EMAIL)를 쓴다 — 주소를 두 곳에 적으면
  // 한쪽만 바뀐다. 폼은 클라이언트 컴포넌트라 서버에서 읽어 넘긴다(force-dynamic 이라 재배포 불필요).
  return <LoginForm contact={contactEmail()} />;
}
