/**
 * 예약 흐름 둘러보기의 화면 캡처를 만든다 → `public/help/reservations/<key>.png`.
 *
 *   npm run build                    # 캡처는 배포본을 찍는다(.next 가 최신이어야 한다)
 *   npx tsx scripts/capture-help-shots.ts
 *
 * 왜 사람이 안 찍는가(중요):
 *  1) **운영 화면을 찍으면 실제 예약 제목·팀명이 그대로 커밋된다.** 캡처 속 글자는 grep 으로도
 *     시크릿 스캐너로도 걸리지 않아 사후에 잡을 방법이 없다(.gitignore 의 `/*.png` 주석 참고).
 *     그래서 이 스크립트는 **테스트 DB에 가짜 예약을 심어** 그것만 찍는다. 운영 DB 를 가리키면
 *     `test/db-url.ts` 가 하드 실패시킨다.
 *  2) UI 는 바뀐다. 손으로 찍으면 9장을 다시 찍어야 하지만, 여기서는 이 명령을 한 번 더 돌리면 된다.
 *
 * 하는 일: 가짜 데이터 심기 → `next start -p 3100`(테스트 DB) → 서명 쿠키로 로그인 →
 *          단계마다 대상에 테두리를 그리고 캡처 → 심은 데이터 지우기 → 서버 종료.
 * 중간에 죽어도 다음 실행이 같은 이름의 잔여 데이터를 먼저 지운다(멱등).
 */
import 'dotenv/config';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium, type Locator, type Page } from '@playwright/test';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { boards, events, memberships, postTemplates, scheduledPosts, teamMembers, teams, users } from '../src/db/schema';
import { signSession, SESSION_COOKIE } from '../src/auth/session';
import { WALK_STEPS, autoShotFile, SNOOZE_KEY } from '../src/guides/reservation-walkthrough';
// 운영 DB 를 가리키면 여기서 던진다. 이 import 가 이 스크립트의 안전장치다.
import { TEST_DATABASE_URL } from '../test/db-url';

const PORT = 3100;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_DIR = 'public/help/reservations';

/**
 * 같은 화면을 **PC 와 휴대폰 두 벌** 찍는다(사용자 지시 2026-08-06).
 * 팀장단은 공지를 PC 로 걸고 단톡 예약은 폰으로 하는 식으로 기기를 섞어 쓴다 —
 * 한쪽만 보여주면 다른 기기를 쓰는 사람이 "내 화면은 왜 다르지"에서 멈춘다.
 * 폭 390 은 이 앱이 카드 목록으로 갈아타는 `lg` 미만 구간(모바일 레이아웃)에 든다.
 */
const DEVICES = {
  pc: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
} as const;
type Device = keyof typeof DEVICES;

// 심는 것들 — 이름은 전부 가짜이고, 지울 때 이 값들로 찾는다.
const SEED = {
  email: 'help-shot@example.invalid',
  userName: '샘플 운영진',
  teamName: '샘플봉사팀',
  menuid: 990001,
  boardName: '봉사 공지',
  templateName: '유기견 보호소 정기봉사',
} as const;

function log(msg: string): void {
  console.log(`[shots] ${msg}`);
}

// ── 1. 가짜 데이터 ────────────────────────────────────────────────────────
const sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
const db = drizzle(sql, { schema, casing: 'snake_case' });

/** 이번 실행(그리고 지난 실행의 잔여)이 심은 것을 전부 지운다. */
async function cleanup(): Promise<void> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, SEED.email));
  const ts = await db.select({ id: teams.id }).from(teams).where(eq(teams.name, SEED.teamName));
  if (u) await db.delete(scheduledPosts).where(eq(scheduledPosts.authorUserId, u.id));
  if (ts.length > 0) {
    await db.delete(events).where(inArray(events.teamId, ts.map((t) => t.id)));
    await db.delete(postTemplates).where(inArray(postTemplates.ownerId, ts.map((t) => t.id)));
    await db.delete(teams).where(inArray(teams.id, ts.map((t) => t.id))); // team_members 는 cascade
  }
  await db.delete(users).where(eq(users.email, SEED.email)); // memberships cascade
  await db.delete(boards).where(eq(boards.menuid, SEED.menuid));
}

