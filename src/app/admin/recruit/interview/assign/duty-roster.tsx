'use client';
// 면접 당일 대기실 업무 배정표 — 명단 체크·대기실 안내·인솔을 누가 맡는지 시간대별로 정한다.
// 지난 기수는 이걸 별도 엑셀로 돌렸다(22.png). 면접 시간표와 **같은 시간축**을 쓴다.
import { useEffect, useState } from 'react';
import { Card, CardBlock, CardField, RowCard, Select, StatusMessage, TableCards } from '@/components/ui';
import { formatTimeRange } from '@/recruit/timetable';
import { DUTY_ALL, buildDutyRows, findDoubleBookedDuties, type DutyRow } from '@/recruit/duty-rules';
import { StepHeading } from './step-heading';

export interface DutyAssignmentRecord {
  startsAt: string;
  duty: string;
  userId: string | null;
  note: string | null;
  userName?: string | null;
}

export function DutyRoster({
  step,
  cohortId,
  startTimes,
  durationAt,
  staffMembers,
  canManage,
  onLoaded,
}: {
  /** 배정 화면의 몇 번째 단계인가. 카드 셋이 같은 머리글 모양을 쓰도록 번호만 받는다. */
  step: number;
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

  const save = async (
    startsAtMs: number,
    duty: string,
    userId: string | null,
    note: string | null,
    /** 계정이 없는 사람은 이름만 보낸다(0028) — 대기실 업무는 로그인할 일이 없다. */
    name: string | null = null
  ) => {
    // 화면을 먼저 바꾸고 저장한다 — 셀 하나 고를 때마다 전체를 다시 불러오면 느리다.
    setAssignments((prev) => {
      const iso = new Date(startsAtMs).toISOString();
      const rest = prev.filter((a) => !(new Date(a.startsAt).getTime() === startsAtMs && a.duty === duty));
      const isEmpty = duty === DUTY_ALL ? !note?.trim() : !userId && !name?.trim();
      if (isEmpty) return rest;
      return [
        ...rest,
        {
          startsAt: iso,
          duty,
          userId,
          note,
          userName: userId ? staffMembers.find((s) => s.id === userId)?.name ?? null : name?.trim() || null,
        },
      ];
    });

    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/recruit/duties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortId, startsAt: new Date(startsAtMs).toISOString(), duty, userId, name, note }),
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
        <StepHeading
          step={step}
          title="대기실 업무 배정"
          hint="면접 슬롯을 먼저 만들어 주세요. 대기실 표는 면접 시간표와 같은 시간축을 씁니다."
          state="todo"
        />
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <StepHeading
        step={step}
        title="대기실 업무 배정"
        hint="면접관 말고 명단 체크·대기실 안내·인솔을 맡는 사람들입니다 (업무 이름은 “0. 공고·마감 설정”에서)"
        state={rows.some((r) => Object.values(r.byDuty ?? {}).some((c) => c?.userId || c?.userName)) ? 'done' : 'current'}
        right={
          <>
            {doubled.length > 0 && (
              <span className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-700">
                같은 시간에 두 업무를 맡은 사람 {doubled.length}건
              </span>
            )}
          </>
        }
      />

      {/* 업무 수만큼 열이 늘어나는 행렬이라 좁은 화면에서 특히 빨리 넘친다.
          폰에서는 시간대 하나 = 카드 하나로 세운다(업무가 칸 제목 대신 항목 이름이 된다). */}
      <TableCards
        table={
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-cream-100">
              <tr>
                <th className="w-32 whitespace-nowrap border-b border-cream-200 p-2 font-bold text-ink-900">대기실</th>
                {roles.map((r) => (
                  <th key={r} className="border-b border-l border-cream-200 p-2 font-semibold text-ink-600">
                    {r}
                  </th>
                ))}
                <th className="w-44 border-b border-l border-cream-200 p-2 font-semibold text-ink-600">전원 공지</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.startsAtMs} className={doubled.some((d) => d.startsAtMs === row.startsAtMs) ? 'bg-amber-50/60' : ''}>
                  <td className="whitespace-nowrap border-b border-cream-100 p-2 font-mono text-[11px] font-semibold text-ink-700">
                    {formatTimeRange(row.startsAtMs, durationAt[row.startsAtMs] ?? 30)}
                  </td>
                  {roles.map((role) => (
                    <td key={role} className="border-b border-l border-cream-100 p-1.5">
                      {canManage ? (
                        <DutyCellPicker
                          cell={row.byDuty[role]}
                          staffMembers={staffMembers}
                          label={`${formatTimeRange(row.startsAtMs, durationAt[row.startsAtMs] ?? 30)} ${role}`}
                          onPickUser={(userId) => save(row.startsAtMs, role, userId, null)}
                          onPickName={(name) => save(row.startsAtMs, role, null, null, name)}
                        />
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
                        aria-label={`${formatTimeRange(row.startsAtMs, durationAt[row.startsAtMs] ?? 30)} 전원 공지`}
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
              ))}
            </tbody>
          </table>
        }
        cards={rows.map((row) => {
          const timeLabel = formatTimeRange(row.startsAtMs, durationAt[row.startsAtMs] ?? 30);
          const dupHere = doubled.some((d) => d.startsAtMs === row.startsAtMs);
          return (
            <RowCard
              key={row.startsAtMs}
              title={<span className="font-mono text-[14px]">{timeLabel}</span>}
              badge={
                dupHere ? (
                  <span className="shrink-0 whitespace-nowrap rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    업무 겹침
                  </span>
                ) : undefined
              }
            >
              {roles.map((role) =>
                canManage ? (
                  <CardBlock key={role} label={role}>
                    <Select
                      value={row.byDuty[role]?.userId ?? ''}
                      onChange={(e) => save(row.startsAtMs, role, e.target.value || null, null)}
                      aria-label={`${timeLabel} ${role}`}
                    >
                      <option value="">—</option>
                      {staffMembers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </CardBlock>
                ) : (
                  <CardField key={role} label={role}>
                    {row.byDuty[role]?.userName ?? '—'}
                  </CardField>
                )
              )}
              {canManage ? (
                <CardBlock label="전원 공지">
                  <input
                    type="text"
                    defaultValue={row.allNote ?? ''}
                    placeholder="예: 전원 면접실 정비"
                    aria-label={`${timeLabel} 전원 공지`}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if ((row.allNote ?? '') !== v) save(row.startsAtMs, DUTY_ALL, null, v);
                    }}
                    className="min-h-tap w-full rounded-xl border-[1.5px] border-ink-200 px-3.5 text-[13px] outline-none focus:border-blue-500"
                  />
                </CardBlock>
              ) : (
                <CardField label="전원 공지">{row.allNote ?? '—'}</CardField>
              )}
            </RowCard>
          );
        })}
      />

      <div className="flex items-center justify-between">
        <StatusMessage text={message} />
        {saving && <span className="text-xs text-ink-400">저장 중…</span>}
      </div>
    </Card>
  );
}

