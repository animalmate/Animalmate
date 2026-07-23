export interface ToastProps {
  kind?: "success" | "error" | "info";
  children: React.ReactNode;
  onClose?: () => void;
  style?: React.CSSProperties;
}
