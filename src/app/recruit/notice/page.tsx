import type { Metadata } from 'next';
import { getCohortById, listCohorts } from '@/recruit/cohorts';
import { Icon } from '@/components/icon';
import { CursorDog } from '@/components/cursor-dog';
import { ApplyButton } from './apply-button';

export const dynamic = 'force-dynamic';

// 공개 모집 공고에서 지원자에게 보여도 되는 필드만 추린다.
// (합격 축하 멘트·면접 장소 프리셋 같은 내부 값은 여기로 넘어오지 않는다.)
async function loadNotice(cohortId?: string) {
  const cohort = cohortId ? await getCohortById(cohortId) : ((await listCohorts())[0] ?? null);
  if (!cohort) return null;
  return {
    label: cohort.label,
    noticeContent: cohort.noticeContent,
    noticeImages: cohort.noticeImages ?? [],
    isClosed: cohort.isClosed,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const notice = await loadNotice();
  return {
    title: notice
      ? `${notice.label} 신입 부원 모집 | 애니멀메이트`
      : '신입 부원 모집 | 애니멀메이트',
    description: '유기동물 봉사 동아리 애니멀메이트가 함께할 신입 부원을 모집합니다.',
  };
}

export default async function PublicRecruitNoticePage() {
  const notice = await loadNotice();

  if (!notice) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream-25 p-4 font-sans">
        <div className="w-full max-w-md space-y-4 rounded-3xl border border-ink-100 bg-white p-8 text-center shadow-card">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cream-100 text-ink-400">
            <Icon name="megaphone" size={26} />
          </div>
          <h1 className="text-lg font-bold text-ink-900">지금은 모집 기간이 아니에요</h1>
          <p className="text-sm leading-relaxed text-ink-500">
            새 모집이 시작되면 이 페이지에서 안내드릴게요.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen font-sans">
      {/* 로그인·가입 화면과 같은 장식(커서 따라다니는 강아지). 컴포넌트 주석의 의도대로 모집 화면에도 붙인다. */}
      <CursorDog />
      {/* 히어로 — 로그인·가입 화면과 같은 인사 방식(동아리 로고 + 따뜻한 배경)을 쓴다.
          지원 버튼은 이 페이지에 하나뿐이다: 같은 버튼을 아래에 또 두면 어느 쪽이 진짜인지 헷갈린다. */}
      <header className="border-b border-cream-200 bg-gradient-to-b from-cream-100 to-cream-25 px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-xl space-y-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="애니멀메이트" className="mx-auto h-16 w-16 rounded-full" />

          <div className="space-y-2.5">
            <span className="inline-flex items-center rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-coral-700 shadow-card">
              {notice.label} 신입 모집
            </span>
            <h1 className="text-[26px] font-bold leading-snug tracking-tight text-ink-900 sm:text-[34px]">
              아이들 곁에 함께 있어 줄
              <br />
              사람을 찾습니다
            </h1>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-ink-500">
              유기동물 봉사 동아리 애니멀메이트가 {notice.label} 신입 부원을 모집합니다.
            </p>
          </div>

          <div className="pt-1">
            <ApplyButton isClosed={notice.isClosed} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-10 px-4 py-12 sm:py-16">
        {notice.noticeImages.length > 0 && (
          <section className="space-y-5">
            {notice.noticeImages.map((url, idx) => (
              // 외부/데이터 URL 포스터라 next/image 대신 img 를 쓴다.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt={`${notice.label} 모집 공고 이미지 ${idx + 1}`}
                loading="lazy"
                className="w-full rounded-3xl border border-cream-200 shadow-card"
              />
            ))}
          </section>
        )}

        {notice.noticeContent ? (
          <section className="space-y-5 rounded-3xl border border-cream-200 bg-white p-6 shadow-card sm:p-9">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
              <Icon name="doc" size={18} className="text-blue-500" />
              모집 안내
            </h2>
            <div className="whitespace-pre-wrap text-[15px] leading-[1.75] text-ink-700">
              {notice.noticeContent}
            </div>
          </section>
        ) : (
          <p className="text-center text-sm text-ink-400">상세 모집 요강이 준비 중입니다.</p>
        )}

        <footer className="space-y-3 border-t border-cream-200 pt-8 text-center">
          <p className="text-sm text-ink-500">이미 지원하셨나요?</p>
          <a
            href="/recruit"
            className="inline-flex min-h-tap items-center gap-1.5 rounded-full border-[1.5px] border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 no-underline transition-colors hover:bg-cream-50 hover:text-ink-900 hover:no-underline"
          >
            <Icon name="doc" size={16} />
            지원 결과 조회하기
          </a>
        </footer>
      </div>
    </main>
  );
}
