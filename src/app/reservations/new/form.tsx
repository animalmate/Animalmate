'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input, Select, Textarea } from '@/components/ui';

interface Board { menuid: number; name: string; botCanWrite: boolean }
interface Team { id: string; name: string }
interface Template { id: string; name: string; titleTemplate: string; bodyTemplate: string }

export function NewReservationForm() {
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [kind, setKind] = useState<'general' | 'volunteer'>('general');
  const [teamId, setTeamId] = useState('');
  const [boardMenuid, setBoardMenuid] = useState('');
  const [title, setTitle] = useState('');
  const [contentMd, setContentMd] = useState('');
  const [publishLocal, setPublishLocal] = useState('');
  // 봉사 event 필드
  const [eventDate, setEventDate] = useState('');
  const [meetTime, setMeetTime] = useState('');
  const [place, setPlace] = useState('');
  const [capacity, setCapacity] = useState('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [b, t, tpl] = await Promise.all([
        apiGet<{ boards: Board[] }>('/api/boards'),
        apiGet<{ teams: Team[] }>('/api/teams'),
        apiGet<{ templates: Template[] }>('/api/templates'),
      ]);
      if (b.ok) setBoards((b.data.boards ?? []).filter((x) => x.botCanWrite));
      if (t.ok) setTeams(t.data.teams ?? []);
      if (tpl.ok) setTemplates(tpl.data.templates ?? []);
    })();
  }, []);

  function loadTemplate(id: string) {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setTitle(tpl.titleTemplate);
    setContentMd(tpl.bodyTemplate);
  }

  async function submit() {
    setError('');
    setBusy(true);
    const publishAt = publishLocal ? new Date(publishLocal).toISOString() : null;
    const body =
      kind === 'volunteer'
        ? { kind, teamId, boardMenuid: Number(boardMenuid), title, contentMd, publishAt, eventDate, meetTime, place, capacity }
        : { kind, boardMenuid: Number(boardMenuid), title, contentMd, publishAt };
    const r = await apiPost<{ id: string }>('/api/reservations', body);
    setBusy(false);
    if (!r.ok) return setError(errorMessage(r.data.error, r.data.message as string));
    router.push('/reservations');
    router.refresh();
  }

  const canSubmit = title.trim() && boardMenuid && (kind === 'general' || teamId);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">새 예약</h1>
      <Card className="space-y-3">
        <Field label="종류">
          <Select value={kind} onChange={(e) => setKind(e.target.value as 'general' | 'volunteer')}>
            <option value="general">일반 공지</option>
            <option value="volunteer">봉사 공지(일시·장소·정원)</option>
          </Select>
        </Field>

        {templates.length > 0 ? (
          <Field label="양식 불러오기">
            <Select defaultValue="" onChange={(e) => loadTemplate(e.target.value)}>
              <option value="">선택 안 함</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {kind === 'volunteer' ? (
          <Field label="팀">
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">선택</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="게시판" hint={boards.length === 0 ? '봇 글쓰기 가능한 게시판이 없습니다(게시판 메뉴에서 추가).' : undefined}>
          <Select value={boardMenuid} onChange={(e) => setBoardMenuid(e.target.value)}>
            <option value="">선택</option>
            {boards.map((b) => (
              <option key={b.menuid} value={b.menuid}>
                {b.name} ({b.menuid})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="제목">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="본문">
          <Textarea rows={5} value={contentMd} onChange={(e) => setContentMd(e.target.value)} />
        </Field>
        <Field label="발행 시각">
          <Input type="datetime-local" value={publishLocal} onChange={(e) => setPublishLocal(e.target.value)} />
        </Field>

        {kind === 'volunteer' ? (
          <div className="space-y-3 rounded-md bg-gray-50 p-3">
            <InfoText>봉사 회차 정보(챗봇 상태 질의의 원천). 발행 전까지 채우면 됩니다.</InfoText>
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
        <Button disabled={busy || !canSubmit} onClick={submit}>
          {busy ? '저장 중…' : '예약 저장(작성중)'}
        </Button>
        <InfoText>저장 후 예약 큐에서 "완성 처리 → 발행 대기"로 넘기면 발행됩니다.</InfoText>
      </Card>
    </div>
  );
}
