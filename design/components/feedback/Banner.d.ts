export interface BannerProps {
  kind?: "info" | "warning" | "error" | "success";
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** 기본 아이콘 덮어쓰기 (Icon name) */
  icon?: string;
  /** 우측 액션 버튼 */
  action?: React.ReactNode;
  style?: React.CSSProperties;
}
