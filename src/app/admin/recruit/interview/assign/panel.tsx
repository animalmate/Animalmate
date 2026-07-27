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
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [slotInterviewersMap, setSlotInterviewersMap] = useState<Record<string, any[]>>({});
  const [venuePresets, setVenuePresets] = useState<string[]>(['학생회관 301호', '학생회관 302호']);

  // 슬롯 추가 입력 폼 (10분 단위 시각 선택)
  const [slotDate, setSlotDate] = useState('2026-08-01');
  const [slotTime, setSlotTime] = useState('14:00');
  const [slotDuration, setSlotDuration] = useState('20');
  const [isRemote, setIsRemote] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState('학생회관 301호');
  const [slotLink, setSlotLink] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // 10분 단위 시각 리스트 생성 (09:00 ~ 21:50)
  const timeOptions: string[] = [];
  for (let h = 9; h <= 21; h++) {
    const hh = String(h).padStart(2, '0');
    for (let m = 0; m < 60; m += 10) {
      const mm = String(m).padStart(2, '0');
      timeOptions.push(`${hh}:${mm}`);
    }
  }

  useEffect(() => {
    fetchCohorts();
    fetchStaffMembers();
  }, []);

  useEffect(() => {
    if (selectedCohortId) {
      fetchSlotsAndApplicants();
      fetchCohortNoticeSettings();
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

  const fetchStaffMembers = async () => {
    try {
      const res = await fetch('/api/recruit/staff');
      const data = await res.json();
      if (data.staff) setStaffMembers(data.staff);
    } catch {
      // ignore
    }
  };

  const fetchCohortNoticeSettings = async () => {
    try {
      const res = await fetch(`/api/recruit/notice?cohortId=${selectedCohortId}`);
      const data = await res.json();
      if (data.cohort?.venues && data.cohort.venues.length > 0) {
        setVenuePresets(data.cohort.venues);
        setSelectedVenue(data.cohort.venues[0]);
      }
    } catch {
      // ignore
    }
  };

  const fetchSlotsAndApplicants = async () => {
    const slotRes = await fetch(`/api/recruit/slots?cohortId=${selectedCohortId}`);
    const slotData = await slotRes.json();
    if (slotData.slots) {
      setSlots(slotData.slots);
      if (slotData.slots.length > 0) {
        const slotIds = slotData.slots.map((s: any) => s.id).join(',');
        const intRes = await fetch(`/api/recruit/slot-interviewers?slotIds=${slotIds}`);
        const intData = await intRes.json();
        if (intData.map) setSlotInterviewersMap(intData.map);
      }
    }

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
    setMessage('');
    try {
      const startsAt = new Date(`${slotDate}T${slotTime}:00`);
      const venue = isRemote ? '비대면 (온라인 화상)' : selectedVenue;

      const res = await fetch('/api/recruit/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cohortId: selectedCohortId,
          startsAt: startsAt.toISOString(),
          durationMin: parseInt(slotDuration, 10),
          venue,
          isRemote,
          link: isRemote ? slotLink : null,
        }),
      });

      if (res.ok) {
        setMessage('✅ 면접 시간 슬롯이 생성되었습니다.');
        setSlotLink('');
        await fetchSlotsAndApplicants();
      } else {
        const data = await res.json();
        setMessage(`❌ 슬롯 생성 실패: ${data.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSlot = async (id: string) => {
    if (!confirm('정말 이 면접 슬롯을 삭제하시겠습니까?')) return;
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

  const handleToggleInterviewer = async (slotId: string, userId: string, isAssigned: boolean) => {
    if (isAssigned) {
      await fetch(`/api/recruit/slot-interviewers?slotId=${slotId}&userId=${userId}`, { method: 'DELETE' });
    } else {
      await fetch('/api/recruit/slot-interviewers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId, userId }),
      });
    }
    await fetchSlotsAndApplicants();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900">3. 면접 배정 (10분 단위 & 면접관 배정)</h1>
          <p className="mt-1 text-sm text-ink-500">면접 슬롯을 10분 단위로 세분화하여 생성하고, 지원자 및 운영진 면접관을 배정합니다.</p>
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

      {/* 1. 슬롯 생성 카드 (10분 단위 & 대면 장소 프리셋 + 비대면 링크) */}
      <Card className="space-y-5">
        <div className="border-b border-cream-200 pb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-900">+ 10분 단위 면접 시간 슬롯 생성</h2>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setIsRemote(false)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                !isRemote ? 'bg-blue-600 text-white shadow-sm' : 'bg-cream-100 text-ink-700 hover:bg-cream-200'
              }`}
            >
              🏢 대면 면접
            </button>
            <button
              type="button"
              onClick={() => setIsRemote(true)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                isRemote ? 'bg-blue-600 text-white shadow-sm' : 'bg-cream-100 text-ink-700 hover:bg-cream-200'
              }`}
            >
              💻 비대면 면접 (Zoom/Meet)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <Field label="면접 날짜">
            <Input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
          </Field>

          <Field label="시작 시각 (10분 단위)">
            <Select value={slotTime} onChange={(e) => setSlotTime(e.target.value)}>
              {timeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="소요 시간">
            <Select value={slotDuration} onChange={(e) => setSlotDuration(e.target.value)}>
              <option value="10">10분</option>
              <option value="15">15분</option>
              <option value="20">20분</option>
              <option value="30">30분</option>
              <option value="40">40분</option>
            </Select>
          </Field>

          {!isRemote ? (
            <Field label="대면 면접 장소 프리셋 선택" hint="0. 공고 설정에서 등록 가능">
              <Select value={selectedVenue} onChange={(e) => setSelectedVenue(e.target.value)}>
                {venuePresets.map((v) => (
                  <option key={v} value={v}>
                    📍 {v}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="화상 면접 접속 링크 (Zoom / Meet)" hint="비대면 화상 링크">
              <Input
                type="text"
                placeholder="https://zoom.us/j/..."
                value={slotLink}
                onChange={(e) => setSlotLink(e.target.value)}
              />
            </Field>
          )}

          <div>
            <Button type="button" disabled={loading} onClick={handleCreateSlot} className="w-full h-control font-bold">
              + 슬롯 생성
            </Button>
          </div>
        </div>

        {message && (
          <div className="rounded-xl border border-cream-200 bg-cream-50 p-3 text-xs font-semibold text-ink-900">
            {message}
          </div>
        )}
      </Card>

      {/* 2. 생성된 슬롯별 운영진(면접관) 및 지원자 배정 관리 */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between border-b border-cream-200 pb-3">
          <h2 className="text-base font-bold text-ink-900">
            📅 생성된 면접 슬롯 및 운영진(면접관) 배정 현황 ({slots.length}개 슬롯)
          </h2>
        </div>

        {slots.length === 0 ? (
          <div className="text-center py-8 text-xs text-ink-400">
            생성된 면접 슬롯이 없습니다. 위에서 면접 슬롯을 먼저 만들어주세요.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {slots.map((slot) => {
              const assignedApps = applicants.filter((a) => a.slotId === slot.id);
              const interviewers = slotInterviewersMap[slot.id] || [];

              return (
                <div key={slot.id} className="rounded-2xl border border-cream-200 bg-white p-4 space-y-3 shadow-card">
                  <div className="flex items-start justify-between border-b border-cream-100 pb-2.5">
                    <div>
                      <span className="text-sm font-bold text-ink-900 flex items-center gap-1.5">
                        <span>⏰</span>
                        {new Date(slot.startsAt).toLocaleString('ko-KR', {
                          month: 'numeric',
                          day: 'numeric',
                          weekday: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        ({slot.durationMin}분)
                      </span>
                      <p className="text-xs font-semibold text-blue-700 mt-1">
                        {slot.venue ? `📍 ${slot.venue}` : slot.link ? `💻 ${slot.link}` : '대면 면접'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteSlot(slot.id)}
                      className="text-xs text-coral-600 font-semibold hover:underline"
                    >
                      슬롯 삭제
                    </button>
                  </div>

                  {/* 배정된 면접관 운영진 목록 */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-ink-500 block">
                      👥 배정된 운영진(면접관) ({interviewers.length}명)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {interviewers.map((int: any) => (
                        <span
                          key={int.userId}
                          onClick={() => handleToggleInterviewer(slot.id, int.userId, true)}
                          className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-100 text-blue-900 px-2 py-0.5 rounded-md cursor-pointer hover:bg-coral-100 hover:text-coral-700 transition-colors"
                          title="클릭 시 면접관 배정 해제"
                        >
                          {int.name} ✕
                        </span>
                      ))}

                      {/* 운영진 추가 드롭다운 */}
                      <Select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleToggleInterviewer(slot.id, e.target.value, false);
                            e.target.value = '';
                          }
                        }}
                        className="h-6 text-[11px] px-1 bg-cream-50 border-dashed border-ink-300 w-28"
                      >
                        <option value="">+ 면접관 추가…</option>
                        {staffMembers.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.name} ({st.role})
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  {/* 배정된 지원자 목록 */}
                  <div className="space-y-1 pt-1 border-t border-cream-100">
                    <span className="text-[11px] font-bold text-ink-500 block">
                      🎓 면접 대상자 지원자 ({assignedApps.length}명)
                    </span>
                    {assignedApps.length === 0 ? (
                      <span className="text-[11px] text-ink-400 italic">배정된 지원자 없음</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {assignedApps.map((app) => (
                          <span key={app.id} className="text-xs bg-cream-100 text-ink-900 px-2 py-0.5 rounded font-medium">
                            {app.name} ({app.assignedTeam || app.wishTeam1 || '팀미지정'})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 3. 서류 합격 지원자 슬롯 배정 표 */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between border-b border-cream-200 pb-3">
          <span className="text-sm font-bold text-ink-900">
            서류 합격 지원자 개별 면접 시간 배정 ({applicants.length}명)
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-cream-200 bg-white shadow-card">
          <table className="w-full text-xs text-left">
            <thead className="bg-cream-100 text-ink-700 font-semibold">
              <tr>
                <th className="p-3.5">지원자 이름</th>
                <th className="p-3.5">소속 배정팀</th>
                <th className="p-3.5">비대면 면접 희망 여부</th>
                <th className="p-3.5">배정할 면접 슬롯</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {applicants.map((app) => (
                <tr key={app.id} className="hover:bg-cream-25 transition-colors">
                  <td className="p-3.5 font-bold text-ink-900 text-sm">{app.name}</td>
                  <td className="p-3.5 font-medium text-ink-700">{app.assignedTeam || app.wishTeam1 || '-'}</td>
                  <td className="p-3.5">
                    {app.remoteInterviewWish ? (
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200">
                        {app.remoteInterviewWish}
                      </span>
                    ) : (
                      <span className="text-ink-400">대면</span>
                    )}
                  </td>
                  <td className="p-3.5">
                    <Select
                      value={app.slotId || ''}
                      onChange={(e) => handleAssignSlot(app.id, e.target.value || null)}
                      className="max-w-[360px] h-9 text-xs"
                    >
                      <option value="">-- 면접 슬롯 미배정 --</option>
                      {slots.map((s) => (
                        <option key={s.id} value={s.id}>
                          ⏰ {new Date(s.startsAt).toLocaleString('ko-KR', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          | {s.venue || '대면'} ({s.durationMin}분)
                        </option>
                      ))}
                    </Select>
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
