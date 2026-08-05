'use client';

import { HelpButton } from '@/components/help-button';
import type { Role } from '@/auth/permissions';
import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/icon';
import { useTeams } from '@/components/use-teams';
import { matchesTeamFilter } from '@/recruit/team-filter';
import type { ApplicantAggregate } from '@/recruit/aggregate';
import { recruitStatusBadge, BADGE_TONE_CLASS } from '@/recruit/status-label';
import { formatScore, docSampleState } from '@/recruit/display';
import { RecruitNav } from '@/components/recruit-nav';
import { Banner, Card, CardField, DangerButton, Input, RowCard, SecondaryButton, StatusMessage, TableCards, TeamOptions, ToolbarSelect } from '@/components/ui';

// 표(PC)와 카드(모바일)가 같은 조각을 쓰도록 뽑아 둔다 — 한쪽만 고치는 사고를 막는다.
function SampleChip({ sample }: { sample: string }) {
  if (sample === 'unscored')
    return (
      <span className="inline-flex items-center rounded-md bg-coral-100 px-1.5 py-0.5 text-[10px] font-bold text-coral-700">
        <Icon name="alert" size={12} className="inline" /> 아무도 안 봄
      </span>
    );
  if (sample === 'deficient')
    return (
      <span className="inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
        <Icon name="alert" size={12} className="inline" /> 표본 부족 (&lt;3)
      </span>
    );
  return null;
}

