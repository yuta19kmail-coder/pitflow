/* ============================================================
   test_board_reorder_real.mjs
   タスクボードの並び替えを **本物のマウス** で総当たりする見張り。

   きっかけ：ゆうた 2026-08-27
     「挙動がバグってる。前よりひどい。**線をまたいでないのにその下の線がさらに下に行っちゃったりする**」
     「まずシンプルに **ABC で並んでます。ACB に変えられない**のよ」
     「ここ何度もやってるから**実機で確認するならしてちゃんとやって**」

   🔴🔴 いちばん大きい反省（この見張りが在る理由）
     それまでの見張りは `dispatchEvent(new DragEvent(...))` の**合成イベント**だった。
     合成だと `e.target` を自分で決めてしまうので、**本物のマウスなら踏む所を踏まない。**
     実際、v2.15.0 は合成では全部グリーンなのに、本物のマウスでは
     「B と 線 のあいだに落としたのに、カードが線の下に入る」が出た。
     ＝ **ドラッグの見張りは、本物のマウス（page.mouse）で回す。**

   何を見るか
     ・列の中身（カード＋区切りライン）の **すき間ぜんぶ** に、**中身ぜんぶ** を落として、
       「落としたすき間にそのまま入る」ことを1つずつ確かめる（総当たり）。
     ・線0本／1本／2本／先頭と末尾、の4通りで回す。

   使い方：
     node /tmp/srv.js &            ← 8994
     NODE_PATH=... node test_board_reorder_real.mjs
   ============================================================ */
import { chromium } from 'playwright';

const cp   = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = process.env.PORT || 8994;
let OK = 0, NG = 0;
function ok(name, cond, extra){
  if (cond) { OK++; console.log('  ✅ ' + name); }
  else { NG++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.renderTask', null, { timeout: 25000 });
await p.waitForTimeout(700);
await p.evaluate(() => showView('task'));
await p.waitForTimeout(400);

/* ---------- 画面側の道具 ---------- */
await p.evaluate(() => {
  var BODY = function(col){ return document.querySelector('.kanban-col-body[data-drop-val="' + (col || 'check') + '"]'); };
  window.__items = function(col){
    return [].slice.call(BODY(col).children).map(function(el){
      var c = el.getAttribute('data-card-id'), l = el.getAttribute('data-lineid');
      if (!c && !l) return null;
      var r = el.getBoundingClientRect();
      var t = el.querySelector('.kb-line-t');
      return { key: c ? c.replace('ZZ-', '') : ('線' + (t ? t.textContent : '')),
               top: r.top, bottom: r.bottom, left: r.left, width: r.width };
    }).filter(Boolean);
  };
  window.__ord   = function(col){ return window.__items(col).map(function(x){ return x.key; }); };
  window.__bodyBox = function(){ var r = BODY().getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height }; };
  window.__box   = function(sel){ var e = document.querySelector(sel); if (!e) return null;
                                  var r = e.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height }; };
  /* check 列にカード、estim 列に2枚。lines＝[{after:'B',name:'1'}] の形 */
  window.__setup = function(cards, lines){
    state.cards = state.cards.filter(function(c){ return String(c.id).indexOf('ZZ-') !== 0; });
    if (!state.settings) state.settings = {};
    state.settings.boardLines = [];
    state.cards.forEach(function(c){ if (c.boardId === 'default' && (c.status === 'check' || c.status === 'estim')) c.status = '__park'; });
    (cards || []).forEach(function(n, i){
      state.cards.push({ id:'ZZ-' + n, boardId:'default', customerName:n + 'さん', carModel:'車' + n,
        plate:'品川 500 あ ' + (1000 + i), status:'check', reserveDate:'2026-08-25' });
    });
    ['P','Q'].forEach(function(n, i){
      state.cards.push({ id:'ZZ-' + n, boardId:'default', customerName:n + 'さん', carModel:'車' + n,
        plate:'品川 500 い ' + (2000 + i), status:'estim', reserveDate:'2026-08-25' });
    });
    state.currentBoardId = 'default';
    renderTask();
    (lines || []).forEach(function(sp){ PitBoardLine.put('default', 'check', sp.after ? ('ZZ-' + sp.after) : '__top', sp.name); });
    renderTask();
    return window.__ord();
  };
});

const items   = ()      => p.evaluate(() => window.__items());
const ord     = (c)     => p.evaluate(x => window.__ord(x), c);
const setup   = (c, l)  => p.evaluate(([c, l]) => window.__setup(c, l), [c, l]);
const bodyBox = ()      => p.evaluate(() => window.__bodyBox());
const box     = (s)     => p.evaluate(x => window.__box(x), s);

/* 🔴 本物のマウスで運ぶ。合成イベントは使わない（この見張りの肝） */
async function mouseDrag(sx, sy, tx, ty){
  await p.mouse.move(sx, sy);
  await p.mouse.down();
  await p.mouse.move(sx, sy + 12, { steps: 4 });     /* 掴んだと分かる距離だけ先に動かす */
  await p.mouse.move(tx, ty, { steps: 14 });
  await p.mouse.move(tx, ty, { steps: 2 });
  await p.mouse.up();
  await p.waitForTimeout(320);
}
/* key（カード or 線）を、残りの並びの gap 番目のすき間へ落とす */
async function dragToGap(key, gap){
  const all  = await items();
  const me   = all.find(x => x.key === key);
  const rest = all.filter(x => x.key !== key);
  const bb   = await bodyBox();
  let y;
  if (!rest.length)          y = bb.y + bb.h / 2;
  else if (gap === 0)        y = rest[0].top + 3;
  else if (gap >= rest.length) y = rest[rest.length - 1].bottom - 3;
  else                       y = (rest[gap - 1].bottom + rest[gap].top) / 2;
  const x = me.left + me.width / 2;
  await mouseDrag(x, (me.top + me.bottom) / 2, x, y);
  const got  = (await ord()).join(' ');
  const want = rest.map(x2 => x2.key); want.splice(gap, 0, key);
  return { got: got, want: want.join(' ') };
}

