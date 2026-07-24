'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, errorMessage } from '@/lib/api';
import { useCooldown } from '@/lib/use-cooldown';
import { Button, Card, ErrorText, Field, InfoText, Input, SecondaryButton } from '@/components/ui';
import { CursorDog } from '@/components/cursor-dog';

export function LoginForm() {
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
      <CursorDog />
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-4">
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
            <InfoText>
              계정이 없으면{' '}
              <a href="/signup" className="underline">
                가입
              </a>
              하세요.
            </InfoText>
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
      </main>
    </>
  );
}
