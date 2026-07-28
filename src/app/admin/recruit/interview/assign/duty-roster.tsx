'use client';
// 면접 당일 대기실 업무 배정표 — 명단 체크·대기실 안내·인솔을 누가 맡는지 시간대별로 정한다.
// 지난 기수는 이걸 별도 엑셀로 돌렸다(22.png). 면접 시간표와 **같은 시간축**을 쓴다.
import { useEffect, useState } from 'react';
import { Card, Select, StatusMessage } from '@/components/ui';
import { formatTimeRange } from '@/recruit/timetable';
import { DUTY_ALL, buildDutyRows, findDoubleBookedDuties, type DutyRow } from '@/recruit/duty-rules';

export interface DutyAssignmentRecord {
  startsAt: string;
  duty: string;
  userId: string | null;
  note: string | null;
  userName?: string | null;
}

export function DutyRoster({
  cohortId,
  startTimes,
  durationAt,
  staffMembers,
  canManage,
  onLoaded,
}: {
  cohortId: string;
  startTimes: number[];
  durationAt: Record<number, number>;
  staffMembers: { id: string; name: string }[];
  canManage: boolean;
  /** 시간표 팝업이 같은 데이터를 쓰도록 위로 올려 준다. */
  onLoaded?: (roles: string[], rows: DutyRow[]) => void;
}) {
  const [roles, setRoles] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<DutyAssignmentRecord[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!cohortId) return;
    let alive = true;
    fetch(`/api/recruit/duties?cohortId=${cohortId}`)
      .then((r) => (r.ok ? r.json() : { roles: [], assignments: [] }))
      .then((d) => {
        if (!alive) return;
        setRoles(d.roles ?? []);
        setAssignments(d.assignments ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cohortId]);

  const rows = buildDutyRows({ startTimes, assignments });
  const doubled = findDoubleBookedDuties(rows);

  useEffect(() => {
    onLoaded?.(roles, rows);
    // rows 는 매 렌더 새 배열이라 의존성에 넣으면 무한 루프가 된다. 원천만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles, assignments, startTimes]);

  const save = async (startsAtMs: number, duty: string, userId: string | null, note: string | null) => {
    // 화면을 먼저 바꾸고 저장한다 — 셀 하나 고를 때마다 전체를 다시 불러오면 느리다.
    setAssignments((prev) => {
      const iso = new Date(startsAtMs).toISOString();
      const rest = prev.filter((a) => !(new Date(a.startsAt).getTime() === startsAtMs && a.duty === duty));
      const isEmpty = duty === DUTY_ALL ? !note?.trim() : !userId;
      if (isEmpty) return rest;
      return [
        ...rest,
        { startsAt: iso, duty, userId, note, userName: staffMembers.find((s) => s.id === userId)?.name ?? null },
      ];
    });

    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/recruit/duties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortId, startsAt: new Date(startsAtMs).toISOString(), duty, userId, note }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setMessage(`❌ 저장 실패: ${d.message || d.error || res.status}`);
        // 실패하면 서버 값으로 되돌린다(낙관적 갱신이 사실과 어긋난 채 남지 않게).
        const fresh = await fetch(`/api/recruit/duties?cohortId=${cohortId}`).then((r) => r.json());
        setAssignments(fresh.assignments ?? []);
      }
    } catch {
      setMessage('❌ 저장하지 못했습니다. 연결을 확인해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  if (startTimes.length === 0) {
    return (
      <Card className="space-y-2">
        <h2 className="text-base font-bold text-ink-900">대기실 업무 배정</h2>
        <p className="text-xs text-ink-500">
          면접 슬롯을 먼저 만들어 주세요. 대기실 표는 면접 시간표와 같은 시간축을 씁니다.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-200 pb-3">
        <div>
          <h2 className="text-base font-bold text-ink-900">대기실 업무 배정</h2>
          <p className="mt-1 text-xs text-ink-500">
            면접관 말고 <strong>명단 체크·대기실 안내·인솔</strong>을 맡는 사람들입니다. 업무 이름은
            “0. 공고·마감 설정”에서 바꿉니다.
          </p>
        </div>
        {doubled.length > 0 && (
          <span className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-700">
            같은 시간에 두 업무를 맡은 사람 {doubled.length}건
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-cream-200">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-cream-100">
            <tr>
              <th className="w-32 whitespace-nowrap border-b border-cream-200 p-2 font-bold text-ink-900">대기실</th>
              {roles.map((r) => (
                <th key={r} className="border-b border-l border-cream-200 p-2 font-semibold text-ink-600">
                  {r}
                </th>
              ))}
              <th className="w-44 border-b border-l border-cream-200 p-2 font-semibold text-ink-600">
                전원 공지
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const dupHere = doubled.some((d) => d.startsAtMs === row.startsAtMs);
              return (
                <tr key={row.startsAtMs} className={dupHere ? 'bg-amber-50/60' : ''}>
                  <td className="whitespace-nowrap border-b border-cream-100 p-2 font-mono text-[11px] font-semibold text-ink-700">
                    {formatTimeRange(row.startsAtMs, durationAt[row.startsAtMs] ?? 30)}
                  </td>
                  {roles.map((role) => (
                    <td key={role} className="border-b border-l border-cream-100 p-1.5">
                      {canManage ? (
                        <Select
                          uiSize="sm"
                          value={row.byDuty[role]?.userId ?? ''}
                          onChange={(e) => save(row.startsAtMs, role, e.target.value || null, null)}
                          className="w-full text-xs"
                        >
                          <option value="">—</option>
                          {staffMembers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-ink-700">{row.byDuty[role]?.userName ?? '—'}</span>
                      )}
                    </td>
                  ))}
                  <td className="border-b border-l border-cream-100 p-1.5">
                    {canManage ? (
                      <input
                        type="text"
                        defaultValue={row.allNote ?? ''}
                        placeholder="예: 전원 면접실 정비"
                        // 글자마다 저장하면 요청이 폭주한다 — 칸을 벗어날 때 한 번만 보낸다.
                        onBlur={(e) => {
                          const v = e.target.value;
                          if ((row.allNote ?? '') !== v) save(row.startsAtMs, DUTY_ALL, null, v);
                        }}
                        className="h-8 w-full rounded-lg border border-ink-200 px-2 text-xs"
                      />
                    ) : (
                      <span className="text-ink-700">{row.allNote ?? ''}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <StatusMessage text={message} />
        {saving && <span className="text-xs text-ink-400">저장 중…</span>}
      </div>
    </Card>
  );
}
