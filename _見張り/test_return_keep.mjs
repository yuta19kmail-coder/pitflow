/* PitFlow ── 🔴 **過ぎた返車日を、消さずに残す**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた報告（2026-08-29・予約 J32544）
     🗣「これがデータチェックに入っていて 返車日が入ってないと。
     　　そして返車日をいれても **常に未定にチェックが入る**」
     🗣「返車日が決まる→来ない→**これは残した状態で**また未定に戻る→決める→返す
     　　こんな流れは不可能か？」

   ◎何が起きていたか（本番の記録そのまま）
     10:45:20 [チーフ] データチェックから直した：返車予定日 （空）→ 2026-08-25
     10:45:21 （自動）  返車予定日（2026-08-25）を過ぎたので返車日未定へ（自動）   ← **1秒後**
     …これを3回くり返していた。**今日より前の日を入れると、入れた瞬間に消される。**

   ◎3つ同時に起きていた
     🔴 ① 入れた返車日が**消される**（今日より前だと）
     🔴 ② 消えるので**「未定」のチェックが勝手に入る**（空かどうかで見ているため）
     🔴 ③ データチェック F03「返車予定日が空」が鳴り続ける＝**出口がない**
     おまけ ④ 消す→入れ直す のたびに操作ログが1行増える（1台で自動124行・人24行になっていた）

   ◎直す考え方（ゆうた案）
     🔴 **日付は消さない。置き場だけ「返車日未定」に出す。**
        ＝ この作りは**もう半分入っている**（待ち・当日返しの車は
           「データも書き換えない。だから出す側で拾う」と return-slot.js に書いてある）。
        完TELを通った車だけデータを書き換えていたので、そちらを**出す側**に寄せる。
   ◎使い方
     node test_return_keep.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); } };
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');
const ymd = (d) => { const p = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const 日 = (n) => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + n); return ymd(d); };
const 今日 = 日(0), 過ぎた日 = 日(-4), 明日 = 日(1);

function boot() {
  const ctx = {};
  ctx.window = ctx;
  const 言 = [];
  ctx.console = { log: m => 言.push(String(m)), warn: m => 言.push('警告:' + m), error: m => 言.push('エラー:' + m) };
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  ctx.Promise = Promise; ctx.JSON = JSON; ctx.Date = Date; ctx.Math = Math;
  ctx.document = { addEventListener() {}, querySelector: () => null, createElement: () => ({ style:{}, appendChild(){}, setAttribute(){}, remove(){} }), getElementById: () => null };
  ctx.addEventListener = () => {};
  ctx.state = { cards: [], settings: {}, staff: [] };
  ctx.PIT_TIME_ALL = ['未定'];
  const 記録 = { flow: [], op: [] };
  ctx.logFlow = (c, txt, o) => { (c.log = c.log || []).push({ at: Date.now(), label: txt, auto: !!(o && o.auto) }); 記録.flow.push(txt); };
  ctx.logFlowAuto = (c, txt) => ctx.logFlow(c, txt, { auto: true });
  ctx.pitLog = (a) => 記録.op.push(a);
  ctx.pitCardTag = (c) => '[' + ((c && c.resNo) || '') + ']';
  ctx.pitLoanerPlanOf = () => ({ n: 0, text: '' });
  ctx.pitTimeTbd = (v) => !v || v === '未定';
  ctx.PitDB = { save: () => true, mode: 'local' };
  vm.createContext(ctx);
  vm.runInContext(JS('return-slot.js'), ctx, { filename: 'return-slot.js' });
  vm.runInContext(JS('overdue-pit.js'), ctx, { filename: 'overdue-pit.js' });
  return { ctx, 記録, 言 };
}

/* 完TELを通って、8/25 に返す約束だったのに、まだ取りに来ていない車 */
const もと = () => ({ id: 'r1', resNo: 'J32544', customer: '粟國', status: 'workDone',
  returnStage: 'returnWait', returnDate: 過ぎた日, returnTime: '16:30', returnDateFinal: 過ぎた日,
  returnDatePlan: 過ぎた日, actualInAt: 日(-11), amountFinal: 90440, log: [] });

console.log('  （今日＝' + 今日 + '／約束は ' + 過ぎた日 + '＝4日過ぎ）');

/* =====================================================================
   ① 過ぎても、返車日を消さない
   ===================================================================== */
console.log('\n── 🔴 ①過ぎても、返車日を消さない ──');
{
  const { ctx, 記録 } = boot();
  const c = もと(); ctx.state.cards = [c];
  ctx.pitAutoOverdue();
  ok('🔴🔴 返車日が残っている', c.returnDate === 過ぎた日, { returnDate: c.returnDate });
  ok('🔴 返車時間も残っている', c.returnTime === '16:30', { returnTime: c.returnTime });
  ok('🔴 確定返車日も残っている', c.returnDateFinal === 過ぎた日, { returnDateFinal: c.returnDateFinal });
  ok('🔴 カードの記録を汚さない（自動の行を書かない）', (c.log || []).length === 0, c.log);
  ok('🔴 操作ログも増やさない（1台で124行になっていた）', 記録.op.length === 0, 記録.op);
}

/* =====================================================================
   ② でも、ちゃんと「返車日未定」の箱に出る（ゆうたの流れ）
   ===================================================================== */
