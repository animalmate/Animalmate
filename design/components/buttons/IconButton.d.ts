export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  /** 접근성 라벨 (필수) */
  label: string;
  variant?: "ghost" | "solid" | "danger";
  /** 시각적 크기 px (터치 타깃은 항상 44 이상) */
  size?: number;
}
