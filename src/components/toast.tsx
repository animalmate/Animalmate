'use client';
// 잠깐 떴다 사라지는 알림. 되돌릴 것이 없는 성공("복사했습니다")에만 쓴다 —
// 사람이 조치해야 하는 실패는 ErrorText/Banner 로 화면에 남겨야 한다.
import { useEffect } from 'react';

export function Toast({ text, onDone, durationMs = 2000 }: { text: string; onDone: () => void; durationMs?: number }) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onDone, durationMs);
    return () => clearTimeout(t);
    // text 가 바뀌면 타이머를 다시 건다(같은 버튼을 연달아 눌러도 그때부터 다시 센다).
    // onDone 은 호출부 인라인 함수라 의존성에 넣으면 렌더마다 타이머가 되살아난다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, durationMs]);

  if (!text) return null;
  return (
    // 모달(z-50) 위에 떠야 보인다. 팝업 안에서 복사하는 경우가 대부분이다.
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
    >
      <div className="rounded-full bg-ink-900/90 px-4 py-2 text-sm font-medium text-white shadow-modal">{text}</div>
    </div>
  );
}
