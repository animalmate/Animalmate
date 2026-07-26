'use client';

import React, { useState, useEffect } from 'react';
import { RecruitNav } from '@/components/recruit-nav';
import { ScreenNotes } from '@/components/screen-notes';
import { Button, Card, Field, Input, Select } from '@/components/ui';

export function RecruitInterviewConsolePanel() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [applicants, setApplicants] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);

  const [myScore, setMyScore] = useState<string>('8.0');
  const [myComment, setMyComment] = useState<string>('');
  const [personalMemo, setPersonalMemo] = useState<string>('');
  const [savingMemo, setSavingMemo] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [message, setMessage] = useState('');

  const QUICK_SCORES = ['5.0', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0', '9.5', '10.0'];

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900">5. 면접 당일 콘솔 (운영진)</h1>
          <p className="mt-1 text-sm text-ink-500">면접 당일 실시간 메모 작성, 질문 및 채점 점수를 기록합니다.</p>
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

      <ScreenNotes contextKey="recruit:interview-console" title="면접 당일 운영진 공용 실시간 메모지" />

      {/* 2열 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 좌측 면접 순서 목록 */}
        <Card className="lg:col-span-4 p-4 space-y-3 max-h-[750px] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-cream-200 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-400">
              면접 대상자 ({applicants.length}명)
            </span>
          </div>

          <div className="space-y-2">
            {applicants.map((app) => {
              const slot = slots.find((s) => s.id === app.slotId);
              const isSelected = app.id === selectedApplicantId;

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
                    <span className="font-bold text-sm text-ink-900">{app.name}</span>
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
                        🔗 면접 접속 URL 열기
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* 지원서 핵심 보기 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-cream-200 bg-cream-25 p-3.5 space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-700">자기소개</h4>
                  <p className="text-xs text-ink-900 whitespace-pre-wrap leading-relaxed">
                    {selectedApp.essayIntro || '-'}
                  </p>
                </div>

                <div className="rounded-xl border border-cream-200 bg-cream-25 p-3.5 space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-700">가치관 및 계기</h4>
                  <p className="text-xs text-ink-900 whitespace-pre-wrap leading-relaxed">
                    {selectedApp.essayValues || '-'}
                  </p>
                </div>
              </div>

              {/* 내 개인 실시간 메모 카드 */}
              <div className="rounded-xl border border-cream-200 bg-cream-50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-ink-900">내 개인 질문/관찰 실시간 메모</h3>
                  {savingMemo && <span className="text-[11px] font-semibold text-blue-600">자동 저장 중…</span>}
                </div>
                <textarea
                  className="w-full h-24 rounded-xl border border-ink-200 bg-white p-3 text-xs text-ink-900 outline-none placeholder:text-ink-400 focus:border-blue-500 font-sans leading-relaxed"
                  placeholder="면접 진행 중 관찰한 답변 태도, 답변 내용, 질문 기록 (입력 시 자동 저장)..."
                  value={personalMemo}
                  onChange={(e) => {
                    setPersonalMemo(e.target.value);
                    handleSaveMemo(e.target.value);
                  }}
                />
              </div>

              {/* 면접 점수 입력 카드 */}
              <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/70 via-cream-50 to-blue-50/70 p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink-900">내 면접 점수 심사</h3>
                  <span className="text-xs text-blue-700 font-semibold">0.0 ~ 10.0점 (0.5 단위)</span>
                </div>

                {/* 퀵 점수 선택 */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-ink-500">빠른 점수 선택:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_SCORES.map((scoreVal) => (
                      <button
                        key={scoreVal}
                        type="button"
                        onClick={() => setMyScore(scoreVal)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
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

                <div className="space-y-2">
                  <Field label="면접 평가 총평 코멘트">
                    <Input
                      type="text"
                      placeholder="면접관 종합 평가 총평 코멘트..."
                      value={myComment}
                      onChange={(e) => setMyComment(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="flex items-center justify-between pt-1">
                  {message ? <p className="text-xs font-semibold text-blue-700">{message}</p> : <span />}
                  <Button type="button" disabled={savingScore} onClick={handleSaveInterviewScore}>
                    {savingScore ? '저장 중…' : '면접 점수 저장 (상태 전이)'}
                  </Button>
                </div>
              </div>

              {/* 다른 면접관 기록 */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">
                  타 면접관 점수 기록 ({currentInterviewScores.length}건)
                </h3>
                {currentInterviewScores.length > 0 ? (
                  <div className="space-y-2">
                    {currentInterviewScores.map((s) => (
                      <div key={s.id} className="rounded-xl border border-cream-200 bg-white p-3 text-xs flex justify-between items-center shadow-card">
                        <div>
                          <span className="font-bold text-blue-700 text-sm">{s.score}점</span>
                          {s.comment && <span className="ml-3 text-ink-700 font-medium">"{s.comment}"</span>}
                        </div>
                        <span className="text-[11px] text-ink-400 font-mono">
                          {new Date(s.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-400">등록된 면접 점수가 없습니다.</p>
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
