import { requireActor } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { Banner, Card } from '@/components/ui';
import { Icon } from '@/components/icon';
import { CursorDog } from '@/components/cursor-dog';
import { ChatDog } from '@/components/chat-dog';
import { isStaffPlus, isPrivileged } from '@/auth/permissions';
import { getHomeLinks } from '@/org/links';
import { db } from '@/db/client';

export const dynamic = 'force-dynamic';

// desc 는 **짧은 명사구**로 쓴다("~해요" 금지). 카드가 한 줄을 넘으면 그 칸만 키가 커져
// 격자가 들쭉날쭉해 보인다(2026-07-31 사용자 지적).
interface Shortcut {
  href: string;
  label: string;
  desc: string;
  icon: string;
}

// 순서 = 손이 자주 가는 순(2026-08-03 사용자 지정). 예약·템플릿이 주 업무고 일정은 그다음이다.
const STAFF_SHORTCUTS: Shortcut[] = [
  { href: '/reservations', label: '예약', desc: '공지 예약 관리', icon: 'megaphone' },
  { href: '/templates', label: '템플릿', desc: '자주 쓰는 양식 저장', icon: 'doc' },
  { href: '/calendar', label: '캘린더', desc: '총회·MT 등 동아리 일정', icon: 'calendar' },
  { href: '/guidebooks', label: '가이드북', desc: '팀별 활동 안내', icon: 'heart' },
];
// 부원 바로가기 — 캘린더 하나뿐이다(2026-08-04, 결정 89). 부원이 보는 것은 부원 공개 일정만이고,
// 그 필터는 서버 SQL 이 건다. 메뉴에만 두면 홈에서 한 번 더 들어가야 해 실제로 안 쓰인다.
const MEMBER_SHORTCUTS: Shortcut[] = [
  { href: '/calendar', label: '캘린더', desc: '총회·MT 등 동아리 일정', icon: 'calendar' },
  // 부원이 가장 자주 여는 자료라 홈에 둔다(메뉴에만 두면 한 번 더 들어가야 해 안 쓰인다).
  { href: '/guidebooks', label: '가이드북', desc: '팀별 활동 안내', icon: 'heart' },
];
// 신입 모집은 역할에 따라 들어가는 문이 다르다 — 운영진이 맡는 일은 채점, 회장단은 절차 전체.
const RECRUIT_STAFF: Shortcut = {
  href: '/admin/recruit/screening',
  label: '신입모집',
  desc: '지원자 서류 채점',
  icon: 'userPlus',
};
const RECRUIT_BOARD: Shortcut = {
  href: '/admin/recruit/notice-edit',
  label: '신입모집',
  desc: '공고부터 최종 발표까지',
  icon: 'userPlus',
};
const BOARD_SHORTCUTS: Shortcut[] = [
  { href: '/documents', label: '문서', desc: '챗봇 안내 문서 관리', icon: 'layers' },
  { href: '/admin/members', label: '회원·팀 관리', desc: '역할·팀·직함 지정', icon: 'users' },
  { href: '/admin/join-codes', label: '가입코드', desc: '학기별 가입코드 발급', icon: 'key' },
  { href: '/admin/boards', label: '게시판', desc: '카페 게시판 연결', icon: 'board' },
  { href: '/admin/chatbot', label: '챗봇 설정', desc: '사용량·한도 관리', icon: 'info' },
];

