/* ================================================================================
   test_board_dnd.mjs ── 🗂 タスクボードの並び替え（落とした場所に入る）  PitFlow v2.0.1
   ================================================================================
   ◎ゆうた報告（2026-08-23）
     🗣「**タスクボードの並び順に関して以前修正したが、まだダメらしい。
     　　なんか並び順を変えようと思っても元の位置に強制的に戻されたりする。
     　　好きなように並び替えられない**」

   ◎正体（2026-08-23 に実際に再現して確かめた）
     **カードの上に落とすと、必ずその「手前（上）」に入れていた。**
     ＝ 下へ動かしたい時は、落とした先のカードの**上**＝**元の位置**に戻る。

       | やったこと | 直す前 | あるべき |
       |---|---|---|
       | A を B に落とす（1つ下げたい） | **ABCD のまま** | BACD |
       | A を C に落とす（2つ下げたい） | BACD（1つだけ） | BCAD |
       | A を D に落とす（最下段に）   | BCAD（最下段でない） | BCDA |
       | D を B に落とす（**上げる**） | ADBC ✅ | ADBC |

     ＝ **上げる方向だけ効く**ので「たまに動く」ように見えていた。

   ◎これから ＝ **落とした「高さ」で決める**
     カードの**上半分**に落とした → そのカードの手前
     カードの**下半分**に落とした → そのカードの後ろ
     どのカードよりも下 → 列のいちばん下
     🔴 この決め方は `anchorFromPoint` が元から持っていた（列の余白に落とした時だけ使っていた）。
        **カードの上に落とした時にも同じ道を通す**＝決め方を2つに割らない。

   ◎ここで見張ること
     ① 落とした高さのとおりに入る（上半分／下半分／いちばん下）
     ② 🔴 `_dropBefore` が null なのは「いちばん下」という**答え**。「読めなかった」と混ぜない
     ③ 並び番号（boardOrder）が実際に書き換わっている＝開き直しても同じ順
     ④ 工程のポップアップを挟んでも、落とした場所に入る
     ⑤ ソースの見張り

   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8980      ← 別ウィンドウ
     node test_board_dnd.mjs
   ================================================================================ */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8980;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(x => fs.existsSync(x));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };
const src = f => fs.readFileSync(f, 'utf8');

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1700, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.renderTask && window.PitBoardOrder', null, { timeout: 25000 });
await p.waitForTimeout(900);

/* --------------------------------------------------------------------------
   下ごしらえ＝A B C D の4枚だけを1つの列に置いて、**本番と同じ drop の道**を通す。
   ⚠ 日付は「今日から◯日」で置く（決め打ちにすると、その日を過ぎてから落ちる）。
   -------------------------------------------------------------------------- */
await p.evaluate(() => {
  const iso = off => { const d = new Date(); d.setDate(d.getDate() + off);
    const q = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); };
  const bd = state.boards[0];
  const col = bd.cols.find(c => !c.side && !c.terminal) || bd.cols[0];
  state.currentBoardId = bd.id;
  window.__col = col.id;
  window.__mk = (id, o) => ({ id, boardId: bd.id, status: col.id, boardOrder: o,
    customer: '客' + id, kana: 'キャク', car: '車', resNo: 'R' + id, reserveDate: iso(-3), log: [] });
  window.__reset = () => { state.cards = ['A','B','C','D'].map((x, i) => window.__mk(x, (i + 1) * 10)); showView('task'); };
  window.__now = () => PitBoardOrder.sort(state.cards.filter(c => c.status === window.__col)).map(c => c.id).join('');
  window.__el = id => document.querySelector('#kanban-cols .kanban-col-body .pit-card[data-card-id="' + id + '"]');
  /* 🔴 本番とまったく同じ道＝dragstart → drop を、狙った高さで起こす */
  window.__drop = (dragId, onId, half) => {
    window.__reset();
    const s = window.__el(dragId), t = window.__el(onId);
    if (!s || !t) return 'カードが出ていない';
    const r = t.getBoundingClientRect();
    const y = r.top + (half === 'top' ? r.height * 0.25 : r.height * 0.75);
    const dt = new DataTransfer(); dt.setData('text/plain', dragId);
    s.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    t.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientY: y, clientX: r.left + 10, dataTransfer: dt }));
    return window.__now();
  };
});

