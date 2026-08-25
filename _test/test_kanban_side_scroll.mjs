/* ============================================================
   test_kanban_side_scroll.mjs
   タスクボードの右の縦積み（廃車乗換／外注）が
   「中身が増えても枠の中でスクロールする」かを見張る。

   きっかけ：ゆうた 2026-08-25
     「タスクボードで廃車乗換、外注欄が伸びた時にスクロールが出ない」

   何が起きていたか：
     .kanban-side-stack .kanban-col.side が flex:0 0 auto だった。
     ＝中身の高さのまま伸びる。だから枠からはみ出して、画面の下に消えた。
     はみ出したぶんは「その列の中のスクロール」にならないので、
     スクロールバーが出ない＝下のカードに一生たどり着けない。

   直し方（v2.9.6）：
     ・.kanban-side-stack に min-height:0（flex の子は既定で縮まないため）
     ・.kanban-col.side を flex:0 1 auto ＋ max-height:100%（枠の高さで止まる）
     ・min-height:120px（片方が長くても、もう片方が潰れて消えない下限）
     ⚠ flex:1 1 auto にはしない。2列とも空のとき、からっぽの箱が画面いっぱいに伸びるから。

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
  ok('縦積みの箱に min-height:0 がある', /min-height:\s*0/.test(stack), stack);
  ok('side列が伸びっぱなしでない（0 0 auto をやめた）', !/flex:\s*0\s+0\s+auto/.test(side), side);
  ok('side列が縮める（flex の3つめが auto で、縮み許可）', /flex:\s*0\s+1\s+auto/.test(side), side);
  ok('side列に max-height:100% がある（枠で止まる）', /max-height:\s*100%/.test(side), side);
  ok('side列に潰れ止めの min-height がある', /min-height:\s*\d+px/.test(side), side);
  ok('🔴 1 1 auto にしていない（空の箱が画面いっぱいに伸びるため）', !/flex:\s*1\s+1\s+auto/.test(side), side);
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
console.log('\n── 📥 わざと山盛りにする ──');
{
  const made = await p.evaluate(() => {
    /* 盤は state.boards の中。既定の盤（default）に積む。
       ⚠ boardId を入れないと列に入らない（task.js が boardId で絞るため）。 */
    const bs = window.state.boards || {};
    const bd = bs.default || bs[Object.keys(bs)[0]];
    const side = ((bd && bd.cols) || []).filter(c => c.side).map(c => c.id);
    if (side.length < 2) return { side: side, n: 0 };
    let n = 0;
    side.forEach(function(id, k){
      for (let i = 0; i < 14 - k * 2; i++){
        state.cards.push({
          id: 'ZZ-' + id + '-' + i,
          boardId: bd.id,
          customerName: 'テスト' + i + '（' + id + '）',
          carModel: 'ながいながい車種名テスト' + i,
          plate: '品川 500 あ ' + (1000 + i),
          status: id, reserveDate: '2026-08-25'
        });
        n++;
      }
    });
    state.currentBoard = bd.id;
    renderTask();
    return { side: side, n: n };
  });
  ok('side列が2つある（廃車乗換／外注）', made.side.length >= 2, made.side);
  ok('カードを積んだ', made.n > 20, made.n);
}

await p.evaluate(() => showView('task'));
await p.waitForTimeout(500);

console.log('\n── 📏 枠の中で止まっているか ──');
{
  const m = await p.evaluate(() => {
    const kan = document.querySelector('#view-task .kanban') || document.querySelector('.kanban');
    const stack = kan && kan.querySelector('.kanban-side-stack');
    if (!stack) return null;
    const kr = kan.getBoundingClientRect();
    const cols = [].slice.call(stack.querySelectorAll('.kanban-col.side')).map(function(c){
      const body = c.querySelector('.kanban-col-body');
      const r = c.getBoundingClientRect();
      return {
        name: (c.querySelector('.kanban-col-head') || {}).textContent || '',
        bottom: Math.round(r.bottom),
        bodyH: body.clientHeight,
        bodyScrollH: body.scrollHeight,
        scrollable: body.scrollHeight > body.clientHeight + 1
      };
    });
    return { kanBottom: Math.round(kr.bottom), winH: window.innerHeight, cols: cols };
  });
  ok('縦積みが見つかる', !!m);
  if (m){
    m.cols.forEach(function(c){
      ok('「' + c.name.replace(/\s+/g, ' ').trim() + '」が画面の外に飛び出さない',
         c.bottom <= m.winH + 2, { bottom: c.bottom, winH: m.winH });
      ok('🔴 「' + c.name.replace(/\s+/g, ' ').trim() + '」が列の中でスクロールする',
         c.scrollable, { bodyH: c.bodyH, bodyScrollH: c.bodyScrollH });
    });
    ok('縦積みが板の下端を越えない', m.cols.every(function(c){ return c.bottom <= m.kanBottom + 2; }),
       { cols: m.cols.map(function(c){ return c.bottom; }), kanBottom: m.kanBottom });
  }
}

console.log('\n── 🧭 まわり ──');
{
  /* 中身が空でも、からっぽの箱が画面いっぱいに伸びない */
  const empty = await p.evaluate(() => {
    state.cards = state.cards.filter(function(c){ return String(c.id).indexOf('ZZ-') !== 0; });
    renderTask();
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
  const need = '2.9.6'.split('.').map(Number);
  const ge = (a, b) => (a[0]||0) !== (b[0]||0) ? (a[0]||0) > (b[0]||0)
                     : (a[1]||0) !== (b[1]||0) ? (a[1]||0) > (b[1]||0)
                     : (a[2]||0) >= (b[2]||0);
  ok('版が v2.9.6 以降', ge(vn, need), ver);
}

await b.close();
console.log('\n' + (NG ? '⚠ ' : '🎉 ') + OK + ' OK / ' + NG + ' NG');
process.exit(NG ? 1 : 0);
