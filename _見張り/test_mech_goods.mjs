/* PitFlow ── 📦 **物販のカードは、担当3つとも「なし」と読む**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた指定（2026-09-13・番号 T03-605881 / T03-802675）
     🗣「物販のバッチが付いている2枚。そもそもタスクビューで作業者などがカード詳細や
     　　ポップアップでも出ない設定、これはいい。ただチェックに引っかかっちゃう。
     　　内部的には物販のバッチが付いた時点で、点検作業チェック全てなしを裏でデフォルトチェックしておいてほしい」

   ◎ここで見張ること
     🔴🔴 ① 物販で担当が空 → データチェック T03 に出ない
     🔴🔴 ② 物販を外して普通の作業にしたら、**また T03 が言う**（「なし」が残って黙らない）
     🔴  ③ 普通の作業で担当が空なら、今までどおり出る
     🔴  ④ 物販でも名前が入っていれば、名前のほうを出す
     🔴  ⑤ カードに「なし」の印を書き込んでいない（読む側で決めている）

   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_mech_goods.mjs
       node _見張り/test_mech_goods.mjs --break=1  … 物販を「なし」と読むのをやめる（v2.93.0 までの姿）→ ① が赤
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').split('=')[1] || '';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');
function bend(name, src) {
  if (BREAK === '1' && name === 'mech-pick.js')
    return src.replace("return !!(c && (c[noneKey(role)] || goodsNone(c, role)));", "return !!(c && c[noneKey(role)]);");
  return src;
}

function boot(cards) {
  const ctx = { console, setTimeout, clearTimeout,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    state: { cards: cards || [], customers: [], loaners: [], companyCars: [], settings: {},
             workTypes: [], staff: [], boards: [], inspectMarks: {}, inspectMutes: {} } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(JS('intern-pit.js'), ctx, { filename: 'intern-pit.js' });
  vm.runInContext(JS('pit-share.js'), ctx, { filename: 'pit-share.js' });
  vm.runInContext(bend('mech-pick.js', JS('mech-pick.js')), ctx, { filename: 'mech-pick.js' });
  vm.runInContext(JS('inspect-rules.js'), ctx, { filename: 'inspect-rules.js' });
  return ctx;
}
/* 返車済みの1枚（担当は空）。作業タイプだけ変える。返車日は導入日より後＝チェック担当も数える側 */
const 済 = (id, wt) => ({ id, status: 'returned', returnStage: 'returnWait', workType: wt,
  amountQuote: 5000, amountFinal: 5000, completedAt: '2026-09-10', reserveDate: '2026-09-10',
  returnDate: '2026-09-10', customer: 'テスト', frontStaff: '小林', plate: '柏 500 あ 1', car: 'タント',
  inspectors: [], mechanics: [], checkers: [] });
const T03 = (ctx, id) => (ctx.pitInspectRun().findings || []).filter(f => f.ruleId === 'T03' && f.refId === id);

console.log('\n── ① 物販で担当が空 → T03 に出ない ──');
{
  const c = 済('g1', 'goods');
  const ctx = boot([c]);
  ok('前提：物販のカードとして読めている', ctx.pitCardGoods(c) === true);
  ok('🔴🔴 担当3つとも「決まっている」', ctx.pitMechUnsettled(c).length === 0, ctx.pitMechUnsettled(c));
  ok('🔴🔴 データチェック T03 に出ない', T03(ctx, 'g1').length === 0, T03(ctx, 'g1').map(f => f.text));
  ok('伝票の1行は「該当者なし」（「未入力」の赤字にしない）',
     ctx.pitMechLine(c).indexOf('未入力') < 0 && ctx.pitMechLine(c).indexOf('該当者なし') >= 0);
}

console.log('\n── ② 物販を外したら、また言う（「なし」が残って黙らない） ──');
{
  const c = 済('g2', 'goods');
  const ctx = boot([c]);
  ok('前提：物販のうちは出ない', T03(ctx, 'g2').length === 0);
  c.workType = 'oil';
  ok('🔴🔴 普通の作業に変えたら、担当が空だと T03 がまた出る', T03(ctx, 'g2').length === 1,
     ctx.pitMechUnsettled(c));
}

console.log('\n── ③ 普通の作業は今までどおり ──');
{
  const c = 済('n1', 'oil');
  const ctx = boot([c]);
  ok('🔴 担当が空なら T03 に出る', T03(ctx, 'n1').length === 1);
  ok('3つとも「入っていない」と言う', ctx.pitMechUnsettled(c).length === 3, ctx.pitMechUnsettled(c));
}

console.log('\n── ④⑤ 名前が入っていれば名前／カードに印は書かない ──');
{
  const c = Object.assign(済('g3', 'goods'), { mechanics: ['山田'] });
  const ctx = boot([c]);
  ok('🔴 物販でも名前が入っている役は、名前を出す', ctx.pitMechNames(c, 'mechanics').join() === '山田');
  ok('その役は「なし」とは読まない（人が優先）', ctx.PitMechPick.isNone(c, 'mechanics') === false);
  ok('入っていない役は「なし」と読む', ctx.PitMechPick.isNone(c, 'inspectors') === true);
  ctx.pitInspectRun();
  ok('🔴🔴 カードに「なし」の印を書き込んでいない（読む側で決めている）',
     !c.inspectorsNone && !c.mechanicsNone && !c.checkersNone,
     { i: c.inspectorsNone, m: c.mechanicsNone, c: c.checkersNone });
  const src = JS('mech-pick.js');
  ok('⚠ 物販かどうかは pitCardGoods 1本（workType を直に見ていない）',
     /window\.pitCardGoods\(c\)/.test(src) && !/workType\s*===\s*'goods'/.test(src));
}

console.log('\n─────────────────────────────');
if (BREAK) {
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  if (fail > 0) { console.log('🟢 正しい＝壊したら赤くなった（この見張りは効いている）'); process.exit(0); }
  console.log('🔴 まずい＝壊したのに全部緑のまま。見張りが効いていない'); process.exit(1);
}
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
