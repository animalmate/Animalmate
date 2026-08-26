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

/**
 * 이미 가입된 이메일로 "가입" 을 시도했을 때 보내는 안내.
 *
 * 가입 요청 응답은 가입 여부와 무관하게 똑같다(계정 열거 차단). 그래서 "이미 가입됨" 이라는
 * 사실은 **메일함 — 본인만 볼 수 있는 채널** 로만 전달한다. 남이 내 주소로 가입을 시도해도
 * 그 사람은 응답에서 아무것도 알 수 없고, 나는 메일로 알게 된다(탐지 신호이기도 하다).
 */
export function alreadyRegisteredMail(to: string): GenericMail {
  return {
    to,
    subject: '[애니멀메이트] 이미 가입된 계정입니다',
    text:
      `이 주소로 가입이 시도되었지만, 이미 가입된 계정입니다.\n\n` +
      `로그인 화면에서 "로그인" 으로 진행해 주세요 — 비밀번호 없이 이메일 인증 코드로 로그인합니다.\n\n` +
      `본인이 시도한 것이 아니라면 무시하셔도 됩니다(이 메일만으로는 아무 일도 일어나지 않습니다).`,
  };
}

/**
 * 지원서가 재제출되면서 **연락받을 주소가 다른 주소로 바뀌었을 때** 직전 주소로 보내는 알림.
 *
 * 왜 필요한가: 모집 지원 폼은 비로그인이고 신원 확인이 이름+전화뿐이다. 둘을 아는 사람이
 * 재제출하면 이메일을 갈아 끼울 수 있어, 결과 안내 메일이 그 사람에게 간다. 오타를 고치는
 * 정상 재제출과 서버에서 구분할 방법이 없으므로(둘 다 이름·전화가 맞다) **막는 대신 알린다** —
 * 회장단 권한 변경 알림을 행위자 본인에게까지 보내는 것과 같은 발상이다(auth/operators.ts).
 *
 * 바뀐 **새 주소는 적지 않는다.** 이 메일은 남이 보냈을 수 있는 상황을 알리는 것이라,
 * 여기에 상대 주소를 실으면 그 자체가 정보를 넘겨주는 셈이 된다.
 */
export function applicantEmailChangedMail(to: string): GenericMail {
  return {
    to,
    subject: '[애니멀메이트] 지원서의 연락받을 이메일 주소가 변경되었습니다',
    text:
      `지원서가 다시 제출되면서, 결과 안내를 받을 이메일 주소가 이 주소가 아닌 다른 주소로 바뀌었습니다.\n\n` +
      `본인이 수정한 것이라면 아무 조치도 필요하지 않습니다.\n` +
      `본인이 한 것이 아니라면, 다른 사람이 이름과 전화번호로 지원서를 덮어썼을 수 있습니다.\n` +
      `이 메일에 회신하거나 운영진에게 알려 주세요 — 지원서 내용도 함께 바뀌었을 수 있습니다.\n\n` +
      `애니멀메이트 드림`,
  };
}

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

/**
 * SMTP 설정이 있으면 Gmail, 없으면 dry.
 * **테스트 실행 중에는 항상 dry** — 통합 테스트가 메일러 주입을 빠뜨려도 실제 운영진에게
 * 알림 메일이 나가지 않게 하는 안전장치(2026-07-24, 실제로 한 번 새어 나갔다).
 */
export function defaultMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  if (env.NODE_ENV === 'test' || env.VITEST) return dryMailer;
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) return gmailMailer(env);
  return dryMailer;
}
