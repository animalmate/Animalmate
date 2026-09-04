'use client';
// 번개 화면 두 곳(게시판 목록·상세)이 함께 쓰는 표시 조각.
//
// 한 파일에 모아 둔 이유: 상태 딱지 색과 문구가 목록과 상세에서 달라지면 같은 번개가
// 화면마다 다른 상태로 보인다. 딱지는 한 곳에서만 정의한다.
import { useEffect, useRef, useState } from 'react';
import type { FlashStatus, FlashSignupStatus, SignupWindow } from '@/flash/flash';
import { Icon } from '@/components/icon';
import { kstDateTimeLabel, weekdayOf } from '@/lib/kst-date';

const FLASH_STATUS: Record<FlashStatus, { label: string; cls: string }> = {
  pending: { label: '승인 대기', cls: 'bg-amber-50 text-amber-700' },
  open: { label: '모집 중', cls: 'bg-success-100 text-success-700' },
  closed: { label: '신청 마감', cls: 'bg-ink-100 text-ink-700' },
  canceled: { label: '취소됨', cls: 'bg-coral-50 text-coral-700' },
  rejected: { label: '거절됨', cls: 'bg-coral-50 text-coral-700' },
};

/**
 * @param window 있으면 **신청 창까지 반영**한다. `모집 중` 인데 아직 시작 전이면 `신청 예정` 으로
 *   바꿔 그린다 — 같은 화면에 "모집 중" 과 "아직 신청할 수 없어요" 가 나란히 서면, 읽는 사람은
 *   둘 중 어느 쪽이 사실인지 확인하러 들어가 본다(QA 캡처에서 실제로 그렇게 보였다).
 */
export function FlashStatusBadge({ status, window }: { status: FlashStatus; window?: SignupWindow }) {
  const s =
    status === 'open' && window === 'not_yet'
      ? { label: '신청 예정', cls: 'bg-amber-50 text-amber-700' }
      : FLASH_STATUS[status];
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

/**
 * 개최자가 직접 넣어 준 자리 표시.
 *
 * **명단에 그대로 드러낸다.** 이 게시판을 만든 이유가 "먼저 온 순서가 남는다"라서, 순서를
 * 거치지 않고 앉은 자리를 조용히 섞어 두면 뒤에서 대기 중인 사람에게는 선착순이 거짓말이 된다.
 */
export function PlacedTag() {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-500">
      개최자가 넣음
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

/** 'YYYY-MM-DD' → 오늘·내일이면 그 말로, 아니면 '9월 12일(토)'. 목록에서 눈이 먼저 가는 값이다. */
export function relativeDayLabel(date: string, weekday: string, todayIso: string): string {
  if (date === todayIso) return '오늘';
  const tomorrow = new Date(`${todayIso}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (date === tomorrow.toISOString().slice(0, 10)) return '내일';
  return dayLabel(date, weekday || weekdayOf(date));
}

/**
 * 목록 딱지에 쓰는 짧은 신청 시작 문구. `9/30(수) 오후 3:00 시작`
 * 카드 한 줄에 딱지가 서너 개 서므로 여기서는 `월`·`일` 글자를 뺀다.
 */
export function signupOpenShort(iso: string): string {
  const full = kstDateTimeLabel(new Date(iso)); // '9월 30일(수) 오후 3:00'
  return `${full.replace(/(\d+)월 (\d+)일/, '$1/$2')} 시작`;
}

/** 남은 시간 → `2일 3시간` / `12분 07초`. 1분 미만은 초까지 센다(그 순간이 오픈런이다). */
export function remainLabel(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (d > 0) return `${d}일 ${h}시간`;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분 ${String(sec).padStart(2, '0')}초`;
}

/**
 * 신청 시작까지 남은 시간을 센다. 0 이 되면 `onOpen` 을 한 번 부른다.
 *
 * **브라우저 시계를 그대로 쓰지 않는다.** 서버가 준 시각(`serverNow`)과의 차이를 한 번 재고
 * 그 위에 센다 — 기기 시계가 몇 분 틀어져 있으면 "0초" 인데 서버는 아직 거부하거나, 반대로
 * 이미 열렸는데 화면만 잠겨 있다. 오픈런에서는 그 몇 초가 자리를 가른다.
 *
 * 0 이 됐을 때 폼을 곧바로 풀지 않고 **다시 불러오는** 이유도 같다. 자리를 주는 판단은 서버
 * 한 곳뿐이고(`signUpToFlash`), 화면은 그 판단을 따라가기만 하면 된다.
 */
export function SignupCountdown({
  openAt,
  serverNow,
  onOpen,
}: {
  openAt: string;
  serverNow: string;
  onOpen: () => void;
}) {
  const offset = useRef(Date.parse(serverNow) - Date.now());
  const fired = useRef(false);
  const [left, setLeft] = useState(() => Date.parse(openAt) - (Date.now() + offset.current));

  useEffect(() => {
    offset.current = Date.parse(serverNow) - Date.now();
    fired.current = false;
    const tick = () => {
      const ms = Date.parse(openAt) - (Date.now() + offset.current);
      setLeft(ms);
      if (ms <= 0 && !fired.current) {
        fired.current = true;
        onOpen();
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // onOpen 은 호출부에서 인라인으로 오는 경우가 많아 의존성에 두면 매 렌더마다 타이머가 다시 선다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAt, serverNow]);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-700">
        <Icon name="clock" size={15} />
        {kstDateTimeLabel(new Date(openAt))} 부터 신청할 수 있어요
      </p>
      <p className="mt-1 text-[22px] font-bold tabular-nums text-amber-800" aria-live="off">
        {left > 0 ? remainLabel(left) : '곧 열려요…'}
      </p>
      <p className="mt-1 text-[13px] text-amber-700">시간이 되면 이 자리에 신청 칸이 저절로 나타나요.</p>
    </div>
  );
}
