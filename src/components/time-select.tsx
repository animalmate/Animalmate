'use client';
// 시각 선택 — 10분 단위 목록에서 고른다.
// input[type=time] 의 step 은 브라우저에 따라 화살표에만 적용되거나 무시돼서 1분 단위 입력이 가능했다.
// 목록으로 만들면 10분 단위가 확실히 강제되고, 오전/오후 표기라 읽기도 쉽다.
import { useMemo } from 'react';
import { Select } from './ui';
import { timeOptions, timeLabel, isEarlyMorning } from '@/lib/time-options';

export function TimeSelect({
  value,
  onChange,
  className = '',
  // 업로드 시각처럼 "새벽이면 십중팔구 실수"인 칸에서만 켠다. 집합 시간은 새벽도 있을 수 있다.
  warnEarlyMorning = false,
}: {
  value: string; // 'HH:MM'
  onChange: (value: string) => void;
  className?: string;
  warnEarlyMorning?: boolean;
}) {
  const options = useMemo(() => timeOptions(value), [value]);
  const warn = warnEarlyMorning && isEarlyMorning(value);

  return (
    <>
      <Select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">선택</option>
        {options.map((t) => (
          <option key={t} value={t}>
            {timeLabel(t)}
          </option>
        ))}
      </Select>
      {/* 라벨을 24시간으로 바꿔도 잘못 고를 수는 있다. 자동으로 나가는 값이라 마지막 그물을 하나 둔다. */}
      {warn ? (
        <p className="mt-1 text-[12px] font-medium text-warning" role="alert">
          새벽 {value} 입니다. 오후로 고르려던 것은 아닌가요?
        </p>
      ) : null}
    </>
  );
}
