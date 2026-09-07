/* PitFlow ── 🩺 **「これでいい」を押せる規則と、金額の倍率の下限**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた指定（2026-09-07・日常チェックの現物を見ながら）
     🗣「R01-297688　これはあってるのよ実際には。だから **これでいい** が必要」
     🗣「D01-774597　これも これでいい」
     🗣「M07-404654　これは **20万円以下の倍率は考えなくていい**。例えば **20万が40万とかはチェック対象**」

   ◎決めごと
     ・R01（同じ車が同じ日に2枚）と D01（これから作業する車で必須の項目が空）を**要判断**にした。
       🔴 規則は消していない。**1件ずつ人が見て「確認した」を押す**（押した人と日付が残る）。
       ⚠ 「やらなくていい」にはしていない＝**見て決めるのが仕事**の所に手段を置いただけ。
     ・M07（見積と確定が大きく違う）は、**見積と確定の大きいほうが 20万円以下なら出さない。**
       ⚠ **小さいほう**で見ない。見積5万 → 確定40万 を落としてしまう。

   ◎使い方（PitFlow のフォルダで）
     node _見張り/test_inspect_judge.mjs
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

function boot(cards) {
  const ctx = { console, setTimeout, clearTimeout,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    state: { cards: cards || [], customers: [], loaners: [], companyCars: [], settings: {},
             workTypes: [], staff: [], boards: [], inspectMarks: {}, inspectMutes: {} } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(JS('intern-pit.js'), ctx, { filename: 'intern-pit.js' });
  vm.runInContext(JS('pit-share.js'), ctx, { filename: 'pit-share.js' });
  vm.runInContext(JS('inspect-rules.js'), ctx, { filename: 'inspect-rules.js' });
  return ctx;
}
/* 返車済みの1枚。見積と確定だけ変える */
const 済 = (q, f) => ({ id: 'q' + q + '_' + f, status: 'returned', returnStage: 'returnWait',
  amountQuote: q, amountFinal: f, completedAt: '2026-09-01', reserveDate: '2026-08-28',
  returnDate: '2026-09-01', customer: 'テスト', plate: '柏 500 あ ' + q, car: 'タント' });
const M07 = (ctx) => (ctx.pitInspectRun().findings || []).filter(f => f.ruleId === 'M07');

console.log('\n── ①💴 20万円以下の倍率は見ない（ゆうた指定） ──');
{
  ok('🔴 5万 → 15万（3倍）は出さない（大きいほうが20万以下）', M07(boot([済(50000, 150000)])).length === 0);
  ok('🔴 10万 → 5万（半分以下）も出さない', M07(boot([済(100000, 50000)])).length === 0);
  ok('ちょうど20万どうしの動きも出さない', M07(boot([済(100000, 200000)])).length === 0);
}

console.log('\n── ②🔴🔴 大きいほうが20万を超えたら出す（ゆうたの例そのもの） ──');
{
  ok('🔴🔴 20万 → 40万 は出す（ゆうたの例）', M07(boot([済(200000, 400000)])).length === 1);
  ok('🔴 30万 → 10万（半分以下）も出す', M07(boot([済(300000, 100000)])).length === 1);
  ok('🔴🔴 見積5万 → 確定40万 は出す（**小さいほうで見ていない**ことの確認）',
     M07(boot([済(50000, 400000)])).length === 1);
}

console.log('\n── ③ 倍率そのものの決まりは変えていない ──');
{
  ok('20万 → 30万（1.5倍）は今までどおり出さない', M07(boot([済(200000, 300000)])).length === 0);
  ok('見積が空なら出さない（前から）', M07(boot([済(0, 400000)])).length === 0);
}

console.log('\n── ④✅ 「これでいい」を押せる規則（要判断） ──');
{
  const R = boot([]).PIT_INSPECT_RULES || [];
  const on = R.filter(x => x.judge).map(x => x.id).sort();
  const want = ['D01','D08','F07','L03','L09','M04','M06','M07','R01','R04','T08'];
  ok('🔴🔴 要判断はこの11本ちょうど（増えても減っても落ちる）', on.join() === want.join(), on);
  ok('🔴🔴 R01（同じ車が同じ日に2枚）に「これでいい」が付いた（ゆうた指定）', on.indexOf('R01') >= 0);
  ok('🔴🔴 D01（必須の項目が空）にも付いた（ゆうた指定）', on.indexOf('D01') >= 0);
  ok('🔴 規則そのものは消していない（R01・D01 は規則表に残っている）',
     R.some(x => x.id === 'R01') && R.some(x => x.id === 'D01'));
  ok('🔴 赤（抜け）のままにしてある＝「やらなくていい」にはしていない',
     R.filter(x => x.id === 'R01')[0].level === 'red' && R.filter(x => x.id === 'D01')[0].level === 'red');
  ok('残り40本は「直すしかない」', R.length - on.length === 40, R.length);
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（緑 ' + pass + '件）' : '✅ 全部緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
