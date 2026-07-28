'use client';
// 면접 시간표 팝업 — 운영진에게 공지할 표를 한눈에 보고, 그대로 복사해 갈 수 있게 한다.
import { useState } from 'react';
import { Modal } from '@/components/modal';
import { Icon } from '@/components/icon';
import { SecondaryButton } from '@/components/ui';
import { slotPlaceLabel } from '@/recruit/display';
import {
  buildTimetable,
  timetableToTsv,
  slotsMissingInterviewers,
  type TimetableSlot,
  type TimetablePerson,
} from '@/recruit/timetable';

export function TimetableModal({
  slots,
  applicantsBySlot,
  interviewersBySlot,
  onClose,
}: {
  slots: TimetableSlot[];
  applicantsBySlot: Record<string, TimetablePerson[]>;
  interviewersBySlot: Record<string, string[]>;
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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(timetableToTsv(days));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal title="면접 시간표" onClose={onClose} size="xl">
      <div className="space-y-4">
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
            <div key={day.dateLabel} className="space-y-2">
              <h3 className="text-sm font-bold text-ink-900">{day.dateLabel}</h3>
              <div className="overflow-x-auto rounded-xl border border-cream-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-cream-100 text-ink-700">
                    <tr>
                      <th className="w-20 border-b border-cream-200 p-2.5 font-semibold">시각</th>
                      {day.places.map((p) => (
                        <th key={p} className="border-b border-l border-cream-200 p-2.5 font-semibold">
                          {p}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {day.rows.map((row) => (
                      <tr key={row.timeLabel} className="align-top">
                        <td className="border-b border-cream-100 p-2.5 font-mono font-bold text-blue-700">
                          {row.timeLabel}
                        </td>
                        {row.cells.map((panels, i) => (
                          <td
                            key={day.places[i]}
                            className="border-b border-l border-cream-100 p-2.5"
                          >
                            {panels.length === 0 ? (
                              <span className="text-ink-300">—</span>
                            ) : (
                              <div className="space-y-2">
                                {panels.map((c) => (
                                  <div key={c.slotId} className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-1">
                                      {/* 같은 시각·같은 장소를 나눠 쓰는 조는 번호로 구분한다. */}
                                      {c.panelNo > 0 && (
                                        <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                          {c.panelNo}조
                                        </span>
                                      )}
                                      {c.applicants.length > 0 ? (
                                        c.applicants.map((a) => (
                                          <span
                                            key={a.name}
                                            className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-800"
                                          >
                                            {a.name}
                                            {a.team && <span className="text-blue-400"> {a.team}</span>}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[11px] text-ink-400">지원자 없음</span>
                                      )}
                                    </div>
                                    <div className="text-[11px]">
                                      {c.interviewers.length > 0 ? (
                                        <span className="text-ink-600">면접관 {c.interviewers.join('·')}</span>
                                      ) : (
                                        <span className="font-semibold text-amber-700">면접관 미정</span>
                                      )}
                                      {c.durationMin ? (
                                        <span className="text-ink-400"> · {c.durationMin}분</span>
                                      ) : null}
                                    </div>
                                    {c.link && (
                                      <p className="break-all text-[10px] text-ink-400">{c.link}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