console.log('\n── ① 落とした高さのとおりに入る（ゆうた報告の本体） ──');
{
  const r = await p.evaluate(() => ({
    start: (window.__reset(), window.__now()),
    a_b_bottom: window.__drop('A', 'B', 'bottom'),
    a_b_top:    window.__drop('A', 'B', 'top'),
    a_c_top:    window.__drop('A', 'C', 'top'),
    a_c_bottom: window.__drop('A', 'C', 'bottom'),
    a_d_bottom: window.__drop('A', 'D', 'bottom'),
    b_d_bottom: window.__drop('B', 'D', 'bottom'),
    d_b_top:    window.__drop('D', 'B', 'top'),
    d_a_top:    window.__drop('D', 'A', 'top'),
    c_a_top:    window.__drop('C', 'A', 'top')
  }));
  ok('はじめの並びは A B C D', r.start === 'ABCD', r.start);
  /* 🔴🔴 ここが報告そのもの＝直す前は 'ABCD'（動かなかった） */
  ok('🔴🔴 A を B の下半分に落とす＝1つ下がる（前は動かなかった）', r.a_b_bottom === 'BACD', r.a_b_bottom);
  ok('A を B の上半分に落とす＝Bの手前＝元のまま（これは正しい）', r.a_b_top === 'ABCD', r.a_b_top);
  ok('A を C の上半分＝Cの手前（2番目）', r.a_c_top === 'BACD', r.a_c_top);
  ok('A を C の下半分＝Cの後ろ（3番目）', r.a_c_bottom === 'BCAD', r.a_c_bottom);
  /* 🔴🔴 いちばん下へ落とす道（`_dropBefore` が null＝「いちばん下」という答え） */
  ok('🔴🔴 A を D の下半分に落とす＝いちばん下', r.a_d_bottom === 'BCDA', r.a_d_bottom);
  ok('🔴🔴 B を D の下半分に落とす＝いちばん下', r.b_d_bottom === 'ACDB', r.b_d_bottom);
  ok('D を B の上半分に落とす＝上げるのも今までどおり効く', r.d_b_top === 'ADBC', r.d_b_top);
  ok('D を A の上半分に落とす＝先頭へ', r.d_a_top === 'DABC', r.d_a_top);
  ok('C を A の上半分に落とす＝先頭へ', r.c_a_top === 'CABD', r.c_a_top);
}

console.log('\n── ② 並び番号がちゃんと書き換わっている（開き直しても同じ順） ──');
{
  const r = await p.evaluate(() => {
    window.__drop('A', 'D', 'bottom');
    const by = {}; state.cards.forEach(c => { by[c.id] = c.boardOrder; });
    /* 番号だけで並べ直しても同じ順になるか＝画面の配列に頼っていないこと */
    const only = state.cards.slice().sort((x, y) => x.boardOrder - y.boardOrder).map(c => c.id).join('');
    return { by, only, dup: new Set(Object.values(by)).size === Object.keys(by).length };
  });
  /* ⚠ いちばん下へ動かした時は「その列のいちばん大きい番号＋10」を付けるだけ。
     列ぜんぶを振り直さないのは、**クラウドへの書き込みを増やさない**ため（board-order.js の決めごと）。
     見るのは「番号の大小が、出したい順のとおりか」。 */
  ok('🔴 番号の大小が、出したい順のとおり（B<C<D<A）',
     r.by.B < r.by.C && r.by.C < r.by.D && r.by.D < r.by.A, r.by);
  ok('🔴 全員が番号を持っている', Object.values(r.by).every(v => typeof v === 'number'), r.by);
  ok('🔴 番号だけで並べても同じ順（配列の順に頼っていない）', r.only === 'BCDA', r.only);
  ok('同じ番号が2枚に付いていない', r.dup === true, r.by);
}

console.log('\n── ③ 列の余白に落とした時（今までどおり） ──');
{
  const r = await p.evaluate(() => {
    window.__reset();
    const s = window.__el('A');
    const body = document.querySelector('#kanban-cols .kanban-col-body[data-drop="status"]');
    const br = body.getBoundingClientRect();
    const dt = new DataTransfer(); dt.setData('text/plain', 'A');
    s.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    /* いちばん下の余白に落とす */
    body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true,
      clientY: br.bottom - 2, clientX: br.left + 10, dataTransfer: dt }));
    return window.__now();
  });
  ok('列の下の余白に落とす＝いちばん下（v1.140.1 のまま）', r === 'BCDA', r);
}

