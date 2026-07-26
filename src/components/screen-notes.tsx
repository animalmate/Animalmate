'use client';

import React, { useState, useEffect } from 'react';

interface ScreenNotesProps {
  contextKey: string;
  title?: string;
}

export function ScreenNotes({ contextKey, title = '공용 메모지 (운영진 공유)' }: ScreenNotesProps) {
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
    <div className="border border-border rounded-xl bg-card p-4 shadow-sm my-4">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center space-x-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {lastSaved && (
            <span className="text-xs text-muted-foreground">
              (저장됨: {lastSaved.toLocaleTimeString('ko-KR')})
            </span>
          )}
        </div>
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground">
          {isOpen ? '접기 ▲' : '펼치기 ▼'}
        </button>
      </div>

      {isOpen && (
        <div className="mt-3 space-y-2">
          <textarea
            className="w-full min-h-[100px] p-3 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="운영진과 공유할 메모를 작성하세요..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
