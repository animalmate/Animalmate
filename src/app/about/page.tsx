import type { Metadata } from 'next';
import { PublicShell } from '@/components/public-shell';
import { ActivityPhotos } from './activity-photos';

export const metadata: Metadata = {
  title: '동아리 소개 | 애니멀메이트',
  description:
    '2010년에 결성된 애니멀메이트는 수도권 최장, 최대 규모의 대학생 연합 유기견 봉사 동아리입니다.',
};

/**
 * ⚠ **이 화면은 DB 를 보지 않지만 정적으로 두면 안 된다.**
 *
 * 미들웨어가 요청마다 새 nonce 를 발급해 CSP 에 박는다(`strict-dynamic`, 07-DECISIONS 10).
 * 그런데 정적으로 뽑힌 HTML 은 빌드 때 굳은 것이라 그 nonce 를 가질 수 없다 —
 * 브라우저가 Next 스크립트를 **전부 차단**하고, 자바스크립트가 하나도 돌지 않는다
 * (2026-08-28 실측: /about 만 CSP 차단 13건, 나머지 공개 화면은 0건).
 * 화면은 멀쩡해 보이는데 스크롤 리빌 같은 클라이언트 동작만 조용히 죽는다.
 *
 * 이 리포의 모든 화면이 `force-dynamic` 인 것은 이 때문이다. 새 화면을 만들 때도 빼지 말 것.
 */
export const dynamic = 'force-dynamic';

export default function AboutPage() {
  return (
    <PublicShell
      title="ABOUT"
      lead={
        <>
          2010년에 결성된 애니멀메이트는 수도권 최장, 최대 규모의 대학생 연합 유기견 봉사 동아리로
          동물과 사람이 조화롭게 살 수 있는 세상을 지향하고 있습니다.
        </>
      }
    >
      <div className="space-y-12 sm:space-y-16">
        {/* 고지문은 사진 **위**에 둔다(2026-08-28 사용자 지시). 소개글 바로 다음에 읽히는 자리다.
            크기·색은 한 단계씩 낮춰 본문이 아니라 각주로 보이게 한다. */}
        <p className="rounded-2xl bg-cream-100 px-5 py-4 text-[13px] leading-[1.7] text-ink-500">
          ※본 동아리는 대학생들에 의해 자치적으로 운영되고 있으며, 정치, 종교 단체와 전혀
          관련이 없음을 알려드립니다.
        </p>

        <ActivityPhotos />
      </div>
    </PublicShell>
  );
}
