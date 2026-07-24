// 내 정보 — 로그인한 모든 사용자. 이름·이메일 확인 + 전화번호 본인 수정.
import { eq } from 'drizzle-orm';
import { requireActor } from '@/auth/current-user';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { ConsoleShell } from '@/components/console-shell';
import { ProfilePanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const actor = await requireActor();
  const [me] = await db
    .select({ name: users.name, email: users.email, phone: users.phone })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);
  return (
    <ConsoleShell actor={actor}>
      <ProfilePanel name={me?.name ?? ''} email={me?.email ?? ''} phone={me?.phone ?? ''} />
    </ConsoleShell>
  );
}
