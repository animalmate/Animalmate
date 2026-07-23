'use client';
import { useEffect, useState } from 'react';
import { apiGet, errorMessage } from '@/lib/api';
import { Card, ErrorText, InfoText, RoleBadge, SecondaryButton, Select } from '@/components/ui';

interface Member {
  userId: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  teamCount: number;
}

const ROLE_LABEL: Record<string, string> = { member: '부원', staff: '운영진', board: '회장단', sysadmin: '시스템관리자' };
const ROLES = ['member', 'staff', 'board', 'sysadmin'];

export function MembersPanel({ isSysadmin, selfUserId }: { isSysadmin: boolean; selfUserId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const r = await apiGet<{ members: Member[] }>('/api/admin/members');
    setLoading(false);
    if (r.ok) setMembers(r.data.members ?? []);
    else setError(errorMessage(r.data.error));
  }
  useEffect(() => {
    void load();
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    setError('');
    const res = await fetch(`/api/admin/members/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(errorMessage(d.error));
      return;
    }
    void load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-ink-900">회원 관리</h1>
      <InfoText>가입한 회원의 역할을 지정하거나 접근을 비활성화해요. 회장단·시스템관리자만 들어올 수 있어요.</InfoText>
      <ErrorText>{error}</ErrorText>
      {loading ? (
        <InfoText>불러오는 중…</InfoText>
      ) : members.length === 0 ? (
        <Card>
          <InfoText>가입한 회원이 없습니다.</InfoText>
        </Card>
      ) : (
        <ul className="space-y-2">
          {members.map((m) => {
            const self = m.userId === selfUserId;
            return (
              <li key={m.userId}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-ink-900">
                      {m.name} {self ? <span className="text-xs text-ink-400">(나)</span> : null}
                    </div>
                    <div className="text-[13px] text-ink-500">
                      {m.email} · 팀 {m.teamCount}
                      {!m.active ? <span className="text-coral-600"> · 비활성</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <RoleBadge role={m.role} />
                    {self ? (
                      <span className="text-xs text-ink-400">본인은 변경 불가</span>
                    ) : (
                      <>
                        <div className="w-28">
                          <Select value={m.role} onChange={(e) => patch(m.userId, { role: e.target.value })}>
                            {ROLES.map((r) => (
                              <option key={r} value={r} disabled={r === 'sysadmin' && !isSysadmin}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <SecondaryButton onClick={() => patch(m.userId, { active: !m.active })}>
                          {m.active ? '비활성화' : '활성화'}
                        </SecondaryButton>
                      </>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
