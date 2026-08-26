'use client';

import { HelpButton } from '@/components/help-button';
import type { Role } from '@/auth/permissions';
import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/icon';
import { useTeams } from '@/components/use-teams';
import { ALL_TEAMS_FILTER, matchesTeamFilter } from '@/recruit/team-filter';
import { isUnderReview } from '@/recruit/review-list';
import {
  decideFinalOutcomes,
  summarizeFinalDecisions,
  groupPassByFinalTeam,
  type FinalDecision,
} from '@/recruit/final-decision';
import type { ApplicantAggregate } from '@/recruit/aggregate';
import { formatScore } from '@/recruit/display';
import { RecruitNav } from '@/components/recruit-nav';
import {
  Button,
  Card,
  CardField,
  DangerButton,
  Field,
  Input,
  RowCard,
  SecondaryButton,
  StatusMessage,
  TableCards,
  TeamOptions,
  ToolbarSelect,
} from '@/components/ui';

/** 합격/불합격 미리보기 배지. 실제 상태 배지(`StatusChip`)와 다른 자리다 — 이건 "이대로 확정하면
 * 될 값"이고, 상태 배지는 지금 DB 에 있는 값이라 확정 전까지는 여전히 `interview_done` 이다. */
function OutcomeChip({ outcome }: { outcome: 'pass' | 'fail' }) {
  return outcome === 'pass' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-100 px-2.5 py-0.5 text-[11px] font-semibold text-success-700">
      합격
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-coral-100 px-2.5 py-0.5 text-[11px] font-semibold text-coral-700">
      불합격
    </span>
  );
}

/** 왜 이 결과가 나왔는지 한 마디. 회장단이 "이 사람이 왜 여기 있지"를 5번으로 돌아가지 않고
 * 바로 알 수 있게 한다. */
function reasonLabel(mark: 'drop' | 'move' | null | undefined): string {
  if (mark === 'drop') return '탈락 표시';
  if (mark === 'move') return '다른 팀 표시';
  return '표시 없음(자동 합격)';
}

