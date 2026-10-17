import { NextResponse } from 'next/server';
import { lookupApplicantResult } from '@/recruit/lookup';
import { clientIp, RateLimitError } from '@/http/rate-limit';
import { LIMITS, InputTooLongError, checkLength } from '@/http/input';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const headers = req.headers;
  const ip = clientIp(headers);

  try {
    const body = await req.json();
    const name = String(body.name ?? '').trim();
    const phone = String(body.phone ?? '').trim();

    if (!name || !phone) {
      return NextResponse.json({ error: 'missing_input' }, { status: 400 });
    }
    // 비로그인 공개 경로다. 길이를 묶지 않으면 수 MB 문자열이 HMAC·조회까지 그대로 흘러간다.
    checkLength('이름', name, LIMITS.name);
    checkLength('전화번호', phone, LIMITS.phone);

    const result = await lookupApplicantResult(name, phone, ip);
    if (!result) {
      return NextResponse.json({ error: 'not_found_or_invalid' }, { status: 404 });
    }

    return NextResponse.json({ result });
  } catch (e: unknown) {
    if (e instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: e.retryAfter },
        { status: 429, headers: { 'Retry-After': String(e.retryAfter) } }
      );
    }
    if (e instanceof InputTooLongError) {
      return NextResponse.json({ error: 'too_long', message: e.message }, { status: 400 });
    }
    return internalError('POST /api/recruit/lookup', e);
  }
}
