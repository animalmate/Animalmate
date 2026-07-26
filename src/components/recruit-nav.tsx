'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

export function RecruitNav() {
  const pathname = usePathname();

  const links = [
    { href: '/admin/recruit/upload', label: '1. 지원자 업로드 (회장단)' },
    { href: '/admin/recruit/screening', label: '2. 서류 심사 (운영진)' },
    { href: '/admin/recruit/tally', label: '3. 서류 집계·확정 (회장단)' },
    { href: '/admin/recruit/interview/assign', label: '4. 면접 배정 (회장단)' },
    { href: '/admin/recruit/interview/console', label: '5. 면접 콘솔 (운영진)' },
    { href: '/admin/recruit/final', label: '6. 최종 결정 및 공개 (회장단)' },
  ];

  return (
    <div className="flex flex-wrap gap-2 border-b border-border pb-3 mb-6">
      {links.map((link) => {
        const isActive = pathname === link.href;
        return (
          <a
            key={link.href}
            href={link.href}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors no-underline ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {link.label}
          </a>
        );
      })}
    </div>
  );
}
