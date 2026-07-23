export interface FieldProps {
  label?: React.ReactNode;
  /** 라벨 아래 컨트롤 밑에 붙는 도움말 */
  hint?: React.ReactNode;
  /** 있으면 힌트 대신 빨간 오류 문구 표시 */
  error?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}
