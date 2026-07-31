'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, errorMessage, waitMessage } from '@/lib/api';
import { useCooldown } from '@/lib/use-cooldown';
import { Button, Card, ErrorText, Field, InfoText, Input, SecondaryButton } from '@/components/ui';
import { CursorDog } from '@/components/cursor-dog';
import { CONSENT_LABEL } from '@/legal/privacy';

export function SignupForm() {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 개인정보 수집·이용 동의. 서버도 이 값을 다시 검사한다(UI 체크는 권한 검증이 아니다 — 규칙 #6).
  const [consent, setConsent] = useState(false);
  const cooldown = useCooldown();

  async function request() {
    setError('');
    setBusy(true);
    const r = await apiPost('/api/auth/signup/request', { email: email.trim(), joinCode: joinCode.trim() });
    setBusy(false);
    if (r.status === 429) {
      // 리밋에 걸리면 **메일이 나가지 않는다.** 예전에는 여기서 코드 입력 단계로 넘겼는데,
      // 그러면 오지 않을 코드를 기다리며 빈 화면을 보게 된다. 단계는 그대로 두고 대기 시간을 알린다.
      // (재전송 버튼은 쿨다운으로 잠가 둔다 — 눌러도 같은 429 만 돌아온다.)
      cooldown.start(r.data.retryAfter ?? 60);
      return setError(waitMessage(r.data.retryAfter));
    }
    if (!r.ok) return setError(errorMessage(r.data.error));
    setStep('code');
    cooldown.start(60);
  }

  async function verify() {
    setError('');
    setBusy(true);
    const r = await apiPost('/api/auth/signup/verify', {
      email: email.trim(),
      code: code.trim(),
      name: name.trim(),
      phone: phone.trim(),
      privacyConsent: consent,
    });
    setBusy(false);
    if (!r.ok) return setError(errorMessage(r.data.error));
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <CursorDog />
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-4">
      <div className="mb-6 flex flex-col items-center text-center">
        <img src="/logo.png" alt="애니멀메이트" className="h-16 w-16 rounded-full" />
        <h1 className="mt-3 text-[22px] font-bold text-ink-900">가입</h1>
        <p className="mt-1 text-[13px] text-ink-500">동아리 가입코드와 이메일 인증으로 가입해요.</p>
      </div>
      <Card className="space-y-4">
        {step === 'form' ? (
          <>
            <Field label="이름">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
            </Field>
            <Field label="이메일">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </Field>
            <Field label="전화번호" hint="그냥 -없이 입력하세요. 나중에 고칠 수 있어요.">
              {/* 예시도 안내("-없이")와 같은 모양으로 둔다 — 둘이 어긋나면 어느 쪽을 따를지 헷갈린다. */}
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01012345678" autoComplete="tel" />
            </Field>
            <Field label="가입코드" hint="동아리 카페 공지의 학기 가입코드">
              <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="가입코드" />
            </Field>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-cream-50 p-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
              />
              <span className="text-[12.5px] leading-relaxed text-ink-600">
                {CONSENT_LABEL.signup}{' '}
                {/* 이 <a> 는 체크박스를 감싼 <label> 안에 있다. 막지 않으면 클릭이 라벨까지
                    올라가 **방침을 읽으러 누른 것이 동의 체크까지 토글**한다. 동의는 사용자가
                    의도해서 켜야 하는 값이라(07-DECISIONS 48) 링크 클릭으로 켜지면 안 된다. */}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="font-semibold underline"
                >
                  개인정보처리방침
                </a>
              </span>
            </label>
            <ErrorText>{error}</ErrorText>
            <Button className="w-full" disabled={busy || !name || !email || !phone || !joinCode || !consent} onClick={request}>
              {busy ? '전송 중…' : '인증 코드 받기'}
            </Button>
            <InfoText>
              이미 계정이 있으면{' '}
              <a href="/login" className="underline">
                로그인
              </a>
              하세요.
            </InfoText>
          </>
        ) : (
          <>
            {/* 가입 여부를 화면에서 구분하지 않는다(계정 열거 차단) — 어느 쪽인지는 메일함에서 알게 된다. */}
            <InfoText>
              {email} 으로 메일을 보냈습니다. 메일함에서 6자리 코드를 확인해 주세요.
              <br />
              이미 가입된 주소라면 코드 대신 <b>안내 메일</b>이 갑니다 — 그 경우 로그인으로 진행하세요.
              <br />
              메일이 안 보이면 <b>스팸함(특히 네이버 메일)</b>을 확인하세요.
            </InfoText>
            <Field label="인증 코드 (6자리)">
              <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
            </Field>
            <ErrorText>{error}</ErrorText>
            <Button className="w-full" disabled={busy || code.length !== 6} onClick={verify}>
              {busy ? '확인 중…' : '가입 완료'}
            </Button>
            <SecondaryButton className="w-full" disabled={cooldown.left > 0 || busy} onClick={request}>
              {cooldown.left > 0 ? `코드 재전송 (${cooldown.left}s)` : '코드 재전송'}
            </SecondaryButton>
          </>
        )}
      </Card>
      </main>
    </>
  );
}
