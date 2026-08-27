/* ============================================================
   test_board_line_slot.mjs
   タスクボードの区切りラインが「その場に残る」かを見張る。

   きっかけ：ゆうた 2026-08-27
     「並びが強制的に動かされる」
     「ラインが一番下に来ている時に、ラインの下にカードを配置できない」

   何が起きていたか（v2.14.0 まで）：
     線の位置が `after`（どのカードの下か）だけで保存されていた。
     ・線の直上の車を次の工程へ送る → 相手を失った線が**列の末尾へ落ちる**
     ・末尾へ落ちた線は「どのカードよりも下」の扱い → **その下に一生カードを置けない**

   いまの決めごと（v2.15.0）：
     線にも並び番号（`order`）を持たせて、カードの `boardOrder` と**同じ数直線**に乗せる。
     ・番号を書くのは board-order.js だけ（board-line.js は `useExtra` で登録するだけ）
     ・`moveToEnd`（いちばん下へ）は**線の番号も見る**
     ・昔の線は初めて描く時に `after` から自動で番号に直す
     ・`after` は消さずに書き続ける＝コードを戻せば元の動きに戻せる

   使い方：
     node /tmp/srv.js &            ← 8993
     NODE_PATH=... node test_board_line_slot.mjs
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const cp   = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = process.env.PORT || 8993;
let OK = 0, NG = 0;
function ok(name, cond, extra){
  if (cond) { OK++; console.log('  ✅ ' + name); }
  else { NG++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

/* ===== ① コードの決めごと ===== */
console.log('\n── 📜 コードの決めごと ──');
{
  const bo = fs.readFileSync(path.join(process.cwd(), 'js', 'board-order.js'), 'utf8');
  const bl = fs.readFileSync(path.join(process.cwd(), 'js', 'board-line.js'), 'utf8');
  ok('board-order.js に「カード以外」の登録口がある（useExtra）', /useExtra\s*:/.test(bo));
  ok('board-order.js に placeExtraAfter がある', /placeExtraAfter\s*:/.test(bo));
  ok('🔴 board-line.js が自分を登録している', /PitBoardOrder\.useExtra\(/.test(bl));
  ok('🔴 番号を書くのは board-order.js だけ（board-line.js に renumber が無い）',
     !/function\s+renumber/.test(bl));
  ok('昔の線を番号に直す道がある（ensureOrder）', /function\s+ensureOrder/.test(bl));
  ok('🔴 after も書き続けている（戻せる控え）', /l\.after\s*=\s*after\s*\|\|\s*TOP/.test(bl));
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.renderTask', null, { timeout: 25000 });
await p.waitForTimeout(700);
await p.evaluate(() => showView('task'));
await p.waitForTimeout(400);

/* 道具を仕込む（列＝点検待ち／カードは ZZ-0 … ZZ-4） */
await p.evaluate(() => {
  window.__ord = function(){
    const body = document.querySelector('.kanban-col-body[data-drop-val="check"]');
    return [].slice.call(body.children).map(function(el){
      return el.getAttribute('data-card-id') || (el.classList.contains('kb-line') ? 'LINE' : '·');
    }).filter(function(x){ return x !== '·'; });
  };
  window.__setup = function(n){
    state.cards = state.cards.filter(function(c){ return String(c.id).indexOf('ZZ-') !== 0; });
    if (!state.settings) state.settings = {};
    state.settings.boardLines = [];
    state.cards.forEach(function(c){ if (c.boardId === 'default' && (c.status === 'check' || c.status === 'estim')) c.status = '__park'; });
    for (let i = 0; i < n; i++){
      state.cards.push({ id: 'ZZ-' + i, boardId: 'default', customerName: 'C' + i, carModel: '車' + i,
        plate: '品川 500 あ ' + (1000 + i), status: 'check', reserveDate: '2026-08-25' });
    }
    state.currentBoardId = 'default';
    renderTask();
    return window.__ord();
  };
  /* 昔の形の線＝`after` だけで `order` を持たない（移行を試すため） */
  window.__oldLine = function(after){
    state.settings.boardLines.push({ id: 'bl-old', boardId: 'default', status: 'check',
      after: after, label: 'ここまで', color: 'orange' });
    renderTask();
    return window.__ord();
  };
  window.__lineData = function(){
    return (state.settings.boardLines || []).map(function(l){ return { id: l.id, order: l.order, after: l.after }; });
  };
  /* カードを落とす。to='__space'（列の余白＝いちばん下）／カードid＋'top'|'bottom' */
  window.__drop = function(fromId, to, where){
    const body = document.querySelector('.kanban-col-body[data-drop-val="check"]');
    const src  = document.querySelector('[data-card-id="' + fromId + '"]');
    let tgt, y;
    if (to === '__space'){ const r = body.getBoundingClientRect(); tgt = body; y = r.bottom - 4; }
    else { const el = body.querySelector('[data-card-id="' + to + '"]'); const r = el.getBoundingClientRect();
           tgt = el; y = (where === 'top') ? r.top + 3 : r.bottom - 3; }
    const o = { bubbles:true, cancelable:true, composed:true,
                clientX: tgt.getBoundingClientRect().left + 20, clientY: y };
    src.dispatchEvent(new DragEvent('dragstart', o));
    tgt.dispatchEvent(new DragEvent('dragover', o));
    tgt.dispatchEvent(new DragEvent('drop', o));
    document.dispatchEvent(new DragEvent('dragend', { bubbles:true }));
    return window.__ord();
  };
});

console.log('\n── 🩹 ゆうたが踏んだ順番そのまま ──');
{
  await p.evaluate(() => window.__setup(5));
  const a = await p.evaluate(() => { PitBoardLine.put('default', 'check', 'ZZ-2', '今日はここまで'); renderTask(); return window.__ord(); });
  ok('線をまん中（3枚目の下）に引ける', JSON.stringify(a) === JSON.stringify(['ZZ-0','ZZ-1','ZZ-2','LINE','ZZ-3','ZZ-4']), a);

  const c = await p.evaluate(() => { advanceCard('ZZ-2', 1); return window.__ord(); });
  ok('🔴 線の直上の車を次工程へ送っても、線はその場に残る',
     JSON.stringify(c) === JSON.stringify(['ZZ-0','ZZ-1','LINE','ZZ-3','ZZ-4']), c);

  const e = await p.evaluate(() => window.__drop('ZZ-0', '__space'));
  ok('🔴 そのあと、いちばん下へ落としたカードが線の下に入る',
     JSON.stringify(e) === JSON.stringify(['ZZ-1','LINE','ZZ-3','ZZ-4','ZZ-0']), e);
}

console.log('\n── ⬇ 線が列のいちばん下にある時 ──');
{
  await p.evaluate(() => window.__setup(5));
  const a = await p.evaluate(() => { PitBoardLine.put('default', 'check', 'ZZ-4', ''); renderTask(); return window.__ord(); });
  ok('線が末尾に入る', a[a.length - 1] === 'LINE', a);

  const c = await p.evaluate(() => window.__drop('ZZ-0', '__space'));
  ok('🔴 いちばん下へ落としたカードは、線の**下**に入る', c[c.length - 1] === 'ZZ-0' && c[c.length - 2] === 'LINE', c);

  /* 線の相手カード（ZZ-4）を上へ動かしても、線は下に残る */
  const e = await p.evaluate(() => { window.__setup(5); PitBoardLine.put('default','check','ZZ-4',''); renderTask();
                                     return window.__drop('ZZ-4', 'ZZ-0', 'top'); });
  ok('🔴 線の相手カードを上へ動かしても、線は下に残る（線がカードに付いて行かない）',
     e[e.length - 1] === 'LINE', e);

  /* 新しいカードが列に増えた時（ensure）も線の下 */
  const f = await p.evaluate(() => {
    state.cards.push({ id: 'ZZ-new', boardId:'default', customerName:'新', carModel:'新車',
      plate:'品川 500 あ 9999', status:'check', reserveDate:'2026-08-26' });
    renderTask(); return window.__ord();
  });
  ok('🔴 あとから増えたカードも、線の下に付く', f[f.length - 1] === 'ZZ-new' && f.indexOf('LINE') === f.length - 2, f);
}

console.log('\n── 🕰 昔の線（order を持っていない）を読んだ時 ──');
{
  await p.evaluate(() => window.__setup(5));
  const a = await p.evaluate(() => window.__oldLine('ZZ-2'));
  ok('昔の線も、書いてあった場所に出る', JSON.stringify(a) === JSON.stringify(['ZZ-0','ZZ-1','ZZ-2','LINE','ZZ-3','ZZ-4']), a);
  const d = await p.evaluate(() => window.__lineData());
  ok('🔴 描いた時に番号が付く（移行）', d.length === 1 && typeof d[0].order === 'number', d);
  ok('🔴 after も消えていない（戻せる）', d.length === 1 && d[0].after === 'ZZ-2', d);

  /* 迷子＝相手のカードが居ない昔の線。末尾に出るが、その下にカードは置ける */
  await p.evaluate(() => window.__setup(5));
  const g = await p.evaluate(() => window.__oldLine('NO-SUCH-CARD'));
  ok('迷子の線は末尾に出る（黙って消さない）', g[g.length - 1] === 'LINE', g);
  const h = await p.evaluate(() => window.__drop('ZZ-0', '__space'));
  ok('🔴 迷子の線でも、その下にカードを置ける', h[h.length - 1] === 'ZZ-0', h);
}

console.log('\n── 🧭 まわり ──');
{
  /* 線が無い列は今までどおり（並べ替えが壊れていない） */
  await p.evaluate(() => window.__setup(5));
  const a = await p.evaluate(() => window.__drop('ZZ-0', 'ZZ-2', 'bottom'));
  ok('線が無い列：カードの下半分に落とすと、その下に入る',
     JSON.stringify(a) === JSON.stringify(['ZZ-1','ZZ-2','ZZ-0','ZZ-3','ZZ-4']), a);
  const c = await p.evaluate(() => { window.__setup(5); return window.__drop('ZZ-0', 'ZZ-2', 'top'); });
  ok('線が無い列：上半分に落とすと、その手前に入る',
     JSON.stringify(c) === JSON.stringify(['ZZ-1','ZZ-0','ZZ-2','ZZ-3','ZZ-4']), c);

  ok('エラーなし', errs.length === 0, errs.slice(0, 3));
  const ver = await p.evaluate(() => (document.querySelector('meta[name=app-version]') || {}).content || '');
  /* 🔴 版くらべは**数で**（文字だと '2.9.6' > '2.15.0' になる） */
  const vn = (String(ver).match(/\d+/g) || []).map(Number);
  const need = '2.15.0'.split('.').map(Number);
  const ge = (a2, b2) => (a2[0]||0) !== (b2[0]||0) ? (a2[0]||0) > (b2[0]||0)
                       : (a2[1]||0) !== (b2[1]||0) ? (a2[1]||0) > (b2[1]||0)
                       : (a2[2]||0) >= (b2[2]||0);
  ok('版が v2.15.0 以降', ge(vn, need), ver);
}

await b.close();
console.log('\n' + (NG ? '⚠ ' : '🎉 ') + OK + ' OK / ' + NG + ' NG');
process.exit(NG ? 1 : 0);
