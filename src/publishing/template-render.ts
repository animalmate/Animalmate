// 플레이스홀더 치환 — 순수 함수만. 서버(발행 워커)와 클라이언트(예약 수정 미리보기)가 함께 쓰므로
// DB·auth 등 서버 전용 모듈을 import 하지 않는다.
//
// 치환 시점(결정 2026-07-24):
//  - 생성 시: 회차가 정해지는 값(날짜/집합시간/팀장단)만 치환해 본문에 굳힌다.
//  - 발행 직전: {{장소}}{{정원}} 등 남은 키를 event 값으로 치환한다(events 가 유일한 값 저장소).

const PLACEHOLDER_RE = /\{\{\s*([^}\s]+)\s*\}\}/g;

/** 플레이스홀더 치환. 값이 없는 키는 그대로 둔다(이후 단계에서 채움). */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(PLACEHOLDER_RE, (m, key: string) => vars[key] ?? m);
}

/** 아직 치환되지 않은 플레이스홀더 키 목록(중복 제거). 빈 배열이면 발행 가능. */
export function unresolvedKeys(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(PLACEHOLDER_RE)) found.add(m[1]!);
  }
  return [...found];
}
