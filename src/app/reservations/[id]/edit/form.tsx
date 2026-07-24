'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input } from '@/components/ui';
import { AutoGrowTextarea } from '@/components/auto-grow-textarea';
import { renderTemplate, placeholderKeys } from '@/publishing/template-render';
import { shortenValue } from '@/publishing/placeholder-catalog';

interface Detail {
  post: { id: string; title: string; contentMd: string; publishAt: string | null; status: string; eventId: string | null };
  event: { eventDate: string | null; meetTime: string | null; place: string | null; capacity: number | null } | null;
  /** 발행 직전 치환에 쓰일 서버 값(팀장단 명단 등). 장소·정원은 아래 입력값으로 덮어쓴다. */
  vars: Record<string, string>;
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
  const [vars, setVars] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await apiGet<Detail>(`/api/reservations/${id}`);
      setLoaded(true);
      if (!r.ok) return setError(errorMessage(r.data.error));
      const { post, event } = r.data;
      setVars(r.data.vars ?? {});
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

  // 카페에 실제로 나갈 최종본 — 발행 워커와 같은 치환 규칙(template-render)을 폼의 현재 값으로 적용.
  const previewVars: Record<string, string> = { ...vars };
  if (hasEvent) {
    if (place.trim()) previewVars['장소'] = place.trim();
    else delete previewVars['장소'];
    if (capacity.trim()) previewVars['정원'] = capacity.trim();
    else delete previewVars['정원'];
    if (meetTime) previewVars['집합시간'] = meetTime;
  }
  const previewTitle = renderTemplate(title, previewVars);
  const previewBody = renderTemplate(contentMd, previewVars);
  // 이 글이 쓰는 값과 각각 무엇으로 바뀌는지(비어 있으면 발행이 보류된다).
  const used = placeholderKeys(title, contentMd).map((key) => ({ key, value: previewVars[key] ?? null }));

  if (!loaded) return <InfoText>불러오는 중…</InfoText>;
  if (status === 'published')
    return (
      <Card>
        <InfoText>발행된 예약은 수정할 수 없습니다. 변경 사항은 카페 댓글로 안내하세요.</InfoText>
      </Card>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-ink-900">예약 수정</h1>
      <Card className="space-y-3">
        <Field label="제목">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="본문">
          <AutoGrowTextarea value={contentMd} onChange={(e) => setContentMd(e.target.value)} />
        </Field>
        <Field label="발행 시각">
          <Input type="datetime-local" value={publishLocal} onChange={(e) => setPublishLocal(e.target.value)} />
        </Field>
        {hasEvent ? (
          <div className="space-y-3 rounded-md bg-cream-100 p-3">
            <div className="text-sm font-medium text-ink-700">봉사 회차 정보</div>
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

      <Card className="space-y-2">
        <div className="font-medium">카페에 나갈 최종 본문</div>
        <InfoText>위에서 값을 고치면 바로 반영됩니다. 본문 글자를 직접 고칠 필요 없어요.</InfoText>
        {used.length > 0 ? (
          <ul className="space-y-0.5 text-[13px]">
            {used.map((u) => (
              <li key={u.key} className="flex flex-wrap items-baseline gap-1">
                <code className="rounded bg-cream-100 px-1 text-ink-700">{`{{${u.key}}}`}</code>
                <span className="text-ink-400">→</span>
                {u.value ? (
                  <span className="text-ink-900">{shortenValue(u.value, 40)}</span>
                ) : (
                  <span className="text-warning-700">비어 있음 — 채우지 않으면 발행이 보류됩니다</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="rounded-md bg-cream-100 p-3 text-sm">
          <div className="font-medium text-ink-900">{previewTitle}</div>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-ink-700">{previewBody}</pre>
        </div>
      </Card>
    </div>
  );
}
