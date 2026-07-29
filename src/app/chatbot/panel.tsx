'use client';
import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { Markdown } from '@/components/markdown';
import { Icon } from '@/components/icon';
import { ChatDog, type DogMood } from '@/components/chat-dog';

interface Msg {
  role: 'user' | 'bot';
  text: string;
  pending?: boolean;
  /** 답변 근거가 된 문서 이름들. 모델이 본문에 쓴 것이 아니라 **검색 메타데이터**다(07-DECISIONS 46). */
  sources?: string[];
}

interface AskResponse {
  answer?: string;
  handedOff?: boolean;
  sources?: string[];
  message?: string;
  error?: string;
}

const SUGGESTIONS = ['다음 봉사 언제예요?', '회비는 얼마예요?', '동아리 가입은 어떻게 해요?'];

/** GET /api/chatbot/history — 초기화 경계 이후의 내 대화(오래된 순). */
interface HistoryItem {
  question: string;
  answer: string;
  sources: string[];
  handedOff: boolean;
}

export function ChatbotPanel() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<DogMood>('idle'); // 강아지 반응: idle → thinking → answer
  const [answerNonce, setAnswerNonce] = useState(0); // answer 진입마다 점프 재생
  const [restoring, setRestoring] = useState(true); // 지난 대화를 불러오는 중
  const scrollRef = useRef<HTMLDivElement>(null);

  // 지난 대화 복원 — 나갔다 들어와도 이미 받은 답을 다시 묻지 않아도 된다.
  // ⚠ 이 기록은 화면 복원용이며 모델에게는 보내지 않는다(보내면 매 턴 입력 토큰이 늘어 비용이 커진다).
  useEffect(() => {
    void (async () => {
      const r = await apiGet<{ history?: HistoryItem[] }>('/api/chatbot/history');
      setRestoring(false);
      if (!r.ok) return; // 복원 실패는 조용히 넘어간다 — 새 대화는 그대로 할 수 있다
      const restored = (r.data.history ?? []).flatMap((h): Msg[] => [
        { role: 'user', text: h.question },
        { role: 'bot', text: h.answer, sources: h.handedOff ? [] : h.sources },
      ]);
      if (restored.length > 0) setMsgs(restored);
    })();
  }, []);

  async function clearHistory() {
    if (typeof window !== 'undefined' && !window.confirm('지금까지의 대화를 화면에서 지울까요?')) return;
    const r = await fetch('/api/chatbot/history', { method: 'DELETE' });
    if (r.ok) setMsgs([]);
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    setMood('thinking'); // 질문 받는 즉시 꼬리 흔들며 생각
    setMsgs((m) => [...m, { role: 'user', text: q }, { role: 'bot', text: '', pending: true }]);

    const r = await apiPost<AskResponse>('/api/chatbot/ask', { question: q });
    const data = r.data;
    const answer = r.ok
      ? data.answer ?? ''
      : data.message ?? (data.error === 'too_long' ? '질문이 너무 길어요. 짧게 나눠서 물어봐 주세요.' : '지금은 답할 수 없어요. 잠시 후 다시 시도해 주세요.');

    // 근거 문서를 못 찾아 핸드오프한 답변에는 출처를 붙이지 않는다 — 붙이면
    // "자료를 보고 모른다고 한 것"처럼 읽혀서 사실과 어긋난다.
    const sources = r.ok && !data.handedOff ? (data.sources ?? []) : [];

    setMsgs((m) => {
      const next = m.slice(0, -1); // pending 제거
      return [...next, { role: 'bot', text: answer, sources }];
    });
    setBusy(false);
    setMood('answer'); // 대답하며 폴짝
    setAnswerNonce((n) => n + 1);
    window.setTimeout(() => setMood('idle'), 900); // 점프 후 다시 가만히
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-140px)] max-w-2xl flex-col">
      <div className="mb-2 flex items-center gap-2">
        {/* 대화가 시작되면 강아지가 헤더로 올라와 계속 반응한다(빈 화면일 땐 아래 큰 강아지). */}
        {msgs.length > 0 ? (
          <span className="-my-2 shrink-0">
            <ChatDog mood={mood} answerNonce={answerNonce} size={52} />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold text-ink-900">동아리 챗봇</h1>
          <p className="text-[13px] text-ink-500">동아리 안내 문서를 바탕으로 답해요. 봉사 일정도 물어볼 수 있어요.</p>
        </div>
        {msgs.length > 0 ? (
          <button
            type="button"
            onClick={() => void clearHistory()}
            className="shrink-0 self-start rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12.5px] text-ink-600 transition-colors hover:border-coral-300 hover:text-coral-700"
          >
            대화 초기화
          </button>
        ) : null}
      </div>

      {/* 대화 영역 */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-cream-25 p-3 sm:p-4">
        {restoring && msgs.length === 0 ? (
          // 복원 중에는 빈 화면(추천 질문)을 먼저 보여주지 않는다 — 곧 지난 대화가 뜨는데
          // "무엇이 궁금한가요?"가 깜빡 지나가면 기록이 없어진 것처럼 보인다.
          <div className="flex justify-center py-10">
            <span className="inline-flex gap-1 py-1" aria-label="지난 대화 불러오는 중">
              <Dot /> <Dot delay={150} /> <Dot delay={300} />
            </span>
          </div>
        ) : msgs.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <ChatDog mood={mood} answerNonce={answerNonce} size={104} />
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
                      <Sources names={m.sources} />
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

/**
 * 출처 칩 — 답변 아래에 근거 문서 이름을 붙인다.
 *
 * 왜 모델이 아니라 여기서 그리는가(07-DECISIONS 46): 예전에는 시스템 프롬프트가 "출처를 답변에
 * 쓰라"고 했다가, 모델이 문장 사이에 "(출처: …)"를 흘려 넣어 읽기 나빠지고 없는 문서명을
 * 지어내기도 했다. 지금 시스템 프롬프트는 본문에 출처를 쓰지 못하게 하고, 표시는 **검색이
 * 실제로 집어 온 문서 목록(sources 메타데이터)** 으로만 한다. 지어낼 수 없는 값이다.
 */
function Sources({ names }: { names?: string[] }) {
  if (!names || names.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-2.5">
      <span className="text-[11px] font-semibold text-ink-400">근거 문서</span>
      {names.map((n) => (
        <span
          key={n}
          className="inline-flex items-center rounded-full bg-cream-100 px-2.5 py-1 text-[11.5px] font-medium text-ink-600"
        >
          {n}
        </span>
      ))}
    </div>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-ink-300" style={{ animationDelay: `${delay}ms` }} />;
}
