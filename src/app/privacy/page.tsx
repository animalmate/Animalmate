// 개인정보처리방침 — **비로그인 공개**. 가입 화면과 지원서에서 링크한다.
// 원문은 src/legal/privacy.ts 한 곳에만 둔다(화면과 문서가 어긋나지 않게).
//
// 서버 컴포넌트라 CONTACT_EMAIL 을 서버에서 읽는다. 값이 없으면 주소를 지어내지 않고
// "운영진에게 문의" 문구로만 안내한다.

import type { Metadata } from 'next';
import { privacySections, contactEmail, PRIVACY_VERSION, type PrivacySection } from '@/legal/privacy';

export const metadata: Metadata = {
  title: '개인정보처리방침 — 애니멀메이트',
  description: '애니멀메이트가 수집하는 개인정보와 이용·보관·파기 기준.',
};

export const dynamic = 'force-dynamic'; // CONTACT_EMAIL 변경이 재배포 없이 반영되게

/** 원문의 **강조** 표시만 굵게 바꾼다. 우리가 쓴 문자열이라 HTML 주입 경로가 없다. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-ink-900">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function Section({ section }: { section: PrivacySection }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-bold text-ink-900">{section.heading}</h2>

      {section.paragraphs?.map((p, i) => (
        <p key={i} className="text-[14px] leading-relaxed text-ink-700">
          <Rich text={p} />
        </p>
      ))}

      {section.table ? (
        // 표는 좁은 화면에서 가로로 넘칠 수 있다 — 페이지가 아니라 표만 스크롤되게 감싼다.
        <div className="overflow-x-auto rounded-xl border border-ink-200">
          <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">
            <thead className="bg-cream-100">
              <tr>
                {section.table.head.map((h) => (
                  <th key={h} className="border-b border-ink-200 px-3 py-2.5 font-semibold text-ink-900">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row, ri) => (
                <tr key={ri} className="align-top">
                  {row.map((cell, ci) => (
                    <td key={ci} className="border-b border-ink-100 px-3 py-2.5 leading-relaxed text-ink-700">
                      <Rich text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {section.bullets ? (
        <ul className="space-y-1.5 pl-1">
          {section.bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-ink-700">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-300" />
              <span>
                <Rich text={b} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default function PrivacyPage() {
  const sections = privacySections(contactEmail());

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <header className="space-y-2 border-b border-ink-100 pb-6">
        <a href="/" className="inline-flex items-center gap-2 no-underline">
          <img src="/logo.png" alt="애니멀메이트" className="h-9 w-9 rounded-full" />
          <span className="text-[15px] font-bold text-ink-900">애니멀메이트</span>
        </a>
        <h1 className="text-[24px] font-bold text-ink-900">개인정보처리방침</h1>
        <p className="text-[13px] text-ink-500">개정일 {PRIVACY_VERSION}</p>
      </header>

      <div className="mt-8 space-y-9">
        {sections.map((s) => (
          <Section key={s.heading} section={s} />
        ))}
      </div>

      <footer className="mt-12 border-t border-ink-100 pt-5">
        <a href="/" className="text-[13px] text-ink-500 underline">
          홈으로
        </a>
      </footer>
    </main>
  );
}
