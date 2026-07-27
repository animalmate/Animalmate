'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

// 신입 모집은 0→5 순서가 있는 절차라 내비를 단계 흐름으로 보여준다.
// role 은 "누가 하는 단계인지"를 알려 준다(실제 차단은 서버가 한다 — 규칙 #6).
const LINKS = [
  { href: '/admin/recruit/notice-edit', step: '0', label: '공고·마감 설정', role: '회장단' },
  { href: '/admin/recruit/upload', step: '+', label: '지원자 등록', role: '회장단' },
  { href: '/admin/recruit/screening', step: '1', label: '서류 심사', role: '운영진' },
  { href: '/admin/recruit/tally', step: '2', label: '서류 집계·확정', role: '회장단' },
  { href: '/admin/recruit/interview/assign', step: '3', label: '면접 배정', role: '회장단' },
  { href: '/admin/recruit/interview/console', step: '4', label: '면접 콘솔', role: '운영진' },
  { href: '/admin/recruit/final', step: '5', label: '최종 결정·공개', role: '회장단' },
];

export function RecruitNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="신입 모집 단계" className="mb-6">
      <ol className="flex flex-wrap gap-1.5 rounded-2xl border border-ink-200 bg-white p-2 shadow-card">
        {LINKS.map((link) => {
          const isActive = pathname === link.href;
          return (
            <li key={link.href}>
              <a
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-tap items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold no-underline transition-colors ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-ink-700 hover:bg-cream-100 hover:text-ink-900'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
                    isActive ? 'bg-white/25 text-white' : 'bg-cream-200 text-ink-700'
                  }`}
                >
                  {link.step}
                </span>
                <span>{link.label}</span>
                <span
                  className={`hidden rounded px-1.5 py-0.5 text-[10px] font-medium sm:inline ${
                    isActive ? 'bg-white/20 text-white' : 'bg-cream-100 text-ink-500'
                  }`}
                >
                  {link.role}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
