import { describe, it, expect } from 'vitest';
import { defaultMailer, dryMailer } from './mailer';

// 통합 테스트가 메일러 주입을 빠뜨리면 실제 운영진에게 알림이 나간다(실제로 한 번 발생).
// defaultMailer 가 테스트 실행 중에는 절대 실제 SMTP 를 잡지 않는지 고정한다.
describe('defaultMailer — 테스트 중 실메일 차단', () => {
  const smtp = { SMTP_HOST: 'smtp.example', SMTP_USER: 'u', SMTP_PASS: 'p' };

  it('SMTP 가 설정돼 있어도 NODE_ENV=test 면 dry', () => {
    expect(defaultMailer({ ...smtp, NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(dryMailer);
  });

  it('SMTP 가 설정돼 있어도 VITEST 가 있으면 dry', () => {
    expect(defaultMailer({ ...smtp, NODE_ENV: 'production', VITEST: 'true' } as NodeJS.ProcessEnv)).toBe(dryMailer);
  });

  it('SMTP 미설정이면 dry', () => {
    expect(defaultMailer({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(dryMailer);
  });

  it('운영 환경 + SMTP 설정이면 실제 메일러', () => {
    expect(defaultMailer({ ...smtp, NODE_ENV: 'production' } as NodeJS.ProcessEnv)).not.toBe(dryMailer);
  });
});
