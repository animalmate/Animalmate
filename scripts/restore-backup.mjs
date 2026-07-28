#!/usr/bin/env node
// 백업 받기·검사·복원 — 개발자 작업용. 단계별 리허설 절차는 docs/05-ASSET-REGISTRY.md "백업·복원" 절.
//
//   node scripts/restore-backup.mjs
//       비공개 백업 리포에서 **최신 백업**을 받아 복호화하고, 안에 무엇이 들었는지만 출력한다.
//       (테이블 수 + 테이블별 행 수) — DB 를 전혀 건드리지 않는 **기본 동작 = dry-run**.
//
//   node scripts/restore-backup.mjs --file <경로>
//       리포에서 받지 않고 로컬 파일을 검사한다.
//
//   node scripts/restore-backup.mjs --to <postgres-url> --confirm
//       실제로 대상 DB 에 적용한다. **--confirm 이 없으면 절대 적용하지 않는다.**
//
// 필요: gpg, git(리포에서 받을 때), psql(실제 복원할 때). 압축 해제는 Node 내장 zlib.
// 암호는 BACKUP_ENCRYPTION_KEY 환경변수로 준다(금고에 있는 값. .env 에 두지 않는다).

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, createWriteStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import './load-env.mjs';

const BACKUP_REPO = process.env.BACKUP_REPO_URL ?? 'https://github.com/animalmate/animalmate-backups.git';
const args = process.argv.slice(2);

