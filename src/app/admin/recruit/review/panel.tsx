'use client';

import { HelpButton } from '@/components/help-button';
import type { Role } from '@/auth/permissions';
import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/icon';
import { useTeams } from '@/components/use-teams';
import { ALL_TEAMS_FILTER, matchesTeamFilter } from '@/recruit/team-filter';
import {
  isUnderReview,
  sortForReview,
  groupApplicantsByTeam,
  incomingMovesByTeam,
} from '@/recruit/review-list';
import {
  countReviewMarks,
  MOVE_TEAM_UNSET_LABEL,
  nextReviewMark,
  normalizeMoveTeam,
  REVIEW_MARK_LABEL,
  type ReviewMark,
} from '@/recruit/review-marks';
import type { ApplicantAggregate } from '@/recruit/aggregate';
import { recruitStatusBadge, BADGE_TONE_CLASS } from '@/recruit/status-label';
import { formatScore } from '@/recruit/display';
import { formatPhone } from '@/lib/phone';
import { RecruitNav } from '@/components/recruit-nav';
import {
  Card,
  SecondaryButton,
  Select,
  StatusMessage,
  TableCards,
  TeamOptions,
  ToolbarSelect,
} from '@/components/ui';

/** 표·카드가 함께 다루는 검토 표시 한 벌. 서버가 돌려주는 모양과 같다. */
interface MarkState {
  reviewMark: ReviewMark | null;
  reviewMoveTeam: string | null;
}

interface ScoreRow {
  id: string;
  applicantId: string;
  scorerUserId: string;
  stage: 'document' | 'interview';
  score: string;
  comment: string | null;
  updatedAt: string;
}

/**
 * 표시별 색. 탈락은 코랄(다른 화면의 '불합격'과 같은 계열), 다른 팀은 앰버(주의·이동)다.
 * 상태 배지와 **겹치지 않게** 고른 값이라 여기서 한 번만 정하고 표·카드·요약이 같이 쓴다.
 */
const MARK_STYLE: Record<ReviewMark, { row: string; card: string; on: string; off: string }> = {
  drop: {
    row: 'bg-coral-50/60',
    card: 'border-coral-300 bg-coral-50/60',
    on: 'border-coral-300 bg-coral-100 text-coral-700',
    off: 'border-ink-200 bg-white text-ink-500 hover:border-coral-300 hover:text-coral-600',
  },
  move: {
    row: 'bg-amber-50/60',
    card: 'border-amber-300 bg-amber-50/60',
    on: 'border-amber-300 bg-amber-100 text-amber-800',
    off: 'border-ink-200 bg-white text-ink-500 hover:border-amber-300 hover:text-amber-700',
  },
};

/**
 * '다른 팀에서 오는 사람' 알림 칸의 색. 탈락(코랄)·다른 팀(앰버) 어느 쪽과도 안 겹치는
 * 세 번째 색(바이올렛)을 쓴다 — 이 칸은 표시를 **거는** 자리가 아니라 **받는** 자리라서,
 * 같은 색을 쓰면 이 팀에서 새로 누른 표시로 오해한다.
 */
const MOVE_IN_STYLE = {
  row: 'bg-violet-50/70',
  card: 'border-violet-300 bg-violet-50/70',
  badge: 'border-violet-300 bg-violet-100 text-violet-700',
};

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
      <p className="mt-2.5 flex items-baseline gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">
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
 * 지망 두 칸. **접힌 줄에 세운다**(2026-08-24 사용자 지정).
 *
 * 이 화면에서 나오는 이야기가 "얘는 다른 팀이 낫겠다"라서, 옮길 곳을 보려고 매번 펼치게 하면
 * 회의가 느려진다. 1지망을 굵게·2지망을 작게 두어 무엇이 우선인지 눈으로 갈리게 한다.
 * 안 고른 사람은 빈칸이 아니라 '미기재'라고 적는다 — 빈칸은 화면이 덜 그려진 것으로 읽힌다.
 */
