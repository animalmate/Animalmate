// 내 정보 — 본인 전화번호 수정 + 본인 탈퇴. 로그인한 사용자가 자기 계정만 건드린다.
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { getCurrentActor } from '@/auth/current-user';
import { withdrawMember, MemberError } from '@/auth/members';
import { clearedSession } from '@/auth/route-helpers';
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

/**
 * 본인 탈퇴 — 되돌릴 수 없다. 화면에서 확인을 받지만 그것만 믿지 않는다(규칙 #6):
 * 정확한 확인 문구를 본문에 담아야만 진행한다.
 */
const WITHDRAW_CONFIRM = '탈퇴합니다';

export async function DELETE(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json().catch(() => ({}));
    if (b?.confirm !== WITHDRAW_CONFIRM) {
      return NextResponse.json({ error: 'confirm_required', message: `"${WITHDRAW_CONFIRM}"를 정확히 입력해 주세요.` }, { status: 400 });
    }
    await withdrawMember(db, actor, actor.userId);
    // 계정이 사라졌으니 쿠키도 즉시 지운다(session_version 이 이미 올라가 토큰은 무효 상태).
    return clearedSession();
  } catch (e) {
    if (e instanceof MemberError) {
      const message =
        e.code === 'last_privileged'
          ? '마지막 남은 회장단이라 탈퇴할 수 없습니다. 다른 회장단을 먼저 임명해 주세요.'
          : e.code === 'last_sysadmin'
            ? '마지막 남은 시스템관리자라 탈퇴할 수 없습니다.'
            : e.code === 'already_withdrawn'
              ? '이미 탈퇴한 계정입니다.'
              : '탈퇴를 처리할 수 없습니다.';
      return NextResponse.json({ error: e.code, message }, { status: 400 });
    }
    return internalError('DELETE /api/me', e);
  }
}
