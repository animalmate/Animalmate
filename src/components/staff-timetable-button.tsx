'use client';
// 운영진 시간표 팝업 — "회장단이 배정한 운영진이 언제 어디서 무엇을 맡는가"를 한 장으로 띄운다.
//
// 왜 툴바에 두는가: 이 표가 필요한 순간은 화면을 옮겨 다닐 때가 아니라 **면접 당일 콘솔에서 채점하다가
// "다음 칸 내 차례가 언제였지"가 궁금할 때**다. 배정 화면까지 되돌아가야 볼 수 있으면 아무도 안 본다.
//
// 왜 면접 시간표(TimetableModal)와 따로인가: 저 표는 조마다 표를 하나씩 만들고 면접자 이름까지 적는
// **공지용**이라 조가 늘수록 세로로 길어진다. 여기서는 지원자를 빼고 조를 열로 세워 하루를 한 장에 담는다.
// 조 목록은 고정이 아니다(대면만 3개일 수도, 비대면이 없을 수도 있다) — 열은 슬롯이 든 `panel` 에서 만든다.
import { useCallback, useEffect, useState } from 'react';
import { Modal } from './modal';
import { Icon } from './icon';
import { SecondaryButton, ToolbarButton } from './ui';
import { buildDutyRows, type DutyRow } from '@/recruit/duty-rules';
import { timeAxisOf } from '@/recruit/timetable';
import {
  buildStaffTimetable,
  cellsMissingInterviewers,
  staffTimetableToTsv,
  type StaffTimetableSlot,
} from '@/recruit/staff-timetable';

interface Loaded {
  slots: StaffTimetableSlot[];
  interviewersBySlot: Record<string, string[]>;
  dutyRoles: string[];
  dutyRows: DutyRow[];
}

