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

/**
 * 회장단이 수동으로 지정할 수 있는 상태 전이인지 판정한다(09-RECRUIT-DESIGN §3).
 *
 * 왜 필요한가: 위 가드 두 개는 정의만 있고 아무 데서도 호출되지 않아서, 서버가 상태 전이를
 * 전혀 검사하지 않았다. 최종 결정 화면은 팀으로만 걸러 심사 전(received) 지원자까지 목록에
 * 띄우므로, 전체 선택 후 확정하면 심사도 면접도 안 거친 사람이 최종 합격이 될 수 있었다.
 * 화면에서 감추는 것은 검증이 아니다(규칙 #6).
 *
 * 자동 전이(면접 점수 저장/삭제에 따른 interview_done ↔ doc_pass)는 여기서 다루지 않는다.
 * 그쪽은 nextStatusOnScoreChange 가 같은 트랜잭션에서 처리한다.
 */
export function canTransition(from: RecruitStatus, to: RecruitStatus): boolean {
  if (from === to) return false; // 이미 그 상태면 바꿀 것이 없다
  switch (to) {
    case 'doc_pass':
    case 'doc_fail':
      return canConfirmDoc(from);
    case 'final_pass':
    case 'final_fail':
      return canConfirmFinal(from);
    // 배정됐지만 면접을 못 본 사람을 회장단이 표시한다.
    case 'interview_noshow':
      return from === 'doc_pass' || from === 'interview_done';
    // 접수 상태로 되돌리거나, 면접 완료를 수동 지정하는 경로는 없다
    // (면접 완료는 점수가 있다는 '사실'의 반영이라 자동 전이로만 결정된다).
    case 'received':
    case 'interview_done':
      return false;
  }
}