export function RecruitFinalPanel({ role }: { role: Role }) {
  const [cohorts, setCohorts] = useState<any[]>([]);
  // 기수 목록을 받아오는 동안 셀렉트에 표시한다(빈 드롭다운 = '기수 없음' 오해 방지).
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const { teams, loading: teamsLoading } = useTeams(selectedCohortId);

  const [applicants, setApplicants] = useState<any[]>([]);
  const [aggregations, setAggregations] = useState<Record<string, ApplicantAggregate>>({});
  const [selectedTeam, setSelectedTeam] = useState(ALL_TEAMS_FILTER);

  // 스위치 및 모달 상태
  const [schedulePublic, setSchedulePublic] = useState(false);
  const [resultPublic, setResultPublic] = useState(false);
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

  // 매트릭스에 서던 사람 = 5번 최종 검토와 같은 기준(`isUnderReview`, review-list.ts) —
  // 면접에 배정됐고 불참이 아니어야 한다. 두 화면이 각자 기준을 적으면 5번에서 본 사람과
  // 6번이 처리하는 사람이 어긋난다.
  const pool = applicants.filter(isUnderReview);
  const teamApplicants = pool.filter((app) => matchesTeamFilter(app, selectedTeam));

  // 매트릭스 밖으로 빠진 사람은 **숫자로라도 보여 준다.** 그냥 감추면 33기처럼 배정에서 잊힌
  // 서류 합격자가 아무 화면에도 안 나온 채 발표까지 간다(2026-08-21 실제로 3명 있었다).
  const excluded = {
    unassigned: applicants.filter((a) => a.status === 'doc_pass' && !a.slotId),
    noshow: applicants.filter((a) => a.status === 'interview_noshow'),
  };

  /**
   * **확정 대상 = 면접을 마친(`interview_done`) 사람**. 아직 면접 전이거나 이미 확정된 사람은
   * 결과를 다시 계산할 이유가 없다 — 확정된 사람을 다시 계산에 넣으면 상태가 이미 최종인데
   * 또 최종 처리를 시도하는 요청이 나간다(서버가 막긴 하지만 화면이 굳이 보여줄 이유가 없다).
   */
  const decidablePool = teamApplicants.filter((a) => a.status === 'interview_done');
  const alreadyDecidedCount = teamApplicants.filter(
    (a) => a.status === 'final_pass' || a.status === 'final_fail'
  ).length;
  const notYetInterviewedCount = teamApplicants.length - decidablePool.length - alreadyDecidedCount;

  /**
   * 5번 최종 검토의 표시를 합격/불합격/최종 팀으로 바꾼다(`final-decision.ts`).
   *
   * **팀 필터와 무관하게 기수 전체로 계산한다** — 확정 버튼은 항상 전체를 대상으로 하므로
   * (아래 disabled 조건), 미리보기도 같은 범위로 계산해야 "지금 이 버튼을 누르면 무슨 일이
   * 일어나는지"가 화면에 보이는 숫자와 실제로 같다. 팀 필터는 아래 표를 좁혀 보는 용도일 뿐이다.
   */
  const allDecidablePool = pool.filter((a) => a.status === 'interview_done');
  const decisions = decideFinalOutcomes(allDecidablePool, (id) => aggregations[id]?.interviewScorerCount ?? 0);
  const summary = summarizeFinalDecisions(decisions);
  const decidableTotal = summary.pass.length + summary.fail.length;
  // 합격자 중 원래 팀이 아니라 다른 팀으로 가는 사람 — 확인 문구에 알려 준다.
  const moveCount = summary.pass.filter((d) => d.applicant.reviewMark === 'move').length;

  // 표는 팀 필터를 따른다(훑어보는 용도). 정렬은 5번과 같이 면접 평균 내림차순.
  const previewDecisions: FinalDecision<any>[] = [...summary.pass, ...summary.fail]
    .filter((d) => matchesTeamFilter(d.applicant, selectedTeam))
    .sort(
      (a, b) =>
        (aggregations[b.applicant.id]?.interviewScoreAvg ?? -1) -
        (aggregations[a.applicant.id]?.interviewScoreAvg ?? -1)
    );

  /**
   * 확정이 끝난 최종 합격자 명단 — **영문 이름을 뽑는 자리**(외부 단체 가입 안내용).
   *
   * 위 미리보기 표와 따로 두는 이유: 미리보기는 `interview_done` 인 사람만 계산하므로 확정 버튼을
   * 누르는 순간 텅 빈다. 정작 명단이 필요한 때는 그 다음(합격자에게 안내를 보낼 때)이라,
   * 확정된 뒤에도 남는 자리가 하나 있어야 한다.
   *
   * 팀 → 이름 순으로 세운다. 팀별로 넘길 명단이라 팀이 섞여 있으면 사람이 다시 갈라야 한다.
   */
  const confirmedPass = applicants
    .filter((a) => a.status === 'final_pass' && matchesTeamFilter(a, selectedTeam))
    .sort(
      (a, b) =>
        (a.assignedTeam || '').localeCompare(b.assignedTeam || '', 'ko') || a.name.localeCompare(b.name, 'ko')
    );
  // 안 적은 사람이 있으면 명단을 넘기기 전에 알아야 한다(문항을 껐던 기수도 여기로 온다).
  const missingEnglishName = confirmedPass.filter((a) => !a.englishName).length;

  /**
   * 최종 합격 확정 — **5번 최종 검토의 표시를 그대로 확정한다**(2026-08-24 사용자 지정).
   *
   * 팀부터 맞추고 상태를 바꾼다 — 순서를 반대로 하면 "합격은 확정됐는데 팀은 아직 옛값"인
   * 순간이 생긴다. 팀 배정에 실패하면 상태는 하나도 안 바꾸고 멈춘다 — 절반만 확정된 채
   * 발표되는 것보다, 다시 눌러서 처음부터 다시 시도하는 편이 안전하다.
   */
  const handleConfirmFinal = async () => {
    if (decidableTotal === 0 || summary.moveTeamUnset.length > 0) return;
    if (
      !confirm(
        `최종 합격 ${summary.pass.length}명 · 최종 불합격 ${summary.fail.length}명을 확정합니다.\n\n` +
          (moveCount > 0 ? `이 중 ${moveCount}명은 팀도 함께 바뀝니다.\n\n` : '') +
          `확정한 결과는 '최종 합격 결과 지원자 공개'를 켜는 순간 지원자에게 그대로 나갑니다.\n\n진행할까요?`
      )
    )
      return;

    setLoading(true);
    try {
      const teamGroups = groupPassByFinalTeam(summary.pass);
      for (const [team, ids] of teamGroups) {
        const res = await fetch('/api/recruit/applicants', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'bulk_team', ids, assignedTeam: team }),
        });
        if (!res.ok) {
          setMessage(`❌ [${team}] 팀 배정에 실패해 확정을 멈췄습니다. 상태는 하나도 안 바뀌었습니다. 다시 눌러 주세요.`);
          return;
        }
      }

      const fail = await bulkStatus(
        summary.fail.map((d) => d.applicant.id),
        'final_fail'
      );
      if (!fail.ok) {
        setMessage(`❌ 팀 배정은 끝났지만 불합격 확정에 실패했습니다(${fail.note || fail}). 다시 눌러 주세요.`);
        await fetchCohortAndApplicants();
        return;
      }
      const pass = await bulkStatus(
        summary.pass.map((d) => d.applicant.id),
        'final_pass'
      );
      if (!pass.ok) {
        // 불합격은 들어갔는데 합격이 실패한 상태를 조용히 두면 절반만 확정된 채 발표된다.
        setMessage(
          `⚠️ 불합격 ${fail.updated}명은 확정했지만 합격 확정에 실패했습니다(${pass.note}). 다시 눌러 주세요.`
        );
        await fetchCohortAndApplicants();
        return;
      }

      const note = [pass.note, fail.note].filter(Boolean).join(', ');
      setMessage(
        `✅ 최종 합격 ${pass.updated}명 · 최종 불합격 ${fail.updated}명을 확정했습니다.` +
          (note ? ` (제외: ${note})` : '')
      );
      await fetchCohortAndApplicants();
    } finally {
      setLoading(false);
    }
  };

  const confirmDisabled = loading || decidableTotal === 0 || summary.moveTeamUnset.length > 0;
  const confirmLabel =
    decidableTotal === 0
      ? '확정할 사람이 없습니다'
      : summary.moveTeamUnset.length > 0
        ? `팀 미정 ${summary.moveTeamUnset.length}명부터 정리하세요`
        : `최종 합격 ${summary.pass.length}명 · 불합격 ${summary.fail.length}명 확정`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-bold text-ink-900">6. 최종 결정 및 데이터 관리 (회장단)</h1>
            <HelpButton screen="recruit-final" />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            5번 최종 검토에서 낸 <strong className="text-ink-700">탈락</strong>·
            <strong className="text-ink-700">다른 팀</strong> 표시를 그대로 확정합니다. 표시가 없으면
            합격입니다. 확정 뒤 결과를 공개하고, 모집이 끝나면 자료를 파기합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSelect label="팀" value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
            <option value={ALL_TEAMS_FILTER}>전체</option>
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

      {/* 최종 결정 확정 카드 */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-200 pb-3">
          <span className="text-sm font-bold text-ink-900">
            최종 결정
            <span className="ml-2 inline-block rounded-md bg-success-100 px-2 py-0.5 text-[11px] font-bold text-success-700">
              합격 예정 {summary.pass.length}명
            </span>
            <span className="ml-1 inline-block rounded-md bg-coral-100 px-2 py-0.5 text-[11px] font-bold text-coral-700">
              불합격 예정 {summary.fail.length}명
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {/* 확정은 기수 전체를 한 번에 끝내는 일이라, 팀만 보고 있을 때는 누르지 못하게 한다.
                팀별로 나눠 확정하면 다른 팀 사람이 결정되지 않은 채 남는다. */}
            {selectedTeam !== ALL_TEAMS_FILTER && (
              <span className="text-[12px] font-semibold text-amber-700">팀 필터를 전체로 두어야 확정할 수 있습니다</span>
            )}
            <Button type="button" disabled={confirmDisabled} onClick={handleConfirmFinal}>
              {confirmLabel}
            </Button>
          </div>
        </div>

        {/* 확정에 끼지 못하는 사람들 — 감춰 놓으면 아무 화면에도 안 나온 채 발표까지 간다. */}
        {(excluded.unassigned.length > 0 ||
          excluded.noshow.length > 0 ||
          summary.moveTeamUnset.length > 0 ||
          summary.unscored.length > 0 ||
          notYetInterviewedCount > 0 ||
          alreadyDecidedCount > 0) && (
          <div className="space-y-1.5 rounded-xl bg-cream-50 px-3.5 py-2.5 text-[12px] text-ink-600">
            {summary.moveTeamUnset.length > 0 && (
              <p className="font-semibold text-coral-700">
                <Icon name="alert" size={12} className="mr-1 inline" />
                팀 미정 {summary.moveTeamUnset.length}명 — 5번에서 보낼 팀을 마저 골라야 확정할 수 있습니다:{' '}
                {summary.moveTeamUnset.map((d) => d.applicant.name).join(', ')}
              </p>
            )}
            {summary.unscored.length > 0 && (
              <p className="font-semibold text-amber-700">
                <Icon name="alert" size={12} className="mr-1 inline" />
                면접 채점 미기록 {summary.unscored.length}명 — 표시도 점수도 없어 자동 합격에서
                뺐습니다. 확인 후 5번에서 표시하거나 따로 처리하세요:{' '}
                {summary.unscored.map((d) => d.applicant.name).join(', ')}
              </p>
            )}
            {excluded.unassigned.length > 0 && (
              <p className="font-semibold text-amber-700">
                <Icon name="alert" size={12} className="mr-1 inline" />
                면접 미배정 {excluded.unassigned.length}명 — {excluded.unassigned.map((a: any) => a.name).join(', ')}
              </p>
            )}
            {excluded.noshow.length > 0 && (
              <p>면접 불참 {excluded.noshow.length}명 (그대로 &lsquo;면접 불참&rsquo;으로 남습니다)</p>
            )}
            {notYetInterviewedCount > 0 && <p>아직 면접 전 {notYetInterviewedCount}명</p>}
            {alreadyDecidedCount > 0 && <p>이미 확정됨 {alreadyDecidedCount}명</p>}
          </div>
        )}

        {/* 결과 미리보기 — 노트북은 표, 폰·태블릿은 카드(TableCards 주석 참고).
            체크박스도 팀 셀렉트도 없다 — 여기 보이는 결과는 5번 표시로 이미 정해졌고,
            바꾸려면 5번으로 가서 표시를 고친다(2026-08-24 사용자 지정). */}
        <TableCards
          table={
            <table className="w-full text-left text-xs">
              <thead className="bg-cream-100 font-semibold text-ink-700">
                <tr>
                  <th className="w-12 p-3.5 text-center">순위</th>
                  <th className="p-3.5">이름</th>
                  <th className="p-3.5">면접 평균 점수</th>
                  <th className="p-3.5">결과</th>
                  <th className="p-3.5">최종 팀</th>
                  <th className="p-3.5">사유</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {previewDecisions.map((d, i) => (
                  <tr key={d.applicant.id} className="transition-colors hover:bg-cream-25">
                    <td className="p-3.5 text-center font-mono font-bold text-ink-500">{i + 1}</td>
                    <td className="p-3.5 text-sm font-bold text-ink-900">
                      {d.applicant.name}
                      {d.outcome === 'pass' && d.applicant.englishName && (
                        <span className="block text-[11px] font-normal text-ink-500">
                          {d.applicant.englishName}
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {(() => {
                        const avg = formatScore(aggregations[d.applicant.id]?.interviewScoreAvg);
                        return avg !== null ? (
                          <span className="text-sm font-bold text-blue-700">{avg}점</span>
                        ) : (
                          <span className="text-ink-400">-</span>
                        );
                      })()}
                    </td>
                    <td className="p-3.5">
                      <OutcomeChip outcome={d.outcome as 'pass' | 'fail'} />
                    </td>
                    <td className="p-3.5 text-ink-700">{d.outcome === 'pass' ? d.finalTeam || '-' : '-'}</td>
                    <td className="p-3.5 text-ink-500">{reasonLabel(d.applicant.reviewMark)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
          cards={previewDecisions.map((d) => (
            <RowCard key={d.applicant.id} title={d.applicant.name} badge={<OutcomeChip outcome={d.outcome as 'pass' | 'fail'} />}>
              <CardField label="면접 평균">
                {(() => {
                  const avg = formatScore(aggregations[d.applicant.id]?.interviewScoreAvg);
                  return avg !== null ? <span className="font-bold text-blue-700">{avg}점</span> : <span className="text-ink-400">-</span>;
                })()}
              </CardField>
              {d.outcome === 'pass' && d.applicant.englishName && (
                <CardField label="영문 이름">{d.applicant.englishName}</CardField>
              )}
              {d.outcome === 'pass' && <CardField label="최종 팀">{d.finalTeam || '-'}</CardField>}
              <CardField label="사유">{reasonLabel(d.applicant.reviewMark)}</CardField>
            </RowCard>
          ))}
        />
      </Card>

      {/* 최종 합격자 명단 — 영문 이름은 합격자에게만 쓰는 값이라(개인정보 처리방침) 이 자리에서만 보인다.
          확정된 사람이 없으면 통째로 감춘다: 모집 중에는 늘 비어 있을 카드다. */}
      {confirmedPass.length > 0 && (
        <Card className="space-y-4">
          <div className="border-b border-cream-200 pb-3">
            <h2 className="text-sm font-bold text-ink-900">
              최종 합격자 명단
              <span className="ml-2 inline-block rounded-md bg-success-100 px-2 py-0.5 text-[11px] font-bold text-success-700">
                {confirmedPass.length}명
              </span>
            </h2>
            <p className="mt-1 text-xs text-ink-500">
              확정이 끝난 합격자입니다. <strong>영문 이름</strong>은 외부 단체(로타랙트) 가입 안내에 쓰는
              값으로, 합격자에게만 사용합니다.
            </p>
          </div>

          {missingEnglishName > 0 && (
            <p className="rounded-xl bg-cream-50 px-3.5 py-2.5 text-[12px] font-semibold text-amber-700">
              <Icon name="alert" size={12} className="mr-1 inline" />
              영문 이름 미입력 {missingEnglishName}명 — 지원서에 안 적었거나 그 문항을 껐던 기수입니다.
              명단을 넘기기 전에 따로 받아야 합니다.
            </p>
          )}

          <TableCards
            table={
              <table className="w-full text-left text-xs">
                <thead className="bg-cream-100 font-semibold text-ink-700">
                  <tr>
                    <th className="w-12 p-3.5 text-center">번호</th>
                    <th className="p-3.5">이름</th>
                    <th className="p-3.5">영문 이름</th>
                    <th className="p-3.5">팀</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {confirmedPass.map((a: any, i: number) => (
                    <tr key={a.id} className="transition-colors hover:bg-cream-25">
                      <td className="p-3.5 text-center font-mono font-bold text-ink-500">{i + 1}</td>
                      <td className="p-3.5 text-sm font-bold text-ink-900">{a.name}</td>
                      <td className="p-3.5 text-ink-700">
                        {a.englishName || <span className="text-amber-700">미입력</span>}
                      </td>
                      <td className="p-3.5 text-ink-700">{a.assignedTeam || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
            cards={confirmedPass.map((a: any) => (
              <RowCard key={a.id} title={a.name}>
                <CardField label="영문 이름">
                  {a.englishName || <span className="text-amber-700">미입력</span>}
                </CardField>
                <CardField label="팀">{a.assignedTeam || '-'}</CardField>
              </RowCard>
            ))}
          />
        </Card>
      )}

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
