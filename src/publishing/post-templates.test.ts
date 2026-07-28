import { describe, it, expect } from 'vitest';
import { renderTemplate, canEditTemplate } from './post-templates';
import type { Actor } from '@/auth/permissions';

describe('renderTemplate — 플레이스홀더 치환', () => {
  it('제공된 값은 치환, 없는 키는 그대로 둔다', () => {
    const t = '{{날짜}} 봉사 / 집합 {{집합시간}} / 장소 {{장소}} / 정원 {{정원}}';
    expect(renderTemplate(t, { 날짜: '2026-03-01', 집합시간: '14:00' })).toBe(
      '2026-03-01 봉사 / 집합 14:00 / 장소 {{장소}} / 정원 {{정원}}'
    );
  });

  it('공백 허용', () => {
    expect(renderTemplate('{{ 날짜 }}', { 날짜: 'X' })).toBe('X');
  });

  it('플레이스홀더 없으면 원문 유지', () => {
    expect(renderTemplate('일반 공지 본문', {})).toBe('일반 공지 본문');
  });
});

// 2026-07-28: 예약에 쓸 수 있는 양식이 "개인 소유 빼고 전부"로 넓어졌다. 그래서 목록에는
// 남의 팀 양식도 들어오고, 화면은 **고칠 수 있는 것에만** 수정·삭제 버튼을 띄워야 한다.
// 이 판정이 authorizeTemplate 과 갈라지면 "버튼은 있는데 403" 또는 "되는데 버튼이 없는" 화면이 된다.
describe('canEditTemplate — 고칠 수 있는 양식 판정(쓰는 범위와 다르다)', () => {
  const A = 'team-a';
  const B = 'team-b';
  const ME = 'user-me';
  const actor = (role: Actor['role'], teamIds: string[] = []): Actor => ({
    userId: ME,
    role,
    membershipActive: true,
    teams: teamIds.map((teamId) => ({ teamId, position: 'member' as const })),
  });

  it('운영진: 소속 팀 양식은 고칠 수 있다', () => {
    expect(canEditTemplate(actor('staff', [A]), 'team', A)).toBe(true);
  });

  it('운영진: **남의 팀** 양식은 못 고친다 — 목록에 보이는 것과 무관하다', () => {
    expect(canEditTemplate(actor('staff', [A]), 'team', B)).toBe(false);
  });

  it('운영진: 팀 배정이 없으면 어떤 팀 양식도 못 고친다', () => {
    expect(canEditTemplate(actor('staff'), 'team', A)).toBe(false);
  });

  it('본인 개인 양식은 고칠 수 있고, 남의 개인 양식은 못 고친다', () => {
    expect(canEditTemplate(actor('staff'), 'personal', ME)).toBe(true);
    expect(canEditTemplate(actor('staff'), 'personal', 'someone-else')).toBe(false);
  });

  it('global(공용)은 회장단만 — 운영진은 못 고친다', () => {
    expect(canEditTemplate(actor('staff'), 'global', null)).toBe(false);
    expect(canEditTemplate(actor('board'), 'global', null)).toBe(true);
    expect(canEditTemplate(actor('sysadmin'), 'global', null)).toBe(true);
  });

  it('회장단은 소속이 아니어도 팀 양식을 고칠 수 있다(소유권 우회 — audit 에 override 로 남는다)', () => {
    expect(canEditTemplate(actor('board'), 'team', B)).toBe(true);
  });

  it('임기가 끝난(비활성) 계정은 본인 것도 못 고친다', () => {
    const expired: Actor = { userId: ME, role: 'board', membershipActive: false, teams: [] };
    expect(canEditTemplate(expired, 'personal', ME)).toBe(false);
    expect(canEditTemplate(expired, 'team', A)).toBe(false);
  });

  it('ownerId 가 비어 있으면(데이터 이상) 고칠 수 없다', () => {
    expect(canEditTemplate(actor('board'), 'team', null)).toBe(false);
  });
});
