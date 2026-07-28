import { TEST_DATABASE_URL } from './db-url';

// 통합 테스트 전 환경변수를 테스트 DB 로 고정한다(vitest setupFiles — 테스트 파일보다 먼저 돈다).
//
// 왜 필요한가: 테스트 파일들은 자기 커넥션을 직접 열지만, 그 안에서 부르는 **서비스 코드는
// 그렇지 않다.** recruit 서비스들(lookup/scores/purge…)은 db 를 인자로 받지 않고
// src/db/client 싱글턴을 top-level import 하고, 그 싱글턴은 DATABASE_URL 을 읽는다.
// 이걸 덮어쓰지 않으면 "테스트가 만든 픽스처는 테스트 DB 에, 서비스가 읽고 쓰는 것은 운영 DB 에"
// 라는 최악의 조합이 된다 — 테스트는 이유 없이 실패하고, 운영 DB 에는 쓰레기가 쌓인다.
//
// DIRECT_URL 도 같은 값으로 덮는다. 지우지 않고 **덮어쓰는** 이유는 dotenv 때문이다.
// 각 테스트 파일은 `import 'dotenv/config'` 로 시작하는데, dotenv 는 **이미 있는 키는 건드리지
// 않지만 없는 키는 .env 에서 새로 채운다.** 지우면 곧바로 운영 값으로 되살아난다.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DIRECT_URL = TEST_DATABASE_URL;
