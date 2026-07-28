// 백업 보존 정책 적용 CLI — GitHub Actions 백업 잡이 호출한다.
//   npx tsx src/ops/prune-backups-cli.ts <백업디렉터리> [--today YYYY-MM-DD] [--dry-run]
//
// 판단은 backup-retention.ts(순수·단위 테스트)가 하고 여기서는 파일만 지운다.
// 되돌릴 수 없는 삭제라 지운 목록을 반드시 출력한다(Actions 로그가 곧 감사 기록).

import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { planRetention } from './backup-retention';

function parseArgs(argv: string[]): { dir: string; today: Date; dryRun: boolean } {
  const rest = argv.slice(2);
  const dir = rest.find((a) => !a.startsWith('--'));
  if (!dir) {
    throw new Error('사용법: prune-backups-cli.ts <백업디렉터리> [--today YYYY-MM-DD] [--dry-run]');
  }
  const todayArg = rest.find((a) => a.startsWith('--today='))?.split('=')[1];
  const today = todayArg ? new Date(`${todayArg}T00:00:00Z`) : new Date();
  if (Number.isNaN(today.getTime())) throw new Error(`--today 형식 오류: ${todayArg}`);
  return { dir, today, dryRun: rest.includes('--dry-run') };
}

function main(): void {
  const { dir, today, dryRun } = parseArgs(process.argv);
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);

  const plan = planRetention(names, today);
  console.log(`[prune] 기준일(UTC) ${today.toISOString().slice(0, 10)} · 디렉터리 ${dir}`);
  console.log(`[prune] 보존 ${plan.keep.length} · 삭제 ${plan.remove.length} · 대상아님 ${plan.ignored.length}`);
  for (const name of plan.keep) console.log(`  keep   ${name}`);
  for (const name of plan.ignored) console.log(`  skip   ${name} (백업 파일명 규칙 밖 — 건드리지 않음)`);

  for (const name of plan.remove) {
    if (dryRun) {
      console.log(`  DELETE ${name} (dry-run)`);
      continue;
    }
    unlinkSync(join(dir, name));
    console.log(`  DELETE ${name}`);
  }
}

main();
