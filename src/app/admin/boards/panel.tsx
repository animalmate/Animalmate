'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

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

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">게시판 레지스트리</h1>
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
          <p className="text-sm text-gray-500">아직 없습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {boards.map((b) => (
              <li key={b.menuid} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-mono text-gray-500">{b.menuid}</span> · {b.name}
                </span>
                <span className="text-xs text-gray-500">
                  {b.botCanWrite ? '봇쓰기' : '봇불가'} · {b.isActive ? '활성' : '비활성'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
