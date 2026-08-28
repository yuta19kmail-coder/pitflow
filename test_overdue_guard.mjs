/* ============================================================
   test_overdue_guard.mjs
   「カードが勝手に消える／やっていない人がやったことになる」を見張る。

   きっかけ：ゆうた 2026-08-28（**実際に起きた事故**）
     🗣「予約 C63175 がタスクボードに入れて置いたのになくなるバグがあったという報告。
     　　ログには残ってない。現状は未入庫に入っていて（**入庫した実績がなくなってる**）」
     🗣「ただこれログを見るとちょっとおかしく
     　　『入庫日（2026-08-25）を過ぎたので未入庫へ（自動）  8/28 13:37 ・ 髙橋 裕斗』
     　　と**自動処理にもかかわらず高橋が動かしたことになっている**。
     　　高橋はログインできるが**デザイナーなので実務的に動かすことは絶対にない**」
     🗣「**このカードがなくなったり、勝手に動いたり（タスクボード以外で）は
     　　マジでわからなくなるし、下手したら探し出せないからマジでなくしてほしい**」
     🗣「ついでに操作ログと車ごとのログをもっと細かく取れる？ **自動系も全部**。
     　　結局こういう時に追えないのがやだなと思う」

   正体（v2.22.0 で直した）：
     ① `pitIntakeOverdue` は `status === 'reserved'` **だけ**を見ていて、
        **その車が本当に入庫したか（`actualInAt`）を見ていなかった**。
        status が何かの拍子に巻き戻ると、入庫済みの車まで未入庫へ落ち、`bayId` も消えて
        **盤面から本当に見えなくなる**。
     ② `logFlow` は自動処理でも `pitFlowMe()`（その端末にログインしている人）を押していた。
        自動処理は**画面を開いた端末**で走るので、**やっていない人の名前が残る**。
     ③ 自動で未入庫にした時、**操作ログ（pitLog）に1行も残していなかった**＝あとから追えない。
     ④ 30日の自動アーカイブも、**フローにも操作ログにも1行も残していなかった**。

   いまの決めごと：
     🔴 **実入庫日（`actualInAt`）がある車は、絶対に自動で動かさない。**
     🔴 黙って見逃さない＝データチェックの **F12** に赤で出す。
     🔴 「入庫を取り消して予約に戻す」は `actualInAt` も消す＝本当に取り消した車は今までどおり落ちる。
     🔴 自動の記録は **`staff` を空・`auto:true`**。出す時は「自動」。端末は `dev` に残す（表には出さない）。
     🔴 自動でカードを動かしたら、**操作ログにも必ず1行**。

   使い方：
     python3 -m http.server 8968 --directory . &
     PORT=8968 node test_overdue_guard.mjs
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const cp   = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = process.env.PORT || 8968;
let OK = 0, NG = 0;
function ok(name, cond, extra){
  if (cond) { OK++; console.log('  ✅ ' + name); }
  else { NG++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
const rd = f => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

console.log('\n── 🧭 物差しは1本か ──');
{
  const ov = rd('js/overdue-pit.js');
  const ct = rd('js/card-tabs.js');
  const fp = rd('js/flow-pit.js');
  ok('🔴 入庫実績のある車は自動で動かさない', /c\.actualInAt\s*\)\s*return false/.test(ov));
  ok('🔴 自動の記録は logFlowAuto を通る', /logFlowAuto/.test(ov));
  ok('🔴 自動で動かしたら操作ログにも残す', /pitLog\(/.test(ov) && /auto:\s*true/.test(ov));
  ok('card-tabs.js が logFlowAuto を出している', /window\.logFlowAuto\s*=/.test(ct));
  ok('🔴 自動の記録に人の名前（staff）を入れていない', /staff:\s*''\s*,\s*auto:\s*true/.test(ct));
  ok('🔴 端末の名前は by ではなく dev に入れる', /dev:\s*me/.test(ct) && !/auto:\s*true,\s*by:/.test(ct));
  ok('🔴 「やった人」の物差し（byOf）が自動を「自動」と答える', /e\.auto\)\s*return\s*'自動'/.test(fp));
  const cv = rd('js/card-view.js');
  ok('🔴 入庫を取り消したら実入庫日も消す', /delete c\.actualInAt/.test(cv));
  const un = rd('js/undetermined.js');
  ok('🔴 30日の自動アーカイブも記録を残す', /logFlowAuto/.test(un) && /pitLog\('未入庫を自動アーカイブ'/.test(un));
  const ir = rd('js/inspect-rules.js');
  ok('🔴 データチェックに F12（入庫実績があるのに予約に戻っている）がある', /id:'F12'/.test(ir));
  const op = rd('js/oplog-pit.js');
  ok('操作ログが「自動」を扱える', /userName:\s*_auto\s*\?\s*'自動'/.test(op));
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.pitAutoOverdue && window.pitIntakeOverdue', null, { timeout: 25000 });
await p.waitForTimeout(600);

console.log('\n── 🚗 入庫した車は、自動で消えない ──');
const T = await p.evaluate(() => {
  const ymdL = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const sh = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymdL(d); };
  const base = (id, extra) => Object.assign({ id: id, resNo: id, customer: '試験 ' + id, car: 'テスト車',
    plate: '習志野 300 あ 12-34', reserveDate: sh(-3), boardId: 'default',
    workType: 'shaken', workTypes: ['shaken'], bayId: 'bay1', baySlot: 0 }, extra);
  state.cards = [];
  /* ① 事故の再現＝入庫した実績があるのに、状態だけ予約に巻き戻っている車 */
  state.cards.push(base('OG-in',   { status: 'reserved', actualInAt: sh(-3) }));
  /* ② ふつうに来なかった予約（入庫実績なし）＝今までどおり未入庫へ落ちてよい */
  state.cards.push(base('OG-no',   { status: 'reserved' }));
  /* ③ 盤面にいる車＝そもそも対象外 */
  state.cards.push(base('OG-board',{ status: 'parts', actualInAt: sh(-3) }));
  /* ④ 仮予約・承認待ちは今までどおり動かさない */
  state.cards.push(base('OG-kari', { status: 'reserved', tentative: true }));
  state.cards.push(base('OG-appr', { status: 'reserved', approvalPending: true }));

  const before = {};
  state.cards.forEach(c => { before[c.id] = { st: c.status, bay: c.bayId }; });
  const moved = pitAutoOverdue();
  const after = {};
  state.cards.forEach(c => { after[c.id] = { st: c.status, bay: c.bayId, noShow: !!c.noShow,
    log: (c.log || []).map(x => ({ l: x.label, staff: x.staff, auto: !!x.auto, dev: x.dev || '' })) }; });
  return { before, after, moved };
});

