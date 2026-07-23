'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input, Textarea } from '@/components/ui';

interface Detail {
  post: { id: string; title: string; contentMd: string; publishAt: string | null; status: string; eventId: string | null };
  event: { eventDate: string | null; meetTime: string | null; place: string | null; capacity: number | null } | null;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function EditReservationForm({ id }: { id: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('');
  const [hasEvent, setHasEvent] = useState(false);
  const [title, setTitle] = useState('');
  const [contentMd, setContentMd] = useState('');
  const [publishLocal, setPublishLocal] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [meetTime, setMeetTime] = useState('');
  const [place, setPlace] = useState('');
  const [capacity, setCapacity] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await apiGet<Detail>(`/api/reservations/${id}`);
      setLoaded(true);
      if (!r.ok) return setError(errorMessage(r.data.error));
      const { post, event } = r.data;
      setStatus(post.status);
      setTitle(post.title);
      setContentMd(post.contentMd);
      setPublishLocal(toLocalInput(post.publishAt));
      setHasEvent(Boolean(post.eventId));
      if (event) {
        setEventDate(event.eventDate ?? '');
        setMeetTime(event.meetTime ? event.meetTime.slice(0, 5) : '');
        setPlace(event.place ?? '');
        setCapacity(event.capacity != null ? String(event.capacity) : '');
      }
    })();
  }, [id]);

  async function save() {
    setError('');
    setBusy(true);
    const res = await fetch(`/api/reservations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        contentMd,
        publishAt: publishLocal ? new Date(publishLocal).toISOString() : null,
        ...(hasEvent ? { eventDate: eventDate || null, meetTime: meetTime || null, place: place || null, capacity } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return setError(errorMessage(d.error, d.message));
    }
    router.push('/reservations');
    router.refresh();
  }

  if (!loaded) return <InfoText>불러오는 중…</InfoText>;
  if (status === 'published')
    return (
      <Card>
        <InfoText>발행된 예약은 수정할 수 없습니다. 변경 사항은 카페 댓글로 안내하세요.</InfoText>
      </Card>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">예약 수정</h1>
      <Card className="space-y-3">
        <Field label="제목">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="본문">
          <Textarea rows={5} value={contentMd} onChange={(e) => setContentMd(e.target.value)} />
        </Field>
        <Field label="발행 시각">
          <Input type="datetime-local" value={publishLocal} onChange={(e) => setPublishLocal(e.target.value)} />
        </Field>
        {hasEvent ? (
          <div className="space-y-3 rounded-md bg-gray-50 p-3">
            <div className="text-sm font-medium text-gray-700">봉사 회차 정보</div>
            <Field label="봉사 일자">
              <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </Field>
            <Field label="집합 시간">
              <Input type="time" value={meetTime} onChange={(e) => setMeetTime(e.target.value)} />
            </Field>
            <Field label="장소">
              <Input value={place} onChange={(e) => setPlace(e.target.value)} />
            </Field>
            <Field label="정원">
              <Input inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
        ) : null}
        <ErrorText>{error}</ErrorText>
        <Button disabled={busy || !title.trim()} onClick={save}>
          {busy ? '저장 중…' : '저장'}
        </Button>
      </Card>
    </div>
  );
}
