'use client';

import React, { useState, useEffect } from 'react';
import { RecruitNav } from '@/components/recruit-nav';

export default function RecruitTallyPage() {
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
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_status',
          ids: Array.from(selectedIds),
          status: passStatus,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`${data.updatedCount}명 지원자의 상태가 [${passStatus === 'doc_pass' ? '서류합격' : '서류불합격'}]으로 확정되었습니다.`);
        setSelectedIds(new Set());
        await fetchApplicantsAndScores();
      } else {
        setMessage(`오류: ${data.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-foreground mb-4">F9 서류 집계 및 서류 합격 확정 (회장단)</h1>
      <RecruitNav />

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
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

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">상위</span>
            <input
              type="number"
              value={topNInput}
              onChange={(e) => setTopNInput(e.target.value)}
              className="w-16 p-1 border rounded text-xs text-center bg-background"
            />
            <span className="text-xs text-muted-foreground">명</span>
            <button
              type="button"
              onClick={handleSelectTopN}
              className="px-2.5 py-1 bg-secondary text-secondary-foreground text-xs rounded font-medium"
            >
              자동 선택
            </button>
          </div>

          <button
            type="button"
            disabled={loading || selectedIds.size === 0}
            onClick={() => handleConfirmDocPass('doc_pass')}
            className="px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg disabled:opacity-50"
          >
            선택 {selectedIds.size}명 서류 합격 확정
          </button>

          <button
            type="button"
            disabled={loading || selectedIds.size === 0}
            onClick={() => handleConfirmDocPass('doc_fail')}
            className="px-3.5 py-1.5 bg-destructive text-destructive-foreground text-xs font-bold rounded-lg disabled:opacity-50"
          >
            선택 {selectedIds.size}명 불합격 처리
          </button>
        </div>
      </div>

      {message && <div className="p-3 mb-4 bg-muted border rounded-lg text-xs font-medium text-foreground">{message}</div>}

      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <table className="w-full text-xs text-left">
          <thead className="bg-muted text-muted-foreground font-semibold">
            <tr>
              <th className="p-3 w-10 text-center">선택</th>
              <th className="p-3">순위</th>
              <th className="p-3">이름</th>
              <th className="p-3">학교 / 학과</th>
              <th className="p-3">1지망 팀</th>
              <th className="p-3">서류 평균</th>
              <th className="p-3">채점 인원</th>
              <th className="p-3">현재 상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedApplicants.map((app, idx) => {
              const agg = aggregations[app.id];
              const isSelected = selectedIds.has(app.id);
              const isDeficient = agg?.isDocSampleDeficient;

              return (
                <tr key={app.id} className={`hover:bg-accent/50 ${isSelected ? 'bg-primary/5' : ''}`}>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(app.id)}
                    />
                  </td>
                  <td className="p-3 font-mono font-bold text-muted-foreground">{idx + 1}</td>
                  <td className="p-3 font-bold text-foreground">{app.name}</td>
                  <td className="p-3">{app.school} {app.department}</td>
                  <td className="p-3">{app.wishTeam1 || '-'}</td>
                  <td className="p-3">
                    {agg?.docScoreAvg !== null && agg?.docScoreAvg !== undefined ? (
                      <span className="font-bold text-primary text-sm">{agg.docScoreAvg}점</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    {agg?.docScorerCount ?? 0}명
                    {isDeficient && (
                      <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded text-[10px] font-medium">
                        ⚠️ 표본 부족 (&lt;3명)
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-medium">
                    <span className={`px-2 py-0.5 rounded text-[11px] ${
                      app.status === 'doc_pass' ? 'bg-green-100 text-green-800' :
                      app.status === 'doc_fail' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
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
    </div>
  );
}
