/* ============================================================
   test_kanban_side_scroll.mjs
   タスクボードの右の縦積み（廃車乗換／外注）の高さの決め方を見張る。

   きっかけ①：ゆうた 2026-08-25
     「タスクボードで廃車乗換、外注欄が伸びた時にスクロールが出ない」
   きっかけ②：ゆうた 2026-08-27
     「数が少ないうちはいいが、どっちもスクロールするほどカードが入った場合は、
       まん中の位置で 廃車と外注のBOXの大きさが等しくなる様にしてほしい」

   何が起きていたか：
     v2.9.6 の flex:0 1 auto ＋ max-height:100% は「中身の量に比例して縮む」。
     ＝14件と12件なら、14件の側のほうが大きいまま。半分にならない。

   いまの決めごと（v2.14.0）：
     .kanban-col.side       flex:1 1 0 ＋ max-height:max-content ＋ min-height:120px
     .kanban-col-body       flex:0 1 auto（basis 0 のままだと列の max-content が中身の高さにならない）
     ・どちらも入りきらない → **等分**（まん中で半分ずつ）
     ・片方が少ない        → 少ない側は中身の高さで止まり、余りは多い側が全部もらう
     ・どちらも空          → min-height の 120px で止まる（画面いっぱいに伸びない）

   使い方：
     node /tmp/srv.js &            ← 8991
     NODE_PATH=... node test_kanban_side_scroll.mjs
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const cp   = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = process.env.PORT || 8991;
let OK = 0, NG = 0;
function ok(name, cond, extra){
  if (cond) { OK++; console.log('  ✅ ' + name); }
  else { NG++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

/* ===== ① CSS そのものを見る（コメントは外してから見る） ===== */
console.log('\n── 🎨 CSS の決めごと ──');
{
  const raw = fs.readFileSync(path.join(process.cwd(), 'css', 'views.css'), 'utf8');
  /* 🔴 自分のコメントに正規表現が当たる事故を毎回やっているので、必ず先に外す */
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = (css.match(/\.kanban-side-stack\s*\{[^}]*\}/) || [''])[0];
  const side  = (css.match(/\.kanban-side-stack\s+\.kanban-col\.side\s*\{[^}]*\}/) || [''])[0];
  const body  = (css.match(/\.kanban-side-stack\s+\.kanban-col\.side\s+\.kanban-col-body\s*\{[^}]*\}/) || [''])[0];
  ok('縦積みの箱に min-height:0 がある', /min-height:\s*0/.test(stack), stack);
  ok('side列が伸びっぱなしでない（0 0 auto をやめた）', !/flex:\s*0\s+0\s+auto/.test(side), side);
  ok('🔴 side列が「等分」から始まる（flex:1 1 0）', /flex:\s*1\s+1\s+0/.test(side), side);
  ok('🔴 side列に max-height:max-content がある（中身より大きくならない）',
     /max-height:\s*max-content/.test(side), side);
  ok('side列に潰れ止めの min-height がある', /min-height:\s*\d+px/.test(side), side);
  ok('🔴 body が flex:0 1 auto（basis 0 だと列の max-content が効かない）',
     /flex:\s*0\s+1\s+auto/.test(body), body);
  ok('body に min-height:0 がある（中でスクロールできる）', /min-height:\s*0/.test(body), body);
}

/* ===== ② 実際に描いて測る ===== */
const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.renderTask', null, { timeout: 25000 });
await p.waitForTimeout(700);

/* 廃車乗換・外注に、わざとたくさん積む */
/* 廃車乗換・外注に、好きな数だけ積む道具 */
async function 積む(counts){
  return await p.evaluate((counts) => {
    state.cards = state.cards.filter(function(c){ return String(c.id).indexOf('ZZ-') !== 0; });
    /* 盤は state.boards の中。既定の盤（default）に積む。
       ⚠ boardId を入れないと列に入らない（task.js が boardId で絞るため）。 */
    const bs = window.state.boards || {};
    const bd = bs.default || bs[Object.keys(bs)[0]];
    const side = ((bd && bd.cols) || []).filter(function(c){ return c.side; }).map(function(c){ return c.id; });
    side.forEach(function(id, k){
      for (let i = 0; i < (counts[k] || 0); i++){
        state.cards.push({
          id: 'ZZ-' + id + '-' + i,
          boardId: bd.id,
          customerName: 'テスト' + i + '（' + id + '）',
          carModel: 'ながいながい車種名テスト' + i,
          plate: '品川 500 あ ' + (1000 + i),
          status: id, reserveDate: '2026-08-25'
        });
      }
    });
    state.currentBoard = bd.id;
    renderTask();
    return side;
  }, counts);
}

