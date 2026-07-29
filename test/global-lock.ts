import postgres from 'postgres';
import { TEST_DATABASE_URL, TEST_DB_LABEL } from './db-url';

/**
 * 통합 테스트 **실행 하나**가 테스트 DB 를 독점하도록 어드바이저리 락을 잡는다.
 * vitest `globalSetup` — 워커보다 먼저, 실행당 **한 번만** 돈다(워커마다가 아니다).
 *
 * 왜 필요한가:
 * 2026-07-29 에 CI 가 깨졌다(run 30411637229). 원인은 코드가 아니라 **같은 테스트 DB 를 두
 * 실행이 동시에 두들긴 것**이었다 — 푸시 직후 CI 가 도는 중에 로컬에서 `test:integration` 을
 * 돌렸다. 증상이 특이해서 코드 버그로 오인하기 쉽다:
 *
 *   expected [ 'TPL-TEST A팀', 'TPL-TEST B팀', …(1) ] to include 'TPL-TEST 내개인'
 *   expected [] to include 'TPL-TEST B팀'          ← 같은 실행 중에 목록이 비었다
 *   post_template not found: <id>                   ← 방금 만든 행이 갱신 전에 사라졌다
 *   expected 'publishing' to be 'scheduled'         ← 다른 실행의 워커가 집어갔다
 *
 * **한 실행 안에서 데이터가 없어지면 자기 자신이 아니라 다른 프로세스다.** 픽스처가 고정
 * 라벨(`TPL-TEST …`)인 데다 `beforeAll` 이 그 라벨로 **먼저 지우고 시작**하기 때문에,
 * 나중 실행의 cleanup 이 먼저 실행의 데이터를 지운다.
 *
 * 왜 락인가 — 픽스처 라벨을 실행별로 유니크하게 만드는 방법도 있었지만 택하지 않았다:
 *   ① 리터럴 식별자가 21개 파일에 ~70개고 단언문마다 박혀 있다(넓고 위험한 diff).
 *   ② 그렇게 얻는 것은 "실행 간 병렬"인데, 이 스위트는 `fileParallelism: false` 라
 *      **애초에 순차 실행**이다. 얻는 값이 거의 없다.
 *   ③ 무엇보다 유니크 라벨은 **새 테스트마다 규약을 기억해야** 성립한다. 규칙 #8 의
 *      `ENABLE ROW LEVEL SECURITY` 를 빠뜨려 사고가 났던 것과 같은 종류의 취약함이다.
 *      락은 중앙에서 한 번 걸면 앞으로 생길 파일까지 자동으로 덮는다.
 *
 * 동작: 먼저 잡은 실행이 끝날 때까지 **기다린다**(실패시키지 않는다). 연속 푸시로 CI 두 개가
 * 겹쳐도 줄을 서서 차례로 통과한다. 프로세스가 죽으면 커넥션이 끊기면서 세션 락이 자동
 * 해제되므로 죽은 락이 남지 않는다.
 *
 * ⚠ `TEST_DATABASE_URL` 은 **세션 풀러(5432)** 여야 한다. 트랜잭션 풀러(6543)는 세션이 유지되지
 *   않아 세션 레벨 어드바이저리 락이 성립하지 않는다. 5432 에서 실제로 동작하는 것을 확인했다.
 */

// 이 리포의 통합 테스트를 뜻하는 고정 키. 다른 용도의 락과 겹치지 않기만 하면 된다.
// bigint 리터럴이 아니라 number 다 — postgres 라이브러리 타이핑이 bigint 파라미터를 받지 않는다.
// 2^53(9007199254740992) 미만이라 number 로도 오차 없이 표현된다. SQL 에서 ::bigint 로 캐스팅한다.
const LOCK_KEY = 7264143089215074;

/** 락을 못 잡고 기다릴 최대 시간. CI 통합이 ~7분이므로 그보다 넉넉히 잡는다. */
const WAIT_TIMEOUT_MS = 15 * 60 * 1000;
const POLL_MS = 3000;

export default async function setup(): Promise<() => Promise<void>> {
  const sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1, idle_timeout: 0 });

  const started = Date.now();
  let announced = false;

  for (;;) {
    const [row] = await sql<{ ok: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY}::bigint) AS ok`;
    if (row?.ok) break;

    const waited = Date.now() - started;
    if (waited > WAIT_TIMEOUT_MS) {
      await sql.end({ timeout: 5 });
      throw new Error(
        `테스트 DB(${TEST_DB_LABEL})를 ${Math.round(WAIT_TIMEOUT_MS / 60000)}분째 다른 실행이 잡고 있습니다.\n` +
          '  통합 테스트는 DB 하나를 공유하므로 한 번에 한 실행만 돌 수 있습니다.\n' +
          '  CI 가 도는 중이라면 끝난 뒤에 다시 시도하세요(`gh run list --limit 1` 로 확인).\n' +
          '  아무도 안 도는데 이 메시지가 보이면 죽은 커넥션이 남은 것입니다 — 잠시 뒤 자동 해제됩니다.'
      );
    }

    if (!announced) {
      // 조용히 멈춰 있으면 멎은 것처럼 보인다. 왜 기다리는지 한 번은 알려 준다.
      console.log(
        `[global-lock] 테스트 DB(${TEST_DB_LABEL})를 다른 실행이 쓰고 있습니다. 끝날 때까지 기다립니다…`
      );
      announced = true;
    } else if (waited % 30_000 < POLL_MS) {
      console.log(`[global-lock] 대기 중… ${Math.round(waited / 1000)}초`);
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  return async () => {
    try {
      await sql`SELECT pg_advisory_unlock(${LOCK_KEY}::bigint)`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  };
}
