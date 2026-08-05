'use client';

import { HelpButton } from '@/components/help-button';
import type { Role } from '@/auth/permissions';
import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/icon';
import { matchesTeamFilter } from '@/recruit/team-filter';
import { slotPlaceLabel, slotPanelNumbers, slotPanelSuffix, slotPanelLabel, suggestNextPanelName } from '@/recruit/display';
import { timeAxisOf } from '@/recruit/timetable';
import type { DutyRow } from '@/recruit/duty-rules';
import { isPrivileged } from '@/auth/permissions';
import { TimetableModal } from './timetable-modal';
import { DutyRoster } from './duty-roster';
import { RecruitNav } from '@/components/recruit-nav';
import { ScreenNotes } from '@/components/screen-notes';
import { StaffTimetableButton } from '@/components/staff-timetable-button';
import { useTeams } from '@/components/use-teams';
import { Button, Card, CardBlock, CardField, Field, Input, RowCard, SecondaryButton, Select, StatusMessage, TableCards, TeamOptions, ToolbarSelect } from '@/components/ui';

// 표(PC)와 카드(모바일)가 같은 조각을 쓰도록 뽑아 둔다 — 한쪽만 고치는 사고를 막는다.
function RemoteWishChip({ wish }: { wish?: string | null }) {
  if (!wish) return <span className="text-[11px] font-semibold text-ink-400">대면</span>;
  return (
    <span className="shrink-0 whitespace-nowrap rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
      {wish}
    </span>
  );
}

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

  // 조 만들기 입력 폼 (10분 단위 시각 선택)
  const [panelName, setPanelName] = useState('A조');
  const [slotDate, setSlotDate] = useState('2026-08-01');
  const [slotTime, setSlotTime] = useState('14:00');
  const [slotEndTime, setSlotEndTime] = useState('18:00');
  const [slotDuration, setSlotDuration] = useState('20');
  const [isRemote, setIsRemote] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState('');
  const [slotLink, setSlotLink] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showTimetable, setShowTimetable] = useState(false);
  // 대기실 표는 별도 컴포넌트가 불러온다. 시간표 팝업이 같은 값을 쓰도록 위로 올려 받는다.
  const [dutyRoles, setDutyRoles] = useState<string[]>([]);
  const [dutyRows, setDutyRows] = useState<DutyRow[]>([]);

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

  const fetchCohortNoticeSettings = useCallback(async () => {
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
  }, [selectedCohortId]);

  const fetchSlotsAndApplicants = useCallback(async () => {
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
  }, [selectedCohortId]);

  useEffect(() => {
    if (selectedCohortId) {
      fetchSlotsAndApplicants();
      fetchCohortNoticeSettings();
    }
  }, [selectedCohortId, fetchSlotsAndApplicants, fetchCohortNoticeSettings]);

  const handleCreatePanel = async () => {
    if (!slotDate || !slotTime) return;
    if (!panelName.trim()) {
      setMessage('❌ 조 이름을 입력해 주세요(예: A조).');
      return;
    }
    // 대면인데 장소가 비면 장소 없는 슬롯이 만들어진다 — 지원자에게 어디로 오라고 안내할 수 없다.
    if (!isRemote && !selectedVenue) {
      setMessage('❌ 면접 장소를 먼저 0. 공고 설정에서 등록해 주세요.');
      return;
    }
    if (plannedSlotCount <= 0) {
      setMessage('❌ 종료 시각이 시작 시각보다 늦어야 합니다.');
      return;
    }
    // 같은 이름의 조가 이미 있으면 시간대가 뒤섞인다 — 두 번 누른 사고를 여기서 잡는다.
    if (existingPanels.includes(panelName.trim())) {
      setMessage(`❌ "${panelName.trim()}" 은(는) 이미 있습니다. 다른 이름을 쓰거나 기존 조를 지우고 다시 만드세요.`);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/recruit/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cohortId: selectedCohortId,
          panel: panelName.trim(),
          startsAt: new Date(`${slotDate}T${slotTime}:00`).toISOString(),
          until: new Date(`${slotDate}T${slotEndTime}:00`).toISOString(),
          durationMin: parseInt(slotDuration, 10),
          venue: isRemote ? '비대면 (온라인 화상)' : selectedVenue,
          isRemote,
          link: isRemote ? slotLink : null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.slots)) {
        // 만든 슬롯을 응답에서 바로 받아 끼워 넣는다 — 전체를 다시 불러올 이유가 없다.
        setSlots((prev) =>
          [...prev, ...data.slots].sort(
            (a, b) =>
              new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() ||
              String(a.panel ?? '').localeCompare(String(b.panel ?? ''))
          )
        );
        setMessage(`✅ ${panelName.trim()} 을(를) ${data.slots.length}칸으로 만들었습니다.`);
        // 다음 조 이름을 미리 채워 둔다 — 안 그러면 두 번째 조를 만들 때마다 지우고 다시 써야 하고,
        // 그대로 누르면 "이미 있는 이름"에서 막힌다.
        setPanelName(suggestNextPanelName([...existingPanels, panelName.trim()]));
        setSlotLink('');
      } else {
        setMessage(`❌ 조 생성 실패: ${data.message || data.error || res.status}`);
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

  // 만들기 전에 몇 칸이 생기는지 버튼에 적어 준다 — 10:00~18:00 을 20분으로 자르면 24칸이고,
  // 그걸 모른 채 누르면 지우는 데 24번을 눌러야 한다.
  const plannedSlotCount = (() => {
    const step = parseInt(slotDuration, 10);
    const from = new Date(`${slotDate}T${slotTime}:00`).getTime();
    const to = new Date(`${slotDate}T${slotEndTime}:00`).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to) || !step || to <= from) return 0;
    return Math.ceil((to - from) / (step * 60_000));
  })();

  // 이미 있는 조 이름(중복 생성 방지 + 안내). 슬롯이 곧 조 목록이다.
  const existingPanels = [...new Set(slots.map((s) => (s.panel ?? '').trim()).filter(Boolean))];
  const panelsKey = existingPanels.join('|');

  // 기수를 바꾸거나 슬롯을 다시 받으면 그 기수에 **없는** 이름으로 기본값을 맞춘다.
  // 없으면 앞 기수에서 쓰던 이름이 칸에 남아, 누르자마자 "이미 있는 이름"에서 막힌다.
  // 의존성은 접은 문자열(panelsKey)로 둔다 — 배열은 렌더마다 새로 생겨 effect 가 매번 돈다.
  // 조 이름을 손으로 고치는 중에는 panelsKey 가 안 바뀌므로 입력을 빼앗지 않는다.
  useEffect(() => {
    const next = suggestNextPanelName(panelsKey ? panelsKey.split('|') : []);
    // Z조까지 찼으면 빈 문자열이 온다 — 그때는 칸을 비우지 말고 사람이 쓴 값을 그대로 둔다.
    if (next) setPanelName(next);
  }, [panelsKey]);

  // 같은 시각·같은 장소 슬롯(동시 진행 조)에 번호를 매긴다. 드롭다운·카드가 같은 번호를 쓴다.
  const panelNumbers = slotPanelNumbers(slots);

  // 시간표 팝업에 넘길 모양으로 한 번만 접는다.
  // 이름만 넣는다 — 팀까지 붙이면 칸이 길어져 표가 지저분해지고, 공지에 필요하지도 않다.
  const applicantsBySlot: Record<string, string[]> = {};
  applicants.forEach((a) => {
    if (!a.slotId) return;
    (applicantsBySlot[a.slotId] ??= []).push(a.name);
  });
  const interviewerNamesBySlot: Record<string, string[]> = {};
  Object.entries(slotInterviewersMap).forEach(([slotId, list]) => {
    interviewerNamesBySlot[slotId] = (list ?? []).map((i: any) => i.name);
  });

  // 대기실 표는 면접 시간표와 같은 시간축을 쓴다 — 줄이 어긋나면 나란히 볼 수 없다.
  // useMemo 가 없으면 렌더마다 새 배열이 나오고, 그것을 prop 으로 받은 DutyRoster 의 effect 가
  // 매번 다시 돌아 부모 setState → 재렌더 → 새 배열…로 무한 루프가 된다(실제로 터졌다).
  const { startTimes, durationAt } = React.useMemo(() => timeAxisOf(slots), [slots]);

  const handleDutiesLoaded = React.useCallback((roles: string[], rows: DutyRow[]) => {
    setDutyRoles(roles);
    setDutyRows(rows);
  }, []);

  // 슬롯 드롭다운 내용은 표(PC)와 카드(모바일)가 함께 쓴다 — 한 번만 만든다.
  const slotOptions = (
    <>
      <option value="">-- 면접 슬롯 미배정 --</option>
      {slots.map((s) => (
        <option key={s.id} value={s.id}>
          {new Date(s.startsAt).toLocaleString('ko-KR', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          | {slotPlaceLabel(s)} ({s.durationMin}분)
          {/* 같은 시각을 나눠 쓰는 조는 이 꼬리표가 없으면 드롭다운에 완전히 같은 줄로 뜬다
              — 어느 쪽을 고르는지 알 수 없다. 면접관까지 붙여 "누가 보는 조인지"를 함께 알린다. */}
          {slotPanelSuffix(
            slotPanelLabel(s, panelNumbers),
            (slotInterviewersMap[s.id] ?? []).map((i: any) => i.name)
          )}
        </option>
      ))}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-bold text-ink-900">3. 면접 배정 (10분 단위 &amp; 면접관 배정)</h1>
            <HelpButton screen="recruit-assign" />
          </div>
          <p className="mt-1 text-sm text-ink-500">면접 슬롯을 10분 단위로 세분화하여 생성하고, 지원자 및 운영진 면접관을 배정합니다.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 배정을 하다 말고 "지금까지 누가 어디에 들어갔더라"를 확인하는 자리다.
              아래 '현재 현황 보기'는 지원자까지 넣은 공지용 표이고, 이쪽은 운영진 배정만 본다. */}
          <StaffTimetableButton cohortId={selectedCohortId} />

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

      {/* 1. 조 만들기 — 조 = 방 하나를 잡고 하루 종일 유지되는 트랙(지난 기수 시간표의 A조·B조·비대면 파견).
             시작~종료를 소요 시간으로 잘라 슬롯을 한 번에 만든다. 예전에는 칸을 하나씩 만들게 해서
             10:00~18:00 을 30분으로 쪼개면 같은 폼을 16번 채워야 했다. */}
      <Card className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
          <h2 className="text-base font-bold text-ink-900">면접 조 만들기</h2>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* 조 구성은 기수마다 다르다 — 대면만 3개일 수도, 비대면이 없을 수도 있다.
              그래서 이름은 자유 입력이고 목록도 코드에 두지 않는다. */}
          <Field
            label="조 이름"
            hint={existingPanels.length > 0 ? `이미 있는 조: ${existingPanels.join(' · ')}` : '원하는 대로 지으세요(예: A조 · 비대면 파견)'}
          >
            <Input
              type="text"
              placeholder="예: A조"
              value={panelName}
              onChange={(e) => setPanelName(e.target.value)}
            />
          </Field>

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

          {/* 종료 시각은 **그 시각 전까지** 만든다 — 18:00 을 고르면 17:30~18:00 이 마지막 칸이다.
              "18:00 까지"라고 말했을 때 사람이 기대하는 것이 그것이다. */}
          <Field label="종료 시각" hint="이 시각 전까지 만듭니다">
            <Select value={slotEndTime} onChange={(e) => setSlotEndTime(e.target.value)}>
              {timeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="한 칸 길이">
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
            <Button type="button" disabled={loading} onClick={handleCreatePanel} className="w-full">
              {loading ? '만드는 중…' : `조 만들기${plannedSlotCount > 0 ? ` (${plannedSlotCount}칸)` : ''}`}
            </Button>
          </div>
        </div>

        <p className="text-[13px] text-ink-500">
          조는 <strong>방 하나를 잡고 하루 종일 유지되는 트랙</strong>입니다. 조를 만든 뒤 아래에서 시간대마다
          면접관과 지원자를 배정하세요.{' '}
          {isRemote
            ? '비대면 조는 화상 링크가 지원자 조회 화면에 그대로 노출됩니다.'
            : '면접 장소는 “0. 공고·마감 설정”에서 등록한 프리셋 중에서 고릅니다.'}
        </p>

        <StatusMessage text={message} />
      </Card>

      {/* 2. 생성된 슬롯별 운영진(면접관) 및 지원자 배정 관리 */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-200 pb-3">
          <h2 className="text-base font-bold text-ink-900">
            생성된 면접 슬롯 및 운영진(면접관) 배정 현황 ({slots.length}개 슬롯)
          </h2>
          {/* 카드가 흩어져 있으면 전체 흐름이 안 보인다. 공지에 붙일 표는 한 장으로 봐야 한다. */}
          <SecondaryButton type="button" onClick={() => setShowTimetable(true)} disabled={slots.length === 0}>
            현재 현황 보기
          </SecondaryButton>
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
                        {/* 카드도 드롭다운과 같은 조 이름을 쓴다 — 안 그러면 똑같이 생긴 카드 둘 중
                            어느 것이 드롭다운의 A조인지 알 수 없다. */}
                        {slotPanelLabel(slot, panelNumbers) && (
                          <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {slotPanelLabel(slot, panelNumbers)}
                          </span>
                        )}
                      </span>
                      {/* 예전엔 venue 가 있으면 링크를 아예 안 보여줬다 — 비대면 슬롯인데
                          어디로 들어가는지 이 카드에서 확인할 수 없었다. 둘 다 보여준다. */}
                      <p className="text-xs font-semibold text-blue-700 mt-1">{slotPlaceLabel(slot)}</p>
                      {slot.isRemote && slot.link && (
                        <p className="mt-0.5 break-all text-[11px] text-ink-500">{slot.link}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteSlot(slot.id)}
                      className="inline-flex min-h-tap items-center px-2 text-xs text-coral-600 font-semibold hover:underline"
                    >
                      슬롯 삭제
                    </button>
                  </div>

                  {/* 배정된 면접관 운영진 목록 */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-ink-500 block">
                      배정된 운영진(면접관) ({interviewers.length}명)
                    </span>
                    {/* 지원자는 배정해 놓고 면접관을 빠뜨리면 면접 당일 그 시간대에 아무도 없다.
                        슬롯을 만든 직후에는 늘 0명이므로, 지원자가 있을 때만 경고한다. */}
                    {interviewers.length === 0 && assignedApps.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        <Icon name="alert" size={12} className="inline" /> 면접관 없음 — 지원자 {assignedApps.length}명 배정됨
                      </span>
                    )}
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

        {/* 노트북은 표, 폰·태블릿은 카드(TableCards 주석 참고). */}
        <TableCards
          table={
            <table className="w-full text-left text-xs">
              <thead className="bg-cream-100 font-semibold text-ink-700">
                <tr>
                  <th className="p-3.5">지원자 이름</th>
                  <th className="p-3.5">소속 배정팀</th>
                  <th className="p-3.5">비대면 면접 희망 여부</th>
                  <th className="p-3.5">배정할 면접 슬롯</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {filteredApplicants.map((app) => (
                  <tr key={app.id} className="transition-colors hover:bg-cream-25">
                    <td className="p-3.5 text-sm font-bold text-ink-900">{app.name}</td>
                    <td className="p-3.5 font-medium text-ink-700">{app.assignedTeam || app.wishTeam1 || '-'}</td>
                    <td className="p-3.5">
                      <RemoteWishChip wish={app.remoteInterviewWish} />
                    </td>
                    <td className="p-3.5">
                      <Select
                        value={app.slotId || ''}
                        onChange={(e) => handleAssignSlot(app.id, e.target.value || null)}
                        aria-label={`${app.name} 면접 슬롯`}
                        uiSize="sm"
                        className="max-w-[360px]"
                      >
                        {slotOptions}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
          cards={filteredApplicants.map((app) => (
            <RowCard key={app.id} title={app.name} badge={<RemoteWishChip wish={app.remoteInterviewWish} />}>
              <CardField label="소속 배정팀">{app.assignedTeam || app.wishTeam1 || '-'}</CardField>
              {/* 슬롯 이름이 "10/2 14:00 | 학생회관 (20분) · 2조" 처럼 길다 — CardBlock 으로 폭을 다 준다. */}
              <CardBlock label="배정할 면접 슬롯">
                <Select
                  value={app.slotId || ''}
                  onChange={(e) => handleAssignSlot(app.id, e.target.value || null)}
                  aria-label={`${app.name} 면접 슬롯`}
                >
                  {slotOptions}
                </Select>
              </CardBlock>
            </RowCard>
          ))}
        />
      </Card>

      <DutyRoster
        cohortId={selectedCohortId}
        startTimes={startTimes}
        durationAt={durationAt}
        staffMembers={staffMembers}
        canManage={isPrivileged(role)}
        onLoaded={handleDutiesLoaded}
      />

      {showTimetable && (
        <TimetableModal
          slots={slots}
          applicantsBySlot={applicantsBySlot}
          interviewersBySlot={interviewerNamesBySlot}
          dutyRoles={dutyRoles}
          dutyRows={dutyRows}
          durationAt={durationAt}
          onClose={() => setShowTimetable(false)}
        />
      )}
    </div>
  );
}