function StatusChip({ status }: { status: string }) {
  const b = recruitStatusBadge(status);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${BADGE_TONE_CLASS[b.tone]}`}
    >
      <i className="h-1.5 w-1.5 rounded-full bg-current" />
      {b.label}
    </span>
  );
}

export function RecruitTallyPanel({ role }: { role: Role }) {
  const [cohorts, setCohorts] = useState<any[]>([]);
  // 기수 목록을 받아오는 동안 셀렉트에 표시한다(빈 드롭다운 = '기수 없음' 오해 방지).
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const { teams, loading: teamsLoading } = useTeams(selectedCohortId);
  const [applicants, setApplicants] = useState<any[]>([]);
  const [aggregations, setAggregations] = useState<Record<string, ApplicantAggregate>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTeam, setSelectedTeam] = useState('ALL');
  const [topNInput, setTopNInput] = useState('20');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

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
    // 두 요청은 서로를 기다릴 이유가 없다. 집계 화면은 자기소개서를 쓰지 않으므로 slim 으로 받는다.
    const [appRes, scoreRes] = await Promise.all([
      fetch(`/api/recruit/applicants?cohortId=${selectedCohortId}&slim=1`),
      fetch(`/api/recruit/scores?cohortId=${selectedCohortId}`),
    ]);
    const [appData, scoreData] = await Promise.all([appRes.json(), scoreRes.json()]);
    if (appData.applicants) setApplicants(appData.applicants);
    if (scoreData.aggregations) setAggregations(scoreData.aggregations);
  }, [selectedCohortId]);

  useEffect(() => {
    fetchCohorts();
  }, [fetchCohorts]);

  useEffect(() => {
    if (selectedCohortId) {
      fetchApplicantsAndScores();
    }
  }, [selectedCohortId, fetchApplicantsAndScores]);

  // 팀·기수를 바꾸면 선택을 푼다. 안 그러면 1팀에서 고른 20명이 2팀 화면에서도 그대로 남아,
  // 보이지 않는 사람들이 함께 확정된다.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedTeam, selectedCohortId]);

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

  // 0명과 1~2명은 다른 사실이다 — 전자는 아무도 읽지 않은 것이고, 후자는 표본이 얕은 것이다.
  const unscoredCount = filteredApplicants.filter(
    (a) => docSampleState(aggregations[a.id]?.docScorerCount ?? 0) === 'unscored'
  ).length;
  const deficientCount = filteredApplicants.filter(
    (a) => docSampleState(aggregations[a.id]?.docScorerCount ?? 0) === 'deficient'
  ).length;

  // 한 줄에서 뽑아 쓰는 값을 여기서 한 번만 계산한다. 표와 카드가 각자 계산하면
  // 한쪽만 고쳐 놓고 못 알아채는 일이 생긴다.
  const rows = filteredApplicants.map((app, idx) => {
    const agg = aggregations[app.id];
    const docAvg = formatScore(agg?.docScoreAvg);
    const scorerCount = agg?.docScorerCount ?? 0;
    return {
      app,
      docAvg,
      scorerCount,
      // 미채점자에게 석차를 붙이면 '최하위'로 읽힌다 — 순위가 없는 것과 꼴찌는 다르다.
      rank: docAvg === null ? null : idx + 1,
      sample: docSampleState(scorerCount),
      effectiveTeam: app.assignedTeam || app.wishTeam1 || '-',
    };
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
          // 서버가 이 기수 소속만 바꾸도록 범위를 함께 보낸다.
          cohortId: selectedCohortId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // 제외 사유를 뭉뚱그리면 다른 기수를 고른 실수를 단계 문제로 오해한다.
        const reasons = [
          data.skippedCount ? `${data.skippedCount}명은 이미 확정됐거나 단계가 맞지 않음` : '',
          data.outOfScopeCount ? `${data.outOfScopeCount}명은 이 기수 소속이 아님` : '',
        ].filter(Boolean);
        const skipped = reasons.length > 0 ? ` (제외: ${reasons.join(', ')})` : '';
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
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-bold text-ink-900">2. 서류 집계 및 서류 합격 확정 (회장단)</h1>
            <HelpButton screen="recruit-tally" />
          </div>
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

      <RecruitNav role={role} />

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
            <div className="text-xs font-semibold text-ink-500">손봐야 할 지원자</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className={`text-2xl font-bold ${unscoredCount > 0 ? 'text-coral-600' : 'text-ink-400'}`}>
                {unscoredCount}명
                <span className="ml-1 text-xs font-semibold text-ink-500">미채점</span>
              </span>
              <span className={`text-2xl font-bold ${deficientCount > 0 ? 'text-warning-700' : 'text-ink-400'}`}>
                {deficientCount}명
                <span className="ml-1 text-xs font-semibold text-ink-500">표본 부족</span>
              </span>
            </div>
          </div>
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              unscoredCount + deficientCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-cream-100 text-ink-400'
            }`}
          >
            <Icon name="alert" size={20} />
          </span>
        </Card>
      </div>

      {/* 두 경고를 한 문장으로 뭉치면 "0명이 채점받았습니다" 같은 말이 된다. 따로 말한다. */}
      {unscoredCount > 0 && (
        <Banner kind="warning" title="아직 아무도 보지 않은 지원자">
          {unscoredCount}명은 채점한 운영진이 <strong>한 명도 없습니다.</strong> 이대로 넘어가면 검토 없이
          떨어집니다. 확정 전에 운영진에게 서류 심사를 요청하세요.
        </Banner>
      )}
      {deficientCount > 0 && (
        <Banner kind="warning" title="심사 표본 부족 안내">
          {deficientCount}명의 지원자가 3명 미만의 운영진에게만 채점받았습니다. 집계 신뢰도를 위해 추가 서류 심사를 권장합니다.
        </Banner>
      )}

      {/* 일괄 액션 바 */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cream-200 pb-4">
          {/* 360px 에서 "상위 석차 자동 선택 + 입력칸 + 버튼"이 한 줄에 들어가지 않는다 — 접히게 둔다. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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

        {/* 집계 목록 — 노트북은 표, 폰·태블릿은 카드(TableCards 주석 참고). */}
        <TableCards
          table={
            <table className="w-full text-left text-xs">
              <thead className="bg-cream-100 font-semibold text-ink-700">
                <tr>
                  <th className="w-10 p-3.5 text-center">선택</th>
                  <th className="w-12 p-3.5 text-center">석차</th>
                  <th className="p-3.5">이름</th>
                  <th className="p-3.5">학교 / 학과</th>
                  <th className="p-3.5">소속 배정팀 (1지망)</th>
                  <th className="p-3.5">서류 평균 점수</th>
                  <th className="p-3.5">채점 인원</th>
                  <th className="p-3.5">현재 상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {rows.map(({ app, docAvg, scorerCount, rank, sample, effectiveTeam }) => {
                  const isSelected = selectedIds.has(app.id);
                  return (
                    <tr key={app.id} className={`transition-colors hover:bg-cream-25 ${isSelected ? 'bg-blue-50/50' : ''}`}>
                      <td className="p-0 text-center">
                        {/* 라벨로 감싸 셀 전체를 누를 수 있게 한다 — 16px 네모만 노리면 자꾸 빗나간다. */}
                        <label className="flex min-h-tap cursor-pointer items-center justify-center px-3.5" aria-label={`${app.name} 선택`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(app.id)}
                            className="h-5 w-5 rounded border-ink-300 text-blue-600 focus:ring-blue-500"
                          />
                        </label>
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-ink-500">
                        {rank === null ? <span className="text-ink-300">-</span> : rank}
                      </td>
                      <td className="p-3.5 text-sm font-bold text-ink-900">{app.name}</td>
                      <td className="p-3.5 text-ink-700">
                        {app.school} {app.department}
                      </td>
                      <td className="p-3.5 font-semibold text-ink-700">
                        {effectiveTeam} <span className="text-[11px] font-normal text-ink-400">({app.wishTeam1 || '-'})</span>
                      </td>
                      <td className="p-3.5">
                        {docAvg !== null ? (
                          <span className="text-sm font-bold text-blue-700">{docAvg}점</span>
                        ) : (
                          <span className="text-ink-400">미채점</span>
                        )}
                      </td>
                      <td className="p-3.5 text-ink-700">
                        <span className="font-semibold">{scorerCount}명</span>
                        <span className="ml-2">
                          <SampleChip sample={sample} />
                        </span>
                      </td>
                      <td className="p-3.5">
                        <StatusChip status={app.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          }
          cards={rows.map(({ app, docAvg, scorerCount, rank, sample, effectiveTeam }) => (
            <RowCard
              key={app.id}
              selected={selectedIds.has(app.id)}
              onSelect={() => handleToggleSelect(app.id)}
              selectLabel={`${app.name} 선택`}
              badge={<StatusChip status={app.status} />}
              title={
                <span className="flex items-baseline gap-2">
                  {/* 석차는 카드에서도 맨 앞에 둔다 — 정렬 근거가 보이지 않으면 목록 순서가 임의로 보인다. */}
                  <span className="font-mono text-[13px] font-bold text-ink-400">{rank === null ? '-' : rank}</span>
                  {app.name}
                </span>
              }
            >
              <CardField label="학교 / 학과">
                {app.school} {app.department}
              </CardField>
              <CardField label="배정팀 (1지망)">
                <span className="font-semibold">{effectiveTeam}</span>{' '}
                <span className="text-[11px] text-ink-400">({app.wishTeam1 || '-'})</span>
              </CardField>
              <CardField label="서류 평균">
                {docAvg !== null ? <span className="font-bold text-blue-700">{docAvg}점</span> : <span className="text-ink-400">미채점</span>}
              </CardField>
              <CardField label="채점 인원">
                <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                  <span className="font-semibold">{scorerCount}명</span>
                  <SampleChip sample={sample} />
                </span>
              </CardField>
            </RowCard>
          ))}
        />
      </Card>
    </div>
  );
}
