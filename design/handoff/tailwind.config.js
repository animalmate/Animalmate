/** 애니멀메이트 Tailwind 설정 — tokens/*.css 의 값과 1:1 매핑.
 *  Next.js(App Router) + Tailwind 프로젝트의 tailwind.config.js 에 그대로 붙여넣으세요. */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        blue:  { 50:"#F1F6FC",100:"#DFEAF8",200:"#BDD5F0",300:"#94B9E6",400:"#6E9CDC",500:"#5588D2",600:"#3E6FB9",700:"#345C99",800:"#2C4B7C",900:"#253D64" },
        coral: { 50:"#FEF2F2",100:"#FDE3E4",300:"#F7A2A6",500:"#EE5A60",600:"#D8434B",700:"#B23239" },
        amber: { 50:"#FDF6E7",100:"#FAEBC8",300:"#F6CB6F",500:"#F0A72A",600:"#C97F0A",700:"#8F5C05" },
        cream: { 25:"#FDFBF7",50:"#FAF6EE",100:"#F4EDDF",200:"#EADFC9" },
        ink:   { 100:"#EFEAE0",200:"#DDD6C8",300:"#BFB7A6",400:"#99917F",500:"#7B7263",700:"#4E4739",900:"#2E2921" },
        // 시맨틱 별칭
        primary: "#5588D2",
        success: { DEFAULT:"#2F8A57", 100:"#DFF2E6", 700:"#226A42" },
        warning: { DEFAULT:"#C97F0A", 100:"#FAEBC8", 700:"#8F5C05" },
        error:   { DEFAULT:"#D8434B", 100:"#FDE3E4", 700:"#B23239" },
        info:    { DEFAULT:"#3E6FB9", 100:"#DFEAF8", 700:"#2C4B7C" },
      },
      fontFamily: {
        sans: ['"Pretendard Variable"','Pretendard','-apple-system','"Apple SD Gothic Neo"','"Noto Sans KR"','sans-serif'],
        mono: ['"SF Mono"','ui-monospace','"Nanum Gothic Coding"','Consolas','monospace'],
      },
      borderRadius: { sm:"8px", md:"12px", lg:"16px", xl:"20px" }, // 배지 / 입력·버튼 / 카드 / 모달
      boxShadow: {
        card:   "0 1px 3px rgba(78,71,57,.07), 0 1px 2px rgba(78,71,57,.05)",
        raised: "0 4px 12px rgba(78,71,57,.10), 0 2px 4px rgba(78,71,57,.06)",
        modal:  "0 12px 32px rgba(46,41,33,.18), 0 4px 8px rgba(46,41,33,.08)",
      },
      height:    { control:"48px", "control-sm":"36px" }, // h-control = 모바일 컨트롤, 최소 터치 44px
      minHeight: { tap:"44px" },
    },
  },
  plugins: [],
};
