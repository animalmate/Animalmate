import type { Metadata } from 'next';
import { getCohortById, getPublicNoticeCohort } from '@/recruit/cohorts';
import { Icon } from '@/components/icon';
import { ctaSecondary } from '@/components/ui';
import { CursorDog } from '@/components/cursor-dog';
import { PublicNav } from '@/components/public-nav';
import { ApplyButton } from './apply-button';

export const dynamic = 'force-dynamic';

// 공개 모집 공고에서 지원자에게 보여도 되는 필드만 추린다.
// (합격 축하 멘트·면접 장소 프리셋 같은 내부 값은 여기로 넘어오지 않는다.)
async function loadNotice(cohortId?: string) {
  // 기수를 지정하지 않으면 **본문이 채워진 최신 기수**를 본다(getPublicNoticeCohort 주석).
  // 그냥 최신 기수를 집으면 다음 기수를 만드는 순간 진행 중이던 공고가 내려간다.
  const cohort = cohortId ? await getCohortById(cohortId) : await getPublicNoticeCohort();
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

  return (
    <main className="min-h-screen font-sans">
      {/* 로그인·가입 화면과 같은 장식(커서 따라다니는 강아지). 컴포넌트 주석의 의도대로 모집 화면에도 붙인다. */}
      <CursorDog />
      {/* 공개 화면 공통 메뉴 — ABOUT·CONTACT 는 각자 화면으로 나간다(/about, /contact). */}
      <PublicNav />

      {notice ? <NoticeHero notice={notice} /> : <OffSeasonHero />}

      {notice ? (
        <div className="mx-auto max-w-2xl space-y-10 px-4 py-12 sm:py-16">
          <NoticeBody notice={notice} />
        </div>
      ) : null}
    </main>
  );
}

type Notice = NonNullable<Awaited<ReturnType<typeof loadNotice>>>;

// 로그인·가입 화면과 같은 인사 방식(동아리 로고 + 따뜻한 배경)을 쓴다.
// 지원 버튼은 이 페이지에 하나뿐이다: 같은 버튼을 아래에 또 두면 어느 쪽이 진짜인지 헷갈린다.
function NoticeHero({ notice }: { notice: Notice }) {
  return (
    <header className="border-b border-cream-200 bg-gradient-to-b from-cream-100 to-cream-25 px-4 py-12 sm:py-16">
      {/* 제목이 한 줄로 서야 해서 `xl`(576px)보다 넓게 잡는다 — 19자 제목이 그 폭에서는 접힌다. */}
      <div className="mx-auto max-w-2xl space-y-5 text-center">
        {/* 내비에 이미 로고가 있어 여기 또 얹으면 같은 것이 두 번 나온다(2026-08-28).
            ABOUT·CONTACT 보다 작게 쓴다 — 이 화면의 주인공은 그림이 아니라 아래 제목과
            지원 버튼이고, 그림이 커지면 그것들이 화면 밖으로 밀린다. */}
        <img src="/mark.webp" alt="" width={640} height={399} className="mx-auto w-28 sm:w-32" />

        <div className="space-y-2.5">
          <span className="inline-flex items-center rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-coral-700 shadow-card">
            {notice.label} 신입 모집
          </span>
          {/* 한 문장을 한 줄로. 좁은 화면에서는 접힐 수밖에 없으므로 `text-balance` 로 고르게 나눈다.
              (아래 설명 문단은 뺐다 — 바로 위 딱지와 같은 말을 두 번 하고 있었다.) */}
          <h1 className="text-balance text-[24px] font-bold leading-snug tracking-tight text-ink-900 sm:text-[32px]">
            애니멀메이트에서 신입기수를 모집합니다!
          </h1>
        </div>

        {/* 지원하러 온 사람과 결과를 보러 온 사람이 **같은 자리에서** 갈린다.
            결과 조회를 맨 아래에 두면 발표 날 스크롤을 끝까지 내려야 찾는다. */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
          <ApplyButton isClosed={notice.isClosed} />
          <a href="/recruit" className={ctaSecondary}>
            <Icon name="doc" size={18} />
            지원 결과 조회하기
          </a>
        </div>
      </div>
    </header>
  );
}

/**
 * 모집 기간이 아닐 때. 문을 닫았다는 말보다 **다음에 다시 오라**는 말이 먼저 오게 쓴다.
 * 예전에는 화면 한가운데 카드 하나로 끝났는데, 그러면 비수기에 찾아온 사람이 동아리에 대해
 * 알아볼 방법이 없었다 — 이제 상단 메뉴로 ABOUT·활동 사진이 이어진다.
 */
function OffSeasonHero() {
  return (
    <header className="px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-2xl space-y-4 text-center">
        {/* 위 히어로와 같은 이유로 로고가 아니라 그림. 크기도 같게 맞춘다. */}
        <img src="/mark.webp" alt="" width={640} height={399} className="mx-auto w-28 sm:w-32" />
        <h1 className="text-balance text-[24px] font-bold leading-snug tracking-tight text-ink-900 sm:text-[32px]">
          다음 모집에서 만나요
        </h1>
        <p className="text-sm leading-relaxed text-ink-500">
          새 모집이 시작되면 이 페이지에서 안내드릴게요. 그동안 어떤 활동을 했는지는 위 메뉴의
          ABOUT 과 활동 사진에서 볼 수 있어요.
        </p>
      </div>
    </header>
  );
}

function NoticeBody({ notice }: { notice: Notice }) {
  return (
    <div className="space-y-10">
      {notice.noticeImages.length > 0 && (
        <section className="space-y-5">
          {notice.noticeImages.map((url, idx) => (
            // 외부/데이터 URL 포스터라 next/image 대신 img 를 쓴다.
            //
            // 첫 장은 lazy 로 두지 않는다. 이 페이지에서 가장 큰 그림 = 지원자가 보러 온 것이고
            // 화면 맨 위에 있어 곧 LCP 다. lazy 는 "일단 미루라"는 뜻이라, 정작 제일 먼저
            // 보여야 할 것을 늦춘다. 둘째 장부터는 스크롤해야 보이므로 lazy 가 맞다.
            <img
              key={url}
              src={url}
              alt={`${notice.label} 모집 공고 이미지 ${idx + 1}`}
              loading={idx === 0 ? 'eager' : 'lazy'}
              fetchPriority={idx === 0 ? 'high' : undefined}
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
    </div>
  );
}
