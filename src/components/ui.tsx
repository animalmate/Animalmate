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
      {/* whitespace-pre-line: 여러 줄로 쓴 라벨(자기소개서 문항 등)의 줄바꿈을 그대로 보여 준다. */}
      <span className="block whitespace-pre-line text-sm font-semibold text-ink-900">
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

/**
 * `loading` 을 주면 목록을 받아오는 동안 그 사실을 보여 준다.
 *
 * 왜 필요한가: 목록을 아직 못 받았을 때 빈 셀렉트를 그대로 두면, 열어 봐도 아무것도 없어서
 * 사용자는 "고를 게 없다"고 오해한다(실제로는 1~3초 뒤에 채워진다). 컨트롤을 아예 감췄다가
 * 나중에 나타나게 하면 레이아웃까지 튄다. 자리는 지키고 상태만 알려 주는 쪽이 맞다.
 */
export function Select({
  className = '',
  uiSize = 'md',
  loading = false,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { uiSize?: ControlSize; loading?: boolean }) {
  const cls = `${SIZE[uiSize]} px-3 ${CONTROL} ${className}`;
  if (loading) {
    return (
      <select className={cls} disabled aria-busy="true">
        <option>불러오는 중…</option>
      </select>
    );
  }
  return (
    <select className={cls} {...props}>
      {children}
    </select>
  );
}

/**
 * 라벨이 붙은 소형 툴바 컨트롤. 목록 화면 상단의 필터·기수 선택처럼
 * "설명 + 컨트롤"이 한 덩어리로 보여야 하는 곳에 쓴다.
 * 라벨을 컨트롤 옆에 떠 있는 텍스트로 두면 정렬이 흐트러지고 어수선해 보인다.
 */
export function ToolbarSelect({
  label,
  className = '',
  loading = false,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; loading?: boolean }) {
  // 높이를 44px(h-11)로 못 박는다. 옆에 서는 버튼이 min-h-tap 때문에 실측 44px 인데,
  // h-control-sm(36)+min-h-tap 조합은 테두리 계산 탓에 42px 로 떨어져 2px 어긋났다.
  // 44px 은 접근성 최소 터치 타깃이기도 하다.
  //
  // 테두리는 `ink-400`. 예전 `ink-200`(당시 #DDD6C8)은 흰 바탕과 대비가 **1.45:1** 뿐이라
  // 컨트롤의 경계가 사라져 보였다(2026-08-05 사용자 보고). 한 단계만 올린 ink-300 도 1.99:1 로
  // 화면에서 거의 차이가 없었고(실물 비교), ink-400 이 WCAG 1.4.11(비텍스트 대비 3:1)을 넘긴다.
  // ※ 괄호 안 수치는 **그때의 누런 팔레트 기준**이다. 2026-08-06 중립색 전환 뒤 ink-400 은
  //   3.28:1 로 오히려 올랐다(명도를 안 건드리고 채도만 내렸다 — 07-DECISIONS 108).
  //
  // **카드 안 컨트롤(`CONTROL`·`SecondaryButton`)보다 진한 것이 맞다.** 툴바는 카드 밖 배경에
  // 맨몸으로 서 있어서 감싸는 상자도 라벨 구조도 없다 — 경계선이 그 자리에서 유일한 형태 정보다.
  return (
    <label className="inline-flex h-11 items-center gap-0 overflow-hidden rounded-xl border-[1.5px] border-ink-400 bg-white focus-within:border-blue-500">
      <span className="flex h-full shrink-0 items-center border-r border-ink-100 bg-cream-50 px-2.5 text-[12px] font-semibold text-ink-500">
        {label}
      </span>
      {loading ? (
        <select
          className={`h-full min-w-0 border-0 bg-transparent px-2 pr-7 text-[13px] font-medium text-ink-500 outline-none ${className}`}
          disabled
          aria-busy="true"
        >
          <option>불러오는 중…</option>
        </select>
      ) : (
        <select
          className={`h-full min-w-0 border-0 bg-transparent px-2 pr-7 text-[13px] font-medium text-ink-900 outline-none ${className}`}
          {...props}
        >
          {children}
        </select>
      )}
    </label>
  );
}

/**
 * 툴바에서 `ToolbarSelect` 옆에 서는 버튼.
 *
 * `SecondaryButton` 을 그냥 쓰면 안 된다 — `h-control-sm`(36) + `min-h-tap` 조합이 테두리 계산 탓에
 * 실측 42px 로 떨어져 셀렉트(44px)와 2px 어긋난다. `className` 에 `h-11` 을 덧붙이는 것도 답이 아니다:
 * 같은 특이도로 충돌해 어느 쪽이 이기는지 CSS 출력 순서에 달린다(`ControlSize` 주석의 함정).
 * 그래서 높이를 처음부터 44px 로 박은 버튼을 따로 둔다.
 * 테두리는 옆의 `ToolbarSelect` 와 같은 `ink-400` — 이유는 그쪽 주석 참고.
 */
export function ToolbarButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border-[1.5px] border-ink-400 bg-white px-3 text-[13px] font-semibold text-ink-900 transition-colors hover:bg-cream-50 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

/**
 * 팀 선택 <option> 목록. 목록은 teams 테이블에서 온다(useTeams).
 * 불러오는 중과 "팀이 없음"을 구분해 보여 준다 — 빈 셀렉트만 뜨면 어느 쪽인지 알 수 없다.
 */
export function TeamOptions({ teams, loading }: { teams: string[]; loading: boolean }) {
  if (loading) return <option disabled>불러오는 중…</option>;
  if (teams.length === 0) return <option disabled>등록된 팀이 없습니다</option>;
  return (
    <>
      {teams.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </>
  );
}

/**
 * 넓은 표를 화면 폭에 따라 표(PC)와 카드 목록(모바일)으로 바꿔 보여 준다.
 *
 * `overflow-x-auto` 로 부족한 이유: 가로 스크롤은 표가 **깨지지 않게** 할 뿐 폰에서 **쓸 수 있게**
 * 하지는 않는다. 9열 표를 `text-xs` 로 밀어 가며 체크박스를 누르는 건 사실상 불가능하고,
 * 열 제목이 화면 밖으로 나가면 지금 보는 숫자가 무엇인지도 알 수 없다.
 * 데이터와 조작은 그대로 두고 **배치만** 바꾼다 — 라우트도 컴포넌트 트리도 나누지 않는다.
 *
 * 중단점은 `lg`(1024): 노트북부터 표, 태블릿 세로 이하는 카드.
 * (`md`(768)는 콘솔 네비의 햄버거 전환에 이미 쓰고 있어 의미가 겹치지 않게 띄웠다.)
 */
export function TableCards({ table, cards }: { table: ReactNode; cards: ReactNode }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-cream-200 bg-white shadow-card lg:block">{table}</div>
      <ul className="space-y-2.5 lg:hidden">{cards}</ul>
    </>
  );
}

/**
 * `TableCards` 의 모바일 쪽 한 줄 = 카드 하나.
 *
 * `onSelect` 를 주면 머리글 전체가 선택 영역이 된다 — 폰에서 20px 네모만 노리게 하지 않는다.
 * 셀렉트처럼 **따로 눌러야 하는 컨트롤은 `children` 에** 둔다(머리글에 넣으면 라벨이 삼켜 버린다).
 */
export function RowCard({
  title,
  badge,
  selected = false,
  onSelect,
  selectLabel,
  children,
}: {
  title: ReactNode;
  badge?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  selectLabel?: string;
  children?: ReactNode;
}) {
  const head = (
    <>
      {onSelect ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label={selectLabel}
          className="h-5 w-5 shrink-0 rounded border-ink-300 text-blue-600 focus:ring-blue-500"
        />
      ) : null}
      <span className="min-w-0 flex-1 text-[15px] font-bold text-ink-900">{title}</span>
      {badge}
    </>
  );

  return (
    <li
      className={`rounded-xl border p-3.5 shadow-card transition-colors ${
        selected ? 'border-blue-300 bg-blue-50/40' : 'border-cream-200 bg-white'
      }`}
    >
      {onSelect ? (
        <label className="flex min-h-tap cursor-pointer items-center gap-2.5">{head}</label>
      ) : (
        <div className="flex items-center gap-2.5">{head}</div>
      )}
      {children ? <dl className="mt-2.5 space-y-2 border-t border-cream-100 pt-2.5">{children}</dl> : null}
    </li>
  );
}