ok('🔴🔴 入庫実績のある車は未入庫に落ちない（事故の再現）',
   T.after['OG-in'].st === 'reserved' && !T.after['OG-in'].noShow, T.after['OG-in']);
ok('🔴 盤面の置き場所（bay）も消されない', T.after['OG-in'].bay === 'bay1', T.after['OG-in'].bay);
ok('🔴 入庫実績のある車にはフローの行も足さない', T.after['OG-in'].log.length === 0, T.after['OG-in'].log);
ok('来なかった予約は今までどおり未入庫へ落ちる',
   T.after['OG-no'].st === 'cancelled' && T.after['OG-no'].noShow === true, T.after['OG-no']);
ok('盤面にいる車は対象外', T.after['OG-board'].st === 'parts', T.after['OG-board'].st);
ok('仮予約は動かさない', T.after['OG-kari'].st === 'reserved', T.after['OG-kari'].st);
ok('承認待ちは動かさない', T.after['OG-appr'].st === 'reserved', T.after['OG-appr'].st);

console.log('\n── 🖊 自動の記録に、人の名前を押さない ──');
{
  const lg = T.after['OG-no'].log;
  const auto = lg.find(x => /自動/.test(x.l || ''));
  ok('自動で動かしたらフローに1行残る', !!auto, lg);
  ok('🔴🔴 その行に人の名前（staff）が入っていない', auto && auto.staff === '', auto);
  ok('🔴 自動の印（auto）が立っている', auto && auto.auto === true, auto);
  const shown = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'OG-no');
    const e = (c.log || []).find(x => /自動/.test(x.label || ''));
    return window.PitFlowLog ? PitFlowLog.byOf(e) : '(no PitFlowLog)';
  });
  ok('🔴🔴 画面には「自動」と出る（人の名前ではない）', shown === '自動', shown);
}

console.log('\n── 📒 操作ログにも残る（追えるように） ──');
{
  const L = await p.evaluate(() => {
    const arr = JSON.parse(localStorage.getItem('pitflow_oplog_v1') || '[]');
    return arr.slice(0, 6).map(x => ({ a: x.action, u: x.userName, auto: !!x.auto, dev: x.dev || '', card: x.cardId }));
  });
  const row = L.find(x => /未入庫へ自動で移動/.test(x.a || ''));
  ok('🔴 自動で未入庫にしたら操作ログに1行残る', !!row, L);
  ok('🔴 操作ログの人の欄は「自動」', row && row.u === '自動', row);
  ok('どのカードかが分かる', row && row.card === 'OG-no', row);
}

