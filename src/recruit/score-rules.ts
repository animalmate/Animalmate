// F9 신입 모집 채점 규칙 — 순수 로직(부수효과·DB 접근 없음).
// scores.ts 는 db/client 를 import 하므로, 단위 테스트가 DB 연결 없이 규칙만 검증할 수 있도록
// 순수 함수는 이 모듈에 분리한다(CLAUDE.md 코드 컨벤션: 핵심 로직 단위 테스트 필수).

/**
 * 점수 유효성 검증: 0.0 ~ 10.0 범위, 0.5 단위
 */
export function validateScore(score: number): boolean {
  if (isNaN(score) || score < 0 || score > 10) return false;
  const doubled = score * 2;
  return Math.abs(doubled - Math.round(doubled)) < 1e-6;
}
