'use client';

import type { Role } from '@/auth/permissions';
import React, { useState, useEffect } from 'react';
import { Icon } from '@/components/icon';
import { matchesTeamFilter } from '@/recruit/team-filter';
import { RecruitNav } from '@/components/recruit-nav';
import { ScreenNotes } from '@/components/screen-notes';
import { useTeams } from '@/components/use-teams';
import { Button, Card, Field, Input, Select, StatusMessage, TeamOptions, ToolbarSelect } from '@/components/ui';

export function RecruitInterviewAssignPanel({ role }: { role: Role }) {
  const [cohorts, setCohorts] = useState<any[]>([]);
  // 기수 목록을 받아오는 동안 셀렉트에 표시한다(빈 드롭다운 = '기수 없음' 오해 방지).
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  // 배정도 팀 단위로 한다 — 팀별 메모지도 이 필터를 따라간다.
  const { teams, loading: teamsLoading } = useTeams(selectedCohortId);
  const [selectedTeam, setSelectedTeam] = useState('ALL');
  const [slots, setSlots] = useState<any[]>([]);
  const [applicants, setApplicants] = useState<any[]>([]);
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [slotInterviewersMap, setSlotInterviewersMap] = useState<Record<string, any[]>>({});
  // 기수마다 다른 값이라 코드에 기본값을 두지 않는다. 예전엔 '학생회관 301호'가 박혀 있어서
  // 불러오기 전까지 어느 기수를 열든 남의 장소가 진짜 설정처럼 보였다.
  const [venuePresets, setVenuePresets] = useState<string[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(true);

  // 슬롯 추가 입력 폼 (10분 단위 시각 선택)
  const [slotDate, setSlotDate] = useState('2026-08-01');
  const [slotTime, setSlotTime] = useState('14:00');
  const [slotDuration, setSlotDuration] = useState('20');
  const [isRemote, setIsRemote] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState('');
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
    try {
      const res = await fetch('/api/recruit/cohorts');
      const data = await res.json();
      if (data.cohorts && data.cohorts.length > 0) {
        setCohorts(data.cohorts);
        setSelectedCohortId(data.cohorts[0].id);
      }
    } finally {
      setCohortsLoading(false);
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
    setVenuesLoading(true);
    // 기수를 바꾸는 동안 앞 기수의 장소가 남아 있으면 그대로 슬롯을 만들 수 있다.
    setVenuePresets([]);
    setSelectedVenue('');
    try {
      const res = await fetch(`/api/recruit/notice?cohortId=${selectedCohortId}`);
      const data = await res.json();
      const venues: string[] = Array.isArray(data.cohort?.venues) ? data.cohort.venues : [];
      setVenuePresets(venues);
      setSelectedVenue(venues[0] ?? '');
    } catch {
      // 실패해도 빈 목록으로 둔다 — 없는 장소를 있는 것처럼 보여주지 않는다.
    } finally {
      setVenuesLoading(false);
    }
  };

  const fetchSlotsAndApplicants = async () => {
    // 예전엔 슬롯 → 면접관 → 지원자를 차례로 기다렸다(왕복 3번). 슬롯 응답이 면접관까지 담아 오고
    // 지원자는 동시에 받으므로 왕복 1번이면 된다. 자기소개서는 이 화면에서 안 쓰니 slim 으로 받는다.
    const [slotRes, appRes] = await Promise.all([
      fetch(`/api/recruit/slots?cohortId=${selectedCohortId}`),
      fetch(`/api/recruit/applicants?cohortId=${selectedCohortId}&slim=1`),
    ]);
    const [slotData, appData] = await Promise.all([slotRes.json(), appRes.json()]);

    if (slotData.slots) {
      setSlots(slotData.slots);
      setSlotInterviewersMap(slotData.interviewersMap ?? {});
    }
    if (appData.applicants) {
      const passed = appData.applicants.filter((a: any) =>
        ['doc_pass', 'interview_done', 'interview_noshow', 'final_pass'].includes(a.status)
      );
      setApplicants(passed);
    }
  };

  const handleCreateSlot = async () => {
    if (!slotDate || !slotTime) return;
    // 대면인데 장소가 비면 장소 없는 슬롯이 만들어진다 — 지원자에게 어디로 오라고 안내할 수 없다.
    if (!isRemote && !selectedVenue) {
      setMessage('❌ 면접 장소를 먼저 0. 공고 설정에서 등록해 주세요.');
      return;
    }
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

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.slot) {
        // 만든 슬롯을 응답에서 바로 받아 끼워 넣는다 — 전체를 다시 불러올 이유가 없다.
        setSlots((prev) =>
          [...prev, data.slot].sort(
            (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
          )
        );
        setMessage('✅ 면접 시간 슬롯이 생성되었습니다.');
        setSlotLink('');
      } else {
        setMessage(`❌ 슬롯 생성 실패: ${data.message || data.error || res.status}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSlot = async (id: string) => {
    // 슬롯을 지우면 거기 배정된 지원자의 배정이 조용히 풀린다(slot_id → null).
    // 몇 명이 풀리는지 알려주지 않으면, 배정을 다 해놓고 슬롯 하나 지웠다가
    // 누가 그 시간이었는지도 모른 채 처음부터 다시 배정해야 한다.
    const slot = slots.find((s) => s.id === id);
    const assigned = applicants.filter((a) => a.slotId === id);
    const when = slot
      ? new Date(slot.startsAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
      : '이 슬롯';
    const warn =
      assigned.length > 0
        ? `${when} 슬롯을 삭제합니다.\n\n배정된 지원자 ${assigned.length}명(${assigned
            .map((a) => a.name)
            .join(', ')})의 면접 시간 배정이 함께 해제됩니다. 되돌리려면 한 명씩 다시 배정해야 합니다.\n\n삭제할까요?`
        : `${when} 슬롯을 삭제합니다. 배정된 지원자는 없습니다.\n\n삭제할까요?`;
    if (!confirm(warn)) return;

    const res = await fetch(`/api/recruit/slots?id=${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(`❌ 슬롯 삭제 실패: ${data.message || data.error || res.status}`);
      return;
    }
    // 서버에서 지워졌으니 화면에서도 바로 뺀다. 배정됐던 지원자는 slot_id 가 null 이 된다(set null).
    setSlots((prev) => prev.filter((s) => s.id !== id));
    setSlotInterviewersMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setApplicants((prev) => prev.map((a) => (a.slotId === id ? { ...a, slotId: null } : a)));
    setMessage(
      assigned.length > 0
        ? `✅ 슬롯을 삭제했습니다. 지원자 ${assigned.length}명의 배정이 해제되었습니다.`
        : '✅ 슬롯을 삭제했습니다.'
    );
  };

  const handleAssignSlot = async (applicantId: string, slotId: string | null) => {
    // 드롭다운을 즉시 반영하고 저장은 뒤에서 한다(전체 새로고침을 기다리지 않는다).
    setApplicants((prev) =>
      prev.map((a) => (a.id === applicantId ? { ...a, slotId: slotId || null } : a))
    );

    try {
      const res = await fetch('/api/recruit/applicants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign_slot',
          id: applicantId,
          slotId: slotId || null,
        }),
      });
      // 실패를 삼키면 드롭다운만 바뀌고 저장은 안 된 상태로 넘어간다.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(`❌ 면접 시간 배정 실패: ${data.message || data.error || res.status}`);
        await fetchSlotsAndApplicants();
      }
    } catch {
      setMessage('❌ 면접 시간을 저장하지 못했습니다. 연결을 확인해 주세요.');
      await fetchSlotsAndApplicants();
    }
  };

  const handleToggleInterviewer = async (slotId: string, userId: string, isAssigned: boolean) => {
    // 화면을 먼저 바꾸고 요청을 보낸다. 예전엔 요청 4번(추가 1 + 전체 새로고침 3)을 다 기다려서
    // 체크 한 번에 2초씩 걸렸다.
    // 실패하면 스냅샷을 되돌리는 대신 서버에서 다시 읽는다 — 빠르게 두 번 누르면 스냅샷이
    // 낡아서, 먼저 성공한 변경까지 함께 지워 버린다.
    const staff = staffMembers.find((s) => s.id === userId);
    setSlotInterviewersMap((prev) => {
      const current = prev[slotId] ?? [];
      return {
        ...prev,
        [slotId]: isAssigned
          ? current.filter((i: any) => i.userId !== userId)
          : [...current, { slotId, userId, name: staff?.name ?? '', role: staff?.role }],
      };
    });

    try {
      const res = isAssigned
        ? await fetch(`/api/recruit/slot-interviewers?slotId=${slotId}&userId=${userId}`, { method: 'DELETE' })
        : await fetch('/api/recruit/slot-interviewers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slotId, userId }),
          });
      // 실패해도 표시가 없으면 면접관이 배정된 줄 알고 당일에야 빈 것을 안다.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(`❌ 면접관 ${isAssigned ? '해제' : '배정'} 실패: ${data.message || data.error || res.status}`);
        await fetchSlotsAndApplicants();
      }
    } catch {
      setMessage('❌ 면접관 배정을 저장하지 못했습니다. 연결을 확인해 주세요.');
      await fetchSlotsAndApplicants();
    }
  };

  const filteredApplicants = applicants.filter((app) => matchesTeamFilter(app, selectedTeam));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900">3. 면접 배정 (10분 단위 & 면접관 배정)</h1>
          <p className="mt-1 text-sm text-ink-500">면접 슬롯을 10분 단위로 세분화하여 생성하고, 지원자 및 운영진 면접관을 배정합니다.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSelect
            label="팀"
            loading={teamsLoading}
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
          >
            <option value="ALL">전체</option>
            <TeamOptions teams={teams} loading={teamsLoading} />
          </ToolbarSelect>

          <ToolbarSelect
            label="기수"
            loading={cohortsLoading}
            value={selectedCohortId}
            onChange={(e) => setSelectedCohortId(e.target.value)}
          >
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </ToolbarSelect>
        </div>
      </div>

      <RecruitNav role={role} />

      <ScreenNotes
        screen="interview-assign"
        cohortId={selectedCohortId}
        team={selectedTeam}
        title="면접 배정 운영진 공용 메모지"
      />

      {/* 1. 슬롯 생성 카드 (10분 단위 & 대면 장소 프리셋 + 비대면 링크) */}
      <Card className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
          <h2 className="text-base font-bold text-ink-900">면접 슬롯 만들기</h2>
          {/* 두 값 중 하나를 고르는 것이므로 라디오 그룹으로 묶는다(키보드 화살표 이동·스크린리더 대응). */}
          <div
            role="radiogroup"
            aria-label="면접 방식"
            className="inline-flex items-center gap-0.5 rounded-xl bg-cream-100 p-1 text-[13px] font-semibold"
          >
            {[
              { remote: false, label: '대면' },
              { remote: true, label: '비대면' },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                role="radio"
                aria-checked={isRemote === opt.remote}
                onClick={() => setIsRemote(opt.remote)}
                className={`flex min-h-tap items-center rounded-lg px-4 transition-colors ${
                  isRemote === opt.remote
                    ? 'bg-white text-ink-900 shadow-card'
                    : 'text-ink-500 hover:text-ink-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 라벨은 전부 한 줄짜리로 맞추고 도움말은 표 아래 한 곳에 모은다.
            예전에는 items-end 였는데 장소 필드에만 hint 가 붙어 있어서, 아래를 기준으로 정렬되는 바람에
            그 셀렉트만 한 줄 위로 떠 다른 컨트롤과 높이가 어긋났다. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="면접 날짜">
            <Input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
          </Field>

          <Field label="시작 시각">
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
            <Field
              label="면접 장소"
              hint={
                !venuesLoading && venuePresets.length === 0
                  ? '이 기수에 등록된 장소가 없습니다. 0. 공고 설정에서 먼저 등록해 주세요.'
                  : undefined
              }
            >
              <Select
                loading={venuesLoading}
                value={selectedVenue}
                onChange={(e) => setSelectedVenue(e.target.value)}
              >
                {venuePresets.length > 0 ? (
                  venuePresets.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))
                ) : (
                  <option value="">등록된 면접 장소가 없습니다</option>
                )}
              </Select>
            </Field>
          ) : (
            <Field label="화상 링크">
              <Input
                type="text"
                placeholder="https://zoom.us/j/..."
                value={slotLink}
                onChange={(e) => setSlotLink(e.target.value)}
              />
            </Field>
          )}

          {/* 셀 높이가 모두 같으므로 items-end 로 버튼 바닥을 컨트롤 바닥에 맞춘다. */}
          <div className="flex h-full items-end">
            <Button type="button" disabled={loading} onClick={handleCreateSlot} className="w-full">
              슬롯 생성
            </Button>
          </div>
        </div>

        <p className="text-[13px] text-ink-500">
          {isRemote
            ? '비대면 슬롯은 화상 링크가 지원자 조회 화면에 그대로 노출됩니다.'
            : '면접 장소는 “0. 공고·마감 설정”에서 등록한 프리셋 중에서 고릅니다.'}
        </p>

        <StatusMessage text={message} />
      </Card>

      {/* 2. 생성된 슬롯별 운영진(면접관) 및 지원자 배정 관리 */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between border-b border-cream-200 pb-3">
          <h2 className="text-base font-bold text-ink-900">
            생성된 면접 슬롯 및 운영진(면접관) 배정 현황 ({slots.length}개 슬롯)
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
                        <Icon name="clock" size={14} className="text-ink-500" />
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
                        {slot.venue ? slot.venue : slot.link ? `${slot.link}` : '대면 면접'}
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
                      배정된 운영진(면접관) ({interviewers.length}명)
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
                      면접 대상자 지원자 ({assignedApps.length}명)
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
            서류 합격 지원자 개별 면접 시간 배정 ({filteredApplicants.length}명
            {selectedTeam !== 'ALL' && <span className="text-ink-500"> / 전체 {applicants.length}명</span>})
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
              {filteredApplicants.map((app) => (
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
                          {new Date(s.startsAt).toLocaleString('ko-KR', {
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
