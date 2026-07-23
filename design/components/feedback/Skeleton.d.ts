export interface SkeletonProps {
  variant?: "line" | "card";
  width?: number | string;
  height?: number | string;
  /** 같은 블록 반복 개수 */
  count?: number;
  style?: React.CSSProperties;
}
