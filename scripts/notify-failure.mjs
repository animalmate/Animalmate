// GitHub Actions 실패 알림 — 공용 Gmail 로 메일 한 통.
// 백업 잡이 조용히 죽으면 몇 주 뒤 "백업이 없다"는 걸 복원해야 할 때 알게 된다. 그건 너무 늦다.
//
// 사용: node scripts/notify-failure.mjs "<제목>" "<본문>"
// 필요 env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, (선택) SMTP_FROM, ALERT_TO
//
// 이 스크립트 자체가 실패해도 워크플로를 더 망가뜨리지 않게 exit 0 으로 끝낸다.
// (알림 실패는 로그에 남기고, 잡의 실패 여부는 원래 실패한 스텝이 이미 결정했다.)

import nodemailer from 'nodemailer';

const subject = process.argv[2] ?? '[애니멀메이트] 자동화 잡 실패';
const text = process.argv[3] ?? '상세 내용 없음';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, ALERT_TO } = process.env;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error('[notify] SMTP_* 미설정 — 알림을 보내지 못했다. Actions 시크릿을 확인할 것.');
  process.exit(0);
}

const port = Number(SMTP_PORT ?? 587);
const to = ALERT_TO || SMTP_USER; // 따로 지정 안 하면 공용 Gmail 자기 자신에게

try {
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transport.sendMail({ from: SMTP_FROM ?? SMTP_USER, to, subject, text });
  console.log(`[notify] 실패 알림 발송 완료 → ${to}`);
} catch (e) {
  console.error('[notify] 알림 발송 실패:', e instanceof Error ? e.message : e);
}
process.exit(0);
