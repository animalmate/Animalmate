'use client';
// 번개 상세. 한 화면에서 네 가지 일이 벌어진다 — 보기 / 신청하기 / 개최자로 답하기 /
// 운영진으로 승인하기. 무엇이 보이는지는 서버가 준 값(`canApprove`·`iAmHost`·`threads`)으로만
// 정한다. 여기서 역할을 다시 계산하지 않는다: 화면이 스스로 판단하기 시작하면 서버와 어긋나고,
// 어긋난 쪽은 언제나 화면이다(규칙 #6 — 버튼을 숨기는 것은 권한이 아니다).
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage, waitMessage } from '@/lib/api';
import { Card, Button, SecondaryButton, DangerButton, Banner, Textarea, ErrorText, InfoText } from '@/components/ui';
import { Icon } from '@/components/icon';
import { Modal } from '@/components/modal';
import type { FlashDetail } from '@/flash/flash';
import { FlashStatusBadge, MySignupBadge, UnreadDot, SeatSummary, dayLabel } from '../shared';
import { FlashForm, type FlashDraft } from '../flash-form';
import { MessageThread } from './thread';

function toDraft(f: FlashDetail): FlashDraft {
  return {
    title: f.title,
    meetDate: f.meetDate,
    meetTime: f.meetTime ?? '',
    place: f.place ?? '',
    details: f.details ?? '',
    capacity: f.capacity == null ? '' : String(f.capacity),
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
  const [note, setNote] = useState('');
  const [openThread, setOpenThread] = useState<string | null>(null);

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
  const canSignUp = flash.status === 'open' && !flash.iAmHost;
  const myActive = flash.mine && flash.mine.status !== 'canceled';

  return (
    <div className="space-y-5">
      <a href="/flash" className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-500 no-underline hover:text-ink-900">
        <Icon name="chevronRight" size={14} className="rotate-180" />
        번개 게시판
      </a>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-[24px] font-bold text-ink-900">{flash.title}</h1>
        <FlashStatusBadge status={flash.status} />
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

      {/* 신청 현황 — 이름만. 연락처는 어디에도 싣지 않는다. */}
      {flash.status !== 'pending' && flash.status !== 'rejected' ? (
        <Card className="space-y-3">
          <strong className="block text-[15px] font-bold text-ink-900">신청 현황</strong>
          {flash.roster.length === 0 ? (
            <p className="text-[14px] text-ink-500">아직 신청한 사람이 없어요.</p>
          ) : (
            // 확정과 대기를 **소제목으로 갈라** 놓는다. 한 줄로 이으면 번호가 1,2,1 처럼 다시
            // 시작해서(둘이 각자 1번부터다) 같은 순위가 둘 있는 것처럼 읽힌다 — QA 캡처에서 실제로 그랬다.
            <div className="space-y-3">
              {(['confirmed', 'waitlisted'] as const).map((group) => {
                const rows = flash.roster.filter((r) => r.status === group);
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
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}

      {/* 신청자 본인: 신청하기 또는 내 대화 */}
      {!flash.iAmHost && flash.status !== 'pending' && flash.status !== 'rejected' ? (
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <strong className="text-[15px] font-bold text-ink-900">{myActive ? '개최자와 주고받은 메시지' : '신청하기'}</strong>
            {flash.mine ? <UnreadDot count={flash.mine.unread} /> : null}
          </div>

          {myActive ? (
            <>
              <MessageThread thread={flash.mine!} me={me} canWrite={flash.status !== 'canceled'} onSent={load} />
              {flash.status !== 'canceled' ? (
                <div className="flex justify-start border-t border-cream-100 pt-3">
                  <DangerButton type="button" onClick={() => void cancelSignup(flash.mine!.signupId, true)} disabled={busy}>
                    신청 취소
                  </DangerButton>
                </div>
              ) : null}
            </>
          ) : flash.mine ? (
            <>
              <InfoText>신청을 취소했어요. 다시 신청하면 대기 줄 맨 뒤로 들어갑니다.</InfoText>
              {canSignUp ? <SignupForm flashId={id} onDone={load} /> : null}
            </>
          ) : canSignUp ? (
            <SignupForm flashId={id} onDone={load} />
          ) : (
            <InfoText>
              {flash.status === 'closed' ? '신청이 마감된 번개예요.' : '지금은 신청할 수 없는 번개예요.'}
            </InfoText>
          )}
        </Card>
      ) : null}

      {/* 개최자: 신청 건별 대화 */}
      {flash.threads ? (
        <Card className="space-y-3">
          <strong className="block text-[15px] font-bold text-ink-900">받은 신청 {flash.threads.length}건</strong>
          {flash.threads.length === 0 ? (
            <p className="text-[14px] text-ink-500">아직 신청이 없어요.</p>
          ) : (
            <ul className="divide-y divide-cream-100">
              {flash.threads.map((t) => {
                const open = openThread === t.signupId;
                return (
                  <li key={t.signupId} className="py-2.5 first:pt-0 last:pb-0">
                    <button
                      type="button"
                      onClick={() => setOpenThread(open ? null : t.signupId)}
                      className="flex w-full items-center gap-2 text-left"
                    >
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-900">{t.name}</span>
                      {t.status === 'canceled' ? (
                        <span className="shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-500">
                          {t.canceledByHost ? '내보냄' : '본인 취소'}
                        </span>
                      ) : (
                        <MySignupBadge status={t.status} order={t.order} />
                      )}
                      <UnreadDot count={t.unread} />
                      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} className="shrink-0 text-ink-300" />
                    </button>
                    {open ? (
                      <div className="mt-3 space-y-3">
                        <MessageThread thread={t} me={me} canWrite={flash.status !== 'canceled'} onSent={load} />
                        {t.status !== 'canceled' && live ? (
                          <div className="flex justify-start">
                            <DangerButton type="button" onClick={() => void cancelSignup(t.signupId, false)} disabled={busy}>
                              신청 내보내기
                            </DangerButton>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

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
    </div>
  );

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