function flag(name) {
  return args.includes(name);
}
function value(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (flag('--help') || flag('-h')) {
  console.log(`사용법:
  node scripts/restore-backup.mjs                      최신 백업을 받아 내용만 확인(기본, DB 안 건드림)
  node scripts/restore-backup.mjs --file <경로>         로컬 백업 파일 확인
  node scripts/restore-backup.mjs --to <url> --confirm  실제 복원(--confirm 필수)

옵션:
  --keep <경로>   복호화된 .sql 을 파일로 남긴다(눈으로 확인할 때)
환경변수:
  BACKUP_ENCRYPTION_KEY  복호화 암호(금고)
  BACKUP_REPO_URL        백업 리포 주소(기본: ${BACKUP_REPO})`);
  process.exit(0);
}

const key = process.env.BACKUP_ENCRYPTION_KEY;
if (!key) fail('BACKUP_ENCRYPTION_KEY 가 없습니다. 금고에서 꺼내 환경변수로 주세요.\n  예) BACKUP_ENCRYPTION_KEY=… node scripts/restore-backup.mjs');

const target = value('--to');
const confirm = flag('--confirm');
const keepPath = value('--keep');

// ── 1) 백업 파일 확보 ────────────────────────────────────────────────────
let file = value('--file');
let tempRepo = null;

if (!file) {
  console.log(`[1/3] 백업 리포에서 최신 백업을 받습니다 — ${BACKUP_REPO}`);
  tempRepo = mkdtempSync(join(tmpdir(), 'am-backup-'));
  // `--branch main` 을 명시한다. 인자 없는 clone 은 **원격 HEAD** 를 따라가는데, 그것이
  // 엉뚱한 브랜치를 가리키면 백업이 멀쩡히 있는데도 빈 디렉터리를 받는다. 장애 대응 중에
  // "백업이 없다"고 잘못 판단하게 만드는 종류의 실패다.
  const clone = spawnSync('git', ['clone', '--depth', '1', '--branch', 'main', '--quiet', BACKUP_REPO, tempRepo], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (clone.status !== 0) {
    fail(`백업 리포를 받지 못했습니다. 비공개 리포라 접근 권한이 있는 git 인증이 필요합니다.\n  리포: ${BACKUP_REPO}`);
  }
  const dumps = join(tempRepo, 'dumps');
  if (!existsSync(dumps)) fail(`백업 리포에 dumps/ 디렉터리가 없습니다. 아직 백업이 한 번도 돌지 않았을 수 있습니다.`);
  const names = readdirSync(dumps)
    .filter((n) => /^backup-\d{4}-\d{2}-\d{2}\.sql\.gz\.gpg$/.test(n))
    .sort(); // 파일명이 ISO 날짜라 사전식 정렬 = 시간순
  if (names.length === 0) fail('백업 파일이 하나도 없습니다.');
  file = join(dumps, names[names.length - 1]);
  console.log(`      보유 백업 ${names.length}개 · 최신 = ${names[names.length - 1]}`);
} else {
  if (!existsSync(file)) fail(`파일이 없습니다: ${file}`);
  console.log(`[1/3] 로컬 파일 사용 — ${file}`);
}

function cleanupRepo() {
  if (tempRepo) rmSync(tempRepo, { recursive: true, force: true });
}

/** gpg --decrypt → zlib gunzip. 압축 해제된 평문 스트림을 돌려준다. */
function decryptStream() {
  // 암호는 argv 에 두지 않는다(ps 로 보인다). 암호문을 파일 인자로 주므로 stdin 이 비어 있어
  // stdin 으로 넣는다. fd 3 은 Windows 의 Node spawn 이 만들어 주지 못한다.
  const gpg = spawn('gpg', ['--batch', '--quiet', '--decrypt', '--passphrase-fd', '0', file], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  gpg.stdin.write(`${key}\n`);
  gpg.stdin.end();
  return { gpg, plain: gpg.stdout.pipe(createGunzip()) };
}

function waitFor(child, name) {
  return new Promise((resolve, reject) => {
    child.on('error', (e) => reject(new Error(`${name} 실행 실패: ${e.message} (설치되어 있나요?)`)));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${name} 종료 코드 ${code}`))));
  });
}
function streamDone(stream, name) {
  return new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', (e) => reject(new Error(`${name} 실패: ${e.message} (암호가 맞습니까?)`)));
  });
}

/**
 * 덤프 본문을 훑어 테이블과 행 수를 센다. DB 없이 파일만으로 "무엇이 들었는지" 알기 위한 것.
 * pg_dump plain 포맷은 데이터를 `COPY public.t (...) FROM stdin;` … `\.` 블록으로 넣는다.
 */
function makeAnalyzer() {
  const tables = new Set();
  const rows = new Map();
  let current = null;
  let carry = '';
  let bytes = 0;
  let sawHeader = false;

  return {
    feed(chunk) {
      bytes += chunk.length;
      const text = carry + chunk.toString('utf8');
      const lines = text.split('\n');
      carry = lines.pop() ?? ''; // 마지막 조각은 다음 청크와 이어 붙인다
      for (const line of lines) {
        if (!sawHeader && line.includes('PostgreSQL database dump')) sawHeader = true;
        if (current !== null) {
          if (line === '\\.') current = null;
          else rows.set(current, (rows.get(current) ?? 0) + 1);
          continue;
        }
        const create = /^CREATE TABLE (?:public\.)?"?([\w]+)"?/.exec(line);
        if (create) {
          tables.add(create[1]);
          continue;
        }
        const copy = /^COPY (?:public\.)?"?([\w]+)"?\s*\(.*FROM stdin;/.exec(line);
        if (copy) {
          current = copy[1];
          if (!rows.has(current)) rows.set(current, 0);
        }
      }
    },
    result() {
      return { tables: [...tables].sort(), rows, bytes, sawHeader };
    },
  };
}

// ── 2) 복호화 + 내용 확인 ────────────────────────────────────────────────
try {
  console.log('[2/3] 복호화하고 내용을 확인합니다…');
  const { gpg, plain } = decryptStream();
  const analyzer = makeAnalyzer();
  const keepStream = keepPath ? createWriteStream(keepPath) : null;

  plain.on('data', (chunk) => {
    analyzer.feed(chunk);
    keepStream?.write(chunk);
  });
  await Promise.all([waitFor(gpg, 'gpg'), streamDone(plain, '압축 해제')]);
  keepStream?.end();

  const { tables, rows, bytes, sawHeader } = analyzer.result();
  if (!sawHeader) fail('복호화는 됐지만 PostgreSQL 덤프 형식이 아닙니다.');

  console.log(`\n  ✔ 복호화 성공 — 압축 해제 ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  테이블 ${tables.length}개\n`);
  const withRows = [...rows.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const empty = tables.filter((t) => !(rows.get(t) > 0));
  if (withRows.length > 0) {
    console.log('  행이 있는 테이블:');
    for (const [t, n] of withRows) console.log(`    ${String(n).padStart(7)}  ${t}`);
  }
  if (empty.length > 0) console.log(`\n  빈 테이블 ${empty.length}개: ${empty.join(', ')}`);
  if (keepPath) console.log(`\n  복호화 결과를 저장했습니다: ${keepPath} (확인 후 반드시 삭제하세요)`);
  if (tables.length < 25) {
    console.warn(`\n  ⚠ 테이블이 ${tables.length}개뿐입니다. 현재 스키마는 29개입니다 — 덤프를 확인하세요.`);
  }

  // ── 3) 복원 ────────────────────────────────────────────────────────────
  if (!target) {
    console.log(`\n[3/3] 확인만 했습니다(dry-run). 실제로 복원하려면:`);
    console.log(`      node scripts/restore-backup.mjs --to <postgres-url> --confirm\n`);
    cleanupRepo();
    process.exit(0);
  }

  const hostAndDb = (url) => {
    try {
      const u = new URL(url);
      return `${u.hostname}${u.pathname}`;
    } catch {
      return null;
    }
  };
  const targetId = hostAndDb(target);
  if (!targetId) fail('--to 값이 올바른 postgres URL 이 아닙니다.');

  if (!confirm) {
    console.log(`\n[3/3] --confirm 이 없어 **적용하지 않았습니다**(dry-run).`);
    console.log(`      대상: ${targetId}`);
    console.log(`      실제로 덮어쓰려면 --confirm 을 붙이세요.\n`);
    cleanupRepo();
    process.exit(0);
  }

  // 운영 DB 는 한 겹 더 막는다. 되돌릴 수 없다.
  const prodIds = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter(Boolean).map(hostAndDb);
  if (prodIds.includes(targetId)) {
    console.warn(`\n⚠  복원 대상이 .env 의 운영 DB 와 같습니다 (${targetId}).`);
    console.warn(`   운영 데이터를 백업 시점으로 되돌립니다. 되돌릴 수 없습니다.`);
    console.warn(`   중단하려면 지금 Ctrl+C. 10초 뒤 시작합니다.\n`);
    await new Promise((r) => setTimeout(r, 10_000));
  }

  console.log(`\n[3/3] ${targetId} 에 적용합니다…`);
  const { gpg: gpg2, plain: plain2 } = decryptStream();
  const psql = spawn('psql', [target, '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'inherit', 'inherit'] });
  plain2.pipe(psql.stdin);
  await Promise.all([waitFor(gpg2, 'gpg'), streamDone(plain2, '압축 해제'), waitFor(psql, 'psql')]);

  console.log(`\n✔ 복원 완료 → ${targetId}`);
  console.log(`  다음: 테이블 수(29)와 RLS 활성 여부를 확인하세요(05-ASSET-REGISTRY 리허설 절차 5단계).`);
  cleanupRepo();
} catch (e) {
  cleanupRepo();
  fail(e.message);
}
