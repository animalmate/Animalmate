'use client';

import React, { useState, useEffect } from 'react';
import { RecruitNav } from '@/components/recruit-nav';
import { ScreenNotes } from '@/components/screen-notes';

export default function RecruitInterviewConsolePage() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [applicants, setApplicants] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);

  // 내 입력값
  const [myScore, setMyScore] = useState<string>('8.0');
  const [myComment, setMyComment] = useState<string>('');
  const [personalMemo, setPersonalMemo] = useState<string>('');
  const [savingMemo, setSavingMemo] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchCohorts();
  }, []);

  useEffect(() => {
    if (selectedCohortId) {
      fetchData();
    }
  }, [selectedCohortId]);

  useEffect(() => {
    if (selectedApplicantId) {
      fetchPersonalMemo(selectedApplicantId);
    }
  }, [selectedApplicantId]);

  const fetchCohorts = async () => {
    const res = await fetch('/api/recruit/cohorts');
    const data = await res.json();
    if (data.cohorts && data.cohorts.length > 0) {
      setCohorts(data.cohorts);
      setSelectedCohortId(data.cohorts[0].id);
    }
  };

  const fetchData = async () => {
    const slotRes = await fetch(`/api/recruit/slots?cohortId=${selectedCohortId}`);
    const slotData = await slotRes.json();
    if (slotData.slots) setSlots(slotData.slots);

    const appRes = await fetch(`/api/recruit/applicants?cohortId=${selectedCohortId}`);
    const appData = await appRes.json();
    if (appData.applicants) {
      const interviewees = appData.applicants.filter((a: any) =>
        ['doc_pass', 'interview_done', 'interview_noshow', 'final_pass'].includes(a.status)
      );
      setApplicants(interviewees);
      if (interviewees.length > 0 && !selectedApplicantId) {
        setSelectedApplicantId(interviewees[0].id);
      }
    }

    const scoreRes = await fetch(`/api/recruit/scores?cohortId=${selectedCohortId}`);
    const scoreData = await scoreRes.json();
    if (scoreData.scores) setScores(scoreData.scores);
  };

  const fetchPersonalMemo = async (applicantId: string) => {
    const res = await fetch(`/api/recruit/memos?applicantId=${applicantId}`);
    const data = await res.json();
    if (data.memo?.content !== undefined) {
      setPersonalMemo(data.memo.content);
    } else {
      setPersonalMemo('');
    }
  };

  const handleSaveMemo = async (content: string) => {
    if (!selectedApplicantId) return;
    setSavingMemo(true);
    try {
      await fetch('/api/recruit/memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantId: selectedApplicantId, content }),
      });
    } finally {
      setSavingMemo(false);
    }
  };

  const handleSaveInterviewScore = async () => {
    if (!selectedApplicantId) return;
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
        setMessage('면접 점수가 저장되었습니다 (상태 자동 업데이트).');
        await fetchData();
      } else {
        const data = await res.json();
        setMessage(`오류: ${data.message || data.error}`);
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

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-foreground mb-4">F9 면접 당일 콘솔 (운영진)</h1>
      <RecruitNav />

      <div className="flex items-center gap-2 mb-4">
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

      <ScreenNotes contextKey="recruit:interview-console" title="면접 콘솔 공용 메모지" />

      {/* 콘솔 좌우 레이아웃 */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* 좌측 면접 대상자 순서 목록 */}
        <div className="md:col-span-4 border border-border rounded-xl bg-card p-3 max-h-[700px] overflow-y-auto space-y-2">
          <h2 className="text-xs font-bold text-muted-foreground uppercase px-2 mb-2">
            면접 대상자 ({applicants.length}명)
          </h2>

          {applicants.map((app) => {
            const slot = slots.find((s) => s.id === app.slotId);
            const isSelected = app.id === selectedApplicantId;

            return (
              <div
                key={app.id}
                onClick={() => setSelectedApplicantId(app.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-foreground">{app.name}</span>
                  <span className="text-xs font-mono font-medium text-primary">
                    {slot
                      ? new Date(slot.startsAt).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '미배정'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>{app.school}</span>
                  <span className="px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded text-[10px]">
                    {app.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 우측 면접 진행 상세 화면 */}
        <div className="md:col-span-8 space-y-6">
          {selectedApp ? (
            <div className="border border-border rounded-xl bg-card p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground">{selectedApp.name}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedApp.school} {selectedApp.department} · {selectedApp.phone}
                  </p>
                </div>

                <div className="text-right">
                  {selectedSlot && (
                    <div className="text-xs font-bold text-primary mb-1">
                      면접 시간: {new Date(selectedSlot.startsAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} ({selectedSlot.durationMin}분)
                    </div>
                  )}
                  {selectedApp.interviewLink && (
                    <a
                      href={selectedApp.interviewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline font-medium"
                    >
                      면접 접속 링크 🔗
                    </a>
                  )}
                </div>
              </div>

              {/* 지원서 내용 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                  <h4 className="font-bold text-foreground">자기소개</h4>
                  <p className="text-muted-foreground whitespace-pre-wrap">{selectedApp.essayIntro || '-'}</p>
                </div>
                <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                  <h4 className="font-bold text-foreground">가치관 및 계기</h4>
                  <p className="text-muted-foreground whitespace-pre-wrap">{selectedApp.essayValues || '-'}</p>
                </div>
              </div>

              {/* 상단: 내 개인 메모 (자동 저장) */}
              <div className="p-4 border border-border rounded-xl bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-foreground">내 개인 메모 (질문/관찰 기록)</h3>
                  {savingMemo && <span className="text-[10px] text-muted-foreground">저장 중...</span>}
                </div>
                <textarea
                  className="w-full h-20 p-2.5 text-xs rounded-lg border border-input bg-background"
                  placeholder="면접 중 즉시 메모 (자동 저장)..."
                  value={personalMemo}
                  onChange={(e) => {
                    setPersonalMemo(e.target.value);
                    handleSaveMemo(e.target.value);
                  }}
                />
              </div>

              {/* 하단: 면접 점수 채점 */}
              <div className="p-4 border border-primary/20 rounded-xl bg-primary/5 space-y-3">
                <h3 className="text-sm font-bold text-foreground">내 면접 채점 입력</h3>
                <div className="flex items-center gap-4">
                  <label className="text-xs font-medium text-foreground">면접 점수 (0.0 ~ 10.0):</label>
                  <select
                    value={myScore}
                    onChange={(e) => setMyScore(e.target.value)}
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
                  placeholder="면접 평가 코멘트..."
                  value={myComment}
                  onChange={(e) => setMyComment(e.target.value)}
                  className="w-full p-2 border border-input rounded-lg text-xs bg-background"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={savingScore}
                    onClick={handleSaveInterviewScore}
                    className="px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {savingScore ? '저장 중...' : '면접 점수 저장 (면접완료로 자동 전환)'}
                  </button>
                </div>
                {message && <p className="text-xs font-medium text-primary mt-1">{message}</p>}
              </div>

              {/* 타 면접관 채점 기록 */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-foreground">면접관 채점 기록 ({currentInterviewScores.length}건)</h3>
                {currentInterviewScores.length > 0 ? (
                  <div className="space-y-2">
                    {currentInterviewScores.map((s) => (
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
                  <p className="text-xs text-muted-foreground">등록된 면접 점수가 없습니다.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground border rounded-xl">
              면접 대상자를 선택하세요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