// 외부 바로가기(새 탭). staffOnly 는 서버에서 걸러 부원의 HTML 에 URL 자체가 나가지 않는다(규칙 #6).
interface ExternalLink extends Shortcut {
  tone: 'cafe' | 'drive' | 'recruit' | 'suggest' | 'report';
  staffOnly?: boolean;
}
// 카페 주소는 동아리와 함께 고정이라 코드에 둔다. **드라이브는 기수마다 바뀌므로** 설정값으로
// 뺐다(회장단 체크리스트 화면에서 지정 — 07-DECISIONS 83). 값이 없으면 카드를 아예 그리지 않는다:
// 죽은 링크를 보여 주는 것보다 없는 편이 낫다.
const CAFE_LINK: ExternalLink = {
  href: 'https://cafe.naver.com/animalmate2010',
  label: '네이버 카페',
  desc: '봉사 신청·공지·소식',
  icon: 'megaphone',
  tone: 'cafe',
};
const driveLink = (href: string): ExternalLink => ({
  href,
  label: '구글 드라이브',
  desc: '운영 자료·문서 보관함',
  icon: 'layers',
  tone: 'drive',
  staffOnly: true, // 부원 비공개
});
// 지원자에게 보이는 것과 같은 공개 공고. **부원·운영진 모두** 볼 수 있다 — 지원자 안내·공유용으로
// 자주 열어 본다(2026-08-28 사용자 요청). 예전엔 운영진 전용 상단 바로가기로만 있었는데,
// 전원에게 보여야 하는 값이라 이 줄로 옮겼다(2026-08-29). staffOnly 를 달지 않는 이유다.
const RECRUIT_NOTICE_LINK: ExternalLink = {
  href: '/recruit/notice',
  label: '모집 공고',
  desc: '모집 공고 확인',
  icon: 'userPlus',
  tone: 'recruit',
};
// 건의함·신고함(구글 폼). **부원 포함 전원**에게 보인다 — 의견을 내고 신고하는 사람이 부원이다
// (2026-09-03 사용자 요청). 드라이브와 달리 staffOnly 를 달지 않는 이유가 이것이다.
// 주소는 기수마다 새 폼을 만들므로 설정값으로 뺐다(회장단 체크리스트 화면에서 지정).
const suggestLink = (href: string): ExternalLink => ({
  href,
  label: '건의함',
  desc: '동아리에 하고 싶은 말',
  icon: 'chat',
  tone: 'suggest',
});
const reportLink = (href: string): ExternalLink => ({
  href,
  label: '신고함',
  desc: '불편했던 일 알리기',
  icon: 'alert',
  tone: 'report',
});
// 톤별 색(브랜드 팔레트). 카페=초록(네이버), 드라이브=앰버, 모집공고=파랑(내부 라우트라 콘솔과 같은 색) —
// 서로 시각적으로 구분.
const TONE: Record<ExternalLink['tone'], { chip: string; hover: string }> = {
  cafe: { chip: 'bg-success-100 text-success', hover: 'hover:border-success' },
  drive: { chip: 'bg-amber-50 text-amber-600', hover: 'hover:border-amber-300' },
  recruit: { chip: 'bg-blue-50 text-blue-600', hover: 'hover:border-blue-300' },
  // 건의함은 브랜드 산호색, 신고함은 중립색. **신고함을 빨강으로 두지 않는다** — 카드가
  // 경고처럼 보이면 눌러야 할 사람이 망설인다(신고는 겁주는 기능이 아니다).
  suggest: { chip: 'bg-coral-50 text-coral-600', hover: 'hover:border-coral-300' },
  report: { chip: 'bg-ink-100 text-ink-700', hover: 'hover:border-ink-300' },
};

