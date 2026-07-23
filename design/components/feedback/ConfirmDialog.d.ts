export interface ConfirmDialogProps {
  open?: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 삭제·취소·재발급 등 파괴적 액션이면 true */
  danger?: boolean;
  loading?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  /** 설명 아래 추가 콘텐츠 (경고 배너 등) */
  children?: React.ReactNode;
}
