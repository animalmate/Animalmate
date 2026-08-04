// 클립보드 복사 — 성공 여부를 boolean 으로 돌려준다(버튼이 "복사했습니다"를 거짓말하지 않게).
//
// 폴백이 필요한 이유: `navigator.clipboard` 는 보안 컨텍스트(HTTPS·localhost)에서만 있고,
// 카톡·네이버 앱의 인앱 브라우저나 오래된 안드로이드 크롬에서는 없거나 권한이 거부된다.
// 팀장단이 이 버튼을 누르는 자리가 대부분 휴대폰이라 조용히 실패하면 안 된다.

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 권한 거부·비보안 컨텍스트 — 아래 폴백으로 내려간다.
  }

  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', ''); // iOS 에서 키보드가 올라오지 않게.
    // 화면 밖으로 밀지 않고 투명하게 둔다 — 화면 밖 요소는 iOS 가 선택을 무시한다.
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS 는 select() 만으로는 범위가 안 잡힌다.
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
