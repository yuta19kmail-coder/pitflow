/* PitFlow v1.144.0 ── 代車をやめる時（引退・削除）のテスト
   -------------------------------------------------------------------
   ◎見張っているもの（ゆうた指定 2026-08-19）
     🗣「**1回でも貸出実績がある代車には「消去」という概念が当たらないようにして。引退のみにしよう**」
     ① 貸したことがある代車は **削除ボタンが出ない**（代わりに「引退させる」が出る）
     ② 🔴 直に呼んでも消えない。**貸出の記録も残る**（返却済みも）
     ③ 引退にしても、**貸出の記録も車両の登録も消えない**。新しくは貸せなくなる
     ④ 引退は**取り消せる**（片道にしない）
     ⑤ 一度も貸していない代車は、今までどおり削除できる
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8964      ← 別ウィンドウ
     node test_fleet_retire.mjs                                               */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8964;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.fleetDelete && window.fleetRetire', null, { timeout: 20000 });
await p.waitForTimeout(500);

/* 代車2台：L1＝貸出実績あり（返却済み1件）／L2＝一度も貸していない */
async function setup(){
  await p.evaluate(() => {
    const D = n => { const d = new Date(); d.setDate(d.getDate() + n); return window.ymd(d); };
    state.loaners = [
      { id:'L1', name:'代車1', number:1, model:'ハスラー' },
      { id:'L2', name:'代車2', number:2, model:'ワゴンR' }
    ];
    state.loanerAssigns = [
      { id:'a1', cardId:null, loanerId:'L1', fromDate:D(-9), toDate:D(-5), returned:true, returnedAt:D(-5), manual:true, customer:'田中' }
    ];
    state.fleetEvents = [];
    showView('fleet');
  });
  await p.waitForTimeout(400);
}
const loaners = () => p.evaluate(() => (state.loaners || []).map(l => ({ id:l.id, ret:!!l.retired })));
const assigns = () => p.evaluate(() => (state.loanerAssigns || []).map(a => a.id));
const btn = async id => { await p.evaluate(i => fleetOpenModal(i), id); await p.waitForTimeout(250);
  const t = await p.evaluate(() => { const e = document.getElementById('fl-del-btn'); return e ? { txt:e.innerText.trim(), show:e.style.display !== 'none', danger:/\bdel\b/.test(e.className) } : null; });
  return t; };
const clickAsk = async (label) => { await p.waitForTimeout(250);
  await p.evaluate(l => { const b2 = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').trim() === l); if (b2) b2.click(); }, label);
  await p.waitForTimeout(400); };

console.log('\n───── ① ボタンの出し分け ─────');
await setup();
const b1 = await btn('L1');
const b2 = await btn('L2');
ok('🔴 貸したことがある代車は「削除」が出ない', !/削除/.test(b1.txt), b1);
ok('🔴 代わりに「引退させる」が出る', /引退させる/.test(b1.txt), b1);
ok('引退のボタンは赤くない（消す操作ではないから）', b1.danger === false, b1);
ok('一度も貸していない代車は「削除」が出る', /削除/.test(b2.txt), b2);

console.log('\n───── ② 直に呼んでも消えない ─────');
await p.evaluate(() => fleetDelete('L1'));
await p.waitForTimeout(400);
ok('🔴 貸したことがある代車は消えない', (await loaners()).some(l => l.id === 'L1'), await loaners());
ok('🔴 貸出の記録も残る（返却済み）', (await assigns()).includes('a1'), await assigns());
ok('「消せません」と伝えている', await p.evaluate(() => document.body.innerText.includes('消せません')));
ok('「引退させる」を使うよう案内している', await p.evaluate(() => document.body.innerText.includes('引退させる')));
await clickAsk('分かりました');

console.log('\n───── ③ 引退させる ─────');
await p.evaluate(() => fleetRetire('L1'));
await p.waitForTimeout(300);
const dlg = await p.evaluate(() => document.body.innerText);
ok('窓に「今までの貸出は残る」と書いてある', /そのまま残ります/.test(dlg), dlg.slice(0, 160));
ok('窓に「あとから戻せる」と書いてある', /引退を取り消す/.test(dlg));
await clickAsk('引退させる');
ok('引退になった', (await loaners()).find(l => l.id === 'L1').ret === true, await loaners());
ok('🔴 車両の登録は消えない', (await loaners()).some(l => l.id === 'L1'));
ok('🔴 貸出の記録も消えない', (await assigns()).includes('a1'), await assigns());
ok('引退した代車には新しく貸せない',
   await p.evaluate(() => { const l = state.loaners.find(x => x.id === 'L1'); return window.pitLoanerUsable ? pitLoanerUsable(l) === false : true; }));

console.log('\n───── ④ 引退は取り消せる ─────');
const b3 = await btn('L1');
ok('🔴 引退中は「引退を取り消す」が出る', /引退を取り消す/.test(b3.txt), b3);
await p.evaluate(() => fleetUnretire('L1'));
await clickAsk('取り消す');
ok('引退が外れた', (await loaners()).find(l => l.id === 'L1').ret === false, await loaners());
ok('また貸せる',
   await p.evaluate(() => { const l = state.loaners.find(x => x.id === 'L1'); return window.pitLoanerUsable ? pitLoanerUsable(l) === true : true; }));

console.log('\n───── ⑤ 一度も貸していない代車は消せる ─────');
await p.evaluate(() => fleetDelete('L2'));
await clickAsk('削除する');
ok('消えた', !(await loaners()).some(l => l.id === 'L2'), await loaners());
ok('貸したことがある代車は残っている', (await loaners()).some(l => l.id === 'L1'));

console.log('\n───── まとめ ─────');
ok('画面のエラーが出ていない', errs.length === 0, errs.slice(0, 5));
console.log('\n  ' + pass + ' OK / ' + fail + ' NG\n');
await b.close();
process.exit(fail ? 1 : 0);
