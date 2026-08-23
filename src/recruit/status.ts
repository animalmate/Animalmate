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
 * 면접 출결(불참) 표시가 가능한가 — **운영진이 쓰는 경로**라 일반 전이 규칙보다 좁아야 한다.
 *
 * 왜 canTransition 으로는 부족한가: 불참 취소(noshow=false)의 도착지가 `doc_pass` 인데,
 * canTransition 은 `received → doc_pass` 도 허용한다 — 그게 **서류 합격 확정**의 정상 경로다.
 * 그래서 출결 API 에 canTransition 만 걸면, 운영진이 아직 심사도 안 된 지원자를 서류 합격으로
 * 올릴 수 있다. 합격 여부 결정은 회장단 몫이고(09-RECRUIT-DESIGN §4), 그래서 `bulk_status`·
 * `update_status` 는 회장단 전용으로 막혀 있다 — 출결로 그 문을 우회할 수 있으면 의미가 없다.
 * (2026-07-31 QA 에서 발견. 화면에서 도달할 수 없다는 것은 방어가 아니다 — 규칙 #6.)
 *
 * 출결은 "면접에 왔는가"라는 **사실의 기록**이므로 면접 단계에 있는 사람에게만 연다.
 * 되돌리기는 불참으로 표시된 사람에게만 — 그래야 되돌아갈 자리가 원래 자리(면접 전)다.
 */
export function canMarkAttendance(from: RecruitStatus, noshow: boolean): boolean {
  return noshow ? from === 'doc_pass' || from === 'interview_done' : from === 'interview_noshow';
}

/**
 * 불참을 **되돌렸을 때 착지할 상태**. 점수가 남아 있으면 면접 완료, 없으면 면접 전(서류 합격)이다.
 *
 * 왜 고정값이면 안 되나(2026-08-23 실제 사고): 되돌리기의 도착지가 `doc_pass` 로 못 박혀 있었다.
 * 그래서 **면접 완료(점수 2건) → 불참 표시 → 되돌리기** 를 거친 33기 지원자 한 명이 점수를 2건
 * 가진 채 '서류 합격'으로 남았다. 상태와 사실이 어긋나면 조용히 사라진다 —
 * `canConfirmFinal` 은 `doc_pass` 를 받지 않으므로 **최종 확정에서 말없이 건너뛰어지고**,
 * 그 사람은 지원자 조회에서 영영 '결과 대기'로 보인다.
 *
 * 상태는 사실의 반영이라는 원칙(09-RECRUIT-DESIGN §3)을 여기서도 그대로 쓴다:
 * 되돌리기는 "불참이 아니었다"는 말이지 "면접을 안 봤다"는 말이 아니다.
 */
export function attendanceRevertTarget(interviewScoreCount: number): RecruitStatus {
  return interviewScoreCount > 0 ? 'interview_done' : 'doc_pass';
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
      // received → doc_pass(서류 합격 확정)이 원래 경로다. 여기에 **면접 불참 취소**를 더한다 —
      // 불참은 면접관이 현장에서 누르는 표시라 잘못 누를 수 있고, 되돌릴 수 없으면 그때마다
      // 회장단을 불러야 한다. 되돌아갈 자리는 "면접 전"인 doc_pass 다.
      return canConfirmDoc(from) || from === 'interview_noshow';
    case 'doc_fail':
      return canConfirmDoc(from);
    case 'final_pass':
    case 'final_fail':
      return canConfirmFinal(from);
    // 배정됐지만 면접에 오지 않은 사람. **면접관(운영진)이 면접 콘솔에서** 표시한다
    // — 그 자리에서 본 사실이라 회장단이 나중에 옮겨 적을 이유가 없다(2026-07-31).
    case 'interview_noshow':
      return from === 'doc_pass' || from === 'interview_done';
    // 접수 상태로 되돌리거나, 면접 완료를 수동 지정하는 경로는 없다
    // (면접 완료는 점수가 있다는 '사실'의 반영이라 자동 전이로만 결정된다).
    case 'received':
    case 'interview_done':
      return false;
  }
}
