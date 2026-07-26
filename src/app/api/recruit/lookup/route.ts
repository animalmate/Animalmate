import { NextResponse } from 'next/server';
import { lookupApplicantResult } from '@/recruit/lookup';
import { clientIp, RateLimitError } from '@/http/rate-limit';

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

    const result = await lookupApplicantResult(name, phone, ip);
    if (!result) {
      return NextResponse.json({ error: 'not_found_or_invalid' }, { status: 404 });
    }

    return NextResponse.json({ result });
  } catch (e: any) {
    if (e instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: e.retryAfter },
        { status: 429, headers: { 'Retry-After': String(e.retryAfter) } }
      );
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
