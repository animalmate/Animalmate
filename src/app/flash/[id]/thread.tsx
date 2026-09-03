'use client';
// 신청 한 건의 대화 — 신청자와 개최자 사이 1:1 쪽지.
//
// 첫 줄이 신청 메시지다(사용자 결정: "메시지 자체가 신청"). 그래서 이 대화는 언제나
// 신청자가 먼저 말한 상태로 시작하고, 빈 대화는 존재하지 않는다.
import { useState } from 'react';
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
      <ul className="space-y-2">
        {thread.messages.map((m) => {
          const mine = m.senderId === me;
          return (
            <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] min-w-0 ${mine ? 'text-right' : ''}`}>
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
