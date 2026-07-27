'use client';

import React, { useState, useEffect } from 'react';
import { useTeams } from '@/components/use-teams';
import { matchesTeamFilter } from '@/recruit/team-filter';
import { RecruitNav } from '@/components/recruit-nav';
import { ScreenNotes } from '@/components/screen-notes';
import { EssayBlock } from '@/components/essay-block';
import { AutoGrowTextarea } from '@/components/auto-grow-textarea';
import { Button, Card, Field, Input, Select, StatusMessage, TeamOptions, ToolbarSelect } from '@/components/ui';

export function RecruitScreeningPanel() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  // 기수 목록을 받아오는 동안 셀렉트에 표시한다(빈 드롭다운 = '기수 없음' 오해 방지).
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const { teams, loading: teamsLoading } = useTeams(selectedCohortId);
  const [applicants, setApplicants] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  const [aggregations, setAggregations] = useState<Record<string, any>>({});
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);

  const DEFAULT_SCORE = '7.0';
  const [myScore, setMyScore] = useState<string>(DEFAULT_SCORE);
  const [myComment, setMyComment] = useState<string>('');
  const [savingScore, setSavingScore] = useState(false);
  const [message, setMessage] = useState('');

  const QUICK_SCORES = ['5.0', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0', '9.5', '10.0'];

  const [staffNames, setStaffNames] = useState<Record<string, string>>({});

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
  }, []);

  useEffect(() => {
    if (selectedCohortId) {
      fetchApplicantsAndScores();
    }
  }, [selectedCohortId]);

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
    setMyScore(mine ? parseFloat(mine.score).toFixed(1) : DEFAULT_SCORE);
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

  const fetchApplicantsAndScores = async () => {
    const appRes = await fetch(`/api/recruit/applicants?cohortId=${selectedCohortId}`);
    const appData = await appRes.json();
    if (appData.applicants) {
      setApplicants(appData.applicants);
      if (appData.applicants.length > 0 && !selectedApplicantId) {
        setSelectedApplicantId(appData.applicants[0].id);
      }
    }

    const scoreRes = await fetch(`/api/recruit/scores?cohortId=${selectedCohortId}`);
    const scoreData = await scoreRes.json();
    if (scoreData.scores) {
      setScores(scoreData.scores);
      setAggregations(scoreData.aggregations || {});
    }
    if (scoreData.viewerUserId) setViewerUserId(scoreData.viewerUserId);
  };

  const handleSaveScore = async () => {
    if (!selectedApplicantId) return;
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
  const [reassigning, setReassigning] = useState(false);

  const handleReassignTeam = async (newTeam: string) => {
    if (!selectedApplicantId) return;
    setReassigning(true);
    try {
      const res = await fetch('/api/recruit/applicants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_team',
          id: selectedApplicantId,
          assignedTeam: newTeam,
        }),
      });

      if (res.ok) {
        setMessage(`✅ 지원자 소속 팀이 '${newTeam}'(으)로 이관되었습니다.`);
        await fetchApplicantsAndScores();
      } else {
        const data = await res.json();
        setMessage(`❌ 팀 이관 실패: ${data.error}`);
      }
    } finally {
      setReassigning(false);
    }
  };

  const filteredApplicants = applicants.filter((app) => matchesTeamFilter(app, selectedTeam));

  const selectedApp = applicants.find((a) => a.id === selectedApplicantId);
  const currentDocScores = scores.filter(
    (s) => s.applicantId === selectedApplicantId && s.stage === 'document'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900">1. 서류 심사 (운영진)</h1>
          <p className="mt-1 text-sm text-ink-500">각 팀장단 및 운영진이 지원서와 자기소개서를 검토하고 점수를 부여합니다.</p>
        </div>

        {/* 2. 서류 집계 화면과 같은 툴바 형태로 통일한다. */}
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSelect label="팀" value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
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
        screen="doc"
        cohortId={selectedCohortId}
        team={selectedTeam}
        title="서류 심사 운영진 공용 메모지"
      />

      {/* 2열 스플릿 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 좌측 지원자 목록 */}
        <Card className="lg:col-span-4 p-4 space-y-3 max-h-[750px] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-cream-200 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-400">
              지원자 목록 ({filteredApplicants.length}명)
            </span>
          </div>

          <div className="space-y-2">
            {filteredApplicants.map((app) => {
              const isSelected = app.id === selectedApplicantId;
              const agg = aggregations[app.id];
              const effectiveTeam = app.assignedTeam || app.wishTeam1 || '팀 미지정';
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
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                      {agg?.docAvg !== undefined ? `${agg.docAvg}점` : '미채점'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-ink-500 flex justify-between">
                    <span>1지망: {app.wishTeam1 || '-'}</span>
                    <span>2지망: {app.wishTeam2 || '-'}</span>
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
                    {selectedApp.school} {selectedApp.department} · 연락처: {selectedApp.phone} · {selectedApp.email}
                  </p>
                </div>
                <div className="text-right space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                    <span>1지망: {selectedApp.wishTeam1 || '미지정'}</span>
                    <span className="text-blue-300">/</span>
                    <span>2지망: {selectedApp.wishTeam2 || '미지정'}</span>
                  </div>
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
                  {message ? <StatusMessage text={message} /> : <span />}
                  <Button type="button" disabled={savingScore} onClick={handleSaveScore}>
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
