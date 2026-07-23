export interface CodeChipProps {
  /** 칩 안에 표기할 코드 텍스트, 예: {{간결_날짜}} */
  children: React.ReactNode;
  /** 칩 옆 작은 설명, 예: "07/23" */
  hint?: string;
  style?: React.CSSProperties;
}
