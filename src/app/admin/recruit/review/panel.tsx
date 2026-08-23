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
  CardBlock,
  CardField,
  RowCard,
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
 * 채점 기록 한 줄(점수 · 채점자 · 총평).
 *
 * 면접과 서류가 같은 모양을 쓴다 — 검토 회의에서 두 단계를 나란히 읽는 자리라
 * 형태가 다르면 눈이 매번 다시 적응해야 한다. 총평이 주인공이므로 줄바꿈을 그대로 살린다.
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
 * 펼친 줄의 속살 — **서류 코멘트가 왼쪽, 면접 총평이 오른쪽**(2026-08-23 사용자 지정).
 * 표의 열 순서(서류 점수 → 면접 점수)와 같은 방향이라 눈이 왼쪽에서 오른쪽으로 그대로 이어진다.
 * 좁은 화면에서는 한 줄씩 쌓이므로 서류가 위, 면접이 아래가 된다. 표와 카드가 같은 것을 쓴다.
 */
function ScoreDetail({
  interviewScores,
  documentScores,
  staffNames,
}: {
  interviewScores: ScoreRow[];
  documentScores: ScoreRow[];
  staffNames: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <section className="space-y-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
          서류 채점 코멘트 {documentScores.length}건
        </h4>
        {documentScores.length > 0 ? (
          documentScores.map((s) => (
            <ScoreRecord
              key={s.id}
              score={s.score}
              scorerName={staffNames[s.scorerUserId] || '이름 미상'}
              comment={s.comment}
              emptyComment="코멘트를 적지 않았습니다."
            />
          ))
        ) : (
          <p className="text-[13px] text-ink-400">서류 채점 기록이 없습니다.</p>
        )}
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

  const scoresOf = (applicantId: string, stage: 'document' | 'interview') =>
    scores
      .filter((s) => s.applicantId === applicantId && s.stage === stage)
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
                          <th className="w-28 p-3.5 text-center">면접 총평</th>
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
                                <td className="p-0 text-center">
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(app.id)}
                                    aria-expanded={open}
                                    className="min-h-tap w-full px-3.5 text-[12px] font-bold text-blue-700 hover:underline"
                                  >
                                    {open ? '접기' : '펼치기'}
                                  </button>
                                </td>
                              </tr>
                              {open ? (
                                <tr className="bg-cream-25">
                                  <td colSpan={7} className="px-3.5 pb-4 pt-1">
                                    <ScoreDetail
                                      interviewScores={scoresOf(app.id, 'interview')}
                                      documentScores={scoresOf(app.id, 'document')}
                                      staffNames={staffNames}
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
                      <RowCard
                        key={app.id}
                        badge={<StatusChip status={app.status} />}
                        title={
                          <span className="flex items-baseline gap-2">
                            <span className="font-mono text-[13px] font-bold text-ink-400">{i + 1}</span>
                            {app.name}
                          </span>
                        }
                      >
                        <CardField label="학교 / 학과">
                          {app.school} {app.department}
                        </CardField>
                        <CardField label="서류 점수">
                          <ScoreCell avg={formatScore(agg?.docScoreAvg)} scorerCount={agg?.docScorerCount ?? 0} />
                        </CardField>
                        <CardField label="면접 점수">
                          <ScoreCell
                            avg={formatScore(agg?.interviewScoreAvg)}
                            scorerCount={agg?.interviewScorerCount ?? 0}
                          />
                        </CardField>
                        <CardBlock label="면접 총평">
                          <button
                            type="button"
                            onClick={() => toggleExpand(app.id)}
                            aria-expanded={open}
                            className="min-h-tap text-[13px] font-bold text-blue-700 hover:underline"
                          >
                            {open ? '접기' : '펼쳐 보기'}
                          </button>
                          {open ? (
                            <div className="mt-2">
                              <ScoreDetail
                                interviewScores={scoresOf(app.id, 'interview')}
                                documentScores={scoresOf(app.id, 'document')}
                                staffNames={staffNames}
                              />
                            </div>
                          ) : null}
                        </CardBlock>
                      </RowCard>
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
