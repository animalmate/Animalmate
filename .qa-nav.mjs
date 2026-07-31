import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const cookie = readFileSync('D:/git/Animalmate/.qa-cookie.txt','utf8').match(/SESSION_COOKIE=(\S+)/)[1];
const b = await chromium.launch();
for (const w of [1280, 1366, 1440, 1536, 1920]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 500 } });
  await ctx.addCookies([{ name:'am_session', value:cookie, domain:'localhost', path:'/', httpOnly:true }]);
  const p = await ctx.newPage();
  await p.goto('http://localhost:3100/admin/members', { waitUntil:'networkidle' });
  const r = await p.evaluate(() => {
    const nav = document.querySelector('header nav');
    const items = [...nav.querySelectorAll('a')];
    const nb = nav.getBoundingClientRect();
    const clipped = items.filter(a => a.getBoundingClientRect().right > nb.right + 1).map(a => a.textContent.trim());
    return {
      pageOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      navScroll: Math.round(nav.scrollWidth - nav.clientWidth),
      total: items.length, clipped,
    };
  });
  console.log(`${w}px: 페이지초과=${r.pageOver}px 메뉴내부스크롤=${r.navScroll}px 메뉴 ${r.total}개 잘림=${r.clipped.length ? r.clipped.join(',') : '없음'}`);
  if (w === 1280) await p.screenshot({ path: 'D:/git/Animalmate/.qa-shots/17-nav-fixed.png' });
  await ctx.close();
}
await b.close();