export function StaffTimetableButton({ cohortId }: { cohortId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');

  // 열 때 받아온다. 이 표를 안 여는 사람이 대부분인데 화면을 열 때마다 요청 두 번을 더하면
  // 정작 급한 화면(면접 콘솔)이 느려진다.
  const load = useCallback(async () => {
    setError('');
    try {
      const [slotRes, dutyRes] = await Promise.all([
        fetch(`/api/recruit/slots?cohortId=${cohortId}`),
        fetch(`/api/recruit/duties?cohortId=${cohortId}`),
      ]);
      if (!slotRes.ok) {
        setError('시간표를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.');
        return;
      }
      const slotData = await slotRes.json();
      // 대기실 배정은 없어도 면접 표는 보여준다 — 한쪽이 실패했다고 전부 감추지 않는다.
      const dutyData = dutyRes.ok ? await dutyRes.json() : { roles: [], assignments: [] };

      const slots: StaffTimetableSlot[] = slotData.slots ?? [];
      const interviewersMap: Record<string, { name: string }[]> = slotData.interviewersMap ?? {};
      const { startTimes } = timeAxisOf(slots);

      setData({
        slots,
        interviewersBySlot: Object.fromEntries(
          Object.entries(interviewersMap).map(([slotId, list]) => [slotId, (list ?? []).map((i) => i.name)])
        ),
        dutyRoles: dutyData.roles ?? [],
        dutyRows: buildDutyRows({ startTimes, assignments: dutyData.assignments ?? [] }),
      });
    } catch {
      setError('시간표를 불러오지 못했습니다. 연결을 확인해 주세요.');
    }
  }, [cohortId]);

  useEffect(() => {
    if (!open || !cohortId) return;
    // 팝업이 떠 있는 동안 기수를 바꿀 수는 없지만, 닫았다 다시 열면 그 사이 바뀐 배정을 새로 받는다.
    setData(null);
    void load();
  }, [open, cohortId, load]);

  return (
    <>
      <ToolbarButton type="button" onClick={() => setOpen(true)} disabled={!cohortId}>
        <Icon name="clock" size={14} className="text-ink-500" />
        운영진 시간표
      </ToolbarButton>
      {open && (
        <StaffTimetableModal data={data} error={error} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function StaffTimetableModal({
  data,
  error,
  onClose,
}: {
  data: Loaded | null;
  error: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const days = data
    ? buildStaffTimetable({
        slots: data.slots,
        interviewersBySlot: data.interviewersBySlot,
        dutyRows: data.dutyRows,
      })
    : [];
  const missing = cellsMissingInterviewers(days);

  const handleCopy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(staffTimetableToTsv(days, data.dutyRoles));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal title="운영진 시간표" onClose={onClose} size="xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-500">
            회장단이 배정한 <strong>면접관·대기실 업무</strong>입니다. 지원자 이름은 넣지 않았습니다.
            {missing > 0 && (
              <span className="ml-2 inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                <Icon name="alert" size={12} className="inline" /> 면접관 미정 {missing}칸
              </span>
            )}
          </p>
          {/* 운영진 단톡에 그대로 올릴 수 있어야 한다(탭 구분 = 엑셀·시트에 바로 붙는다). */}
          <SecondaryButton type="button" onClick={handleCopy} disabled={!data || days.length === 0}>
            {copied ? '복사했습니다' : '표 복사 (엑셀·카톡용)'}
          </SecondaryButton>
        </div>

        {error ? (
          <p className="py-10 text-center text-sm text-error" role="alert">
            {error}
          </p>
        ) : !data ? (
          <p className="py-10 text-center text-sm text-ink-400">불러오는 중…</p>
        ) : days.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-400">
            아직 만든 면접 조가 없습니다. “3. 면접 배정”에서 조를 먼저 만들어 주세요.
          </p>
        ) : (
          days.map((day) => {
            // 아무도 안 맡은 업무는 열을 만들지 않는다 — 빈 열이 늘면 사람 이름이 묻힌다.
            const roles = data.dutyRoles.filter((role) => day.rows.some((r) => r.duties[role]));
            // 전원 공지는 **자기 열**을 갖는다. 예전에 줄 전체를 합쳐 봤더니, 그 시간에 실제로 면접을
            // 돌고 있던 조의 면접관 이름이 공지에 덮여 사라졌다(A조만 비우고 B·C조는 면접 중인 14:00 줄).
            // "전원 면접실 정비"와 "그 시간 B조는 라라라"는 둘 다 참인 사실이라 한쪽이 다른 쪽을 지우면 안 된다.
            const hasNote = day.rows.some((r) => r.allNote);

            return (
              <div key={day.dateLabel} className="space-y-2">
                <h3 className="text-sm font-bold text-ink-900">{day.dateLabel}</h3>

                {/* 조가 많으면 가로로 넘친다 — 표 안에서만 스크롤시킨다(페이지를 밀지 않는다). */}
                <div className="overflow-x-auto rounded-xl border border-cream-200">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      {/* 면접 칸과 대기실 칸은 하는 일이 다르다 — 머리를 두 줄로 나눠 묶음을 먼저 알린다. */}
                      <tr className="bg-cream-100">
                        <th className="w-28 border-b border-cream-200 p-2" />
                        {day.panels.length > 0 && (
                          <th
                            colSpan={day.panels.length}
                            className="border-b border-l border-cream-200 p-2 text-center font-bold text-ink-900"
                          >
                            면접관
                          </th>
                        )}
                        {(roles.length > 0 || hasNote) && (
                          <th
                            colSpan={roles.length + (hasNote ? 1 : 0)}
                            className="border-b border-l border-cream-200 bg-blue-50/60 p-2 text-center font-bold text-blue-800"
                          >
                            대기실 업무
                          </th>
                        )}
                      </tr>
                      <tr className="bg-cream-50">
                        <th className="whitespace-nowrap border-b border-cream-200 p-2 font-bold text-ink-900">시간</th>
                        {day.panels.map((panel) => (
                          <th
                            key={panel}
                            className="whitespace-nowrap border-b border-l border-cream-200 p-2 font-semibold text-ink-700"
                          >
                            {panel}
                          </th>
                        ))}
                        {roles.map((role) => (
                          <th
                            key={role}
                            className="whitespace-nowrap border-b border-l border-cream-200 bg-blue-50/40 p-2 font-semibold text-blue-800"
                          >
                            {role}
                          </th>
                        ))}
                        {hasNote && (
                          <th className="whitespace-nowrap border-b border-l border-cream-200 bg-blue-50/40 p-2 font-semibold text-blue-800">
                            전원 공지
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {day.rows.map((row) => (
                        <tr key={row.startsAtMs}>
                          <td className="whitespace-nowrap border-b border-cream-100 p-2 font-mono text-[11px] font-semibold text-ink-700">
                            {row.timeLabel}
                          </td>
                          {day.panels.map((panel) => {
                            const cell = row.byPanel[panel];
                            return (
                              <td key={panel} className="whitespace-nowrap border-b border-l border-cream-100 p-2">
                                {/* 조가 이 시간대를 비운 것(칸 없음)과 면접관을 아직 안 정한 것은
                                    다른 사실이다. 앞은 '—', 뒤는 '미정'으로 나눠 적는다. */}
                                {!cell ? (
                                  <span className="text-ink-300">—</span>
                                ) : cell.interviewers.length === 0 ? (
                                  <span className="font-semibold text-amber-700">미정</span>
                                ) : (
                                  <span className="font-semibold text-ink-900">{cell.interviewers.join(' · ')}</span>
                                )}
                              </td>
                            );
                          })}
                          {roles.map((role) => (
                            <td
                              key={role}
                              className="whitespace-nowrap border-b border-l border-cream-100 bg-blue-50/20 p-2 text-ink-900"
                            >
                              {row.duties[role] ?? <span className="text-ink-300">—</span>}
                            </td>
                          ))}
                          {hasNote && (
                            <td className="border-b border-l border-cream-100 bg-cream-100 p-2 font-semibold text-ink-700">
                              {row.allNote ?? <span className="font-normal text-ink-300">—</span>}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 장소·링크는 조마다 하나다 — 칸마다 되풀이하면 정작 사람 이름이 묻힌다. */}
                <ul className="space-y-0.5 pl-1">
                  {day.panels.map((panel) => (
                    <li key={panel} className="break-all text-[11px] text-ink-500">
                      <strong className="font-semibold text-ink-700">{panel}</strong> · {day.placeByPanel[panel]}
                      {day.linkByPanel[panel] ? ` · ${day.linkByPanel[panel]}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
