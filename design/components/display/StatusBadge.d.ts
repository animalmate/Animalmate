export interface StatusBadgeProps {
  /** 예약 상태 */
  status: "draft" | "ready" | "scheduled" | "published" | "failed";
  style?: React.CSSProperties;
}
