'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { Card, ErrorText, InfoText, TableCards, RowCard, CardField, CardBlock, ToolbarSelect, ToolbarButton, SecondaryButton } from '@/components/ui';
import { AUDIT_GROUPS, describeAction, parseAction } from '@/auth/audit-view';

interface Row {
  id: string;
  at: string;
  action: string;
  targetTable: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  actorUserId: string | null;
  actorName: string | null;
}
interface Page {
  rows: Row[];
  total: number;
  nextCursor: string | null;
  actors?: { id: string; name: string }[];
}

const DAY_OPTIONS = [
  { value: '7', label: '최근 7일' },
  { value: '30', label: '최근 30일' },
  { value: '90', label: '최근 90일' },
  { value: '0', label: '전체 기간' },
];

/** 날짜는 초까지 보여 준다 — 일괄 처리는 같은 분 안에서 수십 건이 난다. */
function when(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 이전값→새값을 사람이 읽게 옮긴다. 통째로 JSON 을 뿌리면 중괄호 사이에서 무엇이 바뀌었는지
 * 못 찾는다. 값이 길면 잘라 낸다 — 지원자 자기소개서가 통째로 들어 있는 기록도 있을 수 있고,
 * 이 화면은 그걸 읽는 곳이 아니다.
 */
function pairs(v: unknown): { k: string; v: string }[] {
  if (v === null || v === undefined) return [];
  if (typeof v !== 'object' || Array.isArray(v)) return [{ k: '값', v: String(v).slice(0, 300) }];
  return Object.entries(v as Record<string, unknown>).map(([k, val]) => {
    const s = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
    return { k, v: s.length > 300 ? `${s.slice(0, 300)}…` : s };
  });
}

function Marks({ action }: { action: string }) {
  const { high, override } = parseAction(action);
  if (!high && !override) return null;
  return (
    <span className="ml-1.5 inline-flex gap-1 align-middle">
      {high ? (
        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">주의</span>
      ) : null}
      {override ? (
        <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold text-violet-800">권한 우선</span>
      ) : null}
    </span>
  );
}

function Changes({ row }: { row: Row }) {
  const before = pairs(row.before);
  const after = pairs(row.after);
  if (before.length === 0 && after.length === 0) return <span className="text-ink-500">—</span>;
  return (
    <div className="space-y-1 text-[12px]">
      {before.length > 0 ? (
        <div className="text-ink-500">
          <span className="font-semibold">이전</span> {before.map((p) => `${p.k}=${p.v}`).join(' · ')}
        </div>
      ) : null}
      {after.length > 0 ? (
        <div className="text-ink-900">
          <span className="font-semibold text-ink-500">새값</span> {after.map((p) => `${p.k}=${p.v}`).join(' · ')}
        </div>
      ) : null}
    </div>
  );
}

export function AuditPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [actors, setActors] = useState<{ id: string; name: string }[]>([]);
  const [group, setGroup] = useState('');
  const [actor, setActor] = useState('');
  const [days, setDays] = useState('30');
  const [high, setHigh] = useState(false);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const query = useCallback(
    (next: string | null) => {
      const p = new URLSearchParams();
      if (group) p.set('group', group);
      if (actor) p.set('actor', actor);
      if (days !== '0') p.set('days', days);
      if (high) p.set('high', '1');
      if (auto) p.set('auto', '1');
      if (next) p.set('cursor', next);
      return `/api/admin/audit?${p.toString()}`;
    },
    [group, actor, days, high, auto]
  );

  const load = useCallback(
    async (next: string | null) => {
      setBusy(true);
      setError('');
      const r = await apiGet<Page>(query(next));
      setBusy(false);
      if (!r.ok) return setError('기록을 불러오지 못했어요.');
      setRows((prev) => (next ? [...prev, ...r.data.rows] : r.data.rows));
      setTotal(r.data.total);
      setCursor(r.data.nextCursor);
      if (r.data.actors) setActors(r.data.actors);
    },
    [query]
  );

  // 필터가 바뀌면 처음부터 다시 읽는다(이어보던 커서는 버린다 — 조건이 다른 목록이다).
  useEffect(() => {
    void load(null);
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-[22px] font-bold text-ink-900">기록</h1>
        <p className="text-[13px] text-ink-500">누가·무엇을·언제 바꿨는지 남은 기록이에요. 읽기만 할 수 있어요.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToolbarSelect label="분류" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">전체</option>
          {AUDIT_GROUPS.filter((g) => auto || (g.key !== 'cron' && g.key !== 'batch')).map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </ToolbarSelect>
        <ToolbarSelect label="한 사람" value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="">전체</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </ToolbarSelect>
        <ToolbarSelect label="기간" value={days} onChange={(e) => setDays(e.target.value)}>
          {DAY_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </ToolbarSelect>
        <ToolbarButton
          type="button"
          onClick={() => setHigh((v) => !v)}
          className={high ? 'border-amber-500 bg-amber-50 text-amber-900' : ''}
        >
          주의 표시만
        </ToolbarButton>
        <ToolbarButton
          type="button"
          onClick={() => {
            // 자동 작업을 끄면서 분류가 cron 이면 목록이 통째로 빈다 — 함께 되돌린다.
            setAuto((v) => {
              if (v && (group === 'cron' || group === 'batch')) setGroup('');
              return !v;
            });
          }}
          className={auto ? 'border-blue-500 bg-blue-50 text-blue-900' : ''}
        >
          자동 작업 포함
        </ToolbarButton>
      </div>

      {/* 기본이 "사람이 한 일"이라는 사실을 화면에 적어 둔다 — 안 적으면 크론 기록이 사라진 줄 안다. */}
      <InfoText>
        {auto
          ? '크론이 남긴 기록까지 함께 보고 있어요. 대부분이 매분 도는 발행 워커 요약이에요.'
          : '사람이 한 일만 보여 주고 있어요. 크론이 남긴 것은 `자동 작업 포함`을 눌러서 봐요.'}
      </InfoText>
      <ErrorText>{error}</ErrorText>

      <p className="text-[13px] text-ink-500">
        조건에 맞는 기록 <strong className="text-ink-900">{total.toLocaleString()}</strong>건 · 아래에 {rows.length}건 보임
      </p>

      <TableCards
        table={
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-cream-200 bg-cream-50 text-left text-ink-500">
                <th className="whitespace-nowrap px-3 py-2 font-semibold">언제</th>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">누가</th>
                <th className="px-3 py-2 font-semibold">무엇을</th>
                <th className="px-3 py-2 font-semibold">바뀐 값</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-cream-100 align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-500">{when(r.at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-900">
                    {r.actorUserId === null ? (
                      <span className="text-ink-500">자동 작업</span>
                    ) : (
                      (r.actorName ?? '탈퇴한 회원')
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-900">
                    {describeAction(r.action)}
                    <Marks action={r.action} />
                    <div className="text-[11px] text-ink-500">{r.targetTable}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Changes row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
        cards={rows.map((r) => (
          <RowCard
            key={r.id}
            title={
              <>
                {describeAction(r.action)}
                <Marks action={r.action} />
              </>
            }
          >
            <CardField label="언제">{when(r.at)}</CardField>
            <CardField label="누가">
              {r.actorUserId === null ? '자동 작업' : (r.actorName ?? '탈퇴한 회원')}
            </CardField>
            <CardField label="대상">{r.targetTable}</CardField>
            <CardBlock label="바뀐 값">
              <Changes row={r} />
            </CardBlock>
          </RowCard>
        ))}
      />

      {rows.length === 0 && !busy ? (
        <Card>
          <p className="text-[13px] text-ink-500">이 조건에 맞는 기록이 없어요.</p>
        </Card>
      ) : null}

      {cursor ? (
        <div className="flex justify-center">
          <SecondaryButton type="button" disabled={busy} onClick={() => void load(cursor)}>
            {busy ? '불러오는 중…' : '더 보기'}
          </SecondaryButton>
        </div>
      ) : null}
    </div>
  );
}
