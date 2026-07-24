'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input, SecondaryButton, Select } from '@/components/ui';

interface Leader { label: string; name: string; phone: string; email?: string }
interface Team {
  id: string;
  name: string;
  kind: string;
  isActive: boolean;
  leaders: Leader[];
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
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.error === 'user_not_found' && d.email) { setError(`${d.email} 은 가입 완료된 회원이 아니에요. 먼저 가입해야 팀장단으로 지정할 수 있어요.`); return; }
      setError(errorMessage(d.error, d.message));
      return;
    }
    void load();
  }

  async function remove(t: Team) {
    setError('');
    const res = await fetch(`/api/admin/teams/${t.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.error === 'team_in_use') {
        setError(`삭제 불가: 이 팀에 회차 ${d.counts?.events ?? 0} · 예약 ${d.counts?.reservations ?? 0}건이 있습니다. 대신 "비활성화"하세요.`);
        return;
      }
      setError(errorMessage(d.error, d.message));
      return;
    }
    void load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-ink-900">팀</h1>
      <Card className="space-y-3">
        <div className="text-base font-semibold text-ink-900">팀 추가</div>
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
            <span className="font-semibold text-ink-900">
              {t.name} <span className="text-xs text-ink-500">({KIND_LABEL[t.kind] ?? t.kind})</span>
              {!t.isActive ? <span className="ml-1 text-xs text-ink-400">· 비활성</span> : null}
            </span>
            <span className="flex gap-2">
              <SecondaryButton onClick={() => patch(t.id, { isActive: !t.isActive })}>{t.isActive ? '비활성화' : '활성화'}</SecondaryButton>
              <SecondaryButton onClick={() => remove(t)}>삭제</SecondaryButton>
            </span>
          </div>
          <LeadersEditor team={t} onSave={(leaders) => patch(t.id, { leaders })} />
        </Card>
      ))}
      <InfoText>회차·예약이 있는 팀은 삭제 대신 비활성화됩니다(기록 보존). 팀장단 명단은 공지 {'{{팀장단}}'}에 자동 삽입됩니다.</InfoText>
    </div>
  );
}

function LeadersEditor({ team, onSave }: { team: Team; onSave: (leaders: Leader[]) => void }) {
  const [rows, setRows] = useState<Leader[]>(team.leaders.length ? team.leaders : [{ label: '팀장', name: '', phone: '', email: '' }]);
  const set = (i: number, k: keyof Leader, v: string) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const add = () => setRows((rs) => [...rs, { label: '부팀장', name: '', phone: '', email: '' }]);
  const del = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3 rounded-xl bg-cream-100 p-3">
      <div className="text-sm font-semibold text-ink-700">팀장단 (팀장·부팀장)</div>
      <InfoText>
        이메일을 넣으면 그 계정이 이 팀의 예약·템플릿을 관리할 수 있어요(가입 완료된 회원만). 이름·전화는 공지 {'{{팀장단}}'}에 표시됩니다.
      </InfoText>
      {rows.map((r, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-ink-200 bg-white p-2.5">
          <div className="flex items-center gap-2">
            <div className="w-20 shrink-0">
              <Input value={r.label} onChange={(e) => set(i, 'label', e.target.value)} placeholder="팀장" />
            </div>
            <div className="flex-1">
              <Input value={r.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder="이름" />
            </div>
            <button className="shrink-0 text-xs text-coral-600 underline" onClick={() => del(i)}>삭제</button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input type="email" value={r.email ?? ''} onChange={(e) => set(i, 'email', e.target.value)} placeholder="이메일(관리 권한)" autoComplete="off" />
            <Input value={r.phone} onChange={(e) => set(i, 'phone', e.target.value)} placeholder="010-0000-0000" />
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <SecondaryButton onClick={add}>+ 추가</SecondaryButton>
        <Button onClick={() => onSave(rows)}>팀장단 저장</Button>
      </div>
    </div>
  );
}
