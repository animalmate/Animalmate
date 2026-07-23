export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary=주요 실행, secondary=보조/테두리, destructive=삭제/위험, text=링크형 */
  variant?: "primary" | "secondary" | "destructive" | "text";
  size?: "md" | "sm";
  /** true면 스피너 표시 + 비활성 */
  loading?: boolean;
  /** 라벨 앞 아이콘 (<Icon/>) */
  icon?: React.ReactNode;
  /** 가로 꽉 채우기 (모바일 CTA) */
  block?: boolean;
  children?: React.ReactNode;
}
