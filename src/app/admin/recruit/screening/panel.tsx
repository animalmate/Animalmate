'use client';

import { HelpButton } from '@/components/help-button';
import { isPrivileged, type Role } from '@/auth/permissions';
import React, { useState, useEffect, useCallback } from 'react';
import { useTeams } from '@/components/use-teams';
import { matchesTeamFilter } from '@/recruit/team-filter';
import type { ApplicantAggregate } from '@/recruit/aggregate';
import { formatPhone } from '@/lib/phone';
import { RecruitNav } from '@/components/recruit-nav';
import { ScreenNotes } from '@/components/screen-notes';
import { EssayBlock } from '@/components/essay-block';
import { AutoGrowTextarea } from '@/components/auto-grow-textarea';
import { Button, Card, Field, Input, Select, StatusMessage, TeamOptions, ToolbarSelect } from '@/components/ui';

export function RecruitScreeningPanel({ role }: { role: Role }) {
  const canManage = isPrivileged(role);
  const [cohorts, setCohorts] = useState<any[]>([]);
  // 기수 목록을 받아오는 동안 셀렉트에 표시한다(빈 드롭다운 = '기수 없음' 오해 방지).
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const { teams, loading: teamsLoading } = useTeams(selectedCohortId);
  const [applicants, setApplicants] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  // `any` 로 두면 없는 필드를 읽어도 조용히 undefined 가 된다 — 실제로 `docAvg` 오타 때문에
  // 채점을 마친 지원자가 계속 '미채점'으로 보였다. 타입을 붙여 컴파일 단계에서 잡는다.
  const [aggregations, setAggregations] = useState<Record<string, ApplicantAggregate>>({});
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);

  // 기본값을 넣어 두면 자기소개서를 안 읽고 저장만 눌러도 그 점수가 기록된다(면접 콘솔의 8.0 과 같은 문제).
  const NO_SCORE = '';
  const [myScore, setMyScore] = useState<string>(NO_SCORE);
  const [myComment, setMyComment] = useState<string>('');
  const [savingScore, setSavingScore] = useState(false);
  const [message, setMessage] = useState('');

  const QUICK_SCORES = ['5.0', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0', '9.5', '10.0'];

  const [staffNames, setStaffNames] = useState<Record<string, string>>({});

  const fetchCohorts = useCallback(async () => {
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
  }, []);

  const fetchApplicantsAndScores = useCallback(async () => {
    // 이 화면은 자기소개서 전문을 읽으므로 slim 을 쓰지 않는다. 대신 두 요청을 동시에 보낸다.
    const [appRes, scoreRes] = await Promise.all([
      fetch(`/api/recruit/applicants?cohortId=${selectedCohortId}`),
      fetch(`/api/recruit/scores?cohortId=${selectedCohortId}`),
    ]);
    const [appData, scoreData] = await Promise.all([appRes.json(), scoreRes.json()]);

    if (appData.applicants) {
      setApplicants(appData.applicants);
      // 이미 고른 지원자가 있으면 그대로 둔다. 갱신 함수로 넘겨야 selectedApplicantId 가
      // 이 함수의 의존성에서 빠지고, 지원자를 바꿀 때마다 목록을 다시 받는 일이 없다.
      if (appData.applicants.length > 0) {
        setSelectedApplicantId((prev) => prev || appData.applicants[0].id);
      }
    }
    if (scoreData.scores) {
      setScores(scoreData.scores);
      setAggregations(scoreData.aggregations || {});
    }
    if (scoreData.viewerUserId) setViewerUserId(scoreData.viewerUserId);
  }, [selectedCohortId]);

  useEffect(() => {
    fetchCohorts();
    // 점수 기록에 이름을 붙이기 위한 운영진 명단.
    fetch('/api/recruit/staff')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.staff)) {
          setStaffNames(Object.fromEntries(data.staff.map((s: any) => [s.id, s.name])));
        }
      })
      .catch(() => {});
  }, [fetchCohorts]);

  useEffect(() => {
    if (selectedCohortId) {
      fetchApplicantsAndScores();
    }
  }, [selectedCohortId, fetchApplicantsAndScores]);

  // 지원자를 바꾸면 내 입력칸을 새로 맞춘다. 초기화가 없으면 앞 지원자에게 쓴 점수·코멘트가
  // 그대로 남아 다음 지원자의 기록으로 저장된다. 이미 채점한 사람은 그 값을 되살린다.
  useEffect(() => {
    if (!selectedApplicantId) return;
    setMessage('');
    const mine = scores.find(
      (s) =>
        s.applicantId === selectedApplicantId &&
        s.stage === 'document' &&
        s.scorerUserId === viewerUserId
    );
    setMyScore(mine ? parseFloat(mine.score).toFixed(1) : NO_SCORE);
    setMyComment(mine?.comment ?? '');
  }, [selectedApplicantId, viewerUserId, scores]);

  // 점수를 고르지 않았으면 저장할 것이 없다. 서버도 빈 값을 400 으로 막지만(규칙 #6),
  // 버튼을 눌러 놓고 오류를 보는 것보다 애초에 못 누르게 하는 편이 덜 헷갈린다.
  const hasScore = myScore.trim() !== '';

  const handleSaveScore = async () => {
    if (!selectedApplicantId || !hasScore) return;
    setSavingScore(true);
    setMessage('');
    try {
      const res = await fetch('/api/recruit/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantId: selectedApplicantId,
          stage: 'document',
          score: myScore,
          comment: myComment,
        }),
      });

      if (res.ok) {
        setMessage('✅ 서류 심사 점수가 정상 반영되었습니다.');
        await fetchApplicantsAndScores();
      } else {
        const data = await res.json();
        setMessage(`❌ 오류: ${data.message || data.error}`);
      }
    } finally {
      setSavingScore(false);
    }
  };

  const [selectedTeam, setSelectedTeam] = useState('ALL');
  const [scoreFilter, setScoreFilter] = useState('ALL');
  const [reassigning, setReassigning] = useState(false);

  const handleReassignTeam = async (newTeam: string) => {
    if (!selectedApplicantId) return;
    // 화면을 먼저 바꾸고 저장한다. 전체를 다시 불러오면 배포 환경에서 왕복이 두 번 더 붙어
    // 팀 하나 바꾸는 데 1.5초씩 걸렸다.
    // 실패하면 서버에서 다시 읽는다(스냅샷 복원은 그 사이 성공한 다른 변경까지 지운다).
    const id = selectedApplicantId;
    setApplicants((prev) => prev.map((a) => (a.id === id ? { ...a, assignedTeam: newTeam } : a)));
    setReassigning(true);
    try {
      const res = await fetch('/api/recruit/applicants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_team',
          id,
          assignedTeam: newTeam,
        }),
      });

      if (res.ok) {
        setMessage(`✅ 지원자 소속 팀이 '${newTeam}'(으)로 이관되었습니다.`);
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(`❌ 팀 이관 실패: ${data.message || data.error}`);
        await fetchApplicantsAndScores();
      }
    } catch {
      setMessage('❌ 팀을 변경하지 못했습니다. 연결을 확인해 주세요.');
      await fetchApplicantsAndScores();
    } finally {
      setReassigning(false);
    }
  };

  // 목록 배지의 기준은 '내가 채점했는지'다. 이 화면은 운영진 각자가 전원을 채점하는 곳이라
  // 전체 평균만 띄우면 남이 채점한 사람에게도 점수가 찍혀 내가 누구를 남겼는지 알 수 없다.
  const myDocScores: Record<string, number> = {};
  scores.forEach((s) => {
    if (s.stage === 'document' && s.scorerUserId === viewerUserId) {
      myDocScores[s.applicantId] = parseFloat(s.score);
    }
  });

  const teamApplicants = applicants.filter((app) => matchesTeamFilter(app, selectedTeam));
  const filteredApplicants = teamApplicants.filter((app) => {
    if (scoreFilter === 'TODO') return myDocScores[app.id] === undefined;
    if (scoreFilter === 'DONE') return myDocScores[app.id] !== undefined;
    return true;
  });
  // 진행률은 채점 필터와 무관하게 팀 기준으로 센다('내 채점 전'만 보는 동안 0/N 이 되면 안 된다).
  const myScoredCount = teamApplicants.filter((a) => myDocScores[a.id] !== undefined).length;

  const selectedApp = applicants.find((a) => a.id === selectedApplicantId);
  const currentDocScores = scores.filter(
    (s) => s.applicantId === selectedApplicantId && s.stage === 'document'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-bold text-ink-900">1. 서류 심사 (운영진)</h1>
            <HelpButton screen="recruit-screening" />
          </div>
          <p className="mt-1 text-sm text-ink-500">각 팀장단 및 운영진이 지원서와 자기소개서를 검토하고 점수를 부여합니다.</p>
        </div>

        {/* 2. 서류 집계 화면과 같은 툴바 형태로 통일한다. */}
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSelect label="팀" value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
            <option value="ALL">전체</option>
            <TeamOptions teams={teams} loading={teamsLoading} />
          </ToolbarSelect>

          {/* 50명 규모에서는 표시만으로 부족하다 — 아직 안 한 사람만 남겨 놓고 훑을 수 있어야 한다. */}
          <ToolbarSelect label="내 채점" value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value)}>
            <option value="ALL">전체</option>
            <option value="TODO">내 채점 전</option>
            <option value="DONE">내 채점 완료</option>
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
        screen="doc"
        cohortId={selectedCohortId}
        team={selectedTeam}
        title="서류 심사 운영진 공용 메모지"
      />

      {/* 2열 스플릿 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 좌측 지원자 목록 */}
        {/* 우패널을 읽으려고 내리면 목록이 같이 밀려 올라가, 다음 지원자를 고르려면 도로 올라와야 했다
            (33기 203명에서는 그 왕복이 계속된다). 바깥 그리드가 `items-start` 라 sticky 가 그대로 먹는다
            — `items-stretch` 였다면 카드가 늘어나 sticky 가 무효가 된다.
            높이는 고정 px 이 아니라 **뷰포트 기준**이어야 한다. 750px 인 채로 붙이면 낮은 화면에서
            카드 아래가 화면 밖으로 나가 영영 닿지 못한다. 모바일(lg 미만)은 위아래로 쌓이므로 걸지 않는다. */}
        <Card className="lg:col-span-4 p-4 space-y-3 max-h-[750px] overflow-y-auto lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
          <div className="flex items-center justify-between border-b border-cream-200 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-400">
              지원자 목록 ({filteredApplicants.length}명)
            </span>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
              내 채점 {myScoredCount}/{teamApplicants.length}
            </span>
          </div>

          <div className="space-y-2">
            {filteredApplicants.map((app) => {
              const isSelected = app.id === selectedApplicantId;
              const agg = aggregations[app.id];
              const effectiveTeam = app.assignedTeam || app.wishTeam1 || '팀 미지정';
              const myDocScore = myDocScores[app.id];
              const docAvg = agg?.docScoreAvg;
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
                    <span className="font-bold text-ink-900 text-sm flex items-center gap-1.5">
                      {app.name}
                      <span className="text-[11px] font-normal px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
                        {effectiveTeam}
                      </span>
                    </span>
                    <span
                      className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold ${
                        myDocScore !== undefined
                          ? 'bg-blue-600 text-white'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {myDocScore !== undefined ? `내 ${myDocScore.toFixed(1)}점` : '내 채점 전'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-ink-500 flex justify-between">
                    <span>1지망: {app.wishTeam1 || '-'}</span>
                    <span>2지망: {app.wishTeam2 || '-'}</span>
                  </div>
                  {/* 내 채점 여부와 전체 평균은 다른 정보다. 평균은 보조로 아래 줄에 둔다. */}
                  <div className="mt-1 text-[11px] text-ink-400">
                    {docAvg !== null && docAvg !== undefined
                      ? `전체 평균 ${docAvg}점 · ${agg?.docScorerCount ?? 0}명 채점`
                      : '채점한 운영진 없음'}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 우측 지원서 상세 및 심사 패널 */}
        <div className="lg:col-span-8 space-y-6">
          {selectedApp ? (
            <Card className="space-y-6 p-6">
              {/* 지원자 프로필 헤더 */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-cream-200 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold text-ink-900">{selectedApp.name}</h2>
                    <span className="rounded-full bg-cream-100 px-2.5 py-0.5 text-xs font-semibold text-ink-700">
                      {selectedApp.gender || '성별미기재'}
                    </span>
                  </div>
                  <p className="text-xs text-ink-500 mt-1 font-medium">
                    {/* 생년월일 — 서류 단계에서도 나이를 보고 판단한다. 표기는 결정 114 로 `YYYY.MM.DD`
                        로 통일돼 있어 지원자끼리 나란히 놓고 비교할 수 있다(업로드 시점에 맞춰진다). */}
                    {selectedApp.school} {selectedApp.department}
                    {selectedApp.birthDate ? ` · ${selectedApp.birthDate}` : ''} · 연락처:{' '}
                    {formatPhone(selectedApp.phone)} · {selectedApp.email}
                  </p>
                </div>
                <div className="text-right space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                    <span>1지망: {selectedApp.wishTeam1 || '미지정'}</span>
                    <span className="text-blue-300">/</span>
                    <span>2지망: {selectedApp.wishTeam2 || '미지정'}</span>
                  </div>
                  {/* 팀 이관은 '배정 = 결정'이라 서버가 회장단만 허용한다(09-RECRUIT-DESIGN §0·§4).
                      그런데 이 화면은 운영진도 들어오는 곳이라, 셀렉트를 그냥 열어 두면
                      운영진이 팀을 고를 때마다 403 만 돌아왔다. 권한이 없으면 지금 팀을 보여주기만 한다. */}
                  {canManage ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="text-xs font-semibold text-ink-700">팀 이관:</span>
                      <Select
                        value={selectedApp.assignedTeam || selectedApp.wishTeam1 || '봉사 1팀'}
                        disabled={reassigning}
                        onChange={(e) => handleReassignTeam(e.target.value)}
                        className="w-32 text-xs h-7"
                      >
                        <TeamOptions teams={teams} loading={teamsLoading} />
                      </Select>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-500">
                      배정 팀:{' '}
                      <strong className="text-ink-900">
                        {selectedApp.assignedTeam || selectedApp.wishTeam1 || '미지정'}
                      </strong>
                      <span className="ml-1 text-ink-400">(팀 이관은 회장단)</span>
                    </p>
                  )}
                  {selectedApp.nearStation && (
                    <p className="text-xs text-ink-500 font-medium">
                      인근 역: <strong className="text-ink-900">{selectedApp.nearStation}</strong>
                    </p>
                  )}
                </div>
              </div>

              {/* 자기소개서 내용 */}
              <div className="space-y-4">
                {/* 서류 심사는 전문을 읽는 화면이라 접지 않는다. */}
                <EssayBlock label="1. 자기소개" text={selectedApp.essayIntro} />
                <EssayBlock label="2. 가치관 및 동아리 지원 동기" text={selectedApp.essayValues} />

                {selectedApp.otherActivities && (
                  <div className="rounded-xl border border-cream-200 bg-cream-50 p-3 text-xs text-ink-700">
                    <strong className="text-ink-900">대외활동 / 알바 경험:</strong> {selectedApp.otherActivities}
                  </div>
                )}
              </div>

              {/* 내 서류 채점 입력 카드 */}
              <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/70 via-cream-50 to-blue-50/70 p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink-900">내 서류 심사 점수 평가</h3>
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
                  <Field label="평가 코멘트 (선택 사항)">
                    <AutoGrowTextarea
                      minRows={3}
                      placeholder="지원서의 강점, 우려 사항 또는 질문할 항목을 기록하세요..."
                      value={myComment}
                      onChange={(e) => setMyComment(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="flex items-center justify-between pt-1">
                  {message ? (
                    <StatusMessage text={message} />
                  ) : !hasScore ? (
                    <span className="text-xs text-ink-500">점수를 입력하거나 &lsquo;자주 쓰는 점수&rsquo;에서 골라 주세요.</span>
                  ) : (
                    <span />
                  )}
                  <Button type="button" disabled={savingScore || !hasScore} onClick={handleSaveScore}>
                    {savingScore ? '저장 중…' : '서류 점수 저장'}
                  </Button>
                </div>
              </div>

              {/* 타 운영진 채점 기록 */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">
                  운영진 서류 채점 기록 ({currentDocScores.length}건)
                </h3>
                {currentDocScores.length > 0 ? (
                  <div className="space-y-2">
                    {currentDocScores.map((s) => (
                      <div key={s.id} className="rounded-xl border border-cream-200 bg-white p-3 text-xs shadow-card">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-baseline gap-2">
                            <span className="font-bold text-blue-700 text-sm">{parseFloat(s.score).toFixed(1)}점</span>
                            {/* 누가 준 점수인지 없으면 조율도 정정도 못 한다. */}
                            <span className="font-semibold text-ink-700">
                              {s.scorerUserId === viewerUserId ? '나' : staffNames[s.scorerUserId] || '이름 미상'}
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
                  <p className="text-xs text-ink-400">아직 등록된 서류 채점 기록이 없습니다.</p>
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-12 text-center text-ink-400">
              좌측 지원자 목록에서 심사할 대상을 선택하세요.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