export default async function HomePage() {
  const actor = await requireActor();
  const staff = isStaffPlus(actor.role);
  const board = isPrivileged(actor.role);
  const shortcuts = [
    ...(staff ? STAFF_SHORTCUTS : MEMBER_SHORTCUTS),
    // 공개 공고 보기는 여기 없다 — 아래 "바로가기"의 모집 공고 카드가 같은 곳으로 간다(2026-08-29).
    // 예전엔 운영진에게만 상단에도 두었는데, 부원까지 보이는 카드가 생기면서 한 화면에 같은
    // 주소가 두 번 서게 됐다(어느 쪽이 진짜인지 헷갈린다).
    ...(staff ? [board ? RECRUIT_BOARD : RECRUIT_STAFF] : []),
    ...(board ? BOARD_SHORTCUTS : []),
  ];
  // 건의함·신고함은 전원이 보므로 항상 읽는다. **드라이브 주소는 운영진 이상에게만 실린다** —
  // 아래 staffOnly 필터가 카드를 걸러 내므로 부원의 HTML 에는 주소 자체가 나가지 않는다(규칙 #6).
  const links = await getHomeLinks(db);
  const externals = [
    CAFE_LINK,
    ...(links.driveUrl ? [driveLink(links.driveUrl)] : []),
    RECRUIT_NOTICE_LINK,
    ...(links.suggestUrl ? [suggestLink(links.suggestUrl)] : []),
    ...(links.reportUrl ? [reportLink(links.reportUrl)] : []),
  ].filter((l) => !l.staffOnly || staff);
  const name = actor.name?.trim() || '회원'; // loadActor 가 이미 읽어 온 값 — users 재조회 없음

  return (
    <ConsoleShell actor={actor}>
      <CursorDog />
      <div className="space-y-7">
        {!actor.membershipActive ? (
          <Banner kind="warning" title="이번 학기 멤버십이 아직 활성화되지 않았어요">
            운영진 지정이 필요하면 회장단에게 문의해 주세요.
          </Banner>
        ) : null}

        <div>
          <h1 className="text-[28px] font-bold text-ink-900">안녕하세요, {name}님</h1>
          <p className="mt-1.5 text-[15px] text-ink-500">
            {staff ? '오늘도 아이들을 위해 한 걸음 — 무엇부터 할까요?' : '궁금한 건 챗봇에게, 소식은 네이버 카페에서.'}
          </p>
        </div>

        {/* 챗봇 = 메인 기능. 전원에게 가장 크게 노출한다. 인사말과 간격을 넉넉히 둔다. */}
        <a href="/chatbot" className="group block no-underline !mt-9 sm:!mt-11">
          <Card className="flex items-center gap-4 border-blue-200 bg-gradient-to-r from-blue-50 to-cream-50 transition-colors group-hover:border-blue-400 sm:gap-5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white shadow-card ring-1 ring-blue-100">
              <ChatDog mood="idle" size={50} />
            </span>
            <div className="min-w-0">
              <strong className="block text-[18px] font-bold text-ink-900">동아리 챗봇에게 물어보기</strong>
              <span className="mt-0.5 block text-[14px] leading-relaxed text-ink-500">
                봉사 일정·회비·규정, 무엇이든 물어보면 바로 답해줘요.
              </span>
            </div>
            <span className="ml-auto hidden shrink-0 items-center gap-1 rounded-full bg-blue-600 px-4 py-2 text-[14px] font-semibold text-white transition-colors group-hover:bg-blue-700 sm:inline-flex">
              물어보기
              <Icon name="chevronRight" size={16} />
            </span>
            <Icon name="chevronRight" size={20} className="ml-auto shrink-0 text-blue-400 sm:hidden" />
          </Card>
        </a>

        {shortcuts.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shortcuts.map((s) => (
              <a
                key={s.href}
                href={s.href}
                className="no-underline"
              >
                <Card className="flex min-h-[92px] items-center gap-3.5 transition-colors hover:border-blue-300">
                  <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] bg-blue-50 text-blue-600">
                    <Icon name={s.icon} size={22} />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-base font-semibold text-ink-900">{s.label}</strong>
                    <span className="text-[13px] text-ink-500">{s.desc}</span>
                  </span>
                  <Icon name="chevronRight" size={18} className="ml-auto text-ink-300" />
                </Card>
              </a>
            ))}
          </div>
        ) : null}

        {/* 외부 바로가기 — 카페는 전원, 드라이브는 운영진 이상(서버에서 필터). 새 탭으로 연다. */}
        <div className="space-y-2.5">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">바로가기</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {externals.map((l) => {
              const tone = TONE[l.tone];
              return (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-underline"
                >
                  <Card className={`flex min-h-[92px] items-center gap-3.5 transition-colors ${tone.hover}`}>
                    <span
                      className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] ${tone.chip}`}
                    >
                      <Icon name={l.icon} size={22} />
                    </span>
                    <span className="min-w-0">
                      <strong className="block text-base font-semibold text-ink-900">{l.label}</strong>
                      <span className="text-[13px] text-ink-500">{l.desc}</span>
                    </span>
                    <Icon name="external" size={17} className="ml-auto shrink-0 text-ink-300" />
                  </Card>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}
