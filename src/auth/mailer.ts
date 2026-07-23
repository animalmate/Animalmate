// 메일 발송 — Gmail SMTP(nodemailer). SMTP_* 미설정이면 dry(발송 안 함) — 실메일은 SMTP 신호 후.
// 인증 서비스는 Mailer 를 주입받아 테스트 시 가짜 메일러로 발송을 관찰한다.

export interface OtpMail {
  to: string;
  code: string;
  purpose: 'signup' | 'login';
}

export interface GenericMail {
  to: string | string[];
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: GenericMail): Promise<void>;
  sendOtp(mail: OtpMail): Promise<void>;
}

/** SMTP 미설정 시 기본. 실제 발송 없이 로그만(개발/테스트). */
export const dryMailer: Mailer = {
  async send(mail) {
    console.log(`[dry-mail] → ${mail.to}: ${mail.subject}. 실제 발송 안 함(SMTP 미설정).`);
  },
  async sendOtp(mail) {
    console.log(`[dry-mail] OTP → ${mail.to} (${mail.purpose}). 실제 발송 안 함(SMTP 미설정).`);
  },
};

function otpSubjectBody(mail: OtpMail): { subject: string; text: string } {
  const kind = mail.purpose === 'signup' ? '가입' : '로그인';
  return {
    // 제목에 코드 포함(메일 목록에서 바로 확인). 네이버 메일은 스팸함으로 갈 수 있어 본문에 안내.
    subject: `[애니멀메이트] ${kind} 인증 코드 ${mail.code}`,
    text:
      `${kind} 인증 코드: ${mail.code}\n\n` +
      `10분 이내에 입력해 주세요. 본인이 요청하지 않았다면 무시하세요.\n` +
      `※ 메일이 안 보이면 스팸함(특히 네이버 메일)을 확인해 주세요.`,
  };
}

/** Gmail SMTP 메일러. nodemailer 를 지연 로드. */
export function gmailMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  async function transport() {
    const nodemailer = await import('nodemailer');
    const port = Number(env.SMTP_PORT ?? 587);
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465, // 587=STARTTLS, 465=SSL
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return {
    async send(mail) {
      const t = await transport();
      await t.sendMail({ from: env.SMTP_FROM ?? env.SMTP_USER, to: mail.to, subject: mail.subject, text: mail.text });
    },
    async sendOtp(mail) {
      const { subject, text } = otpSubjectBody(mail);
      const t = await transport();
      await t.sendMail({ from: env.SMTP_FROM ?? env.SMTP_USER, to: mail.to, subject, text });
    },
  };
}

/** SMTP 설정이 있으면 Gmail, 없으면 dry. */
export function defaultMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) return gmailMailer(env);
  return dryMailer;
}
