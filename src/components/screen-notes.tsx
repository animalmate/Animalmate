'use client';

import React, { useEffect, useId, useState } from 'react';
import { Icon } from './icon';
import { AutoGrowTextarea } from './auto-grow-textarea';
import { buildNoteKey, ALL_TEAMS } from '@/recruit/note-keys';

interface ScreenNotesProps {
  /** 화면 구분자. 'doc' | 'interview-assign' | 'interview-console' */
  screen: string;
  cohortId: string;
  /** 화면의 팀 필터 값. 팀마다 메모지가 따로 있다. */
  team?: string;
  title?: string;
}

/**
 * 화면별 공용 메모지(09-RECRUIT-DESIGN §6.6). 운영진 누구나 같이 쓰고 지운다.
 * 기수·팀별로 따로 쓰고(1팀 심사 중 쓰는 메모지와 2팀 것이 섞이지 않게), 기수 폐기 시 함께 지워진다.
 * 기본 접힘 — 심사 화면의 주 내용을 가리지 않게 한다.
 */
export function ScreenNotes({ screen, cohortId, team = ALL_TEAMS, title = '운영진 공용 메모지' }: ScreenNotesProps) {
  const [content, setContent] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const panelId = useId();

  const contextKey = cohortId ? buildNoteKey(cohortId, screen, team) : '';
  const teamLabel = !team || team === ALL_TEAMS ? '전체' : team;

  // 기수나 팀이 바뀌면 다른 메모지다 — 이전 내용을 남겨두면 엉뚱한 메모지에 덮어쓴다.
  useEffect(() => {
    if (!contextKey) return;
    let cancelled = false;
    setLoading(true);
    setContent('');
    setLastSaved(null);
    setError('');
    fetch(`/api/recruit/notes?contextKey=${encodeURIComponent(contextKey)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setContent(data.note?.content ?? '');
        setLastSaved(data.note?.updatedAt ? new Date(data.note.updatedAt) : null);
      })
      .catch(() => {
        if (!cancelled) setError('메모지를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // 늦게 도착한 옛 요청이 새 메모지를 덮어쓰지 않게 한다.
    return () => {
      cancelled = true;
    };
  }, [contextKey]);

  const handleSave = async () => {
    if (!contextKey) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/recruit/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextKey, content }),
      });
      if (res.ok) {
        setLastSaved(new Date());
      } else {
        // 저장 실패를 삼키면 적어둔 내용이 사라진 걸 나중에야 안다.
        const data = await res.json().catch(() => ({}));
        setError(`저장하지 못했습니다. ${data.message || data.error || ''}`.trim());
      }
    } catch {
      setError('저장하지 못했습니다. 연결을 확인해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-amber-100 bg-amber-50/50 shadow-card">
      {/* 헤더 전체가 하나의 버튼 — 예전엔 div 에 onClick 이 있고 버튼은 빈 껍데기라
          키보드로는 펼칠 수 없었다. */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex min-h-tap w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-amber-100/50"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Icon name="layers" size={16} />
          </span>
          <span className="text-sm font-bold text-ink-900">{title}</span>
          {/* 어느 팀 메모지를 보고 있는지 접힌 상태에서도 보여야 한다. */}
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {teamLabel}
          </span>
          {lastSaved && (
            <span className="text-xs font-medium text-ink-500">
              최근 저장 {lastSaved.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-ink-500">
          {isOpen ? '접기' : '펼치기'}
          <Icon
            name="chevronDown"
            size={16}
            className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {/* 펼치면 내용 전체가 한 번에 보이게 한다 — 고정 높이 상자 안에서 스크롤하며 읽지 않도록.
          hidden 일 때는 높이 계산이 0 이 되므로, 접힌 동안에는 아예 렌더하지 않는다. */}
      <div id={panelId} hidden={!isOpen} className="space-y-3 px-4 pb-4">
        {isOpen &&
          (loading ? (
            <p className="py-4 text-sm text-ink-500">메모지를 불러오는 중…</p>
          ) : (
            <AutoGrowTextarea
              minRows={4}
              placeholder={`${teamLabel} 심사 특이사항, 운영진 간 조율 내용을 자유롭게 기록하세요.`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              aria-label={`${title} (${teamLabel})`}
            />
          ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-400">
            {teamLabel} 메모지 · 운영진 전체에게 공유되며, 기수 폐기 시 함께 삭제됩니다.
          </span>
          <button
            type="button"
            disabled={saving || loading}
            onClick={handleSave}
            className="inline-flex h-control-sm min-h-tap items-center gap-1.5 rounded-xl border border-ink-300 bg-white px-3.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-cream-50 disabled:opacity-50"
          >
            {saving ? '저장 중…' : '메모 저장'}
          </button>
        </div>
        {error && (
          <p className="text-[13px] text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
