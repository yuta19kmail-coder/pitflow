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
  const want = ['D01','D08','F07','L03','L09','M04','M06','M07','R01','R04','T02','T08'];   /* v2.93.0 T02（完TELなしでOK）を足した */
  ok('🔴🔴 要判断はこの12本ちょうど（増えても減っても落ちる）', on.join() === want.join(), on);
  ok('🔴🔴 R01（同じ車が同じ日に2枚）に「これでいい」が付いた（ゆうた指定）', on.indexOf('R01') >= 0);
  ok('🔴🔴 D01（必須の項目が空）にも付いた（ゆうた指定）', on.indexOf('D01') >= 0);
  ok('🔴 規則そのものは消していない（R01・D01 は規則表に残っている）',
     R.some(x => x.id === 'R01') && R.some(x => x.id === 'D01'));
  ok('🔴 赤（抜け）のままにしてある＝「やらなくていい」にはしていない',
     R.filter(x => x.id === 'R01')[0].level === 'red' && R.filter(x => x.id === 'D01')[0].level === 'red');
  /* ⚠ v2.105.0 D10・T10（どちらも直すしかない側）を足して 41本 */
  ok('残り41本は「直すしかない」', R.length - on.length === 41, R.length);
}

console.log('\n── ⑤🔴🔴 「確認した」の札を、版のちがう端末どうしで消し合わない（v2.83.0） ──');
{
  /* 🗣「R01-297688 とか D01-774597 が、確認したでチェックしてても**数秒で戻ってきちゃう**」
     ◎正体＝**まだ新しくなっていない端末**では R01・D01 が「要判断ではない」ので、
       その端末の片づけが**札を消して保存**していた（押した本人の画面は正しい）。
     🔴 CoreBoard「動かしたはずのカードが戻る」とまったく同じ家族＝
       **自分の版の知識だけで、ほかの版が書いたものを消しに行かない。** */
  const ctx = boot([済(200000, 400000)]);
  const key = 'M07:' + 済(200000, 400000).id;
  ctx.pitInspectMark(key, 'ok');
  ok('🔴 要判断の規則には「確認した」が付く', !!(ctx.state.inspectMarks[key]), ctx.state.inspectMarks);
  ctx.pitInspectRun(); ctx.pitInspectRun(); ctx.pitInspectRun();
  ok('🔴🔴 何回チェックを走らせても札が消えない', !!(ctx.state.inspectMarks[key]), ctx.state.inspectMarks);
  const f = (ctx.pitInspectRun().findings || []).filter(x => x.key === key)[0];
  ok('🔴 数からは外れている（行は残る）', !!f && f.mark === 'ok', f && f.mark);
}
{
  /* 古い札＝要判断でない規則に付いてしまった「確認した」。**消さずに無視する。** */
  const c = 済(200000, 400000);
  const ctx = boot([c]);
  const key = 'D04:' + c.id;                       /* D04＝返車済みなのに電話番号が空（要判断ではない） */
  ctx.state.inspectMarks[key] = { v:'ok', at:'2026-09-01', by:'だれか' };
  const res = ctx.pitInspectRun();
  const f = (res.findings || []).filter(x => x.key === key)[0];
  ok('🔴🔴 抜け道にならない（要判断でない規則の「確認した」は数から外さない）',
     !!f && f.mark !== 'ok', f && f.mark);
  ok('🔴🔴 それでも札は消さない（版がちがう端末どうしで消し合わないため）',
     !!ctx.state.inspectMarks[key], ctx.state.inspectMarks);
  const src = JS('inspect-rules.js');
  ok('🔴 片づけの中に「要判断でないなら消す」が残っていない',
     !/mk\[k\]\.v === 'ok' && !judgeOf/.test(src));
}


console.log('\n── ☎ T02＝「完TELなしでOK」で閉じられる（v2.93.0・ゆうた指定 T02-245425） ──');
{
  /* 🗣「T02-245425 これ、直した以外にも完TELなしでOKのチェックがほしい」 */
  const 完TELなし = () => ({ id:'nocall1', status:'returned', returnStage:'', coverCall:{ done:false },
    amountQuote:30000, amountFinal:30000, completedAt:'2026-09-01', reserveDate:'2026-08-31',
    returnDate:'2026-09-01', customer:'テスト', plate:'柏 500 あ 1', car:'タント' });
  const ctx = boot([完TELなし()]);
  const T02 = () => (ctx.pitInspectRun().findings || []).filter(f => f.ruleId === 'T02');
  ok('前提：完TELの印が無い返車済みは T02 に出る', T02().length === 1);
  const f = T02()[0];
  ok('🔴 T02 は見て決める規則になった', !!f && f.judge === true);
  ok('🔴🔴 ボタンの言い方は「完TELなしでOK」（規則の表が持っている）', !!f && f.okLabel === '完TELなしでOK', f && f.okLabel);

  ctx.pitInspectMark(f.key, 'ok');
  const g = T02()[0];
  ok('🔴🔴 押すと数から外れる（消えはしない＝下の別枠に残る）', !!g && g.mark === 'ok');
  ok('🔴 押した日が残る', !!ctx.state.inspectMarks[f.key] && !!ctx.state.inspectMarks[f.key].at);
  const res = ctx.pitInspectRun();
  ok('🔴 これから直す数に入らない', (res.byRule.T02 || {}).open === 0, res.byRule.T02);

  /* ⚠ 抜け道にしない＝お金と担当は別の規則が見ている（ここで閉じても逃げない） */
  const ctx2 = boot([Object.assign(完TELなし(), { id:'nocall2', amountFinal:'' })]);
  const f2 = (ctx2.pitInspectRun().findings || []).filter(x => x.ruleId === 'T02')[0];
  ctx2.pitInspectMark(f2.key, 'ok');
  const still = (ctx2.pitInspectRun().findings || []).filter(x => x.refId === 'nocall2' && x.ruleId !== 'T02' && x.mark !== 'ok');
  ok('🔴🔴 T02 を閉じても、確定金額の抜けは別の規則で出たまま',
     still.some(x => x.ruleId === 'M02'), still.map(x => x.ruleId));

  /* ⚠ 他の抜け・矛盾は今までどおり閉じられない（言い方の仕組みを足しただけで、門は広げていない） */
  const d04 = 'D04:' + 'nocall1';
  ctx.pitInspectMark(d04, 'ok');
  ok('⚠ 要判断でない規則には、今までどおり付けられない', !ctx.state.inspectMarks[d04]);
}


