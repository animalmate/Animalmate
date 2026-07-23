export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** [{value, label}] 또는 문자열 배열 */
  options: Array<{ value: string; label: string } | string>;
  /** 첫 줄 빈 옵션 라벨 */
  placeholder?: string;
  invalid?: boolean;
}
