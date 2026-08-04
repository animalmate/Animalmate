'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, InfoText, SecondaryButton, Select, StatusBadge } from '@/components/ui';
import { HelpButton } from '@/components/help-button';
import { Modal } from '@/components/modal';
import { Toast } from '@/components/toast';
import { PreviewButton, ReservationPreview } from '@/components/reservation-preview';
import { renderTemplate, placeholderKeys } from '@/publishing/template-render';
import { shortenValue } from '@/publishing/placeholder-catalog';
import { buildKakaoNotice, kakaoReserveLabel } from '@/publishing/kakao-notice';
import { copyText } from '@/lib/clipboard';

interface Reservation {
  id: string;
  title: string;
  status: string;
  boardName: string | null;
  publishAt: string | null;
  cafeArticleUrl: string | null;
  failReason: string | null;
  event: { status: string; eventDate: string | null; place: string | null; capacity: number | null } | null;
  missing: string[];
  placeholders: { key: string; value: string | null }[];
  teamName: string | null;
  boardUrl: string | null;
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
  // 단톡 공지문 팝업(카톡 예약 메시지에 붙여 넣을 문구). 목록 데이터만으로 만들어져 추가 조회가 없다.
  const [kakao, setKakao] = useState<Reservation | null>(null);
  const [toast, setToast] = useState('');

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

  async function act(id: string, action: 'ready' | 'schedule' | 'cancel' | 'cancel_event') {
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

  // 이미 카페에 나간 공지의 봉사를 취소로 표시한다. 카페 글은 그대로 남으므로,
  // 무엇이 되고 무엇이 안 되는지 눌리기 전에 분명히 말한다.
  function cancelEventOf(r: Reservation) {
    const when = r.event?.eventDate ? r.event.eventDate : '날짜 미정';
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `${when} 봉사를 취소로 표시할까요?\n\n` +
          `· 챗봇과 안내에서 바로 빠집니다.\n` +
          `· 이미 카페에 올라간 글은 지워지지 않습니다 — 카페에서 직접 지우거나 댓글로 알리세요.`
      )
    )
      return;
    void act(r.id, 'cancel_event');
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
                  {/* 카톡 공지는 **올라가기 전에** 걸어 두는 것이다. 이미 나갔거나(published) 실패한
                      건에는 걸 예약이 없으므로 숨긴다 — 발행 완료 건에는 위에 실제 글 링크가 뜬다. */}
                  {r.status !== 'published' && r.status !== 'failed' ? (
                    <SecondaryButton onClick={() => setKakao(r)}>카카오톡 공지 예약</SecondaryButton>
                  ) : null}
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
                  {/* 업로드된 뒤에도 **봉사 자체가 취소되는 일**은 생긴다. 카페 글은 못 지우지만
                      챗봇과 안내는 즉시 멈춰야 한다 — 회차가 살아 있으면 계속 "다가오는 봉사"로 안내된다. */}
                  {r.status === 'published' && r.event && r.event.status !== 'canceled' ? (
                    <SecondaryButton onClick={() => cancelEventOf(r)}>봉사 취소 표시</SecondaryButton>
                  ) : null}
                </div>
                {r.event?.status === 'canceled' ? (
                  <div className="text-xs text-ink-500">
                    이 봉사는 <strong>취소</strong>로 표시돼 있습니다. 챗봇과 안내에 나오지 않습니다.
                  </div>
                ) : null}
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
      {kakao ? <KakaoNoticeModal row={kakao} onClose={() => setKakao(null)} onCopied={setToast} /> : null}
      <Toast text={toast} onDone={() => setToast('')} />
    </div>
  );
}

/**
 * 단톡 공지 팝업 — 카톡 예약 메시지에 넣을 **시각**과 **문구**를 준다.
 *
 * 카카오톡에는 단톡방 자동 전송 API 가 없다(비공식 자동화는 약관 위반이라 금지). 그래서 이 화면은
 * 보내 주는 것이 아니라 **사람이 카톡의 예약 메시지를 거는 데 필요한 것만** 건넨다.
 */
function KakaoNoticeModal({
  row,
  onClose,
  onCopied,
}: {
  row: Reservation;
  onClose: () => void;
  onCopied: (msg: string) => void;
}) {
  // 카페에 글이 올라간 **뒤** 알림이 가야 하므로 발행 시각보다 1분 뒤로 안내한다.
  const reserveAt = kakaoReserveLabel(row.publishAt);
  // 제목에 {{간결_날짜}} 같은 자리표시자가 남아 있으면 그대로 단톡방에 나간다 —
  // 큐가 이미 갖고 있는 치환값(발행 워커와 같은 값)으로 먼저 바꾼다.
  const titleVars = Object.fromEntries(row.placeholders.filter((p) => p.value).map((p) => [p.key, p.value!]));
  const notice = buildKakaoNotice({
    title: renderTemplate(row.title, titleVars),
    teamName: row.teamName,
    eventDate: row.event?.eventDate ?? null,
    place: row.event?.place ?? null,
    boardUrl: row.boardUrl,
  });

  async function copy() {
    const ok = await copyText(notice);
    onCopied(ok ? '공지문을 복사했습니다' : '복사하지 못했습니다 — 아래 문구를 길게 눌러 복사하세요');
  }

  return (
    <Modal title="카카오톡 공지 예약" onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-xl border border-cream-200 bg-cream-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-700">
          아래 공지문을 복사해 카카오톡 <strong>예약 메시지</strong>로 걸어두세요.
          <div className="mt-1.5">
            예약 시간 :{' '}
            {reserveAt ? (
              <strong className="text-ink-900">{reserveAt}</strong>
            ) : (
              <span className="text-warning-700">업로드 시각이 아직 없습니다 — "수정"에서 정한 뒤 다시 여세요.</span>
            )}
          </div>
        </div>
        {/* 붙여 넣을 것과 화면에 보이는 것이 **같은 문자열**이어야 한다(빈 줄 포함). */}
        <pre className="whitespace-pre-wrap rounded-md bg-cream-100 p-3 font-sans text-sm text-ink-900">{notice}</pre>
        {!row.boardUrl ? (
          <InfoText>게시판 주소를 만들지 못했습니다(카페 설정 확인). 문구만 복사됩니다.</InfoText>
        ) : null}
        <Button className="w-full" onClick={() => void copy()}>
          공지문 복사
        </Button>
        <InfoText>붙여 넣은 뒤 문구는 자유롭게 고쳐도 됩니다. 카페 글 주소는 올라가기 전이라 넣을 수 없습니다.</InfoText>
      </div>
    </Modal>
  );
}
