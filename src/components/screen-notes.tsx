'use client';

import React, { useEffect, useId, useState } from 'react';
import { Icon } from './icon';

interface ScreenNotesProps {
  contextKey: string;
  title?: string;
}

/**
 * 화면별 공용 메모지(09-RECRUIT-DESIGN §6.6). 운영진 누구나 같이 쓰고 지운다.
 * 기본 접힘 — 심사 화면의 주 내용을 가리지 않게 한다.
 */
export function ScreenNotes({ contextKey, title = '운영진 공용 메모지' }: ScreenNotesProps) {
  const [content, setContent] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const panelId = useId();

  useEffect(() => {
    fetch(`/api/recruit/notes?contextKey=${encodeURIComponent(contextKey)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.note?.content) {
          setContent(data.note.content);
          if (data.note.updatedAt) setLastSaved(new Date(data.note.updatedAt));
        }
      })
      .catch(() => {});
  }, [contextKey]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/recruit/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextKey, content }),
      });
      if (res.ok) setLastSaved(new Date());
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
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Icon name="layers" size={16} />
          </span>
          <span className="text-sm font-bold text-ink-900">{title}</span>
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

      <div id={panelId} hidden={!isOpen} className="space-y-3 px-4 pb-4">
        <textarea
          className="min-h-[110px] w-full rounded-xl border-[1.5px] border-ink-200 bg-white p-3 text-sm leading-relaxed text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-blue-500"
          placeholder="심사 특이사항, 운영진 간 조율 내용을 자유롭게 기록하세요."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          aria-label={title}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-400">운영진 전체에게 공유됩니다.</span>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="inline-flex h-control-sm min-h-tap items-center gap-1.5 rounded-xl border border-ink-300 bg-white px-3.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-cream-50 disabled:opacity-50"
          >
            {saving ? '저장 중…' : '메모 저장'}
          </button>
        </div>
      </div>
    </section>
  );
}
