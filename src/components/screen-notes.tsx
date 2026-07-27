'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from './icon';

interface ScreenNotesProps {
  contextKey: string;
  title?: string;
}

export function ScreenNotes({ contextKey, title = '운영진 공용 메모지' }: ScreenNotesProps) {
  const [content, setContent] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

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
      if (res.ok) {
        setLastSaved(new Date());
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-amber-100 bg-gradient-to-r from-amber-50/80 via-cream-50 to-amber-50/80 p-4 shadow-card">
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Icon name="layers" size={16} />
          </span>
          <span className="text-sm font-bold text-ink-900">{title}</span>
          {lastSaved && (
            <span className="text-xs text-ink-500 font-medium">
              (최근 저장: {lastSaved.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})
            </span>
          )}
        </div>
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-ink-500 hover:bg-amber-100/60 hover:text-ink-900 transition-colors"
        >
          {isOpen ? '접기 ▲' : '펼치기 ▼'}
        </button>
      </div>

      {isOpen && (
        <div className="mt-3 space-y-2.5">
          <textarea
            className="w-full min-h-[110px] rounded-xl border border-amber-100/80 bg-white p-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-sans leading-relaxed"
            placeholder="심사 특이사항, 심사위원 간 조율 내용 등을 자유롭게 기록하세요. 운영진 모두에게 공유됩니다..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-400">※ 이 메모는 운영진 권한 사용자 전체에게 실시간 공유됩니다.</span>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600 active:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {saving ? '저장 중…' : '메모 저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
