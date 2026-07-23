import { clearedSession } from '@/auth/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 로그아웃: 세션 쿠키 삭제.
export async function POST(): Promise<Response> {
  return clearedSession();
}