/** 화면이 비어 있으면 보여줄 것이 없다. 큐에 세 가지 상태가 다 보이도록 심는다. */
async function seed(): Promise<{ userId: string; sessionVersion: number }> {
  await cleanup();

  const [u] = await db.insert(users).values({ email: SEED.email, name: SEED.userName }).returning();
  await db
    .insert(memberships)
    .values({ userId: u!.id, role: 'staff', termStart: '2026-01-01', termEnd: '2030-01-01', status: 'active' });
  const [team] = await db.insert(teams).values({ name: SEED.teamName, kind: 'activity' }).returning();
  await db.insert(teamMembers).values({ teamId: team!.id, userId: u!.id, position: 'leader' });
  await db
    .insert(boards)
    .values({ menuid: SEED.menuid, name: SEED.boardName, botCanWrite: true, isActive: true });

  await db.insert(postTemplates).values({
    ownerType: 'team',
    ownerId: team!.id,
    name: SEED.templateName,
    titleTemplate: '[정기봉사] {{장소}} 봉사 안내',
    bodyTemplate:
      '이번 주 정기봉사 안내드립니다.\n\n- 일시 : {{전체_날짜}} {{집합시간}}\n- 장소 : {{장소}}\n- 정원 : {{정원}}\n\n참여를 원하시면 이 글에 댓글로 신청해 주세요.',
    defaultPlace: '행복이네 보호소',
    defaultCapacity: 20,
    defaultMeetTime: '10:00',
    defaultPublishTime: '20:00',
    updatedBy: u!.id,
  });

  const mkEvent = async (title: string, date: string, place: string | null, capacity: number | null) => {
    const [e] = await db
      .insert(events)
      .values({ teamId: team!.id, title, eventDate: date, meetTime: '10:00', place, capacity, status: 'draft' })
      .returning();
    return e!.id;
  };
  const mkPost = async (v: {
    title: string;
    status: 'draft' | 'scheduled' | 'published';
    publishAt: Date | null;
    eventId: string | null;
    cafeArticleUrl?: string;
  }) => {
    await db.insert(scheduledPosts).values({
      ownerType: 'team',
      ownerId: team!.id,
      authorUserId: u!.id,
      boardMenuid: SEED.menuid,
      eventId: v.eventId,
      title: v.title,
      // 치환키는 **실제로 있는 것만** 쓴다(placeholder-catalog). 없는 키를 쓰면 영영 안 채워져
      // 모든 예약이 '미완성'으로 찍히고, 캡처가 정상 화면을 보여주지 못한다.
      contentMd:
        '이번 주 정기봉사 안내드립니다.\n\n- 일시 : {{전체_날짜}} {{집합시간}}\n- 장소 : {{장소}}\n- 정원 : {{정원}}\n\n참여를 원하시면 이 글에 댓글로 신청해 주세요.',
      publishAt: v.publishAt,
      status: v.status,
      cafeArticleUrl: v.cafeArticleUrl ?? null,
    });
  };

  // 큐는 최신순으로 보이므로 심는 순서가 곧 화면 순서다(맨 위가 준비 끝난 건이면 읽기 좋다).
  await mkPost({
    title: '[정기봉사] 행복이네 보호소 9/12(토)',
    status: 'scheduled',
    publishAt: new Date('2026-09-05T11:00:00Z'), // KST 9/5 20:00
    eventId: await mkEvent('행복이네 보호소 정기봉사', '2026-09-12', '행복이네 보호소', 20),
  });
  // 미완성 — 장소·정원이 비어 있어 이대로는 올라가지 않는다. 그 화면을 보여주는 것이 이 건의 목적이다.
  await mkPost({
    title: '[정기봉사] 행복이네 보호소 9/26(토)',
    status: 'draft',
    publishAt: new Date('2026-09-19T11:00:00Z'),
    eventId: await mkEvent('행복이네 보호소 정기봉사', '2026-09-26', null, null),
  });
  await mkPost({
    title: '[정기봉사] 행복이네 보호소 8/29(토)',
    status: 'published',
    publishAt: new Date('2026-08-22T11:00:00Z'),
    eventId: await mkEvent('행복이네 보호소 정기봉사', '2026-08-29', '행복이네 보호소', 20),
    cafeArticleUrl: 'https://cafe.naver.com/animalmate2010/00000',
  });

  return { userId: u!.id, sessionVersion: u!.sessionVersion };
}

