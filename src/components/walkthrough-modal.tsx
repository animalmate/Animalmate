'use client';
// 예약 흐름 둘러보기 — 실제 화면 캡처를 한 장씩 넘기며 전 과정을 보여준다.
//
// 왜 슬라이드인가: 예약은 화면 세 곳(큐 → 새 예약 → 큐 → 카카오톡)을 오가는 일이다. 어느 한 화면의
// 글로는 "다음에 어디로 가는지"가 안 보이고, 처음 맡은 사람은 버튼 이름을 들어도 그게 화면 어디에
// 있는지 모른다. 그림이 그 자리를 알려 주고, 글은 그림이 말하지 못하는 것만 맡는다.
//
// 캡처는 사람이 찍지 않는다 — `scripts/capture-help-shots.mjs` 가 **테스트 DB의 가짜 데이터**로
// 띄운 화면을 찍는다(운영 화면을 찍으면 실제 이름이 그대로 커밋된다). 아직 없는 장은 깨진 이미지
// 대신 안내가 들어간다.
import { useCallback, useEffect, useState } from 'react';
import { Modal } from './modal';
import { Icon } from './icon';
import { Markdown } from './markdown';
import { Button, SecondaryButton } from './ui';
import { WALK_STEPS, shotPath } from '@/guides/reservation-walkthrough';

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
  // 눌러서 원본 크기로 보기. 팝업을 아무리 키워도 1280px 캡처를 통째로 담을 수는 없어서
  // (PC·휴대폰을 나란히 놓으면 더욱), "글씨까지 읽고 싶을 때"의 답은 확대뿐이다.
  const [zoom, setZoom] = useState<{ file: string; alt: string } | null>(null);

  const last = WALK_STEPS.length - 1;
  const step = WALK_STEPS[i]!;
  // PC·휴대폰을 나란히 놓는다. 둘 중 하나만 있으면(또는 하나가 깨졌으면) 그 하나가 자리를 다 쓴다.
  const shots = (['pc', 'mobile'] as const)
    .map((device) => ({ device, file: step.shots[device] }))
    .filter((s): s is { device: 'pc' | 'mobile'; file: string } => !!s.file && !broken[s.file]);

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
      {/* 좁은 화면에서는 **글이 먼저**다. 그림 두 장(PC·휴대폰)을 세로로 쌓으면 화면을 다 먹어서
          정작 읽어야 할 설명이 스크롤 밖으로 밀려났다(2026-08-06 모바일 워크스루에서 확인).
          넓은 화면에서는 그림이 주인공이라 순서를 되돌린다. */}
      <div className="flex flex-col gap-4">
        {/* 그림이 주인공이라 먼저 온다. **높이를 고정**하는 것이 요령이다 — 가로형(PC)과 세로형(휴대폰)이
            섞여 있어서 높이를 내용에 맡기면 장을 넘길 때마다 팝업이 늘었다 줄었다 하고, 그러면 눈이
            버튼을 다시 찾아야 한다. 안에서는 object-contain 이라 비율은 그대로다(잘리지 않는다). */}
        {shots.length > 0 ? (
          <div className="order-2 flex flex-col gap-3 sm:order-1 sm:flex-row">
            {shots.map(({ device, file }) => (
              <figure
                key={file}
                // PC 캡처(1280px)가 주인공이라 넓은 화면일수록 몫을 더 준다. 휴대폰 캡처는 세로로 길어
                // 어차피 높이에 맞춰 줄어들므로 폭을 더 줘도 여백만 늘어난다.
                className={`min-w-0 ${shots.length === 1 ? 'flex-1' : device === 'pc' ? 'sm:flex-[2] lg:flex-[3]' : 'sm:flex-1'}`}
              >
                <figcaption className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-ink-500">
                  <Icon name={device === 'pc' ? 'monitor' : 'smartphone'} size={13} />
                  {device === 'pc' ? 'PC' : '휴대폰'}
                  <span className="font-medium text-ink-400">· 누르면 크게</span>
                </figcaption>
                {/* 좁은 화면에서는 두 장이 세로로 쌓이므로 한 장이 낮아야 둘 다 눈에 들어온다.
                    넓은 화면에서는 반대로 최대한 키운다 — 캡처 속 글씨를 읽는 것이 이 팝업의 일이다. */}
                <button
                  type="button"
                  onClick={() => setZoom({ file, alt: `${step.title} — ${device === 'pc' ? 'PC' : '휴대폰'} 화면` })}
                  title="크게 보기"
                  className="flex h-[26vh] w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-xl border border-cream-200 bg-cream-50 p-2 transition-colors hover:border-blue-300 sm:h-[46vh] lg:h-[56vh]"
                >
                  <img
                    src={shotPath(file)}
                    alt={`${step.title} — ${device === 'pc' ? 'PC' : '휴대폰'} 화면`}
                    // ⚠ `loading="lazy"` 를 걸면 안 된다. 지금 장의 그림만 DOM 에 있으므로 미뤄서
                    //   아낄 것이 없는데, 좁은 화면에서는 그림이 접힌 자리(스크롤 아래)에 들어가
                    //   **빈 칸으로 보이다가 스크롤해야 나타났다**(2026-08-06 모바일 워크스루에서 확인).
                    onError={() => setBroken((prev) => ({ ...prev, [file]: true }))}
                    className="max-h-full max-w-full object-contain"
                  />
                </button>
              </figure>
            ))}
          </div>
        ) : (
          <div className="order-2 flex h-[26vh] w-full flex-col items-center justify-center gap-2 rounded-xl border border-cream-200 bg-cream-50 px-6 text-center sm:order-1 sm:h-[46vh] lg:h-[56vh]">
            <Icon name="info" size={22} className="text-ink-400" />
            <p className="max-w-md text-sm leading-relaxed text-ink-500">
              {step.pending ?? '화면 그림을 준비하고 있습니다.'}
            </p>
          </div>
        )}

        <div className="order-1 space-y-1.5 sm:order-2">
          <h3 className="text-[17px] font-bold text-ink-900">
            {i + 1}. {step.title}
          </h3>
          <Markdown variant="doc">{step.body}</Markdown>
        </div>

        {/* 점 = 지금 어디쯤인지. 눌러서 곧바로 갈 수도 있다(다시 보고 싶은 장이 뒤에 있을 때). */}
        <div className="order-3 flex flex-wrap justify-center gap-1.5 pt-1">
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