function WishTeams({ first, second }: { first?: string | null; second?: string | null }) {
  const value = (v?: string | null) => (v?.trim() ? v : '미기재');
  return (
    <span className="block min-w-0">
      <span className="block truncate text-[13px] font-semibold text-ink-900">{value(first)}</span>
      <span className="block truncate text-[11px] text-ink-400">2지망 {value(second)}</span>
    </span>
  );
}

/**
 * 검토 표시 체크박스 하나.
 *
 * `type="checkbox"` 를 그대로 쓴다 — 팀장단이 회의 중에 죽 훑으며 누르는 자리라, 눌러서 켜고
 * 다시 눌러서 끄는 몸짓이 이미 몸에 있는 것이라야 한다. 다만 **두 칸이 한 값**이므로
 * (내보낼 사람을 동시에 탈락시킬 수는 없다) 서로 배타적으로 움직인다 — 규칙은 `nextReviewMark`.
 *
 * 네모만 노리면 자꾸 빗나가므로 `label` 로 감싸 칸 전체를 누를 수 있게 한다(최종 결정 화면과 같다).
 */
function MarkBox({
  mark,
  checked,
  onToggle,
  applicantName,
  saving,
  compact = false,
}: {
  mark: ReviewMark;
  checked: boolean;
  onToggle: () => void;
  applicantName: string;
  /** 저장이 끝나기 전에 같은 줄을 또 누르면 요청이 엇갈려 마지막 값이 뒤집힌다. */
  saving: boolean;
  /** 폰 카드용 — 글자를 함께 보여 준다(표는 열 제목이 이미 말해 준다). */
  compact?: boolean;
}) {
  const style = MARK_STYLE[mark];
  return (
    <label
      className={`flex min-h-tap cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-[12px] font-semibold transition-colors ${
        checked ? style.on : style.off
      } ${saving ? 'cursor-wait opacity-60' : ''} ${compact ? 'flex-1 py-1' : 'w-full'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={saving}
        onChange={onToggle}
        aria-label={`${applicantName} ${REVIEW_MARK_LABEL[mark]} 표시`}
        className="h-4 w-4 rounded border-ink-300 text-blue-600 focus:ring-blue-500"
      />
      {compact ? <span>{REVIEW_MARK_LABEL[mark]}</span> : null}
    </label>
  );
}

/**
 * '다른 팀' 표시에 딸린 **갈 팀** 셀렉트. 표시를 켠 줄에만 나온다.
 *
 * 빈 선택지('팀 미정')를 **맨 위에 두고 기본값으로 둔다**(2026-08-24 사용자 지정 "선택 안 할 수도
 * 있고"). 고르게 강제하면 아무 팀이나 찍고 넘어가는데, 안 고른 것과 아무거나 고른 것은 6번
 * 화면에서 전혀 다른 사실로 읽힌다.
 *
 * 지금 값이 기수의 팀 목록에 없으면(옛 기수 이름이 남았거나 팀 목록이 바뀐 경우) 그 값을 선택지에
 * 얹는다 — 그러지 않으면 셀렉트가 제멋대로 '팀 미정'을 가리켜, 회의가 정해 둔 목적지가
 * 아무 말 없이 지워진 것처럼 보인다.
 */
function MoveTeamSelect({
  value,
  teams,
  teamsLoading,
  onChange,
  applicantName,
  saving,
}: {
  value: string | null;
  teams: string[];
  teamsLoading: boolean;
  onChange: (team: string) => void;
  applicantName: string;
  saving: boolean;
}) {
  const extra = value && !teams.includes(value) ? [value] : [];
  return (
    <Select
      uiSize="sm"
      value={value ?? ''}
      disabled={saving}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`${applicantName} 보낼 팀`}
      // 글자 크기를 덧붙이지 않는다 — `uiSize` 가 정한 `text-[13px]` 과 같은 특이도라
      // 어느 쪽이 이길지가 CSS 출력 순서에 달린다(ui.tsx `ControlSize` 주석의 그 함정).
      // 폭도 `CONTROL` 의 `w-full` 이 이미 준다. 실제 폭은 감싼 칸(`th` 의 `w-36`)이 정한다.
    >
      <option value="">{MOVE_TEAM_UNSET_LABEL}</option>
      {extra.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
      {teamsLoading ? <option disabled>팀 목록 불러오는 중…</option> : null}
      {teams.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </Select>
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
 * **펼친 상태의 색**(지금 열려 있다는 표시 + 화살표 뒤집기).
 *
 * 높이는 `min-h-tap`(44px)이었다가 여백을 줄였다 — 표 한 줄에 비해 뭉툭했다(2026-08-23 사용자 지적).
 * 줄인 것은 여백뿐이고 위 세 가지는 그대로다. 폰에서는 폭을 꽉 채워 쓰므로(`w-full`) 낮아도 누를 자리는 넉넉하다.
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
      className={`inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
        open
          ? 'border-blue-300 bg-blue-50 text-blue-700'
          : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-cream-50'
      } ${className}`}
    >
      {open ? '접기' : '펼치기'}
      <Icon
        name="chevronDown"
        size={14}
        className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      />
    </button>
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
 * 펼친 줄의 속살 — **면접 평가 총평뿐이다.**
 *
 * 서류 채점 코멘트는 여기 없다: 이 자리에서 정하는 것은 면접을 보고 난 뒤의 판단이고,
 * 서류 이야기는 이미 2번(서류 집계·확정)에서 끝났다.
 *
 * 지망 팀도 여기 있었지만 **접힌 줄로 올렸다**(2026-08-24) — 팀을 옮길지 이야기하려고 매번
 * 펼쳐야 했다. 펼치는 값이 한 종류만 남는 편이 낫다: "펼치면 총평이 나온다"가 규칙이 된다.
 */
function ScoreDetail({
  interviewScores,
  staffNames,
}: {
  interviewScores: ScoreRow[];
  staffNames: Record<string, string>;
}) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
        면접 평가 총평 {interviewScores.length}건
      </h4>
      {interviewScores.length > 0 ? (
        // 총평이 가로를 다 쓰게 되면서 한 건이 한 줄로 길어진다 — 넓은 화면에서는 두 칸으로 나눈다.
        <div className="grid grid-cols-1 items-start gap-2 lg:grid-cols-2">
          {interviewScores.map((s) => (
            <ScoreRecord
              key={s.id}
              score={s.score}
              scorerName={staffNames[s.scorerUserId] || '이름 미상'}
              comment={s.comment}
              emptyComment="총평을 적지 않았습니다."
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800">
          면접 점수가 한 건도 없습니다. 면접을 보기로 한 사람인데 아무도 채점하지 않았습니다.
        </p>
      )}
    </section>
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
  // 검토 표시를 저장하는 중인 지원자. 같은 줄을 연타하면 요청이 엇갈려 마지막 값이 뒤집힌다.
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());

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

  const patchMark = (id: string, state: MarkState) =>
    setApplicants((prev) => prev.map((a) => (a.id === id ? { ...a, ...state } : a)));

  /**
   * 검토 표시(와 갈 팀)를 저장한다.
   *
   * 화면을 **먼저** 바꾸고 저장한다 — 회의 중에는 한 명당 1초도 안 걸리게 훑으므로, 왕복을
   * 기다렸다 칠해지면 눌렀는지 아닌지 헷갈려 두 번 누른다.
   *
   * 대신 실패하면 **반드시 되돌린다.** 저장되지 않은 표시가 화면에 남으면 회의는 그것을 믿고
   * 넘어가고 6번 화면(회장단)에는 아무것도 없다 — 어긋남이 아무 오류도 없이 발표까지 간다.
   *
   * 보낼 값은 서버와 **같은 함수**로 정리한다(`normalizeMoveTeam`): 화면이 표시만 바꾸고
   * 옛 목적지를 남긴 채 그리면, 서버가 지운 뒤에도 새로고침 전까지는 남아 있는 것처럼 보인다.
   */
  const saveMark = async (
    app: { id: string; name: string; reviewMark?: ReviewMark | null; reviewMoveTeam?: string | null },
    mark: ReviewMark | null,
    moveTeam: string | null
  ) => {
    if (markingIds.has(app.id)) return;
    const before: MarkState = {
      reviewMark: app.reviewMark ?? null,
      reviewMoveTeam: app.reviewMoveTeam ?? null,
    };
    const after: MarkState = { reviewMark: mark, reviewMoveTeam: normalizeMoveTeam(mark, moveTeam) };

    patchMark(app.id, after);
    setMarkingIds((prev) => new Set(prev).add(app.id));
    try {
      const res = await fetch('/api/recruit/applicants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review_mark',
          id: app.id,
          cohortId: selectedCohortId,
          ...after,
        }),
      });
      if (!res.ok) throw new Error('save_failed');
      setMessage('');
    } catch {
      patchMark(app.id, before);
      setMessage(`❌ ${app.name} 검토 표시를 저장하지 못했습니다. 다시 눌러 주세요.`);
    } finally {
      setMarkingIds((prev) => {
        const rest = new Set(prev);
        rest.delete(app.id);
        return rest;
      });
    }
  };

  /** 체크박스 — 두 칸이 한 값이라 서로 배타적으로 움직인다(`nextReviewMark`). */
  const handleMark = (
    app: { id: string; name: string; reviewMark?: ReviewMark | null; reviewMoveTeam?: string | null },
    clicked: ReviewMark
  ) => saveMark(app, nextReviewMark(app.reviewMark ?? null, clicked), app.reviewMoveTeam ?? null);

  /** 갈 팀 셀렉트 — 표시는 'move' 로 둔 채 목적지만 바꾼다(빈 값이면 '팀 미정'으로 되돌린다). */
  const handleMoveTeam = (
    app: { id: string; name: string; reviewMark?: ReviewMark | null; reviewMoveTeam?: string | null },
    team: string
  ) => saveMark(app, 'move', team);

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

  // '다른 팀' 표시를 갈 팀 기준으로 묶는다. **팀 필터를 걸지 않은 pool 전체**를 넣어야 한다 —
  // `visible` 은 이미 selectedTeam 으로 걸러진 목록이라, 다른 팀에서 이 팀으로 넘어오는
  // 사람은 애초에 걸러져 안 보인다.
  const incomingMoves = incomingMovesByTeam(pool);
  // 자기 소속 인원이 하나도 없는 팀도, 다른 팀에서 넘어오는 사람이 있으면 박스가 떠야
  // 한다 — 그러지 않으면 그 팀 화면에는 '다른 팀' 표시가 영영 안 보인다('전체'일 때만
  // 해당한다. 특정 팀을 골랐을 때는 이미 그 팀 박스가 항상 하나 서 있다).
  const extraTeams =
    selectedTeam === ALL_TEAMS_FILTER
      ? teams.filter((t) => incomingMoves.has(t) && !groups.some((g) => g.team === t))
      : [];
  const displayGroups = [...groups, ...extraTeams.map((team) => ({ team, applicants: [] as typeof visible }))];
  const hasIncoming =
    selectedTeam === ALL_TEAMS_FILTER ? incomingMoves.size > 0 : incomingMoves.has(selectedTeam);

  // 이 목록에 서지 않는 사람도 **숫자로는 보여 준다.** 그냥 감추면 33기처럼 배정에서 잊힌
  // 서류 합격자가 아무 화면에도 안 나온 채 발표까지 간다(최종 결정 화면과 같은 이유).
  const missing = {
    unassigned: applicants.filter((a) => a.status === 'doc_pass' && !a.slotId).length,
    noshow: applicants.filter((a) => a.status === 'interview_noshow').length,
  };
  const unscored = pool.filter((a) => (aggregations[a.id]?.interviewScorerCount ?? 0) === 0).length;
  // 지금 보이는 목록을 센다 — 팀을 골라 놓았다면 회의가 말하는 숫자는 "이 팀에서 몇 명"이다.
  const marked = countReviewMarks(visible);
  const moveTeamUnset = visible.filter((a) => a.reviewMark === 'move' && !a.reviewMoveTeam).length;

  const allExpanded = visible.length > 0 && visible.every((a) => expandedIds.has(a.id));
  const toggleAll = () => {
    setExpandedIds(allExpanded ? new Set() : new Set(visible.map((a) => a.id)));
  };

  // 펼친 칸에 쓰는 것은 면접 기록뿐이다(서류는 2번 화면에서 끝났다). 높은 점수부터.
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
            면접을 본 지원자를 팀별로 놓고 면접 점수·지망 팀·면접 평가 총평을 함께 봅니다.{' '}
            <strong className="text-ink-700">탈락</strong>·
            <strong className="text-ink-700">다른 팀</strong>(보낼 팀은 안 골라도 됩니다) 표시는
            회장단에게 넘길 의견이고, 합격 여부와 배정 팀은 여기서 바뀌지 않습니다.
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
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold text-ink-700">
              <span>
                검토 대상 <strong className="font-bold text-blue-700">{visible.length}명</strong>
                {selectedTeam !== ALL_TEAMS_FILTER ? (
                  <span className="ml-1 text-ink-400">(전체 {pool.length}명 중 {selectedTeam})</span>
                ) : null}
              </span>
              {/* 회의는 "몇 명 빼지"를 숫자로 말한다. 세어 두지 않으면 매번 눈으로 센다. */}
              {marked.drop > 0 ? (
                <span className={`rounded-full border px-2 py-0.5 text-[12px] ${MARK_STYLE.drop.on}`}>
                  탈락 {marked.drop}명
                </span>
              ) : null}
              {marked.move > 0 ? (
                <span className={`rounded-full border px-2 py-0.5 text-[12px] ${MARK_STYLE.move.on}`}>
                  다른 팀 {marked.move}명
                  {/* 갈 팀을 안 고른 사람 수를 붙인다 — 안 고르는 것은 정상이지만, 회의가
                      끝날 때 "어디로 보낼지 아직 아무도 안 정한 사람"은 세어 볼 값이다. */}
                  {moveTeamUnset > 0 ? (
                    <span className="font-normal opacity-80"> · {MOVE_TEAM_UNSET_LABEL} {moveTeamUnset}명</span>
                  ) : null}
                </span>
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

          <div className="flex flex-wrap items-center gap-2">
            {/* 팀장단이 각자 노트북으로 함께 여는 화면이다 — 옆 사람이 방금 누른 표시는
                저절로 넘어오지 않으므로 다시 읽을 손잡이를 둔다. */}
            <SecondaryButton
              type="button"
              onClick={fetchApplicantsAndScores}
              disabled={loading || !selectedCohortId}
            >
              <Icon name="refresh" size={14} className="mr-1 inline" />
              새로고침
            </SecondaryButton>
            {visible.length > 0 ? (
              <SecondaryButton type="button" onClick={toggleAll}>
                {allExpanded ? '총평 모두 접기' : '총평 모두 펼치기'}
              </SecondaryButton>
            ) : null}
          </div>
        </div>

        <StatusMessage text={message} />

        {loading ? (
          <p className="py-10 text-center text-sm text-ink-400">불러오는 중…</p>
        ) : visible.length === 0 && !hasIncoming ? (
          <p className="py-10 text-center text-sm text-ink-400">
            {pool.length === 0
              ? '아직 면접을 본 지원자가 없습니다. 면접 콘솔에서 점수가 들어오면 여기 나옵니다.'
              : '고른 팀에 검토할 지원자가 없습니다.'}
          </p>
        ) : (
          <div className="space-y-6">
            {displayGroups.map((group) => {
              const incoming = incomingMoves.get(group.team) ?? [];
              return (
              <section key={group.team} className="space-y-2.5">
                <h2 className="flex items-baseline gap-2 border-b border-cream-200 pb-1.5">
                  <span className="text-[15px] font-bold text-ink-900">{group.team}</span>
                  <span className="text-[13px] font-semibold text-ink-400">{group.applicants.length}명</span>
                  {incoming.length > 0 ? (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${MOVE_IN_STYLE.badge}`}
                    >
                      다른 팀에서 {incoming.length}명
                    </span>
                  ) : null}
                </h2>

                <TableCards
                  table={
                    <table className="w-full text-left text-xs">
                      <thead className="bg-cream-100 font-semibold text-ink-700">
                        <tr>
                          <th className="w-12 p-3.5 text-center">순위</th>
                          <th className="p-3.5">이름</th>
                          <th className="p-3.5">전화번호</th>
                          <th className="p-3.5">면접 점수</th>
                          <th className="p-3.5">1지망 / 2지망</th>
                          <th className="p-3.5">상태</th>
                          {/* 표시 두 칸은 나란히 둔다 — 열을 따라 내려 읽으면 몇 명인지 눈에 잡힌다.
                              '다른 팀'은 켰을 때 갈 팀 셀렉트가 아래에 붙으므로 폭을 더 준다. */}
                          <th className="w-20 p-3.5 text-center text-coral-700">탈락</th>
                          <th className="w-36 p-3.5 text-center text-amber-700">다른 팀</th>
                          <th className="w-24 p-3.5 text-center">총평</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cream-100">
                        {incoming.map(({ applicant, fromTeam }) => {
                          const agg = aggregations[applicant.id];
                          return (
                            <tr key={`in-${applicant.id}`} className={`transition-colors ${MOVE_IN_STYLE.row}`}>
                              <td className="p-3.5 text-center text-violet-400" aria-hidden>
                                <Icon name="chevronRight" size={14} className="inline" />
                              </td>
                              <td className="p-3.5 text-sm font-bold text-ink-900">{applicant.name}</td>
                              <td className="p-3.5 text-[13px] text-ink-500">
                                {formatPhone(applicant.phone) || '미기재'}
                              </td>
                              <td className="p-3.5">
                                <ScoreCell
                                  avg={formatScore(agg?.interviewScoreAvg)}
                                  scorerCount={agg?.interviewScorerCount ?? 0}
                                />
                              </td>
                              <td className="p-3.5">
                                <WishTeams first={applicant.wishTeam1} second={applicant.wishTeam2} />
                              </td>
                              <td className="p-3.5">
                                <StatusChip status={applicant.status} />
                              </td>
                              {/* 탈락·다른 팀 두 칸을 합쳐 하나의 알림 배지로 쓴다 — 이 줄은
                                  받는 팀의 화면이라 여기서 표시를 걸거나 지울 수 없다. */}
                              <td colSpan={2} className="p-2 text-center">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12px] font-semibold ${MOVE_IN_STYLE.badge}`}
                                >
                                  {fromTeam} → {group.team}
                                </span>
                              </td>
                              <td className="p-2 text-center text-ink-300" aria-hidden>
                                —
                              </td>
                            </tr>
                          );
                        })}
                        {group.applicants.map((app, i) => {
                          const agg = aggregations[app.id];
                          const open = expandedIds.has(app.id);
                          const mark: ReviewMark | null = app.reviewMark ?? null;
                          const saving = markingIds.has(app.id);
                          // 표시가 있으면 줄 전체에 색을 깐다 — 펼침 색보다 우선한다. 회의에서 먼저
                          // 알아야 하는 것은 "지금 열려 있나"가 아니라 "이 사람 뺐나"다.
                          const rowTone = mark ? MARK_STYLE[mark].row : open ? 'bg-blue-50/40' : '';
                          return (
                            <React.Fragment key={app.id}>
                              <tr className={`transition-colors hover:bg-cream-25 ${rowTone}`}>
                                <td className="p-3.5 text-center font-mono font-bold text-ink-500">{i + 1}</td>
                                <td className="p-3.5 text-sm font-bold text-ink-900">{app.name}</td>
                                <td className="p-3.5 text-[13px] text-ink-500">
                                  {formatPhone(app.phone) || '미기재'}
                                </td>
                                <td className="p-3.5">
                                  <ScoreCell
                                    avg={formatScore(agg?.interviewScoreAvg)}
                                    scorerCount={agg?.interviewScorerCount ?? 0}
                                  />
                                </td>
                                <td className="p-3.5">
                                  <WishTeams first={app.wishTeam1} second={app.wishTeam2} />
                                </td>
                                <td className="p-3.5">
                                  <StatusChip status={app.status} />
                                </td>
                                <td className="p-2">
                                  <MarkBox
                                    mark="drop"
                                    checked={mark === 'drop'}
                                    onToggle={() => handleMark(app, 'drop')}
                                    applicantName={app.name}
                                    saving={saving}
                                  />
                                </td>
                                <td className="p-2">
                                  <div className="space-y-1">
                                    <MarkBox
                                      mark="move"
                                      checked={mark === 'move'}
                                      onToggle={() => handleMark(app, 'move')}
                                      applicantName={app.name}
                                      saving={saving}
                                    />
                                    {/* 켠 줄에만 나온다 — 안 켠 줄까지 셀렉트가 서면 표가
                                        "팀을 고르는 화면"으로 보인다. */}
                                    {mark === 'move' ? (
                                      <MoveTeamSelect
                                        value={app.reviewMoveTeam ?? null}
                                        teams={teams}
                                        teamsLoading={teamsLoading}
                                        onChange={(team) => handleMoveTeam(app, team)}
                                        applicantName={app.name}
                                        saving={saving}
                                      />
                                    ) : null}
                                  </div>
                                </td>
                                <td className="p-2 text-center">
                                  <ExpandButton
                                    open={open}
                                    onClick={() => toggleExpand(app.id)}
                                    srLabel={`${app.name} 면접 총평 ${open ? '접기' : '펼치기'}`}
                                  />
                                </td>
                              </tr>
                              {open ? (
                                <tr className="bg-cream-25">
                                  <td colSpan={9} className="px-3.5 pb-4 pt-1">
                                    <ScoreDetail
                                      interviewScores={interviewScoresOf(app.id)}
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
                  cards={[
                    ...incoming.map(({ applicant, fromTeam }) => {
                      const agg = aggregations[applicant.id];
                      return (
                        <li
                          key={`in-${applicant.id}`}
                          className={`rounded-xl border p-3.5 shadow-card ${MOVE_IN_STYLE.card}`}
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            <span
                              className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${MOVE_IN_STYLE.badge}`}
                            >
                              {fromTeam} → {group.team}
                            </span>
                            <StatusChip status={applicant.status} />
                          </div>
                          <p className="mt-2 min-w-0 break-words text-[16px] font-bold text-ink-900">
                            {applicant.name}
                          </p>
                          <p className="mt-0.5 text-[13px] text-ink-500">
                            {formatPhone(applicant.phone) || '미기재'}
                          </p>
                          <InterviewScoreRow
                            avg={formatScore(agg?.interviewScoreAvg)}
                            scorerCount={agg?.interviewScorerCount ?? 0}
                          />
                          <div className="mt-2 rounded-xl border border-cream-200 bg-white px-3 py-2">
                            <WishTeams first={applicant.wishTeam1} second={applicant.wishTeam2} />
                          </div>
                        </li>
                      );
                    }),
                    ...group.applicants.map((app, i) => {
                    const agg = aggregations[app.id];
                    const open = expandedIds.has(app.id);
                    const mark: ReviewMark | null = app.reviewMark ?? null;
                    const saving = markingIds.has(app.id);
                    return (
                      /*
                       * 공용 `RowCard` 를 쓰지 않는다: 그쪽은 "라벨 — 값"을 세로로 쌓는 `<dl>` 이라
                       * 점수가 학교·학과와 같은 무게로 줄줄이 서고, 폰에서 정작 봐야 할 숫자가
                       * 묻힌다(2026-08-23 사용자 지적 "모바일에서 더 잘 보이게").
                       */
                      <li
                        key={app.id}
                        className={`rounded-xl border p-3.5 shadow-card transition-colors ${
                          mark
                            ? MARK_STYLE[mark].card
                            : open
                              ? 'border-blue-200 bg-blue-50/20'
                              : 'border-cream-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span className="font-mono text-[13px] font-bold text-ink-400">{i + 1}</span>
                            <span className="min-w-0 break-words text-[16px] font-bold text-ink-900">{app.name}</span>
                          </span>
                          <StatusChip status={app.status} />
                        </div>
                        <p className="mt-0.5 text-[13px] text-ink-500">{formatPhone(app.phone) || '미기재'}</p>

                        {/* 학교·학과와 서류 점수는 폰에서 싣지 않는다(사용자 지정). */}
                        <InterviewScoreRow
                          avg={formatScore(agg?.interviewScoreAvg)}
                          scorerCount={agg?.interviewScorerCount ?? 0}
                        />

                        <div className="mt-2 rounded-xl border border-cream-200 bg-white px-3 py-2">
                          <WishTeams first={app.wishTeam1} second={app.wishTeam2} />
                        </div>

                        {/* 표시 두 칸은 손가락으로 누르는 자리라 폭을 반씩 나눠 크게 둔다. */}
                        <div className="mt-2.5 flex gap-2">
                          <MarkBox
                            mark="drop"
                            checked={mark === 'drop'}
                            onToggle={() => handleMark(app, 'drop')}
                            applicantName={app.name}
                            saving={saving}
                            compact
                          />
                          <MarkBox
                            mark="move"
                            checked={mark === 'move'}
                            onToggle={() => handleMark(app, 'move')}
                            applicantName={app.name}
                            saving={saving}
                            compact
                          />
                        </div>
                        {/* 갈 팀은 켠 뒤에 나온다. 폰에서는 셀렉트가 줄을 통째로 쓴다 —
                            반 칸에 넣으면 "봉사 1팀"이 잘린다. */}
                        {mark === 'move' ? (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="shrink-0 text-[12px] font-semibold text-amber-800">보낼 팀</span>
                            <MoveTeamSelect
                              value={app.reviewMoveTeam ?? null}
                              teams={teams}
                              teamsLoading={teamsLoading}
                              onChange={(team) => handleMoveTeam(app, team)}
                              applicantName={app.name}
                              saving={saving}
                            />
                          </div>
                        ) : null}

                        <ExpandButton
                          open={open}
                          onClick={() => toggleExpand(app.id)}
                          srLabel={`${app.name} 면접 총평 ${open ? '접기' : '펼치기'}`}
                          className="mt-2 w-full"
                        />
                        {open ? (
                          <div className="mt-2.5 rounded-xl bg-cream-50 p-3">
                            <ScoreDetail
                              interviewScores={interviewScoresOf(app.id)}
                              staffNames={staffNames}
                            />
                          </div>
                        ) : null}
                      </li>
                    );
                    }),
                  ]}
                />
              </section>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
