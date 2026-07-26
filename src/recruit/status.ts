// F9 신입 기수 모집 지원자 상태 자동 전이 및 가드 함수
// 스펙: docs/09-RECRUIT-DESIGN.md §3

export type RecruitStatus =
  | 'received'
  | 'doc_fail'
  | 'doc_pass'
  | 'interview_done'
  | 'interview_noshow'
  | 'final_pass'
  | 'final_fail';

/**
 * 면접 점수(stage=interview) 개수 변화에 따른 지원자 상태 자동 전이.
 * - 면접 점수가 1개 이상이면 doc_pass/interview_noshow -> interview_done (사실 반영)
 * - 면접 점수가 0개로 감소하면 interview_done -> doc_pass (역방향 복귀)
 * - 그 외 수동 상태(received, doc_fail, final_pass, final_fail)는 영향 받지 않음.
 */
export function nextStatusOnScoreChange(
  currentStatus: RecruitStatus,
  interviewScoreCount: number
): RecruitStatus {
  if (interviewScoreCount > 0) {
    if (currentStatus === 'doc_pass' || currentStatus === 'interview_noshow') {
      return 'interview_done';
    }
  } else if (interviewScoreCount === 0) {
    if (currentStatus === 'interview_done') {
      return 'doc_pass';
    }
  }
  return currentStatus;
}

/** 서류 합격 확정 가능 여부 (received 상태만 합격/불합격 확정 가능) */
export function canConfirmDoc(status: RecruitStatus): boolean {
  return status === 'received';
}

/** 최종 합격 확정 가능 여부 (interview_done 또는 interview_noshow 상태만 가능) */
export function canConfirmFinal(status: RecruitStatus): boolean {
  return status === 'interview_done' || status === 'interview_noshow';
}
