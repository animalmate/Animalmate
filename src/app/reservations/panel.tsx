'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, InfoText, SecondaryButton, StatusBadge } from '@/components/ui';

interface Reservation {
  id: string;
  title: string;
  status: string;
  boardMenuid: number;
  publishAt: string | null;
  cafeArticleUrl: string | null;
  failReason: string | null;
  event: { eventDate: string | null; place: string | null; capacity: number | null } | null;
  missing: string[];
}

function fmt(iso: string | null): string {
  if (!iso) return '발행시각 미정';
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function ReservationsPanel() {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const r = await apiGet<{ reservations: Reservation[] }>('/api/reservations');
    setLoading(false);
    if (r.ok) setRows(r.data.reservations ?? []);
    else setError(errorMessage(r.data.error));
  }
  useEffect(() => {
    void load();
  }, []);

  async function act(id: string, action: 'ready' | 'schedule' | 'cancel') {
    setError('');
    const r = await apiPost<{ missing?: string[] }>(`/api/reservations/${id}/action`, { action });
    if (!r.ok) {
      if (r.data.error === 'not_ready') setError(`필수 필드가 비어 있습니다: ${(r.data.missing ?? []).join(', ')}`);
      else setError(errorMessage(r.data.error, r.data.message as string));
      return;
    }
    void load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">예약 큐</h1>
        <a href="/reservations/new">
          <Button>새 예약</Button>
        </a>
      </div>
      <ErrorText>{error}</ErrorText>
      {loading ? (
        <InfoText>불러오는 중…</InfoText>
      ) : rows.length === 0 ? (
        <Card>
          <InfoText>아직 예약이 없습니다. "새 예약"으로 등록하세요.</InfoText>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{r.title}</div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-sm text-gray-500">
                  {fmt(r.publishAt)} · 게시판 {r.boardMenuid}
                  {r.event?.eventDate ? ` · 봉사 ${r.event.eventDate}` : ''}
                </div>
                {r.status === 'draft' && r.missing.length > 0 ? (
                  <div className="text-sm text-yellow-700">미완성: {r.missing.join(', ')}</div>
                ) : null}
                {r.status === 'failed' ? (
                  <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">
                    발행 실패{r.failReason ? `: ${r.failReason}` : ''}. 원인 확인 후 "재시도"로 발행 대기 큐에 다시 넣으세요.
                  </div>
                ) : null}
                {r.status === 'published' ? (
                  <div className="rounded-md bg-gray-50 p-2 text-sm">
                    발행 완료 —{' '}
                    {r.cafeArticleUrl ? (
                      <a className="underline" href={r.cafeArticleUrl} target="_blank" rel="noreferrer">
                        카페 글 보기
                      </a>
                    ) : (
                      '카페 링크 대기'
                    )}
                    <div className="text-xs text-gray-500">발행된 글은 수정 불가입니다. 변경 사항은 카페 댓글로 안내하세요.</div>
                  </div>
                ) : null}
                {r.status !== 'published' ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a href={`/reservations/${r.id}/edit`}>
                      <SecondaryButton>수정</SecondaryButton>
                    </a>
                    {r.status === 'draft' ? (
                      <SecondaryButton onClick={() => act(r.id, 'ready')}>완성 처리</SecondaryButton>
                    ) : null}
                    {r.status === 'ready' ? (
                      <SecondaryButton onClick={() => act(r.id, 'schedule')}>발행 대기로</SecondaryButton>
                    ) : null}
                    {r.status === 'failed' ? (
                      <SecondaryButton onClick={() => act(r.id, 'schedule')}>재시도(발행 대기)</SecondaryButton>
                    ) : null}
                    <SecondaryButton onClick={() => act(r.id, 'cancel')}>취소</SecondaryButton>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
