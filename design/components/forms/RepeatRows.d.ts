export interface RepeatRowsProps<T = any> {
  items: T[];
  /** 각 행 내부 렌더러 — 모바일에서 세로로 깨지지 않게 grid 권장 */
  renderItem: (item: T, index: number) => React.ReactNode;
  onAdd?: () => void;
  onRemove?: (index: number) => void;
  /** 추가 버튼 라벨, 예: "＋ 일정 추가" */
  addLabel?: string;
  /** 이 개수 이하로는 삭제 비활성 (기본 1) */
  minRows?: number;
  style?: React.CSSProperties;
}
