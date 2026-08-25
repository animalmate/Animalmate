'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, DangerButton, ErrorText, Field, InfoText, Input, RoleBadge, SecondaryButton, Select } from '@/components/ui';
import { Modal } from '@/components/modal';

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
interface Team { id: string; name: string; kind: string; isActive: boolean; canEditNotice: boolean; leaders: ManualLeader[] }

const ROLE_LABEL: Record<string, string> = { member: '부원', staff: '운영진', board: '회장단', sysadmin: '시스템관리자' };
const ROLES = ['member', 'staff', 'board', 'sysadmin'];
const KIND_LABEL: Record<string, string> = { activity: '활동팀', functional: '기능팀' };
const byName = (a: Member, b: Member) => a.name.localeCompare(b.name, 'ko');

export function MembersPanel({ isSysadmin, selfUserId }: { isSysadmin: boolean; selfUserId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [withdrawTarget, setWithdrawTarget] = useState<Member | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

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

  /**
   * 강제 탈퇴 — 비활성화와 달리 되돌릴 수 없고 개인정보가 실제로 지워진다.
   * 그래서 확인 한 번이 아니라 **이름을 정확히 다시 입력**하게 한다(서버도 같은 값을 요구).
   */
  async function confirmWithdraw() {
    const m = withdrawTarget;
    if (!m) return;
    setWithdrawError('');
    setWithdrawing(true);
    const res = await fetch(`/api/admin/members/${m.userId}?confirmName=${encodeURIComponent(confirmName.trim())}`, {
      method: 'DELETE',
    });
    setWithdrawing(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setWithdrawError(d.message || errorMessage(d.error));
      return;
    }
    setWithdrawTarget(null);
    setConfirmName('');
    await load();
  }

  // 이름·이메일·전화로 검색. 가나다 순 정렬 후 역할별로 나눈다.
  const buckets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (m: Member) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.phone ?? '').includes(q);
    const filtered = members.filter(match).sort(byName);
    return {
      member: filtered.filter((m) => m.role === 'member'),
      staff: filtered.filter((m) => m.role === 'staff'),
      board: filtered.filter((m) => m.role === 'board' || m.role === 'sysadmin'),
    };
  }, [members, query]);

  const searching = query.trim() !== '';

  const section = (title: string, list: Member[]) => (
    <RoleSection key={title} title={title} count={list.length} forceOpen={searching}>
      {list.length === 0 ? (
        <p className="px-1 py-2 text-[13px] text-ink-500">{searching ? '검색 결과 없음' : '없음'}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => (
            <li key={m.userId}>
              <MemberCard
                m={m}
                teams={teams}
                isSelf={m.userId === selfUserId}
                isSysadmin={isSysadmin}
                onPatch={(b) => patchMember(m.userId, b)}
                onWithdraw={() => {
                  setWithdrawTarget(m);
                  setConfirmName('');
                  setWithdrawError('');
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </RoleSection>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink-900">회원·팀 관리</h1>
        <InfoText>역할·소속 팀·직함을 지정하고 팀을 관리해요. 회장단·시스템관리자만 들어올 수 있어요.</InfoText>
      </div>
      <ErrorText>{error}</ErrorText>

      <TeamsSection teams={teams} onChange={load} onError={setError} />

      <Field label="회원 검색">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름·이메일·전화로 검색" />
      </Field>

      {loading ? (
        <InfoText>불러오는 중…</InfoText>
      ) : (
        <div className="space-y-2">
          {section('부원', buckets.member)}
          {section('운영진', buckets.staff)}
          {section('회장단', buckets.board)}
        </div>
      )}

      {withdrawTarget ? (
        <Modal title={`${withdrawTarget.name} 님을 탈퇴 처리할까요?`} onClose={() => setWithdrawTarget(null)}>
          <div className="space-y-4">
            <ul className="space-y-1.5 text-[13px] leading-relaxed text-ink-700">
              <li>· 이름·이메일·전화번호가 지워지고 계정이 영구 잠깁니다. <strong>되돌릴 수 없습니다.</strong></li>
              <li>· 작성했던 예약·양식·문서는 남고, 작성자만 &lsquo;탈퇴한 회원&rsquo;으로 바뀝니다.</li>
              <li>· 잠시 활동을 쉬는 경우라면 탈퇴 대신 <strong>비활성화</strong>를 쓰세요(되돌릴 수 있어요).</li>
            </ul>
            <Field label={`계속하려면 회원 이름 "${withdrawTarget.name}"을(를) 그대로 입력해 주세요`}>
              <Input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={withdrawTarget.name}
                autoComplete="off"
              />
            </Field>
            <ErrorText>{withdrawError}</ErrorText>
            <div className="flex justify-end gap-2">
              <SecondaryButton onClick={() => setWithdrawTarget(null)}>돌아가기</SecondaryButton>
              <DangerButton
                disabled={withdrawing || confirmName.trim() !== withdrawTarget.name.trim()}
                onClick={confirmWithdraw}
              >
                {withdrawing ? '처리 중…' : '탈퇴 처리'}
              </DangerButton>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

// ── 접이식 명단 섹션 ────────────────────────────────────────────────────
function RoleSection({ title, count, forceOpen, children }: { title: string; count: number; forceOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink-900">
          {title} 명단 <span className="text-ink-400">({count})</span>
        </h2>
        {!forceOpen ? <SecondaryButton onClick={() => setOpen((v) => !v)}>{open ? '접기' : '열기'}</SecondaryButton> : null}
      </div>
      {isOpen ? children : null}
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
  onWithdraw,
}: {
  m: Member;
  teams: Team[];
  isSelf: boolean;
  isSysadmin: boolean;
  onPatch: (body: Record<string, unknown>) => void;
  onWithdraw: () => void;
}) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);

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
              {/* 탈퇴는 비활성화 옆에 두되 위험 색으로 구분한다 — 되돌릴 수 있는 조치와 없는 조치. */}
              <DangerButton title="개인정보를 지우고 계정을 영구 잠급니다. 되돌릴 수 없습니다." onClick={onWithdraw}>
                탈퇴 처리
              </DangerButton>
            </>
          )}
        </div>
      </div>

      {/* 소속 팀 · 직함 — 회원당 하나. */}
      <TeamAssign
        key={`${m.userId}:${m.teams[0]?.teamId ?? ''}:${m.teams[0]?.position ?? ''}:${m.teams[0]?.label ?? ''}`}
        current={m.teams[0]}
        teams={teams}
        onSave={(a) => onPatch({ teams: a })}
      />
    </Card>
  );
}

// 소속 팀 + 직위/직함(하나). 팀을 고르면 바로 저장, 직함은 입력 후 포커스가 떠날 때 저장.
function TeamAssign({
  current,
  teams,
  onSave,
}: {
  current: UserTeam | undefined;
  teams: Team[];
  onSave: (assignments: { teamId: string; position: string; label: string }[]) => void;
}) {
  const [teamId, setTeamId] = useState(current?.teamId ?? '');
  const [position, setPosition] = useState(current?.position ?? 'leader');
  const [label, setLabel] = useState(current?.label ?? '');
  const active = teams.filter((t) => t.isActive || t.id === teamId);

  const commit = (t: string, p: string, l: string) => onSave(t ? [{ teamId: t, position: p, label: p === 'leader' ? l.trim() : '' }] : []);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl bg-cream-100 p-3">
      <div className="min-w-[8rem] flex-1">
        <Field label="소속 팀">
          <Select
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              commit(e.target.value, position, label);
            }}
          >
            <option value="">소속 없음</option>
            {active.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {teamId ? (
        <div className="w-28">
          <Field label="직위">
            <Select
              value={position}
              onChange={(e) => {
                const p = e.target.value as 'leader' | 'member';
                setPosition(p);
                commit(teamId, p, label);
              }}
            >
              <option value="leader">팀장단</option>
              <option value="member">팀원</option>
            </Select>
          </Field>
        </div>
      ) : null}
      {teamId && position === 'leader' ? (
        <div className="w-24">
          <Field label="직함">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => commit(teamId, position, label)}
              placeholder="팀장"
            />
          </Field>
        </div>
      ) : null}
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
    // 회차·예약이 걸린 팀은 서버가 막아 주지만, 아직 안 쓴 팀은 클릭 한 번에 사라진다.
    if (typeof window !== 'undefined' && !window.confirm(`"${t.name}" 팀을 삭제할까요? 되돌릴 수 없습니다.`)) return;
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
        <h2 className="text-base font-semibold text-ink-900">
          팀 <span className="text-ink-400">({teams.length})</span>
        </h2>
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
                  {t.canEditNotice ? (
                    <span className="ml-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-blue-700">공고 편집</span>
                  ) : null}
                </span>
                <span className="flex flex-wrap gap-2">
                  {/* 공고 편집 권한 = 신입 모집 0번 화면(공고 글·포스터·지원서 문항·기수)을 이 팀에 연다.
                      팀 이름으로 홍보팀을 알아내지 않고 여기서 손으로 켠다(07-DECISIONS 140). */}
                  <SecondaryButton onClick={() => patchTeam(t.id, { canEditNotice: !t.canEditNotice })}>
                    {t.canEditNotice ? '공고 편집 권한 끄기' : '공고 편집 권한 주기'}
                  </SecondaryButton>
                  <SecondaryButton onClick={() => patchTeam(t.id, { isActive: !t.isActive })}>{t.isActive ? '비활성화' : '활성화'}</SecondaryButton>
                  <SecondaryButton onClick={() => removeTeam(t)}>삭제</SecondaryButton>
                </span>
              </div>
              {t.kind === 'activity' ? <ManualLeadersEditor team={t} onSave={(leaders) => patchTeam(t.id, { leaders })} /> : null}
            </Card>
          ))}
          <InfoText>
            팀장단 이름·전화는 회원 각자의 정보에서 자동으로 들어가요. 아래 "미가입자 팀장단"은 앱에 가입하지 않은 사람만 공지에 덧붙일 때 써요.
            <br />
            "공고 편집 권한"을 켜면 그 팀 소속 운영진이 신입 모집 0번 화면을 전부 쓸 수 있어요(홍보팀용) — 공고 글·포스터·지원서 문항,
            기수 생성, 모집 마감 스위치, 합격자 안내문, 지원자 공개 스위치까지요.
            합격을 <strong>정하는 일</strong>(서류·최종 확정, 면접 배정, 지원자 팀 변경, 자료 폐기)과 기수 삭제는 켜도 회장단만 합니다.
            팀을 비활성화하면 이 권한도 함께 멈춰요.
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