console.log('\n── 🔴 ②消さないが、置き場は「返車日未定」に出る ──');
{
  const { ctx } = boot();
  const c = もと(); ctx.state.cards = [c];
  ok('🔴🔴 返車日未定の箱に出る', ctx.pitReturnPlace(c) === 'dateTbd', { 置き場: ctx.pitReturnPlace(c) });
  ok('箱の名前が出せる', ctx.pitReturnPlaceLabel(ctx.pitReturnPlace(c)) === '返車日未定');
  /* 何日過ぎているかを出せること＝「8/25の約束・4日過ぎ」と書けるように */
  ok('🔴 何日過ぎているかが分かる（4日）', ctx.pitReturnLateDays && ctx.pitReturnLateDays(c) === 4, { 遅れ: ctx.pitReturnLateDays && ctx.pitReturnLateDays(c) });
  ok('いつの約束かが分かる', c.returnDate === 過ぎた日);
}

/* =====================================================================
   ③ 決め直したら、ちゃんと箱が変わる（→返す）
   ===================================================================== */
console.log('\n── ③決め直したら、箱が変わる ──');
{
  const { ctx } = boot();
  const c = もと(); ctx.state.cards = [c];
  ctx.pitReturnSetDateTime(c, 明日, '15:00');
  ok('返車予定カレンダーへ移る', ctx.pitReturnPlace(c) === 'calendar', { 置き場: ctx.pitReturnPlace(c) });
  ctx.pitReturnSetDateTime(c, 明日, '');
  ok('時間だけ未定なら「返車時間未定」へ', ctx.pitReturnPlace(c) === 'timeTbd', { 置き場: ctx.pitReturnPlace(c) });
  ctx.pitReturnSetDateTime(c, 今日, '10:00');
  ok('今日でもカレンダーに出る（過ぎていないので）', ctx.pitReturnPlace(c) === 'calendar', { 置き場: ctx.pitReturnPlace(c) });
}

/* =====================================================================
   ④ 返したら、もう拾わない
   ===================================================================== */
console.log('\n── ④返したら、もう拾わない ──');
{
  const { ctx, 記録 } = boot();
  const c = もと(); c.status = 'returned'; ctx.state.cards = [c];
  ok('実績に入った車は置き場なし', ctx.pitReturnPlace(c) === null, { 置き場: ctx.pitReturnPlace(c) });
  ctx.pitAutoOverdue();
  ok('自動も触らない', c.returnDate === 過ぎた日 && 記録.op.length === 0);
}

/* =====================================================================
   ⑤ 「未定」のチェックが勝手に入らない（空でなくなるので）
   ===================================================================== */
console.log('\n── 🔴 ⑤「未定」のチェックが勝手に入らない ──');
{
  const { ctx } = boot();
  const c = もと(); ctx.state.cards = [c];
  ctx.pitAutoOverdue();
  /* 画面は「返車日が空か」で未定チェックを付けている（card-view.js） */
  ok('🔴 返車日が空になっていない＝チェックは入らない', !!c.returnDate, { returnDate: c.returnDate });
}

/* =====================================================================
   ⑥ データチェック F03 が鳴らない（出口ができる）
   ===================================================================== */
console.log('\n── 🔴 ⑥データチェックが鳴り止む ──');
{
  const src = JS('inspect-rules.js');
  const i = src.indexOf("id:'F03'");
  const 塊 = i < 0 ? '' : src.slice(i, i + 700);
  ok('F03 は「返車予定日が空か」で見ている', /returnDate/.test(塊), 塊.slice(0, 80));
  const { ctx } = boot();
  const c = もと(); ctx.state.cards = [c];
  ctx.pitAutoOverdue();
  ok('🔴 直したあとは空にならない＝F03 は鳴らない', !!c.returnDate);
}

/* =====================================================================
   ⑦ 入庫側と、待ち・当日返しの車は今までどおり（壊さない）
   ===================================================================== */
console.log('\n── ⑦ほかの道は今までどおり ──');
{
  const { ctx, 記録 } = boot();
  /* 待ち・当日返しで、返るはずの日を過ぎてもまだ手元にある車＝前から「出す側」で拾っている */
  const w = { id: 'w1', resNo: 'W00001', status: 'check', dropType: 'wait', reserveDate: 過ぎた日, log: [] };
  ctx.state.cards = [w];
  ok('待ちの車は今までどおり返車日未定に出る', ctx.pitReturnPlace(w) === 'dateTbd', { 置き場: ctx.pitReturnPlace(w) });
  ok('その車のデータも書き換えない', !w.returnDate);
  /* 入庫側の自動は今までどおり動く（本予約・入庫日を過ぎた・入庫実績なし） */
  const r = { id: 'i1', resNo: 'I00001', status: 'reserved', reserveDate: 過ぎた日, log: [] };
  ctx.state.cards = [r];
  ctx.pitAutoOverdue();
  ok('入庫側は今までどおり未入庫へ落ちる', r.status === 'cancelled' && r.noShow === true, r);
  ok('入庫側は記録も残す', (r.log || []).some(x => /未入庫へ（自動）/.test(x.label)), (r.log||[]).map(x=>x.label));
}

console.log('\n────────────────────────────');
console.log(fail === 0 ? `  ✅ 全部そろっています（${pass}件）` : `  ❌ ${fail}件 赤／${pass}件 緑`);
process.exit(fail === 0 ? 0 : 1);
