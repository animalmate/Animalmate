'use client';
// 면접 배정 보드 — 지난 기수가 엑셀로 하던 일을 그대로, 다만 명단과 이어진 채로 한다.
//
// 왜 이 모양인가: 예전 화면은 **지원자 한 줄에 슬롯 드롭다운 하나**였다. 축이 뒤집혀 있어서
// 200명이면 드롭다운을 200번 열고 슬롯 40개 중에서 찾아야 했다. 운영진이 실제로 쓰는 표는
// 행=시간, 열=면접자다(지난 기수 엑셀이 전부 이 모양이다).
//
// 엑셀을 대체하려면 엑셀만큼 빨라야 한다. 그래서 엑셀이 빠른 이유 두 가지를 그대로 옮겼다:
//   1) **타이핑** — 칸에 이름을 치고 Enter. 다만 후보가 실제 지원자 명단이라 오타가 불가능하고,
//      이미 앉은 사람은 옮기기로 잡히므로 중복 배정도 불가능하다(엑셀은 둘 다 막지 못한다).
//   2) **채우기 핸들** — 면접관 3명이 연속 여러 칸을 맡는 패턴을 드래그 한 번으로 끝낸다.
//      이게 없으면 칸마다 드롭다운 3번씩, 조 하나에 120번이다.
// 여기에 엑셀에 있고 화면에 없던 Ctrl+Z 를 더한다(되돌리기는 부모가 들고 있다).
//
// 끌어놓기로 사람을 옮기지 않는 이유: 명단이 200줄이라 놓을 자리가 대개 화면 밖이고,
// 태블릿에서는 아예 안 된다. 타이핑과 고르기-누르기가 더 빠르고 덜 틀린다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icon';
import { Input, SecondaryButton, Select } from '@/components/ui';
import { slotPlaceLabel } from '@/recruit/display';
import { formatTimeRange } from '@/recruit/timetable';
import { matchesTeamFilter } from '@/recruit/team-filter';
import { rankCandidates, type Candidate } from '@/recruit/seat-search';
import type { InterviewerRef } from '@/recruit/slot-interviewers';

export interface BoardApplicant {
  id: string;
  name: string;
  slotId?: string | null;
  assignedTeam?: string | null;
  wishTeam1?: string | null;
  remoteInterviewWish?: string | null;
}

export interface BoardSlot {
  id: string;
  startsAt: string | Date;
  durationMin?: number | null;
  panel?: string | null;
  venue?: string | null;
  isRemote?: boolean | null;
  note?: string | null;
}

/** 화면이 들고 있는 배정 상태를 서버가 받는 모양으로. 계정이 있으면 id, 없으면 이름. */
const refsOf = (list: { userId: string | null; name: string }[]): InterviewerRef[] =>
  list.map((i) => (i.userId ? { userId: i.userId } : { name: i.name }));

export interface BoardStaff {
  id: string;
  name: string;
  role?: string;
}