console.log('\n── 👤 D08＝「何通りの書き方」ではなく「何人に分かれているか」（v2.95.0・ゆうた報告 D08-254938） ──');
{
  /* 🗣「これは顧客統合で直したはずなのに出る」
     顧客統合はカードのつながり（customerId）だけを付け替え、**名前の書き方は当時のまま残す**。 */
  const 車 = (id, name, extra) => Object.assign({ id, status:'returned', returnStage:'returnWait', amountFinal:5000,
    completedAt:'2026-09-01', reserveDate:'2026-09-01', returnDate:'2026-09-01', tel:'090-1111-2222',
    kana:name, customer:'', plate:'柏 500 あ ' + id, car:'タント' }, extra || {});
  const D08 = (ctx) => (ctx.pitInspectRun().findings || []).filter(f => f.ruleId === 'D08');
  const withCust = (cards, customers) => { const ctx = boot(cards); ctx.state.customers = customers || []; return ctx; };

  {
    const ctx = withCust([車('a1', 'ミゾグチ', { customerId:'cu1' }), 車('a2', '溝口', { customerId:'cu1' })],
                         [{ id:'cu1', name:'溝口', kana:'ミゾグチ', contacts:[{ tel:'090-1111-2222', primary:true }] }]);
    ok('🔴🔴 統合して同じお客様につながっていれば、書き方が違っても出ない（D08-254938 の形）', D08(ctx).length === 0, D08(ctx).map(f => f.text));
  }
  {
    const ctx = withCust([車('b1', 'ミゾグチ', { customerId:'cuB' }), 車('b2', '溝口', { customerId:'cuA' })],
                         [{ id:'cuA', name:'溝口', kana:'ミゾグチ' }, { id:'cuB', name:'', kana:'ミゾグチ', mergedInto:'cuA', archived:true }]);
    ok('🔴 統合で残った人を指す古いカードは、統合先までたどって同じ人とみなす', D08(ctx).length === 0, D08(ctx).map(f => f.text));
  }
  {
    const ctx = withCust([車('c1', 'ミゾグチ'), 車('c2', '溝口')], []);
    ok('🔴🔴 つながっていない2枚で書き方が違えば、今までどおり出る（2枚とも）', D08(ctx).length === 2, D08(ctx).length);
  }
  {
    const ctx = withCust([車('d1', 'ミゾグチ', { customerId:'cu1' }), 車('d2', 'サトウ', { customerId:'cu2' })],
                         [{ id:'cu1', kana:'ミゾグチ' }, { id:'cu2', kana:'サトウ' }]);
    ok('🔴 同じ番号で別々のお客様につながっていれば、出る（本当に分かれている）', D08(ctx).length === 2, D08(ctx).length);
  }
  {
    const ctx = withCust([車('e1', '溝口', { customerId:'cu1' }), 車('e2', 'ミゾグチ')],
                         [{ id:'cu1', name:'溝口', kana:'ミゾグチ' }]);
    ok('🔴 つながっていないカードでも、そのお客様と同じ書き方なら同じ人（D07 が別に見ている）', D08(ctx).length === 0, D08(ctx).map(f => f.text));
  }
  {
    const ctx = withCust([車('f1', '溝口', { customerId:'cu1' }), 車('f2', 'タナカ')],
                         [{ id:'cu1', name:'溝口', kana:'ミゾグチ' }]);
    ok('⚠ つながっていないカードが別の書き方なら、出る', D08(ctx).length === 2, D08(ctx).length);
  }
  {
    const cA = { id:'cuA', name:'溝口', kana:'ミゾグチ', contacts:[], vehicles:[] };
    const cB = { id:'cuB', name:'', kana:'ミゾグチ', mergedInto:'cuA' };
    const ctx = withCust([車('g1', 'ミゾグチ', { customerId:'cuB' }), 車('g2', '溝口', { customerId:'cuA' })], [cA, cB]);
    delete cB.mergedInto;                            /* 統合を取り消した＝つながりが②へ戻った形 */
    ok('⚠ 統合を取り消したら、また出る（正しい）', D08(ctx).length === 2, D08(ctx).length);
  }
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（緑 ' + pass + '件）' : '✅ 全部緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
