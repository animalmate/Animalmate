// src/guides/content.ts → docs/08-USER-GUIDES.md 생성.
// 화면과 문서가 갈라지지 않게 **원문은 한 곳(content.ts)** 에만 둔다. 문구를 고쳤으면
// `node scripts/build-guides-doc.mjs` 를 돌려 문서를 다시 만든다(같은 커밋에서).
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'src/guides/content.ts';
const OUT = 'docs/08-USER-GUIDES.md';

// content.ts 는 TS 라 그대로 import 할 수 없다. 필요한 문자열만 뽑아낸다.
//
// 줄바꿈은 CR 을 선택적으로 받는다 — 윈도우 작업 트리의 content.ts 는 CRLF 라, LF 만
// 가정하면 어느 화면도 매칭되지 않아 **문서가 조용히 낡는다**(실제로 그 상태였다).
// git show 로 꺼내 보면 LF 로 정규화돼 나오므로 그때는 멀쩡해 보인다 — 확인은 반드시
// 작업 트리 파일로 할 것.
const src = readFileSync(SRC, 'utf8');

const screens = [];
for (const m of src.matchAll(/^  '?([a-z-]+)'?: \{\r?\n\s*title: '([^']+)',\r?\n\s*body: `([\s\S]*?)`,\r?\n  \},/gm)) {
  screens.push({ key: m[1], title: m[2], body: m[3] });
}
const checklist = /export const BOARD_CHECKLIST = \{\r?\n\s*title: '([^']+)',\r?\n\s*summary: '([^']+)',\r?\n\s*body: `([\s\S]*?)`,\r?\n\};/.exec(src);

if (screens.length === 0 || !checklist) {
  console.error(`원문을 찾지 못했습니다(화면 ${screens.length}개, 체크리스트 ${checklist ? 'O' : 'X'}). ${SRC} 형식을 확인하세요.`);
  process.exit(1);
}

const header = `# 08. 사이트 활용 가이드 (USER GUIDES)

> **이 파일은 자동 생성됩니다. 직접 고치지 마세요.**
> 원문은 \`src/guides/content.ts\` 이고, 고친 뒤 \`node scripts/build-guides-doc.mjs\` 를 돌리면 이 파일이 갱신됩니다.
>
> **형태**: 통합 가이드 페이지를 두지 않는다. 설명이 필요한 화면마다 제목 옆 **도움말 버튼**을 누르면
> 그 화면 이야기만 팝업으로 나온다(2026-07-28 사용자 지시). 읽는 사람이 지금 보고 있는 것만 필요하기 때문이다.
> 예외는 **회장단 체크리스트** 하나 — 시기(학기 시작·교체)에 걸린 이야기라 팝업에 담기 어려워
> \`/guides\` 페이지(회장단 전용, 메뉴 이름 "체크리스트")로 뒀다.
>
> 부원에게는 도움말도 체크리스트도 노출하지 않는다. 부원이 하는 일은 챗봇에 묻는 것과
> 카페 댓글로 신청하는 것뿐이라 설명이 필요 없다는 판단(부원용 가이드는 만들었다가 걷어냄).

---

# 화면별 도움말
`;

const body = screens.map((s) => `\n## ${s.title}\n\n\`${s.key}\`\n\n${s.body.trim()}\n`).join('\n---\n');
const tail = `\n\n---\n\n# ${checklist[1]}\n\n_${checklist[2]}_\n\n\`/guides\` (회장단 전용)\n\n${checklist[3].trim()}\n`;

writeFileSync(OUT, `${header}${body}${tail}`, 'utf8');
console.log(`${OUT} 갱신 완료 (화면 도움말 ${screens.length}종 + 회장단 체크리스트).`);
