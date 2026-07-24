'use client';
import { useState } from 'react';
import { apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input } from '@/components/ui';

export function ProfilePanel({ name, email, phone }: { name: string; email: string; phone: string }) {
  const [value, setValue] = useState(phone);
  const [saved, setSaved] = useState(phone);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

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
    </div>
  );
}
