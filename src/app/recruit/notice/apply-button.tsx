'use client';

import { useState } from 'react';
import { ctaDisabled, ctaPrimary } from '@/components/ui';
import { Icon } from '@/components/icon';

/**
 * 지원서 작성 버튼. 마감된 기수면 이동 대신 마감 안내를 띄운다.
 * (마감 여부는 서버가 내려준 값이고, 실제 접수 차단도 /api/recruit/apply 가 다시 검사한다
 *  — 여기서 막는 것은 안내일 뿐 권한이 아니다. 규칙 #6.)
 */
export function ApplyButton({ isClosed }: { isClosed: boolean }) {
  const [showClosed, setShowClosed] = useState(false);

  if (isClosed) {
    return (
      <>
        <button type="button" onClick={() => setShowClosed(true)} className={ctaDisabled}>
          모집이 마감되었어요
        </button>

        {showClosed && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="recruit-closed-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4"
          >
            <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-7 text-center shadow-modal">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Icon name="info" size={26} />
              </div>
              <h2 id="recruit-closed-title" className="text-base font-bold text-ink-900">
                이번 모집은 마감되었어요
              </h2>
              <p className="text-sm leading-relaxed text-ink-500">
                관심 가져 주셔서 고맙습니다. 다음 모집에서 만나요.
              </p>
              <button
                type="button"
                onClick={() => setShowClosed(false)}
                className={`${ctaPrimary} w-full`}
                autoFocus
              >
                확인
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <a href="/recruit/apply" className={ctaPrimary}>
      <Icon name="edit" size={18} />
      지원서 작성하기
    </a>
  );
}
