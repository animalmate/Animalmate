'use client';

import React, { useState, useEffect } from 'react';
import { RecruitNav } from '@/components/recruit-nav';

export default function RecruitFinalPage() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');

  const [applicants, setApplicants] = useState<any[]>([]);
  const [aggregations, setAggregations] = useState<Record<string, any>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 스위치 및 모달 상태
  const [schedulePublic, setSchedulePublic] = useState(false);
  const [resultPublic, setResultPublic] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeConfirmInput, setPurgeConfirmInput] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchCohorts();
  }, []);

  useEffect(() => {
    if (selectedCohortId) {
      fetchCohortAndApplicants();
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

  const fetchCohortAndApplicants = async () => {
    const cRes = await fetch(`/api/recruit/cohorts/${selectedCohortId}`);
    const cData = await cRes.json();
    if (cData.cohort) {
      setSchedulePublic(cData.cohort.schedulePublic);
      setResultPublic(cData.cohort.resultPublic);
    }

    const appRes = await fetch(`/api/recruit/applicants?cohortId=${selectedCohortId}`);
    const appData = await appRes.json();
    if (appData.applicants) setApplicants(appData.applicants);

    const scoreRes = await fetch(`/api/recruit/scores?cohortId=${selectedCohortId}`);
    const scoreData = await scoreRes.json();
    if (scoreData.aggregations) setAggregations(scoreData.aggregations);
  };

  const sortedApplicants = [...applicants].sort((a, b) => {
    const avgA = aggregations[a.id]?.interviewScoreAvg ?? -1;
    const avgB = aggregations[b.id]?.interviewScoreAvg ?? -1;
    return avgB - avgA;
  });

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleUpdateSwitches = async (newSchedule: boolean, newResult: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/recruit/cohorts/${selectedCohortId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedulePublic: newSchedule, resultPublic: newResult }),
      });
      if (res.ok) {
        setSchedulePublic(newSchedule);
        setResultPublic(newResult);
        setMessage('공개 스위치가 변경되었습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmFinalStatus = async (status: 'final_pass' | 'final_fail') => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/recruit/applicants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_status',
          ids: Array.from(selectedIds),
          status,
        }),
      });
      if (res.ok) {
        setMessage(`${selectedIds.size}명 지원자의 최종 상태가 [${status === 'final_pass' ? '최종합격' : '최종불합격'}]으로 확정되었습니다.`);
        setSelectedIds(new Set());
        await fetchCohortAndApplicants();
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePurgeData = async () => {
    if (purgeConfirmInput !== '데이터 삭제 확정') return;
    setLoading(true);
    try {
      const res = await fetch('/api/recruit/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cohortId: selectedCohortId,
          confirmText: purgeConfirmInput,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`지원의 인적사항 및 점수가 안전하게 일괄 폐기되었습니다.`);
        setShowPurgeModal(false);
        await fetchCohortAndApplicants();
      } else {
        setMessage(`폐기 실패: ${data.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-foreground mb-4">F9 최종 결정, 공개 스위치 및 폐기 (회장단)</h1>
      <RecruitNav />

      {/* 상단 옵션 패널 */}
      <div className="p-4 border border-border rounded-xl bg-card mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
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

        {/* 공개 스위치 2개 */}
        <div className="flex items-center gap-6 bg-muted/40 p-2 px-4 rounded-xl text-xs">
          <label className="flex items-center gap-2 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={schedulePublic}
              onChange={(e) => handleUpdateSwitches(e.target.checked, resultPublic)}
            />
            면접 일정/링크 공개
          </label>

          <label className="flex items-center gap-2 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={resultPublic}
              onChange={(e) => handleUpdateSwitches(schedulePublic, e.target.checked)}
            />
            최종합격 결과 공개
          </label>
        </div>

        <button
          type="button"
          onClick={() => setShowPurgeModal(true)}
          className="px-3.5 py-2 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground text-xs font-bold rounded-lg transition-colors"
        >
          🗑️ 모집 종료 지원자 데이터 폐기
        </button>
      </div>

      {message && <div className="p-3 mb-4 bg-muted border rounded-lg text-xs font-medium text-foreground">{message}</div>}

      {/* 일괄 확정 조작 바 */}
      <div className="flex items-center justify-between mb-3 text-xs">
        <span className="text-muted-foreground font-medium">
          선택된 지원자: <strong>{selectedIds.size}명</strong>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading || selectedIds.size === 0}
            onClick={() => handleConfirmFinalStatus('final_pass')}
            className="px-3 py-1.5 bg-primary text-primary-foreground font-bold rounded-lg disabled:opacity-50"
          >
            선택 {selectedIds.size}명 최종 합격 확정
          </button>
          <button
            type="button"
            disabled={loading || selectedIds.size === 0}
            onClick={() => handleConfirmFinalStatus('final_fail')}
            className="px-3 py-1.5 bg-destructive text-destructive-foreground font-bold rounded-lg disabled:opacity-50"
          >
            선택 {selectedIds.size}명 최종 불합격 처리
          </button>
        </div>
      </div>

      {/* 최종 점수 및 집계 테이블 */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <table className="w-full text-xs text-left">
          <thead className="bg-muted text-muted-foreground font-semibold">
            <tr>
              <th className="p-3 w-10 text-center">선택</th>
              <th className="p-3">이름</th>
              <th className="p-3">학교 / 학과</th>
              <th className="p-3">서류 평균</th>
              <th className="p-3">면접 평균</th>
              <th className="p-3">채점 경고 / 상태</th>
              <th className="p-3">현재 상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedApplicants.map((app) => {
              const agg = aggregations[app.id];
              const isSelected = selectedIds.has(app.id);
              const hasNoInterviewScore = app.slotId && (agg?.interviewScorerCount ?? 0) === 0;

              return (
                <tr key={app.id} className={`hover:bg-accent/50 ${isSelected ? 'bg-primary/5' : ''}`}>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(app.id)}
                    />
                  </td>
                  <td className="p-3 font-bold text-foreground">{app.name}</td>
                  <td className="p-3">{app.school} {app.department}</td>
                  <td className="p-3">{agg?.docScoreAvg !== null ? `${agg?.docScoreAvg}점` : '-'}</td>
                  <td className="p-3">
                    {agg?.interviewScoreAvg !== null ? (
                      <span className="font-bold text-primary text-sm">{agg?.interviewScoreAvg}점</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    {hasNoInterviewScore && (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded font-medium text-[10px]">
                        ⚠️ 면접 기록 없음
                      </span>
                    )}
                    {app.status === 'interview_noshow' && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded font-medium text-[10px]">
                        🚨 면접 불참 (noshow)
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      app.status === 'final_pass' ? 'bg-green-100 text-green-800' :
                      app.status === 'final_fail' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {app.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 2단계 확인 데이터 폐기 모달 */}
      {showPurgeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border p-6 rounded-2xl max-w-md w-full space-y-4 shadow-xl">
            <h2 className="text-lg font-bold text-destructive">⚠️ 모집 데이터 일괄 폐기 (되돌릴 수 없음)</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              모집이 완료되면 지원자의 이름, 연락처, 자기소개서, 채점 기록 및 메모가 전량 영구 삭제됩니다.
              익명 수치 통계(지원자 수, 합격자 수, 평균 점수)만 아카이브에 유지됩니다.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">
                확인을 위해 <span className="text-destructive font-bold">데이터 삭제 확정</span> 을 입력하세요:
              </label>
              <input
                type="text"
                value={purgeConfirmInput}
                onChange={(e) => setPurgeConfirmInput(e.target.value)}
                placeholder="데이터 삭제 확정"
                className="w-full p-2 border border-input rounded-lg text-xs bg-background"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPurgeModal(false)}
                className="px-3 py-1.5 text-xs rounded-lg border border-input text-foreground hover:bg-accent"
              >
                취소
              </button>
              <button
                type="button"
                disabled={loading || purgeConfirmInput !== '데이터 삭제 확정'}
                onClick={handlePurgeData}
                className="px-4 py-1.5 text-xs font-bold bg-destructive text-destructive-foreground rounded-lg disabled:opacity-50"
              >
                영구 폐기 실행
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
