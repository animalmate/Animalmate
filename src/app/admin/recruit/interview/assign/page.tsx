'use client';

import React, { useState, useEffect } from 'react';
import { RecruitNav } from '@/components/recruit-nav';
import { ScreenNotes } from '@/components/screen-notes';

export default function RecruitInterviewAssignPage() {
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
      // 서류 합격 이상 대상자만 필터링
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
      method: 'PATCH',
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
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-foreground mb-4">F9 면접 슬롯 생성 및 지원자 배정 (회장단)</h1>
      <RecruitNav />

      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm font-semibold text-foreground">기수 선택:</span>
        <select
          value={selectedCohortId}
          onChange={(e) => setSelectedCohortId(e.target.value)}
          className="p-1.5 border border-input rounded-lg text-sm bg-background"
        >
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <ScreenNotes contextKey="recruit:interview-assign" title="면접 배정 공용 메모지" />

      {/* 슬롯 생성 폼 */}
      <div className="p-4 border border-border rounded-xl bg-card mb-6 space-y-3">
        <h2 className="text-sm font-bold text-foreground">새 면접 슬롯 추가</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <input
            type="date"
            value={slotDate}
            onChange={(e) => setSlotDate(e.target.value)}
            className="p-2 border rounded-lg bg-background"
          />
          <input
            type="time"
            value={slotTime}
            onChange={(e) => setSlotTime(e.target.value)}
            className="p-2 border rounded-lg bg-background"
          />
          <select
            value={slotDuration}
            onChange={(e) => setSlotDuration(e.target.value)}
            className="p-2 border rounded-lg bg-background"
          >
            <option value="15">15분</option>
            <option value="20">20분</option>
            <option value="30">30분</option>
          </select>
          <input
            type="text"
            placeholder="면접 링크 (예: Google Meet/Zoom URL)"
            value={slotLink}
            onChange={(e) => setSlotLink(e.target.value)}
            className="p-2 border rounded-lg bg-background flex-1 min-w-[200px]"
          />
          <button
            type="button"
            disabled={loading}
            onClick={handleCreateSlot}
            className="px-4 py-2 bg-primary text-primary-foreground font-bold rounded-lg"
          >
            + 슬롯 생성
          </button>
        </div>
      </div>

      {/* 면접 배정 테이블 */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="p-3 border-b border-border bg-muted text-xs font-bold text-muted-foreground flex justify-between">
          <span>서류 합격 지원자 목록 ({applicants.length}명)</span>
          <span>등록된 슬롯 ({slots.length}개)</span>
        </div>

        <table className="w-full text-xs text-left">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-3">이름</th>
              <th className="p-3">학교 / 학과</th>
              <th className="p-3">비대면 희망</th>
              <th className="p-3">면접 슬롯 배정</th>
              <th className="p-3">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {applicants.map((app) => (
              <tr key={app.id} className="hover:bg-accent/50">
                <td className="p-3 font-bold text-foreground">{app.name}</td>
                <td className="p-3">{app.school} {app.department}</td>
                <td className="p-3">
                  {app.remoteInterviewWish ? (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-medium">
                      {app.remoteInterviewWish}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="p-3">
                  <select
                    value={app.slotId || ''}
                    onChange={(e) => handleAssignSlot(app.id, e.target.value || null)}
                    className="p-1.5 border border-input rounded bg-background text-xs max-w-[300px]"
                  >
                    <option value="">-- 미배정 --</option>
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
                  </select>
                  {app.slotId && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSlot(app.slotId)}
                      className="ml-2 text-[10px] text-destructive hover:underline"
                    >
                      슬롯 삭제
                    </button>
                  )}
                </td>
                <td className="p-3">
                  <span className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded text-[11px]">
                    {app.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
