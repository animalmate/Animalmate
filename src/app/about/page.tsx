import type { Metadata } from 'next';
import { PublicShell } from '@/components/public-shell';
import { ActivityPhotos } from './activity-photos';

// 정적이다(DB 를 보지 않는다) — 모집 공고와 달리 `force-dynamic` 을 걸 이유가 없다.
export const metadata: Metadata = {
  title: '동아리 소개 | 애니멀메이트',
  description:
    '2010년에 결성된 애니멀메이트는 수도권 최장, 최대 규모의 대학생 연합 유기견 봉사 동아리입니다.',
};

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
        <ActivityPhotos />

        {/* 각주는 사진 **뒤에** 둔다. 앞에 두면 소개를 읽고 나서 처음 만나는 것이 고지문이 된다 —
            보러 온 것은 활동이지 면책 문구가 아니다. 크기·색도 한 단계씩 낮춰 각주로 읽히게 한다. */}
        <p className="rounded-2xl bg-cream-100 px-5 py-4 text-[13px] leading-[1.7] text-ink-500">
          ※본 동아리는 대학생들에 의해 자치적으로 운영되고 있으며, 정치, 종교, 시민단체와 전혀
          관련이 없음을 알려드립니다.
        </p>
      </div>
    </PublicShell>
  );
}
