'use client';
// 예약 흐름 둘러보기 — 실제 화면 캡처를 한 장씩 넘기며 전 과정을 보여준다.
//
// 왜 슬라이드인가: 예약은 화면 세 곳(큐 → 새 예약 → 큐 → 카카오톡)을 오가는 일이다. 어느 한 화면의
// 글로는 "다음에 어디로 가는지"가 안 보이고, 처음 맡은 사람은 버튼 이름을 들어도 그게 화면 어디에
// 있는지 모른다. 그림이 그 자리를 알려 주고, 글은 그림이 말하지 못하는 것만 맡는다.
//
// 캡처는 사람이 찍지 않는다 — `scripts/capture-help-shots.ts` 가 **테스트 DB의 가짜 데이터**로
// 띄운 화면을 찍는다(운영 화면을 찍으면 실제 이름이 그대로 커밋된다). 아직 없는 장은 깨진 이미지
// 대신 안내가 들어간다.
//
// ── 배치 규칙(2026-08-19 실측 후 고침) ────────────────────────────────────
// 예전에는 그림 높이를 `h-[26vh]/[46vh]/[56vh]` 로 잡고 PC·휴대폰을 나란히 놓았는데, 둘 다 틀렸다.
//
//  1) `vh` 는 **브라우저 창 전체 높이**다. 그런데 그림이 놓이는 자리는 이미
//     `92vh − 헤더 − 푸터 − 패딩` 이라 창보다 한참 낮다. 56vh 를 그림에 주면 1440×820 노트북에서
//     쓸 수 있는 527px 중 497px 을 그림이 가져가, 정작 읽어야 할 설명이 30px 만 남고 접혔다.
//     → 이제 **글이 먼저 자리를 잡고(shrink-0), 그림이 남은 자리를 쓴다(flex-1 min-h-0).**
//        글이 밀려나는 일이 구조적으로 불가능해진다. `Modal` 의 `fill` 이 이 계산의 전제다.
//  2) 나란히 놓으면 **모든 장에서 폭을 반씩 나눠 쓴다.** 읽는 사람은 둘 중 한 기기 앞에 있고
//     나머지 한 장은 자리만 차지했다(PC 캡처가 1280 → 709px 로 줄어 글씨가 7.2px 이 됐다).
//     → 이제 **탭으로 하나만** 보여준다. 기본값은 지금 보고 있는 기기.
import { useCallback, useEffect, useState } from 'react';
import { Modal } from './modal';
import { Icon } from './icon';
import { Markdown } from './markdown';
import { Button, SecondaryButton } from './ui';
import { WALK_STEPS, shotPath } from '@/guides/reservation-walkthrough';

type Device = 'pc' | 'mobile';
const DEVICES: Device[] = ['pc', 'mobile'];
const DEVICE_LABEL: Record<Device, string> = { pc: 'PC', mobile: '휴대폰' };

/** 지금 보고 있는 기기. 폰으로 열었으면 폰 화면부터 보여주는 것이 맞다. */
function currentDevice(): Device {
  if (typeof window === 'undefined') return 'pc';
  try {
    return window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'pc';
  } catch {
    return 'pc';
  }
}