console.log('\n── ④ 工程のポップアップを挟んでも、落とした場所に入る ──');
{
  /* 🔴 ポップアップは**あとから**確定する。その時 `_dropBefore` は片づいているので、
     つかまえておかないと**必ずいちばん下**に入っていた（v1.140.1 の取り残し）。 */
  const r = await p.evaluate(async () => {
    const bd = state.boards[0];
    const cols = bd.cols.filter(c => !c.side && !c.terminal);
    if (cols.length < 2) return 'skip';
    const from = cols[0].id, to = cols[1].id;
    const iso = off => { const d = new Date(); d.setDate(d.getDate() + off);
      const q = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); };
    const mk = (id, o, st) => ({ id, boardId: bd.id, status: st, boardOrder: o,
      customer: '客' + id, kana: 'キャク', car: '車', resNo: 'R' + id, reserveDate: iso(-3), log: [] });
    state.cards = [mk('X', 10, from), mk('P', 10, to), mk('Q', 20, to), mk('R', 30, to)];
    /* ポップアップを「あとから確定する」形に差し替える（本番と同じ非同期の道） */
    const real = window.PitPhasePopup;
    window.PitPhasePopup = { maybeIntercept: function (c, f, t, done) { setTimeout(done, 30); return true; } };
    showView('task');
    const s = document.querySelector('#kanban-cols .pit-card[data-card-id="X"]');
    const t = document.querySelector('#kanban-cols .pit-card[data-card-id="P"]');
    if (!s || !t) { window.PitPhasePopup = real; return 'NG'; }
    const rr = t.getBoundingClientRect();
    const dt = new DataTransfer(); dt.setData('text/plain', 'X');
    s.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    t.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true,
      clientY: rr.top + rr.height * 0.25, clientX: rr.left + 10, dataTransfer: dt }));
    await new Promise(r2 => setTimeout(r2, 120));
    window.PitPhasePopup = real;
    return PitBoardOrder.sort(state.cards.filter(c => c.status === to)).map(c => c.id).join('');
  });
  if (r === 'skip') console.log('  ⏸ 列が2つ以上ない箱なので、この節は走らせていません');
  else ok('🔴 ポップアップを挟んでも、落とした場所（Pの手前）に入る', r === 'XPQR', r);
}

console.log('\n── ⑤ ソースの見張り ──');
{
  const d = src('js/dnd.js'), bo = src('js/board-order.js');
  const code = x => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('🔴 「読めなかった」と「いちばん下」を旗で見分けている',
     /_dropInBoard/.test(code(d)), 'dnd.js');
  ok('🔴 目印は落とす前につかまえている（ポップアップの後で読み直さない）',
     /_anchorS\s*=\s*_dropBefore/.test(code(d)) && !/var _bf = _dropBefore/.test(code(d)), 'dnd.js');
  ok('🔴 高さの読み方は1本（anchorFromPoint）',
     (code(d).match(/anchorFromPoint\s*\(/g) || []).length === 2, 'dnd.js');
  ok('🔴 番号を書くのは board-order.js だけ（dnd.js で boardOrder を直に触っていない）',
     !/\bboardOrder\s*=/.test(code(d)), 'dnd.js');
  ok('🔴 並びの物差し（sort）は番号を見ている', /orderOf\(a\)/.test(bo), 'board-order.js');
  const idx = src('index.html');
  const _v = [ (idx.match(/app-version" content="([\d.]+)"/) || [])[1],
               (idx.match(/class="login-ver">v([\d.]+)</) || [])[1],
               (idx.match(/class="ver">v([\d.]+)</) || [])[1] ];
  ok('版が3か所そろっている', !!_v[0] && _v[0] === _v[1] && _v[1] === _v[2], _v);
  ok('版が v2 以上', /^2\./.test(_v[0] || ''), _v[0]);
  ok('キャッシュ番号が付いている（dnd.js）', /js\/dnd\.js\?v=\d+/.test(idx), '');
}
ok('🔴 画面がつまずいていない（赤いエラーが1つも出ていない）', errs.length === 0, errs.slice(0, 4));

console.log('\n' + (fail ? '' : '🎉 ') + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail ? 1 : 0);
