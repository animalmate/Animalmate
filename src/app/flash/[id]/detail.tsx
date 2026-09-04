'use client';
// 번개 상세. 한 화면에서 네 가지 일이 벌어진다 — 보기 / 신청하기 / 개최자로 답하기 /
// 운영진으로 승인하기. 무엇이 보이는지는 서버가 준 값(`canApprove`·`iAmHost`·`threads`)으로만
// 정한다. 여기서 역할을 다시 계산하지 않는다: 화면이 스스로 판단하기 시작하면 서버와 어긋나고,
// 어긋난 쪽은 언제나 화면이다(규칙 #6 — 버튼을 숨기는 것은 권한이 아니다).
//
// **순서가 곧 설계다.** 신청하러 들어온 사람에게는 신청 칸이 명단보다 위에 있어야 하고,
// 개최자에게는 받은 신청이 먼저다. 같은 화면을 두 사람이 다른 목적으로 열기 때문에,
// 카드 순서를 역할에 따라 바꾼다(내용을 감추는 것이 아니라 자리를 바꾸는 것이다).
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage, waitMessage } from '@/lib/api';
import { Card, Button, SecondaryButton, DangerButton, Banner, Textarea, ErrorText, InfoText } from '@/components/ui';
import { Icon } from '@/components/icon';
import { Modal } from '@/components/modal';
import { instantToKstLocal, kstDateTimeLabel } from '@/lib/kst-date';
import type { FlashDetail, PlacedSeat, RosterEntry, ThreadView } from '@/flash/flash';
import { FlashStatusBadge, MySignupBadge, UnreadDot, SeatSummary, dayLabel, SignupCountdown, PlacedTag } from '../shared';
import { FlashForm, type FlashDraft } from '../flash-form';
import { CoHostPicker, type CoHost } from '../co-host-picker';
import { MessageThread } from './thread';

function toDraft(f: FlashDetail): FlashDraft {
  return {
    title: f.title,
    meetDate: f.meetDate,
    meetTime: f.meetTime ?? '',
    place: f.place ?? '',
    details: f.details ?? '',
    capacity: f.capacity == null ? '' : String(f.capacity),
    // 저장은 KST 벽시계로 오갈 때만 어긋나지 않는다 — ISO 를 그대로 넣으면 입력칸이 못 읽는다.
    signupOpenAt: f.signupOpenAt ? instantToKstLocal(new Date(f.signupOpenAt)) : '',
    coHosts: f.hosts.filter((h) => h.userId !== f.createdBy),
  };
}