export function WalkthroughModal({
  onClose,
  snoozed,
  onToggleSnooze,
}: {
  onClose: () => void;
  /** 지금 "하루 동안 보지 않기"가 켜져 있는가. */
  snoozed: boolean;
  onToggleSnooze: (next: boolean) => void;
}) {
  const [i, setI] = useState(0);
  // 캡처를 아직 안 돌린 장에서 깨진 이미지 아이콘이 뜨지 않게, 실패한 파일을 기억해 둔다.
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  // 어느 기기 화면을 보고 있는가. 장을 넘겨도 유지된다 — 폰으로 따라 하는 사람이 매 장마다
  // 다시 고르게 하면 안 된다.
  const [device, setDevice] = useState<Device>(currentDevice);
  // 눌러서 원본 크기로 보기. 잘라 찍기 전 캡처(화면 전체)는 아무리 키워도 팝업 안에서 다 읽히지
  // 않으므로, "글씨까지 읽고 싶을 때"의 마지막 답은 확대다.
  const [zoom, setZoom] = useState<{ file: string; alt: string } | null>(null);

  const last = WALK_STEPS.length - 1;
  const step = WALK_STEPS[i]!;

  // 이 장에 실제로 있는(그리고 깨지지 않은) 기기들. 카카오톡 장처럼 한쪽만 있는 경우가 있다.
  const available = DEVICES.filter((d) => {
    const f = step.shots[d];
    return !!f && !broken[f];
  });
  // 고른 기기가 이 장에 없으면 있는 쪽을 보여주되 **고른 값은 그대로 둔다** —
  // 다음 장에서 원래 보던 기기로 돌아와야 한다.
  const shown = available.includes(device) ? device : available[0];
  const file = shown ? step.shots[shown] : undefined;
  const alt = shown ? `${step.title} — ${DEVICE_LABEL[shown]} 화면` : '';

  const go = useCallback((next: number) => setI(Math.min(last, Math.max(0, next))), [last]);

  // 화살표로 넘긴다. 슬라이드를 넘기는 손은 마우스보다 키보드가 빠르다.
  // Esc·Tab 은 Modal 이 이미 맡는다(닫기·초점 가두기).
  // 확대해서 보는 중에는 넘기지 않는다 — 확대창이 떠 있는데 뒤 슬라이드가 바뀌면 뭘 보던 건지 잃는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (zoom) return;
      if (e.key === 'ArrowRight') setI((p) => Math.min(last, p + 1));
      if (e.key === 'ArrowLeft') setI((p) => Math.max(0, p - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, zoom]);

  return (
    <Modal
      title="예약, 이렇게 합니다"
      // Esc·배경 클릭은 Modal 이 이 함수를 부른다 — 확대창이 떠 있으면 **그것만** 닫는다.
      // 안 그러면 확대를 끄려고 Esc 를 눌렀는데 둘러보기가 통째로 닫힌다.
      onClose={() => (zoom ? setZoom(null) : onClose())}
      size="2xl"
      // 본문 칸을 스크롤 상자가 아니라 **높이가 정해진 상자**로 받는다. 아래 flex-1 계산의 전제다.
      fill
      headerExtra={
        <span className="rounded-lg bg-cream-100 px-2 py-1 font-mono text-xs font-semibold text-ink-600">
          {i + 1} / {WALK_STEPS.length}
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 요청대로 닫기만 있는 것이 아니라 하루를 통째로 미룰 수 있어야 한다.
              체크하는 즉시 저장한다 — 체크만 하고 ✕ 로 닫아도 약속이 지켜지게. */}
          <label className="flex min-h-tap cursor-pointer select-none items-center gap-2 text-[13px] text-ink-600">
            <input
              type="checkbox"
              checked={snoozed}
              onChange={(e) => onToggleSnooze(e.target.checked)}
              className="h-4 w-4 rounded border-ink-400 accent-blue-600"
            />
            하루 동안 보지 않기
          </label>
          <div className="flex items-center gap-2">
            <SecondaryButton type="button" onClick={() => go(i - 1)} disabled={i === 0}>
              ← 이전
            </SecondaryButton>
            {i === last ? (
              <Button type="button" onClick={onClose}>
                다 봤어요
              </Button>
            ) : (
              <Button type="button" onClick={() => go(i + 1)}>
                다음 →
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        {/* 넓은 화면은 글(왼쪽 320px)과 그림(오른쪽)을 나란히 — 둘 다 항상 보인다.
            좁은 화면은 글 → 그림 순서로 쌓는다. 어느 쪽이든 **글이 먼저 자리를 잡는다.** */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
          {/* 글. 좁은 화면에서 설명이 길면 이 칸 안에서 스크롤되게 45% 로 묶는다 —
              그러지 않으면 긴 설명 한 장이 그림 자리를 다 먹는다(옛 그림이 하던 짓 그대로). */}
          <div className="max-h-[45%] shrink-0 space-y-1.5 overflow-y-auto lg:max-h-none lg:h-full lg:w-[320px] lg:pr-1">
            <h3 className="text-[17px] font-bold text-ink-900">
              {i + 1}. {step.title}
            </h3>
            <Markdown variant="doc">{step.body}</Markdown>
          </div>

          {/* 그림 — 남은 자리를 쓴다. 높이를 스스로 정하지 않는 것이 핵심이다. */}
          {file && shown ? (
            <figure className="flex min-h-0 flex-1 flex-col">
              <figcaption className="mb-1.5 flex shrink-0 flex-wrap items-center gap-2">
                {available.length > 1 ? (
                  // 같은 단계를 두 벌 보여주는 대신 하나만 크게 본다. 기기를 섞어 쓰는 사람은
                  // 여기서 바꾼다(단톡 예약은 폰, 공지는 PC 처럼).
                  <div className="flex items-center gap-0.5 rounded-lg bg-cream-100 p-0.5">
                    {available.map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={d === shown}
                        onClick={() => setDevice(d)}
                        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-bold transition-colors ${
                          d === shown ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-700'
                        }`}
                      >
                        <Icon name={d === 'pc' ? 'monitor' : 'smartphone'} size={13} />
                        {DEVICE_LABEL[d]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink-500">
                    <Icon name={shown === 'pc' ? 'monitor' : 'smartphone'} size={13} />
                    {DEVICE_LABEL[shown]} 화면
                  </span>
                )}
              </figcaption>
              <button
                type="button"
                onClick={() => setZoom({ file, alt })}
                title="크게 보기"
                aria-label={`${alt} — 크게 보기`}
                className="relative flex min-h-0 w-full flex-1 cursor-zoom-in items-center justify-center overflow-hidden rounded-xl border border-cream-200 bg-cream-50 p-2 transition-colors hover:border-blue-300"
              >
                <img
                  src={shotPath(file)}
                  alt={alt}
                  // ⚠ `loading="lazy"` 를 걸면 안 된다. 지금 장의 그림만 DOM 에 있으므로 미뤄서
                  //   아낄 것이 없는데, 좁은 화면에서는 그림이 접힌 자리(스크롤 아래)에 들어가
                  //   **빈 칸으로 보이다가 스크롤해야 나타났다**(2026-08-06 모바일 워크스루에서 확인).
                  onError={() => setBroken((prev) => ({ ...prev, [file]: true }))}
                  className="max-h-full max-w-full object-contain"
                />
                {/* 확대가 있다는 것을 그림 위에서 말한다. 예전에는 캡션의 11px 회색 글씨
                    `· 누르면 크게` 가 전부라 아무도 누를 생각을 하지 않았다.
                    `<button>` 안에 `<button>` 은 못 넣으므로 표시만 하는 딱지다. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2.5 top-2.5 flex items-center gap-1 rounded-lg border border-cream-200 bg-white/90 px-2 py-1 text-[11px] font-bold text-ink-600 shadow-card"
                >
                  <Icon name="zoomIn" size={13} />
                  크게 보기
                </span>
              </button>
            </figure>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-cream-200 bg-cream-50 px-6 text-center">
              <Icon name="info" size={22} className="text-ink-400" />
              <p className="max-w-md text-sm leading-relaxed text-ink-500">
                {step.pending ?? '화면 그림을 준비하고 있습니다.'}
              </p>
            </div>
          )}
        </div>

        {/* 점 = 지금 어디쯤인지. 눌러서 곧바로 갈 수도 있다(다시 보고 싶은 장이 뒤에 있을 때). */}
        <div className="flex shrink-0 flex-wrap justify-center gap-1.5">
          {WALK_STEPS.map((s, idx) => (
            <button
              key={s.key}
              type="button"
              onClick={() => go(idx)}
              aria-label={`${idx + 1}. ${s.title}`}
              aria-current={idx === i}
              title={s.title}
              className={`h-2.5 rounded-full transition-all ${
                idx === i ? 'w-6 bg-blue-600' : 'w-2.5 bg-ink-200 hover:bg-ink-300'
              }`}
            />
          ))}
        </div>

        {/* 원본 크기로 보기. 큰 캡처는 화면보다 커질 수 있으므로 스크롤을 허용한다.
            팝업 안(초점 가두기 범위 안)에 그려야 Tab 이 뒤 화면으로 새지 않는다. */}
        {zoom ? (
          <div
            className="fixed inset-0 z-[60] cursor-zoom-out overflow-auto bg-ink-900/80 p-4"
            onClick={() => setZoom(null)}
            role="dialog"
            aria-modal="true"
            aria-label={`${zoom.alt} — 원본 크기`}
          >
            <div className="flex min-h-full items-start justify-center">
              {/* `max-w-full` = 화면 폭까지 채우되 **원본보다 키우지는 않는다.**
                  캡처는 2배 해상도라 원본 크기로 그리면 2560px 가 되어 가로로 밀어야 하고,
                  반대로 폭을 강제로 채우면 작은 캡처(카톡 PC)가 흐려진다. 둘 다 피하는 지점이다. */}
              <img src={shotPath(zoom.file)} alt={zoom.alt} className="max-w-full rounded-lg shadow-modal" />
            </div>
            <button
              type="button"
              onClick={() => setZoom(null)}
              className="fixed right-5 top-5 rounded-xl bg-white px-3.5 py-2 text-[13px] font-semibold text-ink-700 shadow-raised"
            >
              닫기
            </button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
