'use client';
// 면접 배정 화면의 단계 머리글.
//
// 왜 있는가: 이 화면은 **순서가 있는 일**인데(조를 만들어야 앉힐 자리가 생기고, 앉혀야 대기실
// 인원이 맞는다) 카드 제목이 셋 다 같은 모양이라 어디서 시작하는지 글을 읽어야 알 수 있었다.
// 번호와 상태를 눈에 보이게 두면 설명 문장 없이도 "1번부터"가 보인다.
//
// 상태는 세 가지뿐이다 — **할 차례(파랑) · 끝남(초록 체크) · 아직(회색)**. 더 잘게 나누면
// 색을 외워야 하고, 그러면 눈으로 알아보는 이점이 없어진다.
import { Icon } from '@/components/icon';

export type StepState = 'todo' | 'current' | 'done';

export function StepHeading({
  step,
  title,
  hint,
  state,
  right,
  divider = true,
}: {
  step: number;
  title: string;
  /** 이 단계에서 하는 일 한 줄. 없으면 줄을 만들지 않는다. */
  hint?: string;
  state: StepState;
  /** 오른쪽에 붙는 버튼·배지. */
  right?: React.ReactNode;
  /** 아래 구분선. 카드가 접혀 있으면 선 아래가 비어 보이므로 끈다. */
  divider?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 ${divider ? 'border-b border-cream-200 pb-3' : ''}`}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
            state === 'done'
              ? 'bg-success-100 text-success-700'
              : state === 'current'
                ? 'bg-blue-600 text-white'
                : 'bg-cream-200 text-ink-400'
          }`}
        >
          {state === 'done' ? <Icon name="check" size={15} /> : step}
        </span>
        <div>
          <h2 className="text-base font-bold text-ink-900">{title}</h2>
          {hint && <p className="text-[12px] text-ink-500">{hint}</p>}
        </div>
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

/**
 * 배정 진행 막대. 숫자만 적으면 "181명 중 178명"을 매번 계산해서 읽어야 한다 —
 * 남은 3명이 있다는 것은 **빈 칸이 남아 보이는 것**으로 알아채는 편이 빠르다.
 */
export function AssignProgress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const left = total - done;
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 w-28 overflow-hidden rounded-full bg-cream-200"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="지원자 배정 진행률"
      >
        <div
          className={`h-full rounded-full transition-all ${left === 0 ? 'bg-success' : 'bg-blue-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[12px] font-bold text-ink-700">
        {done}/{total}
      </span>
      {left > 0 && (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
          <Icon name="alert" size={12} className="inline" />
          아직 {left}명
        </span>
      )}
    </div>
  );
}