export function FlashDetailPanel({ id, me }: { id: string; me: string }) {
  const [flash, setFlash] = useState<FlashDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [notice, setNotice] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(''); // 미리 넣은 직후 안내(대기로 갔는지까지 말해 준다)
  const [note, setNote] = useState('');
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [showCanceled, setShowCanceled] = useState(false);

  const load = useCallback(async () => {
    const r = await apiGet<{ flash: FlashDetail }>(`/api/flash/${id}`);
    if (r.status === 404) return setMissing(true);
    if (r.ok) setFlash(r.data.flash);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // 이 화면을 연 것이 곧 "봤다"는 뜻이다. GET 이 쓰기를 하지 않도록 표시는 따로 보낸다.
  useEffect(() => {
    if (!flash) return;
    void apiPost(`/api/flash/${id}/action`, { action: 'read' });
  }, [flash, id]);

  async function act(action: string, noteText?: string) {
    setError('');
    setBusy(true);
    const r = await apiPost(`/api/flash/${id}/action`, { action, note: noteText ?? null });
    setBusy(false);
    if (!r.ok) return setError(r.data.message ?? errorMessage(r.data.error));
    setRejecting(false);
    setCanceling(false);
    setNote('');
    await load();
  }

  /**
   * 신청 취소(본인) / 내보내기(개최자). 같은 엔드포인트다 — 누가 눌렀는지는 서버가 판단한다.
   *
   * 물어보고 지우는 이유: 확정 한 자리가 비면 **대기자가 곧바로 올라간다.** 잘못 눌렀다고
   * 다시 신청하면 그 사람은 이미 올라간 뒤이고 나는 대기 줄 맨 뒤다 — 되돌릴 수 없는 셈이다.
   */
  async function cancelSignup(signupId: string, mine: boolean) {
    const ask = mine
      ? '신청을 취소할까요? 자리는 대기 중인 사람에게 바로 넘어가요.'
      : '이 신청을 내보낼까요? 자리는 대기 중인 사람에게 바로 넘어가요.';
    if (typeof window !== 'undefined' && !window.confirm(ask)) return;
    setError('');
    setBusy(true);
    const r = await fetch(`/api/flash-signups/${signupId}`, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) return setError('취소하지 못했어요. 잠시 후 다시 시도해 주세요.');
    await load();
  }

  if (missing) {
    return (
      <Card>
        <p className="text-[15px] text-ink-500">없는 번개이거나 볼 수 없는 번개예요.</p>
        <a href="/flash" className="mt-3 inline-block text-[15px] font-semibold text-blue-700">
          번개 게시판으로
        </a>
      </Card>
    );
  }
  if (!flash) {
    return (
      <Card>
        <p className="text-[15px] text-ink-500">불러오는 중…</p>
      </Card>
    );
  }

  const live = flash.status === 'open' || flash.status === 'closed';
  const decided = flash.status !== 'pending' && flash.status !== 'rejected';
  const myActive = flash.mine && flash.mine.status !== 'canceled';
  const alive = flash.threads?.filter((t) => t.status !== 'canceled') ?? [];
  const dropped = flash.threads?.filter((t) => t.status === 'canceled') ?? [];

  // ── 카드 조각들 ────────────────────────────────────────────────────
  // 조각으로 떼어 둔 이유는 아래에서 **역할에 따라 순서를 바꿔** 끼우기 때문이다.

  const rosterCard = (
    <Card className="space-y-3">
      <strong className="block text-[15px] font-bold text-ink-900">신청 현황</strong>
      {flash.roster.length === 0 ? (
        <p className="text-[14px] text-ink-500">아직 신청한 사람이 없어요. 먼저 신청해 보세요!</p>
      ) : (
        <RosterList roster={flash.roster} me={me} />
      )}
    </Card>
  );

  const mineCard = (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <strong className="text-[15px] font-bold text-ink-900">{myActive ? '개최자와 주고받은 메시지' : '신청하기'}</strong>
        {flash.mine ? <UnreadDot count={flash.mine.unread} /> : null}
      </div>

      {myActive ? (
        <>
          {/* 내가 신청한 적이 없는데 명단에 있는 경우 — 개최자가 넣어 준 자리다. 이 말이 없으면
              "내가 신청한 적 없는 번개에 왜 확정으로 들어가 있지?" 로 읽힌다. */}
          {flash.mine!.placed ? (
            <InfoText>
              개최자가 명단에 넣어 준 자리예요. 못 가게 되면 아래 <strong>신청 취소</strong>로 빠질 수 있어요.
            </InfoText>
          ) : null}
          <MessageThread thread={flash.mine!} me={me} canWrite={flash.status !== 'canceled'} onSent={load} />
          {flash.status !== 'canceled' ? (
            <div className="flex justify-start border-t border-cream-100 pt-3">
              <DangerButton type="button" onClick={() => void cancelSignup(flash.mine!.signupId, true)} disabled={busy}>
                신청 취소
              </DangerButton>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {flash.mine ? <InfoText>신청을 취소했어요. 다시 신청하면 대기 줄 맨 뒤로 들어갑니다.</InfoText> : null}
          {flash.signupWindow === 'open' ? (
            <SignupForm flashId={id} onDone={load} />
          ) : flash.signupWindow === 'not_yet' && flash.signupOpenAt ? (
            <SignupCountdown openAt={flash.signupOpenAt} serverNow={flash.serverNow} onOpen={load} />
          ) : (
            <InfoText>
              {flash.status === 'closed' ? '신청이 마감된 번개예요.' : '지금은 신청할 수 없는 번개예요.'}
            </InfoText>
          )}
        </>
      )}
    </Card>
  );

  const hostCard = flash.threads ? (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="mr-auto text-[15px] font-bold text-ink-900">받은 신청 {alive.length}건</strong>
        {live ? (
          <SecondaryButton type="button" onClick={() => setPlacing(true)} disabled={busy}>
            <Icon name="plus" size={15} />
            명단에 미리 넣기
          </SecondaryButton>
        ) : null}
        {alive.length > 0 && live ? (
          <SecondaryButton type="button" onClick={() => setNotice(true)} disabled={busy}>
            <Icon name="megaphone" size={15} />
            전체 안내 보내기
          </SecondaryButton>
        ) : null}
      </div>
      {placed ? (
        <Banner kind="success" title="명단에 넣었어요">
          {placed}
        </Banner>
      ) : null}
      {alive.length === 0 ? (
        <p className="text-[14px] text-ink-500">아직 신청이 없어요.</p>
      ) : (
        <ul className="divide-y divide-cream-100">
          {alive.map((t) => (
            <ThreadRow
              key={t.signupId}
              t={t}
              me={me}
              open={openThread === t.signupId}
              onToggle={() => setOpenThread(openThread === t.signupId ? null : t.signupId)}
              canWrite={flash.status !== 'canceled'}
              canRemove={live}
              busy={busy}
              onSent={load}
              onRemove={() => void cancelSignup(t.signupId, false)}
            />
          ))}
        </ul>
      )}

      {/* 취소한 사람은 접어 둔다. 목록에 섞여 있으면 지금 오는 사람이 몇 명인지 한눈에 안 잡힌다. */}
      {dropped.length > 0 ? (
        <div className="border-t border-cream-100 pt-2.5">
          <button
            type="button"
            onClick={() => setShowCanceled((v) => !v)}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-500 hover:text-ink-900"
          >
            <Icon name={showCanceled ? 'chevronDown' : 'chevronRight'} size={14} />
            취소된 신청 {dropped.length}건
          </button>
          {showCanceled ? (
            <ul className="mt-2 divide-y divide-cream-100">
              {dropped.map((t) => (
                <ThreadRow
                  key={t.signupId}
                  t={t}
                  me={me}
                  open={openThread === t.signupId}
                  onToggle={() => setOpenThread(openThread === t.signupId ? null : t.signupId)}
                  canWrite={false}
                  canRemove={false}
                  busy={busy}
                  onSent={load}
                  onRemove={() => {}}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  ) : null;

  return (
    <div className="space-y-5">
      <a href="/flash" className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-500 no-underline hover:text-ink-900">
        <Icon name="chevronRight" size={14} className="rotate-180" />
        번개 게시판
      </a>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-[24px] font-bold text-ink-900">{flash.title}</h1>
        <FlashStatusBadge status={flash.status} window={flash.signupWindow} />
        {myActive ? <MySignupBadge status={flash.mine!.status} order={flash.mine!.order} /> : null}
      </div>

      {/* 거절·취소 사유는 가장 먼저 보여 준다 — 그걸 보러 들어온 사람이 있다. */}
      {flash.status === 'rejected' ? (
        <Banner kind="error" title="개최가 거절됐어요">
          {flash.decisionNote ?? '사유가 적혀 있지 않아요. 운영진에게 문의해 주세요.'}
        </Banner>
      ) : null}
      {flash.status === 'canceled' ? (
        <Banner kind="warning" title="이 번개는 취소됐어요">
          {flash.decisionNote ?? '개최자가 번개를 취소했어요.'}
        </Banner>
      ) : null}
      {flash.status === 'pending' ? (
        <Banner kind="info" title="운영진 승인을 기다리는 중이에요">
          승인되기 전까지는 개최자와 운영진에게만 보여요.
        </Banner>
      ) : null}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
            <Icon name="calendar" size={17} className="text-ink-400" />
            {dayLabel(flash.meetDate, flash.weekday)}
            {flash.meetTime ? ` ${flash.meetTime}` : ' (시간 미정)'}
          </span>
          <span className="inline-flex items-center gap-1.5 text-ink-700">
            <Icon name="mapPin" size={17} className="text-ink-400" />
            {flash.place ?? '장소 미정'}
          </span>
          <SeatSummary confirmed={flash.counts.confirmed} waiting={flash.counts.waiting} capacity={flash.capacity} />
        </div>
        {/* 신청 시작 시각은 **아직 안 열렸을 때만** 줄을 낸다. 이미 열린 뒤에도 남겨 두면
            "3시부터"가 계속 붙어 있어 지금 신청이 되는지 아닌지를 한 번 더 생각하게 만든다. */}
        {flash.signupWindow === 'not_yet' && flash.signupOpenAt ? (
          <p className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-amber-700">
            <Icon name="clock" size={16} />
            {kstDateTimeLabel(new Date(flash.signupOpenAt))} 부터 신청
          </p>
        ) : null}
        <p className="text-[13px] text-ink-500">여는 사람 {flash.hosts.map((h) => h.name).join(', ')}</p>
        {flash.details ? (
          <p className="whitespace-pre-wrap border-t border-cream-100 pt-3 text-[15px] leading-relaxed text-ink-900">
            {flash.details}
          </p>
        ) : null}
      </Card>

      <ErrorText>{error}</ErrorText>

      {/* 운영진: 개최 승인·거절 */}
      {flash.canApprove ? (
        <Card className="space-y-3 border-amber-200 bg-amber-50/40">
          <strong className="block text-[15px] font-bold text-ink-900">이 개최 신청을 어떻게 할까요?</strong>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => act('approve')} disabled={busy}>
              <Icon name="check" size={16} />
              승인하고 게시판에 올리기
            </Button>
            <DangerButton type="button" onClick={() => setRejecting(true)} disabled={busy}>
              거절
            </DangerButton>
          </div>
        </Card>
      ) : null}

      {/* 개최자: 글 관리 */}
      {flash.canManage && flash.status !== 'rejected' ? (
        <div className="flex flex-wrap gap-2">
          <SecondaryButton type="button" onClick={() => setEditing(true)} disabled={busy}>
            <Icon name="edit" size={15} />
            고치기
          </SecondaryButton>
          {flash.status === 'open' ? (
            <SecondaryButton type="button" onClick={() => act('close')} disabled={busy}>
              <Icon name="lock" size={15} />
              신청 마감
            </SecondaryButton>
          ) : null}
          {flash.status === 'closed' ? (
            <SecondaryButton type="button" onClick={() => act('reopen')} disabled={busy}>
              <Icon name="refresh" size={15} />
              신청 다시 열기
            </SecondaryButton>
          ) : null}
          {live ? (
            <DangerButton type="button" onClick={() => setCanceling(true)} disabled={busy}>
              <Icon name="x" size={15} />
              번개 취소
            </DangerButton>
          ) : null}
        </div>
      ) : null}

      {/* 개최자에게는 받은 신청이 먼저다. 명단(roster)은 따로 그리지 않는다 — 아래 신청 목록에
          같은 이름이 순번까지 붙어 다시 나오면, 한 화면에 같은 명단이 두 번 서게 된다. */}
      {flash.iAmHost ? hostCard : null}

      {/* 신청하러 온 사람에게는 신청 칸이 명단보다 위다. 명단을 먼저 보여 주면 정작 하러 온 일이
          스크롤 아래로 밀린다(첫 QA 에서 실제로 그랬다). */}
      {!flash.iAmHost && decided ? mineCard : null}
      {!flash.iAmHost && decided ? rosterCard : null}

      {editing ? (
        <FlashForm
          id={id}
          initial={toDraft(flash)}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            void load();
          }}
        />
      ) : null}

      {rejecting ? (
        <Modal title="개최 신청 거절" onClose={() => setRejecting(false)}>
          <div className="space-y-3">
            <InfoText>사유는 신청한 사람에게 그대로 보입니다. 고쳐서 다시 낼 수 있게 적어 주세요.</InfoText>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="예: 그날 정기 봉사가 있어요. 다른 날로 잡아 주세요."
              aria-label="거절 사유"
            />
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setRejecting(false)} disabled={busy}>
                그만두기
              </SecondaryButton>
              <Button type="button" onClick={() => act('reject', note)} disabled={busy || !note.trim()}>
                거절하기
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {canceling ? (
        <Modal title="번개 취소" onClose={() => setCanceling(false)}>
          <div className="space-y-3">
            <InfoText>
              신청한 사람들에게 취소로 표시됩니다. 왜 취소하는지 적어 두면 알림이 따로 가지 않아도 사정을 알 수 있어요.
            </InfoText>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="예: 비 예보가 있어 다음 주로 미룹니다."
              aria-label="취소 사유"
            />
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setCanceling(false)} disabled={busy}>
                그만두기
              </SecondaryButton>
              <Button type="button" onClick={() => act('cancel', note)} disabled={busy}>
                번개 취소하기
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {placing ? (
        <PlaceModal
          flashId={id}
          capacity={flash.capacity}
          confirmed={flash.counts.confirmed}
          onClose={() => setPlacing(false)}
          onPlaced={(seats) => {
            setPlacing(false);
            setPlaced(describePlaced(seats));
            void load();
          }}
        />
      ) : null}

      {notice ? (
        <NoticeModal
          flashId={id}
          count={alive.length}
          onClose={() => setNotice(false)}
          onSent={() => {
            setNotice(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

/** 확정·대기를 소제목으로 갈라 그린다. 한 줄로 이으면 번호가 1,2,1 처럼 다시 시작해 헷갈린다. */
function RosterList({ roster, me }: { roster: RosterEntry[]; me: string }) {
  return (
    <div className="space-y-3">
      {(['confirmed', 'waitlisted'] as const).map((group) => {
        const rows = roster.filter((r) => r.status === group);
        if (rows.length === 0) return null;
        return (
          <div key={group} className="space-y-1.5">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">
              {group === 'confirmed' ? `확정 ${rows.length}명` : `대기 ${rows.length}명`}
            </p>
            <ol className="space-y-1.5">
              {rows.map((r) => (
                <li key={r.userId} className="flex items-center gap-2 text-[14px]">
                  <span
                    className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-[12px] font-bold ${
                      group === 'confirmed' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {r.order}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-900">
                    {r.name}
                    {r.userId === me ? ' (나)' : ''}
                  </span>
                  {r.placed ? <PlacedTag /> : null}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

/** 개최자 화면의 신청 한 줄(펼치면 대화). */
function ThreadRow({
  t,
  me,
  open,
  onToggle,
  canWrite,
  canRemove,
  busy,
  onSent,
  onRemove,
}: {
  t: ThreadView;
  me: string;
  open: boolean;
  onToggle: () => void;
  canWrite: boolean;
  canRemove: boolean;
  busy: boolean;
  onSent: () => void;
  onRemove: () => void;
}) {
  // 순번을 이름 앞에 둔다 — 개최자가 가장 먼저 확인하는 것이 "몇 번째로 왔나" 다.
  const seat =
    t.status === 'canceled' ? null : (
      <span
        className={`inline-flex h-6 min-w-[24px] shrink-0 items-center justify-center rounded-full px-1.5 text-[12px] font-bold ${
          t.status === 'confirmed' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {t.order}
      </span>
    );
  const last = t.messages[t.messages.length - 1];

  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 text-left">
        {seat}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[15px] font-semibold text-ink-900">{t.name}</span>
            {t.placed ? <PlacedTag /> : null}
          </span>
          {/* 마지막 한 줄을 미리 보여 준다 — 열어 보지 않고도 무엇을 묻는지 알 수 있어야
              신청이 여럿일 때 어디부터 답할지 정할 수 있다.
              직접 넣은 자리는 오간 말이 없어 빈 줄이 되므로, 그 사실을 대신 적는다. */}
          {!open && last ? (
            <span className="block truncate text-[13px] text-ink-500">
              {last.senderId === me ? '나: ' : ''}
              {last.body}
            </span>
          ) : !open && t.placed ? (
            <span className="block truncate text-[13px] text-ink-400">내가 넣은 자리 · 오간 말 없음</span>
          ) : null}
        </span>
        {t.status === 'canceled' ? (
          <span className="shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-500">
            {t.canceledByHost ? '내보냄' : '본인 취소'}
          </span>
        ) : (
          <span className="shrink-0 text-[12px] font-semibold text-ink-500">
            {t.status === 'confirmed' ? '확정' : '대기'}
          </span>
        )}
        <UnreadDot count={t.unread} />
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} className="shrink-0 text-ink-300" />
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <MessageThread thread={t} me={me} canWrite={canWrite} onSent={onSent} />
          {canRemove ? (
            <div className="flex justify-start">
              <DangerButton type="button" onClick={onRemove} disabled={busy}>
                신청 내보내기
              </DangerButton>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** 신청 폼 — **보낸 메시지가 곧 신청이다.** 빈 신청 버튼을 따로 두지 않는다. */
function SignupForm({ flashId, onDone }: { flashId: string; onDone: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const body = text.trim();
    if (!body) return;
    setError('');
    setBusy(true);
    const r = await apiPost(`/api/flash/${flashId}/signup`, { message: body });
    setBusy(false);
    if (!r.ok) {
      if (r.status === 429) return setError(waitMessage(r.data.retryAfter));
      return setError(r.data.message ?? errorMessage(r.data.error));
    }
    setText('');
    onDone();
  }

  return (
    <div className="space-y-2">
      <InfoText>보낸 메시지가 곧 신청이에요. 고를 것이 있으면 함께 적어 주세요 — 예: &quot;테마 1 참가하고 싶습니다!&quot;</InfoText>
      <Textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        placeholder="참가하고 싶습니다!"
        aria-label="신청 메시지"
      />
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end">
        <Button type="button" onClick={submit} disabled={busy || !text.trim()}>
          <Icon name="zap" size={16} />
          {busy ? '보내는 중…' : '신청 보내기'}
        </Button>
      </div>
    </div>
  );
}

/**
 * 넣은 결과를 한 줄로. **대기로 간 사람을 따로 말해 준다** — 정원이 이미 찼으면 넣어진 사람도
 * 대기 줄로 가는데, "넣었어요"로만 끝내면 개최자는 자리를 잡았다고 믿고 넘어간다.
 */
function describePlaced(seats: PlacedSeat[]): string {
  const waiting = seats.filter((s) => s.status === 'waitlisted');
  const names = seats.map((s) => s.name).join(', ');
  if (waiting.length === 0) return `${names} 님을 확정 자리에 넣었어요.`;
  const waitNames = waiting.map((s) => `${s.name}(대기 ${s.order}번)`).join(', ');
  return `${names} 님을 넣었어요. 정원이 차 있어 ${waitNames} 은(는) 대기 줄로 갔어요.`;
}

/**
 * 개최자가 명단에 사람을 미리 넣는 팝업 — "이 자리는 운영진 몫" 같은 것을 잡아 둘 때 쓴다.
 *
 * 신청 시작 시각 전에도 넣을 수 있다(서버가 신청 창을 보지 않는다). 그게 이 기능의 목적이라
 * 여기서 버튼을 잠그면 아무것도 못 한다.
 */
function PlaceModal({
  flashId,
  capacity,
  confirmed,
  onClose,
  onPlaced,
}: {
  flashId: string;
  capacity: number | null;
  confirmed: number;
  onClose: () => void;
  onPlaced: (seats: PlacedSeat[]) => void;
}) {
  const [people, setPeople] = useState<CoHost[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const left = capacity == null ? null : Math.max(0, capacity - confirmed);

  async function submit() {
    if (people.length === 0) return;
    setError('');
    setBusy(true);
    const r = await apiPost<{ placed: PlacedSeat[] }>(`/api/flash/${flashId}/place`, {
      userIds: people.map((p) => p.userId),
    });
    setBusy(false);
    if (!r.ok) return setError(r.data.message ?? errorMessage(r.data.error));
    onPlaced(r.data.placed ?? []);
  }

  return (
    <Modal
      title="명단에 미리 넣기"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <SecondaryButton type="button" onClick={onClose} disabled={busy} className="flex-1">
            그만두기
          </SecondaryButton>
          <Button type="button" onClick={submit} disabled={busy || people.length === 0} className="flex-[2]">
            {busy ? '넣는 중…' : people.length > 0 ? `${people.length}명 넣기` : '넣기'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <InfoText>
          신청을 받기 전에 자리를 잡아 둘 때 쓰세요. 넣은 사람은 <strong>보낸 순서 맨 뒤</strong>에 붙고, 남은 자리가
          없으면 대기 줄로 갑니다 — 먼저 신청한 사람을 밀어내지 않아요. 본인이 직접 취소할 수도 있습니다.
        </InfoText>
        {left != null ? (
          <p className="text-[13px] font-semibold text-ink-700">
            지금 남은 확정 자리 {left}개 (정원 {capacity}명)
          </p>
        ) : null}
        <CoHostPicker value={people} onChange={setPeople} disabled={busy} ariaLabel="명단에 넣을 사람 검색" />
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}

/**
 * 전체 안내 — 신청자 **각자의 1:1 방**에 같은 한 줄을 넣는다.
 *
 * 공지판을 따로 만들지 않는 이유: 받는 사람은 자기 사정(늦어요·못 가요)을 그 자리에 쓰게 되는데,
 * 공지판이면 그 말이 모두에게 보인다. 각자의 방에 넣으면 답장이 원래 자리로 돌아온다.
 */
function NoticeModal({
  flashId,
  count,
  onClose,
  onSent,
}: {
  flashId: string;
  count: number;
  onClose: () => void;
  onSent: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setError('');
    setBusy(true);
    const r = await apiPost(`/api/flash/${flashId}/notice`, { message: body });
    setBusy(false);
    if (!r.ok) {
      if (r.status === 429) return setError(waitMessage(r.data.retryAfter));
      return setError(r.data.message ?? errorMessage(r.data.error));
    }
    onSent();
  }

  return (
    <Modal
      title="전체 안내 보내기"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <SecondaryButton type="button" onClick={onClose} disabled={busy} className="flex-1">
            그만두기
          </SecondaryButton>
          <Button type="button" onClick={send} disabled={busy || !text.trim()} className="flex-[2]">
            {busy ? '보내는 중…' : `${count}명에게 보내기`}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <InfoText>
          확정·대기 중인 <strong>{count}명</strong> 각자의 메시지방에 같은 내용이 들어가요. 답장은 각자 방으로 돌아옵니다.
        </InfoText>
        <Textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="예: 장소가 3번 출구로 바뀌었어요. 10분 전까지 와 주세요!"
          aria-label="전체 안내 내용"
        />
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}
