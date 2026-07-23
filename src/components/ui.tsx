// 최소 UI 프리미티브(Tailwind 기본). 시안(docs/06-DESIGN.md) 도착 후 스킨 교체 예정.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function SecondaryButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-gray-500">{hint}</span> : null}
    </label>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm ${className}`} {...props} />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-red-600">{children}</p>;
}

export function InfoText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-gray-600">{children}</p>;
}

const STATUS_LABEL: Record<string, string> = {
  draft: '작성중',
  ready: '완성',
  scheduled: '발행 대기',
  published: '발행됨',
  failed: '실패',
};

export function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'published'
      ? 'bg-green-100 text-green-800'
      : status === 'failed'
        ? 'bg-red-100 text-red-800'
        : status === 'scheduled'
          ? 'bg-blue-100 text-blue-800'
          : status === 'ready'
            ? 'bg-gray-200 text-gray-800'
            : 'bg-yellow-100 text-yellow-800';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{STATUS_LABEL[status] ?? status}</span>;
}
