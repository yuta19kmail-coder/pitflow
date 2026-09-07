/* PitFlow ── 📜 **同じ画面の描き直しで、見ていた場所を動かさない**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた報告（2026-09-07）
     🗣「代車カレンダーとか、月の予約ビューとか、PitFlow には結構長いスクロール画面がある。
     　　ただ、**リアルタイム同期で受信したタイミングで常に当日とか初期に戻されるんだよね。**
     　　そうすると**探してるのに探せない**とかが発生する」

   ◎正体（1本）
     クラウドから何か届くたびに、いま開いている画面を**まるごと描き直している。**
     中身を入れ替えると一瞬だけ短くなり、**ブラウザがスクロール位置を巻き戻す。**
     見張っているのは7種類（カード・顧客・代車・貸出・社用車・車両予定・付箋）＝誰かが触るたびに起きる。
     ⚠ 代車カレンダーだけ v1.95.0 で**その画面の中だけ**の仕組みが入っていた。ほかには無かった。
     🔴 だから v2.84.0 は**画面ごとに足さず、views.js の1か所**で全画面ぶんを覚える。

   ◎ここで見張るもの
     ① 覚える／戻すの当てはめ（id が最優先・id が無いものは同じクラスの何番目か・画面そのもの）
     ② 動いていない所は覚えない（要らない書き戻しをしない）
     ③ 予約・返車の月ビューが、描き直しで**行数を戻さない／今日へ飛ばない**
     ④ 新しく開いた時は今までどおり（6週間ぶん・今日へ飛ぶ）

   ◎使い方（PitFlow のフォルダで）
     node _見張り/test_view_scroll.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');

/* ---- ごく小さい「にせDOM」。querySelectorAll はクラス名だけ見る ---- */
function el(id, cls, top, left, kids) {
  const e = { id: id || '', className: cls || '', scrollTop: top || 0, scrollLeft: left || 0, kids: kids || [] };
  e.all = function () { let out = []; e.kids.forEach(k => { out.push(k); out = out.concat(k.all()); }); return out; };
  e.querySelectorAll = function (sel) {
    if (String(sel) === '*') return e.all();
    const want = String(sel).split('.').filter(Boolean);
    return e.all().filter(x => want.every(w => (' ' + x.className + ' ').indexOf(' ' + w + ' ') >= 0));
  };
  return e;
}
function boot() {
  const ctx = { console, requestAnimationFrame: (f) => f(),
    state: { currentView: '' },
    document: { getElementById: (i) => ctx._byId[i] || null,
                querySelectorAll: () => [], addEventListener: () => {} } };
  ctx.window = ctx; ctx._byId = {};
  vm.createContext(ctx);
  /* views.js は関数を並べたファイル＝そのまま読み込める（画面は触らない） */
  vm.runInContext(JS('views.js'), ctx, { filename: 'views.js' });
  return ctx;
}

console.log('\n── ①📜 覚えて、戻す ──');
{
  const ctx = boot();
  const 内側 = el('rml-scroll', 'rml-scroll', 900, 0, []);
  const 名無しA = el('', 'lo-col', 40, 0, []);
  const 名無しB = el('', 'lo-col', 80, 0, []);
  const 画面 = el('view-reserve', 'view active', 120, 0, [内側, 名無しA, 名無しB]);
  ctx._byId['rml-scroll'] = 内側;

  const keep = ctx._pitScrollKeep(画面);
  ok('🔴 動いている所だけ覚える（画面そのもの＋3つ）', keep.length === 4, keep && keep.length);
  ok('🔴 画面そのものの位置も覚えている', keep.some(k => k.root && k.top === 120), keep);

  /* 描き直し＝ぜんぶ 0 に巻き戻された状態から戻す */
  画面.scrollTop = 0; 内側.scrollTop = 0; 名無しA.scrollTop = 0; 名無しB.scrollTop = 0;
  ctx._pitScrollRestore(画面, keep);
  ok('🔴🔴 id のある所が戻る（月ビューの長い一覧）', 内側.scrollTop === 900, 内側.scrollTop);
  ok('🔴 画面そのものが戻る', 画面.scrollTop === 120, 画面.scrollTop);
  ok('🔴 id が無い所も「同じクラスの何番目か」で戻る（1つ目）', 名無しA.scrollTop === 40, 名無しA.scrollTop);
  ok('🔴 同じクラスの2つ目も、取り違えずに戻る', 名無しB.scrollTop === 80, 名無しB.scrollTop);
}

console.log('\n── ② 動いていない所には触らない ──');
{
  const ctx = boot();
  const 画面 = el('view-task', 'view active', 0, 0, [el('', 'kan-col', 0, 0, [])]);
  ok('🔴 全部いちばん上なら、覚えるものは無い（要らない書き戻しをしない）',
     ctx._pitScrollKeep(画面) === null);
  ok('覚えていない時に戻しても、何も起きない（落ちない）',
     (function(){ try { ctx._pitScrollRestore(画面, null); return true; } catch(e){ return false; } })());
}

console.log('\n── ③ 予約・返車の月ビュー（行数と「今日へ飛ぶ」） ──');
{
  const rs = JS('reserve.js'), rt = JS('return.js');
  ok('🔴 予約：描き直しかどうかを見ている', /const _redraw = !!window\._pitRedraw;/.test(rs));
  ok('🔴🔴 予約：描き直しでは行数を6週間ぶんに戻さない',
     /if \(!_redraw \|\| !window\._rmlN\) window\._rmlN = 42;/.test(rs));
  ok('🔴🔴 予約：描き直しでは今日へ飛ばない', /if \(!_redraw\)\{[\s\S]{0,200}rml-date\.today/.test(rs));
  ok('🔴 返車：描き直しかどうかを見ている', /const _redraw = !!window\._pitRedraw;/.test(rt));
  ok('🔴🔴 返車：描き直しでは行数を戻さない',
     /if \(!_redraw \|\| !window\._rmlNR\) window\._rmlNR = 42;/.test(rt));
  ok('🔴🔴 返車：描き直しでは今日へ飛ばない', /if \(!_redraw\)\{[\s\S]{0,200}rml-date\.today/.test(rt));
}

console.log('\n── ④ 仕組みは1か所（画面ごとに書かない） ──');
{
  const v = JS('views.js');
  ok('🔴 描き直しかどうかを決めるのは views.js', /const _pitSame = \(window\._pitPrevView === viewId\);/.test(v));
  ok('🔴 描く前に覚えている', /const _pitKeep = _pitSame \? _pitScrollKeep\(target\) : null;/.test(v));
  ok('🔴 描いたあとに戻している（2回当てる）',
     /_pitScrollRestore\(target, _pitKeep\);[\s\S]{0,160}requestAnimationFrame/.test(v));
  ok('🔴🔴 印は必ず消している（次に直接描き直した時に勘ちがいしない）',
     /window\._pitRedraw = false;/.test(v));
  ok('🔴 代車カレンダーの中の仕組みは触っていない（v1.95.0 のまま）',
     /_pitPrevView !== 'loaner'/.test(JS('loaner.js')));
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（緑 ' + pass + '件）' : '✅ 全部緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
