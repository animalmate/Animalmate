'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, errorMessage, waitMessage } from '@/lib/api';
import { useCooldown } from '@/lib/use-cooldown';
import { Button, Card, ErrorText, Field, InfoText, Input, SecondaryButton } from '@/components/ui';
import { CursorDog } from '@/components/cursor-dog';

export function LoginForm() {
  const router = useRouter();
  // 첫 화면은 **이메일 칸이 아니라 갈림길**이다(2026-08-03). 예전에는 들어오자마자 이메일 입력칸이
  // 보여서, 가입한 적 없는 사람도 "여기 적으면 되는구나" 하고 코드를 기다리다 막혔다. 가입 안내를
  // 폼 아래에 둬도 칸이 먼저 눈에 들어오면 읽지 않는다. 그래서 무엇을 하러 왔는지부터 고르게 한다.
  // (기기에 "로그인한 적 있음"을 남겨 이 단계를 건너뛰는 방법도 있지만, 동아리는 노트북 한 대를
  //  여럿이 돌려 쓰는 자리가 있어 그 기기에서 신입이 다시 같은 함정에 빠진다. 한 번 더 누른다.)
  const [step, setStep] = useState<'choose' | 'email' | 'code'>('choose');
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
      // 가입 화면과 같은 이유 — 리밋에 걸리면 메일이 나가지 않으므로 코드 단계로 넘기지 않는다.
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
        <h1 className="mt-3 text-[22px] font-bold text-ink-900">
          {step === 'choose' ? '애니멀메이트' : '로그인'}
        </h1>
        <p className="mt-1 text-[13px] text-ink-500">
          {step === 'choose' ? '동아리 회원 전용 서비스예요.' : '이메일로 인증 코드를 받아 로그인해요.'}
        </p>
        {/* 아직 동아리원이 아닌 사람이 갈 곳(모집 공고). 아래 '회원가입' 안내와 다른 사람을 위한 줄이다 —
            가입은 **이미 동아리원인데 계정이 없는** 사람의 길이고, 이 줄은 동아리에 들어오려는 사람의 길이다.
            첫 화면(갈림길)에만 둔다: 코드 입력 중에 나오면 하던 일과 상관없는 링크가 끼어든다.
            링크에 **세로** 여백만 준 이유: 13px 글자 두 자라 손가락으로 누르기 좁은데, 가로 패딩을
            주면 조사가 떨어져 "여기 를 클릭"으로 읽힌다. 세로 패딩은 줄 높이를 바꾸지 않고
            누를 수 있는 넓이만 키운다. */}
        {step === 'choose' ? (
          <p className="mt-1 text-[13px] text-ink-500">
            동아리 회원이 아니라면{' '}
            <a
              href="/recruit/notice"
              className="py-2 font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700"
            >
              여기
            </a>
            를 클릭
          </p>
        ) : null}
      </div>
      {step === 'choose' ? (
        <Card className="space-y-3">
          <Button className="w-full" onClick={() => setStep('email')}>
            로그인
          </Button>
          {/* 가입은 링크(<a>)라 버튼 모양을 직접 입힌다. 높이는 위 Button 과 같은 h-control 로 맞춘다 —
              한쪽만 작으면 "이건 진짜 버튼이 아닌가" 싶어 안 누른다. */}
          <a
            href="/signup"
            className="inline-flex h-control min-h-tap w-full items-center justify-center rounded-xl border border-coral-100 bg-coral-50 px-[18px] text-[15px] font-semibold text-coral-600 transition-colors hover:bg-coral-100"
          >
            회원가입
          </a>
          <p className="pt-1 text-center text-[13px] leading-relaxed text-ink-500">
            처음이시라면 <b className="text-ink-700">회원가입</b>부터 해주세요.
            <br />
            가입하지 않은 이메일로는 로그인할 수 없어요.
          </p>
        </Card>
      ) : (
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
            {/* 가입 안내는 앞 갈림길 화면이 맡으므로 여기서는 한 줄로 줄인다.
                그래도 남겨 두는 이유: 습관적으로 로그인을 눌렀다가 "가입한 적이 없구나" 하고
                깨닫는 사람이 되돌아갈 문이 필요하다. */}
            <p className="text-center text-[13px] text-ink-500">
              <button
                type="button"
                onClick={() => setStep('choose')}
                className="underline underline-offset-2 hover:text-ink-700"
              >
                뒤로
              </button>
              <span className="px-2 text-ink-300">·</span>
              아직 가입 전이면{' '}
              <a href="/signup" className="font-semibold text-coral-600 underline underline-offset-2">
                회원가입
              </a>
            </p>
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
      )}
      </div>
      {/* 제작자 크레딧 — 로그인 화면에만 둔다(로그인 뒤 화면은 운영 도구라 자리를 차지할 이유가 없다).
          여기 이메일은 만든 사람 개인 연락처다 — /privacy 의 CONTACT_EMAIL(동아리 공용, 회장단이
          바뀌면 같이 바뀜)과는 다른 값이라 하드코딩한다(2026-08-28). */}
      <p className="pt-6 text-center text-[11px] leading-relaxed text-ink-400">
        사이트제작 한채훈{' '}
        <a href="mailto:sweetkid01@naver.com" className="underline underline-offset-2 hover:text-ink-500">
          sweetkid01@naver.com
        </a>
      </p>
      </main>
    </>
  );
}
