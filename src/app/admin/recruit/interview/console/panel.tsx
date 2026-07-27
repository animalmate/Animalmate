'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTeams } from '@/components/use-teams';
import { matchesTeamFilter } from '@/recruit/team-filter';
import { RecruitNav } from '@/components/recruit-nav';
import { ScreenNotes } from '@/components/screen-notes';
import { AutoGrowTextarea } from '@/components/auto-grow-textarea';
import { EssayBlock } from '@/components/essay-block';
import { Button, Card, Field, Input, StatusMessage, TeamOptions, ToolbarSelect } from '@/components/ui';

// 점수칸은 비워 둔 채 시작한다. 예전에는 '8.0' 이 미리 채워져 있어서, 면접관이 점수칸을 건드리지
// 않고 저장만 눌러도 8.0 이 '면접관이 매긴 점수'로 기록되고 상태까지 면접 완료로 전이됐다.
// 채점하지 않은 것과 8점을 준 것은 완전히 다른 사실이고, 뒤섞이면 집계·표본 부족 판정이 무너진다.
const NO_SCORE = '';

export function RecruitInterviewConsolePanel() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  // 기수 목록을 받아오는 동안 셀렉트에 표시한다(빈 드롭다운 = '기수 없음' 오해 방지).
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const { teams, loading: teamsLoading } = useTeams(selectedCohortId);
  const [applicants, setApplicants] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
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

  useEffect(() => {
    fetchCohorts();
    fetchStaff();
    // 화면을 떠날 때 아직 안 보낸 메모를 흘리지 않는다.
    return () => flushMemo();
  }, []);

  useEffect(() => {
    if (selectedCohortId) {
      fetchData();
    }
  }, [selectedCohortId]);

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

  const fetchData = async () => {
    // 세 요청을 차례로 기다리면 점수를 저장할 때마다 화면이 1.5초씩 멈춘다.
    // 지원서 전문을 보여주는 화면이라 지원자는 slim 으로 받지 않는다.
    const [slotRes, appRes, scoreRes] = await Promise.all([
      fetch(`/api/recruit/slots?cohortId=${selectedCohortId}`),
      fetch(`/api/recruit/applicants?cohortId=${selectedCohortId}`),
      fetch(`/api/recruit/scores?cohortId=${selectedCohortId}`),
    ]);
    const [slotData, appData, scoreData] = await Promise.all([slotRes.json(), appRes.json(), scoreRes.json()]);

    if (slotData.slots) setSlots(slotData.slots);
    if (appData.applicants) {
      const interviewees = appData.applicants.filter((a: any) =>
        ['doc_pass', 'interview_done', 'interview_noshow', 'final_pass'].includes(a.status)
      );
      setApplicants(interviewees);
      if (interviewees.length > 0 && !selectedApplicantId) {
        setSelectedApplicantId(interviewees[0].id);
      }
    }

    if (scoreData.scores) setScores(scoreData.scores);
    if (scoreData.viewerUserId) setViewerUserId(scoreData.viewerUserId);
  };

  const fetchPersonalMemo = async (applicantId: string) => {
    const res = await fetch(`/api/recruit/memos?applicantId=${applicantId}`);
    const data = await res.json();
    setPersonalMemo(data.memo?.content ?? '');
    setMemoState('idle');
  };

  const saveMemo = async (applicantId: string, content: string) => {
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
  };

  /** 대기 중인 메모를 지금 보낸다. 지원자를 바꾸거나 화면을 떠나도 마지막 타자가 사라지지 않게. */
  const flushMemo = () => {
    if (memoTimer.current) {
      clearTimeout(memoTimer.current);
      memoTimer.current = null;
    }
    const pending = pendingMemo.current;
    pendingMemo.current = null;
    if (pending) void saveMemo(pending.applicantId, pending.content);
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

  const [selectedSlotFilter, setSelectedSlotFilter] = useState('ALL');
  const [selectedTeam, setSelectedTeam] = useState('ALL');

  const filteredApplicants = applicants.filter((app) => {
    if (selectedSlotFilter !== 'ALL' && app.slotId !== selectedSlotFilter) return false;
    return matchesTeamFilter(app, selectedTeam);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900">4. 면접 당일 콘솔 (슬롯별 & 팀별 다중 채점)</h1>
          <p className="mt-1 text-sm text-ink-500">동일 면접 슬롯에 입장한 지원자그룹을 선택하여 실시간 질문 메모 및 평가 점수를 부여합니다.</p>
        </div>

        {/* 다른 모집 화면과 같은 툴바 셀렉트로 맞춘다(높이·테두리 제각각이던 파란 상자를 걷어냈다). */}
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSelect
            label="슬롯"
            value={selectedSlotFilter}
            onChange={(e) => setSelectedSlotFilter(e.target.value)}
          >
            <option value="ALL">전체</option>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.startsAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                {' | '}
                {s.venue || '대면'}
              </option>
            ))}
          </ToolbarSelect>

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

      <RecruitNav />

      <ScreenNotes
        screen="interview-console"
        cohortId={selectedCohortId}
        team={selectedTeam}
        title="면접 당일 운영진 공용 실시간 메모지"
      />

      {/* 2열 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 좌측 면접 순서 목록 */}
        <Card className="lg:col-span-4 p-4 space-y-3 max-h-[750px] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-cream-200 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-400">
              면접 대상자 ({filteredApplicants.length}명)
            </span>
          </div>

          <div className="space-y-2">
            {filteredApplicants.map((app) => {
              const slot = slots.find((s) => s.id === app.slotId);
              const isSelected = app.id === selectedApplicantId;
              const effectiveTeam = app.assignedTeam || app.wishTeam1 || '팀미지정';

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
                    <span className="text-xs font-mono font-bold text-blue-700">
                      {slot
                        ? new Date(slot.startsAt).toLocaleTimeString('ko-KR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '미배정'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-ink-500 mt-1.5">
                    <span>{app.school}</span>
                    <span className="rounded-full bg-cream-100 px-2 py-0.5 text-[10px] font-semibold text-ink-700">
                      {app.status === 'doc_pass'
                        ? '서류 합격'
                        : app.status === 'interview_done'
                        ? '면접 완료'
                        : app.status === 'interview_noshow'
                        ? '면접 불참'
                        : app.status === 'final_pass'
                        ? '최종 합격'
                        : app.status === 'final_fail'
                        ? '최종 불합격'
                        : '서류 심사 중'}
                    </span>
                  </div>
                </div>
              );
            })}
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
                    {selectedApp.school} {selectedApp.department} · 연락처: {selectedApp.phone}
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