async function 測る(){
  await p.waitForTimeout(300);
  return await p.evaluate(() => {
    const kan   = document.querySelector('#view-task .kanban') || document.querySelector('.kanban');
    const stack = kan && kan.querySelector('.kanban-side-stack');
    if (!stack) return null;
    const kr = kan.getBoundingClientRect();
    const sr = stack.getBoundingClientRect();
    const cols = [].slice.call(stack.querySelectorAll('.kanban-col.side')).map(function(c){
      const body = c.querySelector('.kanban-col-body');
      const r = c.getBoundingClientRect();
      return {
        name: ((c.querySelector('.kanban-col-head') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
        h: Math.round(r.height),
        bottom: Math.round(r.bottom),
        bodyH: body.clientHeight,
        bodyScrollH: body.scrollHeight,
        scrollable: body.scrollHeight > body.clientHeight + 1
      };
    });
    return { kanBottom: Math.round(kr.bottom), stackTop: Math.round(sr.top), stackH: Math.round(sr.height),
             winH: window.innerHeight, cols: cols };
  });
}

await p.evaluate(() => showView('task'));
await p.waitForTimeout(500);

console.log('\n── 📏 ①どちらも山盛り（14件と12件）＝まん中で半分ずつ ──');
{
  const side = await 積む([14, 12]);
  ok('side列が2つある（廃車乗換／外注）', side.length >= 2, side);
  const m = await 測る();
  ok('縦積みが見つかる', !!m);
  if (m && m.cols.length >= 2){
    const [a, b2] = m.cols;
    ok('🔴 2つの箱の高さが等しい（差2px以内）', Math.abs(a.h - b2.h) <= 2, { a: a.h, b: b2.h });
    /* 半分の位置＝縦積みのまん中。上の箱の下端がそこに来る（あいだの gap 8px ぶんは許す） */
    const mid = m.stackTop + m.stackH / 2;
    ok('🔴 割れ目が縦積みのまん中にある（±8px）', Math.abs(a.bottom - mid) <= 8,
       { 上の箱の下端: a.bottom, まん中: Math.round(mid) });
    m.cols.forEach(function(c){
      ok('「' + c.name + '」が画面の外に飛び出さない', c.bottom <= m.winH + 2, { bottom: c.bottom, winH: m.winH });
      ok('🔴 「' + c.name + '」が列の中でスクロールする', c.scrollable, { bodyH: c.bodyH, bodyScrollH: c.bodyScrollH });
    });
    ok('縦積みが板の下端を越えない', m.cols.every(function(c){ return c.bottom <= m.kanBottom + 2; }),
       { cols: m.cols.map(function(c){ return c.bottom; }), kanBottom: m.kanBottom });
  }
}

console.log('\n── 📏 ②片方だけ山盛り（14件と2件）＝少ない側は中身の高さで止まる ──');
{
  await 積む([14, 2]);
  const m = await 測る();
  if (m && m.cols.length >= 2){
    const [多, 少] = m.cols;
    ok('少ない側はスクロールしない（中身が全部見えている）', !少.scrollable, 少);
    ok('🔴 余りは多い側がもらう（半分より大きい）', 多.h > m.stackH / 2, { 多: 多.h, 半分: Math.round(m.stackH / 2) });
    ok('多い側は列の中でスクロールする', 多.scrollable, 多);
    ok('はみ出さない', m.cols.every(function(c){ return c.bottom <= m.kanBottom + 2; }),
       { cols: m.cols.map(function(c){ return c.bottom; }), kanBottom: m.kanBottom });
  }

  /* 逆向きも同じになる（上下どちらが多くても） */
  await 積む([2, 14]);
  const r = await 測る();
  if (r && r.cols.length >= 2){
    ok('逆向きでも、少ない側はスクロールしない', !r.cols[0].scrollable, r.cols[0]);
    ok('逆向きでも、余りは多い側がもらう', r.cols[1].h > r.stackH / 2,
       { 多: r.cols[1].h, 半分: Math.round(r.stackH / 2) });
  }
}

console.log('\n── 🧭 まわり ──');
{
  /* 中身が空でも、からっぽの箱が画面いっぱいに伸びない
     🔴 flex:1 1 0 は「等分に伸びる」書き方。伸び止めは max-height:max-content が受け持っている。
        max-content を落とすと、ここが真っ先に赤くなる。 */
  await 積む([0, 0]);
  const empty = await p.evaluate(() => {
    const stack = document.querySelector('#view-task .kanban .kanban-side-stack');
    if (!stack) return null;
    return [].slice.call(stack.querySelectorAll('.kanban-col.side')).map(function(c){ return c.clientHeight; });
  });
  ok('🔴 空のときは、からっぽの箱が伸びない（180px以下）',
     !empty || empty.every(function(h){ return h <= 180; }), empty);
  ok('エラーなし', errs.length === 0, errs.slice(0, 3));
  const ver = await p.evaluate(() => (document.querySelector('meta[name=app-version]') || {}).content || '');
  /* 🔴 版くらべは**数で**。文字のままだと '2.10.0' < '2.9.6' になって落ちる
     （2026-08-25 に踏んだ。2.9 の次が 2.10 になった瞬間、見張りが全部赤くなった）。 */
  const vn = (String(ver).match(/\d+/g) || []).map(Number);
  const need = '2.14.0'.split('.').map(Number);
  const ge = (a, b) => (a[0]||0) !== (b[0]||0) ? (a[0]||0) > (b[0]||0)
                     : (a[1]||0) !== (b[1]||0) ? (a[1]||0) > (b[1]||0)
                     : (a[2]||0) >= (b[2]||0);
  ok('版が v2.14.0 以降', ge(vn, need), ver);
}

await b.close();
console.log('\n' + (NG ? '⚠ ' : '🎉 ') + OK + ' OK / ' + NG + ' NG');
process.exit(NG ? 1 : 0);
