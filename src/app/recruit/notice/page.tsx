import type { Metadata } from 'next';
import { getCohortById, listCohorts } from '@/recruit/cohorts';
import { Icon } from '@/components/icon';
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
      ? `${notice.label} 신입 부원 모집 공고 | 애니멀메이트`
      : '신입 부원 모집 공고 | 애니멀메이트',
  };
}

export default async function PublicRecruitNoticePage() {
  const notice = await loadNotice();

  if (!notice) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream-25 p-4 font-sans">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-ink-200 bg-white p-7 text-center shadow-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-100 text-ink-500">
            <Icon name="megaphone" size={24} />
          </div>
          <h1 className="text-lg font-bold text-ink-900">진행 중인 모집 공고가 없습니다</h1>
          <p className="text-[13px] leading-relaxed text-ink-500">
            새 모집이 시작되면 이 페이지에 공고가 올라옵니다.
          </p>
          <a
            href="/recruit"
            className="inline-flex min-h-tap items-center justify-center gap-1.5 rounded-xl bg-primary px-5 text-[15px] font-semibold text-white no-underline transition-colors hover:bg-blue-600"
          >
            지원 결과 조회
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-cream-25 p-4 font-sans sm:p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="space-y-4 rounded-2xl border border-ink-200 bg-white p-7 text-center shadow-card sm:p-9">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Icon name="megaphone" size={24} />
          </div>
          <div className="space-y-2">
            <span className="inline-flex items-center rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              {notice.label} 모집
            </span>
            <h1 className="text-2xl font-bold leading-snug text-ink-900 sm:text-3xl">
              유기동물 봉사 동아리 애니멀메이트 신입 모집
            </h1>
            <p className="mx-auto max-w-prose text-[13px] leading-relaxed text-ink-500 sm:text-sm">
              아이들을 사랑하고 동아리 활동을 함께 만들어갈 신입 부원을 기다립니다.
            </p>
          </div>
          <ApplyButton isClosed={notice.isClosed} />
        </header>

        <article className="space-y-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-card sm:p-8">
          <h2 className="border-b border-ink-100 pb-3 text-base font-bold text-ink-900">
            모집 요강 및 안내 사항
          </h2>

          {notice.noticeImages.length > 0 && (
            <div className="space-y-4">
              {notice.noticeImages.map((url, idx) => (
                // 외부 URL 포스터라 next/image 대신 img 를 쓴다(remotePatterns 설정 불필요).
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt={`${notice.label} 모집 공고 이미지 ${idx + 1}`}
                  loading="lazy"
                  className="w-full rounded-xl border border-ink-100"
                />
              ))}
            </div>
          )}

          {notice.noticeContent ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
              {notice.noticeContent}
            </div>
          ) : (
            <p className="py-8 text-center text-[13px] text-ink-400">
              상세 모집 요강이 준비 중입니다.
            </p>
          )}

          <div className="border-t border-ink-100 pt-6 text-center">
            <ApplyButton isClosed={notice.isClosed} label="지금 지원서 작성하기" />
          </div>
        </article>

        <p className="text-center text-[11px] font-medium text-ink-400">
          이미 지원하셨나요?{' '}
          <a href="/recruit" className="font-semibold text-blue-600 underline hover:text-blue-700">
            지원 결과 조회
          </a>
        </p>
      </div>
    </main>
  );
}