export function AssignBoard({
  applicants,
  slots,
  interviewersBySlot,
  staffMembers,
  teamFilter,
  canManage,
  onAssign,
  onUnassign,
  onFillInterviewers,
  onNoteChange,
}: {
  applicants: BoardApplicant[];
  slots: BoardSlot[];
  interviewersBySlot: Record<string, { userId: string | null; name: string }[]>;
  staffMembers: BoardStaff[];
  /** 위 툴바의 팀 필터를 그대로 따른다 — 팀 고르는 곳이 두 군데면 어느 쪽이 먹었는지 헷갈린다. */
  teamFilter: string;
  canManage: boolean;
  /** 고른 사람들을 이 슬롯에 배정한다(한 번의 요청으로). */
  onAssign: (applicantIds: string[], slotId: string) => void;
  onUnassign: (applicantId: string) => void;
  /** 채우기 핸들 — 이 슬롯들의 면접관을 이 한 벌로 덮어쓴다. 계정이 없으면 이름만 넘긴다. */
  onFillInterviewers: (slotIds: string[], people: InterviewerRef[]) => void;
  onNoteChange: (slotId: string, note: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  // Shift 로 범위를 고를 때 기준이 되는 줄.
  const [anchor, setAnchor] = useState<string | null>(null);

  const pool = useMemo(() => {
    const q = query.trim();
    return applicants
      .filter((a) => !a.slotId)
      .filter((a) => matchesTeamFilter(a, teamFilter))
      .filter((a) => !q || a.name.includes(q));
  }, [applicants, query, teamFilter]);

  const assignedBySlot = useMemo(() => {
    const m = new Map<string, BoardApplicant[]>();
    for (const a of applicants) {
      if (!a.slotId) continue;
      const list = m.get(a.slotId);
      if (list) list.push(a);
      else m.set(a.slotId, [a]);
    }
    return m;
  }, [applicants]);

  // 조별로 표를 하나씩 그린다 — 운영진이 보는 엑셀과 같은 단위다.
  const panels = useMemo(() => {
    const m = new Map<string, BoardSlot[]>();
    for (const s of slots) {
      const key = (s.panel ?? '').trim() || '조 미지정';
      const list = m.get(key);
      if (list) list.push(s);
      else m.set(key, [s]);
    }
    return [...m.entries()]
      .map(([name, list]) => ({
        name,
        slots: [...list].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [slots]);

  // 타이핑 칸이 쓰는 후보 목록. 이미 앉은 사람도 넣는다 — 이름을 치면 그 자리에서 옮겨진다
  // (잘못 앉힌 것을 고치려고 먼저 빼내는 단계를 없앤다).
  const slotLabelOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of slots) {
      const panel = (s.panel ?? '').trim() || '조 미지정';
      m.set(s.id, `${panel} ${formatTimeRange(new Date(s.startsAt).getTime(), s.durationMin ?? 30).slice(0, 5)}`);
    }
    return m;
  }, [slots]);

  const candidates: Candidate[] = useMemo(
    () =>
      applicants.map((a) => ({
        id: a.id,
        name: a.name,
        team: a.assignedTeam || a.wishTeam1 || null,
        seatedSlotId: a.slotId ?? null,
        seatedAt: a.slotId ? slotLabelOf.get(a.slotId) ?? '다른 조' : null,
        remote: !!a.remoteInterviewWish,
      })),
    [applicants, slotLabelOf]
  );

  const toggle = (id: string, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && anchor) {
        // 기준부터 여기까지 한꺼번에 켠다 — 한 조 5명을 고르는 데 클릭 5번을 쓰지 않게.
        const ids = pool.map((a) => a.id);
        const from = ids.indexOf(anchor);
        const to = ids.indexOf(id);
        if (from >= 0 && to >= 0) {
          for (const x of ids.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(x);
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  };

  const place = (slotId: string) => {
    if (selected.size === 0) return;
    // 화면에 보이는 순서대로 앉힌다 — 고른 순서를 기억하게 하면 표와 어긋난다.
    const ids = pool.filter((a) => selected.has(a.id)).map((a) => a.id);
    if (ids.length === 0) return;
    onAssign(ids, slotId);
    setSelected(new Set());
    setAnchor(null);
  };

  const selectedRemote = pool.filter((a) => selected.has(a.id) && a.remoteInterviewWish).length;

  // ── 채우기 핸들(드래그로 아래 칸에 면접관 복사) ─────────────────────────
  // 엑셀과 같은 조작이라 상태도 같은 모양이다: 시작 칸 + 지금 어디까지 끌었나.
  const [fill, setFill] = useState<{ panel: string; fromIdx: number; toIdx: number } | null>(null);
  const fillRef = useRef(fill);
  fillRef.current = fill;

  useEffect(() => {
    if (!fill) return;
    // 표 밖에서 손을 떼도 끝나야 한다 — 안 그러면 드래그 상태가 남아 아무 줄이나 물든다.
    const finish = () => {
      const f = fillRef.current;
      setFill(null);
      if (!f) return;
      const panel = panels.find((p) => p.name === f.panel);
      if (!panel) return;
      const [lo, hi] = [Math.min(f.fromIdx, f.toIdx), Math.max(f.fromIdx, f.toIdx)];
      // 자기 자신만 있으면 채울 것이 없다(그냥 눌렀다 뗀 경우).
      if (lo === hi) return;
      const source = panel.slots[f.fromIdx];
      if (!source) return;
      const targets = panel.slots.slice(lo, hi + 1).filter((s) => s.id !== source.id);
      const people = refsOf(interviewersBySlot[source.id] ?? []);
      if (targets.length > 0) onFillInterviewers(targets.map((s) => s.id), people);
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [fill, panels, interviewersBySlot, onFillInterviewers]);

  const inFillRange = (panelName: string, idx: number) => {
    if (!fill || fill.panel !== panelName) return false;
    return idx >= Math.min(fill.fromIdx, fill.toIdx) && idx <= Math.max(fill.fromIdx, fill.toIdx);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* ── 미배정 명단 ─────────────────────────────────────────── */}
      <div className="flex max-h-[70vh] flex-col gap-2 rounded-xl border border-cream-200 bg-cream-25 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-ink-900">미배정 {pool.length}명</span>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelected(new Set());
                setAnchor(null);
              }}
              className="text-[11px] font-semibold text-ink-500 hover:underline"
            >
              선택 해제
            </button>
          )}
        </div>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 검색"
          uiSize="sm"
          aria-label="미배정 지원자 검색"
        />
        {pool.length > 0 && (
          <SecondaryButton
            type="button"
            onClick={() => {
              setSelected(new Set(pool.map((a) => a.id)));
              setAnchor(null);
            }}
            className="h-7 text-[11px]"
          >
            보이는 {pool.length}명 모두 선택
          </SecondaryButton>
        )}

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {pool.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-400">
              {applicants.some((a) => !a.slotId) ? '조건에 맞는 사람이 없습니다.' : '전원 배정 완료 🎉'}
            </p>
          ) : (
            pool.map((a) => {
              const on = selected.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={(e) => toggle(a.id, e.shiftKey)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                    on ? 'bg-coral-500 text-white' : 'bg-white text-ink-900 hover:bg-cream-100'
                  }`}
                >
                  <span className="truncate font-semibold">{a.name}</span>
                  <span className={`shrink-0 text-[10px] ${on ? 'text-white/80' : 'text-ink-400'}`}>
                    {a.remoteInterviewWish ? '비대면' : a.assignedTeam || a.wishTeam1 || ''}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {selected.size > 0 && (
          <p className="rounded-lg bg-coral-50 px-2 py-1.5 text-[11px] font-semibold text-coral-700">
            {selected.size}명 선택됨 — 오른쪽 시간표의 줄을 누르세요.
            <span className="mt-0.5 block font-normal text-ink-500">
              Shift 로 범위 선택. 줄에 이름을 쳐서 넣어도 됩니다.
            </span>
          </p>
        )}
      </div>

      {/* ── 시간표 ──────────────────────────────────────────────── */}
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        {panels.length === 0 && (
          <p className="py-16 text-center text-sm text-ink-400">
            아직 만든 조가 없습니다. 위에서 조를 먼저 만들어 주세요.
          </p>
        )}
        {panels.map((panel) => (
          <div key={panel.name} className="overflow-hidden rounded-xl border border-cream-200">
            <div className="flex items-center justify-between gap-2 bg-cream-100 px-3 py-2">
              <span className="text-xs font-bold text-ink-900">{panel.name}</span>
              <span className="text-[11px] text-ink-500">
                {panel.slots[0] ? slotPlaceLabel(panel.slots[0]) : ''}
              </span>
            </div>
            <table className="w-full table-fixed text-left text-xs">
              <thead className="bg-cream-50 text-[10px] font-bold text-ink-500">
                <tr>
                  <th className="w-28 p-2">시간</th>
                  <th className="w-40 p-2">면접관</th>
                  <th className="p-2">면접자</th>
                  <th className="w-32 p-2">비고 · 예비석</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {panel.slots.map((slot, idx) => {
                  const seated = assignedBySlot.get(slot.id) ?? [];
                  const interviewers = interviewersBySlot[slot.id] ?? [];
                  const canPlace = selected.size > 0;
                  // 비대면 희망자를 대면 조에 넣으려 하면 미리 알려 준다. 막지는 않는다 —
                  // 희망일 뿐이고 사정이 바뀌어 대면으로 돌리는 경우가 실제로 있다.
                  const mismatch = canPlace && !slot.isRemote && selectedRemote > 0;
                  const filling = inFillRange(panel.name, idx);
                  return (
                    <tr
                      key={slot.id}
                      onPointerEnter={() =>
                        fill && fill.panel === panel.name && setFill({ ...fill, toIdx: idx })
                      }
                      className={filling ? 'bg-blue-50' : ''}
                    >
                      <td
                        className={`p-2 align-top ${canPlace ? 'cursor-pointer hover:bg-coral-50' : ''}`}
                        onClick={() => canPlace && place(slot.id)}
                      >
                        <span className="block font-bold text-ink-900">
                          {formatTimeRange(new Date(slot.startsAt).getTime(), slot.durationMin ?? 30)}
                        </span>
                      </td>

                      {/* 면접관 — 오른쪽 아래 모서리가 엑셀의 채우기 핸들이다. */}
                      <td className="relative p-2 align-top">
                        <InterviewerCell
                          interviewers={interviewers}
                          staffMembers={staffMembers}
                          canManage={canManage}
                          onSet={(people) => onFillInterviewers([slot.id], people)}
                        />
                        {canManage && interviewers.length > 0 && (
                          <button
                            type="button"
                            aria-label="아래 칸에 이 면접관들 채우기"
                            title="끌어내리면 아래 칸에 같은 면접관이 채워집니다"
                            onPointerDown={(e) => {
                              e.preventDefault();
                              setFill({ panel: panel.name, fromIdx: idx, toIdx: idx });
                            }}
                            className="absolute bottom-1 right-1 h-2.5 w-2.5 cursor-ns-resize rounded-[2px] border border-white bg-blue-600 hover:scale-125"
                          />
                        )}
                      </td>

                      {/* 면접자 — 칩을 누르면 빠지고, 칸에 이름을 치면 들어온다. */}
                      <td className="p-2 align-top">
                        <div className="flex flex-wrap items-center gap-1">
                          {seated.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => onUnassign(a.id)}
                              title="누르면 배정을 해제합니다"
                              className="inline-flex items-center gap-1 rounded-md bg-cream-100 px-2 py-0.5 text-xs font-semibold text-ink-900 transition-colors hover:bg-coral-100 hover:text-coral-700"
                            >
                              {a.name}
                              {a.remoteInterviewWish && !slot.isRemote && (
                                <Icon name="alert" size={10} className="inline text-amber-600" />
                              )}
                              <span className="text-ink-400">✕</span>
                            </button>
                          ))}

                          {canPlace && (
                            <button
                              type="button"
                              onClick={() => place(slot.id)}
                              className={`inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-[11px] font-bold transition-colors ${
                                mismatch
                                  ? 'border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                  : 'border-coral-300 bg-coral-50 text-coral-700 hover:bg-coral-100'
                              }`}
                            >
                              <Icon name="plus" size={10} className="inline" />
                              {selected.size}명 앉히기
                              {mismatch && ` · 비대면 ${selectedRemote}`}
                            </button>
                          )}

                          {canManage && !canPlace && (
                            <SeatInput
                              candidates={candidates}
                              currentSlotId={slot.id}
                              onPick={(applicantId) => onAssign([applicantId], slot.id)}
                            />
                          )}
                        </div>
                      </td>

                      <td className="p-2 align-top">
                        <NoteCell
                          value={slot.note ?? ''}
                          canManage={canManage}
                          onSave={(v) => onNoteChange(slot.id, v)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 이름을 쳐서 앉히는 칸 — 엑셀의 타자 흐름을 그대로 옮긴 자리다.
 *
 * Enter 를 눌러도 **칸을 떠나지 않는다**. 한 줄에 5명을 넣는 것이 기본이라, 한 명 넣을 때마다
 * 다시 눌러 들어와야 하면 클릭이 5번 더 든다. 다음 줄로는 Tab 이 옮겨 준다(엑셀과 같다).
 */
function SeatInput({
  candidates,
  currentSlotId,
  onPick,
}: {
  candidates: Candidate[];
  currentSlotId: string;
  onPick: (applicantId: string) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => rankCandidates(candidates, q, currentSlotId), [candidates, q, currentSlotId]);

  const commit = (c: Candidate | undefined) => {
    if (!c) return;
    onPick(c.id);
    setQ('');
    setCursor(0);
    // 칸을 열어 둔 채 비운다 — 같은 줄의 다음 사람을 바로 칠 수 있다.
    inputRef.current?.focus();
  };

  return (
    <span className="relative inline-block">
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setCursor(0);
        }}
        onFocus={() => setOpen(true)}
        // 후보를 누르는 순간 blur 가 먼저 와 목록이 사라지는 것을 막으려고 조금 늦춘다.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            commit(matches[cursor]);
          } else if (e.key === 'Escape') {
            setQ('');
            setOpen(false);
          }
        }}
        placeholder="+ 이름"
        aria-label="이름을 쳐서 배정"
        className="h-6 w-20 rounded-md border border-dashed border-ink-300 bg-cream-50 px-1.5 text-[11px] outline-none focus:w-28 focus:border-solid focus:border-coral-400 focus:bg-white"
      />
      {open && q.trim() !== '' && (
        <ul className="absolute left-0 top-7 z-20 max-h-52 w-52 overflow-y-auto rounded-lg border border-cream-200 bg-white py-1 shadow-card">
          {matches.length === 0 && (
            <li className="px-2 py-1.5 text-[11px] text-ink-400">명단에 없는 이름입니다.</li>
          )}
          {matches.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(c)}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] ${
                  i === cursor ? 'bg-coral-50' : ''
                }`}
              >
                <span className="font-semibold text-ink-900">
                  {c.name}
                  {c.remote && <span className="ml-1 text-[9px] font-bold text-blue-600">비대면</span>}
                </span>
                {/* 이미 앉아 있으면 어디에 있는지 보여 준다 — 모르고 옮기면 그 자리가 조용히 빈다. */}
                <span className="shrink-0 text-[10px] text-ink-400">
                  {c.seatedAt ? `${c.seatedAt} →` : c.team ?? ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

/**
 * 면접관 칸 — 칩을 누르면 빠지고, 드롭다운으로 더한다. 채우기 핸들은 부모가 그린다.
 *
 * **계정은 선택이다**(0028). 계정이 필요한 것은 면접 콘솔에서 점수를 넣을 때뿐이라,
 * 계정이 없는 사람(알럼나이·아직 가입 안 한 운영진)도 '직접 입력'으로 표에 세울 수 있다.
 * 계정을 강제하면 그 사람이 표에서 통째로 빠져 공지에 나갈 시간표에 구멍이 뚫린다.
 */
function InterviewerCell({
  interviewers,
  staffMembers,
  canManage,
  onSet,
}: {
  interviewers: { userId: string | null; name: string }[];
  staffMembers: BoardStaff[];
  canManage: boolean;
  onSet: (people: InterviewerRef[]) => void;
}) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const current = refsOf(interviewers);
  const takenIds = interviewers.map((i) => i.userId).filter(Boolean) as string[];

  const addName = () => {
    const name = draft.trim();
    setDraft('');
    setTyping(false);
    if (!name || interviewers.some((i) => i.name === name)) return;
    onSet([...current, { name }]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 pb-2">
      {interviewers.map((i, idx) => (
        <button
          key={i.userId ?? `name-${i.name}`}
          type="button"
          disabled={!canManage}
          onClick={() => onSet(current.filter((_, x) => x !== idx))}
          title={i.userId ? '누르면 뺍니다' : '계정 없이 이름만 — 누르면 뺍니다'}
          className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition-colors hover:bg-coral-100 hover:text-coral-700 ${
            i.userId
              ? 'bg-blue-100 text-blue-900 disabled:hover:bg-blue-100 disabled:hover:text-blue-900'
              : // 계정 없는 사람은 옅게 — 이 사람은 콘솔에서 점수를 넣지 못한다는 표시다.
                'bg-cream-100 text-ink-700 disabled:hover:bg-cream-100 disabled:hover:text-ink-700'
          }`}
        >
          {i.name}
          {canManage && <span className="opacity-50">✕</span>}
        </button>
      ))}

      {canManage && !typing && (
        <Select
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__NAME__') setTyping(true);
            else if (v) onSet([...current, { userId: v }]);
          }}
          className="h-5 w-16 border-dashed border-ink-300 bg-cream-50 px-1 text-[10px]"
          aria-label="면접관 추가"
        >
          <option value="">+</option>
          {staffMembers
            .filter((s) => !takenIds.includes(s.id))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          <option value="__NAME__">이름 직접 입력…</option>
        </Select>
      )}

      {canManage && typing && (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={addName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addName();
            if (e.key === 'Escape') {
              setDraft('');
              setTyping(false);
            }
          }}
          maxLength={40}
          placeholder="이름"
          aria-label="면접관 이름 직접 입력"
          className="h-5 w-20 rounded-md border border-coral-400 px-1 text-[10px] outline-none"
        />
      )}

      {interviewers.length === 0 && <span className="text-[10px] text-amber-600">없음</span>}
    </div>
  );
}

/**
 * 비고·예비석 자유 칸. 저장은 칸을 떠날 때 한 번만 한다 — 글자마다 보내면 한 줄에 요청이 수십 번이다.
 */
function NoteCell({
  value,
  canManage,
  onSave,
}: {
  value: string;
  canManage: boolean;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // 바깥에서 값이 바뀌면(다른 사람이 고쳤거나 새로 불러왔거나) 따라간다 — 치는 중이 아닐 때만.
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (!canManage) return <span className="text-[11px] text-ink-500">{value}</span>;

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      maxLength={200}
      placeholder="—"
      aria-label="비고"
      className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-ink-700 outline-none hover:border-cream-200 focus:border-coral-400 focus:bg-white"
    />
  );
}