/* ---------- ① 総当たり ---------- */
async function matrix(title, cards, lines, keys){
  console.log('\n── 🎯 ' + title + ' ──');
  const base = await setup(cards, lines);
  console.log('     初期 = ' + base.join(' '));
  let ng = 0, n = 0;
  for (const key of keys){
    for (let gap = 0; gap <= base.length - 1; gap++){
      await setup(cards, lines);
      const r = await dragToGap(key, gap);
      n++;
      if (r.got !== r.want){ ng++; console.log('     ❌ ' + key + ' → すき間' + gap + '  結果[' + r.got + ']  期待[' + r.want + ']'); }
    }
  }
  ok('すき間ぜんぶに落として、そこに入る（' + n + '通り）', ng === 0, { ng: ng });
}

await matrix('線なし・4枚',          ['A','B','C','D'], [], ['A','B','C','D']);
await matrix('線1本（Bの下）・4枚',  ['A','B','C','D'], [{ after:'B', name:'1' }], ['A','B','C','D','線1']);
await matrix('線2本（Aの下・Cの下）', ['A','B','C','D'], [{ after:'A', name:'1' }, { after:'C', name:'2' }], ['B','D','線1','線2']);
await matrix('線が先頭・線が末尾',    ['A','B','C'],     [{ after:null, name:'頭' }, { after:'C', name:'尾' }], ['A','C','線頭','線尾']);

/* ---------- ② そのほか ---------- */
const S = () => setup(['A','B','C','D'], [{ after:'B', name:'1' }]);   /* A B 線1 C D */
async function dragEl(srcSel, dstSel, frac){
  const s = await box(srcSel), d = await box(dstSel);
  await mouseDrag(s.x + s.w / 2, s.y + s.h / 2,
                  d.x + d.w / 2, d.y + Math.max(2, Math.min(d.h - 2, d.h * frac)));
}
const card = n => '[data-card-id="ZZ-' + n + '"]';

console.log('\n── 🧭 そのほか ──');
{
  await S();
  await dragEl(card('A'), card('D'), 0.85);
  const a1 = (await ord()).join(' ');
  ok('いちばん下へ落とすと、線の**下**に入る … ' + a1, a1 === 'B 線1 C D A', a1);
  const a2 = await p.evaluate(() => { for (let i = 0; i < 5; i++) renderTask(); return window.__ord().join(' '); });
  ok('🔴 5回描き直しても並びが動かない', a1 === a2, { a1: a1, a2: a2 });

  await S(); await dragEl(card('A'), card('C'), 0.85);
  const c1 = (await ord()).join(' ');
  ok('線をまたいで下へ … ' + c1, c1 === 'B 線1 C A D', c1);

  await S(); await dragEl(card('D'), card('A'), 0.15);
  const d1 = (await ord()).join(' ');
  ok('線をまたいで上へ … ' + d1, d1 === 'D A B 線1 C', d1);

  await S(); await dragEl(card('P'), card('B'), 0.85);
  const e1 = (await ord()).join(' ');
  ok('🔴 別の列から持ってきても、線の手前に入る … ' + e1, e1 === 'A B P 線1 C D', e1);

  await S();
  const f1 = await p.evaluate(() => { advanceCard('ZZ-A', 1); return window.__ord().join(' '); });
  ok('🔴 線の上の車を次工程へ送っても、線はその場 … ' + f1, f1 === 'B 線1 C D', f1);

  await S(); await dragEl(card('A'), '.kanban-td2-test', 0.5);
  const g1 = (await ord()).join(' ');
  ok('試運転の枠へ落としても、残りの並びと線は保つ … ' + g1, g1 === 'B 線1 C D', g1);

  await S(); await dragEl('.kanban-col-body[data-drop-val="check"] .kb-line', '#board-tabs', 0.5);
  const h1 = (await ord()).join(' ');
  ok('線を枠の外へ出すと消える … ' + h1, h1 === 'A B C D', h1);
}

console.log('\n── 🧾 まわり ──');
{
  ok('エラーなし', errs.length === 0, errs.slice(0, 3));
  const ver = await p.evaluate(() => (document.querySelector('meta[name=app-version]') || {}).content || '');
  /* 🔴 版くらべは**数で**（文字だと '2.9.6' > '2.15.1' になる） */
  const vn = (String(ver).match(/\d+/g) || []).map(Number);
  const need = '2.15.1'.split('.').map(Number);
  const ge = (a, b2) => (a[0]||0) !== (b2[0]||0) ? (a[0]||0) > (b2[0]||0)
                      : (a[1]||0) !== (b2[1]||0) ? (a[1]||0) > (b2[1]||0)
                      : (a[2]||0) >= (b2[2]||0);
  ok('版が v2.15.1 以降', ge(vn, need), ver);
}

await b.close();
console.log('\n' + (NG ? '⚠ ' : '🎉 ') + OK + ' OK / ' + NG + ' NG');
process.exit(NG ? 1 : 0);
