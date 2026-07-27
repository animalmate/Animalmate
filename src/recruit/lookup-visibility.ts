// F9 비로그인 지원자 조회에서 "무엇까지 보여줄지" 결정하는 순수 로직.
// 스펙: docs/09-RECRUIT-DESIGN.md §6.7 — 표시 = 현재 상태 / 면접 일시·링크(schedule_public ON)
// / 최종 결과(result_public ON).
//
// 왜 순수 함수로 분리하나: 공개 여부는 권한 판단과 같은 급의 규칙이라 단위 테스트로 고정해야 한다
// (CLAUDE.md 코드 컨벤션 — 권한 검사·visibility 필터는 단위 테스트 필수). 또 규칙 #6 에 따라
// 이 판단은 서버에서 끝나야 하며, 화면에서 숨기는 것은 공개 제어가 아니다.

import type { RecruitStatus } from './status';

/** 지원자에게 노출하는 단계. 내부 status 를 그대로 주지 않는다. */
export type PublicStage =
  | 'received' // 접수 완료(심사 전)
  | 'under_review' // 심사 중 — 결과가 아직 공개되지 않음
  | 'doc_pass' // 서류 합격(면접 안내와 함께 공개)
  | 'doc_fail' // 서류 불합격
  | 'interview_done' // 면접 완료, 최종 결과 대기
  | 'interview_noshow' // 면접 불참
  | 'final_pass'
  | 'final_fail';

export interface VisibleResult {
  stage: PublicStage;
  /** 면접 일시·장소·링크를 함께 보여도 되는가. */
  showInterview: boolean;
  /** 합격 축하 멘트·합격 후 안내를 보여도 되는가. */
  showPassContent: boolean;
}

/** 서류 단계 이후의 상태(= 서류 결과가 이미 정해진 상태). */
const DOC_DECIDED: ReadonlySet<RecruitStatus> = new Set<RecruitStatus>([
  'doc_pass',
  'doc_fail',
  'interview_done',
  'interview_noshow',
  'final_pass',
  'final_fail',
]);

/** 최종 결과가 정해진 상태. */
const FINAL_DECIDED: ReadonlySet<RecruitStatus> = new Set<RecruitStatus>(['final_pass', 'final_fail']);

/**
 * 내부 status + 기수의 공개 스위치 2개 → 지원자에게 실제로 보여줄 내용.
 *
 * 핵심 규칙:
 *  - 스위치가 꺼져 있으면 결과를 **절대** 흘리지 않는다. 회장단이 발표하기 전에 지원자가
 *    조회로 당락을 먼저 아는 일이 없어야 한다.
 *  - schedule_public = 서류 결과 + 면접 안내 공개(서류에 붙어야 면접 일정이 의미가 있다).
 *  - result_public   = 최종 당락 공개.
 */
export function visibleLookupResult(
  status: RecruitStatus,
  schedulePublic: boolean,
  resultPublic: boolean
): VisibleResult {
  const hidden: VisibleResult = {
    stage: status === 'received' ? 'received' : 'under_review',
    showInterview: false,
    showPassContent: false,
  };

  // 최종 결과: result_public 이 켜져 있을 때만.
  if (FINAL_DECIDED.has(status)) {
    if (resultPublic) {
      return {
        stage: status === 'final_pass' ? 'final_pass' : 'final_fail',
        showInterview: schedulePublic,
        showPassContent: status === 'final_pass',
      };
    }
    // 아직 발표 전 — 서류 단계까지만 되돌려 보여준다(면접까지 본 사실 자체는 숨기지 않는다).
    return schedulePublic
      ? { stage: 'interview_done', showInterview: true, showPassContent: false }
      : hidden;
  }

  // 서류·면접 단계: schedule_public 이 켜져 있을 때만.
  if (DOC_DECIDED.has(status)) {
    if (!schedulePublic) return hidden;
    return {
      stage: status as PublicStage,
      showInterview: status !== 'doc_fail',
      showPassContent: false,
    };
  }

  // received — 접수됐다는 사실만.
  return hidden;
}
