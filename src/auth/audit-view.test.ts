import { describe, it, expect } from 'vitest';
import {
  ACTION_LABEL,
  AUDIT_GROUPS,
  actionGroup,
  describeAction,
  encodeCursor,
  isAutomated,
  parseAction,
  parseCursor,
} from './audit-view';

describe('parseAction — 마크가 문자열에 붙어 저장된다', () => {
  it('마크가 없으면 그대로', () => {
    expect(parseAction('document.update')).toEqual({ base: 'document.update', high: false, override: false });
  });

  it('[high] 를 떼어 낸다', () => {
    expect(parseAction('membership.set_role [high]')).toEqual({
      base: 'membership.set_role',
      high: true,
      override: false,
    });
  });

  it('[override] 와 [high] 가 함께 붙어도 둘 다 읽는다', () => {
    const p = parseAction('post.update [override] [high]');
    expect(p).toEqual({ base: 'post.update', high: true, override: true });
  });
});

describe('isAutomated — 기본 목록에서 빼는 기준', () => {
  it('크론과 옛 일괄 생성이 자동 작업이다', () => {
    expect(isAutomated('cron.publish')).toBe(true);
    expect(isAutomated('batch.generate_draft')).toBe(true);
  });

  it('사람이 한 일은 아니다', () => {
    expect(isAutomated('post.create')).toBe(false);
    expect(isAutomated('recruit.applicant.bulkStatus [high]')).toBe(false);
  });

  // 이름에 cron 이 들어간다고 자동이 아니다 — 접두사(`cron.`)로만 판단해야 한다.
  it('이름 안에 cron 이 들어간 행위를 자동으로 세지 않는다', () => {
    expect(isAutomated('settings.cronToggle')).toBe(false);
  });
});

describe('actionGroup — 필터 대분류', () => {
  it('첫 마디를 대분류로 쓴다', () => {
    expect(actionGroup('recruit.applicant.bulkStatus [high]')).toBe('recruit');
    expect(actionGroup('membership.demote')).toBe('membership');
  });

  it('드롭다운의 모든 대분류는 실제 라벨 표에 쓰이는 접두사다', () => {
    const prefixes = new Set(Object.keys(ACTION_LABEL).map((a) => a.split('.')[0]));
    for (const g of AUDIT_GROUPS) expect(prefixes.has(g.key), `${g.key} 가 라벨 표에 없다`).toBe(true);
  });
});

describe('describeAction — 모르는 행위도 감추지 않는다', () => {
  it('아는 행위는 한국어로', () => {
    expect(describeAction('recruit.resultMail.queue')).toBe('결과 안내 메일 발송 걺');
  });

  it('마크가 붙어 있어도 라벨을 찾는다', () => {
    expect(describeAction('membership.set_role [high]')).toBe('역할 지정');
  });

  // 코드는 늘 이 표보다 앞선다. 빈칸으로 덮으면 새 기능의 기록이 화면에서 사라진 것처럼 보인다.
  it('표에 없는 행위는 원문을 그대로 보여 준다', () => {
    expect(describeAction('something.brandNew')).toBe('something.brandNew');
  });
});

describe('커서 — (시각, id) 순서쌍', () => {
  it('넣은 값을 그대로 되읽는다', () => {
    const at = new Date('2026-08-28T01:23:45.678Z');
    const back = parseCursor(encodeCursor(at, 'abc-def'));
    expect(back?.at.toISOString()).toBe(at.toISOString());
    expect(back?.id).toBe('abc-def');
  });

  it('id 에 구분자가 없거나 망가진 값은 커서로 치지 않는다', () => {
    expect(parseCursor(null)).toBeNull();
    expect(parseCursor('')).toBeNull();
    expect(parseCursor('구분자없음')).toBeNull();
    expect(parseCursor('|id만')).toBeNull();
    expect(parseCursor('날짜아님|abc')).toBeNull();
  });
});
