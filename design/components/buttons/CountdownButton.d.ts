export interface CountdownButtonProps {
  /** 쿨다운 초 (기본 60) */
  seconds?: number;
  /** 재전송 실행 콜백 */
  onResend?: () => void;
  children?: React.ReactNode;
  /** 마운트 시 바로 쿨다운 시작 (2단계 진입 직후) */
  autoStart?: boolean;
  style?: React.CSSProperties;
}
