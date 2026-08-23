'use client';

import { HelpButton } from '@/components/help-button';
import type { Role } from '@/auth/permissions';
import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/icon';
import { useTeams } from '@/components/use-teams';
import { ALL_TEAMS_FILTER, matchesTeamFilter } from '@/recruit/team-filter';
import { isUnderReview, sortForReview, groupApplicantsByTeam } from '@/recruit/review-list';
import type { ApplicantAggregate } from '@/recruit/aggregate';
import { recruitStatusBadge, BADGE_TONE_CLASS } from '@/recruit/status-label';
import { formatScore } from '@/recruit/display';
import { RecruitNav } from '@/components/recruit-nav';
import {
  Card,
  SecondaryButton,
  StatusMessage,
  TableCards,
  TeamOptions,
  ToolbarSelect,
} from '@/components/ui';

interface ScoreRow {
  id: string;
  applicantId: string;
  scorerUserId: string;
  stage: 'document' | 'interview';
  score: string;
  comment: string | null;
  updatedAt: string;
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

/** 점수 한 칸. 미채점은 숫자 자리를 비우지 않고 그렇게 적는다 — 0점으로 읽히면 안 된다. */
function ScoreCell({ avg, scorerCount }: { avg: string | null; scorerCount: number }) {
  if (avg === null) {
    return <span className="text-ink-400">미채점</span>;
  }
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-sm font-bold text-blue-700">{avg}점</span>
      <span className="text-[11px] font-semibold text-ink-400">{scorerCount}명</span>
    </span>
  );
}

/**
 * 폰 카드의 면접 점수 줄.
 *
 * 폰에서는 **학교·학과와 서류 점수를 싣지 않는다**(2026-08-23 사용자 지정). 작은 화면에서
 * 검토 회의가 보는 것은 "누가 면접에서 몇 점인가"와 총평이고, 나머지는 표(PC)에 있다.
 * 넣을수록 한 화면에 담기는 사람이 줄어 스크롤만 길어진다.
 *
 * 그래서 남는 숫자 하나를 크게 세운다 — 라벨-값 줄로 쌓으면 13px 글자 사이에 묻힌다.
 */
function InterviewScoreRow({ avg, scorerCount }: { avg: string | null; scorerCount: number }) {
  if (avg === null) {
    return (
      <p className="mt-2.5 flex items-baseline gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">
        면접 미채점
      </p>
    );
  }
  return (
    <p className="mt-2.5 flex items-baseline gap-2 rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2">
      <span className="text-[11px] font-semibold text-ink-400">면접 점수</span>
      <span className="text-[22px] font-bold leading-tight text-blue-700">{avg}</span>
      <span className="text-[11px] font-semibold text-ink-400">{scorerCount}명</span>
    </p>
  );
}

/**
 * 펼치기 버튼.
 *
 * 예전에는 파란 글씨 '펼치기'였는데 **버튼으로 안 보였다**(2026-08-23 사용자 보고 —
 * "여기 눌러서 여는 줄 사람들이 모른다"). 이 화면은 그 안에 든 총평을 보려고 여는 화면인데
 * 여는 손잡이가 링크처럼 생겨서, 표만 보고 "점수만 있는 화면"으로 읽고 지나쳤다.
 *
 * 세 가지를 준다: **테두리**(눌리는 것이라는 신호) · **화살표**(아래로 열린다는 방향) ·
 * **펼친 상태의 색**(지금 열려 있다는 표시 + 화살표 뒤집기). 글자도 '펼치기' 대신
 * **무엇이 나오는지**를 말한다 — 손잡이 이름이 내용이면 눌러 볼 이유가 생긴다.
 */
