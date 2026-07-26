'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

export function RecruitNav() {
  const pathname = usePathname();

  const links = [
    { href: '/admin/recruit/notice-edit', step: '0', label: '공고 및 마감 설정', role: '홍보팀·회장단' },
    { href: '/admin/recruit/upload', step: '1', label: '지원자 수동 등록', role: '회장단' },
    { href: '/admin/recruit/screening', step: '2', label: '서류 심사', role: '운영진' },
    { href: '/admin/recruit/tally', step: '3', label: '서류 집계·확정', role: '회장단' },
    { href: '/admin/recruit/interview/assign', step: '4', label: '면접 배정', role: '회장단' },
    { href: '/admin/recruit/interview/console', step: '5', label: '면접 당일 콘솔', role: '운영진' },
    { href: '/admin/recruit/final', step: '6', label: '최종 결정 및 공개', role: '회장단' },
  ];

  return (
    <nav className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-ink-200 bg-white p-2 shadow-card">
      {links.map((link) => {
        const isActive = pathname === link.href;
        return (
          <a
            key={link.href}
            href={link.href}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-all no-underline ${
              isActive
                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-500'
                : 'text-ink-700 hover:bg-cream-100 hover:text-ink-900'
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                isActive ? 'bg-white/25 text-white' : 'bg-cream-200 text-ink-700'
              }`}
            >
              {link.step}
            </span>
            <span>{link.label}</span>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                isActive ? 'bg-white/20 text-white' : 'bg-cream-200/60 text-ink-500'
              }`}
            >
              {link.role}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
