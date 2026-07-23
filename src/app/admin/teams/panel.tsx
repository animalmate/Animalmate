'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input, SecondaryButton, Select } from '@/components/ui';

interface Team {
  id: string;
  name: string;
  kind: string;
  isActive: boolean;
}

const KIND_LABEL: Record<string, string> = { activity: '활동팀', functional: '기능팀' };

export function TeamsPanel() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('activity');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await apiGet<{ teams: Team[] }>('/api/admin/teams');
    if (r.ok) setTeams(r.data.teams ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setError('');
    setBusy(true);
    const r = await apiPost('/api/admin/teams', { name: name.trim(), kind });
    setBusy(false);
    if (!r.ok) return setError(errorMessage(r.data.error, r.data.message));
    setName('');
    void load();
  }

  async function toggle(t: Team) {
    setError('');
    await fetch(`/api/admin/teams/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    void load();
  }

  async function remove(t: Team) {
    setError('');
    const res = await fetch(`/api/admin/teams/${t.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.error === 'team_in_use') {
        setError(
          `삭제 불가: 이 팀에 회차 ${d.counts?.events ?? 0} · 프리셋 ${d.counts?.presets ?? 0} · 예약 ${d.counts?.reservations ?? 0}건이 있습니다. 대신 "비활성화"하세요.`
        );
        return;
      }
      setError(errorMessage(d.error, d.message));
      return;
    }
    void load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">조직(팀)</h1>
      <Card className="space-y-3">
        <div className="font-medium">팀 추가</div>
        <Field label="팀 이름">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="1팀 / 홍보팀 ..." />
        </Field>
        <Field label="종류">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="activity">활동팀(봉사)</option>
            <option value="functional">기능팀(기획·홍보·총무 등)</option>
          </Select>
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button disabled={busy || !name} onClick={create}>
          {busy ? '추가 중…' : '추가'}
        </Button>
      </Card>

      <Card>
        <div className="mb-2 font-medium">팀 목록</div>
        {teams.length === 0 ? (
          <InfoText>아직 팀이 없습니다.</InfoText>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {teams.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {t.name} <span className="text-xs text-gray-500">({KIND_LABEL[t.kind] ?? t.kind})</span>
                  {!t.isActive ? <span className="ml-1 text-xs text-gray-400">· 비활성</span> : null}
                </span>
                <span className="flex gap-2">
                  <SecondaryButton onClick={() => toggle(t)}>{t.isActive ? '비활성화' : '활성화'}</SecondaryButton>
                  <SecondaryButton onClick={() => remove(t)}>삭제</SecondaryButton>
                </span>
              </li>
            ))}
          </ul>
        )}
        <InfoText>회차·예약이 있는 팀은 삭제 대신 비활성화됩니다(기록 보존).</InfoText>
      </Card>
    </div>
  );
}
