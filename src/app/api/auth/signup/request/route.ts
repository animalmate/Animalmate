import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { AuthError, requestSignup } from '@/auth/auth-service';
import { validateJoinCode } from '@/auth/join-codes';
import { defaultMailer } from '@/auth/mailer';
import { authErrorResponse, requireSecret } from '@/auth/route-helpers';
import { consumeRateLimit, clientIp, RULES } from '@/http/rate-limit';
import { LIMITS, checkLength } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 가입 1단계: 이메일 + 학기 가입코드 → 유효하면 6자리 OTP 발송.
export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req.headers);
  try {
    // ① 폭주 차단(느슨). 공유 IP 뒤 다수가 정상이므로 여기서 사람을 걸러내지 않는다.
    await consumeRateLimit(db, RULES.signupRequest, ip);
    const { email, joinCode } = await req.json();
    checkLength('이메일', String(email ?? ''), LIMITS.email);
    checkLength('가입코드', String(joinCode ?? ''), LIMITS.joinCode);

    // ② 가입코드 먼저. 코드는 부원 전원이 아는 공용 값이라 이 검사는 **주소에 대해 아무것도
    //    알려주지 않는다** — 열거 방지(응답 통일)는 아래 ③ 이후 경로에서만 성립하면 된다.
    //    순서가 중요하다: 주소 단위 발송 상한을 먼저 깎으면, 가입코드를 몇 번 잘못 친 사람이
    //    자기 메일 예산(시간당 5)을 다 써 버려 **정답을 넣어도 코드를 못 받는다**.
    if (!(await validateJoinCode(db, String(joinCode ?? '')))) {
      // 틀린 시도만 센다 — 상한을 넘으면 여기서 429 가 던져져 403 대신 나간다.
      await consumeRateLimit(db, RULES.signupCodeFail, ip);
      throw new AuthError('invalid_join_code', 403);
    }

    // ③ 주소 단위 발송 상한 — 가입 여부를 보기 **전에** 걸어야 리밋 응답이 열거 신호가 되지 않는다.
    await consumeRateLimit(db, RULES.mailToAddress, String(email ?? '').trim().toLowerCase());
    await requestSignup(db, { email, joinCode: String(joinCode ?? '') }, { secret: requireSecret(), mailer: defaultMailer() });
    // 응답은 가입 여부와 무관하게 동일하다. 구분 정보는 메일함으로만 간다(계정 열거 차단).
    return NextResponse.json({ ok: true });
  } catch (e) {
    return authErrorResponse(e);
  }
}
