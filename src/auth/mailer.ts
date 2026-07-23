// 메일 발송 — Gmail SMTP(nodemailer). SMTP_* 미설정이면 dry(발송 안 함) — 실메일은 SMTP 신호 후.
// 인증 서비스는 Mailer 를 주입받아 테스트 시 가짜 메일러로 발송을 관찰한다.

export interface OtpMail {
  to: string;
  code: string;
  purpose: 'signup' | 'login';
}

export interface Mailer {
  sendOtp(mail: OtpMail): Promise<void>;
}

/** SMTP 미설정 시 기본. 실제 발송 없이 로그만(개발/테스트). */
export const dryMailer: Mailer = {
  async sendOtp(mail) {
    console.log(`[dry-mail] OTP → ${mail.to} (${mail.purpose}). 실제 발송 안 함(SMTP 미설정).`);
  },
};

function otpSubjectBody(mail: OtpMail): { subject: string; text: string } {
  const kind = mail.purpose === 'signup' ? '가입' : '로그인';
  return {
    subject: `[애니멀메이트] ${kind} 인증 코드`,
    text: `${kind} 인증 코드: ${mail.code}\n\n10분 이내에 입력해 주세요. 본인이 요청하지 않았다면 무시하세요.`,
  };
}

/** Gmail SMTP 메일러. nodemailer 를 지연 로드. */
export function gmailMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  return {
    async sendOtp(mail) {
      const nodemailer = await import('nodemailer');
      const port = Number(env.SMTP_PORT ?? 587);
      const transport = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port,
        secure: port === 465, // 587=STARTTLS, 465=SSL
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
      const { subject, text } = otpSubjectBody(mail);
      await transport.sendMail({ from: env.SMTP_FROM ?? env.SMTP_USER, to: mail.to, subject, text });
    },
  };
}

/** SMTP 설정이 있으면 Gmail, 없으면 dry. */
export function defaultMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) return gmailMailer(env);
  return dryMailer;
}
