import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { verifySignup } from '@/auth/auth-service';
import { defaultMailer } from '@/auth/mailer';
import { authErrorResponse, jsonWithSession, requireSecret } from '@/auth/route-helpers';
import { consumeRateLimit, resetRateLimit, clientIp, RULES } from '@/http/rate-limit';
import { LIMITS, checkLength } from '@/http/input';
import { isValidPhone, formatPhone } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 가입 2단계: OTP 검증 → user + member 멤버십 생성 → 세션 쿠키 발급.
export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req.headers);
  try {
    // 로그인 검증과 같은 버킷을 공유한다 — 공격자가 가입/로그인을 번갈아 쓰며 상한을 두 배로 쓰지 못하게.
    await consumeRateLimit(db, RULES.otpVerify, ip);
    const { email, code, name, phone, privacyConsent } = await req.json();
    // 무차별 대입이 노리는 것은 IP 가 아니라 **그 주소의 코드**다. 주소로도 묶어야 IP 를 바꿔
    // 가며 시도하는 경로가 막히고, 공유 IP 뒤 여러 명이 서로의 예산을 깎지 않는다.
    await consumeRateLimit(db, RULES.otpVerifyEmail, String(email ?? '').trim().toLowerCase());
    checkLength('이름', name == null ? null : String(name), LIMITS.name);
    // 개인정보 수집·이용 동의는 계정을 만드는 조건이다. 화면에서 체크박스를 비활성화하는 것은
    // 검증이 아니므로(규칙 #6) 여기서도 막는다 — 동의 없이는 계정이 만들어지지 않는다.
    if (privacyConsent !== true) return NextResponse.json({ error: 'consent_required' }, { status: 400 });
    // 전화는 가입 시 필수 — 봉사 공지 팀장단 표시·운영 연락에 쓰인다.
    if (!isValidPhone(phone)) return NextResponse.json({ error: 'bad_phone' }, { status: 400 });
    const { token, userId } = await verifySignup(
      db,
      { email, code: String(code ?? ''), name, phone: formatPhone(phone) },
      { secret: requireSecret(), mailer: defaultMailer() }
    );
    await resetRateLimit(db, RULES.otpVerify, ip);
    await resetRateLimit(db, RULES.otpVerifyEmail, String(email ?? '').trim().toLowerCase());
    return jsonWithSession({ ok: true, userId }, token);
  } catch (e) {
    return authErrorResponse(e);
  }
}
