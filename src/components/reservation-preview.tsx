'use client';

// 예약이 카페에 실제로 올라갈 모습. **작성 화면과 예약 큐가 같은 것을 쓴다** —
// 두 곳에 따로 두면 한쪽만 고쳐져 "미리보기와 실제가 다르다"는 가장 나쁜 버그가 난다.

/** 미리보기 버튼 — 분홍(coral) 그라디언트 얇은 테두리. 높이는 입력칸(h-control)에 맞춘다. */
export function PreviewButton({ onClick }: { onClick: () => void }) {
  return (
    <span className="inline-block h-control shrink-0 rounded-xl bg-gradient-to-r from-coral-300 via-coral-500 to-coral-300 p-[1.5px]">
      <button
        type="button"
        onClick={onClick}
        className="flex h-full items-center rounded-[10.5px] bg-white px-3.5 text-[13px] font-semibold text-coral-700 transition-colors hover:bg-coral-50"
      >
        미리보기
      </button>
    </span>
  );
}

/** 한 건이 실제로 카페에 올라갈 모습(제목 + 본문). 채워지지 않은 값이 있으면 함께 알려준다. */
export function ReservationPreview({
  title,
  body,
  missing,
  meta,
}: {
  title: string;
  body: string;
  missing: string[];
  meta: string;
}) {
  return (
    <div className="space-y-3">
      <div className="text-[13px] text-ink-500">{meta}</div>
      <div className="space-y-2 rounded-xl bg-cream-100 p-3">
        <div className="font-medium text-ink-900">{title || '(제목 없음)'}</div>
        <pre className="whitespace-pre-wrap font-sans text-sm text-ink-700">{body || '(본문 없음)'}</pre>
      </div>
      {missing.length > 0 ? (
        <div className="text-[13px] text-warning-700">
          아직 비어 있음: {missing.map((k) => `{{${k}}}`).join(', ')} — 채우지 않으면 이 예약은 업로드되지 않습니다.
        </div>
      ) : (
        <div className="text-[13px] text-ink-500">이대로 카페에 올라갑니다.</div>
      )}
    </div>
  );
}
