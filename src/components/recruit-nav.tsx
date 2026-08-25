'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { isPrivileged, type Role } from '@/auth/permissions';
import { Icon } from './icon';

// 신입 모집은 0→6 순서가 있는 절차라 내비를 단계 흐름으로 보여준다.
// 역할 표기는 각 화면 제목에 이미 있어 내비에서는 뺐다 — 폭이 좁으면 줄바꿈으로 흘린다
// (8단계가 되면서 1000px 한 줄에는 더 이상 들어가지 않는다).
//
// manage=true 인 단계는 회장단 전용(recruit.manage, 09-RECRUIT-DESIGN §4)이다.
// 운영진에게도 **보여주되 누를 수 없게** 한다 — 숨기면 전체 절차가 몇 단계인지 알 수 없고,
// 그냥 링크로 두면 눌렀을 때 requireBoard 가 아무 설명 없이 홈으로 돌려보내 "고장난 것"처럼 보인다.
//
// 0단계만 예외다: 회장단 외에 **공고 편집 권한이 켜진 팀**(홍보팀)도 들어간다(결정 140).
// 그래서 `notice: true` 로 따로 표시하고 `canEditNotice` 로 잠금을 푼다 — 이 프로퍼티가 없으면
// 홍보팀에게 "들어갈 수 있는데 자물쇠가 걸린" 칸이 보인다.
const LINKS = [
  { href: '/admin/recruit/notice-edit', step: '0', label: '공고·마감 설정', manage: true, notice: true },
  { href: '/admin/recruit/screening', step: '1', label: '서류 심사', manage: false },
  { href: '/admin/recruit/tally', step: '2', label: '서류 집계·확정', manage: true },
  { href: '/admin/recruit/interview/assign', step: '3', label: '면접 배정', manage: true },
  { href: '/admin/recruit/interview/console', step: '4', label: '면접 콘솔', manage: false },
  { href: '/admin/recruit/review', step: '5', label: '최종 검토', manage: false },
  { href: '/admin/recruit/final', step: '6', label: '최종 결정·공개', manage: true },
];

/**
 * `canEditNotice` = 이 사람이 0단계(공고 편집)에 들어갈 수 있는가.
 * 서버 컴포넌트(page.tsx)가 `canEditRecruitNotice(actor)` 로 계산해 내려준다 —
 * 여기서 다시 판단하지 않는 이유는 팀 플래그가 Actor 안에만 있고, 이 컴포넌트는
 * 표시만 맡기 때문이다(진짜 게이트는 page.tsx 와 API 라우트).
 * 회장단 전용 화면(2·3·6단계)은 넘기지 않아도 된다 — 거기 오는 사람은 이미 회장단이다.
 */
export function RecruitNav({ role, canEditNotice = false }: { role: Role; canEditNotice?: boolean }) {
  const pathname = usePathname();
  const canManage = isPrivileged(role);

  return (
    <nav aria-label="신입 모집 단계" className="mb-6">
      <ol className="flex flex-wrap gap-1.5 rounded-2xl border border-ink-200 bg-white p-2 shadow-card">
        {LINKS.map((link) => {
          const isActive = pathname === link.href;
          const locked = link.manage && !canManage && !(link.notice && canEditNotice);

          if (locked) {
            return (
              <li key={link.href}>
                <span
                  title="회장단만 사용할 수 있는 단계입니다"
                  className="flex min-h-tap cursor-not-allowed items-center gap-2 rounded-xl border-[1.5px] border-transparent px-3 py-2 text-[13px] font-semibold text-ink-300"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-cream-100 text-[11px] font-bold text-ink-300">
                    {link.step}
                  </span>
                  <span>{link.label}</span>
                  <Icon name="lock" size={13} className="shrink-0" />
                  <span className="sr-only">회장단 전용</span>
                </span>
              </li>
            );
          }

          return (
            <li key={link.href}>
              <a
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                // 현재 단계는 색을 채우지 않고 테두리로만 표시한다.
                // 파란 배경 위 흰 글씨는 이 크기(13px)에서 잘 안 읽혔다.
                className={`flex min-h-tap items-center gap-2 rounded-xl px-3 py-2 text-[13px] no-underline transition-colors ${
                  isActive
                    ? 'border-[1.5px] border-ink-900 font-bold text-ink-900'
                    : 'border-[1.5px] border-transparent font-semibold text-ink-500 hover:bg-cream-100 hover:text-ink-900'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
                    isActive ? 'bg-cream-200 text-ink-900' : 'bg-cream-200 text-ink-700'
                  }`}
                >
                  {link.step}
                </span>
                <span>{link.label}</span>
              </a>
            </li>
          );
        })}
      </ol>
      {!canManage ? (
        <p className="mt-1.5 px-1 text-[12px] text-ink-400">
          자물쇠 표시된 단계는 회장단이 진행합니다. 운영진은 서류 심사·면접 콘솔에서 채점하고, 최종 검토를 함께 봅니다.
          {canEditNotice ? ' 공고 편집 권한이 있어 0번 공고 작성도 맡습니다.' : ''}
        </p>
      ) : null}
    </nav>
  );
}
