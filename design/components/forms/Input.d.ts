export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** text | email | number | date | time | datetime-local */
  type?: string;
  /** 오류 상태 (빨간 테두리) */
  invalid?: boolean;
}
