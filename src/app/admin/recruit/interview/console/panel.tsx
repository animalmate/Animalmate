'use client';

import { HelpButton } from '@/components/help-button';
import type { Role } from '@/auth/permissions';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTeams } from '@/components/use-teams';
import { matchesTeamFilter } from '@/recruit/team-filter';
import { RecruitNav } from '@/components/recruit-nav';
import { ScreenNotes } from '@/components/screen-notes';
import { StaffTimetableButton } from '@/components/staff-timetable-button';
import { AutoGrowTextarea } from '@/components/auto-grow-textarea';
import { EssayBlock } from '@/components/essay-block';
import { formatPhone } from '@/lib/phone';
// slotPanelSuffix 는 슬롯 드롭다운이 쓰던 것 — 드롭다운을 걷어내고 시간대 그리드가 조 번호를
// 배지로 직접 그리면서 필요 없어졌다(다른 화면에서는 아직 쓴다).
import { slotPlaceLabel, formatScore, slotPanelNumbers } from '@/recruit/display';
import { formatTimeKo, formatTimeRange } from '@/recruit/timetable';
import { panelOrder } from '@/recruit/staff-timetable';
import { groupApplicantsBySlot } from '@/recruit/interview-groups';
import { recruitStatusBadge, BADGE_TONE_CLASS } from '@/recruit/status-label';
import { Button, Card, Field, Input, StatusMessage, TeamOptions, ToolbarSelect } from '@/components/ui';

// 점수칸은 비워 둔 채 시작한다. 예전에는 '8.0' 이 미리 채워져 있어서, 면접관이 점수칸을 건드리지
// 않고 저장만 눌러도 8.0 이 '면접관이 매긴 점수'로 기록되고 상태까지 면접 완료로 전이됐다.
// 채점하지 않은 것과 8점을 준 것은 완전히 다른 사실이고, 뒤섞이면 집계·표본 부족 판정이 무너진다.
const NO_SCORE = '';

/**
 * 시간대 그리드 한 칸. 면접 당일에 눈으로 훑어야 하는 것은 세 가지다 —
 * **지금 어디인지 · 어디까지 채점했는지 · 지금 보고 있는 조가 어디인지.** 색으로 셋을 나눈다.
 * (파랑=지금 진행 중, 초록=내 채점 끝, 테두리 강조=지금 고른 조.)
 */
function SlotChip({
  label,
  sub,
  badge,
  now = false,
  done = false,
  active = false,
  onClick,
}: {
  label: string;
  sub: string;
  badge?: string;
  now?: boolean;
  done?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  const tone = now
    ? 'bg-blue-600 text-white border-blue-600'
    : done
      ? 'border-success bg-success-100 text-success-700'
      : 'border-ink-200 bg-white text-ink-700 hover:bg-cream-50';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // 고른 조는 테두리를 두 겹으로 준다. 배경색은 이미 '지금·채점완료'가 쓰고 있어서,
      // 선택까지 배경으로 표시하면 세 가지 뜻이 한 색에 겹쳐 아무것도 안 읽힌다.
      className={`min-h-tap rounded-lg border px-2 py-1.5 text-left transition-colors ${tone} ${
        active ? 'ring-2 ring-blue-500 ring-offset-1' : ''
      }`}
    >
      <span className="flex items-baseline gap-1">
        <span className="font-mono text-[12px] font-bold">{label}</span>
        {badge ? (
          <span className={`rounded px-1 text-[10px] font-bold ${now ? 'bg-white/25' : 'bg-ink-900 text-white'}`}>{badge}</span>
        ) : null}
      </span>
      <span className={`block text-[10px] font-semibold ${now ? 'text-white/80' : done ? 'text-success-700' : 'text-ink-400'}`}>
        {sub}
      </span>
    </button>
  );
}