// ── 2. 서버 ───────────────────────────────────────────────────────────────
function startServer(): ChildProcess {
  const child = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    env: {
      ...process.env,
      // 서비스 싱글턴까지 테스트 DB 로 옮긴다(test/setup-db.ts 와 같은 이유).
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
      // 캡처가 실카페에 글을 올리는 일은 없어야 한다. 워커는 돌지 않지만 못을 박아 둔다.
      NAVER_PUBLISH_DRY_RUN: 'true',
      NODE_ENV: 'production',
    },
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return child;
}

/**
 * 서버를 **정말로** 죽인다.
 *
 * ⚠ `shell: true` 로 띄운 자식에 `kill()` 을 하면 **셸만 죽고 `next start` 는 살아남는다.**
 * 그러면 다음 실행이 유령 서버(옛 빌드)에 붙고, 그 위에 새 빌드를 덮어쓴 상태라 페이지가 깨진 채로
 * 찍힌다 — 2026-08-06 에 실제로 3100·3101 두 포트가 그렇게 물려 있었다. 트리째 죽인다.
 */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      /* 아직 안 떴다 */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`서버가 ${timeoutMs}ms 안에 뜨지 않았습니다(npm run build 를 먼저 돌렸나요?).`);
}

// ── 3. 캡처 ───────────────────────────────────────────────────────────────
/**
 * 대상에 테두리를 그린다. **캡처 전에 실제 요소에 그리는 것**이 핵심이다 —
 * 나중에 이미지 위에 좌표로 화살표를 얹으면 UI 가 조금만 움직여도 엉뚱한 곳을 가리키게 된다.
 */
async function highlight(page: Page, selector: string | Locator): Promise<void> {
  const target = (typeof selector === 'string' ? page.locator(selector) : selector).first();
  await target.scrollIntoViewIfNeeded();
  await target.evaluate((el: HTMLElement) => {
    el.style.outline = '3px solid #E4572E';
    el.style.outlineOffset = '3px';
    el.style.borderRadius = getComputedStyle(el).borderRadius || '12px';
    el.style.boxShadow = '0 0 0 9999px rgba(24, 22, 18, 0.28)';
    el.style.position = el.style.position || 'relative';
    el.style.zIndex = '40';
  });
}

async function shot(page: Page, key: string, device: Device): Promise<void> {
  const known = WALK_STEPS.some((s) => s.key === key);
  if (!known) throw new Error(`단계 목록에 없는 키입니다: ${key}`);
  const file = autoShotFile(key, device);
  await page.screenshot({ path: `${OUT_DIR}/${file}` });
  log(`찍음 ${file}`);
}

