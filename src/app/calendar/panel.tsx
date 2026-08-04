'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Card, Button, SecondaryButton, DangerButton, Field, Input, Textarea, Select, ErrorText } from '@/components/ui';
import { Icon } from '@/components/icon';
import { HelpButton } from '@/components/help-button';
import { monthCells, monthRange, shiftMonth, occursOn, monthOf, type MonthRef } from '@/schedules/calendar-grid';
import { kstToday } from '@/lib/kst-date';

type Visibility = 'member' | 'staff' | 'board';

interface ScheduleView {
  id: string;
  title: string;
  startDate: string;
  endDate: string | null;
  weekday: string;
  startTime: string | null;
  place: string | null;
  details: string | null;
  visibility: Visibility;
}

interface Draft {
  id: string | null;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  place: string;
  details: string;
  visibility: Visibility;
}

const VIS_LABEL: Record<Visibility, string> = { member: '부원·운영진', staff: '운영진', board: '회장단' };
const VIS_TONE: Record<Visibility, string> = {
  member: 'bg-success-100 text-success',
  staff: 'bg-blue-50 text-blue-600',
  board: 'bg-amber-50 text-amber-600',
};
const WEEKDAY_HEAD = ['일', '월', '화', '수', '목', '금', '토'];

function emptyDraft(day: string): Draft {
  return { id: null, title: '', startDate: day, endDate: '', startTime: '', place: '', details: '', visibility: 'member' };
}

function toDraft(s: ScheduleView): Draft {
  return {
    id: s.id,
    title: s.title,
    startDate: s.startDate,
    endDate: s.endDate ?? '',
    startTime: s.startTime ?? '',
    place: s.place ?? '',
    details: s.details ?? '',
    visibility: s.visibility,
  };
}

/** 'YYYY-MM-DD' → '8월 3일(월)'. 화면에서 날짜를 말할 때 쓰는 유일한 표기. */
function dayLabel(day: string, weekday?: string): string {
  const m = Number(day.slice(5, 7));
  const d = Number(day.slice(8, 10));
  return `${m}월 ${d}일${weekday ? `(${weekday})` : ''}`;
}

/**
 * @param canEdit  등록·수정·삭제 버튼 노출(회장단). 실제 차단은 서버가 한다.
 * @param manager  운영진 이상. 도움말 버튼과 "여기 적으면 부원도 본다" 안내는 **적는 사람**에게만
 *                 의미가 있다(부원에게 도움말을 노출하지 않는 것은 가이드 원칙이기도 하다).
 */
