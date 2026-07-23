export interface EmptyStateProps {
  /** Icon name (기본 doc) */
  icon?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** CTA 버튼 */
  action?: React.ReactNode;
  style?: React.CSSProperties;
}