/**
 * 대기실 한 칸 — 운영진 계정에서 고르거나, 계정이 없는 사람은 이름을 직접 친다(0028).
 *
 * 계정을 강제하지 않는 이유: 대기실 업무(명단 체크·인솔)를 맡는 사람은 홈페이지에 로그인할
 * 일이 전혀 없다. 그런데 계정이 있어야만 넣을 수 있으면 그 사람이 표에서 빠지고, 면접 당일
 * 그 시간대 안내가 비어 버린다(33기에 실제로 그런 사람이 있었다).
 */
function DutyCellPicker({
  cell,
  staffMembers,
  label,
  onPickUser,
  onPickName,
}: {
  cell?: { userId: string | null; userName: string | null };
  staffMembers: { id: string; name: string }[];
  label: string;
  onPickUser: (userId: string | null) => void;
  onPickName: (name: string) => void;
}) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');

  if (typing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setTyping(false);
          if (draft.trim()) onPickName(draft.trim());
          setDraft('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft('');
            setTyping(false);
          }
        }}
        maxLength={40}
        placeholder="이름"
        aria-label={`${label} 이름 직접 입력`}
        className="w-full rounded-md border border-coral-400 px-1 py-0.5 text-[11px] outline-none"
      />
    );
  }

  // 계정 없이 이름만 들어간 칸은 셀렉트의 어느 항목과도 맞지 않는다 — 그대로 보여 주고 누르면 고친다.
  if (!cell?.userId && cell?.userName) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(cell.userName ?? '');
          setTyping(true);
        }}
        title="계정 없이 이름만 — 누르면 고칩니다"
        className="w-full rounded-md bg-cream-100 px-1 py-0.5 text-left text-[11px] font-semibold text-ink-700 hover:bg-cream-200"
      >
        {cell.userName}
      </button>
    );
  }

  return (
    <Select
      uiSize="sm"
      value={cell?.userId ?? ''}
      onChange={(e) => {
        if (e.target.value === '__NAME__') setTyping(true);
        else onPickUser(e.target.value || null);
      }}
      aria-label={label}
      className="w-full"
    >
      <option value="">—</option>
      {staffMembers.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      <option value="__NAME__">이름 직접 입력…</option>
    </Select>
  );
}
