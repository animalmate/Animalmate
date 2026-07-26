'use client';

import React, { useState, useEffect } from 'react';
import { RecruitNav } from '@/components/recruit-nav';
import { ScreenNotes } from '@/components/screen-notes';
import { Button, Card, Field, Input, Select } from '@/components/ui';

export function RecruitInterviewAssignPanel() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [slots, setSlots] = useState<any[]>([]);
  const [applicants, setApplicants] = useState<any[]>([]);

  // 슬롯 추가 입력 폼
  const [slotDate, setSlotDate] = useState('2026-08-01');
  const [slotTime, setSlotTime] = useState('14:00');
  const [slotDuration, setSlotDuration] = useState('20');
  const [slotLink, setSlotLink] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCohorts();
  }, []);

  useEffect(() => {
    if (selectedCohortId) {
      fetchSlotsAndApplicants();
    }
  }, [selectedCohortId]);

  const fetchCohorts = async () => {
    const res = await fetch('/api/recruit/cohorts');
    const data = await res.json();
    if (data.cohorts && data.cohorts.length > 0) {
      setCohorts(data.cohorts);
      setSelectedCohortId(data.cohorts[0].id);
    }
  };

  const fetchSlotsAndApplicants = async () => {
    const slotRes = await fetch(`/api/recruit/slots?cohortId=${selectedCohortId}`);
    const slotData = await slotRes.json();
    if (slotData.slots) setSlots(slotData.slots);

    const appRes = await fetch(`/api/recruit/applicants?cohortId=${selectedCohortId}`);
    const appData = await appRes.json();
    if (appData.applicants) {
      const passed = appData.applicants.filter((a: any) =>
        ['doc_pass', 'interview_done', 'interview_noshow', 'final_pass'].includes(a.status)
      );
      setApplicants(passed);
    }
  };

  const handleCreateSlot = async () => {
    if (!slotDate || !slotTime) return;
    setLoading(true);
    try {
      const startsAt = new Date(`${slotDate}T${slotTime}:00`);
      const res = await fetch('/api/recruit/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cohortId: selectedCohortId,
          startsAt: startsAt.toISOString(),
          durationMin: parseInt(slotDuration, 10),
          link: slotLink || null,
        }),
      });
      if (res.ok) {
        setSlotLink('');
        await fetchSlotsAndApplicants();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSlot = async (id: string) => {
    await fetch(`/api/recruit/slots?id=${id}`, { method: 'DELETE' });
    await fetchSlotsAndApplicants();
  };

  const handleAssignSlot = async (applicantId: string, slotId: string | null) => {
    await fetch('/api/recruit/applicants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'assign_slot',
        id: applicantId,
        slotId: slotId || null,
      }),
    });
    await fetchSlotsAndApplicants();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900">4. 면접 슬롯 생성 및 지원자 배정 (회장단)</h1>
          <p className="mt-1 text-sm text-ink-500">면접 일시·링크 슬롯을 생성하고 서류 합격 지원자별로 시간을 배정합니다.</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink-900">기수:</span>
          <Select
            value={selectedCohortId}
            onChange={(e) => setSelectedCohortId(e.target.value)}
            className="w-48"
          >
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <RecruitNav />

      <ScreenNotes contextKey="recruit:interview-assign" title="면접 배정 운영진 공용 메모지" />

      {/* 슬롯 생성 카드 */}
      <Card className="space-y-4">
        <div className="border-b border-cream-200 pb-3">
          <h2 className="text-base font-bold text-ink-900">+ 새 면접 시간 슬롯 생성</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <Field label="면접 날짜">
            <Input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
          </Field>

          <Field label="시작 시각">
            <Input type="time" value={slotTime} onChange={(e) => setSlotTime(e.target.value)} />
          </Field>

          <Field label="소요 시간">
            <Select value={slotDuration} onChange={(e) => setSlotDuration(e.target.value)}>
              <option value="15">15분</option>
              <option value="20">20분</option>
              <option value="30">30분</option>
              <option value="45">45분</option>
            </Select>
          </Field>

          <Field label="화상 면접 / 장소 링크 (선택)">
            <Input
              type="text"
              placeholder="Google Meet / Zoom URL 또는 장소"
              value={slotLink}
              onChange={(e) => setSlotLink(e.target.value)}
            />
          </Field>

          <div>
            <Button type="button" disabled={loading} onClick={handleCreateSlot} className="w-full h-control">
              + 슬롯 생성
            </Button>
          </div>
        </div>
      </Card>

      {/* 면접 배정 테이블 카드 */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between border-b border-cream-200 pb-3">
          <span className="text-sm font-bold text-ink-900">
            서류 합격 지원자 배정 ({applicants.length}명)
          </span>
          <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
            생성된 슬롯: {slots.length}개
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-cream-200 bg-white shadow-card">
          <table className="w-full text-xs text-left">
            <thead className="bg-cream-100 text-ink-700 font-semibold">
              <tr>
                <th className="p-3.5">이름</th>
                <th className="p-3.5">학교 / 학과</th>
                <th className="p-3.5">비대면 면접 희망</th>
                <th className="p-3.5">배정된 면접 슬롯</th>
                <th className="p-3.5 text-center">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {applicants.map((app) => (
                <tr key={app.id} className="hover:bg-cream-25 transition-colors">
                  <td className="p-3.5 font-bold text-ink-900 text-sm">{app.name}</td>
                  <td className="p-3.5 text-ink-700">{app.school} {app.department}</td>
                  <td className="p-3.5">
                    {app.remoteInterviewWish ? (
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200">
                        {app.remoteInterviewWish}
                      </span>
                    ) : (
                      <span className="text-ink-400">-</span>
                    )}
                  </td>
                  <td className="p-3.5">
                    <Select
                      value={app.slotId || ''}
                      onChange={(e) => handleAssignSlot(app.id, e.target.value || null)}
                      className="max-w-[320px] h-9 text-xs"
                    >
                      <option value="">-- 면접 슬롯 미배정 --</option>
                      {slots.map((s) => (
                        <option key={s.id} value={s.id}>
                          {new Date(s.startsAt).toLocaleString('ko-KR', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          ({s.durationMin}분)
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="p-3.5 text-center">
                    {app.slotId ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteSlot(app.slotId)}
                        className="text-xs text-coral-600 font-semibold hover:underline"
                      >
                        슬롯 해제
                      </button>
                    ) : (
                      <span className="text-ink-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
