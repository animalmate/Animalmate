'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input, SecondaryButton, Select } from '@/components/ui';
import { AutoGrowTextarea } from '@/components/auto-grow-textarea';
import { Modal } from '@/components/modal';
import { TimeSelect } from '@/components/time-select';
import { renderTemplate, placeholderKeys } from '@/publishing/template-render';
import { dateVars, kstDateStr } from '@/publishing/placeholders';
import { capacityText } from '@/publishing/placeholder-catalog';

interface Board { menuid: number; name: string; botCanWrite: boolean; isActive: boolean }
interface Team { id: string; name: string; leaders: string } // leaders = 공지에 들어갈 {{팀장단}} 문구
interface Template {
  id: string;
  name: string;
  titleTemplate: string;
  bodyTemplate: string;
  defaultPlace: string | null;
  defaultCapacity: number | null;
  defaultMeetTime: string | null; // 'HH:MM'
  defaultPublishTime: string | null; // 'HH:MM'
}

interface Row {
  // 발행 시각은 날짜·시각을 따로 받는다(datetime-local 한 칸은 작아서 고르기 불편).
  publishDate: string;
  publishTime: string;
  eventDate: string; // 봉사 일자
  meetTime: string; // 집합 시간
  capacity: string; // 회차별 정원(비우면 양식의 기본 정원)
}
/** 양식에서 가져오는 기본값(집합 시간·업로드 시각·정원)만 미리 채운 빈 일정. 날짜 두 개만 고르면 된다. */
const emptyRow = (d: Partial<Row> = {}): Row => ({
  publishDate: '',
  publishTime: '',
  eventDate: '',
  meetTime: '',
  capacity: '',
  ...d,
});
/** 두 칸으로 나눠 받은 발행 시각 → datetime-local 문자열. 둘 중 하나라도 비면 빈 값. */
const publishLocalOf = (r: Row): string => (r.publishDate && r.publishTime ? `${r.publishDate}T${r.publishTime}` : '');
// 게시판 목록은 menuid 순으로 오지만, 고를 때는 이름순이 찾기 쉽다(한글 기준).
const byName = (a: Board, b: Board) => a.name.localeCompare(b.name, 'ko');

