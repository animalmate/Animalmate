import type { Metadata } from 'next';
import { db } from '@/db/client';
import { loadPublicContacts, type ContactGroup } from '@/org/public-contacts';
import { PublicShell } from '@/components/public-shell';
import { Icon } from '@/components/icon';

export const metadata: Metadata = {
  title: '연락처 | 애니멀메이트',
  description: '애니멀메이트 회장단·대외사업팀 연락처와 인스타그램·카카오톡 채널 안내입니다.',
};

// 회장단 명단을 DB 에서 읽으므로 매 요청 새로 그린다 — 임원이 바뀌었는데 캐시된 이름이
// 남아 있으면 이 화면은 안내가 아니라 오정보다.
export const dynamic = 'force-dynamic';

const SNS_HANDLE = '@Animalmate_';
const CHANNELS = [
  { label: '인스타그램', href: 'https://www.instagram.com/animalmate_/' },
  // 카카오톡 채널 주소는 검색용 아이디(@Animalmate_)와 다르다 — 짐작하면 404 로 간다.
  // 이 값은 2026-08-28 사용자가 확인해 준 실제 채널 주소다.
  { label: '카카오톡 채널', href: 'http://pf.kakao.com/_xlxfbgn' },
];

export default async function ContactPage() {
  const contacts = await loadPublicContacts(db);

  return (
    <PublicShell
      title="CONTACT"
      lead={<>궁금한 점은 인스타그램 DM 이나 카카오톡 채널로 물어봐 주세요.</>}
    >
      <div className="space-y-8">
        {contacts.length > 0 ? <PeopleCard groups={contacts} /> : null}
        <ChannelsCard />
      </div>

      {/* 제작자 크레딧 — 이름만 적는다. **여기엔 이메일을 두지 않는다**(2026-08-29 사용자 지정):
          이 화면은 지원자·외부인이 문의처를 찾으러 오는 곳이라, 만든 사람 개인 주소가 함께 서면
          그리로 문의가 간다. 문의 창구는 위 인스타그램·카카오톡 채널이다.
          개인 연락처가 필요한 회원용 경로는 /login 크레딧에 남겨 둔다. */}
      <p className="pt-8 text-center text-[11px] leading-relaxed text-ink-400">사이트제작 한채훈</p>
    </PublicShell>
  );
}

function PeopleCard({ groups }: { groups: ContactGroup[] }) {
  return (
    <section className="space-y-5 rounded-3xl border border-cream-200 bg-white p-6 shadow-card sm:p-9">
      <h2 className="flex items-center gap-2 text-base font-bold tracking-wide text-ink-900">
        <Icon name="users" size={18} className="text-coral-500" />
        운영진
      </h2>
      {/* 직함 하나에 이름 여럿. 회장·부회장·총무를 나누지 않으므로 "회장단" 한 줄에 세 명이 선다. */}
      <ul className="space-y-2">
        {groups.map((g) => (
          <li
            key={g.label}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-cream-50 px-4 py-3"
          >
            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[12px] font-bold text-ink-700 shadow-card">
              {g.label}
            </span>
            {g.names.map((n, i) => (
              // 이름이 같은 사람이 둘 있을 수 있어 key 에 순번을 함께 쓴다.
              <span key={`${n}:${i}`} className="text-[15px] font-semibold text-ink-900">
                {n}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

// 실제로 답이 오는 창구는 이 둘이다. 개인 이메일은 싣지 않는다(org/public-contacts.ts 주석).
function ChannelsCard() {
  return (
    <section className="space-y-5 rounded-3xl border border-cream-200 bg-white p-6 shadow-card sm:p-9">
      <h2 className="flex items-center gap-2 text-base font-bold tracking-wide text-ink-900">
        <Icon name="chat" size={18} className="text-coral-500" />
        문의 창구
      </h2>
      <ul className="space-y-2">
        {CHANNELS.map((c) => (
          <li key={c.label}>
            <a
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-tap items-center justify-between gap-3 rounded-2xl border border-cream-200 px-4 py-3 text-ink-900 no-underline transition-colors hover:bg-cream-50 hover:text-ink-900 hover:no-underline"
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-ink-500">{c.label}</span>
                <span className="block truncate text-[15px] font-bold">{SNS_HANDLE}</span>
              </span>
              <Icon name="external" size={16} className="shrink-0 text-ink-400" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
