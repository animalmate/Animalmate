'use client';
// 면접 시간표 팝업 — 지난 기수가 쓰던 엑셀 표와 같은 모양(조마다 표 하나 / 행=시간 범위 /
// 열=면접관 N + 면접자 M). 운영진에게 그대로 공지할 수 있게 복사 버튼을 둔다.
import { useState } from 'react';
import { Modal } from '@/components/modal';
import { Icon } from '@/components/icon';
import { SecondaryButton } from '@/components/ui';
import { slotPlaceLabel } from '@/recruit/display';
import {
  buildTimetable,
  timetableToTsv,
  slotsMissingInterviewers,
  formatTimeRange,
  type TimetableSlot,
} from '@/recruit/timetable';
import { dutyRosterToTsv, type DutyRow } from '@/recruit/duty-rules';

export function TimetableModal({
  slots,
  applicantsBySlot,
  interviewersBySlot,
  dutyRoles,
  dutyRows,
  durationAt,
  onClose,
}: {
  slots: TimetableSlot[];
  applicantsBySlot: Record<string, string[]>;
  interviewersBySlot: Record<string, string[]>;
  dutyRoles: string[];
  dutyRows: DutyRow[];
  durationAt: Record<number, number>;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const days = buildTimetable({
    slots,
    applicantsBySlot,
    interviewersBySlot,
    placeLabel: slotPlaceLabel,
  });
  const missing = slotsMissingInterviewers(days);
  const totalAssigned = Object.values(applicantsBySlot).reduce((n, a) => n + a.length, 0);

  const timeLabel = (ms: number) => formatTimeRange(ms, durationAt[ms] ?? 30);
  const dutyTsv = dutyRosterToTsv(dutyRoles, dutyRows, timeLabel);

  const handleCopy = async () => {
    try {
      // 면접 표와 대기실 표를 한 번에 가져간다 — 공지에 둘 다 붙이므로.
      const text = [timetableToTsv(days), dutyTsv].filter(Boolean).join('\n\n');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal title="면접 시간표" onClose={onClose} size="xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-500">
            슬롯 {slots.length}개 · 배정된 지원자 {totalAssigned}명
            {missing > 0 && (
              <span className="ml-2 inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                <Icon name="alert" size={12} className="inline" /> 면접관 없는 슬롯 {missing}개
              </span>
            )}
          </p>
          {/* 공지에 붙일 것이므로 표를 그대로 가져갈 수 있어야 한다(탭 구분 = 엑셀에 바로 붙는다). */}
          <SecondaryButton type="button" onClick={handleCopy}>
            {copied ? '복사했습니다' : '표 복사 (엑셀·카톡용)'}
          </SecondaryButton>
        </div>

        {days.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-400">아직 만든 면접 슬롯이 없습니다.</p>
        ) : (
          days.map((day) => (
            <div key={day.dateLabel} className="space-y-4">
              <h3 className="text-sm font-bold text-ink-900">{day.dateLabel}</h3>

              {day.tracks.map((track) => (
                <div key={track.label} className="space-y-1.5">
                  <div className="overflow-x-auto rounded-xl border border-cream-200">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-cream-100">
                          <th className="w-32 whitespace-nowrap border-b border-cream-200 p-2 font-bold text-ink-900">
                            {track.label}
                          </th>
                          {Array.from({ length: day.interviewerCols }, (_, i) => (
                            <th
                              key={`i${i}`}
                              className="border-b border-l border-cream-200 p-2 font-semibold text-ink-600"
                            >
                              면접관{i + 1}
                            </th>
                          ))}
                          {Array.from({ length: day.applicantCols }, (_, i) => (
                            <th
                              key={`a${i}`}
                              className="border-b border-l border-cream-200 bg-blue-50/60 p-2 font-semibold text-blue-800"
                            >
                              면접자{i + 1}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {track.rows.map((row) => (
                          <tr key={row.timeLabel} className={row.slotId ? '' : 'bg-cream-25'}>
                            <td className="whitespace-nowrap border-b border-cream-100 p-2 font-mono text-[11px] font-semibold text-ink-700">
                              {row.timeLabel}
                            </td>
                            {Array.from({ length: day.interviewerCols }, (_, i) => (
                              <td
                                key={`i${i}`}
                                className="border-b border-l border-cream-100 p-2 text-ink-700"
                              >
                                {row.interviewers[i] ?? ''}
                              </td>
                            ))}
                            {Array.from({ length: day.applicantCols }, (_, i) => (
                              <td
                                key={`a${i}`}
                                className="border-b border-l border-cream-100 p-2 font-semibold text-ink-900"
                              >
                                {row.applicants[i] ?? ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* 비대면 조는 어디로 들어가는지가 공지의 핵심이다. */}
                  {track.rows.find((r) => r.link)?.link && (
                    <p className="break-all pl-1 text-[11px] text-ink-500">
                      접속 링크: {track.rows.find((r) => r.link)!.link}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))
        )}

        {/* 대기실 업무 — 면접관이 아니라 명단 체크·안내·인솔을 맡는 사람들. 공지에 함께 나간다. */}
        {dutyRows.length > 0 && dutyRoles.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-ink-900">대기실 업무</h3>
            <div className="overflow-x-auto rounded-xl border border-cream-200">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-cream-100">
                    <th className="w-32 whitespace-nowrap border-b border-cream-200 p-2 font-bold text-ink-900">
                      대기실
                    </th>
                    {dutyRoles.map((r) => (
                      <th
                        key={r}
                        className="border-b border-l border-cream-200 p-2 font-semibold text-ink-600"
                      >
                        {r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dutyRows.map((row) => (
                    <tr key={row.startsAtMs}>
                      <td className="whitespace-nowrap border-b border-cream-100 p-2 font-mono text-[11px] font-semibold text-ink-700">
                        {timeLabel(row.startsAtMs)}
                      </td>
                      {row.allNote ? (
                        // 전원 공지는 지난 기수 표처럼 칸을 합쳐 한 줄로 보여준다.
                        <td
                          colSpan={dutyRoles.length}
                          className="border-b border-l border-cream-100 bg-cream-100 p-2 text-center font-semibold text-ink-700"
                        >
                          {row.allNote}
                        </td>
                      ) : (
                        dutyRoles.map((role) => (
                          <td key={role} className="border-b border-l border-cream-100 p-2 text-ink-900">
                            {row.byDuty[role]?.userName ?? ''}
                          </td>
                        ))
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
