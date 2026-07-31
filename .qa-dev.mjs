import 'dotenv/config';
import { spawn } from 'node:child_process';
const t = process.env.TEST_DATABASE_URL;
if (!t) { console.error('TEST_DATABASE_URL 없음'); process.exit(1); }
// 런타임은 운영과 같게 **트랜잭션 풀러(6543)** 를 쓴다. 세션 풀러(5432)는 동시 접속 15 제한이라
// dev + 스크립트가 함께 붙으면 EMAXCONNSESSION 으로 500 이 난다(운영 구성과도 다르다).
const u = new URL(t); u.port = '6543';
const env = { ...process.env, DATABASE_URL: u.toString(), DIRECT_URL: t,
  SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', NAVER_PUBLISH_DRY_RUN: 'true' };
spawn('npx', ['next', 'dev', '-p', '3100'], { env, stdio: 'inherit', shell: true });