export function RecruitInterviewConsolePanel({ role }: { role: Role }) {
  const [cohorts, setCohorts] = useState<any[]>([]);
  // 기수 목록을 받아오는 동안 셀렉트에 표시한다(빈 드롭다운 = '기수 없음' 오해 방지).
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const { teams, loading: teamsLoading } = useTeams(selectedCohortId);
  const [applicants, setApplicants] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  const [slotInterviewersNames, setSlotInterviewersNames] = useState<Record<string, string[]>>({});
  // 면접 당일 화면이라 '지금 시간대'가 시계를 따라 움직여야 한다. 30초마다 갱신하면 충분하다
  // (슬롯이 10분 단위라 초 단위로 다시 그릴 이유가 없다).
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);

  const [myScore, setMyScore] = useState<string>(NO_SCORE);
  const [myComment, setMyComment] = useState<string>('');
  const [personalMemo, setPersonalMemo] = useState<string>('');
  const [memoState, setMemoState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savingScore, setSavingScore] = useState(false);
  const [message, setMessage] = useState('');

  // 메모 자동 저장은 예전에 키를 누를 때마다 POST 를 던졌다. 요청이 뒤섞여 도착하면 옛 내용이
  // 최신 내용을 덮어써서, 면접 도중 적은 메모가 되돌아갈 수 있었다. 잠깐 멈출 때 한 번만 보낸다.
  const memoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMemo = useRef<{ applicantId: string; content: string } | null>(null);
  const memoSeq = useRef(0);

  const QUICK_SCORES = ['5.0', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0', '9.5', '10.0'];

  const saveMemo = useCallback(async (applicantId: string, content: string) => {
    const seq = ++memoSeq.current;
    setMemoState('saving');
    try {
      const res = await fetch('/api/recruit/memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantId, content }),
      });
      // 나중에 보낸 요청이 이미 끝났다면 이 응답은 낡은 것이다 — 표시를 되돌리지 않는다.
      if (seq !== memoSeq.current) return;
      setMemoState(res.ok ? 'saved' : 'error');
    } catch {
      if (seq === memoSeq.current) setMemoState('error');
    }
  }, []);

  /** 대기 중인 메모를 지금 보낸다. 지원자를 바꾸거나 화면을 떠나도 마지막 타자가 사라지지 않게. */
  const flushMemo = useCallback(() => {
    if (memoTimer.current) {
      clearTimeout(memoTimer.current);
      memoTimer.current = null;
    }
    const pending = pendingMemo.current;
    pendingMemo.current = null;
    if (pending) void saveMemo(pending.applicantId, pending.content);
  }, [saveMemo]);

  const fetchData = useCallback(async () => {
    // 세 요청을 차례로 기다리면 점수를 저장할 때마다 화면이 1.5초씩 멈춘다.
    // 지원서 전문을 보여주는 화면이라 지원자는 slim 으로 받지 않는다.
    const [slotRes, appRes, scoreRes] = await Promise.all([
      fetch(`/api/recruit/slots?cohortId=${selectedCohortId}`),
      fetch(`/api/recruit/applicants?cohortId=${selectedCohortId}`),
      fetch(`/api/recruit/scores?cohortId=${selectedCohortId}`),
    ]);
    const [slotData, appData, scoreData] = await Promise.all([slotRes.json(), appRes.json(), scoreRes.json()]);

    if (slotData.slots) setSlots(slotData.slots);
    // 슬롯 머리에 "누가 보는 조인지"를 적으려면 면접관이 필요하다. 예전엔 이 응답을 버렸다.
    if (slotData.interviewersMap) {
      setSlotInterviewersNames(
        Object.fromEntries(
          Object.entries(slotData.interviewersMap as Record<string, { name: string }[]>).map(
            ([slotId, list]) => [slotId, (list ?? []).map((i) => i.name)]
          )
        )
      );
    }
    if (appData.applicants) {
      const interviewees = appData.applicants.filter((a: any) =>
        ['doc_pass', 'interview_done', 'interview_noshow', 'final_pass'].includes(a.status)
      );
      setApplicants(interviewees);
      // 보고 있던 지원자가 있으면 그대로 둔다. 갱신 함수로 넘겨야 selectedApplicantId 가
      // 이 함수의 의존성에서 빠지고, 지원자를 바꿀 때마다 전체를 다시 받는 일이 없다.
      if (interviewees.length > 0) {
        setSelectedApplicantId((prev) => prev || interviewees[0].id);
      }
    }

    if (scoreData.scores) setScores(scoreData.scores);
    if (scoreData.viewerUserId) setViewerUserId(scoreData.viewerUserId);
  }, [selectedCohortId]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetchCohorts();
    fetchStaff();
    // 화면을 떠날 때 아직 안 보낸 메모를 흘리지 않는다.
    return () => flushMemo();
  }, [flushMemo]);

  useEffect(() => {
    if (selectedCohortId) {
      fetchData();
    }
  }, [selectedCohortId, fetchData]);

  // 지원자를 바꿀 때 내 입력칸을 반드시 새로 맞춘다.
  // 예전엔 초기화가 없어서, A 에게 쓴 점수·총평이 그대로 남아 B 의 기록으로 저장될 수 있었다.
  // 이미 내가 채점한 지원자라면 그 값을 되살려, 덮어쓰는 줄 모르고 다시 매기는 일도 막는다.
  useEffect(() => {
    if (!selectedApplicantId) return;
    flushMemo();
    fetchPersonalMemo(selectedApplicantId);
    setMessage('');
    const mine = scores.find(
      (s) =>
        s.applicantId === selectedApplicantId &&
        s.stage === 'interview' &&
        s.scorerUserId === viewerUserId
    );
    setMyScore(mine ? parseFloat(mine.score).toFixed(1) : NO_SCORE);
    setMyComment(mine?.comment ?? '');
  }, [selectedApplicantId, viewerUserId, scores, flushMemo]);

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

  // 점수 기록에 이름을 붙이기 위한 운영진 명단(누가 몇 점을 줬는지 보이지 않으면 조율이 안 된다).
  const fetchStaff = async () => {
    const res = await fetch('/api/recruit/staff');
    const data = await res.json();
    if (Array.isArray(data.staff)) {
      setStaffNames(
        Object.fromEntries(data.staff.map((s: any) => [s.id, s.name as string])) as Record<string, string>
      );
    }
  };

  const fetchPersonalMemo = async (applicantId: string) => {
    const res = await fetch(`/api/recruit/memos?applicantId=${applicantId}`);
    const data = await res.json();
    setPersonalMemo(data.memo?.content ?? '');
    setMemoState('idle');
  };

  const handleMemoChange = (content: string) => {
    setPersonalMemo(content);
    if (!selectedApplicantId) return;
    // 어느 지원자에게 쓰던 메모인지 여기서 붙잡아 둔다 — 저장 직전에 지원자를 바꿔도 엉뚱한 곳에 안 붙는다.
    pendingMemo.current = { applicantId: selectedApplicantId, content };
    if (memoTimer.current) clearTimeout(memoTimer.current);
    memoTimer.current = setTimeout(flushMemo, 700);
  };

  // 점수를 고르지 않았으면 저장할 것이 없다. 서버도 빈 값을 400 으로 막지만(규칙 #6),
  // 버튼을 눌러 놓고 오류를 보는 것보다 애초에 못 누르게 하는 편이 면접 중에 덜 헷갈린다.
  const hasScore = myScore.trim() !== '';

  const handleSaveInterviewScore = async () => {
    if (!selectedApplicantId || !hasScore) return;
    setSavingScore(true);
    setMessage('');
    try {
      const res = await fetch('/api/recruit/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantId: selectedApplicantId,
          stage: 'interview',
          score: myScore,
          comment: myComment,
        }),
      });

      if (res.ok) {
        setMessage('✅ 면접 점수가 성공적으로 저장되었습니다 (상태 자동 전이).');
        await fetchData();
      } else {
        const data = await res.json();
        setMessage(`❌ 오류: ${data.message || data.error}`);
      }
    } finally {
      setSavingScore(false);
    }
  };

  const selectedApp = applicants.find((a) => a.id === selectedApplicantId);
  const selectedSlot = slots.find((s) => s.id === selectedApp?.slotId);
  const currentInterviewScores = scores.filter(
    (s) => s.applicantId === selectedApplicantId && s.stage === 'interview'
  );
  // 내 점수까지 "타 면접관"으로 섞여 있었다. 어느 게 내 기록인지 몰라 수정도 못 했다.
  const otherInterviewScores = currentInterviewScores.filter((s) => s.scorerUserId !== viewerUserId);
  const myExistingScore = currentInterviewScores.find((s) => s.scorerUserId === viewerUserId);

  // 면접 출결 — 면접관이 그 자리에서 본 사실을 그대로 남긴다.
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [attendanceError, setAttendanceError] = useState('');

  async function setAttendance(noshow: boolean): Promise<void> {
    if (!selectedApp) return;
    setAttendanceBusy(true);
    setAttendanceError('');
    try {
      const res = await fetch('/api/recruit/applicants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'attendance', id: selectedApp.id, cohortId: selectedCohortId, noshow }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAttendanceError(data.message ?? '출결을 저장하지 못했어요. 잠시 후 다시 눌러 주세요.');
        return;
      }
      await fetchData(); // 상태 딱지와 왼쪽 목록을 함께 갱신한다.
    } finally {
      setAttendanceBusy(false);
    }
  }

  const [selectedSlotFilter, setSelectedSlotFilter] = useState('ALL');
  const [selectedTeam, setSelectedTeam] = useState('ALL');

  const filteredApplicants = applicants.filter((app) => {
    if (selectedSlotFilter !== 'ALL' && app.slotId !== selectedSlotFilter) return false;
    return matchesTeamFilter(app, selectedTeam);
  });

  // 서류 심사와 같은 기준 — 목록만 보고 '내가 이 사람을 채점했는지' 알 수 있어야 한다.
  // 면접 당일에는 더 급하다: 다음 지원자가 들어오는데 앞사람 점수를 넣었는지 확인하러
  // 한 명씩 눌러 볼 시간이 없다.
  // 이 화면은 aggregations 를 받아오지 않는다. scores 에 기수 전체가 이미 들어 있으므로
  // 목록에 쓸 면접 평균은 여기서 바로 센다(요청을 늘리지 않는다).
  const myInterviewScores: Record<string, number> = {};
  const interviewScoresByApplicant: Record<string, number[]> = {};
  scores.forEach((s) => {
    if (s.stage !== 'interview') return;
    const v = parseFloat(s.score);
    (interviewScoresByApplicant[s.applicantId] ??= []).push(v);
    if (s.scorerUserId === viewerUserId) myInterviewScores[s.applicantId] = v;
  });
  const myScoredCount = filteredApplicants.filter((a) => myInterviewScores[a.id] !== undefined).length;

  // 같은 시각·같은 장소를 나눠 쓰는 조 번호(슬롯 필터가 쓴다).
  const panelNumbers = slotPanelNumbers(slots);

  // 한 슬롯에 여러 명이 함께 들어간다. 평면 목록이면 "지금 이 방에 누가 있는지"를
  // 한 명씩 눌러 봐야 알 수 있어, 슬롯(조) 단위로 묶어서 보여준다.
  //
  // 슬롯 필터를 **걸기 전** 상태로 한 번 묶는다. 위쪽 시간대 그리드는 이 값을 쓰는데,
  // 그리드가 곧 슬롯을 고르는 UI 라서 필터가 걸린 목록만 보면 다른 시간대로 옮겨갈 수가 없다.
  const teamApplicants = applicants.filter((app) => matchesTeamFilter(app, selectedTeam));
  const allScoredCount = teamApplicants.filter((a) => myInterviewScores[a.id] !== undefined).length;
  const slotOverview = groupApplicantsBySlot({
    slots,
    applicants: teamApplicants,
    interviewersBySlot: Object.fromEntries(
      slots.map((s) => [s.id, (slotInterviewersNames[s.id] ?? []) as string[]])
    ),
    panelNumbers,
    placeLabel: slotPlaceLabel,
    nowMs,
  });

  // 아래 목록은 고른 시간대만 편다(전체면 그대로).
  const groups =
    selectedSlotFilter === 'ALL' ? slotOverview : slotOverview.filter((g) => g.slotId === selectedSlotFilter);

  // ── 조 × 시간 표 ────────────────────────────────────────────────────────
  // 지난 기수 시간표가 이 모양이다: 조가 열(방 하나를 하루 종일 쓴다), 시각이 행.
  // 평면 목록이면 "지금 A조는 어디까지 했고 B조는 어디쯤인지"를 스크롤로 맞춰 봐야 한다.
  // 조 열 순서는 운영진 시간표 팝업과 **같은 규칙**을 쓴다(`panelOrder` 주석 참고 — 만든 순서).
  // 두 표가 다른 순서로 서면 같은 하루를 보면서도 열을 다시 맞춰 읽어야 한다.
  const panelNames = panelOrder(
    slots,
    (s) => (s.panel ?? '').trim(),
    (s) => s.createdAt
  );
  const rowTimes = [...new Set(slotOverview.map((g) => g.startsAtMs).filter((t): t is number => t !== null))].sort(
    (a, b) => a - b
  );
  // (조, 시각) → 그 칸의 슬롯. 조가 시간대를 비우면(첫 30분 면접실 정비 등) 칸이 없다.
  const cellAt = new Map<string, (typeof slotOverview)[number]>();
  for (const g of slotOverview) {
    if (g.startsAtMs === null || !g.panel) continue;
    cellAt.set(`${g.panel}|${g.startsAtMs}`, g);
  }
  const scoredIn = (g: (typeof slotOverview)[number]) =>
    g.applicants.filter((a: any) => myInterviewScores[a.id] !== undefined).length;

  const selectedGroup = groups.find((g) => g.applicants.some((a: any) => a.id === selectedApplicantId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-bold text-ink-900">4. 면접 당일 콘솔 (pc화면 전용, 면접 채점용)</h1>
            <HelpButton screen="recruit-console" />
          </div>
          <p className="mt-1 text-sm text-ink-500">동일 면접 슬롯에 입장한 지원자그룹을 선택하여 실시간 질문 메모 및 평가 점수를 부여합니다.</p>
        </div>

        {/* 다른 모집 화면과 같은 툴바 셀렉트로 맞춘다(높이·테두리 제각각이던 파란 상자를 걷어냈다).
            "슬롯" 셀렉트는 뺐다 — 왼쪽 시간대 그리드가 같은 상태(`selectedSlotFilter`)를 고르는데,
            같은 일을 하는 컨트롤이 둘이면 어느 쪽이 지금 값인지 눈으로 확인해야 한다.
            드롭다운은 열어야 보이고, 그리드는 하루 전체가 늘 보인다. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 채점하다 "내 다음 차례가 언제였지"를 여기서 바로 편다 — 배정 화면(회장단 전용)까지
              되돌아가야 볼 수 있으면 아무도 안 본다. */}
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
        screen="interview-console"
        cohortId={selectedCohortId}
        team={selectedTeam}
        title="면접 당일 운영진 공용 실시간 메모지"
      />

      {/* 이 화면만 PC 를 전제로 만든다(2026-08-05 사용자 확인: 면접 채점은 노트북으로만 한다).
          좁은 화면에서도 접혀서 동작은 하지만, 목록·채점·메모를 나란히 보는 배치를 잃어 쓰기 나쁘다.
          그래서 폰에서 채점 흐름을 따로 만드는 대신 **사실을 알려 주고** 그대로 둔다 —
          쓰지 않는 화면에 두 번째 레이아웃을 만들면 고칠 곳만 두 곳이 된다. */}
      <div className="rounded-xl bg-warning-100 px-3.5 py-3 text-[13px] leading-relaxed text-warning-700 lg:hidden">
        <strong className="block text-sm font-semibold">노트북에서 사용하세요</strong>
        이 화면은 지원자 목록과 채점표를 나란히 놓고 쓰도록 만들었습니다. 휴대폰에서는 세로로 접혀
        한 번에 하나씩만 보입니다.
      </div>

      {/* 2열 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 좌측 면접 순서 목록 */}
        <Card className="lg:col-span-4 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-cream-200 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-400">
              면접 대상자 ({filteredApplicants.length}명)
            </span>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
              내 채점 {myScoredCount}/{filteredApplicants.length}
            </span>
          </div>

          {/* 조 × 시간 표 — 지난 기수 시간표와 같은 모양으로 하루 전체를 펼쳐 놓고 고르게 한다.
              예전에는 슬롯 머리와 지원자 카드를 세로로 이어 붙이기만 해서, 시간대를 옮기려면
              스크롤로 훑어야 했다(슬롯 20개면 카드 60장 사이를 지나가야 한다).
              면접 당일에 필요한 동작은 "다음 칸으로 넘어가기" 하나인데 그게 가장 비쌌다.
              **스크롤 밖에 고정**해 둔다 — 목록을 내려도 표는 계속 보여야 고를 수 있다. */}
          {rowTimes.length > 0 && panelNames.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-ink-400">조 · 시간</span>
                <button
                  type="button"
                  onClick={() => setSelectedSlotFilter('ALL')}
                  aria-pressed={selectedSlotFilter === 'ALL'}
                  className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors ${
                    selectedSlotFilter === 'ALL'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-ink-200 bg-white text-ink-500 hover:bg-cream-50'
                  }`}
                >
                  전체 {allScoredCount}/{teamApplicants.length}
                </button>
              </div>
              {/* 조가 많으면 가로로 넘친다 — 표 안에서만 스크롤시킨다(페이지를 밀지 않는다). */}
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0.5 text-[10px]">
                  <thead>
                    <tr>
                      <th className="w-10" />
                      {panelNames.map((p) => (
                        <th key={p} className="truncate px-1 pb-0.5 text-[10px] font-bold text-ink-500" title={p}>
                          {p}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowTimes.map((t) => (
                      <tr key={t}>
                        <th className="pr-1 text-right font-mono text-[10px] font-semibold text-ink-400">
                          {formatTimeKo(t)}
                        </th>
                        {panelNames.map((p) => {
                          const g = cellAt.get(`${p}|${t}`);
                          // 그 조가 이 시간대를 비운 칸. 빗금 대신 옅은 바탕으로 "없음"만 알린다.
                          if (!g) return <td key={p} className="rounded bg-cream-50/60" />;
                          const scored = scoredIn(g);
                          const total = g.applicants.length;
                          const done = total > 0 && scored === total;
                          const active = selectedSlotFilter === g.slotId;
                          return (
                            <td key={p} className="p-0">
                              <button
                                type="button"
                                onClick={() => setSelectedSlotFilter(g.slotId!)}
                                aria-pressed={active}
                                aria-label={`${p} ${formatTimeKo(t)} 지원자 ${total}명 중 내 채점 ${scored}명`}
                                className={`w-full rounded border px-1 py-1.5 font-bold transition-colors ${
                                  g.isNow
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : done
                                      ? 'border-success bg-success-100 text-success-700'
                                      : total === 0
                                        ? 'border-ink-100 bg-white text-ink-300'
                                        : 'border-ink-200 bg-white text-ink-700 hover:bg-cream-50'
                                } ${active ? 'ring-2 ring-blue-500' : ''}`}
                              >
                                {total === 0 ? '—' : `${scored}/${total}`}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 조가 아직 없는 옛 기수(0026 이전 슬롯)는 표를 만들 수 없다 — 시간대 칩으로 내려간다. */}
          {panelNames.length === 0 && slotOverview.some((g) => g.slotId !== null) && (
            <div className="space-y-1.5">
              <span className="block text-[11px] font-bold text-ink-400">시간대</span>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                <SlotChip
                  label="전체"
                  sub={`${allScoredCount}/${teamApplicants.length}`}
                  done={teamApplicants.length > 0 && allScoredCount === teamApplicants.length}
                  active={selectedSlotFilter === 'ALL'}
                  onClick={() => setSelectedSlotFilter('ALL')}
                />
                {slotOverview
                  .filter((g) => g.slotId !== null)
                  .map((g) => (
                    <SlotChip
                      key={g.slotId}
                      label={g.startsAtMs !== null ? formatTimeKo(g.startsAtMs) : '시각 없음'}
                      sub={g.applicants.length === 0 ? '없음' : `${scoredIn(g)}/${g.applicants.length}`}
                      done={g.applicants.length > 0 && scoredIn(g) === g.applicants.length}
                      now={g.isNow}
                      active={selectedSlotFilter === g.slotId}
                      onClick={() => setSelectedSlotFilter(g.slotId!)}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* 목록만 스크롤한다(위 시간대 그리드는 따라 내려가지 않는다). */}
          <div className="max-h-[560px] space-y-4 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.slotId ?? 'unassigned'} className="space-y-2">
                {/* 슬롯 머리 — 이 시간에 어느 방에서 누가 보는 조인지. 같이 들어가는 사람이 아래에 모여 있다. */}
                <div
                  className={`flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] ${
                    group.isNow ? 'bg-blue-600 text-white' : 'bg-cream-100 text-ink-700'
                  }`}
                >
                  <span className="font-mono font-bold">
                    {group.startsAtMs !== null
                      ? formatTimeRange(group.startsAtMs, group.durationMin ?? 30)
                      : '슬롯 미배정'}
                  </span>
                  {group.placeLabel && <span className="font-semibold">{group.placeLabel}</span>}
                  {group.panel && (
                    <span
                      className={`rounded px-1.5 py-0.5 font-bold ${
                        group.isNow ? 'bg-white/25' : 'bg-ink-900 text-white'
                      }`}
                    >
                      {group.panel}
                    </span>
                  )}
                  {group.isNow && <span className="font-bold">지금</span>}
                  <span className={`ml-auto ${group.isNow ? 'text-white/80' : 'text-ink-500'}`}>
                    {group.interviewers.length > 0 ? `면접관 ${group.interviewers.join('·')}` : '면접관 미정'}
                    {' · '}
                    {group.applicants.length}명
                  </span>
                </div>

                {group.applicants.length === 0 && (
                  <p className="pl-1 text-[11px] text-ink-400">이 시간대에 배정된 지원자가 없습니다.</p>
                )}

                {group.applicants.map((app) => {
              const isSelected = app.id === selectedApplicantId;
              const effectiveTeam = app.assignedTeam || app.wishTeam1 || '팀미지정';
              const myScore = myInterviewScores[app.id];
              const mine = interviewScoresByApplicant[app.id] ?? [];
              const intAvg = formatScore(
                mine.length > 0 ? Math.round((mine.reduce((a, b) => a + b, 0) / mine.length) * 10) / 10 : null
              );

              return (
                <div
                  key={app.id}
                  onClick={() => setSelectedApplicantId(app.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-400'
                      : 'border-ink-200 bg-white hover:border-blue-300 hover:bg-cream-25'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-ink-900 flex items-center gap-1.5">
                      {app.name}
                      <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                        {effectiveTeam}
                      </span>
                    </span>
                    {/* 시각·장소는 슬롯 머리에 한 번만 적는다 — 줄마다 되풀이하면 정작
                        이름과 채점 여부가 묻힌다. */}
                  </div>
                  <div className="flex items-center justify-between text-xs text-ink-500 mt-1.5">
                    <span>{app.school}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        BADGE_TONE_CLASS[recruitStatusBadge(app.status).tone]
                      }`}
                    >
                      {recruitStatusBadge(app.status).label}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span
                      className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold ${
                        myScore !== undefined ? 'bg-blue-600 text-white' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {myScore !== undefined ? `내 ${myScore.toFixed(1)}점` : '내 채점 전'}
                    </span>
                    <span className="text-[11px] text-ink-400">
                      {intAvg !== null ? `전체 평균 ${intAvg}점 · ${mine.length}명` : '채점한 면접관 없음'}
                    </span>
                  </div>
                </div>
              );
                })}
              </div>
            ))}
          </div>
        </Card>

        {/* 우측 실시간 면접 콘솔 */}
        <div className="lg:col-span-8 space-y-6">
          {selectedApp ? (
            <Card className="space-y-6 p-6">
              {/* 면접 대상자 헤더 */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-cream-200 pb-5">
                <div>
                  <h2 className="text-2xl font-bold text-ink-900">{selectedApp.name}</h2>
                  <p className="text-xs text-ink-500 mt-1 font-medium">
                    {selectedApp.school} {selectedApp.department} · 연락처: {formatPhone(selectedApp.phone)}
                  </p>
                </div>

                <div className="text-right space-y-1">
                  {selectedSlot && (
                    <div className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                      <span>
                        면접 시각: {new Date(selectedSlot.startsAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} ({selectedSlot.durationMin}분)
                      </span>
                    </div>
                  )}
                  {selectedApp.interviewLink && (
                    <div>
                      <a
                        href={selectedApp.interviewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 font-semibold underline hover:text-blue-700"
                      >
                        면접 접속 URL 열기
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* 면접 출결 — 오지 않은 사람은 면접관이 여기서 표시한다. 점수를 매길 수 없는 사람을
                  그냥 비워 두면 나중에 "채점을 안 한 것"과 구분되지 않는다.
                  잘못 눌러도 바로 되돌릴 수 있어서 확인 팝업은 두지 않는다(결정 33 은 되돌릴 수 없는 것에만). */}
              <div className="-mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-cream-50 px-3 py-2">
                <span className="text-[11px] font-bold text-ink-500">면접 출결</span>
                {selectedApp.status === 'interview_noshow' ? (
                  <>
                    <span className="rounded-md bg-coral-100 px-2 py-0.5 text-xs font-bold text-coral-700">
                      면접 불참
                    </span>
                    <button
                      type="button"
                      onClick={() => void setAttendance(false)}
                      disabled={attendanceBusy}
                      className="min-h-tap rounded-lg border border-ink-200 bg-white px-2.5 text-xs font-bold text-ink-700 hover:bg-cream-100 disabled:opacity-50"
                    >
                      {attendanceBusy ? '저장 중…' : '왔어요(되돌리기)'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void setAttendance(true)}
                    disabled={attendanceBusy}
                    className="min-h-tap rounded-lg border border-coral-300 bg-white px-2.5 text-xs font-bold text-coral-700 hover:bg-coral-50 disabled:opacity-50"
                  >
                    {attendanceBusy ? '저장 중…' : '면접에 안 왔어요'}
                  </button>
                )}
                {attendanceError ? (
                  <span className="text-[11px] font-medium text-error" role="alert">
                    {attendanceError}
                  </span>
                ) : null}
              </div>

              {/* 같은 조에 함께 들어온 사람들. 한 방에서 여러 명을 동시에 보므로, 채점하다
                  옆 사람으로 바로 넘어갈 수 있어야 한다(왼쪽 목록까지 갈 필요 없이). */}
              {selectedGroup && selectedGroup.applicants.length > 1 && (
                <div className="-mt-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-cream-50 px-3 py-2">
                  <span className="text-[11px] font-bold text-ink-500">같은 조 ({selectedGroup.applicants.length}명)</span>
                  {selectedGroup.applicants.map((a: any) => {
                    const done = myInterviewScores[a.id] !== undefined;
                    const active = a.id === selectedApplicantId;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setSelectedApplicantId(a.id)}
                        className={`min-h-tap rounded-lg px-2.5 text-xs font-bold transition-colors ${
                          active
                            ? 'bg-blue-600 text-white'
                            : done
                            ? 'bg-white text-ink-700 border border-ink-200 hover:bg-cream-100'
                            : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                        }`}
                        title={done ? '내 채점 완료' : '내 채점 전'}
                      >
                        {a.name}
                        {done ? ' ✓' : ''}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 지원서 핵심 보기 */}
              {/* 면접 중에는 점수 입력칸이 화면 밖으로 밀리면 안 된다 — 길면 접어 두고 펼쳐 본다. */}
              <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                <EssayBlock label="자기소개" text={selectedApp.essayIntro} collapsible collapsedHeight={180} />
                <EssayBlock label="가치관 및 계기" text={selectedApp.essayValues} collapsible collapsedHeight={180} />
              </div>

              {/* 내 개인 실시간 메모 카드 */}
              <div className="rounded-xl border border-cream-200 bg-cream-50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-ink-900">내 개인 질문/관찰 실시간 메모</h3>
                  {memoState === 'saving' && <span className="text-[11px] font-semibold text-ink-500">자동 저장 중…</span>}
                  {memoState === 'saved' && <span className="text-[11px] font-semibold text-ink-500">자동 저장됨</span>}
                  {/* 저장 실패를 알려주지 않으면 면접이 끝난 뒤에야 메모가 없다는 걸 안다. */}
                  {memoState === 'error' && (
                    <span className="text-[11px] font-semibold text-error" role="alert">
                      저장 실패 — 내용을 복사해 두세요
                    </span>
                  )}
                </div>
                <AutoGrowTextarea
                  minRows={4}
                  placeholder="면접 진행 중 관찰한 답변 태도, 답변 내용, 질문 기록 (입력 시 자동 저장)..."
                  value={personalMemo}
                  onChange={(e) => handleMemoChange(e.target.value)}
                  onBlur={flushMemo}
                  aria-label="내 개인 질문/관찰 실시간 메모"
                />
              </div>

              {/* 면접 점수 입력 카드 */}
              <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/70 via-cream-50 to-blue-50/70 p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink-900">
                    내 면접 점수 심사
                    {myExistingScore && (
                      <span className="ml-2 text-xs font-semibold text-ink-500">
                        (이미 {parseFloat(myExistingScore.score).toFixed(1)}점 매김 — 저장하면 덮어씁니다)
                      </span>
                    )}
                  </h3>
                  <span className="text-xs text-blue-700 font-semibold">0.0 ~ 10.0점 (0.5 단위)</span>
                </div>

                {/* 퀵 버튼은 5.0 부터라 낮은 점수를 아예 줄 수 없었다 — 직접 입력칸을 둔다. */}
                <div className="flex flex-wrap items-end gap-4">
                  <div className="w-32">
                    <Field label="점수 직접 입력">
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        placeholder="미입력"
                        value={myScore}
                        onChange={(e) => setMyScore(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-ink-500">자주 쓰는 점수:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_SCORES.map((scoreVal) => (
                        <button
                          key={scoreVal}
                          type="button"
                          onClick={() => setMyScore(scoreVal)}
                          aria-pressed={myScore === scoreVal}
                          className={`min-h-tap rounded-lg px-2.5 text-xs font-bold transition-colors ${
                            myScore === scoreVal
                              ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400'
                              : 'bg-white text-ink-700 border border-ink-200 hover:bg-cream-100'
                          }`}
                        >
                          {scoreVal}점
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {/* 총평은 여러 줄로 쓰는 값이다 — 한 줄 입력칸이라 줄바꿈이 안 됐다. */}
                  <Field label="면접 평가 총평 코멘트">
                    <AutoGrowTextarea
                      minRows={3}
                      placeholder="면접관 종합 평가 총평 코멘트..."
                      value={myComment}
                      onChange={(e) => setMyComment(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="flex items-center justify-between pt-1">
                  {message ? (
                    <StatusMessage text={message} />
                  ) : !hasScore ? (
                    <span className="text-xs text-ink-500">점수를 입력하거나 아래 버튼에서 골라 주세요.</span>
                  ) : (
                    <span />
                  )}
                  <Button
                    type="button"
                    disabled={savingScore || !hasScore}
                    onClick={handleSaveInterviewScore}
                  >
                    {savingScore ? '저장 중…' : '면접 점수 저장 (상태 전이)'}
                  </Button>
                </div>
              </div>

              {/* 다른 면접관 기록 */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">
                  타 면접관 점수 기록 ({otherInterviewScores.length}건)
                </h3>
                {otherInterviewScores.length > 0 ? (
                  <div className="space-y-2">
                    {otherInterviewScores.map((s) => (
                      <div key={s.id} className="rounded-xl border border-cream-200 bg-white p-3 text-xs shadow-card">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-baseline gap-2">
                            <span className="font-bold text-blue-700 text-sm">{parseFloat(s.score).toFixed(1)}점</span>
                            {/* 누가 준 점수인지 없으면 조율도 정정도 못 한다. */}
                            <span className="font-semibold text-ink-700">
                              {staffNames[s.scorerUserId] || '이름 미상'}
                            </span>
                          </span>
                          <span className="text-[11px] text-ink-400 font-mono">
                            {new Date(s.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {s.comment && (
                          <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-ink-700">{s.comment}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-400">다른 면접관이 등록한 점수가 없습니다.</p>
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-12 text-center text-ink-400">
              좌측 목록에서 면접을 진행할 대상을 선택하세요.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
