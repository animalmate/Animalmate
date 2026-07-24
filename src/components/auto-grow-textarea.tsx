'use client';
// 내용에 맞춰 높이가 늘어나는 입력칸. 공지 본문은 한 번 훑어보고 넘어가는 값이라
// 작은 상자에서 스크롤하며 읽지 않게, 전문이 한눈에 보이도록 펼쳐 둔다.
import { useLayoutEffect, useRef, type ComponentPropsWithRef } from 'react';
import { Textarea } from './ui';

type Props = ComponentPropsWithRef<'textarea'> & {
  /** 내용이 짧아도 유지할 최소 줄 수. */
  minRows?: number;
};

export function AutoGrowTextarea({ minRows = 12, className = '', value, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto'; // 줄어들 때도 맞추려면 먼저 초기화해야 한다(= rows 기준 높이로 복귀).
      const minHeight = el.clientHeight; // rows 가 정하는 최소 높이(padding 포함, border 제외)
      const borders = el.offsetHeight - el.clientHeight; // box-sizing:border-box 라 테두리를 더해야 한다.
      el.style.height = `${Math.max(el.scrollHeight, minHeight) + borders}px`;
    };
    fit();
    // 폭이 바뀌면 줄바꿈이 달라져 높이도 달라진다.
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [value]);

  return (
    <Textarea
      ref={ref}
      rows={minRows}
      value={value}
      className={`resize-none overflow-hidden ${className}`}
      {...props}
    />
  );
}
