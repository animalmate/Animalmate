// 내 정보 — 본인 전화번호 수정. 로그인한 사용자가 자기 계정만 고칠 수 있다(권한 검증 불필요, actor 본인).
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { getCurrentActor } from '@/auth/current-user';
import { isValidPhone, formatPhone } from '@/lib/phone';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    if (b.phone !== undefined) {
      if (!isValidPhone(b.phone)) return NextResponse.json({ error: 'bad_phone' }, { status: 400 });
      const phone = formatPhone(b.phone);
      await db.update(users).set({ phone }).where(eq(users.id, actor.userId));
      return NextResponse.json({ ok: true, phone });
    }
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  } catch (e) {
    return internalError('PATCH /api/me', e);
  }
}
