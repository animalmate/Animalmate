'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input, SecondaryButton, Select } from '@/components/ui';

interface Board { menuid: number; name: string; botCanWrite: boolean }
interface Team { id: string; name: string }
interface Template { id: string; name: string }
interface Preview {
  created: { eventDate: string; publishAt: string }[];
  skipped: { year: number; month: number; reason: string }[];
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function BatchForm() {
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [f, setF] = useState({
    teamId: '', boardMenuid: '', templateId: '', monthWeek: '1', weekday: '0',
    meetTime: '14:00', publishTime: '20:00', noticeLeadDays: '7',
    startYear: '2026', startMonth: '3', endYear: '2026', endMonth: '6',
  });
  const [preview, setPreview] = useState<Preview | null>(null);
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

  const set = (k: string) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function run(dryRun: boolean) {
    setError('');
    setBusy(true);
    const r = await apiPost<Preview>('/api/reservations/batch', {
      ...f, weekday: Number(f.weekday), boardMenuid: Number(f.boardMenuid),
      templateId: f.templateId || null, noticeLeadDays: Number(f.noticeLeadDays),
      startYear: Number(f.startYear), startMonth: Number(f.startMonth),
      endYear: Number(f.endYear), endMonth: Number(f.endMonth), dryRun,
    });
    setBusy(false);
    if (!r.ok) return setError(errorMessage(r.data.error, r.data.message as string));
    if (dryRun) setPreview(r.data);
    else { router.push('/reservations'); router.refresh(); }
  }

  const canRun = f.teamId && f.boardMenuid;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">일괄 생성</h1>
      <Card className="space-y-3">
        <Field label="팀">
          <Select value={f.teamId} onChange={set('teamId')}>
            <option value="">선택</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="게시판">
          <Select value={f.boardMenuid} onChange={set('boardMenuid')}>
            <option value="">선택</option>
            {boards.map((b) => <option key={b.menuid} value={b.menuid}>{b.name} ({b.menuid})</option>)}
          </Select>
        </Field>
        <Field label="양식(선택)">
          <Select value={f.templateId} onChange={set('templateId')}>
            <option value="">없음</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="몇째 주">
            <Select value={f.monthWeek} onChange={set('monthWeek')}>
              {['1', '2', '3', '4', 'last'].map((w) => <option key={w} value={w}>{w === 'last' ? '마지막' : `${w}번째`}</option>)}
            </Select>
          </Field>
          <Field label="요일">
            <Select value={f.weekday} onChange={set('weekday')}>
              {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </Select>
          </Field>
          <Field label="봉사 집합시간"><Input type="time" value={f.meetTime} onChange={set('meetTime')} /></Field>
          <Field label="발행 시각"><Input type="time" value={f.publishTime} onChange={set('publishTime')} /></Field>
          <Field label="발행 리드(일)" hint="봉사일 − N일에 발행"><Input inputMode="numeric" value={f.noticeLeadDays} onChange={set('noticeLeadDays')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="시작(년)"><Input inputMode="numeric" value={f.startYear} onChange={set('startYear')} /></Field>
          <Field label="시작(월)"><Input inputMode="numeric" value={f.startMonth} onChange={set('startMonth')} /></Field>
          <Field label="끝(년)"><Input inputMode="numeric" value={f.endYear} onChange={set('endYear')} /></Field>
          <Field label="끝(월)"><Input inputMode="numeric" value={f.endMonth} onChange={set('endMonth')} /></Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <SecondaryButton disabled={busy || !canRun} onClick={() => run(true)}>미리보기</SecondaryButton>
          <Button disabled={busy || !canRun || !preview} onClick={() => run(false)}>확정 생성</Button>
        </div>
      </Card>

      {preview ? (
        <Card className="space-y-2">
          <div className="font-medium">생성 예정 {preview.created.length}건</div>
          <ul className="text-sm text-gray-700">
            {preview.created.map((c, i) => (
              <li key={i}>봉사 {c.eventDate} · 발행 {new Date(c.publishAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}</li>
            ))}
          </ul>
          {preview.skipped.length > 0 ? (
            <InfoText>
              건너뜀 {preview.skipped.length}건(발행일이 이미 지났거나 해당 요일 없음):{' '}
              {preview.skipped.map((s) => `${s.year}-${s.month}`).join(', ')}
            </InfoText>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
