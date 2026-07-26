'use client';

import React, { useState, useEffect } from 'react';
import { RecruitNav } from '@/components/recruit-nav';
import { ScreenNotes } from '@/components/screen-notes';

export default function RecruitScreeningPage() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [applicants, setApplicants] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  const [aggregations, setAggregations] = useState<Record<string, any>>({});
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);

  // 현재 선택된 지원자의 채점 상태
  const [myScore, setMyScore] = useState<string>('7.0');
  const [myComment, setMyComment] = useState<string>('');
  const [savingScore, setSavingScore] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchCohorts();
  }, []);

  useEffect(() => {
    if (selectedCohortId) {
      fetchApplicantsAndScores();
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
        setMessage('서류 점수가 저장되었습니다.');
        await fetchApplicantsAndScores();
      } else {
        const data = await res.json();
        setMessage(`오류: ${data.message || data.error}`);
      }
    } finally {
      setSavingScore(false);
    }
  };

  const selectedApp = applicants.find((a) => a.id === selectedApplicantId);
  const currentDocScores = scores.filter(
    (s) => s.applicantId === selectedApplicantId && s.stage === 'document'
  );

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-foreground mb-4">F9 신입 모집 - 서류 심사</h1>
      <RecruitNav />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">기수 선택:</span>
          <select
            value={selectedCohortId}
            onChange={(e) => setSelectedCohortId(e.target.value)}
            aria-label="기수 선택"
            className="p-1.5 border border-input rounded-lg text-sm bg-background"
          >
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ScreenNotes contextKey="recruit:doc" title="서류 심사 공용 메모지" />

      {/* 좌우 분할 레이아웃 */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* 좌측 지원자 목록 */}
        <div className="md:col-span-4 border border-border rounded-xl bg-card p-3 max-h-[700px] overflow-y-auto space-y-2">
          <h2 className="text-xs font-bold text-muted-foreground uppercase px-2 mb-2">
            지원자 목록 ({applicants.length}명)
          </h2>

          {applicants.map((app) => {
            const isSelected = app.id === selectedApplicantId;
            const agg = aggregations[app.id];
            return (
              <div
                key={app.id}
                onClick={() => setSelectedApplicantId(app.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-accent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-foreground">{app.name}</span>
                  <span className="text-xs text-muted-foreground">{app.school}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>{app.wishTeam1 || '미지정'}</span>
                  {agg?.docScoreAvg !== null && agg?.docScoreAvg !== undefined ? (
                    <span className="font-bold text-primary">
                      서류평균: {agg.docScoreAvg}점 ({agg.docScorerCount}명)
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">미채점</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 우측 상세 및 채점 패널 */}
        <div className="md:col-span-8 space-y-6">
          {selectedApp ? (
            <div className="border border-border rounded-xl bg-card p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground">{selectedApp.name}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedApp.school} {selectedApp.department} · 전화: {selectedApp.phone}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs px-2 py-1 bg-secondary text-secondary-foreground rounded-full font-medium">
                    1지망: {selectedApp.wishTeam1 || '미지정'} / 2지망: {selectedApp.wishTeam2 || '미지정'}
                  </span>
                  {selectedApp.nearStation && (
                    <p className="text-xs text-muted-foreground mt-1">
                      가장 가까운 역: {selectedApp.nearStation}
                    </p>
                  )}
                </div>
              </div>

              {/* 자기소개서 내용 */}
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-xl space-y-2">
                  <h3 className="text-xs font-bold text-foreground">1. 자기소개</h3>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {selectedApp.essayIntro || '내용 없음'}
                  </p>
                </div>

                <div className="p-4 bg-muted/50 rounded-xl space-y-2">
                  <h3 className="text-xs font-bold text-foreground">2. 가치관 및 활동 계기</h3>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {selectedApp.essayValues || '내용 없음'}
                  </p>
                </div>

                {selectedApp.otherActivities && (
                  <div className="p-3 bg-muted/30 rounded-lg text-xs">
                    <strong className="text-foreground">대외활동/알바:</strong> {selectedApp.otherActivities}
                  </div>
                )}
              </div>

              {/* 내 채점 입력 */}
              <div className="p-4 border border-primary/20 rounded-xl bg-primary/5 space-y-3">
                <h3 className="text-sm font-bold text-foreground">내 서류 채점 입력</h3>
                <div className="flex items-center gap-4">
                  <label className="text-xs font-medium text-foreground">점수 (0.0 ~ 10.0):</label>
                  <select
                    value={myScore}
                    onChange={(e) => setMyScore(e.target.value)}
                    aria-label="점수 선택"
                    className="p-1.5 border border-input rounded-lg text-sm bg-background font-bold"
                  >
                    {[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map(
                      (num) => (
                        <option key={num} value={num.toFixed(1)}>
                          {num.toFixed(1)} 점
                        </option>
                      )
                    )}
                  </select>
                </div>

                <input
                  type="text"
                  placeholder="코멘트 (선택 사항)..."
                  value={myComment}
                  onChange={(e) => setMyComment(e.target.value)}
                  className="w-full p-2 border border-input rounded-lg text-xs bg-background"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={savingScore}
                    onClick={handleSaveScore}
                    className="px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {savingScore ? '저장 중...' : '서류 점수 저장'}
                  </button>
                </div>
                {message && <p className="text-xs font-medium text-primary mt-1">{message}</p>}
              </div>

              {/* 타 운영진 채점 코멘트 */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-foreground">운영진 서류 채점 기록 ({currentDocScores.length}건)</h3>
                {currentDocScores.length > 0 ? (
                  <div className="space-y-2">
                    {currentDocScores.map((s) => (
                      <div key={s.id} className="p-3 border rounded-lg text-xs bg-card flex justify-between items-center">
                        <div>
                          <span className="font-bold text-foreground">{s.score}점</span>
                          {s.comment && <span className="ml-3 text-muted-foreground">"{s.comment}"</span>}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(s.updatedAt).toLocaleTimeString('ko-KR')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">등록된 서류 점수가 없습니다.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground border rounded-xl">
              좌측 목록에서 지원자를 선택하세요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
