'use client';
import { useState } from 'react';
import { Card, InfoText } from '@/components/ui';
import { Icon } from '@/components/icon';
import { Markdown } from '@/components/markdown';
import type { Guide } from '@/guides/content';

/**
 * 가이드는 길다. 한 화면에 다 펼치면 자기에게 필요한 부분을 못 찾으므로
 * 가이드별로 접었다 펴게 하고, **자기 역할 가이드(맨 마지막 것)를 기본으로 펴 둔다**.
 */
export function GuidesPanel({ guides }: { guides: Guide[] }) {
  const [openId, setOpenId] = useState<string>(guides[guides.length - 1]?.id ?? '');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold text-ink-900">사용 가이드</h1>
        <InfoText>이 사이트를 어떻게 쓰는지 정리했어요. 필요한 것만 골라 보세요.</InfoText>
      </div>

      {guides.map((g) => {
        const open = openId === g.id;
        return (
          <Card key={g.id} className="space-y-3">
            <button
              onClick={() => setOpenId(open ? '' : g.id)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <strong className="block text-base font-semibold text-ink-900">{g.title}</strong>
                <span className="text-[13px] text-ink-500">{g.summary}</span>
              </span>
              <Icon
                name="chevronDown"
                size={18}
                className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>
            {open ? (
              <div className="border-t border-cream-200 pt-3">
                <Markdown>{g.body}</Markdown>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
