'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, Input, SecondaryButton } from '@/components/ui';

interface Board {
  menuid: number;
  name: string;
  botCanWrite: boolean;
  isActive: boolean;
}

export function BoardsPanel() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [menuid, setMenuid] = useState('');
  const [name, setName] = useState('');
  const [botCanWrite, setBotCanWrite] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await apiGet<{ boards: Board[] }>('/api/boards');
    if (r.ok) setBoards(r.data.boards ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setError('');
    setBusy(true);
    const r = await apiPost('/api/boards', { menuid: Number(menuid), name: name.trim(), botCanWrite });
    setBusy(false);
    if (!r.ok) return setError(errorMessage(r.data.error, r.data.message));
    setMenuid('');
    setName('');
    void load();
  }

  async function patch(menuid: number, body: Record<string, unknown>) {
    setError('');
    const res = await fetch(`/api/boards/${menuid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(errorMessage(d.error, d.message)); return; }
    void load();
  }

  async function remove(b: Board) {
    if (typeof window !== 'undefined' && !window.confirm(`게시판 "${b.name}"(${b.menuid})을 비활성화할까요?`)) return;
    setError('');
    const res = await fetch(`/api/boards/${b.menuid}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(errorMessage(d.error, d.message)); return; }
    void load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-ink-900">게시판 레지스트리</h1>
      <Card className="space-y-3">
        <div className="font-medium">게시판 추가</div>
        <Field label="menuid" hint="카페 게시판 URL 의 menus/ 뒤 숫자">
          <Input inputMode="numeric" value={menuid} onChange={(e) => setMenuid(e.target.value.replace(/\D/g, ''))} placeholder="14" />
        </Field>
        <Field label="이름">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="공지사항" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={botCanWrite} onChange={(e) => setBotCanWrite(e.target.checked)} />
          봇 글쓰기 가능
        </label>
        <ErrorText>{error}</ErrorText>
        <Button disabled={busy || !menuid || !name} onClick={create}>
          {busy ? '추가 중…' : '추가'}
        </Button>
      </Card>

      <Card>
        <div className="mb-2 font-medium">등록된 게시판</div>
        {boards.length === 0 ? (
          <p className="text-sm text-ink-500">아직 없습니다.</p>
        ) : (
          <ul className="divide-y divide-ink-100 text-sm">
            {boards.map((b) => (
              <li key={b.menuid} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-mono text-ink-500">{b.menuid}</span> · {b.name}
                  <span className="ml-2 text-xs text-ink-500">
                    {b.botCanWrite ? '봇쓰기' : '봇불가'} · {b.isActive ? '활성' : '비활성'}
                  </span>
                </span>
                <span className="flex gap-2">
                  <SecondaryButton onClick={() => patch(b.menuid, { botCanWrite: !b.botCanWrite })}>
                    {b.botCanWrite ? '봇쓰기 끄기' : '봇쓰기 켜기'}
                  </SecondaryButton>
                  <SecondaryButton onClick={() => patch(b.menuid, { isActive: !b.isActive })}>
                    {b.isActive ? '비활성화' : '활성화'}
                  </SecondaryButton>
                  {b.isActive ? <SecondaryButton onClick={() => remove(b)}>삭제</SecondaryButton> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
