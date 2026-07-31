// 가로 스크롤을 만드는 요소를 찾는다. 여러 폭에서 재본다.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3100';
const cookie = readFileSync('D:/git/Animalmate/.qa-cookie.txt', 'utf8').match(/SESSION_COOKIE=(\S+)/)[1];
const browser = await chromium.launch();

for (const width of [1280, 1366, 1440, 1536, 1920]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addCookies([{ name: 'am_session', value: cookie, domain: 'localhost', path: '/', httpOnly: true }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/members`, { waitUntil: 'networkidle' });
  const res = await page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const over = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right > docW + 1 && r.width > 0) {
        over.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && String(el.className)).slice(0, 70),
          right: Math.round(r.right),
          width: Math.round(r.width),
          text: (el.textContent || '').trim().slice(0, 40),
        });
      }
    }
    return { docW, scrollW: document.documentElement.scrollWidth, over: over.slice(0, 4) };
  });
  console.log(`\n== ${width}px == clientWidth=${res.docW} scrollWidth=${res.scrollW} 초과=${res.scrollW - res.docW}px`);
  for (const o of res.over) console.log(`   <${o.tag}> right=${o.right} w=${o.width} "${o.text}" cls=${o.cls}`);
  await ctx.close();
}
await browser.close();
