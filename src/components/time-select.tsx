'use client';
// 시각 선택 — 10분 단위 목록에서 고른다.
// input[type=time] 의 step 은 브라우저에 따라 화살표에만 적용되거나 무시돼서 1분 단위 입력이 가능했다.
// 목록으로 만들면 10분 단위가 확실히 강제되고, 오전/오후 표기라 읽기도 쉽다.
import { useMemo } from 'react';
import { Select } from './ui';
import { timeOptions, timeLabel } from '@/lib/time-options';

export function TimeSelect({
  value,
  onChange,
  className = '',
}: {
  value: string; // 'HH:MM'
  onChange: (value: string) => void;
  className?: string;
}) {
  const options = useMemo(() => timeOptions(value), [value]);

  return (
    <Select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">선택</option>
      {options.map((t) => (
        <option key={t} value={t}>
          {timeLabel(t)}
        </option>
      ))}
    </Select>
  );
}
