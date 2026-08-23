'use client';

import { HelpButton } from '@/components/help-button';
import type { Role } from '@/auth/permissions';
import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/icon';
import { useTeams } from '@/components/use-teams';
import { matchesTeamFilter } from '@/recruit/team-filter';
import type { ApplicantAggregate } from '@/recruit/aggregate';
import { recruitStatusBadge, BADGE_TONE_CLASS } from '@/recruit/status-label';
import { formatScore } from '@/recruit/display';
import { RecruitNav } from '@/components/recruit-nav';
import { Button, Card, CardBlock, CardField, DangerButton, Field, Input, RowCard, SecondaryButton, Select, StatusMessage, TableCards, TeamOptions, ToolbarSelect } from '@/components/ui';

// 표(PC)와 카드(모바일)가 같은 조각을 쓰도록 뽑아 둔다 — 한쪽만 고치는 사고를 막는다.
function WarnChip({ warn }: { warn: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
        warn === '면접 불참' ? 'bg-coral-100 text-coral-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      <Icon name="alert" size={12} className="inline" /> {warn}
    </span>
  );
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

export function RecruitFinalPanel({ role }: { role: Role }) {
  const [cohorts, setCohorts] = useState<any[]>([]);
  // 기수 목록을 받아오는 동안 셀렉트에 표시한다(빈 드롭다운 = '기수 없음' 오해 방지).
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const { teams, loading: teamsLoading } = useTeams(selectedCohortId);

  const [applicants, setApplicants] = useState<any[]>([]);
  const [aggregations, setAggregations] = useState<Record<string, ApplicantAggregate>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTeam, setSelectedTeam] = useState('ALL');

  // 스위치 및 모달 상태
  const [schedulePublic, setSchedulePublic] = useState(false);
  const [resultPublic, setResultPublic] = useState(false);
  const [stageFilter, setStageFilter] = useState('ALL');
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeConfirmInput, setPurgeConfirmInput] = useState('');

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

  const fetchCohortAndApplicants = useCallback(async () => {
    // 서로 독립인 세 요청을 차례로 기다리면 배포 환경에서 1.5초가 그냥 지나간다.
    const [cRes, appRes, scoreRes] = await Promise.all([
      fetch(`/api/recruit/cohorts/${selectedCohortId}`),
      fetch(`/api/recruit/applicants?cohortId=${selectedCohortId}&slim=1`),
      fetch(`/api/recruit/scores?cohortId=${selectedCohortId}`),
    ]);
    const [cData, appData, scoreData] = await Promise.all([cRes.json(), appRes.json(), scoreRes.json()]);

    if (cData.cohort) {
      setSchedulePublic(cData.cohort.schedulePublic);
      setResultPublic(cData.cohort.resultPublic);
    }
    if (appData.applicants) setApplicants(appData.applicants);
    if (scoreData.aggregations) setAggregations(scoreData.aggregations);
  }, [selectedCohortId]);

  useEffect(() => {
    fetchCohorts();
  }, [fetchCohorts]);

  useEffect(() => {
    if (selectedCohortId) {
      fetchCohortAndApplicants();
    }
  }, [selectedCohortId, fetchCohortAndApplicants]);

  // 팀·기수를 바꾸면 선택을 푼다. 최종 합격 확정은 되돌릴 수 없는데, 앞 팀에서 고른 사람이
  // 화면에 보이지 않는 채로 남아 함께 확정될 수 있다.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedTeam, selectedCohortId]);

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
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSchedulePublic(newSchedule);
        setResultPublic(newResult);
        setMessage('✅ 공개 스위치 설정이 변경되었습니다.');
      } else {
        // 실패를 알리지 않으면 스위치가 그대로 있는 이유를 알 수 없다.
        setMessage(`❌ ${data.message || data.error || '공개 설정을 변경하지 못했습니다.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  /** 한 통에 담아 보낸다. 응답의 제외 사유를 사람이 읽을 문장으로 접어 준다. */
  const bulkStatus = async (ids: string[], status: 'final_pass' | 'final_fail') => {
    if (ids.length === 0) return { ok: true, updated: 0, note: '' };
    const res = await fetch('/api/recruit/applicants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 서버가 이 기수 소속만 바꾸도록 범위를 함께 보낸다.
      body: JSON.stringify({ action: 'bulk_status', ids, status, cohortId: selectedCohortId }),
    });
    // 실패를 삼키지 않는다 — 예전에는 res.ok 가 아니면 아무 표시도 없어서,
    // 서버가 거절해도 화면상 "눌러도 아무 일도 안 일어나는" 상태였다.
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, updated: 0, note: data.message || data.error || `${res.status}` };
    // 제외 사유를 뭉뚱그리면 다른 기수를 고른 실수를 단계 문제로 오해한다.
    const reasons = [
      data.skippedCount ? `${data.skippedCount}명은 면접 단계가 아님` : '',
      data.outOfScopeCount ? `${data.outOfScopeCount}명은 이 기수 소속이 아님` : '',
    ].filter(Boolean);
    return { ok: true, updated: data.updatedCount ?? 0, note: reasons.join(', ') };
  };

  /**
   * 최종 합격 확정 — **고른 사람은 합격, 매트릭스에 남은 나머지는 불합격**이다.
   *
   * 불합격을 따로 처리하지 않는 이유(2026-08-21 사용자 결정): 최종 합격자를 제외한 사람은 그냥
   * 불합격이다. 두 번 나눠 누르게 하면 두 번째를 빠뜨릴 수 있는데, 그러면 떨어진 사람이
   * 지원자 조회에서 영영 '결과 대기'로 보인다(`lookup-visibility.ts` — 최종 상태가 아니면
   * 당락을 내보내지 않는다). 한 번의 확정으로 기수 전체가 끝나야 그 구멍이 생기지 않는다.
   */
  const handleConfirmFinal = async () => {
    if (selectedIds.size === 0) return;
    const passIds = Array.from(selectedIds);
    if (
      !confirm(
        `최종 합격 ${passIds.length}명을 확정합니다.\n\n` +
          `면접을 본 나머지 ${autoFailIds.length}명은 같은 순간에 최종 불합격으로 처리됩니다.\n` +
          `면접 불참 ${excluded.noshow.length}명은 '면접 불참'으로 그대로 둡니다.\n\n` +
          `확정한 결과는 '최종 합격 결과 지원자 공개'를 켜는 순간 지원자에게 그대로 나갑니다.\n\n진행할까요?`
      )
    )
      return;

    setLoading(true);
    try {
      const pass = await bulkStatus(passIds, 'final_pass');
      if (!pass.ok) {
        setMessage(`❌ ${pass.note || '확정에 실패했습니다.'}`);
        return;
      }
      const fail = await bulkStatus(autoFailIds, 'final_fail');
      if (!fail.ok) {
        // 합격은 들어갔는데 불합격이 실패한 상태를 조용히 두면 절반만 확정된 채 발표된다.
        setMessage(
          `⚠️ 합격 ${pass.updated}명은 확정했지만 나머지 불합격 처리에 실패했습니다(${fail.note}). 다시 눌러 주세요.`
        );
        await fetchCohortAndApplicants();
        return;
      }
      const note = [pass.note, fail.note].filter(Boolean).join(', ');
      setMessage(
        `✅ 최종 합격 ${pass.updated}명 · 최종 불합격 ${fail.updated}명을 확정했습니다.` +
          (note ? ` (제외: ${note})` : '')
      );
      setSelectedIds(new Set());
      await fetchCohortAndApplicants();
    } finally {
      setLoading(false);
    }
  };

  // 확인 문구가 남아 있으면 모달을 다시 열자마자 파기 버튼이 활성 상태다 — 매번 다시 입력하게 비운다.
  const closePurgeModal = () => {
    setShowPurgeModal(false);
    setPurgeConfirmInput('');
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
        closePurgeModal();
        await fetchCohortAndApplicants();
      } else {
        setMessage(`❌ 파기 실패: ${data.message || data.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReassignTeam = async (id: string, newTeam: string) => {
    // 행마다 드롭다운이 있는 표다. 매번 전체를 다시 불러오면 한 명 바꿀 때마다 화면이 멈춘다.
    // 실패하면 서버에서 다시 읽는다 — 여러 행을 연달아 바꾸는 화면이라 스냅샷을 되돌리면
    // 그 사이 성공한 다른 행까지 함께 지워진다.
    setApplicants((prev) => prev.map((a) => (a.id === id ? { ...a, assignedTeam: newTeam } : a)));
    try {
      const res = await fetch('/api/recruit/applicants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_team',
          id,
          assignedTeam: newTeam,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage(`✅ 최종 배정 팀이 [${newTeam}](으)로 변경되었습니다.`);
      } else {
        setMessage(`❌ ${data.message || data.error || '팀 변경에 실패했습니다.'}`);
        await fetchCohortAndApplicants();
      }
    } catch {
      setMessage('❌ 팀을 변경하지 못했습니다. 연결을 확인해 주세요.');
      await fetchCohortAndApplicants();
    }
  };

  // 이 화면은 팀으로만 걸러져서, 실제로 결정할 수 있는 사람이 탈락자·미심사자 사이에 섞여 있었다.
  // 서버가 단계를 검증하므로 안전하긴 하지만, 고를 때 눈으로 찾아야 하는 건 그대로였다.
  const DECIDABLE = ['interview_done'];
  const DECIDED = ['final_pass', 'final_fail'];

  /**
   * 매트릭스에 서는 사람 = **면접을 실제로 보는 사람**(2026-08-21 사용자 결정).
   *
   * 면접에 배정됐고, 불참이 아니어야 한다. 최종 합격은 면접을 보고 나서 정하는 것이라
   * 그 자리에 서지 않는 사람(서류 탈락·미배정·불참)을 함께 세워 두면 고를 때마다 눈으로 걸러야 한다.
   *
   * **불참자는 여기서 뺀다.** 뺀다고 사라지는 것이 아니라 `interview_noshow` 로 끝난다 —
   * 지원자 조회에도 '면접 불참'으로 그대로 나간다(`lookup-visibility.ts`). 굳이 불합격으로
   * 한 번 더 찍을 이유가 없다.
   */
  const inMatrix = (app: any) => app.slotId != null && app.status !== 'interview_noshow';

  // 매트릭스 밖으로 빠진 사람은 **숫자로라도 보여 준다.** 그냥 감추면 33기처럼 배정에서 잊힌
  // 서류 합격자가 아무 화면에도 안 나온 채 발표까지 간다(2026-08-21 실제로 3명 있었다).
  const excluded = {
    unassigned: sortedApplicants.filter((a) => a.status === 'doc_pass' && !a.slotId),
    noshow: sortedApplicants.filter((a) => a.status === 'interview_noshow'),
  };

  const matrixPool = sortedApplicants.filter(inMatrix);
  const teamApplicants = matrixPool.filter((app) => matchesTeamFilter(app, selectedTeam));
  const filteredApplicants = teamApplicants.filter((app) => {
    if (stageFilter === 'DECIDABLE') return DECIDABLE.includes(app.status);
    if (stageFilter === 'DECIDED') return DECIDED.includes(app.status);
    if (stageFilter === 'PENDING') return !DECIDABLE.includes(app.status) && !DECIDED.includes(app.status);
    return true;
  });
  const decidableCount = teamApplicants.filter((a) => DECIDABLE.includes(a.status)).length;

  // 합격을 확정하면 **나머지는 자동으로 불합격**이다(사용자 결정 2026-08-21). 그 '나머지'는
  // 팀 필터와 무관하게 기수 전체에서 센다 — 팀별로 나눠 확정하면 다른 팀 사람이 결정되지 않은 채
  // 남고, 지원자 조회에서 영영 '결과 대기'로 보인다.
  const autoFailIds = matrixPool
    .filter((a) => DECIDABLE.includes(a.status) && !selectedIds.has(a.id))
    .map((a) => a.id);

  // 한 줄에서 뽑아 쓰는 값을 한 번만 계산한다 — 표(PC)와 카드(모바일)가 각자 계산하면
  // 한쪽만 고쳐 놓고 못 알아채는 일이 생긴다.
  const rows = filteredApplicants.map((app) => {
    const agg = aggregations[app.id];

    // 미배정·불참은 이제 매트릭스에 오지 않는다(위 `inMatrix`). 대신 표 위에서 숫자로 알린다.
    // 여기 남는 경고는 하나뿐이다 — **면접을 보기로 해 놓고 점수가 한 개도 없는 사람**.
    const warns: string[] = [];
    if ((agg?.interviewScorerCount ?? 0) === 0) {
      warns.push('면접 채점 미기록');
    }

    return {
      app,
      warns,
      docAvg: formatScore(agg?.docScoreAvg),
      intAvg: formatScore(agg?.interviewScoreAvg),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-bold text-ink-900">6. 최종 결정 및 데이터 관리 (회장단)</h1>
            <HelpButton screen="recruit-final" />
          </div>
          <p className="mt-1 text-sm text-ink-500">최종 합격자 결정, 최종 팀 배정, 지원자 결과 공개 및 개인정보 안전 일괄 파기.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 다른 모집 화면과 같은 툴바 형태로 통일. */}
          <ToolbarSelect label="팀" value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
            <option value="ALL">전체</option>
            <TeamOptions teams={teams} loading={teamsLoading} />
          </ToolbarSelect>

          <ToolbarSelect label="단계" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="ALL">전체</option>
            <option value="DECIDABLE">결정 대상 (면접 완료)</option>
            <option value="DECIDED">결정 완료</option>
            <option value="PENDING">아직 결정 단계 아님</option>
          </ToolbarSelect>

          <div className="contents">
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
      </div>

      <RecruitNav role={role} />

      {/* 공개 스위치. 되돌릴 수 없는 폐기는 화면 맨 아래로 내렸다 — 스위치를 켜고 끄다가
          바로 옆의 파기 버튼을 누를 자리에 두면 안 된다. */}
      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-ink-900">지원자 공개 설정</h2>
          <p className="mt-1 text-xs text-ink-500">
            켜면 지원자가 <strong>/recruit</strong> 조회에서 바로 볼 수 있습니다. 끄면 결과를 알 수 없습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {/* 공개 스위치 두 개는 문구가 길다. 좁으면 세로로 쌓고, 가운데 구분선은 그때 감춘다. */}
          <div className="flex flex-col gap-2 rounded-2xl border border-cream-200 bg-cream-50 p-3 px-5 sm:flex-row sm:items-center sm:gap-6">
            <label className="flex min-h-tap items-center gap-2.5 cursor-pointer font-bold text-xs text-ink-900">
              <input
                type="checkbox"
                checked={schedulePublic}
                onChange={(e) => handleUpdateSwitches(e.target.checked, resultPublic)}
                className="h-5 w-5 rounded border-ink-300 text-blue-600 focus:ring-blue-500"
              />
              <span>면접 일정/링크 지원자 공개</span>
            </label>

            <div className="hidden h-4 w-px bg-cream-200 sm:block" />

            <label className="flex min-h-tap items-center gap-2.5 cursor-pointer font-bold text-xs text-ink-900">
              <input
                type="checkbox"
                checked={resultPublic}
                onChange={(e) => handleUpdateSwitches(schedulePublic, e.target.checked)}
                className="h-5 w-5 rounded border-ink-300 text-blue-600 focus:ring-blue-500"
              />
              <span>최종 합격 결과 지원자 공개</span>
            </label>
          </div>

        </div>

        <StatusMessage text={message} />
      </Card>

      {/* 최종 합격 결정 매트릭스 카드 */}
      <Card className="space-y-4">
        {/* 확정 버튼 문구가 "선택 12명 최종 불합격 처리"까지 길어진다 — 좁으면 접히게 둔다. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-200 pb-3">
          <span className="text-sm font-bold text-ink-900">
            최종 결정 매트릭스 ({filteredApplicants.length}명)
            <span className="ml-2 inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
              지금 결정할 수 있는 사람 {decidableCount}명
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {/* 확정은 기수 전체를 한 번에 끝내는 일이라, 팀만 보고 있을 때는 누르지 못하게 한다.
                팀별로 나눠 확정하면 다른 팀 사람이 결정되지 않은 채 남는다. */}
            {selectedTeam !== 'ALL' && (
              <span className="text-[12px] font-semibold text-amber-700">팀 필터를 전체로 두어야 확정할 수 있습니다</span>
            )}
            <Button
              type="button"
              disabled={loading || selectedIds.size === 0 || selectedTeam !== 'ALL'}
              onClick={handleConfirmFinal}
            >
              {/* 아무도 안 골랐을 때 '0명 확정 · 나머지 185명 불합격'이라고 적혀 있으면
                  누르면 전원이 떨어지는 버튼처럼 읽힌다. 그때는 할 일을 적는다. */}
              {selectedIds.size === 0
                ? '합격자를 먼저 고르세요'
                : `최종 합격 ${selectedIds.size}명 확정 · 나머지 ${autoFailIds.length}명 불합격`}
            </Button>
          </div>
        </div>

        {/* 매트릭스에 서지 않는 사람들. 숫자만 적는다 — 감춰 놓으면 배정에서 잊힌 사람이
            아무 화면에도 안 나온 채 발표까지 간다. */}
        {(excluded.unassigned.length > 0 || excluded.noshow.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-cream-50 px-3.5 py-2.5 text-[12px] text-ink-600">
            <span className="font-bold text-ink-700">이 표에 없는 사람</span>
            {excluded.unassigned.length > 0 && (
              <span className="font-semibold text-amber-700">
                <Icon name="alert" size={12} className="mr-1 inline" />
                면접 미배정 {excluded.unassigned.length}명 — {excluded.unassigned.map((a) => a.name).join(', ')}
              </span>
            )}
            {excluded.noshow.length > 0 && (
              <span>
                면접 불참 {excluded.noshow.length}명 (그대로 &lsquo;면접 불참&rsquo;으로 남습니다)
              </span>
            )}
          </div>
        )}

        {/* 종합 점수 목록 — 노트북은 표, 폰·태블릿은 카드(TableCards 주석 참고). */}
        <TableCards
          table={
            <table className="w-full text-left text-xs">
              <thead className="bg-cream-100 font-semibold text-ink-700">
                <tr>
                  <th className="w-10 p-3.5 text-center">선택</th>
                  <th className="p-3.5">이름</th>
                  <th className="p-3.5">학교 / 학과</th>
                  <th className="p-3.5">최종 배정 팀</th>
                  <th className="p-3.5">서류 평균 점수</th>
                  <th className="p-3.5">면접 평균 점수</th>
                  <th className="p-3.5">특이사항 경고</th>
                  <th className="p-3.5">최종 상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {rows.map(({ app, warns, docAvg, intAvg }) => {
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
                      <td className="p-3.5 text-sm font-bold text-ink-900">{app.name}</td>
                      <td className="p-3.5 text-ink-700">
                        {app.school} {app.department}
                      </td>
                      <td className="p-3.5">
                        {/* 폭은 **감싼 div** 로 준다. `Select` 에 `w-32` 를 직접 붙이면 기본 `w-full` 과
                            같은 특이도로 충돌해서 좁은 칸 기준 100%(81px)로 눌리고 "봉사 1팀"이 잘렸다.
                            같은 이유로 화면·심사 화면도 래퍼로 폭을 준다(console:636, screening:394). */}
                        <div className="w-36">
                          <Select
                            value={app.assignedTeam || app.wishTeam1 || '봉사 1팀'}
                            onChange={(e) => handleReassignTeam(app.id, e.target.value)}
                            aria-label={`${app.name} 최종 배정 팀`}
                            uiSize="sm"
                          >
                            <TeamOptions teams={teams} loading={teamsLoading} />
                          </Select>
                        </div>
                      </td>
                      <td className="p-3.5 text-ink-700">{docAvg !== null ? `${docAvg}점` : '-'}</td>
                      <td className="p-3.5">
                        {intAvg !== null ? <span className="text-sm font-bold text-blue-700">{intAvg}점</span> : <span className="text-ink-400">-</span>}
                      </td>
                      <td className="p-3.5">
                        <div className="flex flex-wrap gap-1">
                          {warns.map((w) => (
                            <WarnChip key={w} warn={w} />
                          ))}
                        </div>
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
          cards={rows.map(({ app, warns, docAvg, intAvg }) => (
            <RowCard
              key={app.id}
              title={app.name}
              selected={selectedIds.has(app.id)}
              onSelect={() => handleToggleSelect(app.id)}
              selectLabel={`${app.name} 선택`}
              badge={<StatusChip status={app.status} />}
            >
              {/* 경고는 값 줄에 묻으면 안 된다 — 결정 직전에 봐야 하는 정보라 맨 위에 폭 전체로 편다. */}
              {warns.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {warns.map((w) => (
                    <WarnChip key={w} warn={w} />
                  ))}
                </div>
              ) : null}
              <CardField label="학교 / 학과">
                {app.school} {app.department}
              </CardField>
              <CardField label="서류 평균">{docAvg !== null ? `${docAvg}점` : '-'}</CardField>
              <CardField label="면접 평균">
                {intAvg !== null ? <span className="font-bold text-blue-700">{intAvg}점</span> : <span className="text-ink-400">-</span>}
              </CardField>
              <CardBlock label="최종 배정 팀">
                <Select
                  value={app.assignedTeam || app.wishTeam1 || '봉사 1팀'}
                  onChange={(e) => handleReassignTeam(app.id, e.target.value)}
                  aria-label={`${app.name} 최종 배정 팀`}
                >
                  <TeamOptions teams={teams} loading={teamsLoading} />
                </Select>
              </CardBlock>
            </RowCard>
          ))}
        />
      </Card>

      {/* 되돌릴 수 없는 작업 — 공개 스위치와 떨어뜨려 화면 맨 아래에 둔다. */}
      <Card className="space-y-3 border-coral-200 bg-coral-50/30">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-coral-700">모집 종료 후 지원자 데이터 파기</h2>
            <p className="mt-1 text-xs text-ink-700">
              인적사항·자기소개서·점수·메모를 <strong>실제로 지웁니다.</strong> 지원자 수·합격자 수·평균만
              익명 집계로 남습니다. <strong>되돌릴 수 없습니다.</strong> 결과 공개와 합격자 안내가 모두 끝난 뒤에
              실행하세요.
            </p>
          </div>
          <DangerButton type="button" onClick={() => setShowPurgeModal(true)} className="h-control">
            지원자 데이터 파기
          </DangerButton>
        </div>
      </Card>

      {/* 데이터 파기 모달 */}
      {showPurgeModal && (
        <div className="fixed inset-0 bg-ink-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 space-y-4 shadow-modal border-coral-100">
            <h2 className="text-lg font-bold text-coral-700 flex items-center gap-2">
              모집 종료 데이터 영구 일괄 파기
            </h2>
            <p className="text-xs text-ink-500 leading-relaxed">
              모집 프로세스가 완료된 후 지원자의 이름, 연락처, 자기소개서, 개별 채점 기록 및 개인 메모를 안전하게 영구 파기합니다. 익명 통계(총 수치)만 보존됩니다.
            </p>

            {/* 되돌릴 수 없는 작업인데 어느 기수를 몇 명 지우는지 모달에 없었다 — 기수를 착각하면 끝이다. */}
            <div className="rounded-xl border border-coral-200 bg-coral-50/60 px-4 py-3">
              <p className="text-xs font-semibold text-ink-500">지금 파기하는 대상</p>
              <p className="mt-1 text-base font-bold text-coral-700">
                {cohorts.find((c) => c.id === selectedCohortId)?.label || '기수 미선택'} · 지원자 {applicants.length}명
              </p>
            </div>

            <div className="space-y-2">
              <Field label="확인 문구로 «데이터 삭제 확정» 을 그대로 입력">
                <Input
                  type="text"
                  value={purgeConfirmInput}
                  onChange={(e) => setPurgeConfirmInput(e.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton type="button" onClick={closePurgeModal}>
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
