/* PitFlow ── 🔢 **クォーターチェックの「残り件数」は、箱と同じ物差しで数える**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた報告（2026-09-13）
     🗣「今8月をやってるのだが Q4が修正箇所１になってる。
     　　でもデータ違う、金額違う、日付違う のどれにもなくて…」

   ◎正体
     箱（データ・金額・日付）から「チェック済み」へ移す判定は `pitQRowDone`
     ＝「直した記録（DID）がある」だけで片づいた扱い。
     「まだ合っていない N件」（`pitQNokori`）は `pitQRowLeft > 0`（押していない印が残っているか）だけで数えていた。
     ＝ 実際に直したが「このままでよい」をまだ押していない行が、**どの箱にも居ないのに残り1件**。

   ◎ここで見張ること
     🔴🔴 ① チェック済みへ移した行（pitQRowDone）は、印が残っていても残りに数えない
     🔴  ② まだ片づいていない行は、今までどおり数える
     🔴  ③ OK の行は数えない
     🔴🔴 ④ 残り件数と、箱に出る件数が一致する（箱の物差しと同じ）

   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_quarter_nokori.mjs
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

/* 行ごとの「片づいたか／押していない印の数」を、見張りの側で決める（quarter-fix.js の中身は別の見張りが見ている） */
const DONE = {}, LEFT = {};
const ctx = { console, setTimeout, clearTimeout,
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, createElement: () => ({ style: {} }) },
  state: { cards: [], settings: {} },
  pitQRowDone: (p) => !!DONE[p.id],
  pitQRowLeft: (p) => LEFT[p.id] || 0 };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(JS('quarter.js'), ctx, { filename: 'quarter.js' });

const pair = (id, 組, left, done) => { LEFT[id] = left; DONE[id] = done; return { id, 組, soft: { i: id }, pit: { 生: { id: 'c' + id } } }; };
const R = (pairs, soft, pit) => ({ 結びついた: pairs, 整備ソフトだけ: soft || [], PitFlowだけ: pit || [] });

console.log('\n── ① 直した記録で「チェック済み」へ移した行は、残りに数えない ──');
{
  const r = R([pair(1, 'date', 1, true)]);
  ok('🔴🔴 直した記録あり・「このままでよい」は未押し → 残り 0（箱にも居ないので）', ctx.pitQNokori(r) === 0, ctx.pitQNokori(r));
}

console.log('\n── ② まだ片づいていない行は数える ──');
{
  const r = R([pair(2, 'date', 1, false), pair(3, 'money', 2, false), pair(4, 'data', 1, false)]);
  ok('🔴 日付・金額・データの未片づけ3件 → 残り 3', ctx.pitQNokori(r) === 3, ctx.pitQNokori(r));
}

console.log('\n── ③ OK の行は数えない ──');
{
  const r = R([pair(5, 'ok', 1, false)]);
  ok('OK の行 → 残り 0', ctx.pitQNokori(r) === 0, ctx.pitQNokori(r));
}

console.log('\n── ④ 残り件数と、箱に出る件数が一致する ──');
{
  /* ゆうたの8月Q4と同じ形：箱に出る行は0、チェック済みに1件、OK にお知らせ1件 */
  const r = R([pair(6, 'date', 1, true), pair(7, 'ok', 0, false)], [],
              [{ 生: { id: 'T23253' }, 別のQ: '伝票は Q3 にあります', 別のQ確定: true }]);
  const inBoxes = r.結びついた.filter(p => p.組 !== 'ok' && !DONE[p.id]).length;
  ok('🔴🔴 箱に出る行 0 件 ⇔ 残り 0 件（「どの箱にも無いのに残り1」にならない）', inBoxes === 0 && ctx.pitQNokori(r) === 0, { inBoxes, 残り: ctx.pitQNokori(r) });
  const src = fs.readFileSync(path.join(process.cwd(), 'js', 'quarter.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const body = (src.match(/function nokoriOf\(R\)\{[\s\S]*?\n  \}/) || [''])[0];
  ok('🔴 残り件数も箱（splitDone）と同じ pitQRowDone を見ている', /pitQRowDone/.test(body) && /function splitDone[\s\S]*?pitQRowDone/.test(src), body.slice(0, 200));
}


console.log('\n── ⑤ PitFlowだけの行：照合できた行だけ数えない（v2.101.0・ゆうた指定） ──');
{
  /* 🗣「伝票がない場合はアカでOK」「Q3の分がでたら再度Q3に赤が入る挙動で全然OK」 */
  const r = R([], [], [
    { 生: { id: 'T23253' }, 別のQ: '伝票は 8月 第3クォーター（2026-08-23・0696）にあります', 別のQ確定: true },
    { 生: { id: 'X1' }, 別のQ: 'このカードの売上日は 2026-09-02（9月 第1クォーター）です' },
    { 生: { id: 'X2' } }
  ]);
  ok('🔴🔴 照合できた1台は数えない／推しただけ・伝票なしの2台は数える → 残り 2', ctx.pitQNokori(r) === 2, ctx.pitQNokori(r));
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（緑 ' + pass + '件）' : '✅ 全部緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
