/* PitFlow v2.118.0 ── FlowDesk のショートカットの受け口を**本物の画面**で見る
   -------------------------------------------------------------------
   ◎この試験が見張るもの
     🔴 まっさらに開いた時、`#/<画面>` の画面が出る（coreflow-nav.js の起動時の切り替え）
     🔴 ログインしても、その画面から動かない
     🔴 `?fd=new-reserve` … ログインまで待つ → 新規予約が開く → 閉じると `#` の画面に戻る
     🔴 `?fd=new-customer` … 新規顧客登録が開く
     🔴 動いたあとアドレスから ?fd= が消える（# は残る）

   ◎使い方
     python -m http.server 8995      ← 別ウィンドウ（PitFlow のフォルダで）
     node _見張り/test_fd_link.mjs                                          */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const PORT = process.env.PORT || 8995;
const BASE = `http://127.0.0.1:${PORT}/index.html`;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: chromePath() });

/* 1件ごとに新しい箱（ログインの印を持ち越さない） */
async function fresh(q){
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(BASE + q);
  await p.waitForFunction('window.state && window.showView && window.openNewReserve && window.custNewCustomer && window.pitSampleLogin', null, { timeout: 25000 });
  await p.waitForTimeout(800);
  return { ctx, p, errs };
}
const view = p => p.evaluate(() => state.currentView);
const url  = p => p.evaluate(() => location.search + location.hash);

for (const v of ['today', 'availcal', 'reserve', 'loaner', 'shakencal', 'dashboard']){
  const { ctx, p, errs } = await fresh('?nonews=1#/' + v);
  ok(`#/${v}：まっさらに開くとその画面`, (await view(p)) === v, await view(p));
  await p.evaluate(() => pitSampleLogin());
  await p.waitForTimeout(900);
  ok(`#/${v}：ログイン後もその画面のまま`, (await view(p)) === v && (await p.evaluate(() => location.hash)) === '#/' + v, await url(p));
  ok(`#/${v}：エラー0`, errs.length === 0, errs.join('|'));
  await ctx.close();
}

/* ── 新規予約（画面の指定つき） ── */
{
  const { ctx, p, errs } = await fresh('?nonews=1&fd=new-reserve#/availcal');
  ok('new-reserve：ログイン前は開かない', (await view(p)) === 'availcal', await view(p));
  await p.waitForTimeout(1200);
  ok('new-reserve：待っている間もまだ開かない', (await view(p)) === 'availcal', await view(p));
  await p.evaluate(() => pitSampleLogin());
  await p.waitForTimeout(1200);
  ok('new-reserve：ログインしたら新規予約が開く', (await view(p)) === 'card' && (await p.evaluate(() => (state.cards||[]).some(c => c && c._draft))), await view(p));
  ok('new-reserve：?fd= が消える（nonews は残る）', !(await url(p)).includes('fd=') && (await url(p)).includes('nonews=1'), await url(p));
  const back = await p.evaluate(() => { if (window.closeDetail) closeDetail(); return new Promise(r => setTimeout(() => r(state.currentView), 900)); });
  const back2 = back === 'card' ? await p.evaluate(() => new Promise(r => setTimeout(() => r(state.currentView), 900))) : back;
  ok('new-reserve：閉じると代車の空き（#/availcal）に戻る', back2 === 'availcal', back2);
  ok('new-reserve：エラー0', errs.length === 0, errs.join('|'));
  await ctx.close();
}

/* ── 新規顧客登録（画面の指定なし） ── */
{
  const { ctx, p, errs } = await fresh('?fd=new-customer&nonews=1');
  ok('new-customer：ログイン前は出ない', !(await p.evaluate(() => { const m = document.getElementById('cust-modal'); return !!(m && m.classList.contains('show')); })));
  await p.evaluate(() => pitSampleLogin());
  await p.waitForTimeout(1200);
  const shown = await p.evaluate(() => { const m = document.getElementById('cust-modal'); return !!(m && m.classList.contains('show') && /新規顧客登録/.test(m.textContent)); });
  ok('new-customer：ログインしたら新規顧客登録が出る', shown);
  ok('new-customer：アドレスがきれいになる', (await p.evaluate(() => location.search)) === '?nonews=1', await url(p));
  ok('new-customer：エラー0', errs.length === 0, errs.join('|'));
  await ctx.close();
}

/* ── 知らない値は無視 ── */
{
  const { ctx, p, errs } = await fresh('?fd=wipe&nonews=1#/today');
  await p.evaluate(() => pitSampleLogin());
  await p.waitForTimeout(1200);
  ok('知らない値：画面はそのまま・何も開かない', (await view(p)) === 'today', await view(p));
  ok('知らない値：エラー0', errs.length === 0, errs.join('|'));
  await ctx.close();
}

await b.close();
console.log(`\n===== ${pass} OK / ${fail} NG =====`);
process.exit(fail ? 1 : 0);