async function capture(page: Page, device: Device): Promise<void> {
  // 1. 예약 큐 — 전체 모습.
  // (둘러보기 팝업 자체는 컨텍스트 초기 스크립트로 막아 뒀다 — 안 그러면 찍는 화면을 자기가 덮는다.)
  await page.goto(`${BASE}/reservations`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '예약 큐', exact: true }).waitFor();
  await shot(page, 'queue', device);

  // 2. 새 예약 버튼.
  await highlight(page, 'a[href="/reservations/new"]');
  await shot(page, 'new-button', device);

  // 3~6. 새 예약 화면.
  const openForm = async () => {
    await page.goto(`${BASE}/reservations/new`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '새 예약' }).waitFor();
  };
  const fillOnce = async () => {
    await page.selectOption('select:below(:text-is("양식 불러오기"))', { label: SEED.templateName }).catch(() => {});
    await page.locator('input[type="date"]').first().fill('2026-09-12').catch(() => {});
  };

  await openForm();
  await highlight(page, 'label:has(> span:text-is("종류"))');
  await shot(page, 'kind', device);

  await openForm();
  await highlight(page, 'label:has(> span:text-is("양식 불러오기"))');
  await shot(page, 'template', device);

  // {{ }} 는 지우지 마세요 — 화면이 이미 설명하고 있는 그 상자를 그대로 가리킨다.
  // 클래스가 아니라 **화면에 적힌 문구**로 찾아 올라간다(클래스는 디자인을 손대면 바뀐다).
  await openForm();
  await highlight(
    page,
    page
      .locator('span:text-is("이 표시, 그냥 두면 알아서 채워집니다")')
      .locator('xpath=ancestor::div[contains(@class,"shadow-card")][1]')
  );
  await shot(page, 'placeholders', device);

  // 회차 칸은 **채워진 모습**이어야 무엇을 적는 곳인지 보인다. 빈 폼은 아무것도 말해 주지 않는다.
  await openForm();
  await fillOnce();
  await highlight(page, 'button:text-is("+ 일정 추가")');
  await shot(page, 'rows', device);

  await openForm();
  await fillOnce();
  await page.getByRole('button', { name: '미리보기' }).first().click();
  await page.getByRole('dialog').waitFor();
  await shot(page, 'preview', device);

  // 7. 큐로 돌아와 상태 — 미완성 건을 가리킨다.
  await page.goto(`${BASE}/reservations`, { waitUntil: 'networkidle' });
  await page.getByText('미완성', { exact: false }).first().waitFor();
  await highlight(page, 'li:has-text("미완성")');
  await shot(page, 'queue-after', device);

  // 8. 카카오톡 공지 예약 팝업.
  await page.goto(`${BASE}/reservations`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '카카오톡 공지 예약' }).first().click();
  await page.getByRole('dialog').waitFor();
  await shot(page, 'kakao-notice', device);

  // kakao-open·kakao-send 는 카카오톡 **앱** 화면이라 여기서 찍을 수 없다.
  // 사람이 찍어 준 것을 public/help/reservations/ 에 그대로 둔다(2026-08-06).
}

// ── 실행 ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET 이 필요합니다(.env).');
  if (!existsSync('.next/BUILD_ID')) throw new Error('`npm run build` 를 먼저 돌려 주세요 — 캡처는 배포본을 찍습니다.');
  mkdirSync(OUT_DIR, { recursive: true });

  log('가짜 예약 심는 중…');
  const { userId, sessionVersion } = await seed();

  log('서버 띄우는 중…');
  const server = startServer();
  const browser = await chromium.launch();
  try {
    await waitForServer();
    const cookie = {
      name: SESSION_COOKIE,
      value: signSession({ sub: userId, role: 'staff', sv: sessionVersion }, process.env.SESSION_SECRET!),
      domain: '127.0.0.1',
      path: '/',
    };
    for (const device of Object.keys(DEVICES) as Device[]) {
      log(`${device} 화면 찍는 중…`);
      const context = await browser.newContext({
        viewport: DEVICES[device],
        // 폰은 실제로 2배 화면이다. 1배로 찍으면 슬라이드에서 글씨가 흐려진다.
        deviceScaleFactor: 2,
        isMobile: device === 'mobile',
        hasTouch: device === 'mobile',
        locale: 'ko-KR',
      });
      await context.addCookies([cookie]);
      // 둘러보기는 예약 큐에 들어가면 저절로 뜬다 — 찍으려는 화면을 자기가 덮는다.
      // 페이지가 그려지기 전에 "하루 미룸"을 심어 아예 열리지 않게 한다(키는 훅과 같은 값).
      await context.addInitScript((key: string) => {
        window.localStorage.setItem(key, String(Date.now() + 3600_000));
      }, SNOOZE_KEY);
      await capture(await context.newPage(), device);
      await context.close();
    }
  } finally {
    await browser.close();
    killTree(server);
    log('심은 데이터 지우는 중…');
    await cleanup();
    await sql.end({ timeout: 5 });
  }
  log('끝. public/help/reservations/ 를 확인하세요.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
