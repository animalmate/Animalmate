export interface CopyButtonProps {
  /** 클립보드에 복사할 값 */
  value: string;
  label?: string;
  size?: "md" | "sm";
  style?: React.CSSProperties;
}
