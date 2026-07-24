'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input, RoleBadge, SecondaryButton, Select } from '@/components/ui';

interface UserTeam { teamId: string; teamName: string; position: 'leader' | 'member'; label: string }
interface Member {
  userId: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  active: boolean;
  teams: UserTeam[];
}
interface ManualLeader { label: string; name: string; phone: string }
interface Team { id: string; name: string; kind: string; isActive: boolean; leaders: ManualLeader[] }

const ROLE_LABEL: Record<string, string> = { member: '부원', staff: '운영진', board: '회장단', sysadmin: '시스템관리자' };
const ROLES = ['member', 'staff', 'board', 'sysadmin'];
const KIND_LABEL: Record<string, string> = { activity: '활동팀', functional: '기능팀' };

export function MembersPanel({ isSysadmin, selfUserId }: { isSysadmin: boolean; selfUserId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const [m, t] = await Promise.all([
      apiGet<{ members: Member[] }>('/api/admin/members'),
      apiGet<{ teams: Team[] }>('/api/admin/teams'),
    ]);
    setLoading(false);
    if (m.ok) setMembers(m.data.members ?? []);
    else setError(errorMessage(m.data.error));
    if (t.ok) setTeams(t.data.teams ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  async function patchMember(id: string, body: Record<string, unknown>) {
    setError('');
    const r = await apiPost(`/api/admin/members/${id}`, body, 'PATCH');
    if (!r.ok) return setError(errorMessage(r.data.error));
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink-900">회원·팀 관리</h1>
        <InfoText>가입 회원의 역할·소속 팀·직함을 지정하고, 팀을 만들거나 없앨 수 있어요. 회장단·시스템관리자만 들어올 수 있어요.</InfoText>
      </div>
      <ErrorText>{error}</ErrorText>

      <TeamsSection teams={teams} onChange={load} onError={setError} />

      <div className="space-y-2">
        <h2 className="text-base font-semibold text-ink-900">회원</h2>
        {loading ? (
          <InfoText>불러오는 중…</InfoText>
        ) : members.length === 0 ? (
          <Card>
            <InfoText>가입한 회원이 없습니다.</InfoText>
          </Card>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.userId}>
                <MemberCard
                  m={m}
                  teams={teams}
                  isSelf={m.userId === selfUserId}
                  isSysadmin={isSysadmin}
                  onPatch={(body) => patchMember(m.userId, body)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── 회원 한 명 ──────────────────────────────────────────────────────────
function MemberCard({
  m,
  teams,
  isSelf,
  isSysadmin,
  onPatch,
}: {
  m: Member;
  teams: Team[];
  isSelf: boolean;
  isSysadmin: boolean;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  // 현재 배정을 서버가 이해하는 형태로.
  const assignments = m.teams.map((t) => ({ teamId: t.teamId, position: t.position, label: t.label }));
  const saveTeams = (next: { teamId: string; position: string; label: string }[]) => onPatch({ teams: next });

  const addable = teams.filter((t) => t.isActive && !m.teams.some((mt) => mt.teamId === t.id));

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-ink-900">
            {m.name} {isSelf ? <span className="text-xs text-ink-400">(나)</span> : null}
          </div>
          <div className="text-[13px] text-ink-500">
            {m.email}
            {m.phone ? ` · ${m.phone}` : ' · 전화 미입력'}
            {!m.active ? <span className="text-coral-600"> · 비활성</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RoleBadge role={m.role} />
          {isSelf ? (
            <span className="text-xs text-ink-400">본인은 변경 불가</span>
          ) : (
            <>
              <div className="w-28">
                <Select value={m.role} onChange={(e) => onPatch({ role: e.target.value })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r} disabled={r === 'sysadmin' && !isSysadmin}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </div>
              <SecondaryButton onClick={() => onPatch({ active: !m.active })}>{m.active ? '비활성화' : '활성화'}</SecondaryButton>
              <SecondaryButton
                title="이 회원이 로그인한 모든 기기의 세션을 즉시 끊습니다. 다시 로그인해야 합니다."
                onClick={() => {
                  if (!confirmRevoke) return setConfirmRevoke(true);
                  setConfirmRevoke(false);
                  onPatch({ revokeSessions: true });
                }}
              >
                {confirmRevoke ? '한 번 더 누르면 실행' : '모든 기기에서 로그아웃'}
              </SecondaryButton>
            </>
          )}
        </div>
      </div>

      {/* 팀 배정 */}
      <div className="rounded-xl bg-cream-100 p-3">
        <div className="text-sm font-semibold text-ink-700">소속 팀 · 직함</div>
        {m.teams.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-500">소속 팀 없음</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {m.teams.map((t) => (
              <li key={t.teamId} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-medium text-ink-900">{t.teamName}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[12px] text-ink-600">
                  {t.position === 'leader' ? `팀장단${t.label ? ` · ${t.label}` : ''}` : '팀원'}
                </span>
                <button
                  className="text-xs text-coral-600 underline"
                  onClick={() => saveTeams(assignments.filter((a) => a.teamId !== t.teamId))}
                >
                  빼기
                </button>
              </li>
            ))}
          </ul>
        )}
        {addable.length > 0 ? (
          <AddTeamRow teams={addable} onAdd={(a) => saveTeams([...assignments, a])} />
        ) : (
          <p className="mt-2 text-[12px] text-ink-400">배정할 수 있는 활성 팀이 더 없어요.</p>
        )}
      </div>
    </Card>
  );
}

// 팀 배정 추가 한 줄(팀 + 팀장단/팀원 + 직함).
function AddTeamRow({ teams, onAdd }: { teams: Team[]; onAdd: (a: { teamId: string; position: string; label: string }) => void }) {
  const [teamId, setTeamId] = useState('');
  const [position, setPosition] = useState('leader');
  const [label, setLabel] = useState('팀장');
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <div className="min-w-[8rem] flex-1">
        <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">팀 선택</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-28">
        <Select value={position} onChange={(e) => setPosition(e.target.value)}>
          <option value="leader">팀장단</option>
          <option value="member">팀원</option>
        </Select>
      </div>
      {position === 'leader' ? (
        <div className="w-24">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="직함" />
        </div>
      ) : null}
      <SecondaryButton
        disabled={!teamId}
        onClick={() => {
          if (!teamId) return;
          onAdd({ teamId, position, label: position === 'leader' ? label.trim() : '' });
          setTeamId('');
          setPosition('leader');
          setLabel('팀장');
        }}
      >
        추가
      </SecondaryButton>
    </div>
  );
}

// ── 팀 섹션(생성·활성/삭제·미가입자 팀장단) ─────────────────────────────
function TeamsSection({ teams, onChange, onError }: { teams: Team[]; onChange: () => void; onError: (s: string) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('activity');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function create() {
    onError('');
    setBusy(true);
    const r = await apiPost('/api/admin/teams', { name: name.trim(), kind });
    setBusy(false);
    if (!r.ok) return onError(errorMessage(r.data.error, r.data.message));
    setName('');
    onChange();
  }
  async function patchTeam(id: string, body: unknown) {
    onError('');
    const res = await fetch(`/api/admin/teams/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      onError(errorMessage(d.error, d.message));
      return;
    }
    onChange();
  }
  async function removeTeam(t: Team) {
    onError('');
    const res = await fetch(`/api/admin/teams/${t.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.error === 'team_in_use') {
        onError(`삭제 불가: 이 팀에 회차 ${d.counts?.events ?? 0} · 예약 ${d.counts?.reservations ?? 0}건이 있어요. 대신 "비활성화"하세요.`);
        return;
      }
      onError(errorMessage(d.error, d.message));
      return;
    }
    onChange();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink-900">팀 ({teams.length})</h2>
        <SecondaryButton onClick={() => setOpen((v) => !v)}>{open ? '접기' : '팀 관리 열기'}</SecondaryButton>
      </div>
      {open ? (
        <div className="space-y-3">
          <Card className="space-y-3">
            <div className="text-sm font-semibold text-ink-900">팀 추가</div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[10rem] flex-1">
                <Field label="팀 이름">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="1팀 / 홍보팀 ..." />
                </Field>
              </div>
              <div className="w-40">
                <Field label="종류">
                  <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                    <option value="activity">활동팀(봉사)</option>
                    <option value="functional">기능팀</option>
                  </Select>
                </Field>
              </div>
              <Button disabled={busy || !name} onClick={create}>
                {busy ? '추가 중…' : '추가'}
              </Button>
            </div>
          </Card>

          {teams.map((t) => (
            <Card key={t.id} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink-900">
                  {t.name} <span className="text-xs text-ink-500">({KIND_LABEL[t.kind] ?? t.kind})</span>
                  {!t.isActive ? <span className="ml-1 text-xs text-ink-400">· 비활성</span> : null}
                </span>
                <span className="flex gap-2">
                  <SecondaryButton onClick={() => patchTeam(t.id, { isActive: !t.isActive })}>{t.isActive ? '비활성화' : '활성화'}</SecondaryButton>
                  <SecondaryButton onClick={() => removeTeam(t)}>삭제</SecondaryButton>
                </span>
              </div>
              {t.kind === 'activity' ? <ManualLeadersEditor team={t} onSave={(leaders) => patchTeam(t.id, { leaders })} /> : null}
            </Card>
          ))}
          <InfoText>
            팀장단 이름·전화는 회원 각자의 정보에서 자동으로 들어가요. 아래 "미가입자 팀장단"은 앱에 가입하지 않은 사람만 공지에 덧붙일 때 써요.
          </InfoText>
        </div>
      ) : null}
    </div>
  );
}

// 앱 미가입자 팀장단(공지 표시용, 이름·전화만). 가입자는 회원 배정으로 자동 반영되므로 여기 넣지 않는다.
function ManualLeadersEditor({ team, onSave }: { team: Team; onSave: (leaders: ManualLeader[]) => void }) {
  const [rows, setRows] = useState<ManualLeader[]>(team.leaders ?? []);
  const set = (i: number, k: keyof ManualLeader, v: string) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const add = () => setRows((rs) => [...rs, { label: '부팀장', name: '', phone: '' }]);
  const del = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2 rounded-xl bg-cream-100 p-3">
      <div className="text-sm font-semibold text-ink-700">미가입자 팀장단 (선택)</div>
      <InfoText>앱에 가입하지 않은 사람만 여기 넣어요. 같은 전화번호가 가입 팀장단에 있으면 공지에서 자동으로 하나만 나와요.</InfoText>
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <div className="w-20 shrink-0">
            <Input value={r.label} onChange={(e) => set(i, 'label', e.target.value)} placeholder="직함" />
          </div>
          <div className="min-w-[7rem] flex-1">
            <Input value={r.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder="이름" />
          </div>
          <div className="w-40">
            <Input value={r.phone} onChange={(e) => set(i, 'phone', e.target.value)} placeholder="010-0000-0000" />
          </div>
          <button className="shrink-0 text-xs text-coral-600 underline" onClick={() => del(i)}>
            삭제
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <SecondaryButton onClick={add}>+ 추가</SecondaryButton>
        <Button onClick={() => onSave(rows)}>저장</Button>
      </div>
    </div>
  );
}
