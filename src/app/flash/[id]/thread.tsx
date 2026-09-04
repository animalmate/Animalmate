'use client';
// 신청 한 건의 대화 — 신청자와 개최자 사이 1:1 쪽지.
//
// 첫 줄이 신청 메시지다(사용자 결정: "메시지 자체가 신청"). 그래서 이 대화는 거의 언제나
// 신청자가 먼저 말한 상태로 시작한다.
//
// 예외 하나: **개최자가 명단에 직접 넣은 자리**(`thread.placed`)는 아무도 말한 적이 없어
// 대화가 비어 있다. 빈 상자를 그대로 두면 "안 불러와졌나"로 읽히므로 왜 비었는지를 적는다.
import { useEffect, useRef, useState } from 'react';
import { apiPost, errorMessage, waitMessage } from '@/lib/api';
import { Button, Textarea, ErrorText } from '@/components/ui';
import { Icon } from '@/components/icon';
import type { ThreadView } from '@/flash/flash';

/** ISO → '9/12 14:02'. 대화는 흐름이 중요해서 연도까지 적지 않는다. */
function stamp(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function MessageThread({
  thread,
  me,
  canWrite,
  onSent,
}: {
  thread: ThreadView;
  me: string;
  /** 마감·취소된 번개에서는 대화창을 닫는다(끝난 일에 답이 오지 않는다). */
  canWrite: boolean;
  onSent: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  // 새 쪽지는 아래에 붙는다 — 열자마자 **마지막 줄**이 보여야 방금 온 말을 읽는다.
  // 위가 보이면 처음 신청 메시지를 다시 읽게 되고, 정작 새 말은 스크롤 밖에 있다.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.messages.length]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setError('');
    setBusy(true);
    const r = await apiPost(`/api/flash-signups/${thread.signupId}`, { message: body });
    setBusy(false);
    if (!r.ok) {
      if (r.status === 429) return setError(waitMessage(r.data.retryAfter));
      return setError(r.data.message ?? errorMessage(r.data.error));
    }
    setText('');
    onSent();
  }

  return (
    <div className="space-y-2.5">
      {/* 대화가 길어져도 카드가 끝없이 늘어나지 않게 상자를 정해 둔다 — 그러지 않으면 아래에
          붙은 신청 취소·내보내기 버튼이 화면 밖으로 밀려 찾을 수 없게 된다. */}
      {thread.messages.length === 0 ? (
        <p className="rounded-xl bg-cream-50 px-3.5 py-3 text-[13px] text-ink-500">
          {thread.placed
            ? '개최자가 명단에 넣어 준 자리라 아직 오간 말이 없어요.'
            : '아직 오간 말이 없어요.'}
        </p>
      ) : null}
      <ul ref={listRef} className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
        {thread.messages.map((m) => {
          const mine = m.senderId === me;
          return (
            <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`min-w-0 max-w-[85%] ${mine ? 'text-right' : ''}`}>
                <p className="mb-0.5 text-[11px] text-ink-400">
                  {mine ? '나' : m.senderName}
                  {!mine && m.fromHost ? ' · 개최자' : ''} · {stamp(m.createdAt)}
                </p>
                <p
                  className={`inline-block whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left text-[14px] leading-relaxed ${
                    mine ? 'bg-blue-600 text-white' : 'bg-cream-50 text-ink-900'
                  }`}
                >
                  {m.body}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {canWrite ? (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            // Enter 로 보내지 않는다 — 한글은 조합 중에 Enter 가 확정 키라, 가로채면
            // 쓰다 만 문장이 그대로 나간다. 줄바꿈이 자유로운 편이 대화에도 맞다.
            maxLength={1000}
            placeholder="메시지 입력…"
            aria-label="메시지 입력"
          />
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end">
            <Button type="button" onClick={send} disabled={busy || !text.trim()}>
              <Icon name="chat" size={16} />
              {busy ? '보내는 중…' : '보내기'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
