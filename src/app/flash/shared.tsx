'use client';
// 번개 화면 두 곳(게시판 목록·상세)이 함께 쓰는 표시 조각.
//
// 한 파일에 모아 둔 이유: 상태 딱지 색과 문구가 목록과 상세에서 달라지면 같은 번개가
// 화면마다 다른 상태로 보인다. 딱지는 한 곳에서만 정의한다.
import type { FlashStatus, FlashSignupStatus } from '@/flash/flash';
import { Icon } from '@/components/icon';

const FLASH_STATUS: Record<FlashStatus, { label: string; cls: string }> = {
  pending: { label: '승인 대기', cls: 'bg-amber-50 text-amber-700' },
  open: { label: '모집 중', cls: 'bg-success-100 text-success-700' },
  closed: { label: '신청 마감', cls: 'bg-ink-100 text-ink-700' },
  canceled: { label: '취소됨', cls: 'bg-coral-50 text-coral-700' },
  rejected: { label: '거절됨', cls: 'bg-coral-50 text-coral-700' },
};

export function FlashStatusBadge({ status }: { status: FlashStatus }) {
  const s = FLASH_STATUS[status];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}

const SIGNUP_STATUS: Record<FlashSignupStatus, { label: string; cls: string }> = {
  confirmed: { label: '신청 확정', cls: 'bg-blue-100 text-blue-700' },
  waitlisted: { label: '대기 중', cls: 'bg-amber-50 text-amber-700' },
  canceled: { label: '신청 취소', cls: 'bg-ink-100 text-ink-500' },
};

/** 내 신청 상태 딱지. 대기면 몇 번째인지까지 붙인다 — 그게 대기자가 가장 알고 싶은 값이다. */
export function MySignupBadge({ status, order }: { status: FlashSignupStatus; order?: number | null }) {
  const s = SIGNUP_STATUS[status];
  const label = status === 'waitlisted' && order ? `대기 ${order}번` : s.label;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>
      {label}
    </span>
  );
}

/** 안 읽은 쪽지 개수 점. 0 이면 아무것도 그리지 않는다(빈 동그라미는 읽은 것처럼 보인다). */
export function UnreadDot({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-coral-500 px-1.5 text-[11px] font-bold text-white"
      aria-label={`안 읽은 메시지 ${count}건`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** 'YYYY-MM-DD' + 요일 → '9월 12일(토)'. 번개 화면에서 날짜를 말하는 유일한 표기. */
export function dayLabel(date: string, weekday: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일(${weekday})`;
}

/**
 * 자리 현황 한 줄 — `확정 5/5 · 대기 2명`. 정원이 없으면 확정 인원만 말한다
 * (`5/무제한` 같은 표기는 읽는 순간 한 번 더 생각하게 만든다).
 */
export function SeatSummary({
  confirmed,
  waiting,
  capacity,
}: {
  confirmed: number;
  waiting: number;
  capacity: number | null;
}) {
  const full = capacity != null && confirmed >= capacity;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-500">
      <Icon name="users" size={14} />
      <span className={full ? 'font-semibold text-coral-600' : ''}>
        {capacity == null ? `${confirmed}명 신청` : `확정 ${confirmed}/${capacity}`}
      </span>
      {waiting > 0 ? <span className="text-amber-700">· 대기 {waiting}명</span> : null}
    </span>
  );
}
