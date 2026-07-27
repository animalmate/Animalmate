'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, errorMessage } from '@/lib/api';
import { Button, Card, DangerButton, ErrorText, Field, InfoText, Input, SecondaryButton } from '@/components/ui';
import { Modal } from '@/components/modal';

// 서버(DELETE /api/me)가 요구하는 확인 문구와 같아야 한다.
const WITHDRAW_CONFIRM = '탈퇴합니다';

export function ProfilePanel({ name, email, phone }: { name: string; email: string; phone: string }) {
  const router = useRouter();
  const [value, setValue] = useState(phone);
  const [saved, setSaved] = useState(phone);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  async function save() {
    setError('');
    setDone(false);
    setBusy(true);
    const r = await apiPost<{ phone: string }>('/api/me', { phone: value.trim() }, 'PATCH');
    setBusy(false);
    if (!r.ok) return setError(errorMessage(r.data.error));
    setSaved(r.data.phone);
    setValue(r.data.phone);
    setDone(true);
  }

  async function withdraw() {
    setWithdrawError('');
    setWithdrawing(true);
    const res = await fetch('/api/me', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: confirmText.trim() }),
    });
    setWithdrawing(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setWithdrawError(d.message || errorMessage(d.error));
      return;
    }
    // 계정이 사라졌으므로 남은 화면을 그대로 두지 않는다.
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-[22px] font-bold text-ink-900">내 정보</h1>
      <Card className="space-y-4">
        <Field label="이름">
          <Input value={name} disabled readOnly />
        </Field>
        <Field label="이메일">
          <Input value={email} disabled readOnly />
        </Field>
        <Field label="전화번호" hint="봉사 공지 팀장단 표시·운영 연락에 쓰여요.">
          <Input
            type="tel"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setDone(false);
            }}
            placeholder="010-1234-5678"
            autoComplete="tel"
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        {done ? <InfoText>저장했어요.</InfoText> : null}
        <Button disabled={busy || value.trim() === saved.trim()} onClick={save}>
          {busy ? '저장 중…' : '전화번호 저장'}
        </Button>
      </Card>

      {/* 탈퇴는 되돌릴 수 없으므로 저장 카드와 분리하고, 눌러도 바로 실행되지 않게 한다. */}
      <Card className="space-y-3 border-coral-100">
        <div>
          <h2 className="text-base font-semibold text-ink-900">동아리 탈퇴</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
            탈퇴하면 이름·이메일·전화번호가 지워지고 계정을 다시 쓸 수 없어요.{' '}
            <strong className="text-ink-700">되돌릴 수 없습니다.</strong> 잠시 쉬는 거라면 운영진에게 말해 주세요.
          </p>
        </div>
        <div>
          <DangerButton onClick={() => setShowWithdraw(true)}>탈퇴하기</DangerButton>
        </div>
      </Card>

      {showWithdraw ? (
        <Modal
          title="정말 탈퇴할까요?"
          onClose={() => {
            setShowWithdraw(false);
            setConfirmText('');
            setWithdrawError('');
          }}
        >
          <div className="space-y-4">
            <p className="text-[13px] leading-relaxed text-ink-700">
              탈퇴하면 <strong>{name}</strong> 님의 이름·이메일·전화번호가 지워지고 즉시 로그아웃됩니다. 되돌릴 수 없어요.
              <br />
              (작성했던 공지 예약·양식·문서는 남고, 작성자만 &lsquo;탈퇴한 회원&rsquo;으로 표시됩니다.)
            </p>
            <Field label={`계속하려면 "${WITHDRAW_CONFIRM}"를 입력해 주세요`}>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={WITHDRAW_CONFIRM}
                autoComplete="off"
              />
            </Field>
            <ErrorText>{withdrawError}</ErrorText>
            <div className="flex justify-end gap-2">
              <SecondaryButton
                onClick={() => {
                  setShowWithdraw(false);
                  setConfirmText('');
                  setWithdrawError('');
                }}
              >
                돌아가기
              </SecondaryButton>
              <DangerButton disabled={withdrawing || confirmText.trim() !== WITHDRAW_CONFIRM} onClick={withdraw}>
                {withdrawing ? '처리 중…' : '탈퇴하기'}
              </DangerButton>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
