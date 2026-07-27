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

/**
 * 공개 페이지(모집 공고·지원서)용 큰 행동 버튼.
 *
 * 관리 콘솔의 각진 파란 버튼은 지원자용 화면에서 사무적으로 보인다.
 * 알약 형태 + 넉넉한 여백 + 낮은 대비의 그림자로 부드럽게 하되, 장식은 더하지 않아 깔끔함을 유지한다.
 * 눌림 피드백은 색으로만 준다(레이아웃을 흔드는 scale 변형은 쓰지 않는다).
 */
const CTA_BASE =
  'inline-flex min-h-tap items-center justify-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-bold no-underline transition-colors duration-200 disabled:opacity-60';

// 색은 산호(coral)를 쓴다. 로그인 화면의 "가입하기"가 이미 산호색이라 이 앱에서 산호 = "환영하는 행동"이고,
// 따뜻한 크림 배경 위에서 파란 버튼보다 훨씬 부드럽게 얹힌다(파란색은 콘솔의 업무용 색).
export const ctaPrimary = `${CTA_BASE} bg-coral-500 text-white shadow-card hover:bg-coral-600 hover:text-white active:bg-coral-700`;
export const ctaQuiet = `${CTA_BASE} border-[1.5px] border-ink-200 bg-white text-ink-700 hover:bg-cream-50 hover:text-ink-900 hover:no-underline`;
export const ctaDisabled = `${CTA_BASE} cursor-not-allowed bg-ink-200 text-ink-500`;

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

const CONTROL = 'w-full rounded-xl border-[1.5px] border-ink-200 bg-white text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-blue-500';

/**
 * 컨트롤 높이는 반드시 이 prop 으로 고른다.
 * className 에 `h-9` 같은 높이 유틸리티를 덧붙이면 기본 `h-control`(48px)과 같은 특이도로 충돌해서
 * 어느 쪽이 이기는지 CSS 출력 순서에 달리게 된다 — 실제로 툴바 셀렉트가 버튼과 높이가 안 맞던 원인이다.
 */
export type ControlSize = 'sm' | 'md';
const SIZE: Record<ControlSize, string> = {
  sm: 'h-control-sm text-[13px]',
  md: 'h-control text-[15px]',
};

export function Input({
  className = '',
  uiSize = 'md',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { uiSize?: ControlSize }) {
  return <input className={`${SIZE[uiSize]} px-3.5 ${CONTROL} ${className}`} {...props} />;
}

// ref 를 받는다(AutoGrowTextarea 가 높이를 재기 위해 필요 — React 19 는 ref 도 일반 prop).
export function Textarea({ className = '', ...props }: ComponentPropsWithRef<'textarea'>) {
  return <textarea className={`px-3.5 py-2.5 leading-relaxed ${CONTROL} ${className}`} {...props} />;
}

export function Select({
  className = '',
  uiSize = 'md',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { uiSize?: ControlSize }) {
  return <select className={`${SIZE[uiSize]} px-3 ${CONTROL} ${className}`} {...props} />;
}

/**
 * 라벨이 붙은 소형 툴바 컨트롤. 목록 화면 상단의 필터·기수 선택처럼
 * "설명 + 컨트롤"이 한 덩어리로 보여야 하는 곳에 쓴다.
 * 라벨을 컨트롤 옆에 떠 있는 텍스트로 두면 정렬이 흐트러지고 어수선해 보인다.
 */
export function ToolbarSelect({
  label,
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  // 높이는 min-h-tap(44px)에 맞춘다 — 옆에 서는 버튼들이 min-h-tap 때문에 실측 44px 이라
  // 여기만 36px 이면 한 줄에서 눈에 띄게 어긋난다(접근성 최소 터치 타깃도 44px).
  return (
    <label className="inline-flex h-control-sm min-h-tap items-center gap-0 overflow-hidden rounded-xl border-[1.5px] border-ink-200 bg-white focus-within:border-blue-500">
      <span className="flex h-full shrink-0 items-center border-r border-ink-100 bg-cream-50 px-2.5 text-[12px] font-semibold text-ink-500">
        {label}
      </span>
      <select
        className={`h-full min-w-0 border-0 bg-transparent px-2 pr-7 text-[13px] font-medium text-ink-900 outline-none ${className}`}
        {...props}
      />
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="whitespace-pre-line text-[13px] text-error" role="alert">
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

/**
 * 화면 상단의 일회성 처리 결과 문구.
 *
 * 신입 모집 화면들은 결과를 `setMessage('✅ …')` / `setMessage('❌ …')` 처럼 이모지 접두사로
 * 구분해 왔는데, 표시는 항상 같은 회색 상자여서 성공·실패가 색으로 드러나지 않았다.
 * 여기서 접두사를 읽어 톤을 정하고 이모지는 지운 뒤 아이콘으로 바꾼다.
 * 실패는 role="alert" 로 즉시 읽히게 하고, 성공은 role="status" 로 방해 없이 알린다.
 */
export function StatusMessage({ text }: { text: string }) {
  if (!text) return null;
  const failed = /^\s*(❌|⚠️?|🚨|🛑)/.test(text);
  const ok = /^\s*(✅|🎉)/.test(text);
  const body = text.replace(/^\s*(❌|⚠️?|🚨|🛑|✅|🎉)\s*/, '');
  const tone = failed
    ? 'border-coral-100 bg-coral-50 text-coral-700'
    : ok
      ? 'border-success bg-success-100 text-success-700'
      : 'border-ink-200 bg-cream-50 text-ink-900';

  return (
    <div
      role={failed ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-xl border p-3 text-[13px] font-semibold ${tone}`}
    >
      <Icon name={failed ? 'alert' : ok ? 'check' : 'info'} size={16} className="mt-px shrink-0" />
      <span className="min-w-0 flex-1">{body}</span>
    </div>
  );
}

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
