'use client';
// 번개 게시판 목록. 다가오는 번개와 지난 번개를 탭으로 가른다.
//
// 왜 카드 한 장에 자리 현황(확정/정원·대기)을 같이 그리나: 이 게시판을 여는 이유의 절반은
// "지금 신청하면 들어가나?"를 확인하는 것이다. 들어가 봐야 아는 값이면 카드가 하는 일이 없다.
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { Card, Button, Banner, InfoText } from '@/components/ui';
import { Icon } from '@/components/icon';
import { HelpButton } from '@/components/help-button';
import type { FlashListItem } from '@/flash/flash';
import { kstToday } from '@/lib/kst-date';
import { FlashStatusBadge, MySignupBadge, UnreadDot, SeatSummary, relativeDayLabel, signupOpenShort } from './shared';
import { FlashForm, emptyDraft } from './flash-form';

type Scope = 'upcoming' | 'past';

export function FlashBoard({ canApprove }: { canApprove: boolean }) {
  const [scope, setScope] = useState<Scope>('upcoming');
  const [items, setItems] = useState<FlashListItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [opened, setOpened] = useState<string>(''); // 개최 직후 안내 문구
  const today = kstToday();

  const load = useCallback(async (s: Scope) => {
    setLoading(true);
    try {
      const r = await apiGet<{ flash: FlashListItem[]; pendingCount: number }>(`/api/flash?scope=${s}`);
      if (r.ok) {
        setItems(r.data.flash ?? []);
        setPendingCount(r.data.pendingCount ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(scope);
  }, [scope, load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-[24px] font-bold text-ink-900">번개 게시판</h1>
        <HelpButton screen="flash" />
        <Button onClick={() => setOpening(true)}>
          <Icon name="plus" size={17} />
          번개 열기
        </Button>
      </div>
      <InfoText>밥·카페·산책처럼 부원끼리 즉흥으로 여는 모임이에요. 신청은 먼저 보낸 순서대로 자리가 찹니다.</InfoText>

      {opened ? <Banner kind="success" title="번개를 냈어요">{opened}</Banner> : null}

      {/* 승인 대기 안내는 운영진에게만 뜬다 — 부원 응답에는 pendingCount 가 늘 0 이다(서버가 판단). */}
      {canApprove && pendingCount > 0 ? (
        <Banner kind="warning" title={`승인을 기다리는 개최 신청이 ${pendingCount}건 있어요`}>
          아래 <strong>승인 대기</strong> 딱지가 붙은 번개를 열어 승인하거나 거절해 주세요.
        </Banner>
      ) : null}

      <div className="flex gap-1.5">
        {(
          [
            ['upcoming', '다가오는 번개'],
            ['past', '지난 번개'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScope(key)}
            className={`h-9 rounded-xl px-3.5 text-sm font-semibold transition-colors ${
              scope === key ? 'bg-blue-50 text-blue-700' : 'text-ink-500 hover:bg-cream-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <Card>
          <p className="text-[15px] text-ink-500">불러오는 중…</p>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <p className="text-[15px] text-ink-500">
            {scope === 'upcoming' ? '아직 열린 번개가 없어요. 먼저 하나 열어 보세요!' : '지난 번개가 없어요.'}
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((f) => (
            <li key={f.id}>
              <a href={`/flash/${f.id}`} className="block no-underline">
                <Card className="transition-colors hover:border-blue-300">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-amber-50 text-amber-500">
                      <Icon name="zap" size={22} />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-[17px] font-bold text-ink-900">{f.title}</strong>
                        <FlashStatusBadge status={f.status} window={f.signupWindow} />
                        {f.mySignupStatus && f.mySignupStatus !== 'canceled' ? (
                          <MySignupBadge status={f.mySignupStatus} />
                        ) : null}
                        {f.iAmHost ? (
                          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
                            내가 여는 번개
                          </span>
                        ) : null}
                        {/* 아직 신청 시작 전이면 그 사실이 **모집 중**보다 중요한 정보다 —
                            들어가서 신청 칸을 찾다가 없다고 오해하지 않게 목록에서 먼저 말한다. */}
                        {f.signupWindow === 'not_yet' && f.signupOpenAt ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            <Icon name="clock" size={12} />
                            {signupOpenShort(f.signupOpenAt)}
                          </span>
                        ) : null}
                        <UnreadDot count={f.unread} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-500">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-ink-700">
                          <Icon name="calendar" size={14} />
                          {relativeDayLabel(f.meetDate, f.weekday, today)}
                          {f.meetTime ? ` ${f.meetTime}` : ''}
                        </span>
                        {f.place ? (
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <Icon name="mapPin" size={14} />
                            <span className="truncate">{f.place}</span>
                          </span>
                        ) : null}
                        <SeatSummary confirmed={f.counts.confirmed} waiting={f.counts.waiting} capacity={f.capacity} />
                      </div>
                      {f.hosts.length > 0 ? (
                        <p className="text-[13px] text-ink-400">여는 사람 {f.hosts.map((h) => h.name).join(', ')}</p>
                      ) : null}
                    </div>
                    <Icon name="chevronRight" size={18} className="mt-3 shrink-0 text-ink-300" />
                  </div>
                </Card>
              </a>
            </li>
          ))}
        </ul>
      )}

      {opening ? (
        <FlashForm
          initial={emptyDraft()}
          onCancel={() => setOpening(false)}
          onDone={(status) => {
            setOpening(false);
            setOpened(
              status === 'pending'
                ? '운영진 승인을 기다리는 중이에요. 승인되면 게시판에 올라가고, 그때까지는 나에게만 보입니다.'
                : '게시판에 올라갔어요. 신청이 들어오면 여기에 표시됩니다.'
            );
            void load(scope);
          }}
        />
      ) : null}
    </div>
  );
}
