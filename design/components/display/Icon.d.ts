export interface IconProps {
  /** 아이콘 이름: plus | x | check | copy | chevronDown | chevronRight | calendar | clock | users | link | external | logout | menu | home | doc | board | key | alert | info | trash | edit | mail | refresh | filter | megaphone | layers */
  name: string;
  /** px 크기 (기본 20) */
  size?: number;
  strokeWidth?: number;
  style?: React.CSSProperties;
}
