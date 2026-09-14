/* PitFlow ── 🚗 代車カレンダーの上の車種名（見出しの行）が、スクロールしても上に貼り付いているか
   ===================================================================
   ◎ゆうた報告（2026-09-14）「代車カレンダー上部の車種名ラベルがどっかいっちゃってる　もどしてほしい」
   ◎原因：v2.70.0 で css/fleet-cal.css に `.lo-cell{position:relative}` を足した。
     fleet-cal.css は polish.css より後に読むので、見出し（.lo-head＝同じ .lo-cell）の `position:sticky` まで上書きし、
     開いた時に今日の少し前までスクロールする＝見出しが画面の上に流れて見えなくなっていた。
   ◎見張ること
     🔴 見出しの行と「日付」の角が position:sticky
     🔴 下へスクロールしても、見出しがスクロール枠の上端に居て、車種名が見える
     🔴 後から読む CSS が .lo-cell の position を決める時は、見出しを外している（同じ事故の予防）
   ◎使い方
       python -m http.server 8972   （CoreFlowアプリ で）
       PORT=8972 node _見張り/test_loaner_sticky.mjs   （PitFlow\pitflow で）
   =================================================================== */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { chromePath } from './_chrome.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('../../../CarFlow/carflow/node_modules/playwright');
const PORT = process.env.PORT || 8972;
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + JSON.stringify(x) : '')); } };

console.log('\n── CSS の決まり ──');
{
  const idx = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  const sheets = [...idx.matchAll(/href="(css\/[^"?]+)/g)].map(m => m[1]);
  const pi = sheets.indexOf('css/polish.css');
  const later = sheets.slice(pi + 1);
  const bad = [];
  later.forEach(f => {
    const src = fs.readFileSync(path.join(process.cwd(), f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim(), body = m[2];
      if (!/\bposition\s*:/.test(body)) continue;
      sel.split(',').map(s => s.trim()).forEach(s => {
        if (/^\.lo-cell$/.test(s)) bad.push(f + ' → ' + s);
      });
    }
  });
  ok('🔴 polish.css より後の CSS が、見出しを外さずに .lo-cell の position を決めていない', bad.length === 0, bad);
}

console.log('\n── ブラウザ（見本データ） ──');
const b = await chromium.launch({ executablePath: chromePath() });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/PitFlow/pitflow/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && state.cards && state.cards.length', null, { timeout: 30000 });
await p.waitForTimeout(600);
await p.evaluate(() => showView('loaner'));
await p.waitForTimeout(1200);
const R = await p.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const wrap = document.getElementById('loaner-scroll');
  const heads = [...document.querySelectorAll('#loaner-grid .lo-head')];
  const corner = document.querySelector('#loaner-grid .lo-corner');
  const look = () => {
    const wt = wrap.getBoundingClientRect().top;
    const h = heads[1], m = h && h.querySelector('.lo-model');
    const hr = h.getBoundingClientRect();
    const hit = document.elementFromPoint(hr.left + hr.width / 2, hr.top + hr.height / 2);
    return { gap: Math.round(hr.top - wt), text: m ? m.textContent : '', onTop: !!(hit && h.contains(hit)), scroll: wrap.scrollTop };
  };
  const pos = { head: getComputedStyle(heads[1]).position, corner: getComputedStyle(corner).position };
  const opened = look();
  wrap.scrollTop += 900; await wait(200);
  const deeper = look();
  return { pos, opened, deeper, count: heads.length - 1 };
});
ok('🔴 見出しの行と「日付」の角が position:sticky', R.pos.head === 'sticky' && R.pos.corner === 'sticky', R.pos);
ok('🔴 開いた時（今日の少し前までスクロール済み）も、見出しが枠の上端に居て車種名が見える', R.opened.scroll > 0 && Math.abs(R.opened.gap) <= 2 && R.opened.onTop && !!R.opened.text, R.opened);
ok('🔴 さらに下へスクロールしても、見出しは上に貼り付いたまま（札に隠れない）', R.deeper.scroll > R.opened.scroll && Math.abs(R.deeper.gap) <= 2 && R.deeper.onTop, R.deeper);
ok('代車の数だけ見出しがある', R.count >= 3, R.count);
ok('🧯 JSエラー 0', errs.length === 0, errs.slice(0, 3));
await b.close();

console.log('\n─────────────────────────────');
console.log((fail ? '❌ ' : '✅ ') + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
