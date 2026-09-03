'use client';
// 함께 여는 사람 고르기 — 이름 두 글자부터 찾아 준다.
//
// 전체 명단을 셀렉트로 내려 주지 않는 이유: 300명이 들어간 셀렉트는 고르기도 어렵거니와,
// 부원도 여는 화면이라 브라우저에 회원 명단이 통째로 실리게 된다. 서버도 두 글자 미만이면
// 아무것도 돌려주지 않는다(`searchCoHostCandidates`) — 이 제한은 화면이 아니라 거기가 본체다.
import { useEffect, useRef, useState } from 'react';
import { apiGet } from '@/lib/api';
import { Icon } from '@/components/icon';
import { Input } from '@/components/ui';

export interface CoHost {
  userId: string;
  name: string;
}

export function CoHostPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: CoHost[];
  onChange: (next: CoHost[]) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CoHost[]>([]);
  const [searching, setSearching] = useState(false);
  // 타이핑마다 조회하면 한 글자에 요청 하나다. 마지막 입력만 살린다.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (timer.current) clearTimeout(timer.current);
    if (term.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const r = await apiGet<{ candidates: CoHost[] }>(`/api/flash-cohosts?q=${encodeURIComponent(term)}`);
      setSearching(false);
      if (r.ok) setHits(r.data.candidates ?? []);
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  const picked = new Set(value.map((v) => v.userId));

  function add(c: CoHost) {
    if (picked.has(c.userId)) return;
    onChange([...value, c]);
    setQ('');
    setHits([]);
  }

  return (
    <div className="space-y-2">
      <Input
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        placeholder="이름 두 글자부터 검색"
        uiSize="sm"
        aria-label="함께 여는 사람 검색"
      />
      {q.trim().length >= 2 ? (
        <div className="rounded-xl border border-ink-200 bg-white">
          {searching ? (
            <p className="px-3 py-2.5 text-[13px] text-ink-500">찾는 중…</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2.5 text-[13px] text-ink-500">그 이름의 회원이 없어요.</p>
          ) : (
            <ul className="max-h-44 overflow-y-auto py-1">
              {hits.map((c) => (
                <li key={c.userId}>
                  <button
                    type="button"
                    onClick={() => add(c)}
                    disabled={picked.has(c.userId)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-900 hover:bg-cream-50 disabled:text-ink-400"
                  >
                    <Icon name={picked.has(c.userId) ? 'check' : 'plus'} size={15} />
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <li key={c.userId}>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-3 pr-1.5 text-[13px] font-semibold text-blue-700">
                {c.name}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(value.filter((v) => v.userId !== c.userId))}
                  aria-label={`${c.name} 빼기`}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-blue-500 hover:bg-blue-100"
                >
                  <Icon name="x" size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
