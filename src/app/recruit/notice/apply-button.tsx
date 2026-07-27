'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { Icon } from '@/components/icon';

/**
 * 지원서 작성 버튼. 마감된 기수면 이동 대신 마감 안내를 띄운다.
 * (마감 여부는 서버가 내려준 값이고, 실제 접수 차단도 /api/recruit/apply 가 다시 검사한다
 *  — 여기서 막는 것은 안내일 뿐 권한이 아니다. 규칙 #6.)
 */
export function ApplyButton({ isClosed, label = '지원서 작성하기' }: { isClosed: boolean; label?: string }) {
  const [showClosed, setShowClosed] = useState(false);

  if (isClosed) {
    return (
      <>
        <Button
          type="button"
          onClick={() => setShowClosed(true)}
          className="w-full bg-ink-400 hover:bg-ink-500 sm:w-auto sm:px-8"
        >
          모집이 마감되었습니다
        </Button>

        {showClosed && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="recruit-closed-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4"
          >
            <div className="w-full max-w-md space-y-4 rounded-2xl border border-ink-200 bg-white p-6 text-center shadow-modal">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Icon name="info" size={24} />
              </div>
              <h2 id="recruit-closed-title" className="text-base font-bold text-ink-900">
                신입 모집이 마감되었습니다
              </h2>
              <p className="text-[13px] leading-relaxed text-ink-500">
                성원에 감사드립니다. 이번 기수의 지원서 접수가 종료되었습니다. 다음 모집에서 만나요.
              </p>
              <Button type="button" onClick={() => setShowClosed(false)} className="w-full" autoFocus>
                확인
              </Button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <a
      href="/recruit/apply"
      className="inline-flex h-control min-h-tap w-full items-center justify-center gap-2 rounded-xl bg-primary px-[18px] text-[15px] font-semibold text-white no-underline transition-colors hover:bg-blue-600 active:bg-blue-700 sm:w-auto sm:px-8"
    >
      <Icon name="edit" size={18} />
      {label}
    </a>
  );
}
