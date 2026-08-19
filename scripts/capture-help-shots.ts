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
 *
 * PC 폭을 1280 → 1040 으로 줄인 이유(2026-08-19): 콘솔 본문은 `max-w-[1000px]` 이라
 * 1280 에서는 좌우 280px 이 **언제나 빈 여백**이다. 캡처를 슬라이드에 넣으면 그 여백까지
 * 같이 줄어들어 정작 읽어야 할 내용이 작아진다. 1040 은 여백만 걷어내고 `lg`(1024) 는 넘겨
 * PC 레이아웃을 그대로 유지하는 지점이다.
 * ⚠ 다시 찍은 뒤 `queue.pc.png` 의 상단 메뉴가 잘려 보이면 1120 까지 올린다
 *   (메뉴 줄은 `overflow-x-auto` 라 레이아웃이 깨지지는 않고 오른쪽이 밀릴 뿐이다).
 */
const DEVICES = {
  pc: { width: 1040, height: 800 },
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
async function highlight(page: Page, selector: string | Locator): Promise<Locator> {
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
  // 잘라 찍을 자리를 아는 것은 여기뿐이다 — 호출부가 `shot()` 에 그대로 넘긴다.
  return target;
}

/** 가리키는 것 위아래로 남길 여백(CSS px). 잘라 낸 뒤에도 "화면 어디쯤"인지 감이 남을 만큼. */
const FOCUS_PAD = 80;
/** 너무 얇게 잘리면 무엇을 보고 있는지 모른다. 최소 이만큼은 남긴다. */
const FOCUS_MIN_H = 320;

/**
 * 가리키는 것 둘레만 남기는 잘라내기 사각형.
 *
 * **좌우는 화면 폭 그대로 두고 위아래만 자른다** — 좌우까지 자르면 그 화면의 어느 자리인지
 * 감이 사라진다. 어둡게 덮는 처리(`highlight`)도 그대로 남아 맥락은 유지된다.
 *
 * 좌표계: `page.screenshot({ clip })` 은 `fullPage` 가 아닐 때 **뷰포트 기준**이고
 * `boundingBox()` 도 뷰포트 기준이라 둘이 그대로 맞는다(스크롤 보정이 필요 없다).
 */
async function focusClip(page: Page, target: Locator) {
  const box = await target.boundingBox();
  const vp = page.viewportSize();
  // 못 재면 화면 전체로 떨어진다 — 캡처가 아예 없는 것보다는 낫다.
  if (!box || !vp) return undefined;

  let y = Math.max(0, Math.floor(box.y - FOCUS_PAD));
  const bottom = Math.min(vp.height, Math.ceil(box.y + box.height + FOCUS_PAD));
  let height = bottom - y;
  if (height < FOCUS_MIN_H) {
    height = Math.min(vp.height, FOCUS_MIN_H);
    y = Math.max(0, Math.min(y, vp.height - height));
  }
  return { x: 0, y, width: vp.width, height };
}

/**
 * `focus` 를 주면 그 둘레만 남기고 잘라 찍는다. 안 주면 화면 전체 —
 * "이 화면이 통째로 어떻게 생겼나"가 요점인 장(1번 예약 큐)에만 그렇게 둔다.
 *
 * 왜 자르는가(2026-08-19): 1280×800 을 통째로 찍으면 슬라이드 안에서 55% 로 줄어 캡처 속
 * 글씨가 7.2px 이 된다. 팝업을 어떻게 배치해도 70% 를 못 넘어서, 답은 **찍을 때 자르는 것**뿐이다.
 */
async function shot(page: Page, key: string, device: Device, focus?: Locator): Promise<void> {
  const known = WALK_STEPS.some((s) => s.key === key);
  if (!known) throw new Error(`단계 목록에 없는 키입니다: ${key}`);
  const file = autoShotFile(key, device);
  const clip = focus ? await focusClip(page, focus) : undefined;
  await page.screenshot({ path: `${OUT_DIR}/${file}`, clip });
  log(`찍음 ${file}${clip ? ` (${clip.width}×${clip.height})` : ' (화면 전체)'}`);
}

async function capture(page: Page, device: Device): Promise<void> {
  // 1. 예약 큐 — 전체 모습. **이 장만 화면 전체다**(잘라 찍지 않는다) — 여기서 요점은
  //    "큐가 통째로 어떻게 생겼나"이지 어느 한 요소가 아니다.
  // (둘러보기 팝업 자체는 컨텍스트 초기 스크립트로 막아 뒀다 — 안 그러면 찍는 화면을 자기가 덮는다.)
  await page.goto(`${BASE}/reservations`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '예약 큐', exact: true }).waitFor();
  await shot(page, 'queue', device);

  // 2. 새 예약 버튼.
  await shot(page, 'new-button', device, await highlight(page, 'a[href="/reservations/new"]'));

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
  await shot(page, 'kind', device, await highlight(page, 'label:has(> span:text-is("종류"))'));

  await openForm();
  await shot(page, 'template', device, await highlight(page, 'label:has(> span:text-is("양식 불러오기"))'));

  // {{ }} 는 지우지 마세요 — 화면이 이미 설명하고 있는 그 상자를 그대로 가리킨다.
  // 클래스가 아니라 **화면에 적힌 문구**로 찾아 올라간다(클래스는 디자인을 손대면 바뀐다).
  await openForm();
  await shot(
    page,
    'placeholders',
    device,
    await highlight(
      page,
      page
        .locator('span:text-is("이 표시, 그냥 두면 알아서 채워집니다")')
        .locator('xpath=ancestor::div[contains(@class,"shadow-card")][1]')
    )
  );

  // 회차 칸은 **채워진 모습**이어야 무엇을 적는 곳인지 보인다. 빈 폼은 아무것도 말해 주지 않는다.
  await openForm();
  await fillOnce();
  await shot(page, 'rows', device, await highlight(page, 'button:text-is("+ 일정 추가")'));

  // 팝업 장은 팝업 자체가 가리키는 것이다 — 뒤에 깔린 어두운 배경까지 찍을 이유가 없다.
  await openForm();
  await fillOnce();
  await page.getByRole('button', { name: '미리보기' }).first().click();
  const previewDialog = page.getByRole('dialog').first();
  await previewDialog.waitFor();
  await shot(page, 'preview', device, previewDialog);

  // 7. 큐로 돌아와 상태 — 미완성 건을 가리킨다.
  await page.goto(`${BASE}/reservations`, { waitUntil: 'networkidle' });
  await page.getByText('미완성', { exact: false }).first().waitFor();
  await shot(page, 'queue-after', device, await highlight(page, 'li:has-text("미완성")'));

  // 8. 카카오톡 공지 예약 팝업.
  await page.goto(`${BASE}/reservations`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '카카오톡 공지 예약' }).first().click();
  const kakaoDialog = page.getByRole('dialog').first();
  await kakaoDialog.waitFor();
  await shot(page, 'kakao-notice', device, kakaoDialog);

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
