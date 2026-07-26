'use client';

import React, { useState, useEffect } from 'react';
import { RecruitNav } from '@/components/recruit-nav';
import { Banner, Button, Card, DangerButton, Input, SecondaryButton, Select } from '@/components/ui';

export function RecruitTallyPanel() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [applicants, setApplicants] = useState<any[]>([]);
  const [aggregations, setAggregations] = useState<Record<string, any>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [topNInput, setTopNInput] = useState('20');
  const [loading, setLoading] = useState(false);
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
    }

    const scoreRes = await fetch(`/api/recruit/scores?cohortId=${selectedCohortId}`);
    const scoreData = await scoreRes.json();
    if (scoreData.aggregations) {
      setAggregations(scoreData.aggregations);
    }
  };

  // 서류 평균 내림차순 정렬
  const sortedApplicants = [...applicants].sort((a, b) => {
    const avgA = aggregations[a.id]?.docScoreAvg ?? -1;
    const avgB = aggregations[b.id]?.docScoreAvg ?? -1;
    return avgB - avgA;
  });

  const docPassCount = applicants.filter((a) =>
    ['doc_pass', 'interview_done', 'interview_noshow', 'final_pass', 'final_fail'].includes(a.status)
  ).length;

  const deficientCount = applicants.filter((a) => aggregations[a.id]?.isDocSampleDeficient).length;

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectTopN = () => {
    const count = parseInt(topNInput, 10);
    if (isNaN(count) || count <= 0) return;
    const topN = sortedApplicants.slice(0, count).map((a) => a.id);
    setSelectedIds(new Set(topN));
  };

  const handleConfirmDocPass = async (passStatus: 'doc_pass' | 'doc_fail') => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/recruit/applicants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_status',
          ids: Array.from(selectedIds),
          status: passStatus,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ 총 ${data.updatedCount}명 지원자의 상태가 [${passStatus === 'doc_pass' ? '서류 합격' : '서류 불합격'}]으로 확정되었습니다.`);
        setSelectedIds(new Set());
        await fetchApplicantsAndScores();
      } else {
        setMessage(`❌ 오류: ${data.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const [selectedTeam, setSelectedTeam] = useState('ALL');

  const filteredApplicants = sortedApplicants.filter((app) => {
    if (selectedTeam === 'ALL') return true;
    const effectiveTeam = app.assignedTeam || app.wishTeam1;
    return effectiveTeam === selectedTeam || app.wishTeam1 === selectedTeam || app.wishTeam2 === selectedTeam;
  });

  const handleBulkReassignTeam = async (newTeam: string) => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/recruit/applicants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_team',
          ids: Array.from(selectedIds),
          assignedTeam: newTeam,
        }),
      });

      if (res.ok) {
        setMessage(`✅ 선택한 지원자 ${selectedIds.size}명의 팀이 [${newTeam}](으)로 변경되었습니다.`);
        setSelectedIds(new Set());
        await fetchApplicantsAndScores();
      } else {
        const data = await res.json();
        setMessage(`❌ 팀 이관 실패: ${data.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900">3. 서류 집계 및 서류 합격 확정 (회장단)</h1>
          <p className="mt-1 text-sm text-ink-500">운영진 심사 결과를 팀별 종합 집계하여 면접 대상자(서류 합격자)를 일괄 결정합니다.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-ink-700">팀 필터:</span>
            <Select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)} className="w-36 text-xs">
              <option value="ALL">전체 팀 보기</option>
              <option value="봉사 1팀">봉사 1팀</option>
              <option value="봉사 2팀">봉사 2팀</option>
              <option value="기획팀">기획팀</option>
              <option value="홍보팀">홍보팀</option>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-ink-700">기수:</span>
            <Select
              value={selectedCohortId}
              onChange={(e) => setSelectedCohortId(e.target.value)}
              className="w-40 text-xs"
            >
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <RecruitNav />

      {/* KPI 통계 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center justify-between p-4">
          <div>
            <div className="text-xs font-semibold text-ink-500">총 지원자 수</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{applicants.length}명</div>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold">
            All
          </span>
        </Card>

        <Card className="flex items-center justify-between p-4">
          <div>
            <div className="text-xs font-semibold text-ink-500">현재 서류 합격자</div>
            <div className="text-2xl font-bold text-success mt-1">{docPassCount}명</div>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-100 text-success font-bold">
            Pass
          </span>
        </Card>

        <Card className="flex items-center justify-between p-4">
          <div>
            <div className="text-xs font-semibold text-ink-500">표본 부족 경고 (&lt;3명)</div>
            <div className={`text-2xl font-bold mt-1 ${deficientCount > 0 ? 'text-warning-700' : 'text-ink-400'}`}>
              {deficientCount}명
            </div>
          </div>
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold ${deficientCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-cream-100 text-ink-400'}`}>
            ⚠️
          </span>
        </Card>
      </div>

      {deficientCount > 0 && (
        <Banner kind="warning" title="심사 표본 부족 안내">
          {deficientCount}명의 지원자가 3명 미만의 운영진에게만 채점받았습니다. 집계 신뢰도를 위해 추가 서류 심사를 권장합니다.
        </Banner>
      )}

      {/* 일괄 액션 바 */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cream-200 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-ink-900">상위 석차 자동 선택:</span>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                value={topNInput}
                onChange={(e) => setTopNInput(e.target.value)}
                className="w-20 text-center font-bold"
              />
              <span className="text-xs text-ink-500 font-semibold">명</span>
              <SecondaryButton type="button" onClick={handleSelectTopN}>
                상위 N명 선택
              </SecondaryButton>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-500 font-semibold mr-1">
              선택됨: <strong className="text-blue-600 font-bold">{selectedIds.size}명</strong>
            </span>
            <Select
              disabled={loading || selectedIds.size === 0}
              onChange={(e) => {
                if (e.target.value) {
                  handleBulkReassignTeam(e.target.value);
                  e.target.value = '';
                }
              }}
              className="w-36 text-xs h-9"
            >
              <option value="">선택 팀으로 이관…</option>
              <option value="봉사 1팀">봉사 1팀</option>
              <option value="봉사 2팀">봉사 2팀</option>
              <option value="기획팀">기획팀</option>
              <option value="홍보팀">홍보팀</option>
            </Select>

            <Button
              type="button"
              disabled={loading || selectedIds.size === 0}
              onClick={() => handleConfirmDocPass('doc_pass')}
            >
              선택 {selectedIds.size}명 서류합격 확정
            </Button>
            <DangerButton
              type="button"
              disabled={loading || selectedIds.size === 0}
              onClick={() => handleConfirmDocPass('doc_fail')}
            >
              선택 {selectedIds.size}명 불합격 처리
            </DangerButton>
          </div>
        </div>

        {message && (
          <div className="rounded-xl border border-cream-200 bg-cream-50 p-3 text-xs font-semibold text-ink-900">
            {message}
          </div>
        )}

        {/* 집계 표 */}
        <div className="overflow-x-auto rounded-xl border border-cream-200 bg-white shadow-card">
          <table className="w-full text-xs text-left">
            <thead className="bg-cream-100 text-ink-700 font-semibold">
              <tr>
                <th className="p-3.5 w-10 text-center">선택</th>
                <th className="p-3.5 w-12 text-center">석차</th>
                <th className="p-3.5">이름</th>
                <th className="p-3.5">학교 / 학과</th>
                <th className="p-3.5">소속 배정팀 (1지망)</th>
                <th className="p-3.5">서류 평균 점수</th>
                <th className="p-3.5">채점 인원</th>
                <th className="p-3.5">현재 상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {filteredApplicants.map((app, idx) => {
                const agg = aggregations[app.id];
                const isSelected = selectedIds.has(app.id);
                const isDeficient = agg?.isDocSampleDeficient;
                const effectiveTeam = app.assignedTeam || app.wishTeam1 || '-';

                return (
                  <tr key={app.id} className={`transition-colors hover:bg-cream-25 ${isSelected ? 'bg-blue-50/50' : ''}`}>
                    <td className="p-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(app.id)}
                        className="h-4 w-4 rounded border-ink-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-ink-500">{idx + 1}</td>
                    <td className="p-3.5 font-bold text-ink-900 text-sm">{app.name}</td>
                    <td className="p-3.5 text-ink-700">{app.school} {app.department}</td>
                    <td className="p-3.5 text-ink-700 font-semibold">{effectiveTeam} <span className="text-[11px] font-normal text-ink-400">({app.wishTeam1 || '-'})</span></td>
                    <td className="p-3.5">
                      {agg?.docScoreAvg !== null && agg?.docScoreAvg !== undefined ? (
                        <span className="font-bold text-blue-700 text-sm">{agg.docScoreAvg}점</span>
                      ) : (
                        <span className="text-ink-400">미채점</span>
                      )}
                    </td>
                    <td className="p-3.5 text-ink-700">
                      <span className="font-semibold">{agg?.docScorerCount ?? 0}명</span>
                      {isDeficient && (
                        <span className="ml-2 inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          ⚠️ 표본 부족 (&lt;3)
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 font-semibold">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] ${
                        ['doc_pass', 'interview_done', 'final_pass'].includes(app.status)
                          ? 'bg-success-100 text-success-700'
                          : ['doc_fail', 'final_fail'].includes(app.status)
                          ? 'bg-coral-100 text-coral-700'
                          : 'bg-cream-100 text-ink-700'
                      }`}>
                        <i className="h-1.5 w-1.5 rounded-full bg-current" />
                        {app.status === 'doc_pass'
                          ? '서류 합격'
                          : app.status === 'doc_fail'
                          ? '서류 불합격'
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
