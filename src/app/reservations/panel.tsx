'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, InfoText, SecondaryButton, Select, StatusBadge } from '@/components/ui';
import { HelpButton } from '@/components/help-button';
import { Modal } from '@/components/modal';
import { PreviewButton, ReservationPreview } from '@/components/reservation-preview';
import { renderTemplate, placeholderKeys } from '@/publishing/template-render';
import { shortenValue } from '@/publishing/placeholder-catalog';

interface Reservation {
  id: string;
  title: string;
  status: string;
  boardName: string | null;
  publishAt: string | null;
  cafeArticleUrl: string | null;
  failReason: string | null;
  event: { eventDate: string | null; place: string | null; capacity: number | null } | null;
  missing: string[];
  placeholders: { key: string; value: string | null }[];
}

function fmt(iso: string | null): string {
  if (!iso) return '업로드 시각 미정';
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

interface Team {
  id: string;
  name: string;
}

/** GET /api/reservations/[id] — 미리보기에 필요한 본문과 서버 치환값. 권한은 그 라우트가 검사한다. */
interface Detail {
  post: { title: string; contentMd: string };
  vars: Record<string, string>;
}

/** 미리보기 모달 상태. 목록에는 본문이 없어 열 때 한 건만 받아온다(큐가 길어도 payload 가 늘지 않는다). */
interface PreviewState {
  row: Reservation;
  detail: Detail | null;
  error: string;
}

/**
 * 필터 값 → 조회 쿼리. 서버는 kind/teamId 를 **권한 스코프와 AND** 로 겹치므로,
 * 여기서 남의 팀 id 를 넣어도 결과가 빌 뿐 새로 보이는 것은 없다.
 *   ''            전체
 *   'general'     일반 공지(회차 없는 건)
 *   'volunteer'   봉사 공지 전체
 *   'team:<id>'   그 팀의 봉사 공지
 */
function filterQuery(filter: string): string {
  if (filter === 'general') return '?kind=general';
  if (filter === 'volunteer') return '?kind=volunteer';
  if (filter.startsWith('team:')) return `?kind=volunteer&teamId=${encodeURIComponent(filter.slice(5))}`;
  return '';
}

export function ReservationsPanel() {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiGet<{ reservations: Reservation[] }>(`/api/reservations${filterQuery(filter)}`);
    setLoading(false);
    if (r.ok) setRows(r.data.reservations ?? []);
    else setError(errorMessage(r.data.error));
  }, [filter]);

  // 필터가 바뀌면 다시 조회한다. 목록을 클라이언트에서 거르지 않는 이유는, 서버가 이미
  // 권한 스코프를 걸고 있어서 같은 자리에서 필터까지 처리하는 편이 규칙이 한 곳에 모이기 때문이다.
  useEffect(() => {
    void load();
  }, [load]);

  // 팀 목록은 한 번만. 비회장단에게는 서버가 소속 팀만 돌려준다(/api/teams).
  useEffect(() => {
    void (async () => {
      const r = await apiGet<{ teams: Team[] }>('/api/teams');
      setTeamsLoading(false);
      if (r.ok) setTeams(r.data.teams ?? []);
    })();
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

  // 미리보기: 목록에는 본문이 없으므로 열 때 그 한 건만 받아온다.
  async function openPreview(row: Reservation) {
    setPreview({ row, detail: null, error: '' });
    const r = await apiGet<Detail>(`/api/reservations/${row.id}`);
    // 그 사이 사용자가 닫았거나 다른 건을 열었으면 늦게 온 응답을 버린다.
    setPreview((cur) =>
      cur && cur.row.id === row.id
        ? r.ok
          ? { ...cur, detail: r.data }
          : { ...cur, error: errorMessage(r.data.error) }
        : cur
    );
  }

  // 취소는 되돌릴 수 없는데 '수정' 바로 옆 버튼이라 잘못 누르기 쉽다 —
  // 게시판 비활성화·양식 삭제·문서 삭제와 같은 기준으로 한 번 더 묻는다.
  function cancel(r: Reservation) {
    const when = r.publishAt ? fmt(r.publishAt) : '업로드 시각 미정';
    if (typeof window !== 'undefined' && !window.confirm(`"${r.title}" 예약을 취소할까요?\n(${when} 업로드 예정 — 취소하면 되돌릴 수 없습니다)`)) return;
    void act(r.id, 'cancel');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-[22px] font-bold text-ink-900">예약 큐</h1>
        <div className="flex items-center gap-2">
          <HelpButton screen="reservations" />
          <a href="/reservations/new">
            <Button>새 예약</Button>
          </a>
        </div>
      </div>
      <p className="rounded-xl border border-cream-200 bg-cream-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-700">
        예약한 시각이 되면 네이버 카페에 글이 자동으로 올라갑니다. 상태 딱지 보는 법은 위 <strong>도움말</strong>에 있어요.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="queue-filter" className="text-[13px] font-medium text-ink-700">
          종류
        </label>
        <Select
          id="queue-filter"
          uiSize="sm"
          className="min-w-[10rem]"
          loading={teamsLoading}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">전체</option>
          <option value="general">일반 공지</option>
          {teams.length > 0 ? (
            <optgroup label="봉사 공지">
              <option value="volunteer">봉사 공지 전체</option>
              {teams.map((t) => (
                <option key={t.id} value={`team:${t.id}`}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ) : (
            <option value="volunteer">봉사 공지</option>
          )}
        </Select>
      </div>
      <ErrorText>{error}</ErrorText>
      {loading ? (
        <InfoText>불러오는 중…</InfoText>
      ) : rows.length === 0 ? (
        <Card>
          <InfoText>
            {filter === ''
              ? '아직 예약이 없습니다. "새 예약"으로 등록하세요.'
              : '이 종류의 예약이 없습니다. 위 "종류"를 전체로 바꿔 보세요.'}
          </InfoText>
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
                <div className="text-sm text-ink-500">
                  {fmt(r.publishAt)}
                  {r.boardName ? ` · ${r.boardName}` : ''}
                  {r.event?.eventDate ? ` · 봉사 ${r.event.eventDate}` : ''}
                </div>
                {r.status === 'draft' && r.missing.length > 0 ? (
                  <div className="text-sm text-warning-700">미완성: {r.missing.join(', ')}</div>
                ) : null}
                {r.placeholders.length > 0 ? (
                  <div className="rounded-md bg-cream-100 p-2">
                    <div className="mb-1 text-xs text-ink-500">업로드할 때 이렇게 바뀝니다</div>
                    <ul className="space-y-0.5 text-[13px]">
                      {r.placeholders.map((p) => (
                        <li key={p.key} className="flex flex-wrap items-baseline gap-1">
                          <code className="rounded bg-white px-1 text-ink-700">{`{{${p.key}}}`}</code>
                          <span className="text-ink-400">→</span>
                          {p.value ? (
                            <span className="text-ink-900">{shortenValue(p.value)}</span>
                          ) : (
                            <span className="text-warning-700">비어 있음 — "수정"에서 채우세요(그대로면 업로드 안 됨)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {r.status === 'failed' ? (
                  <div className="rounded-md bg-coral-50 p-2 text-sm text-coral-700">
                    업로드 실패{r.failReason ? `: ${r.failReason}` : ''}. 원인 확인 후 "재시도"로 업로드 대기에 다시 넣으세요.
                  </div>
                ) : null}
                {r.status === 'published' ? (
                  <div className="rounded-md bg-cream-100 p-2 text-sm">
                    업로드 완료 —{' '}
                    {r.cafeArticleUrl ? (
                      <a className="underline" href={r.cafeArticleUrl} target="_blank" rel="noreferrer">
                        카페 글 보기
                      </a>
                    ) : (
                      '카페 링크 대기'
                    )}
                    <div className="text-xs text-ink-500">업로드된 글은 수정 불가입니다. 변경 사항은 카페 댓글로 안내하세요.</div>
                  </div>
                ) : null}
                {/* 미리보기는 업로드된 글에도 준다 — 실제로 무엇이 나갔는지 확인할 수 있어야 한다. */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <PreviewButton onClick={() => void openPreview(r)} />
                  {r.status !== 'published' ? (
                    <>
                      <a href={`/reservations/${r.id}/edit`}>
                        <SecondaryButton>수정</SecondaryButton>
                      </a>
                      {r.status === 'failed' ? (
                        <SecondaryButton onClick={() => act(r.id, 'schedule')}>재시도(업로드 대기)</SecondaryButton>
                      ) : null}
                      <SecondaryButton onClick={() => cancel(r)}>취소</SecondaryButton>
                    </>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {preview ? (
        <Modal title="미리보기" onClose={() => setPreview(null)}>
          {preview.error ? (
            <ErrorText>{preview.error}</ErrorText>
          ) : preview.detail ? (
            // 서버가 준 vars 를 그대로 쓴다 — 발행 워커가 쓰는 값과 같으므로 이 화면이 곧 실제 게시물이다.
            <ReservationPreview
              title={renderTemplate(preview.detail.post.title, preview.detail.vars)}
              body={renderTemplate(preview.detail.post.contentMd, preview.detail.vars)}
              missing={placeholderKeys(preview.detail.post.title, preview.detail.post.contentMd).filter(
                (k) => !preview.detail!.vars[k]
              )}
              meta={`${fmt(preview.row.publishAt)}${preview.row.boardName ? ` · ${preview.row.boardName}` : ''}`}
            />
          ) : (
            <InfoText>불러오는 중…</InfoText>
          )}
        </Modal>
      ) : null}
    </div>
  );
}
