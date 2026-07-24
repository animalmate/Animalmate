'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input, SecondaryButton, Select } from '@/components/ui';
import { AutoGrowTextarea } from '@/components/auto-grow-textarea';
import { Modal } from '@/components/modal';
import { renderTemplate, placeholderKeys } from '@/publishing/template-render';
import { dateVars, kstDateStr } from '@/publishing/placeholders';

interface Board { menuid: number; name: string; botCanWrite: boolean }
interface Team { id: string; name: string; leaders: string } // leaders = 공지에 들어갈 {{팀장단}} 문구
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
  capacity: string; // 회차별 정원(비우면 양식의 기본 정원)
}
const emptyRow = (capacity = ''): Row => ({ publishLocal: '', eventDate: '', meetTime: '', capacity });
// 게시판 목록은 menuid 순으로 오지만, 고를 때는 이름순이 찾기 쉽다(한글 기준).
const byName = (a: Board, b: Board) => a.name.localeCompare(b.name, 'ko');

/** 한 일정이 실제로 카페에 올라갈 모습(제목 + 본문). 채워지지 않은 값이 있으면 함께 알려준다. */
function OccurrencePreview({
  title,
  body,
  missing,
  meta,
}: {
  title: string;
  body: string;
  missing: string[];
  meta: string;
}) {
  return (
    <div className="space-y-3">
      <div className="text-[13px] text-ink-500">{meta}</div>
      <div className="space-y-2 rounded-xl bg-cream-100 p-3">
        <div className="font-medium text-ink-900">{title || '(제목 없음)'}</div>
        <pre className="whitespace-pre-wrap font-sans text-sm text-ink-700">{body || '(본문 없음)'}</pre>
      </div>
      {missing.length > 0 ? (
        <div className="text-[13px] text-warning-700">
          아직 비어 있음: {missing.map((k) => `{{${k}}}`).join(', ')} — 채우지 않으면 이 예약은 발행되지 않습니다.
        </div>
      ) : (
        <div className="text-[13px] text-ink-500">이대로 카페에 올라갑니다.</div>
      )}
    </div>
  );
}

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

  const [openPreview, setOpenPreview] = useState<number | null>(null); // 미리보기를 펼친 일정 번호
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [b, t, tpl] = await Promise.all([
        apiGet<{ boards: Board[] }>('/api/boards'),
        apiGet<{ teams: Team[] }>('/api/teams'),
        apiGet<{ templates: Template[] }>('/api/templates'),
      ]);
      if (b.ok) setBoards((b.data.boards ?? []).filter((x) => x.botCanWrite).sort(byName));
      if (t.ok) setTeams(t.data.teams ?? []);
      if (tpl.ok) setTemplates(tpl.data.templates ?? []);
    })();
  }, []);

  const selectedTemplate = templates.find((x) => x.id === templateId) ?? null;
  const selectedTeam = teams.find((x) => x.id === teamId) ?? null;

  /**
   * 이 일정이 카페에 올라갈 실제 모습.
   * 서버가 생성 시(날짜·집합시간·팀장단) + 발행 직전(정원)에 나눠 치환하는 값을 여기서 한 번에 적용한다.
   * 최종 결과는 같으므로 이 미리보기가 곧 실제 게시물이다.
   */
  function previewOf(r: Row): { title: string; body: string; missing: string[]; meta: string } {
    const vars: Record<string, string> = {};
    if (kind === 'volunteer') {
      Object.assign(vars, dateVars(r.eventDate));
      if (r.meetTime) vars['집합시간'] = r.meetTime;
      if (selectedTeam?.leaders) vars['팀장단'] = selectedTeam.leaders;
      const cap = r.capacity || (selectedTemplate?.defaultCapacity != null ? String(selectedTemplate.defaultCapacity) : '');
      if (cap) vars['정원'] = cap;
      if (selectedTemplate?.defaultPlace) vars['장소'] = selectedTemplate.defaultPlace; // 예전 양식 호환
    } else if (r.publishLocal) {
      Object.assign(vars, dateVars(kstDateStr(new Date(r.publishLocal))));
    }
    const t = renderTemplate(title, vars);
    const b = renderTemplate(contentMd, vars);
    // 언제 어디에 올라가는지도 함께 확인할 수 있게.
    const when = r.publishLocal
      ? new Date(r.publishLocal).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
      : '발행 시각 미정';
    const board = boards.find((x) => String(x.menuid) === boardMenuid)?.name;
    return { title: t, body: b, missing: placeholderKeys(t, b), meta: board ? `${when} · ${board}` : when };
  }

  function loadTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setTitle(tpl.titleTemplate);
    setContentMd(tpl.bodyTemplate);
    // 아직 손대지 않은 일정 행에만 기본 정원을 채운다(직접 입력한 값은 보존).
    if (tpl.defaultCapacity != null) {
      const cap = String(tpl.defaultCapacity);
      setRows((rs) => rs.map((r) => (r.capacity ? r : { ...r, capacity: cap })));
    }
  }

  const setRow = (i: number, k: keyof Row, v: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRow = () =>
    setRows((rs) => [...rs, emptyRow(selectedTemplate?.defaultCapacity != null ? String(selectedTemplate.defaultCapacity) : '')]);
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
        capacity: kind === 'volunteer' ? r.capacity || null : null,
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
              selectedTemplate?.defaultPlace || selectedTemplate?.defaultCapacity != null
                ? `${selectedTemplate.defaultPlace ?? ''}${
                    selectedTemplate.defaultCapacity != null ? ` · 기본 정원 ${selectedTemplate.defaultCapacity}명` : ''
                  }`.replace(/^ · /, '')
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
                {b.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="제목">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="본문">
          <AutoGrowTextarea value={contentMd} onChange={(e) => setContentMd(e.target.value)} />
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
              <div className="grid grid-cols-2 items-end gap-2">
                {kind === 'volunteer' ? (
                  <Field label="정원" hint={selectedTemplate?.defaultCapacity != null ? '비우면 양식 기본값' : undefined}>
                    <Input
                      inputMode="numeric"
                      value={r.capacity}
                      onChange={(e) => setRow(i, 'capacity', e.target.value.replace(/\D/g, ''))}
                      placeholder="20"
                    />
                  </Field>
                ) : (
                  <div />
                )}
                <SecondaryButton type="button" onClick={() => setOpenPreview(i)}>
                  미리보기
                </SecondaryButton>
              </div>
              {rows.length > 1 ? (
                <button className="text-xs text-coral-600 underline" onClick={() => removeRow(i)}>
                  이 일정 삭제
                </button>
              ) : null}
            </div>
          ))}
          <SecondaryButton onClick={addRow}>+ 일정 추가</SecondaryButton>
          {kind === 'volunteer' ? (
            <InfoText>정원을 비우면 양식의 기본 정원이 들어갑니다. 만든 뒤 각 예약에서 언제든 바꿀 수 있어요.</InfoText>
          ) : null}
        </div>

        <ErrorText>{error}</ErrorText>
        <Button disabled={busy || !canSubmit} onClick={submit}>
          {busy ? '생성 중…' : '예약 생성(작성중)'}
        </Button>
        <InfoText>생성 후 예약 큐에서 각 건을 개별 수정·완성 처리하세요.</InfoText>
      </Card>

      {openPreview !== null && rows[openPreview] ? (
        <Modal title={`${openPreview + 1}번째 일정 미리보기`} onClose={() => setOpenPreview(null)}>
          <OccurrencePreview {...previewOf(rows[openPreview])} />
        </Modal>
      ) : null}
    </div>
  );
}
