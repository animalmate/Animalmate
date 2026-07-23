'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input, SecondaryButton, Select } from '@/components/ui';

interface Leader { label: string; name: string; phone: string }
interface Member { userId: string; email: string; name: string; position: string }
interface Team {
  id: string;
  name: string;
  kind: string;
  isActive: boolean;
  leaders: Leader[];
  members: Member[];
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

  async function patch(id: string, body: unknown) {
    setError('');
    const res = await fetch(`/api/admin/teams/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(errorMessage(d.error, d.message)); return; }
    void load();
  }

  async function remove(t: Team) {
    setError('');
    const res = await fetch(`/api/admin/teams/${t.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.error === 'team_in_use') {
        setError(`삭제 불가: 이 팀에 회차 ${d.counts?.events ?? 0} · 프리셋 ${d.counts?.presets ?? 0} · 예약 ${d.counts?.reservations ?? 0}건이 있습니다. 대신 "비활성화"하세요.`);
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
        <Field label="팀 이름"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="1팀 / 홍보팀 ..." /></Field>
        <Field label="종류">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="activity">활동팀(봉사)</option>
            <option value="functional">기능팀(기획·홍보·총무 등)</option>
          </Select>
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button disabled={busy || !name} onClick={create}>{busy ? '추가 중…' : '추가'}</Button>
      </Card>

      {teams.map((t) => (
        <Card key={t.id} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {t.name} <span className="text-xs text-gray-500">({KIND_LABEL[t.kind] ?? t.kind})</span>
              {!t.isActive ? <span className="ml-1 text-xs text-gray-400">· 비활성</span> : null}
            </span>
            <span className="flex gap-2">
              <SecondaryButton onClick={() => patch(t.id, { isActive: !t.isActive })}>{t.isActive ? '비활성화' : '활성화'}</SecondaryButton>
              <SecondaryButton onClick={() => remove(t)}>삭제</SecondaryButton>
            </span>
          </div>
          <TeamLeadersManager team={t} onError={setError} onChanged={load} />
          <LeadersEditor team={t} onSave={(leaders) => patch(t.id, { leaders })} />
        </Card>
      ))}
      <InfoText>회차·예약이 있는 팀은 삭제 대신 비활성화됩니다(기록 보존). 팀장단 명단은 공지 {'{{팀장단}}'}에 자동 삽입됩니다.</InfoText>
    </div>
  );
}

// 팀장(관리 담당) 계정 지정 — 이메일로 추가/제거(회장단·시스템관리자). 지정된 팀장은 자기 팀만 관리.
function TeamLeadersManager({ team, onError, onChanged }: { team: Team; onError: (m: string) => void; onChanged: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    onError('');
    if (!email.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/admin/teams/${team.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), position: 'leader' }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); onError(errorMessage(d.error, d.message)); return; }
    setEmail('');
    onChanged();
  }

  async function remove(m: Member) {
    onError('');
    const res = await fetch(`/api/admin/teams/${team.id}/members?userId=${encodeURIComponent(m.userId)}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json().catch(() => ({})); onError(errorMessage(d.error, d.message)); return; }
    onChanged();
  }

  return (
    <div className="space-y-2 rounded-md border border-gray-200 p-3">
      <div className="text-sm font-medium text-gray-700">팀장(관리 담당) — 이메일로 지정</div>
      <InfoText>지정된 팀장은 이 팀의 템플릿·예약만 관리할 수 있습니다(가입 완료된 회원만 지정 가능).</InfoText>
      {team.members.length > 0 ? (
        <ul className="divide-y divide-gray-100 text-sm">
          {team.members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between py-1.5">
              <span>{m.name} <span className="text-xs text-gray-500">{m.email} · {m.position === 'leader' ? '팀장' : '팀원'}</span></span>
              <button className="text-xs text-red-600 underline" onClick={() => remove(m)}>해제</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">아직 지정된 팀장이 없습니다.</p>
      )}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="leader@example.com" autoComplete="off" />
        <Button disabled={busy || !email.trim()} onClick={add}>{busy ? '지정 중…' : '팀장 지정'}</Button>
      </div>
    </div>
  );
}

function LeadersEditor({ team, onSave }: { team: Team; onSave: (leaders: Leader[]) => void }) {
  const [rows, setRows] = useState<Leader[]>(team.leaders.length ? team.leaders : [{ label: '팀장', name: '', phone: '' }]);
  const set = (i: number, k: keyof Leader, v: string) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const add = () => setRows((rs) => [...rs, { label: '부팀장', name: '', phone: '' }]);
  const del = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2 rounded-md bg-gray-50 p-3">
      <div className="text-sm font-medium text-gray-700">팀장단 (매 학기 갱신 · 공지 자동 삽입)</div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[5rem_1fr_9rem_auto] items-center gap-2">
          <Input value={r.label} onChange={(e) => set(i, 'label', e.target.value)} placeholder="팀장" />
          <Input value={r.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder="이름" />
          <Input value={r.phone} onChange={(e) => set(i, 'phone', e.target.value)} placeholder="010-0000-0000" />
          <button className="text-xs text-red-600 underline" onClick={() => del(i)}>삭제</button>
        </div>
      ))}
      <div className="flex gap-2">
        <SecondaryButton onClick={add}>+ 추가</SecondaryButton>
        <Button onClick={() => onSave(rows)}>팀장단 저장</Button>
      </div>
    </div>
  );
}
