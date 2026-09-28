/**
 * 테스트 Supabase 프로젝트에 가벼운 쿼리 하나를 던진다 — **7일 미사용 일시정지 방지용**.
 *
 *   npm run db:ping:test
 *
 * 왜 필요한가: 무료 티어는 7일간 요청이 없으면 프로젝트를 자동 정지시킨다. 운영 프로젝트는
 * UptimeRobot 이 5분마다 `/api/health` 를 불러 깨워 두지만(규칙 #9), **테스트 프로젝트에는
 * 그런 장치가 없었다.** CI 는 main 푸시에만 돌기 때문에 개발이 한 주 조용하면 그대로 정지된다.
 *
 * 2026-09-18 CI 가 실제로 이렇게 죽었다 — 마지막 성공이 09-10, 8일 공백이었다. 타입체크·린트·
 * 단위 테스트는 전부 통과했고 `db:migrate:test` 만 이 오류로 실패했다:
 *
 *     PostgresError: (ENOTFOUND) tenant/user postgres.<테스트ref> not found
 *
 * 그리고 통합 테스트는 skip 됐다 — 즉 **그 커밋은 통합 테스트를 한 번도 통과하지 못했다.**
 * 열흘 동안 아무도 몰랐다. 스케줄 실행은 그 열흘을 3일로 줄이고, 아래 실패 경로가 알린다.
 *
 * 이 스크립트가 **못 하는 일**: 이미 정지된 프로젝트를 깨우지는 못한다. Restore 는 사람이
 * 대시보드에서 눌러야 한다(API 로는 안 된다). 그래서 정지를 만나면 조용히 넘기지 않고
 * 실패시킨다 — `.github/workflows/keepalive-test-db.yml` 의 alert 잡이 이슈를 만든다.
 *
 * 대상 판별은 `test/db-url.ts` 에 맡긴다. 그쪽이 값이 없거나 운영 ref 를 가리키면 던진다 —
 * 여기서 ref 비교를 다시 구현하면 운영 판별 기준이 두 곳으로 갈라진다(한쪽만 낡는다).
 */
import postgres from 'postgres';

const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';

/** Actions 에서는 주석 형식으로 찍어 실패 요약에 뜨게 한다. 로컬에서는 평범한 줄로 찍는다. */
function fail(lines: string[]): never {
  if (IN_ACTIONS) for (const line of lines) console.error(`::error::${line}`);
  else console.error(`\n✖ ${lines.join('\n  ')}\n`);
  process.exit(1);
}

function warn(line: string): void {
  console.error(IN_ACTIONS ? `::warning::${line}` : `⚠ ${line}`);
}

// db-url.ts 는 **import 시점에** 던진다(그게 그 파일의 목적이다). 그 던짐을 스택 트레이스가
// 아니라 읽을 수 있는 한 줄로 바꾸려고 동적 import 로 감싼다.
let TEST_DATABASE_URL: string;
let TEST_DB_LABEL: string;
try {
  ({ TEST_DATABASE_URL, TEST_DB_LABEL } = await import('../test/db-url'));
} catch (e) {
  fail([
    '테스트 DB 설정을 읽지 못했습니다.',
    ...String(e instanceof Error ? e.message : e).split('\n'),
  ]);
}

const sql = postgres(TEST_DATABASE_URL, {
  max: 1,
  prepare: false, // 풀러 트랜잭션 모드 호환(reset-test-db.mjs 와 같은 이유)
  connect_timeout: 20, // 정지된 프로젝트는 빠르게 거절하지만, 깨어나는 중이면 느리다
  idle_timeout: 5,
  onnotice: () => {},
});

try {
  const [beat] = await sql<{ at: Date }[]>`select now() as at`;

  // 깨어 있는 것과 **쓸 수 있는 것**은 다르다. 스키마가 비어 있으면(복원 리허설 뒤나
  // db:reset:test 중단 뒤) 연결은 되는데 통합 테스트만 `relation ... does not exist` 로 죽는다.
  // 그 상태를 CI 가 깨질 때가 아니라 여기서 먼저 알려 준다.
  const [tables] = await sql<{ n: number }[]>`
    select count(*)::int as n
      from information_schema.tables
     where table_schema = 'public'
       and table_type = 'BASE TABLE'
  `;

  const n = tables?.n ?? 0;
  console.log(`✔ ${TEST_DB_LABEL} 응답 — ${beat?.at.toISOString() ?? '(시각 없음)'}, public 테이블 ${n}개`);
  if (n === 0) {
    warn(
      'public 스키마에 테이블이 없습니다. 연결은 되지만 통합 테스트는 깨집니다 — ' +
        '`npm run db:reset:test` 로 되돌리세요.'
    );
  }
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);

  // 풀러 호스트는 살아서 응답하는데 **테넌트를 모른다**고 답하는 것이 일시정지 신호다.
  // DNS 실패로 읽으면 안 된다 — `db.<ref>.supabase.co` 가 안 풀리는 것은 운영 ref 도
  // 마찬가지라 판단 근거가 못 된다.
  if (/tenant.*not found/i.test(message)) {
    fail([
      `${TEST_DB_LABEL} 가 **이미 일시정지**됐습니다(풀러가 테넌트를 모릅니다).`,
      '이 잡은 정지를 막을 뿐 깨우지는 못합니다 — Supabase 대시보드에서 사람이 눌러야 합니다.',
      '  Supabase → animalmate-test → Restore project / Resume (1~2분)',
      '깨어난 뒤 `npm run db:migrate:test` 로 스키마를 확인하세요.',
      `원인 오류: ${message}`,
    ]);
  }

  fail([`${TEST_DB_LABEL} 에 붙지 못했습니다.`, `원인 오류: ${message}`]);
} finally {
  // 연결 자체가 실패했으면 end() 도 던질 수 있다. 그 던짐이 위 진단을 덮어쓰면 안 된다.
  await sql.end({ timeout: 5 }).catch(() => {});
}