/** 미리보기 버튼 — 분홍(coral) 그라디언트 얇은 테두리. 높이는 입력칸(h-control)에 맞춘다. */
function PreviewButton({ onClick }: { onClick: () => void }) {
  return (
    <span className="inline-block h-control shrink-0 rounded-xl bg-gradient-to-r from-coral-300 via-coral-500 to-coral-300 p-[1.5px]">
      <button
        type="button"
        onClick={onClick}
        className="flex h-full items-center rounded-[10.5px] bg-white px-3.5 text-[13px] font-semibold text-coral-700 transition-colors hover:bg-coral-50"
      >
        미리보기
      </button>
    </span>
  );
}

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
          아직 비어 있음: {missing.map((k) => `{{${k}}}`).join(', ')} — 채우지 않으면 이 예약은 업로드되지 않습니다.
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
      // 서버 게이트(getWritableBoard)와 같은 조건 — 목록에 있는데 저장에서 거부되는 일이 없게.
      if (b.ok) setBoards((b.data.boards ?? []).filter((x) => x.botCanWrite && x.isActive).sort(byName));
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
    const publishLocal = publishLocalOf(r);
    const vars: Record<string, string> = {};
    if (kind === 'volunteer') {
      Object.assign(vars, dateVars(r.eventDate));
      if (r.meetTime) vars['집합시간'] = r.meetTime;
      if (selectedTeam?.leaders) vars['팀장단'] = selectedTeam.leaders;
      const cap = r.capacity || (selectedTemplate?.defaultCapacity != null ? String(selectedTemplate.defaultCapacity) : '');
      if (cap) vars['정원'] = capacityText(cap);
      if (selectedTemplate?.defaultPlace) vars['장소'] = selectedTemplate.defaultPlace; // 예전 양식 호환
    } else if (publishLocal) {
      Object.assign(vars, dateVars(kstDateStr(new Date(publishLocal))));
    }
    const t = renderTemplate(title, vars);
    const b = renderTemplate(contentMd, vars);
    // 언제 어디에 올라가는지도 함께 확인할 수 있게.
    const when = publishLocal
      ? new Date(publishLocal).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
      : '업로드 시각 미정';
    const board = boards.find((x) => String(x.menuid) === boardMenuid)?.name;
    return { title: t, body: b, missing: placeholderKeys(t, b), meta: board ? `${when} · ${board}` : when };
  }

  /** 양식이 정해 둔 기본값(집합 시간·업로드 시각·정원). 양식이 없으면 빈 값. */
  function defaultsOf(tpl: Template | null): Partial<Row> {
    if (!tpl) return {};
    return {
      meetTime: tpl.defaultMeetTime ?? '',
      publishTime: tpl.defaultPublishTime ?? '',
      capacity: tpl.defaultCapacity != null ? String(tpl.defaultCapacity) : '',
    };
  }

  function loadTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setTitle(tpl.titleTemplate);
    setContentMd(tpl.bodyTemplate);
    // 아직 비어 있는 칸만 채운다(직접 입력한 값은 보존).
    const d = defaultsOf(tpl);
    setRows((rs) =>
      rs.map((r) => ({
        ...r,
        meetTime: r.meetTime || (d.meetTime ?? ''),
        publishTime: r.publishTime || (d.publishTime ?? ''),
        capacity: r.capacity || (d.capacity ?? ''),
      }))
    );
  }

  const setRow = (i: number, k: keyof Row, v: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow(defaultsOf(selectedTemplate))]);
  const removeRow = (i: number) => setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));

  async function submit() {
    setError('');
    // 발행 시각이 하나라도 있는 행만 유효로 취급.
    const occurrences = rows
      .filter((r) => publishLocalOf(r) || (kind === 'volunteer' && r.eventDate))
      .map((r) => ({
        publishAt: publishLocalOf(r) ? new Date(publishLocalOf(r)).toISOString() : null,
        eventDate: kind === 'volunteer' ? r.eventDate || null : null,
        meetTime: kind === 'volunteer' ? r.meetTime || null : null,
        capacity: kind === 'volunteer' ? r.capacity || null : null,
      }));
    if (occurrences.length === 0) return setError('업로드 시각(또는 봉사 일자)을 최소 1개 입력하세요.');
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
            <option value="volunteer">봉사 공지</option>
          </Select>
        </Field>

        {templates.length > 0 ? (
          <Field label="양식 불러오기">
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
            업로드 일정 (여러 개 추가하면 각각 별도 예약으로 생성됩니다)
          </div>
          {selectedTemplate ? (
            <p className="text-[13px] text-ink-500">
              집합 시간·업로드 시각·정원은 "{selectedTemplate.name}" 양식 값으로 채워집니다. 이 회차만 다르면 고치세요.
            </p>
          ) : null}
          {rows.map((r, i) => (
            <div key={i} className="space-y-2 rounded-md border border-ink-200 p-2">
              {/* 실제로 고르는 값 — 날짜 둘. 나머지는 양식에서 채워진다. */}
              <div className="grid grid-cols-2 gap-2">
                {kind === 'volunteer' ? (
                  <Field label="봉사 일자">
                    <Input type="date" value={r.eventDate} onChange={(e) => setRow(i, 'eventDate', e.target.value)} />
                  </Field>
                ) : null}
                <Field label="업로드 날짜">
                  <Input type="date" value={r.publishDate} onChange={(e) => setRow(i, 'publishDate', e.target.value)} />
                </Field>
              </div>
              {/* 양식에서 채워진 값 — 이 회차만 다르면 고치면 된다. */}
              <div className="flex flex-wrap items-end gap-2">
                {kind === 'volunteer' ? (
                  <div className="w-32">
                    <Field label="집합 시간">
                      <TimeSelect value={r.meetTime} onChange={(v) => setRow(i, 'meetTime', v)} />
                    </Field>
                  </div>
                ) : null}
                <div className="w-32">
                  <Field label="업로드 시각">
                    <TimeSelect value={r.publishTime} onChange={(v) => setRow(i, 'publishTime', v)} />
                  </Field>
                </div>
                {kind === 'volunteer' ? (
                  <div className="w-20">
                    <Field label="정원">
                      <Input
                        inputMode="numeric"
                        value={r.capacity}
                        onChange={(e) => setRow(i, 'capacity', e.target.value.replace(/\D/g, ''))}
                        placeholder="20"
                      />
                    </Field>
                  </div>
                ) : null}
                <PreviewButton onClick={() => setOpenPreview(i)} />
              </div>
              {rows.length > 1 ? (
                <button className="text-xs text-coral-600 underline" onClick={() => removeRow(i)}>
                  이 일정 삭제
                </button>
              ) : null}
            </div>
          ))}
          <SecondaryButton onClick={addRow}>+ 일정 추가</SecondaryButton>
        </div>

        <ErrorText>{error}</ErrorText>
        <Button disabled={busy || !canSubmit} onClick={submit}>
          {busy ? '생성 중…' : '예약 생성'}
        </Button>
        <InfoText>생성 후 실제 업로드 전에 수정 가능</InfoText>
      </Card>

      {openPreview !== null && rows[openPreview] ? (
        <Modal title={`${openPreview + 1}번째 일정 미리보기`} onClose={() => setOpenPreview(null)}>
          <OccurrencePreview {...previewOf(rows[openPreview])} />
        </Modal>
      ) : null}
    </div>
  );
}
