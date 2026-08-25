'use client';

import { HelpButton } from '@/components/help-button';
import type { Role } from '@/auth/permissions';
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { Button, Card, Field, Input, StatusMessage, ToolbarSelect } from '@/components/ui';

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

/**
 * 지원자 정보 한 칸(라벨 위, 값 아래).
 *
 * 예전에는 학교·학과·연락처를 가운뎃점으로 이어 붙인 한 줄이었다. 면접 중에 "생년월일이 뭐였지"를
 * 눈으로 찾아야 했고, 라벨이 없어 값만 보고는 무엇인지 알기 어려웠다. 값마다 이름을 붙여 세운다.
 */
function Fact({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string | null | undefined;
  /** 칸 폭(그리드 span). 값 길이가 제각각이라 칸마다 다르게 준다. */
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[12px] font-semibold text-ink-400">{label}</dt>
      {/*
        예전에는 `truncate`(한 줄 + …)였다. 33기 실측으로 **203명 중 104명의 학교·학과가 잘려 있었다**
        — 칸이 148px 인데 15자면 185px 이 필요했다. 화면을 넓혀도 본문이 max-width 로 묶여 있어
        1920px 에서도 칸은 153px 이라 똑같이 잘렸다(노트북만의 문제가 아니었다).

        `line-clamp-4` 는 **최대치일 뿐**이라 짧은 값의 높이는 그대로다(203명 중 201명이 1~2줄).
        한글은 어절 사이 공백이 드물어 학교 이름 하나가 이미 두 줄을 먹는다 — 그래서 33기 최대
        54자를 담으려면 4줄이 필요했다(3줄로는 46자에서 이미 넘쳤다). 지망 칸도 같은 규칙을 쓰는데
        줄임 후 최대가 16자(“2순위 팀 배치 희망하지 않음”)라 2줄이면 끝난다.
        clamp 를 아예 빼지 않는 이유는, 누가 문장을 적어 넣었을 때 머리글이 밀려나지 않게 하는
        방어선은 남겨 두기 위해서다.
      */}
      <dd className="line-clamp-4 break-words text-[15px] font-semibold text-ink-900" title={value ?? undefined}>
        {value?.trim() ? value : <span className="font-medium text-ink-300">미기재</span>}
      </dd>
    </div>
  );
}

