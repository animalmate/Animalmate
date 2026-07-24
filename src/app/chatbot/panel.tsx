'use client';
import { useEffect, useRef, useState } from 'react';
import { apiPost } from '@/lib/api';
import { Markdown } from '@/components/markdown';
import { Icon } from '@/components/icon';

interface Msg {
  role: 'user' | 'bot';
  text: string;
  sources?: string[];
  pending?: boolean;
}

interface AskResponse {
  answer?: string;
  sources?: string[];
  handedOff?: boolean;
  message?: string;
  error?: string;
}

const SUGGESTIONS = ['다음 봉사 언제예요?', '회비는 얼마예요?', '동아리 가입은 어떻게 해요?'];

export function ChatbotPanel() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text: q }, { role: 'bot', text: '', pending: true }]);

    const r = await apiPost<AskResponse>('/api/chatbot/ask', { question: q });
    const data = r.data;
    const answer = r.ok
      ? data.answer ?? ''
      : data.message ?? (data.error === 'too_long' ? '질문이 너무 길어요. 짧게 나눠서 물어봐 주세요.' : '지금은 답할 수 없어요. 잠시 후 다시 시도해 주세요.');

    setMsgs((m) => {
      const next = m.slice(0, -1); // pending 제거
      return [...next, { role: 'bot', text: answer, sources: r.ok ? data.sources : undefined }];
    });
    setBusy(false);
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-140px)] max-w-2xl flex-col">
      <div className="mb-2">
        <h1 className="text-[22px] font-bold text-ink-900">동아리 챗봇</h1>
        <p className="text-[13px] text-ink-500">동아리 안내 문서를 바탕으로 답해요. 봉사 일정도 물어볼 수 있어요.</p>
      </div>

      {/* 대화 영역 */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-cream-25 p-3 sm:p-4">
        {msgs.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <img src="/logo-shapes.png" alt="" className="h-16 w-16 object-contain" />
            <p className="text-[14px] text-ink-500">무엇이 궁금한가요?</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-ink-200 bg-white px-3.5 py-2 text-[13px] text-ink-700 transition-colors hover:border-blue-300"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-2.5 text-[15px] text-white">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-ink-100 bg-white px-4 py-3">
                  {m.pending ? (
                    <span className="inline-flex gap-1 py-1" aria-label="답변 생성 중">
                      <Dot /> <Dot delay={150} /> <Dot delay={300} />
                    </span>
                  ) : (
                    <>
                      <Markdown>{m.text}</Markdown>
                      {m.sources && m.sources.length > 0 ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-2 text-[12px] text-ink-400">
                          <Icon name="doc" size={13} />
                          출처: {m.sources.join(', ')}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            )
          )
        )}
      </div>

      {/* 입력 영역 */}
      <form
        className="mt-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder="궁금한 것을 물어보세요"
            className="max-h-32 min-h-[48px] flex-1 resize-none rounded-2xl border border-ink-200 bg-white px-4 py-3 text-[15px] text-ink-900 outline-none focus:border-blue-400"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white disabled:opacity-40"
            aria-label="보내기"
          >
            <Icon name="chevronRight" size={22} />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[12px] text-ink-400">
          개인정보(이름·연락처)는 입력하지 마세요. 답변이 정확하지 않을 수 있어요.
        </p>
      </form>
    </div>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-ink-300" style={{ animationDelay: `${delay}ms` }} />;
}