export function CalendarPanel({ canEdit, manager }: { canEdit: boolean; manager: boolean }) {
  const today = kstToday();
  const [ref, setRef] = useState<MonthRef>(monthOf(today));
  const [items, setItems] = useState<ScheduleView[]>([]);
  const [selected, setSelected] = useState<string>(today);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (m: MonthRef) => {
    const { from, to } = monthRange(m);
    setLoading(true);
    try {
      const r = await apiGet<{ schedules: ScheduleView[] }>(`/api/schedules?from=${from}&to=${to}`);
      if (r.ok) setItems(r.data.schedules ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(ref);
  }, [ref, load]);

  function go(delta: number) {
    setRef((m) => shiftMonth(m, delta));
  }

  async function save() {
    if (!draft) return;
    setError('');
    setBusy(true);
    const body = {
      title: draft.title,
      startDate: draft.startDate,
      endDate: draft.endDate || null,
      startTime: draft.startTime || null,
      place: draft.place || null,
      details: draft.details || null,
      visibility: draft.visibility,
    };
    const r = draft.id ? await apiPost(`/api/schedules/${draft.id}`, body, 'PATCH') : await apiPost('/api/schedules', body);
    setBusy(false);
    if (!r.ok) {
      // 서버가 사람 말로 준 사유(bad_input)를 그대로 보여준다 — 사용자가 고칠 수 있는 입력 오류다.
      const msg = (r.data as { message?: string }).message;
      return setError(msg ?? errorMessage(r.data.error));
    }
    // 저장한 일정이 있는 달로 옮겨 보여준다(다른 달 날짜로 바꿔 저장했을 때 사라진 것처럼 보이지 않게).
    const saved = monthOf(draft.startDate);
    setSelected(draft.startDate);
    setDraft(null);
    if (saved.year !== ref.year || saved.month !== ref.month) setRef(saved);
    else void load(ref);
  }

  async function del(id: string) {
    if (!confirm('이 일정을 지울까요? 챗봇 답변에서도 사라져요.')) return;
    const r = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
    if (r.ok) {
      setDraft(null);
      void load(ref);
    }
  }

  // ── 편집 화면 ────────────────────────────────────────────────────────
  if (draft) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <button onClick={() => setDraft(null)} className="flex items-center gap-1 text-[14px] text-ink-500">
          <Icon name="chevronRight" size={16} className="rotate-180" /> 달력으로
        </button>
        <h1 className="text-[22px] font-bold text-ink-900">{draft.id ? '일정 수정' : '새 일정'}</h1>
        <Card className="space-y-4">
          <Field label="일정 이름">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="예: 가을 정기총회"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="날짜">
              <Input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
            </Field>
            <Field label="종료 날짜" hint="MT처럼 여러 날이면 채워요. 하루면 비워 두세요.">
              <Input type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
            </Field>
            <Field label="시간" hint="아직 안 정했으면 비워 두세요">
              <Input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
            </Field>
            <Field label="장소">
              <Input value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} placeholder="예: 학생회관 3층" />
            </Field>
          </div>
          <Field label="공개 범위" hint="부원 공개면 부원이 챗봇으로 물었을 때 답해 줘요. 운영진 공개는 운영진·회장단에게만 답해요.">
            <Select value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.target.value as Visibility })}>
              <option value="member">부원·운영진 공개</option>
              <option value="staff">운영진 공개</option>
            </Select>
          </Field>
          <Field label="세부사항" hint="준비물·회비·집합 방법처럼 부원이 물어볼 만한 것을 적어요. 챗봇이 이 내용으로 답해요.">
            <Textarea
              value={draft.details}
              onChange={(e) => setDraft({ ...draft, details: e.target.value })}
              rows={8}
              placeholder={'회비 1만원, 당일 현장 수납\n준비물: 편한 옷, 개인 물병\n학생회관 앞 9시 50분 집합'}
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button disabled={busy || !draft.title.trim() || !draft.startDate} onClick={() => void save()}>
              {busy ? '저장 중…' : '저장'}
            </Button>
            {draft.id ? <DangerButton onClick={() => void del(draft.id!)}>삭제</DangerButton> : null}
          </div>
        </Card>
      </div>
    );
  }

  // ── 달력 ─────────────────────────────────────────────────────────────
  const cells = monthCells(ref);
  const onSelected = items.filter((s) => occursOn(s, selected));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          {/* 화면 이름은 메뉴와 같아야 한다 — 다르면 같은 곳을 두 이름으로 부르게 된다.
              낱개(일정 추가·새 일정)는 그대로 "일정" 이다: 담는 곳이 캘린더, 담기는 것이 일정. */}
          <h1 className="text-[22px] font-bold text-ink-900">캘린더</h1>
          {/* "챗봇이 부원 질문에 대신 답해요" 는 뺐다(2026-08-04) — 부원이 이 화면을 직접 보게 된
              이상 맞지 않는 말이다. 적는 사람에게 필요한 것은 "여기 적으면 부원이 본다"뿐이다. */}
          <p className="mt-1 text-[13px] text-ink-500">
            총회·MT·정기회의 같은 동아리 일정이에요.{manager ? ' 여기에 적으면 부원도 바로 봐요.' : ''}
          </p>
        </div>
        {manager ? <HelpButton screen="calendar" /> : null}
      </div>

      {/* 달 이동 + 추가 */}
      <div className="flex items-center gap-2">
        <SecondaryButton onClick={() => go(-1)} aria-label="이전 달">
          <Icon name="chevronRight" size={15} className="rotate-180" />
        </SecondaryButton>
        <strong className="min-w-[112px] text-center text-[16px] font-bold text-ink-900">
          {ref.year}년 {ref.month}월
        </strong>
        <SecondaryButton onClick={() => go(1)} aria-label="다음 달">
          <Icon name="chevronRight" size={15} />
        </SecondaryButton>
        <SecondaryButton
          onClick={() => {
            setRef(monthOf(today));
            setSelected(today);
          }}
        >
          오늘
        </SecondaryButton>
        <span className="flex-1" />
        {canEdit ? (
          <Button onClick={() => setDraft(emptyDraft(selected))}>
            <Icon name="plus" size={16} /> 일정 추가
          </Button>
        ) : null}
      </div>

      <Card className="space-y-2">
        <div className="grid grid-cols-7 gap-1 text-center text-[12px] font-semibold">
          {WEEKDAY_HEAD.map((w, i) => (
            <div key={w} className={i === 0 ? 'text-coral-500' : i === 6 ? 'text-blue-600' : 'text-ink-400'}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) =>
            day === null ? (
              <div key={`pad-${i}`} />
            ) : (
              <button
                key={day}
                onClick={() => setSelected(day)}
                className={`min-h-[64px] rounded-lg border p-1 text-left transition-colors ${
                  day === selected ? 'border-blue-400 bg-blue-50' : 'border-transparent hover:bg-cream-50'
                }`}
              >
                <span
                  className={`block text-[12px] font-semibold ${
                    day === today ? 'text-blue-600' : i % 7 === 0 ? 'text-coral-500' : 'text-ink-500'
                  }`}
                >
                  {Number(day.slice(8, 10))}
                  {day === today ? ' ·' : ''}
                </span>
                <span className="mt-0.5 block space-y-0.5">
                  {items
                    .filter((s) => occursOn(s, day))
                    .slice(0, 2)
                    .map((s) => (
                      <span
                        key={s.id}
                        className={`block truncate rounded px-1 py-0.5 text-[11px] font-medium ${VIS_TONE[s.visibility]}`}
                      >
                        {s.title}
                      </span>
                    ))}
                  {items.filter((s) => occursOn(s, day)).length > 2 ? (
                    <span className="block px-1 text-[11px] text-ink-400">
                      +{items.filter((s) => occursOn(s, day)).length - 2}
                    </span>
                  ) : null}
                </span>
              </button>
            )
          )}
        </div>
      </Card>

      {/* 고른 날의 일정 상세 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <strong className="text-[15px] font-semibold text-ink-900">{dayLabel(selected)}</strong>
          {canEdit ? (
            <SecondaryButton onClick={() => setDraft(emptyDraft(selected))}>
              <Icon name="plus" size={15} /> 이 날에 추가
            </SecondaryButton>
          ) : null}
        </div>
        {loading ? (
          <Card>
            <p className="text-[14px] text-ink-500">불러오는 중…</p>
          </Card>
        ) : onSelected.length === 0 ? (
          <Card>
            <p className="text-[14px] text-ink-500">이 날에는 등록된 일정이 없어요.</p>
          </Card>
        ) : (
          onSelected.map((s) => (
            <Card key={s.id} className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <strong className="block text-[15px] font-semibold text-ink-900">{s.title}</strong>
                  <p className="mt-0.5 text-[13px] text-ink-500">
                    {dayLabel(s.startDate, s.weekday)}
                    {s.endDate ? ` ~ ${dayLabel(s.endDate)}` : ''}
                    {s.startTime ? ` · ${s.startTime}` : ' · 시간 미정'}
                    {s.place ? ` · ${s.place}` : ''}
                  </p>
                </div>
                {/* 공개 범위 딱지는 **적는 사람**에게만 뜻이 있다. 부원에게는 어차피 부원 공개만
                    보이므로 모든 줄에 같은 딱지가 붙어 아무것도 구분해 주지 않는다. */}
                {manager ? (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${VIS_TONE[s.visibility]}`}>
                    {VIS_LABEL[s.visibility]}
                  </span>
                ) : null}
              </div>
              {s.details ? <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-700">{s.details}</p> : null}
              {canEdit ? (
                <div className="flex gap-2">
                  <SecondaryButton onClick={() => setDraft(toDraft(s))}>
                    <Icon name="edit" size={15} /> 수정
                  </SecondaryButton>
                  <SecondaryButton onClick={() => void del(s.id)}>
                    <Icon name="trash" size={15} /> 삭제
                  </SecondaryButton>
                </div>
              ) : null}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
