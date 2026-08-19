/* PitFlow v1.148.0 ── 自動返却は下書き中でも必ず効く
   -------------------------------------------------------------------
   ◎見張っているもの（ゆうた指定 2026-08-19）
     🗣「（自動返却は）車両を例えば当日ビューから返車済みにしたっていうアクションの事だよね？
     　　それであれば**自動返却は必ず反映するようにしてほしい**」
     ① 車を返車済みにすると、代車も自動で返却済みになる（今までどおり）
     ② 🔴 **代車カレンダーで札を動かしかけたまま（下書き中）でも、自動返却が効く**
     ③ 🔴 下書き中は**保存しない**（まだ確定していない下書きごと書いてしまわないように）
     ④ 🔴 下書きを**破棄しても、返却済みは取り消されない**（バーの長さも返却日に合う）
     ⑤ 手で「返却取消」した予約は、今までどおり自動で戻さない
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8967      ← 別ウィンドウ
     node test_loaner_autoback.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8967;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); localStorage.removeItem('pitflow_loaner_draft_v1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitSyncLoanerAssigns', null, { timeout: 20000 });
await p.waitForTimeout(500);

async function setup(){
  await p.evaluate(() => {
    const D = n => { const d = new Date(); d.setDate(d.getDate() + n); return window.ymd(d); };
    window.__D = D;
    state.loaners = [{ id:'L1', name:'代車1', number:1, model:'ハスラー' }];
    state.cards = [{ id:'k1', customer:'田中 太郎', car:'ノート', status:'check', boardId:'default', division:'div1',
      reserveDate: D(-3), needLoaner:true, loanerId:'L1', loanerFrom: D(-3), loanerTo: D(5), workTypes:[] }];
    state.loanerAssigns = [{ id:'a1', cardId:'k1', loanerId:'L1', fromDate:D(-3), toDate:D(5) }];
    try { localStorage.removeItem('pitflow_loaner_draft_v1'); } catch(e){}
    showView('loaner');
  });
  await p.waitForTimeout(400);
}
const a1 = () => p.evaluate(() => { const a = (state.loanerAssigns||[]).find(x=>x.id==='a1'); return a ? { ret:!!a.returned, at:a.returnedAt||'', to:a.toDate, auto:!!a.autoReturned } : null; });
/* 車を返車済みにする（当日ビューで押すのと同じ結果になる状態にしてから同期） */
const returnCar = async (dayOffset) => {
  await p.evaluate(d => {
    const c = state.cards.find(x => x.id === 'k1');
    c.status = 'returned';
    c.returnDate = window.__D(d);
    pitSyncLoanerAssigns();
  }, dayOffset);
  await p.waitForTimeout(300);
};

console.log('\n───── ① ふつうの時（下書きなし）─────');
await setup();
ok('はじめは貸出中', (await a1()).ret === false, await a1());
await returnCar(1);
const r1 = await a1();
ok('車を返車済みにすると、代車も返却済みになる', r1.ret === true, r1);
ok('返した日が入る', r1.at === await p.evaluate(() => window.__D(1)), r1);
ok('自動で付けた印が残る', r1.auto === true, r1);
ok('バーが実際の返却日まで縮む', r1.to === r1.at, r1);

console.log('\n───── ② 🔴 下書き中でも効く ─────');
await setup();
/* 札を動かしかけた状態を作る（下書き開始） */
await p.evaluate(() => { loMoveAssignTo('a1', 'L1', window.__D(-2)); });
await p.waitForTimeout(300);
ok('下書きが立っている', await p.evaluate(() => !!localStorage.getItem('pitflow_loaner_draft_v1')));
await returnCar(1);
const r2 = await a1();
ok('🔴 下書き中でも代車が返却済みになる', r2.ret === true, r2);
ok('返した日も入る', r2.at === await p.evaluate(() => window.__D(1)), r2);

console.log('\n───── ③ 下書き中は保存しない ─────');
await setup();
await p.evaluate(() => {
  window.__saves = 0;
  const o = window.PitDB.save;
  window.PitDB.save = function(){ window.__saves++; return o.apply(this, arguments); };
  loMoveAssignTo('a1', 'L1', window.__D(-2));
});
await p.waitForTimeout(300);
await p.evaluate(() => { window.__saves = 0; });
await returnCar(1);
ok('🔴 下書き中は保存しない（下書きごと確定させない）', await p.evaluate(() => window.__saves === 0), await p.evaluate(() => window.__saves));
ok('それでも画面の上では返却済み', (await a1()).ret === true);

console.log('\n───── ④ 🔴 破棄しても返却済みは消えない ─────');
await p.evaluate(() => loDraftDiscard());
await p.waitForTimeout(300);
await p.evaluate(() => { const btn = Array.from(document.querySelectorAll('button')).find(x => /破棄|戻す|はい|OK/.test((x.textContent||'').trim())); if (btn) btn.click(); });
await p.waitForTimeout(400);
const r4 = await a1();
ok('🔴 破棄しても返却済みのまま', r4.ret === true, r4);
ok('🔴 バーの長さも返却日に合っている（伸びたまま残らない）', r4.to === r4.at, r4);

console.log('\n───── ⑤ 手で「返却取消」した予約は触らない ─────');
await setup();
await p.evaluate(() => { const c = state.cards.find(x => x.id === 'k1'); c.loanerReturned = false; });
await returnCar(1);
ok('手で返却取消した予約は自動で戻さない', (await a1()).ret === false, await a1());

console.log('\n───── ⑥ 作りのチェック ─────');
{
  const src = fs.readFileSync('js/loaner.js', 'utf8');
  ok('🔴 自動返却が下書きで止まっていない', !/!drafting && _loAutoReturnByCard/.test(src));
  ok('下書きの控えにも返却日を入れている', /_loDraftOrig\[a\.id\]\.toDate = a\.toDate/.test(src));
}

console.log('\n───── まとめ ─────');
ok('画面のエラーが出ていない', errs.length === 0, errs.slice(0, 5));
console.log('\n  ' + pass + ' OK / ' + fail + ' NG\n');
await b.close();
process.exit(fail ? 1 : 0);
