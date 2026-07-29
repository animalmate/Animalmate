'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, errorMessage } from '@/lib/api';
import { useCooldown } from '@/lib/use-cooldown';
import { Button, Card, ErrorText, Field, InfoText, Input, SecondaryButton } from '@/components/ui';
import { CursorDog } from '@/components/cursor-dog';

export function LoginForm({ contact }: { contact: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cooldown = useCooldown();

  async function request() {
    setError('');
    setBusy(true);
    const r = await apiPost('/api/auth/login/request', { email: email.trim() });
    setBusy(false);
    if (r.status === 429) {
      cooldown.start(r.data.retryAfter ?? 60);
      setStep('code');
      return;
    }
    if (!r.ok) return setError(errorMessage(r.data.error));
    setStep('code');
    cooldown.start(60);
  }

  async function verify() {
    setError('');
    setBusy(true);
    const r = await apiPost('/api/auth/login/verify', { email: email.trim(), code: code.trim() });
    setBusy(false);
    if (!r.ok) return setError(errorMessage(r.data.error));
    router.push('/');
    router.refresh();
  }

  return (
    <>
      {/* 맨 아래 크레딧 위에 서게 한다 — 기본값(10)이면 몸통이 글자를 덮어 안 읽힌다. */}
      <CursorDog groundMargin={52} />
      {/* 크레딧을 화면 맨 아래에 붙이려고 두 층으로 나눈다 — 위쪽(flex-1)이 남는 높이를 다 먹고
          그 안에서 카드를 세로 가운데 두면, 크레딧은 자연히 바닥에 남는다. 내용이 길어져
          화면을 넘기면 크레딧도 문서 끝으로 따라간다(고정 배치가 아니라 겹치지 않는다). */}
      <main className="mx-auto flex min-h-screen max-w-md flex-col p-4">
      <div className="flex flex-1 flex-col justify-center">
      <div className="mb-6 flex flex-col items-center text-center">
        <img src="/logo.png" alt="애니멀메이트" className="h-16 w-16 rounded-full" />
        <h1 className="mt-3 text-[22px] font-bold text-ink-900">로그인</h1>
        <p className="mt-1 text-[13px] text-ink-500">이메일로 인증 코드를 받아 로그인해요.</p>
      </div>
      <Card className="space-y-4">
        {step === 'email' ? (
          <>
            <Field label="이메일">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </Field>
            <ErrorText>{error}</ErrorText>
            <Button className="w-full" disabled={busy || !email} onClick={request}>
              {busy ? '전송 중…' : '인증 코드 받기'}
            </Button>
            <div className="rounded-xl border border-coral-100 bg-coral-50 p-3.5 text-center">
              <p className="text-[13px] font-semibold text-ink-900">처음이신가요?</p>
              <p className="mt-0.5 text-[13px] text-ink-700">로그인하려면 먼저 가입이 필요합니다.</p>
              <a
                href="/signup"
                className="mt-2.5 inline-flex h-control-sm min-h-tap items-center justify-center rounded-xl bg-coral-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-coral-600"
              >
                가입하기 →
              </a>
            </div>
          </>
        ) : (
          <>
            <InfoText>
              {email} 으로 6자리 코드를 보냈습니다. 메일이 안 보이면 <b>스팸함(특히 네이버 메일)</b>을 확인하세요.
            </InfoText>
            <Field label="인증 코드 (6자리)" hint="기기당 한 번만 인증">
              <Input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
              />
            </Field>
            <ErrorText>{error}</ErrorText>
            <Button className="w-full" disabled={busy || code.length !== 6} onClick={verify}>
              {busy ? '확인 중…' : '로그인'}
            </Button>
            <SecondaryButton className="w-full" disabled={cooldown.left > 0 || busy} onClick={request}>
              {cooldown.left > 0 ? `코드 재전송 (${cooldown.left}s)` : '코드 재전송'}
            </SecondaryButton>
          </>
        )}
      </Card>
      </div>
      {/* 제작자 크레딧 — 로그인 화면에만 둔다(로그인 뒤 화면은 운영 도구라 자리를 차지할 이유가 없다).
          연락처는 /privacy 와 같은 CONTACT_EMAIL 을 쓴다. 값이 없으면 주소를 지어내지 않고 이름만 남긴다. */}
      <p className="pt-6 text-center text-[11px] leading-relaxed text-ink-400">
        사이트제작 한채훈
        {contact ? (
          <>
            {' '}
            <a href={`mailto:${contact}`} className="underline underline-offset-2 hover:text-ink-500">
              {contact}
            </a>
          </>
        ) : null}
      </p>
      </main>
    </>
  );
}
