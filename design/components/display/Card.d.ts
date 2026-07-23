export interface CardProps {
  /** 카드 헤더 제목 (옵션) */
  title?: React.ReactNode;
  /** 헤더 우측 액션 (옵션) */
  action?: React.ReactNode;
  padding?: number | string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
