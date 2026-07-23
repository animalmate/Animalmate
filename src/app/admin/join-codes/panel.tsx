'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input } from '@/components/ui';

interface Active {
  code: string;
  semesterLabel: string;
}

export function JoinCodesPanel() {
  const [active, setActive] = useState<Active | null>(null);
  const [semester, setSemester] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await apiGet<{ active: Active | null }>('/api/admin/join-codes');
    if (r.ok) setActive(r.data.active ?? null);
  }
  useEffect(() => {
    void load();
  }, []);

  async function issue() {
    setError('');
    setBusy(true);
    const r = await apiPost('/api/admin/join-codes', { semesterLabel: semester.trim(), code: code.trim() || undefined });
    setBusy(false);
    if (!r.ok) return setError(errorMessage(r.data.error));
    setSemester('');
    setCode('');
    void load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">가입코드</h1>
      <Card>
        <div className="text-sm text-gray-500">현재 활성 코드</div>
        {active ? (
          <div className="mt-1">
            <span className="font-mono text-lg font-bold">{active.code}</span>
            <span className="ml-2 text-sm text-gray-500">({active.semesterLabel})</span>
          </div>
        ) : (
          <InfoText>아직 발급된 코드가 없습니다.</InfoText>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="font-medium">발급 / 재발급</div>
        <InfoText>재발급하면 기존 코드는 즉시 무효화됩니다. 카페 공지로 새 코드를 배포하세요.</InfoText>
        <Field label="학기 라벨" hint="예: 2026-1">
          <Input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="2026-1" />
        </Field>
        <Field label="코드 (비우면 자동 생성)">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="자동 생성" />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button disabled={busy || !semester} onClick={issue}>
          {busy ? '발급 중…' : '발급'}
        </Button>
      </Card>
    </div>
  );
}
