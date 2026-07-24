// 404 — 서버 렌더 + 순수 링크로 만든다(클라이언트 JS 불필요).
// 이유: 404 는 정적이라 nonce CSP 아래서 프레임워크 스크립트가 차단될 수 있다. 그래도 내용과
// "홈으로" 링크가 순수 HTML 이면 JS 없이도 완전히 동작한다(콘솔 잡음은 남지만 기능엔 영향 없음).
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-4 text-center">
      <img src="/logo.png" alt="애니멀메이트" className="h-16 w-16 rounded-full" />
      <h1 className="mt-4 text-[22px] font-bold text-ink-900">페이지를 찾을 수 없어요</h1>
      <p className="mt-1 text-[13px] text-ink-500">주소가 바뀌었거나 없는 페이지예요.</p>
      <a
        href="/"
        className="mt-6 rounded-full bg-ink-900 px-5 py-2.5 text-[14px] font-semibold text-white"
      >
        홈으로 돌아가기
      </a>
    </main>
  );
}
