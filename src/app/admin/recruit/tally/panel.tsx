'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@/components/icon';
import { useTeams } from '@/components/use-teams';
import { matchesTeamFilter } from '@/recruit/team-filter';
import { RecruitNav } from '@/components/recruit-nav';
import { Banner, Card, DangerButton, Input, SecondaryButton, StatusMessage, TeamOptions, ToolbarSelect } from '@/components/ui';

export function RecruitTallyPanel() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  // 기수 목록을 받아오는 동안 셀렉트에 표시한다(빈 드롭다운 = '기수 없음' 오해 방지).
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const { teams, loading: teamsLoading } = useTeams(selectedCohortId);
  const [applicants, setApplicants] = useState<any[]>([]);
  const [aggregations, setAggregations] = useState<Record<string, any>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTeam, setSelectedTeam] = useState('ALL');
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

  // 팀·기수를 바꾸면 선택을 푼다. 안 그러면 1팀에서 고른 20명이 2팀 화면에서도 그대로 남아,
  // 보이지 않는 사람들이 함께 확정된다.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedTeam, selectedCohortId]);

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

  const filteredApplicants = sortedApplicants.filter((app) => matchesTeamFilter(app, selectedTeam));

  // 팀을 고르면 집계도 그 팀 기준이어야 한다 — 팀별로 나눠 보는 화면인데 KPI 만 전체를 세면
  // "1팀 지원자 12명인데 합격자 31명" 같은 숫자가 나온다.
  const docPassCount = filteredApplicants.filter((a) =>
    ['doc_pass', 'interview_done', 'interview_noshow', 'final_pass', 'final_fail'].includes(a.status)
  ).length;

  const deficientCount = filteredApplicants.filter((a) => aggregations[a.id]?.isDocSampleDeficient).length;

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectTopN = () => {
    const count = parseInt(topNInput, 10);
    if (isNaN(count) || count <= 0) return;
    // 지금 보고 있는 팀 안에서 고른다. 예전엔 전체에서 골라, 1팀만 보면서 "상위 20명"을 눌러도
    // 화면에 없는 다른 팀 지원자가 선택되어 그대로 확정될 수 있었다.
    const topN = filteredApplicants.slice(0, count).map((a) => a.id);
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
        const skipped = data.skippedCount ? ` (${data.skippedCount}명은 이미 확정됐거나 단계가 맞지 않아 제외)` : '';
        setMessage(`✅ ${data.updatedCount}명을 [${passStatus === 'doc_pass' ? '서류 합격' : '서류 불합격'}]으로 확정했습니다.${skipped}`);
        setSelectedIds(new Set());
        await fetchApplicantsAndScores();
      } else {
        setMessage(`❌ 오류: ${data.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-[24px] font-bold text-ink-900">2. 서류 집계 및 서류 합격 확정 (회장단)</h1>
          <p className="mt-1 text-sm text-ink-500">운영진 심사 결과를 팀별 종합 집계하여 면접 대상자(서류 합격자)를 일괄 결정합니다.</p>
        </div>

        {/* 라벨을 컨트롤 밖에 떠 있는 텍스트로 두면 정렬이 흐트러진다 — 라벨을 컨트롤 안에 붙인다.
            높이도 h-control-sm 하나로 통일(예전엔 48px 컨트롤에 12px 글씨라 비어 보였다). */}
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSelect
            label="팀"
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

      {/* KPI 통계 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center justify-between p-4">
          <div>
            <div className="text-xs font-semibold text-ink-500">
              {selectedTeam === 'ALL' ? '총 지원자 수' : `지원자 수 (${selectedTeam})`}
            </div>
            <div className="text-2xl font-bold text-ink-900 mt-1">
              {filteredApplicants.length}명
              {selectedTeam !== 'ALL' && (
                <span className="ml-1 text-sm font-medium text-ink-400">/ 전체 {applicants.length}명</span>
              )}
            </div>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Icon name="users" size={20} />
          </span>
        </Card>

        <Card className="flex items-center justify-between p-4">
          <div>
            <div className="text-xs font-semibold text-ink-500">현재 서류 합격자</div>
            <div className="text-2xl font-bold text-success mt-1">{docPassCount}명</div>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-100 text-success">
            <Icon name="check" size={20} />
          </span>
        </Card>

        <Card className="flex items-center justify-between p-4">
          <div>
            <div className="text-xs font-semibold text-ink-500">표본 부족 경고 (&lt;3명)</div>
            <div className={`text-2xl font-bold mt-1 ${deficientCount > 0 ? 'text-warning-700' : 'text-ink-400'}`}>
              {deficientCount}명
            </div>
          </div>
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${deficientCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-cream-100 text-ink-400'}`}>
            <Icon name="alert" size={20} />
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
                uiSize="sm"
                min={1}
                aria-label="자동 선택할 상위 인원 수"
                value={topNInput}
                onChange={(e) => setTopNInput(e.target.value)}
                className="w-20 min-h-tap text-center font-bold"
              />
              <span className="text-xs text-ink-500 font-semibold">명</span>
              <SecondaryButton type="button" onClick={handleSelectTopN}>
                상위 N명 선택
              </SecondaryButton>
            </div>
          </div>

          {/* 한 줄 안의 컨트롤 높이를 36px 로 통일한다.
              예전엔 셀렉트(h-9)·확정 버튼(48px)·불합격 버튼(36px)이 뒤섞여 들쭉날쭉했다. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[13px] font-semibold text-ink-500">
              선택 <strong className="font-bold text-blue-600">{selectedIds.size}명</strong>
            </span>
            <ToolbarSelect
              label="팀 이관"
              disabled={loading || selectedIds.size === 0}
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  handleBulkReassignTeam(e.target.value);
                }
              }}
            >
              <option value="">선택…</option>
                <TeamOptions teams={teams} loading={teamsLoading} />
              </ToolbarSelect>

            <SecondaryButton
              type="button"
              disabled={loading || selectedIds.size === 0}
              onClick={() => handleConfirmDocPass('doc_pass')}
              className="border-success bg-success-100 text-success-700 hover:bg-success-100/70"
            >
              서류합격 확정
            </SecondaryButton>
            <DangerButton
              type="button"
              disabled={loading || selectedIds.size === 0}
              onClick={() => handleConfirmDocPass('doc_fail')}
            >
              불합격 처리
            </DangerButton>
          </div>
        </div>

        <StatusMessage text={message} />

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
                          <Icon name="alert" size={12} className="inline" /> 표본 부족 (&lt;3)
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
