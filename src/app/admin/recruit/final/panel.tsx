'use client';

import React, { useState, useEffect } from 'react';
import { RecruitNav } from '@/components/recruit-nav';
import { Button, Card, DangerButton, Field, Input, SecondaryButton, Select } from '@/components/ui';

export function RecruitFinalPanel() {
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
        setMessage('✅ 공개 스위치 설정이 변경되었습니다.');
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_status',
          ids: Array.from(selectedIds),
          status,
        }),
      });
      if (res.ok) {
        setMessage(`✅ ${selectedIds.size}명 지원자의 최종 상태가 [${status === 'final_pass' ? '최종 합격' : '최종 불합격'}]으로 확정되었습니다.`);
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
        setMessage(`✅ 모집 종료 데이터(지원서, 채점기록, 개인메모)가 일괄 파기 완료되었습니다.`);
        setShowPurgeModal(false);
        await fetchCohortAndApplicants();
      } else {
        setMessage(`❌ 파기 실패: ${data.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900">6. 최종 결정 및 데이터 관리 (회장단)</h1>
          <p className="mt-1 text-sm text-ink-500">최종 합격자 결정, 지원자 조회 스위치 설정 및 개인정보 안전 일괄 파기.</p>
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

      {/* 공개 스위치 & 데이터 폐기 컨트롤 바 */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6 rounded-2xl bg-cream-50 border border-cream-200 p-3 px-5">
            <label className="flex items-center gap-2.5 cursor-pointer font-bold text-xs text-ink-900">
              <input
                type="checkbox"
                checked={schedulePublic}
                onChange={(e) => handleUpdateSwitches(e.target.checked, resultPublic)}
                className="h-4 w-4 rounded border-ink-300 text-blue-600 focus:ring-blue-500"
              />
              <span>면접 일정/링크 지원자 공개</span>
            </label>

            <div className="h-4 w-px bg-cream-200" />

            <label className="flex items-center gap-2.5 cursor-pointer font-bold text-xs text-ink-900">
              <input
                type="checkbox"
                checked={resultPublic}
                onChange={(e) => handleUpdateSwitches(schedulePublic, e.target.checked)}
                className="h-4 w-4 rounded border-ink-300 text-blue-600 focus:ring-blue-500"
              />
              <span>최종 합격 결과 지원자 공개</span>
            </label>
          </div>

          <DangerButton
            type="button"
            onClick={() => setShowPurgeModal(true)}
            className="h-control"
          >
            🗑️ 모집 종료 PII 데이터 일괄 파기
          </DangerButton>
        </div>

        {message && (
          <div className="rounded-xl border border-cream-200 bg-cream-50 p-3 text-xs font-semibold text-ink-900">
            {message}
          </div>
        )}
      </Card>

      {/* 최종 합격 결정 매트릭스 카드 */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between border-b border-cream-200 pb-3">
          <span className="text-sm font-bold text-ink-900">
            최종 결정 매트릭스 ({applicants.length}명)
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-500 font-semibold mr-1">
              선택: <strong className="text-blue-600">{selectedIds.size}명</strong>
            </span>
            <Button
              type="button"
              disabled={loading || selectedIds.size === 0}
              onClick={() => handleConfirmFinalStatus('final_pass')}
            >
              선택 {selectedIds.size}명 최종 합격 확정
            </Button>
            <DangerButton
              type="button"
              disabled={loading || selectedIds.size === 0}
              onClick={() => handleConfirmFinalStatus('final_fail')}
            >
              선택 {selectedIds.size}명 최종 불합격 처리
            </DangerButton>
          </div>
        </div>

        {/* 종합 점수 테이블 */}
        <div className="overflow-x-auto rounded-xl border border-cream-200 bg-white shadow-card">
          <table className="w-full text-xs text-left">
            <thead className="bg-cream-100 text-ink-700 font-semibold">
              <tr>
                <th className="p-3.5 w-10 text-center">선택</th>
                <th className="p-3.5">이름</th>
                <th className="p-3.5">학교 / 학과</th>
                <th className="p-3.5">서류 평균 점수</th>
                <th className="p-3.5">면접 평균 점수</th>
                <th className="p-3.5">특이사항 경고</th>
                <th className="p-3.5">최종 상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {sortedApplicants.map((app) => {
                const agg = aggregations[app.id];
                const isSelected = selectedIds.has(app.id);
                const hasNoInterviewScore = app.slotId && (agg?.interviewScorerCount ?? 0) === 0;

                return (
                  <tr key={app.id} className={`hover:bg-cream-25 transition-colors ${isSelected ? 'bg-blue-50/50' : ''}`}>
                    <td className="p-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(app.id)}
                        className="h-4 w-4 rounded border-ink-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="p-3.5 font-bold text-ink-900 text-sm">{app.name}</td>
                    <td className="p-3.5 text-ink-700">{app.school} {app.department}</td>
                    <td className="p-3.5 text-ink-700">{agg?.docScoreAvg !== null && agg?.docScoreAvg !== undefined ? `${agg.docScoreAvg}점` : '-'}</td>
                    <td className="p-3.5">
                      {agg?.interviewScoreAvg !== null && agg?.interviewScoreAvg !== undefined ? (
                        <span className="font-bold text-blue-700 text-sm">{agg.interviewScoreAvg}점</span>
                      ) : (
                        <span className="text-ink-400">-</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {hasNoInterviewScore && (
                        <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          ⚠️ 면접 채점 미기록
                        </span>
                      )}
                      {app.status === 'interview_noshow' && (
                        <span className="inline-flex items-center rounded-md bg-coral-100 px-2 py-0.5 text-[10px] font-bold text-coral-700">
                          🚨 면접 불참
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 font-semibold">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] ${
                        app.status === 'final_pass'
                          ? 'bg-success-100 text-success-700'
                          : app.status === 'final_fail'
                          ? 'bg-coral-100 text-coral-700'
                          : 'bg-cream-100 text-ink-700'
                      }`}>
                        <i className="h-1.5 w-1.5 rounded-full bg-current" />
                        {app.status === 'final_pass' ? '최종합격' : app.status === 'final_fail' ? '최종불합격' : app.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 데이터 파기 모달 */}
      {showPurgeModal && (
        <div className="fixed inset-0 bg-ink-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 space-y-4 shadow-modal border-coral-200">
            <h2 className="text-lg font-bold text-coral-700 flex items-center gap-2">
              🚨 모집 종료 데이터 영구 일괄 파기
            </h2>
            <p className="text-xs text-ink-500 leading-relaxed">
              모집 프로세스가 완료된 후 지원자의 이름, 연락처, 자기소개서, 개별 채점 기록 및 개인 메모를 안전하게 영구 파기합니다. 익명 통계(총 수치)만 보존됩니다.
            </p>

            <div className="space-y-2">
              <Field label="확인 문구 입력">
                <Input
                  type="text"
                  value={purgeConfirmInput}
                  onChange={(e) => setPurgeConfirmInput(e.target.value)}
                  placeholder="데이터 삭제 확정"
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton type="button" onClick={() => setShowPurgeModal(false)}>
                취소
              </SecondaryButton>
              <DangerButton
                type="button"
                disabled={loading || purgeConfirmInput !== '데이터 삭제 확정'}
                onClick={handlePurgeData}
              >
                영구 파기 실행
              </DangerButton>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