console.log('\n── ↩ 入庫を取り消したら、ちゃんと落ちるように戻る ──');
{
  const R = await p.evaluate(() => {
    const ymdL = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const sh = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymdL(d); };
    const c = state.cards.find(x => x.id === 'OG-board');
    /* ⚠ closeDetail が showView を通す＝その場で自動処理が走る。
       　 「取り消した直後の姿」を見たいので、入庫日はいったん先の日にしておく。 */
    c.reserveDate = sh(+3);
    openDetail(c.id);
    if (window.cvBackToReserve) cvBackToReserve();
    const after = { st: c.status, inAt: c.actualInAt || '' };
    c.reserveDate = sh(-3);
    pitAutoOverdue();
    return { after: after, fell: c.status === 'cancelled' && !!c.noShow };
  });
  ok('入庫を取り消すと予約に戻る', R.after.st === 'reserved', R.after);
  ok('🔴 実入庫日も消える（残ると二度と未入庫に落ちなくなる）', R.after.inAt === '', R.after);
  ok('🔴 取り消したあとは、今までどおり未入庫へ落ちる', R.fell, R);
}

console.log('\n── 🩺 黙って見逃さない（データチェック F12） ──');
{
  const F = await p.evaluate(() => {
    const ymdL = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const sh = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymdL(d); };
    state.cards = [{ id: 'F12-x', resNo: 'F12-x', customer: '巻き戻り 太郎', car: 'テスト車',
      plate: '習志野 300 あ 12-34', reserveDate: sh(-3), actualInAt: sh(-3), status: 'reserved',
      boardId: 'default', workType: 'shaken', workTypes: ['shaken'] }];
    const res = pitInspectRun();
    const f = (res.findings || []).filter(x => x.ruleId === 'F12' || x.rule === 'F12' || x.id === 'F12');
    return { n: (res.byRule && res.byRule.F12 && res.byRule.F12.n) || f.length,
             lv: (f[0] && f[0].level) || '', txt: (f[0] && (f[0].text || '')) || '' };
  });
  ok('🔴 F12 が1件出る', F.n === 1, F);
  ok('F12 は赤（要対応）', F.lv === 'red', F);
  ok('実入庫日が本文に出る', /実入庫日/.test(F.txt), F.txt);
}

console.log('\n── 📝 記録をもっと細かく（ゆうた「自動系も全部」） ──');
{
  const F = await p.evaluate(() => {
    const out = {};
    /* ① PIT配置図の出し入れ＝いままで1行も残っていなかった */
    state.cards = [{ id: 'BG-1', resNo: 'C99001', customer: '枠 太郎', car: 'テスト車',
      plate: '習志野 300 あ 12-34', reserveDate: '2000-01-01', status: 'parts', boardId: 'default',
      workType: 'shaken', workTypes: ['shaken'], actualInAt: '2000-01-01', bayId: null }];
    try { localStorage.removeItem('pitflow_oplog_v1'); } catch (e) {}
    const c = state.cards[0];
    const bay = (state.bays || [])[0];
    if (window.applyCardDrop) applyCardDrop(c.id, 'bay', bay && bay.id);
    out.bay = { flow: (c.log || []).map(x => x.label), bayId: c.bayId };
    const arr = JSON.parse(localStorage.getItem('pitflow_oplog_v1') || '[]');
    out.op = arr.map(x => ({ a: x.action, l: x.label, u: x.userName }));
    out.bayName = (bay && bay.name) || '';
    /* ② 予約番号で探せるか（人は番号で車を呼ぶ） */
    out.tag = window.pitCardTag ? pitCardTag(c) : '(no pitCardTag)';
    return out;
  });
  ok('🔴 PIT配置図へ入れたらフローに1行残る', F.bay.flow.some(x => /PIT配置図/.test(x || '')), F.bay);
  ok('どの枠へ入れたかが名前で分かる', F.bay.flow.some(x => x.indexOf(F.bayName) >= 0), { flow: F.bay.flow, bay: F.bayName });
  ok('🔴 操作ログにも残る', F.op.some(x => /PIT配置図/.test(x.a || '')), F.op);
  ok('🔴 記録に予約番号が入る（番号で探せる）', /\[C99001\]/.test(F.tag), F.tag);
  ok('「どの車か」の物差しが1本（pitCardTag）', /様/.test(F.tag) && /テスト車/.test(F.tag), F.tag);

  const S = await p.evaluate(() => {
    /* 操作ログの検索が予約番号で効くか */
    const before = JSON.parse(localStorage.getItem('pitflow_oplog_v1') || '[]');
    showView('oplog');
    if (window.pitOplogSearch) pitOplogSearch('C99001');
    const n = (document.querySelectorAll('#oplog-body .op-row') || []).length;
    return { total: before.length, shown: n };
  });
  ok('🔴 操作ログを予約番号で絞り込める', S.shown > 0 && S.shown <= S.total, S);
}

console.log('\n── 🧯 JSエラー ──');
ok('画面のエラー 0', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log('\n═══ ' + OK + ' OK / ' + NG + ' NG ═══');
process.exit(NG ? 1 : 0);
