export interface OtpInputProps {
  /** 자리수 (기본 6) */
  length?: number;
  /** 현재 코드 문자열 */
  value: string;
  onChange?: (code: string) => void;
  invalid?: boolean;
  style?: React.CSSProperties;
}