// `RowCard` 안의 "항목 이름 → 값" 한 줄. 표에서 열 제목이 하던 일을 카드에서는 이 라벨이 한다.
export function CardField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <dt className="shrink-0 font-semibold text-ink-500">{label}</dt>
      <dd className="min-w-0 text-right text-ink-900">{children}</dd>
    </div>
  );
}

/**
 * `CardField` 와 같지만 값을 **라벨 아래 줄에 폭 전체로** 놓는다. 셀렉트·입력칸에 쓴다.
 *
 * 왜 나눠 뒀나: 컨트롤을 `CardField` 의 값 칸에 넣으면 그 칸이 내용만큼만 넓어지는데,
 * `Select`·`Input` 은 기본 `w-full` 이라 서로 크기를 되묻는 꼴이 되어 아주 좁게 눌린다
 * (`w-40` 같은 폭을 덧붙여도 같은 특이도로 충돌해서 CSS 출력 순서에 결과가 달린다 —
 * 위 `ControlSize` 주석의 높이 문제와 같은 함정이다). 슬롯 이름처럼 긴 값도 여기서는 다 읽힌다.
 */
export function CardBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 text-[13px]">
      <dt className="font-semibold text-ink-500">{label}</dt>
      <dd className="text-ink-900">{children}</dd>
    </div>
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
  publishing: '업로드 중',
  published: '업로드됨',
  failed: '실패',
};

// 색상 변수가 따로 없는 상태는 성격이 가장 가까운 상태의 색을 빌려 쓴다.
// (publishing 은 대기와 완료 사이의 짧은 진행 상태라 '대기' 색을 그대로 쓴다.)
const STATUS_COLOR_KEY: Record<string, string> = { publishing: 'scheduled' };

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS[status] ?? status;
  const key = STATUS[status] ? (STATUS_COLOR_KEY[status] ?? status) : 'draft';
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
