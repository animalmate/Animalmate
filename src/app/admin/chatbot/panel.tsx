'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { Card, Button, Field, Input, ErrorText } from '@/components/ui';

interface Usage {
  enabled: boolean;
  dailyPerUser: number;
  globalQuarter: number;
  globalUsedThisQuarter: number;
  todayTotal: number;
}

export function ChatbotAdminPanel() {
  const [u, setU] = useState<Usage | null>(null);
  const [daily, setDaily] = useState('');
  const [quarter, setQuarter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await apiGet<{ usage: Usage }>('/api/admin/chatbot');
    if (r.ok) {
      setU(r.data.usage);
      setDaily(String(r.data.usage.dailyPerUser));
      setQuarter(String(r.data.usage.globalQuarter));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function patch(body: Record<string, unknown>) {
    setError('');
    setBusy(true);
    const r = await apiPost<{ usage: Usage }>('/api/admin/chatbot', body, 'PATCH');
    setBusy(false);
    if (!r.ok) return setError('변경에 실패했어요.');
    setU(r.data.usage);
  }

  if (!u) return <p className="text-ink-500">불러오는 중…</p>;
  const pct = u.globalQuarter > 0 ? Math.min(100, Math.round((u.globalUsedThisQuarter / u.globalQuarter) * 100)) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-[22px] font-bold text-ink-900">챗봇 운영</h1>
        <p className="text-[13px] text-ink-500">사용량을 보고 한도와 활성 상태를 조정해요.</p>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <strong className="text-[15px] font-semibold text-ink-900">챗봇 {u.enabled ? '켜짐' : '꺼짐'}</strong>
            <p className="text-[13px] text-ink-500">{u.enabled ? '회원이 지금 사용할 수 있어요.' : '분기 한도 도달 또는 수동으로 꺼져 있어요.'}</p>
          </div>
          <Button disabled={busy} onClick={() => void patch({ enabled: !u.enabled })}>
            {u.enabled ? '끄기' : '켜기'}
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between text-[14px]">
          <span className="text-ink-500">이번 분기 사용량</span>
          <span className="font-semibold text-ink-900">
            {u.globalUsedThisQuarter.toLocaleString()} / {u.globalQuarter.toLocaleString()}건
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
          <div className={`h-full rounded-full ${pct >= 90 ? 'bg-coral-500' : pct >= 70 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[13px] text-ink-500">오늘 전체 질의: {u.todayTotal.toLocaleString()}건</p>
      </Card>

      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="인당 하루 한도">
            <Input inputMode="numeric" value={daily} onChange={(e) => setDaily(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="분기 전체 한도" hint="예산 ÷ 건당 단가로 정해요">
            <Input inputMode="numeric" value={quarter} onChange={(e) => setQuarter(e.target.value.replace(/\D/g, ''))} />
          </Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <Button
          disabled={busy}
          onClick={() => void patch({ dailyPerUser: Number(daily), globalQuarter: Number(quarter) })}
        >
          한도 저장
        </Button>
      </Card>
    </div>
  );
}