function ExpandButton({
  open,
  onClick,
  srLabel,
  className = '',
}: {
  open: boolean;
  onClick: () => void;
  /** 스크린리더용 — 표 안에 같은 이름의 버튼이 여러 개라 누구의 것인지 붙인다. */
  srLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={srLabel}
      className={`inline-flex min-h-tap items-center justify-center gap-1 whitespace-nowrap rounded-xl border px-3 text-[12px] font-bold transition-colors ${
        open
          ? 'border-blue-300 bg-blue-50 text-blue-700'
          : 'border-ink-300 bg-white text-ink-900 hover:bg-cream-50'
      } ${className}`}
    >
      {open ? '접기' : '총평 보기'}
      <Icon
        name="chevronDown"
        size={14}
        className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

/** 지망 한 칸(라벨 위, 값 아래). 안 고른 사람은 빈칸이 아니라 그렇게 적는다. */
function WishTeam({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0 rounded-xl border border-cream-200 bg-white px-3 py-2">
      <dt className="text-[11px] font-semibold text-ink-400">{label}</dt>
      <dd className="break-words text-[13px] font-bold text-ink-900">
        {value?.trim() ? value : <span className="font-medium text-ink-300">미기재</span>}
      </dd>
    </div>
  );
}

/**
 * 면접 채점 기록 한 줄(점수 · 채점자 · 총평).
 * 총평이 주인공이므로 줄바꿈을 그대로 살린다.
 */
function ScoreRecord({
  score,
  scorerName,
  comment,
  emptyComment,
}: {
  score: string;
  scorerName: string;
  comment: string | null;
  emptyComment: string;
}) {
  return (
    <div className="rounded-xl border border-cream-200 bg-white p-3 shadow-card">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-bold text-blue-700">{parseFloat(score).toFixed(1)}점</span>
        {/* 누가 준 점수인지 없으면 검토 회의에서 되물을 수도 없다(면접 콘솔과 같은 규칙). */}
        <span className="text-[13px] font-semibold text-ink-700">{scorerName}</span>
      </div>
      {comment?.trim() ? (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-900">
          {comment}
        </p>
      ) : (
        <p className="mt-1.5 text-[13px] text-ink-400">{emptyComment}</p>
      )}
    </div>
  );
}

/**
 * 펼친 줄의 속살 — **지망 팀이 왼쪽, 면접 평가 총평이 오른쪽**(2026-08-23 사용자 지정).
 *
 * 서류 채점 코멘트는 여기서 뺐다. 이 자리에서 정하는 것은 면접을 보고 난 뒤의 판단이고,
 * 서류 이야기는 이미 2번(서류 집계·확정)에서 끝났다 — 서류 **점수**는 표에 그대로 남는다.
 * 대신 지망 팀을 보여준다: 목록은 배정팀(없으면 1지망)으로 묶여 있어서, 사람을 다른 팀으로
 * 옮길지 이야기할 때 1·2순위를 알아야 한다.
 *
 * 좁은 화면에서는 한 줄씩 쌓여 지망이 위, 총평이 아래가 된다. 표와 카드가 같은 것을 쓴다.
 */
function ScoreDetail({
  interviewScores,
  staffNames,
  wishTeam1,
  wishTeam2,
}: {
  interviewScores: ScoreRow[];
  staffNames: Record<string, string>;
  wishTeam1?: string | null;
  wishTeam2?: string | null;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <section className="space-y-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-400">지망 팀</h4>
        {/* 두 칸을 나란히 둔다 — 1순위만 보고 2순위를 못 본 채 옮길 팀을 정하는 일이 없게. */}
        <dl className="grid grid-cols-2 gap-2">
          <WishTeam label="1순위" value={wishTeam1} />
          <WishTeam label="2순위" value={wishTeam2} />
        </dl>
      </section>

      <section className="space-y-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
          면접 평가 총평 {interviewScores.length}건
        </h4>
        {interviewScores.length > 0 ? (
          interviewScores.map((s) => (
            <ScoreRecord
              key={s.id}
              score={s.score}
              scorerName={staffNames[s.scorerUserId] || '이름 미상'}
              comment={s.comment}
              emptyComment="총평을 적지 않았습니다."
            />
          ))
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800">
            면접 점수가 한 건도 없습니다. 면접을 보기로 한 사람인데 아무도 채점하지 않았습니다.
          </p>
        )}
      </section>
    </div>
  );
}

export function RecruitReviewPanel({ role }: { role: Role }) {
  const [cohorts, setCohorts] = useState<any[]>([]);
  // 기수 목록을 받아오는 동안 셀렉트에 표시한다(빈 드롭다운 = '기수 없음' 오해 방지).
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const { teams, loading: teamsLoading } = useTeams(selectedCohortId);

  const [applicants, setApplicants] = useState<any[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [aggregations, setAggregations] = useState<Record<string, ApplicantAggregate>>({});
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [selectedTeam, setSelectedTeam] = useState(ALL_TEAMS_FILTER);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const fetchCohorts = useCallback(async () => {
    try {
      const res = await fetch('/api/recruit/cohorts');
      const data = await res.json();
      if (data.cohorts && data.cohorts.length > 0) {
        setCohorts(data.cohorts);
        setSelectedCohortId(data.cohorts[0].id);
      } else {
        setLoading(false);
      }
    } catch {
      setMessage('❌ 기수 목록을 불러오지 못했습니다. 연결을 확인해 주세요.');
      setLoading(false);
    } finally {
      setCohortsLoading(false);
    }
  }, []);

  // 채점자 이름은 기수와 무관하다 — 한 번만 받는다.
  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch('/api/recruit/staff');
      const data = await res.json();
      const map: Record<string, string> = {};
      (data.staff ?? []).forEach((s: { id: string; name: string }) => {
        map[s.id] = s.name;
      });
      setStaffNames(map);
    } catch {
      // 이름을 못 받아도 점수·총평은 읽을 수 있다. '이름 미상'으로 두고 화면을 막지 않는다.
    }
  }, []);

  const fetchApplicantsAndScores = useCallback(async () => {
    setLoading(true);
    try {
      // 자기소개서 본문은 이 화면에서 쓰지 않는다 — slim 으로 받는다(203명 기준 778KB → 36KB).
      const [appRes, scoreRes] = await Promise.all([
        fetch(`/api/recruit/applicants?cohortId=${selectedCohortId}&slim=1`),
        fetch(`/api/recruit/scores?cohortId=${selectedCohortId}`),
      ]);
      const [appData, scoreData] = await Promise.all([appRes.json(), scoreRes.json()]);

      if (!appRes.ok || !scoreRes.ok) {
        // 조용히 빈 화면을 보여주면 "이 기수에는 검토할 사람이 없다"로 읽힌다.
        setMessage('❌ 검토 자료를 불러오지 못했습니다. 새로고침해 주세요.');
        return;
      }
      setMessage('');
      setApplicants(appData.applicants ?? []);
      setScores(scoreData.scores ?? []);
      setAggregations(scoreData.aggregations ?? {});
    } catch {
      setMessage('❌ 검토 자료를 불러오지 못했습니다. 연결을 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  }, [selectedCohortId]);

  useEffect(() => {
    fetchCohorts();
    fetchStaff();
  }, [fetchCohorts, fetchStaff]);

  useEffect(() => {
    if (selectedCohortId) fetchApplicantsAndScores();
  }, [selectedCohortId, fetchApplicantsAndScores]);

  // 기수를 바꾸면 펼쳐 둔 줄을 접는다 — 다른 기수의 id 가 그대로 남아 있을 이유가 없다.
  useEffect(() => {
    setExpandedIds(new Set());
  }, [selectedCohortId]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pool = applicants.filter(isUnderReview);
  const visible = sortForReview(
    pool.filter((app) => matchesTeamFilter(app, selectedTeam)),
    aggregations
  );
  // 팀을 고르면 그 팀만 남으므로 묶음 제목이 한 줄 더 생길 뿐이다 — '전체'일 때만 나눠 보여준다.
  const groups =
    selectedTeam === ALL_TEAMS_FILTER
      ? groupApplicantsByTeam(visible, teams)
      : [{ team: selectedTeam, applicants: visible }];

  // 이 목록에 서지 않는 사람도 **숫자로는 보여 준다.** 그냥 감추면 33기처럼 배정에서 잊힌
  // 서류 합격자가 아무 화면에도 안 나온 채 발표까지 간다(최종 결정 화면과 같은 이유).
  const missing = {
    unassigned: applicants.filter((a) => a.status === 'doc_pass' && !a.slotId).length,
    noshow: applicants.filter((a) => a.status === 'interview_noshow').length,
  };
  const unscored = pool.filter((a) => (aggregations[a.id]?.interviewScorerCount ?? 0) === 0).length;

  const allExpanded = visible.length > 0 && visible.every((a) => expandedIds.has(a.id));
  const toggleAll = () => {
    setExpandedIds(allExpanded ? new Set() : new Set(visible.map((a) => a.id)));
  };

  // 펼친 칸에 쓰는 것은 면접 기록뿐이다(서류는 표의 평균 점수로 끝난다). 높은 점수부터.
  const interviewScoresOf = (applicantId: string) =>
    scores
      .filter((s) => s.applicantId === applicantId && s.stage === 'interview')
      .sort((a, b) => parseFloat(b.score) - parseFloat(a.score));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-bold text-ink-900">5. 최종 검토 (운영진)</h1>
            <HelpButton screen="recruit-review" />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            면접을 본 지원자를 팀별로 놓고 서류 점수·면접 점수·면접 평가 총평을 함께 봅니다. 읽기 전용입니다.
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

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[13px] font-semibold text-ink-700">
              검토 대상 <strong className="font-bold text-blue-700">{visible.length}명</strong>
              {selectedTeam !== ALL_TEAMS_FILTER ? (
                <span className="ml-1 text-ink-400">(전체 {pool.length}명 중 {selectedTeam})</span>
              ) : null}
            </p>
            {/* 여기 없는 사람을 한 줄로 알린다. 결정 전에 눈으로 잡으라는 자리다. */}
            {missing.unassigned > 0 || missing.noshow > 0 || unscored > 0 ? (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
                {missing.unassigned > 0 ? (
                  <span className="font-semibold text-amber-700">
                    <Icon name="alert" size={12} className="inline" /> 면접 미배정 {missing.unassigned}명은 이
                    목록에 없습니다
                  </span>
                ) : null}
                {missing.noshow > 0 ? <span>면접 불참 {missing.noshow}명 제외</span> : null}
                {unscored > 0 ? (
                  <span className="font-semibold text-amber-700">면접 채점 미기록 {unscored}명</span>
                ) : null}
              </p>
            ) : null}
          </div>

          {visible.length > 0 ? (
            <SecondaryButton type="button" onClick={toggleAll}>
              {allExpanded ? '총평 모두 접기' : '총평 모두 펼치기'}
            </SecondaryButton>
          ) : null}
        </div>

        <StatusMessage text={message} />

        {loading ? (
          <p className="py-10 text-center text-sm text-ink-400">불러오는 중…</p>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-400">
            {pool.length === 0
              ? '아직 면접을 본 지원자가 없습니다. 면접 콘솔에서 점수가 들어오면 여기 나옵니다.'
              : '고른 팀에 검토할 지원자가 없습니다.'}
          </p>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.team} className="space-y-2.5">
                <h2 className="flex items-baseline gap-2 border-b border-cream-200 pb-1.5">
                  <span className="text-[15px] font-bold text-ink-900">{group.team}</span>
                  <span className="text-[13px] font-semibold text-ink-400">{group.applicants.length}명</span>
                </h2>

                <TableCards
                  table={
                    <table className="w-full text-left text-xs">
                      <thead className="bg-cream-100 font-semibold text-ink-700">
                        <tr>
                          <th className="w-12 p-3.5 text-center">순위</th>
                          <th className="p-3.5">이름</th>
                          <th className="p-3.5">학교 / 학과</th>
                          <th className="p-3.5">서류 점수</th>
                          <th className="p-3.5">면접 점수</th>
                          <th className="p-3.5">상태</th>
                          <th className="w-28 p-3.5 text-center">총평·지망</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cream-100">
                        {group.applicants.map((app, i) => {
                          const agg = aggregations[app.id];
                          const open = expandedIds.has(app.id);
                          return (
                            <React.Fragment key={app.id}>
                              <tr className={`transition-colors hover:bg-cream-25 ${open ? 'bg-blue-50/40' : ''}`}>
                                <td className="p-3.5 text-center font-mono font-bold text-ink-500">{i + 1}</td>
                                <td className="p-3.5 text-sm font-bold text-ink-900">{app.name}</td>
                                <td className="p-3.5 text-ink-700">
                                  {app.school} {app.department}
                                </td>
                                <td className="p-3.5">
                                  <ScoreCell
                                    avg={formatScore(agg?.docScoreAvg)}
                                    scorerCount={agg?.docScorerCount ?? 0}
                                  />
                                </td>
                                <td className="p-3.5">
                                  <ScoreCell
                                    avg={formatScore(agg?.interviewScoreAvg)}
                                    scorerCount={agg?.interviewScorerCount ?? 0}
                                  />
                                </td>
                                <td className="p-3.5">
                                  <StatusChip status={app.status} />
                                </td>
                                <td className="p-2 text-center">
                                  <ExpandButton
                                    open={open}
                                    onClick={() => toggleExpand(app.id)}
                                    srLabel={`${app.name} 총평·지망 ${open ? '접기' : '보기'}`}
                                  />
                                </td>
                              </tr>
                              {open ? (
                                <tr className="bg-cream-25">
                                  <td colSpan={7} className="px-3.5 pb-4 pt-1">
                                    <ScoreDetail
                                      interviewScores={interviewScoresOf(app.id)}
                                      staffNames={staffNames}
                                      wishTeam1={app.wishTeam1}
                                      wishTeam2={app.wishTeam2}
                                    />
                                  </td>
                                </tr>
                              ) : null}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  }
                  cards={group.applicants.map((app, i) => {
                    const agg = aggregations[app.id];
                    const open = expandedIds.has(app.id);
                    return (
                      /*
                       * 공용 `RowCard` 를 쓰지 않는다: 그쪽은 "라벨 — 값"을 세로로 쌓는 `<dl>` 이라
                       * 점수 두 개가 학교·학과와 같은 무게로 줄줄이 서고, 폰에서 정작 봐야 할
                       * 숫자가 묻힌다(2026-08-23 사용자 지적 "모바일에서 더 잘 보이게"). 고를 체크박스도
                       * 없는 읽기 전용 카드라 그 구조를 빌릴 이유도 없다.
                       */
                      <li
                        key={app.id}
                        className={`rounded-xl border p-3.5 shadow-card transition-colors ${
                          open ? 'border-blue-200 bg-blue-50/20' : 'border-cream-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span className="font-mono text-[13px] font-bold text-ink-400">{i + 1}</span>
                            <span className="min-w-0 break-words text-[16px] font-bold text-ink-900">{app.name}</span>
                          </span>
                          <StatusChip status={app.status} />
                        </div>

                        {/* 학교·학과와 서류 점수는 폰에서 싣지 않는다(사용자 지정) — 표에 있다. */}
                        <InterviewScoreRow
                          avg={formatScore(agg?.interviewScoreAvg)}
                          scorerCount={agg?.interviewScorerCount ?? 0}
                        />

                        {/* 손가락으로 누르는 자리라 폭을 꽉 채운다. 항목 이름은 빼고 버튼만 둔다 —
                            버튼 글자가 이미 무엇이 열리는지 말한다. */}
                        <ExpandButton
                          open={open}
                          onClick={() => toggleExpand(app.id)}
                          srLabel={`${app.name} 총평·지망 ${open ? '접기' : '보기'}`}
                          className="mt-2.5 w-full"
                        />
                        {open ? (
                          <div className="mt-2.5 rounded-xl bg-cream-50 p-3">
                            <ScoreDetail
                              interviewScores={interviewScoresOf(app.id)}
                              staffNames={staffNames}
                              wishTeam1={app.wishTeam1}
                              wishTeam2={app.wishTeam2}
                            />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                />
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
