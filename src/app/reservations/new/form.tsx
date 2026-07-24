'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input, SecondaryButton, Select, Textarea } from '@/components/ui';

interface Board { menuid: number; name: string; botCanWrite: boolean }
interface Team { id: string; name: string }
interface Template {
  id: string;
  name: string;
  titleTemplate: string;
  bodyTemplate: string;
  defaultPlace: string | null;
  defaultCapacity: number | null;
}

interface Row {
  publishLocal: string; // 발행 시각 datetime-local
  eventDate: string; // 봉사 일자
  meetTime: string; // 집합 시간
}
const emptyRow = (): Row => ({ publishLocal: '', eventDate: '', meetTime: '' });

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
  const [templateId, setTemplateId] = useState(''); // 기본 장소·정원 승계용
  const [rows, setRows] = useState<Row[]>([emptyRow()]);

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

  const selectedTemplate = templates.find((x) => x.id === templateId) ?? null;

  function loadTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setTitle(tpl.titleTemplate);
    setContentMd(tpl.bodyTemplate);
  }

  const setRow = (i: number, k: keyof Row, v: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (i: number) => setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));

  async function submit() {
    setError('');
    // 발행 시각이 하나라도 있는 행만 유효로 취급.
    const occurrences = rows
      .filter((r) => r.publishLocal || (kind === 'volunteer' && r.eventDate))
      .map((r) => ({
        publishAt: r.publishLocal ? new Date(r.publishLocal).toISOString() : null,
        eventDate: kind === 'volunteer' ? r.eventDate || null : null,
        meetTime: kind === 'volunteer' ? r.meetTime || null : null,
      }));
    if (occurrences.length === 0) return setError('발행 시각(또는 봉사 일자)을 최소 1개 입력하세요.');
    setBusy(true);
    const r = await apiPost<{ ids: string[] }>('/api/reservations', {
      kind,
      teamId: kind === 'volunteer' ? teamId : undefined,
      boardMenuid: Number(boardMenuid),
      title,
      contentMd,
      templateId: templateId || null,
      occurrences,
    });
    setBusy(false);
    if (!r.ok) return setError(errorMessage(r.data.error, r.data.message as string));
    router.push('/reservations');
    router.refresh();
  }

  const canSubmit = title.trim() && boardMenuid && (kind === 'general' || teamId);

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-ink-900">새 예약</h1>
      <Card className="space-y-3">
        <Field label="종류">
          <Select value={kind} onChange={(e) => setKind(e.target.value as 'general' | 'volunteer')}>
            <option value="general">일반 공지</option>
            <option value="volunteer">봉사 공지(일시·장소·정원)</option>
          </Select>
        </Field>

        {templates.length > 0 ? (
          <Field
            label="양식 불러오기"
            hint={
              selectedTemplate && (selectedTemplate.defaultPlace || selectedTemplate.defaultCapacity != null)
                ? `기본 ${selectedTemplate.defaultPlace ?? '장소 미지정'}${
                    selectedTemplate.defaultCapacity != null ? ` · 정원 ${selectedTemplate.defaultCapacity}` : ''
                  } 이 각 예약에 채워집니다.`
                : undefined
            }
          >
            <Select value={templateId} onChange={(e) => loadTemplate(e.target.value)}>
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
          <Textarea rows={4} value={contentMd} onChange={(e) => setContentMd(e.target.value)} />
        </Field>

        <div className="space-y-2">
          <div className="text-sm font-medium text-ink-700">
            발행 일정 (여러 개 추가하면 각각 별도 예약으로 생성됩니다)
          </div>
          {rows.map((r, i) => (
            <div key={i} className="space-y-2 rounded-md border border-ink-200 p-2">
              {kind === 'volunteer' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="봉사 일자">
                    <Input type="date" value={r.eventDate} onChange={(e) => setRow(i, 'eventDate', e.target.value)} />
                  </Field>
                  <Field label="집합 시간">
                    <Input type="time" value={r.meetTime} onChange={(e) => setRow(i, 'meetTime', e.target.value)} />
                  </Field>
                </div>
              ) : null}
              <Field label="발행 시각">
                <Input type="datetime-local" value={r.publishLocal} onChange={(e) => setRow(i, 'publishLocal', e.target.value)} />
              </Field>
              {rows.length > 1 ? (
                <button className="text-xs text-coral-600 underline" onClick={() => removeRow(i)}>
                  이 일정 삭제
                </button>
              ) : null}
            </div>
          ))}
          <SecondaryButton onClick={addRow}>+ 일정 추가</SecondaryButton>
          {kind === 'volunteer' ? (
            <InfoText>
              장소·정원은 양식의 기본값으로 채워집니다. 회차별로 다르면 생성 후 각 예약을 수정하세요(발행 직전 본문에
              반영).
            </InfoText>
          ) : null}
        </div>

        <ErrorText>{error}</ErrorText>
        <Button disabled={busy || !canSubmit} onClick={submit}>
          {busy ? '생성 중…' : '예약 생성(작성중)'}
        </Button>
        <InfoText>생성 후 예약 큐에서 각 건을 개별 수정·완성 처리하세요.</InfoText>
      </Card>
    </div>
  );
}
