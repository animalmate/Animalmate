import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { getReservation, updateReservation, SlotTakenError } from '@/publishing/reservations';
import { loadPublishVars } from '@/publishing/final-render';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';
import { LIMITS, InputTooLongError, checkLength, parseDate } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_RE = /^d{4}-d{2}-d{2}$/;
const TIME_RE = /^d{2}:d{2}$/;

/**
 * 회차 칸(날짜·시각·정원) 검사. 형식이 틀린 값이 그대로 DB 로 가면 500 이 나거나(날짜 칸),
 * 정원에 NaN·음수가 들어가 공지의 {{정원}} 으로 그대로 나간다(2026-10-17 보안 감사).
 * undefined = 이번 요청에서 다루지 않음, null = 비움. 틀리면 문구를, 맞으면 null 을 돌려준다.
 */
function badEventField(b: { eventDate?: unknown; meetTime?: unknown; capacity?: unknown }): string | null {
  if (b.eventDate != null && b.eventDate !== '' && !(typeof b.eventDate === 'string' && DATE_RE.test(b.eventDate))) {
    return '봉사 날짜 형식이 올바르지 않습니다.';
  }
  if (b.meetTime != null && b.meetTime !== '' && !(typeof b.meetTime === 'string' && TIME_RE.test(b.meetTime))) {
    return '모이는 시각 형식이 올바르지 않습니다(예: 10:00).';
  }
  if (b.capacity != null && b.capacity !== '') {
    const n = Number(b.capacity);
    if (!Number.isInteger(n) || n <= 0 || n > 10_000) return '정원은 1 이상의 정수로 입력해 주세요.';
  }
  return null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const detail = await getReservation(db, id);
  if (!detail) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // 열람은 운영진 이상 전부(팀 무관) — 큐에 보이는 건 열어 볼 수 있어야 한다(2026-07-31).
  // 고치는 것은 아래 PATCH 의 `post.modify` 가 따로 막는다(소유자 + 회장단).
  // 수정 화면 미리보기용 치환 변수(팀장단 명단 등). 장소·정원은 폼의 현재 입력값으로 클라이언트가 덮어쓴다.
  const vars = await loadPublishVars(db, detail.post);
  return NextResponse.json({ ...detail, vars });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const b = await req.json();
    const title = b.title !== undefined ? String(b.title) : undefined;
    const contentMd = b.contentMd !== undefined ? String(b.contentMd) : undefined;
    const place = b.place !== undefined ? (b.place === null ? null : String(b.place)) : undefined;
    checkLength('제목', title, LIMITS.title);
    checkLength('본문', contentMd, LIMITS.contentMd);
    checkLength('장소', place, LIMITS.place);
    const bad = badEventField(b);
    if (bad) return NextResponse.json({ error: 'bad_request', message: bad }, { status: 400 });
    await updateReservation(db, actor, id, {
      title,
      contentMd,
      publishAt: b.publishAt !== undefined ? parseDate(b.publishAt) : undefined,
      // 빈 문자열은 "비움"이다 — 날짜 칸에 ''를 넣으면 DB 가 거부한다.
      eventDate: b.eventDate === '' ? null : b.eventDate,
      meetTime: b.meetTime === '' ? null : b.meetTime,
      place,
      capacity: b.capacity !== undefined && b.capacity !== '' ? Number(b.capacity) : b.capacity === '' ? null : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // 같은 시각에 이미 예약이 있다 — 시각만 바꾸면 되는 상황이라 사유를 그대로 돌려준다.
    if (e instanceof SlotTakenError) return NextResponse.json({ error: 'slot_taken', message: e.message }, { status: 409 });
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof InputTooLongError) return NextResponse.json({ error: 'too_long', field: e.field, max: e.max }, { status: 400 });
    return internalError('PATCH /api/reservations/[id]', e);
  }
}
