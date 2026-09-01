/* PitFlow v1.143.0 ── 代車の「キャンセル」のテスト
   -------------------------------------------------------------------
   ◎見張っているもの（ゆうた指定 2026-08-19）
     🗣「アーカイブと同じで、**返却済みの代車（グレーになってる奴）は何がなんでも不可侵的に残す**イメージ。
     　　だからキャンセルは、**その予約に関する代車の貸し出しスケジュールだけを無くす**イメージでいい」
     🗣（「代車 必要」のチェックは？）「**チェックも外す**」
     ① 返却済みの札には「キャンセル」を出さない
     ② 🔴 関数を直に呼んでも、返却済みは消えない（外から呼ばれても通らない）
     ③ まだ返していない貸出は、カレンダーの予定と予約カードの代車の設定（必要のチェックも）が消える
     ④ 🔴 直後なら「↩ 元に戻す」で戻せる（片道にしない）
     ⑤ 窓の説明に「何が消えるか」が全部書いてある（「外します」で済ませない）
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8963      ← 別ウィンドウ
     node test_loaner_cancel.mjs                                              */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8963;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.loCancelLoaner && window.loBadgeMenu', null, { timeout: 20000 });
await p.waitForTimeout(500);

/* 貸出2枚：a1＝まだ返していない／a2＝返却済み */
async function setup(){
  await p.evaluate(() => {
    const D = n => { const d = new Date(); d.setDate(d.getDate() + n); return window.ymd(d); };
    state.loaners = [{ id:'L1', name:'代車1', number:1, model:'ハスラー' }];
    state.cards = [
      { id:'k1', customer:'田中 太郎', car:'ノート', status:'check', boardId:'default', division:'div1',
        reserveDate: D(-2), needLoaner:true, loanerId:'L1', loanerFrom: D(-2), loanerTo: D(3), loanerFixed:true, workTypes:[] },
      { id:'k2', customer:'佐藤 次郎', car:'アクア', status:'returned', boardId:'default', division:'div1',
        reserveDate: D(-9), needLoaner:true, loanerId:'L1', loanerFrom: D(-9), loanerTo: D(-5), loanerFixed:false, workTypes:[] }
    ];
    state.loanerAssigns = [
      { id:'a1', cardId:'k1', loanerId:'L1', fromDate: D(-2), toDate: D(3) },
      { id:'a2', cardId:'k2', loanerId:'L1', fromDate: D(-9), toDate: D(-5), returned:true, returnedAt: D(-5) }
    ];
    showView('loaner');
  });
  await p.waitForTimeout(400);
}
const assigns = () => p.evaluate(() => (state.loanerAssigns || []).map(a => ({ id:a.id, ret:!!a.returned })));
const card = id => p.evaluate(i => { const c = state.cards.find(x => x.id === i); return c ? { need:!!c.needLoaner, lid:c.loanerId||'', from:c.loanerFrom||'', to:c.loanerTo||'', fix:!!c.loanerFixed } : null; }, id);
const menuText = async aid => { await p.evaluate(a => loBadgeMenu(null, a), aid); await p.waitForTimeout(200);
  const t = await p.evaluate(() => { const el = document.getElementById('lo-bpop'); return el ? el.innerText : ''; });
  await p.evaluate(() => { const el = document.getElementById('lo-bpop'); if (el) el.remove(); }); return t; };

console.log('\n───── ① 返却済みにはキャンセルを出さない ─────');
await setup();
const m1 = await menuText('a1');
const m2 = await menuText('a2');
ok('まだ返していない貸出には「キャンセル」が出る', /キャンセル/.test(m1), m1);
ok('🔴 返却済みの貸出には「キャンセル」を出さない', !/キャンセル/.test(m2), m2);
ok('返却済みには「返却を取り消す」が出る', /返却を取り消す/.test(m2), m2);

console.log('\n───── ② 直に呼んでも返却済みは消えない ─────');
await p.evaluate(() => loCancelLoaner('a2'));
await p.waitForTimeout(400);
ok('🔴 返却済みの貸出は消えない', (await assigns()).some(a => a.id === 'a2'), await assigns());
ok('返却済みのカードの代車設定も消えない', (await card('k2')).need === true, await card('k2'));
ok('「消せません」と伝えている',
   await p.evaluate(() => document.body.innerText.includes('返却済みの貸出は消せません')));
await p.evaluate(() => { const btns = Array.from(document.querySelectorAll('button'));
  const b2 = btns.find(x => /分かりました|OK|閉じる/.test((x.textContent || '').trim())); if (b2) b2.click(); });
await p.waitForTimeout(300);

console.log('\n───── ③ まだ返していない貸出はキャンセルできる ─────');
const before = await card('k1');
await p.evaluate(() => loCancelLoaner('a1'));
await p.waitForTimeout(350);
const dlg = await p.evaluate(() => document.body.innerText);
ok('⑤ 窓に「予約カードの代車の設定も消える」と書いてある', /代車 必要のチェック|使用代車|貸出日/.test(dlg), dlg.slice(0, 200));
ok('⑤ 窓に「元に戻せる」と書いてある', /元に戻す/.test(dlg));
await p.evaluate(() => { const btns = Array.from(document.querySelectorAll('button'));
  const b2 = btns.find(x => (x.textContent || '').trim() === 'キャンセルする'); if (b2) b2.click(); });
await p.waitForTimeout(450);
ok('カレンダーの予定が消える', !(await assigns()).some(a => a.id === 'a1'), await assigns());
const after = await card('k1');
ok('🔴 予約カードの「代車 必要」のチェックも外れる', after.need === false, after);
ok('使用代車・貸出日・返却日も空になる', after.lid === '' && after.from === '' && after.to === '' && after.fix === false, after);
ok('返却済みの貸出は残ったまま', (await assigns()).some(a => a.id === 'a2'));

console.log('\n───── ④ 直後なら元に戻せる ─────');
ok('🔴 「元に戻す」が出ている', await p.evaluate(() => /元に戻す/.test((document.getElementById('lo-draft-bar') || {}).innerText || '')));
await p.evaluate(() => loCancelUndo());
await p.waitForTimeout(300);
await p.evaluate(() => { const btns = Array.from(document.querySelectorAll('button'));
  const b2 = btns.find(x => (x.textContent || '').trim() === '元に戻す'); if (b2) b2.click(); });
await p.waitForTimeout(450);
ok('カレンダーの予定が戻る', (await assigns()).some(a => a.id === 'a1'), await assigns());
const back = await card('k1');
ok('🔴 予約カードの代車の設定も元どおり',
   back.need === before.need && back.lid === before.lid && back.from === before.from && back.to === before.to && back.fix === before.fix,
   [before, back]);
ok('「元に戻す」は1回だけ（使うと消える）',
   await p.evaluate(() => loCancelCanUndo() === false));

console.log('\n───── まとめ ─────');
ok('画面のエラーが出ていない', errs.length === 0, errs.slice(0, 5));
console.log('\n  ' + pass + ' OK / ' + fail + ' NG\n');
await b.close();
process.exit(fail ? 1 : 0);
