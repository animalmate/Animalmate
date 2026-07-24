// 애니멀메이트 디자인 시스템 UI 프리미티브(Tailwind). 토큰: docs/06-DESIGN.md / design/handoff.
import type { ButtonHTMLAttributes, ComponentPropsWithRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { Icon } from './icon';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-ink-200 bg-white p-5 shadow-card ${className}`}>{children}</div>;
}

// 주요 버튼(primary, 48px). 최소 터치 타깃 보장.
export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-control min-h-tap items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-[18px] text-[15px] font-semibold text-white transition-colors hover:bg-blue-600 active:bg-blue-700 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

// 보조 버튼(secondary, 36px) — 목록 행 액션 등.
export function SecondaryButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-control-sm min-h-tap items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-ink-300 bg-white px-3.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-cream-50 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

// 위험 버튼(destructive) — 삭제/취소 등.
export function DangerButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-control-sm min-h-tap items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-coral-100 bg-white px-3.5 text-sm font-semibold text-coral-600 transition-colors hover:bg-coral-50 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
  hint,
  error,
  required = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-ink-900">
        {label}
        {required ? <span className="ml-0.5 text-coral-600">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="block text-[13px] text-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="block text-[13px] text-ink-500">{hint}</span>
      ) : null}
    </label>
  );
}

const CONTROL = 'w-full rounded-xl border-[1.5px] border-ink-200 bg-white text-[15px] text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-blue-500';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`h-control px-3.5 ${CONTROL} ${className}`} {...props} />;
}

// ref 를 받는다(AutoGrowTextarea 가 높이를 재기 위해 필요 — React 19 는 ref 도 일반 prop).
export function Textarea({ className = '', ...props }: ComponentPropsWithRef<'textarea'>) {
  return <textarea className={`px-3.5 py-2.5 leading-relaxed ${CONTROL} ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`h-control px-3 ${CONTROL} ${className}`} {...props} />;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-[13px] text-error" role="alert">
      {children}
    </p>
  );
}

export function InfoText({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-ink-500">{children}</p>;
}

const STATUS: Record<string, string> = {
  draft: '작성중',
  ready: '완성',
  scheduled: '업로드 대기',
  published: '업로드됨',
  failed: '실패',
};

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS[status] ?? status;
  const key = STATUS[status] ? status : 'draft';
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold"
      style={{ background: `var(--status-${key}-bg)`, color: `var(--status-${key}-fg)` }}
    >
      <i className="h-[7px] w-[7px] rounded-full bg-current" />
      {label}
    </span>
  );
}

const ROLE: Record<string, { label: string; cls: string }> = {
  member: { label: '부원', cls: 'bg-ink-100 text-ink-500' },
  staff: { label: '운영진', cls: 'bg-blue-100 text-blue-700' },
  board: { label: '회장단', cls: 'bg-amber-100 text-amber-700' },
  sysadmin: { label: '관리자', cls: 'bg-ink-900 text-white' },
};

export function RoleBadge({ role }: { role: string }) {
  const r = ROLE[role] ?? ROLE.member;
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${r!.cls}`}>{r!.label}</span>;
}

const BANNER: Record<string, { icon: string; cls: string }> = {
  info: { icon: 'info', cls: 'bg-info-100 text-info-700' },
  warning: { icon: 'alert', cls: 'bg-warning-100 text-warning-700' },
  error: { icon: 'alert', cls: 'bg-error-100 text-error-700' },
  success: { icon: 'check', cls: 'bg-success-100 text-success-700' },
};

export function Banner({ kind = 'info', title, children }: { kind?: 'info' | 'warning' | 'error' | 'success'; title?: string; children?: ReactNode }) {
  const b = BANNER[kind] ?? BANNER.info;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[15px] ${b!.cls}`}>
      <Icon name={b!.icon} size={18} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {title ? <strong className="block text-sm font-semibold">{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}