export function RecruitInterviewConsolePanel({ role, canEditNotice }: { role: Role; canEditNotice: boolean }) {
  const [cohorts, setCohorts] = useState<any[]>([]);
  // 기수 목록을 받아오는 동안 셀렉트에 표시한다(빈 드롭다운 = '기수 없음' 오해 방지).
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState('');
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

  /**
   * 점수만 다시 받는다. 면접 점수를 저장하면 지원자 상태도 바뀌지만, 그 값은 저장 응답이
   * 그대로 돌려주므로(`applicantStatus`) 명단을 통째로 다시 받을 이유가 없다.
   *
   * 예전에는 저장할 때마다 슬롯·명단·점수 셋을 전부 다시 받았다. 명단에는 자기소개서 전문이
   * 들어 있어 203명 기수에서는 한 명 채점할 때마다 수백 KB 가 오갔다 — 면접 당일에 그 지연이
   * 그대로 손에 걸린다.
   */
  const refreshScores = useCallback(async () => {
    const res = await fetch(`/api/recruit/scores?cohortId=${selectedCohortId}`);
    const data = await res.json();
    if (data.scores) setScores(data.scores);
    if (data.viewerUserId) setViewerUserId(data.viewerUserId);
  }, [selectedCohortId]);

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
      // **처음 들어왔을 때 아무도 고르지 않는다.** 예전에는 기수의 첫 사람을 자동으로 골라
      // 오른쪽에 펴 놨는데, 이제 왼쪽 목록은 시간대를 고르기 전까지 비어 있으므로 목록에 없는
      // 사람이 오른쪽에 떠 있는 꼴이 된다. 시간대를 누르면 `pickSlot` 이 그 조의 첫 사람을 고른다.
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

  // 지원자를 바꿀 때만 하는 일 — 메모를 넘기고 새 지원자의 메모를 읽고, 안내 문구를 지운다.
  //
  // ⚠ 이 셋을 아래 점수 복원 효과와 한 덩어리로 두면 **점수를 저장할 때마다** 함께 돈다
  // (저장 → fetchData → scores 가 새 배열). 그래서 "저장했습니다" 안내가 뜨자마자 지워져
  // 면접관은 저장이 됐는지 알 수 없었고, 메모도 방금 보낸 저장과 경쟁하며 다시 읽혔다.
  useEffect(() => {
    if (!selectedApplicantId) return;
    flushMemo();
    fetchPersonalMemo(selectedApplicantId);
    setMessage('');
  }, [selectedApplicantId, flushMemo]);

  // 내 점수·총평 입력칸을 지금 지원자의 저장된 값으로 맞춘다.
  // 예전엔 초기화가 없어서, A 에게 쓴 점수·총평이 그대로 남아 B 의 기록으로 저장될 수 있었다.
  // 이미 내가 채점한 지원자라면 그 값을 되살려, 덮어쓰는 줄 모르고 다시 매기는 일도 막는다.
  useEffect(() => {
    if (!selectedApplicantId) return;
    const mine = scores.find(
      (s) =>
        s.applicantId === selectedApplicantId &&
        s.stage === 'interview' &&
        s.scorerUserId === viewerUserId
    );
    setMyScore(mine ? parseFloat(mine.score).toFixed(1) : NO_SCORE);
    setMyComment(mine?.comment ?? '');
  }, [selectedApplicantId, viewerUserId, scores]);

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
    const applicantId = selectedApplicantId;
    setSavingScore(true);
    setMessage('');
    try {
      const res = await fetch('/api/recruit/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantId,
          stage: 'interview',
          score: myScore,
          comment: myComment,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setMessage('✅ 면접 점수를 저장했습니다. 상태가 면접 완료로 바뀝니다.');
        // 상태 딱지는 서버가 돌려준 값으로 그 자리에서 고친다(명단을 다시 받지 않는다).
        if (data.applicantStatus) {
          setApplicants((prev) =>
            prev.map((a) => (a.id === applicantId ? { ...a, status: data.applicantStatus } : a))
          );
        }
        await refreshScores();
      } else {
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
  // 서류 채점 기록 — 면접관이 "서류에서 무엇을 보고 이 사람을 넘겼는지" 알고 들어간다.
  // 서류에서 "이건 면접 때 물어보자"고 적어 둔 것이 면접에 닿지 않는 것이 더 큰 손해라고 봤다
  // (선입견 우려는 짚었고, 사용자가 항상 보이는 쪽으로 정했다 — 2026-08-20).
  // 이 화면은 이미 기수 전체 점수를 받아 두고 stage 로 걸러 쓰기만 했다. 요청이 늘지 않는다.
  const documentScores = scores.filter(
    (s) => s.applicantId === selectedApplicantId && s.stage === 'document'
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

  /**
   * `NONE` = 아직 아무 칸도 고르지 않은 처음 상태. 이때는 **아무도 뜨지 않는다**.
   *
   * 예전 기본값은 `ALL` 이라 화면을 열자마자 기수 전원(33기 기준 182명)이 조별로 쭉 이어졌다.
   * 면접 당일에 필요한 것은 "지금 이 칸에 들어온 사람"인데, 그러려면 긴 목록에서 자기 조를 찾아
   * 내려가야 했다 — 고르는 표를 위에 두고도 목록이 이미 전부를 펴고 있으니 표가 할 일이 없었다.
   * `ALL` 은 위 `전체 보기` 버튼으로 **일부러 고를 때만** 들어온다.
   */
  const [selectedSlotFilter, setSelectedSlotFilter] = useState('NONE');
  const slotPicked = selectedSlotFilter !== 'NONE';

  const filteredApplicants = applicants.filter((app) => {
    if (!slotPicked) return false;
    if (selectedSlotFilter !== 'ALL' && app.slotId !== selectedSlotFilter) return false;
    return true;
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
  const teamApplicants = applicants;
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

  // 아래 목록은 고른 시간대만 편다. 고르기 전(`NONE`)에는 아무것도 펴지 않는다.
  const groups = !slotPicked
    ? []
    : selectedSlotFilter === 'ALL'
      ? slotOverview
      : slotOverview.filter((g) => g.slotId === selectedSlotFilter);

  /**
   * 시간대를 고르면 **그 조의 첫 사람까지** 골라 준다.
   *
   * 필터만 바꾸면 오른쪽 채점 시트는 아까 보던 다른 조의 사람에 그대로 머문다 — 슬롯을 눌러도
   * 아무 일도 일어나지 않은 것처럼 보인다. 조가 하나뿐이던 때는 필터와 선택이 늘 같은 사람을
   * 가리켜 드러나지 않았고, 조를 나눈 기수에서 처음 보였다.
   */
  const pickSlot = (slotId: string) => {
    setSelectedSlotFilter(slotId);
    const g = slotOverview.find((x) => x.slotId === slotId);
    // 이미 그 조의 사람을 보고 있으면 그대로 둔다 — 채점하다 화면이 첫 사람으로 튀면 안 된다.
    if (!g || g.applicants.some((a: any) => a.id === selectedApplicantId)) return;
    const first = g.applicants[0] as { id: string } | undefined;
    if (first) setSelectedApplicantId(first.id);
  };

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
            <h1 className="text-[24px] font-bold text-ink-900">4. 면접 당일 콘솔</h1>
            <HelpButton screen="recruit-console" />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            같은 조에 들어온 지원자를 골라 메모하고 점수를 매깁니다. 노트북에서 쓰는 화면입니다.
          </p>
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

      <RecruitNav role={role} canEditNotice={canEditNotice} />

      <ScreenNotes
        screen="interview-console"
        cohortId={selectedCohortId}
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
        {/* 우패널(지원서·점수 입력)을 읽으려고 내리면 이 목록이 같이 밀려 올라갔다. 면접 당일에는
            다음 사람을 계속 눌러야 해서 그 왕복이 특히 잦다. 바깥 그리드가 `items-start` 라 그대로 먹는다.
            **카드 전체를 스크롤 상자로 만들지 않는다** — 그러면 위 시간대 그리드까지 같이 스크롤돼
            "목록만 스크롤한다"는 아래 의도가 깨진다. 대신 카드를 뷰포트 높이로 묶고
            목록이 `flex-1 min-h-0` 으로 남은 자리를 쓴다(결정 111 과 같은 방식). */}
        <Card className="lg:col-span-4 p-4 space-y-3 lg:sticky lg:top-6 lg:flex lg:flex-col lg:max-h-[calc(100vh-3rem)] lg:overflow-hidden">
          {/* 머리 숫자는 **기수 전체**다. 예전에는 고른 칸의 숫자였는데, 칸을 고르기 전에는 0/0 이
              되어 "면접 대상자 0명"으로 읽힌다. 칸별 진척은 아래 표의 칸마다 이미 적혀 있다. */}
          <div className="flex items-center justify-between border-b border-cream-200 pb-2.5">
            {/* 한글에 uppercase·tracking-wider 를 걸면 자간만 벌어져 오히려 읽기 나쁘다. */}
            <span className="text-[13px] font-bold text-ink-500">
              면접 대상자 {teamApplicants.length}명
            </span>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[12px] font-bold text-blue-700">
              내 채점 {allScoredCount}/{teamApplicants.length}
            </span>
          </div>

          {/* 조 × 시간 표 — 지난 기수 시간표와 같은 모양으로 하루 전체를 펼쳐 놓고 고르게 한다.
              예전에는 슬롯 머리와 지원자 카드를 세로로 이어 붙이기만 해서, 시간대를 옮기려면
              스크롤로 훑어야 했다(슬롯 20개면 카드 60장 사이를 지나가야 한다).
              면접 당일에 필요한 동작은 "다음 칸으로 넘어가기" 하나인데 그게 가장 비쌌다.
              **스크롤 밖에 고정**해 둔다 — 목록을 내려도 표는 계속 보여야 고를 수 있다. */}
          {rowTimes.length > 0 && panelNames.length > 0 && (
            /* **고르는 곳**이라는 것이 보이게 상자로 묶는다. 예전에는 표와 아래 목록이 같은
               흰 바탕에 이어 붙어 있어서, 표가 '고르는 컨트롤'인지 '위쪽 요약'인지 알 수 없었다. */
            <div className="space-y-1.5 rounded-xl border border-ink-200 bg-cream-25 p-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center text-[12px] font-bold text-ink-700"><span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink-900 text-[10px] font-bold text-white">1</span>볼 시간대를 고르세요</span>
                <button
                  type="button"
                  onClick={() => setSelectedSlotFilter('ALL')}
                  aria-pressed={selectedSlotFilter === 'ALL'}
                  className={`rounded-lg border px-2 py-1 text-[12px] font-bold transition-colors ${
                    selectedSlotFilter === 'ALL'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-ink-200 bg-white text-ink-500 hover:bg-cream-50'
                  }`}
                >
                  전체 보기
                </button>
              </div>
              {/* 조가 많으면 가로로, 시간대가 많으면 세로로 넘친다 — **둘 다 표 안에서만** 스크롤시킨다.
                  세로를 묶지 않으면 33기(16시간대 × 4조 ≈ 420px)처럼 표가 길어졌을 때 카드의
                  남은 높이를 이 표가 다 먹고, 아래 지원자 목록이 몇 줄로 찌부러진다.
                  노트북 세로 해상도(768px → 뷰포트 ~640px)에서 실제로 그렇게 보인다.
                  `w-full min-w-max` — 좁으면 제 너비를 지켜 가로 스크롤하고, 넓으면 칸을 채운다.
                  `w-full` 만 있으면 조가 늘어날수록 칸이 눌려 '5/5' 가 두 줄로 접힌다. */}
              <div className="max-h-[34vh] overflow-auto lg:max-h-[38vh]">
                <table className="w-full min-w-max border-separate border-spacing-0.5 text-[11px]">
                  <thead>
                    <tr>
                      <th className="w-11" />
                      {panelNames.map((p) => (
                        <th key={p} className="truncate px-1 pb-0.5 text-[11px] font-bold text-ink-500" title={p}>
                          {p}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowTimes.map((t) => (
                      <tr key={t}>
                        <th className="pr-1 text-right font-mono text-[11px] font-semibold text-ink-500">
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
                                onClick={() => pickSlot(g.slotId!)}
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
            <div className="space-y-1.5 rounded-xl border border-ink-200 bg-cream-25 p-2.5">
              <span className="flex items-center text-[12px] font-bold text-ink-700"><span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink-900 text-[10px] font-bold text-white">1</span>볼 시간대를 고르세요</span>
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
                      onClick={() => pickSlot(g.slotId!)}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* 목록만 스크롤한다(위 시간대 그리드는 따라 내려가지 않는다).
              `lg:min-h-[220px]` 가 **바닥**이다 — 위 표가 길어도 목록이 두어 줄로 찌부러지지 않는다.
              옛 `min-h-0` 은 "얼마든지 줄어도 된다"는 뜻이라, 화면이 짧은 노트북에서 정확히 그렇게 됐다.
              카드가 뷰포트를 넘기면 표 쪽이 먼저 스크롤을 맡는다(위 max-h). */}
          <div className="flex items-baseline justify-between pt-0.5">
            <span className="flex items-center text-[12px] font-bold text-ink-700"><span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink-900 text-[10px] font-bold text-white">2</span>지원자를 고르세요</span>
            {slotPicked && (
              <span className="text-[11px] font-semibold text-ink-400">
                {filteredApplicants.length}명 · 내 채점 {myScoredCount}
              </span>
            )}
          </div>

          <div className="max-h-[560px] space-y-4 overflow-y-auto lg:max-h-none lg:flex-1 lg:min-h-[220px]">
            {/* 고르기 전에는 비워 둔다 — 전원을 미리 펴 두면 위 표가 할 일이 없어진다. */}
            {!slotPicked && (
              <p className="rounded-xl border border-dashed border-ink-200 px-3 py-8 text-center text-[12px] leading-relaxed text-ink-400">
                위 표에서 시간대를 누르면
                <br />그 조의 지원자가 여기 나옵니다.
              </p>
            )}
            {groups.map((group) => (
              <div key={group.slotId ?? 'unassigned'} className="space-y-2">
                {/* 슬롯 머리 — 이 시간에 어느 방에서 누가 보는 조인지. 같이 들어가는 사람이 아래에 모여 있다. */}
                <div
                  className={`flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] ${
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
                  {/* 시각·장소는 슬롯 머리에 한 번만 적는다 — 줄마다 되풀이하면 정작
                      이름과 채점 여부가 묻힌다. 대신 '내 채점 여부'를 이름과 같은 줄로 올린다:
                      다음 지원자가 들어오는 중에 훑는 값이 바로 이것이다. */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[15px] font-bold text-ink-900">{app.name}</span>
                      <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-800">
                        {effectiveTeam}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-bold ${
                        myScore !== undefined ? 'bg-blue-600 text-white' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {myScore !== undefined ? `내 ${myScore.toFixed(1)}점` : '내 채점 전'}
                    </span>
                  </div>
                  {/* 2지망은 예전에 이 화면 어디에도 없었다 — 팀 배치를 의논하려면 함께 보여야 한다. */}
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-ink-500">
                    <span className="truncate">
                      1지망 {app.wishTeam1 || '-'} · 2지망 {app.wishTeam2 || '-'}
                    </span>
                    {/* 이 목록은 전원이 '서류 합격'이라 그 딱지는 모든 줄에 똑같이 붙어 아무 뜻이 없었다.
                        면접 완료·불참처럼 **달라진 것**만 딱지로 남긴다. */}
                    {app.status !== 'doc_pass' && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          BADGE_TONE_CLASS[recruitStatusBadge(app.status).tone]
                        }`}
                      >
                        {recruitStatusBadge(app.status).label}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[12px] text-ink-400">
                    <span className="truncate">{app.school}</span>
                    <span className="shrink-0">
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
              {/* 면접 대상자 헤더 — 면접 중에 확인하는 사실을 라벨과 함께 한 곳에 모은다. */}
              <div className="space-y-4 border-b border-cream-200 pb-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-bold text-ink-900">{selectedApp.name}</h2>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${
                        BADGE_TONE_CLASS[recruitStatusBadge(selectedApp.status).tone]
                      }`}
                    >
                      {recruitStatusBadge(selectedApp.status).label}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedSlot && (
                      <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-[13px] font-bold text-blue-700">
                        면접{' '}
                        {new Date(selectedSlot.startsAt).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {selectedSlot.durationMin}분
                      </span>
                    )}
                    {selectedApp.interviewLink && (
                      <a
                        href={selectedApp.interviewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-blue-200 px-3 py-1.5 text-[13px] font-bold text-blue-700 no-underline hover:bg-blue-50"
                      >
                        면접 링크 열기 ↗
                      </a>
                    )}
                  </div>
                </div>

                {/* 1·2지망과 생년월일은 예전에 이 화면 어디에도 없어서 지원서를 따로 열어야 했다. */}
                {/* 칸 폭을 값 길이에 맞춰 나눈다. 다섯을 똑같이 나누면(옛 `grid-cols-5`)
                    학교·학과만 늘 모자라고 생년월일·연락처는 남는다 — 33기 실측 기준
                    학교·학과 평균 13자·최대 54자, 나머지는 길이가 고정에 가깝다. */}
                <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-12">
                  <Fact
                    label="학교·학과"
                    value={[selectedApp.school, selectedApp.department].filter(Boolean).join(' ')}
                    className="col-span-2 sm:col-span-6 lg:col-span-4"
                  />
                  <Fact label="생년월일" value={selectedApp.birthDate} className="sm:col-span-3 lg:col-span-2" />
                  <Fact label="연락처" value={formatPhone(selectedApp.phone)} className="sm:col-span-3 lg:col-span-2" />
                  <Fact label="1지망" value={selectedApp.wishTeam1} className="sm:col-span-3 lg:col-span-2" />
                  <Fact label="2지망" value={selectedApp.wishTeam2} className="sm:col-span-3 lg:col-span-2" />
                </dl>
              </div>

              {/* 면접 출결 — 오지 않은 사람은 면접관이 여기서 표시한다. 점수를 매길 수 없는 사람을
                  그냥 비워 두면 나중에 "채점을 안 한 것"과 구분되지 않는다.
                  잘못 눌러도 바로 되돌릴 수 있어서 확인 팝업은 두지 않는다(결정 33 은 되돌릴 수 없는 것에만). */}
              {/* 조 이동과 출결을 한 줄에 둔다. 같은 모양의 띠 두 개가 위아래로 붙어 있으면
                  둘 다 그냥 배경으로 보인다 — 왼쪽은 '누구를 볼까', 오른쪽은 '왔는가'로 나눈다.
                  같은 조: 한 방에서 여러 명을 동시에 보므로 왼쪽 목록까지 가지 않고 옆 사람으로 넘어간다.
                  출결: 잘못 눌러도 바로 되돌릴 수 있어 확인 팝업은 두지 않는다(결정 33 은 되돌릴 수 없는 것에만). */}
              <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-cream-50 px-3.5 py-2.5">
                {selectedGroup && selectedGroup.applicants.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] font-bold text-ink-500">
                      같은 조 {selectedGroup.applicants.length}명
                    </span>
                    {selectedGroup.applicants.map((a: any) => {
                      const done = myInterviewScores[a.id] !== undefined;
                      const active = a.id === selectedApplicantId;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setSelectedApplicantId(a.id)}
                          className={`min-h-tap rounded-lg px-3 text-[13px] font-bold transition-colors ${
                            active
                              ? 'bg-blue-600 text-white'
                              : done
                                ? 'border border-ink-200 bg-white text-ink-700 hover:bg-cream-100'
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

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {attendanceError ? (
                    <span className="text-[12px] font-semibold text-error" role="alert">
                      {attendanceError}
                    </span>
                  ) : null}
                  {selectedApp.status === 'interview_noshow' ? (
                    <>
                      <span className="rounded-md bg-coral-100 px-2 py-0.5 text-[13px] font-bold text-coral-700">
                        면접 불참
                      </span>
                      <button
                        type="button"
                        onClick={() => void setAttendance(false)}
                        disabled={attendanceBusy}
                        className="min-h-tap rounded-lg border border-ink-200 bg-white px-3 text-[13px] font-bold text-ink-700 hover:bg-cream-100 disabled:opacity-50"
                      >
                        {attendanceBusy ? '저장 중…' : '왔어요(되돌리기)'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void setAttendance(true)}
                      disabled={attendanceBusy}
                      className="min-h-tap rounded-lg border border-coral-300 bg-white px-3 text-[13px] font-bold text-coral-700 hover:bg-coral-50 disabled:opacity-50"
                    >
                      {attendanceBusy ? '저장 중…' : '면접에 안 왔어요'}
                    </button>
                  )}
                </div>
              </div>

              {/* 지원서 핵심 보기 */}
              {/* 면접 중에는 점수 입력칸이 화면 밖으로 밀리면 안 된다 — 길면 접어 두고 펼쳐 본다. */}
              <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                <EssayBlock label="자기소개" text={selectedApp.essayIntro} collapsible collapsedHeight={180} />
                <EssayBlock label="가치관 및 계기" text={selectedApp.essayValues} collapsible collapsedHeight={180} />
              </div>

              {/* 대외활동 / 알바 경험 — 서류 채점 기록 **바로 위**(2026-08-21 사용자 지정).
                  자기소개·가치관과 달리 대개 한두 줄이라 위 2열 격자에 넣으면 옆 칸과 높이가 어긋난다.
                  여기서는 한 줄짜리 사실 카드로 두고, 비어 있어도 칸은 남긴다 — '안 적었다'와
                  '화면에 없다'는 다른 사실이고, 면접에서 물어볼지 말지가 거기서 갈린다. */}
              <div className="rounded-xl border border-cream-200 bg-cream-25 px-3.5 py-2.5 space-y-1">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                  대외활동 / 알바 경험
                </h3>
                {selectedApp.otherActivities?.trim() ? (
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-900">
                    {selectedApp.otherActivities}
                  </p>
                ) : (
                  <p className="text-[13px] text-ink-400">적지 않았습니다.</p>
                )}
              </div>

              {/* 서류 채점 기록 — 내 메모 **위**에 둔다. 면접 중에 쓰는 칸(메모)이 아니라
                  들어가기 전에 훑는 것이라 순서가 위이고, 글씨는 메모 카드보다 한 단계 작다
                  (메모가 주인공 자리를 뺏기면 안 된다). 접지 않고 항상 펼쳐 둔다. */}
              {documentScores.length > 0 && (
                <div className="rounded-xl border border-cream-200 bg-white px-3.5 py-2.5 space-y-1.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
                    서류 채점 기록 {documentScores.length}건
                  </h3>
                  {documentScores.map((s) => (
                    <div key={s.id} className="flex gap-2 text-[12px] leading-relaxed">
                      <span className="shrink-0 font-bold text-ink-700">
                        {parseFloat(s.score).toFixed(1)}점
                      </span>
                      {/* 누가 준 점수인지 없으면 면접에서 되물을 수도 없다. */}
                      <span className="shrink-0 font-semibold text-ink-500">
                        {staffNames[s.scorerUserId] || '이름 미상'}
                      </span>
                      {s.comment ? (
                        <span className="whitespace-pre-wrap text-ink-700">{s.comment}</span>
                      ) : (
                        <span className="text-ink-400">코멘트 없음</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 내 개인 실시간 메모 카드 */}
              <div className="rounded-xl border border-cream-200 bg-cream-50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-bold text-ink-900">내 메모 (나만 봅니다)</h3>
                  {memoState === 'saving' && <span className="text-[12px] font-semibold text-ink-500">자동 저장 중…</span>}
                  {memoState === 'saved' && <span className="text-[12px] font-semibold text-ink-500">자동 저장됨</span>}
                  {/* 저장 실패를 알려주지 않으면 면접이 끝난 뒤에야 메모가 없다는 걸 안다. */}
                  {memoState === 'error' && (
                    <span className="text-[12px] font-semibold text-error" role="alert">
                      저장 실패 — 내용을 복사해 두세요
                    </span>
                  )}
                </div>
                <AutoGrowTextarea
                  minRows={4}
                  placeholder="답변과 태도, 물어볼 것을 적어 두세요. 쓰는 대로 자동 저장됩니다."
                  value={personalMemo}
                  onChange={(e) => handleMemoChange(e.target.value)}
                  onBlur={flushMemo}
                  aria-label="내 개인 질문/관찰 실시간 메모"
                />
              </div>

              {/* 면접 점수 입력 카드 — 이 화면에서 가장 자주 하는 일이라 가장 크게 둔다.
                  예전에는 그라데이션 배경 위에 점수 버튼이 작은 글씨로 흘러가듯 놓여 있어서
                  '지금 몇 점이 눌려 있는지'가 배경색에 묻혔다. 흰 카드에 격자로 세운다. */}
              <div className="space-y-4 rounded-2xl border-[1.5px] border-blue-200 bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-bold text-ink-900">내 면접 점수</h3>
                  <span className="text-[13px] font-semibold text-ink-500">0.0 ~ 10.0점 · 0.5 단위</span>
                </div>

                {myExistingScore && (
                  <p className="rounded-lg bg-cream-100 px-3 py-2 text-[13px] font-semibold text-ink-700">
                    이미 {parseFloat(myExistingScore.score).toFixed(1)}점을 매겼습니다 — 저장하면 덮어씁니다.
                  </p>
                )}

                <div className="grid grid-cols-5 gap-2">
                  {QUICK_SCORES.map((scoreVal) => (
                    <button
                      key={scoreVal}
                      type="button"
                      onClick={() => setMyScore(scoreVal)}
                      aria-pressed={myScore === scoreVal}
                      className={`min-h-tap rounded-xl text-sm font-bold transition-colors ${
                        myScore === scoreVal
                          ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400'
                          : 'border border-ink-200 bg-white text-ink-700 hover:bg-cream-100'
                      }`}
                    >
                      {scoreVal}
                    </button>
                  ))}
                </div>

                {/* 퀵 버튼은 5.0 부터라 낮은 점수를 아예 줄 수 없었다 — 직접 입력칸을 남겨 둔다. */}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[13px] font-semibold text-ink-500" htmlFor="interview-score-input">
                    직접 입력
                  </label>
                  {/* 폭은 감싼 div 로 준다 — CONTROL 의 w-full 과 같은 특이도라 className 으로 주면
                      어느 쪽이 이길지 CSS 출력 순서에 달린다(ui.tsx ControlSize 주석). */}
                  <div className="w-24">
                    <Input
                      id="interview-score-input"
                      uiSize="sm"
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      placeholder="미입력"
                      value={myScore}
                      onChange={(e) => setMyScore(e.target.value)}
                    />
                  </div>
                </div>

                {/* 총평은 여러 줄로 쓰는 값이다 — 한 줄 입력칸이라 줄바꿈이 안 됐다. */}
                <Field label="면접 평가 총평">
                  <AutoGrowTextarea
                    minRows={3}
                    placeholder="면접관 종합 평가 총평…"
                    value={myComment}
                    onChange={(e) => setMyComment(e.target.value)}
                  />
                </Field>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 pt-3">
                  {message ? (
                    <StatusMessage text={message} />
                  ) : (
                    <span className="text-[13px] text-ink-500">
                      {hasScore ? '저장하면 상태가 면접 완료로 바뀝니다.' : '위에서 점수를 고르거나 직접 입력해 주세요.'}
                    </span>
                  )}
                  <Button
                    type="button"
                    disabled={savingScore || !hasScore}
                    onClick={handleSaveInterviewScore}
                    className="px-6"
                  >
                    {savingScore ? '저장 중…' : '면접 점수 저장'}
                  </Button>
                </div>
              </div>

              {/* 다른 면접관 기록 */}
              <div className="space-y-3 pt-2">
                <h3 className="text-[13px] font-bold text-ink-500">
                  다른 면접관 점수 {otherInterviewScores.length}건
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
              왼쪽에서 시간대를 고르면 그 조의 첫 사람이 여기 열립니다.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
