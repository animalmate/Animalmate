// 무의존성 .env 로더 (dotenv 대체). Phase 0 스크립트에서만 사용.
// process.env 에 이미 있는 값은 덮어쓰지 않는다(CI/셸 우선).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');

if (existsSync(envPath)) {
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1);
    const q = val.trim();
    if ((q.startsWith('"') && q.endsWith('"')) || (q.startsWith("'") && q.endsWith("'"))) {
      // 따옴표로 감싼 값: 내부의 # 는 보존
      val = q.slice(1, -1);
    } else {
      // 인라인 주석 제거: 값 시작(^) 또는 공백 뒤의 # 부터 잘라낸다
      const m = val.match(/(^|\s)#/);
      if (m) val = val.slice(0, m.index);
      val = val.trim();
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
