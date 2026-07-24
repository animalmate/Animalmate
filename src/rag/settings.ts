// 앱 설정(app_settings) 접근 — 회장단이 콘솔에서 바꾸는 운영 파라미터(결정 3, 상수 하드코딩 대신).
// 읽기는 자유(시스템도 씀), 쓰기는 회장단 전용 + audit.

import { eq } from 'drizzle-orm';
import type { Db, Database } from '@/db/types';
import { appSettings } from '@/db/schema';
import type { Actor } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';

/** 설정값 조회. 없으면 fallback(코드 기본값). value_json 을 T 로 신뢰해 반환한다. */
export async function getSetting<T>(db: Database, key: string, fallback: T): Promise<T> {
  const [row] = await db.select({ v: appSettings.valueJson }).from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row ? (row.v as T) : fallback;
}

/** 여러 키를 한 번에(쿼터 점검처럼 여러 값이 필요할 때 왕복 줄이기). */
export async function getSettings(db: Database, keys: string[]): Promise<Record<string, unknown>> {
  if (keys.length === 0) return {};
  const rows = await db.select().from(appSettings);
  const map: Record<string, unknown> = {};
  for (const r of rows) if (keys.includes(r.key)) map[r.key] = r.valueJson;
  return map;
}

/** 설정값 저장(회장단 전용, upsert + audit). */
export async function setSetting(db: Db, actor: Actor, key: string, value: unknown): Promise<void> {
  requireAuthorized(actor, { kind: 'board.registry' }); // 회장단 운영 설정 권한 재사용
  const [before] = await db.select({ v: appSettings.valueJson }).from(appSettings).where(eq(appSettings.key, key)).limit(1);
  await db
    .insert(appSettings)
    .values({ key, valueJson: value, updatedBy: actor.userId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { valueJson: value, updatedBy: actor.userId, updatedAt: new Date() } });
  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'settings.update', targetTable: 'app_settings', targetId: key, before: before?.v ?? null, after: value })
  );
}

/** 시스템(무액터) 저장 — 킬스위치 자동 전환 등. 권한 검사 없이 쓰고 actor=null 로 audit. */
export async function setSettingSystem(db: Database, key: string, value: unknown): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, valueJson: value })
    .onConflictDoUpdate({ target: appSettings.key, set: { valueJson: value, updatedAt: new Date() } });
  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: null, action: 'settings.update', targetTable: 'app_settings', targetId: key, after: value })
  );
}
