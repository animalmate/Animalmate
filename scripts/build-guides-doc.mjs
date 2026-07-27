// src/guides/content.ts 의 가이드 원문 → docs/08-USER-GUIDES.md 생성.
// 화면과 문서가 갈라지지 않게 **원문은 한 곳(content.ts)** 에만 둔다. 가이드를 고쳤으면
// `node scripts/build-guides-doc.mjs` 를 돌려 문서를 다시 만든다(같은 커밋에서).
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'src/guides/content.ts';
const OUT = 'docs/08-USER-GUIDES.md';

// content.ts 는 TS 라 그대로 import 할 수 없다. 가이드 3종의 title/summary/body 만 뽑아낸다.
const src = readFileSync(SRC, 'utf8');
const guides = [];
for (const m of src.matchAll(/title:\s*'([^']+)',\s*\n\s*summary:\s*'([^']+)',\s*\n\s*body:\s*`([\s\S]*?)`,\n\};/g)) {
  guides.push({ title: m[1], summary: m[2], body: m[3] });
}
if (guides.length !== 3) {
  console.error(`가이드 3종을 찾지 못했습니다(${guides.length}개). ${SRC} 형식이 바뀌었는지 확인하세요.`);
  process.exit(1);
}

const header = `# 08. 사이트 활용 가이드 (USER GUIDES)

> **이 파일은 자동 생성됩니다. 직접 고치지 마세요.**
> 원문은 \`src/guides/content.ts\` 이고, 고친 뒤 \`node scripts/build-guides-doc.mjs\` 를 돌리면 이 파일이 갱신됩니다.
> 화면(\`/guides\`)과 이 문서가 갈라지지 않게 하려는 구조입니다.
>
> 노출 규칙: 부원 = 부원용 / 운영진 = 부원용 + 운영진용 / 회장단·시스템관리자 = 3종 전체.
> 홈의 "사용 가이드" 카드와 상단 메뉴 "가이드"로 들어갑니다.

---
`;

const body = guides.map((g) => `\n# ${g.title}\n\n_${g.summary}_\n\n${g.body.trim()}\n\n---\n`).join('');
writeFileSync(OUT, `${header}${body}`, 'utf8');
console.log(`${OUT} 갱신 완료 (가이드 ${guides.length}종).`);
