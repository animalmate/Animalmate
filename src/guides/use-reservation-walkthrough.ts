'use client';
// 둘러보기를 언제 열고 언제 참을지 — 순수 규칙(`reservation-walkthrough.ts`)을 브라우저 저장소에 잇는다.
//
// 규칙과 저장소를 갈라 둔 이유: "하루 지났나"는 단위 테스트로 증명할 수 있어야 하는데
// localStorage 를 섞으면 그 판단이 브라우저 없이는 확인되지 않는다. 여기서는 값을 읽어다 주고
// 결정은 순수 함수에 맡긴다.
import { useCallback, useEffect, useState } from 'react';
import {
  SESSION_KEY,
  SNOOZE_KEY,
  parseSnoozedUntil,
  shouldAutoOpen,
  snoozeUntilFrom,
} from './reservation-walkthrough';

/** 저장소는 없을 수 있다(사생활 보호 모드·저장 공간 꽉 참). 안내 팝업 하나 때문에 화면이 죽으면 안 된다. */
function safeGet(store: 'local' | 'session', key: string): string | null {
  try {
    return (store === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function safeSet(store: 'local' | 'session', key: string, value: string | null): void {
  try {
    const s = store === 'local' ? window.localStorage : window.sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* 저장 못 해도 그냥 넘어간다 — 다음에 한 번 더 뜰 뿐이다. */
  }
}

export function useReservationWalkthrough() {
  const [open, setOpen] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);

  // 서버 렌더에는 저장소가 없다. 첫 그림은 닫힌 상태로 그리고, 붙은 뒤에 열지 말지 정한다
  // (그래야 서버와 클라이언트의 첫 렌더가 어긋나지 않는다).
  useEffect(() => {
    const now = Date.now();
    const raw = safeGet('local', SNOOZE_KEY);
    setSnoozedUntil(parseSnoozedUntil(raw, now));
    if (shouldAutoOpen({ now, snoozedUntilRaw: raw, closedThisSession: safeGet('session', SESSION_KEY) === '1' })) {
      setOpen(true);
    }
  }, []);

  // 닫으면 이 탭에서는 다시 저절로 뜨지 않는다. 큐를 들락거릴 때마다 뜨는 것이 제일 성가시다.
  const close = useCallback(() => {
    safeSet('session', SESSION_KEY, '1');
    setOpen(false);
  }, []);

  const toggleSnooze = useCallback((next: boolean) => {
    const until = next ? snoozeUntilFrom(Date.now()) : null;
    safeSet('local', SNOOZE_KEY, until === null ? null : String(until));
    setSnoozedUntil(until);
  }, []);

  /** 버튼으로 여는 길. 스누즈 중이어도 열린다 — 미뤄 둔 것과 보고 싶은 것은 다른 이야기다. */
  const openManually = useCallback(() => setOpen(true), []);

  return { open, snoozedUntil, close, toggleSnooze, openManually };
}
