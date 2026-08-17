/* PitFlow v1.109.0 ── 完TEL済の窓が「やめました」で弾かれる件の見張り
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-08-17）
     🗣「タスクボードから完TEL済みにドラッグすると『やめました』と表示が出てはじかれる」
     🗣「窓は普通に出る → 入力する → 返車予定に入れる → やめました。完TEL依頼は通常どおり通る」

   ◎原因（実物で再現して確定）
     返車時間の欄を触ると候補パネル（時間で選ぶ／ショートカット）が開く。
     このパネルは完TELの窓の中では**場所を取る作り**なので、
     「返車予定に入れる」を押した瞬間にパネルが閉じ、**ボタンが 82px 上へ跳ねて逃げる**。
     指を離す頃にはそこにボタンが無く、ブラウザは**「窓の外側を押した」**として伝えてくる。
     → 外側＝やめる、なので入力ぜんぶが捨てられ、カードは盤面に戻っていた。
     完TEL依頼の窓には返車時間の欄が無いので、こちらだけ通っていた。

   ◎ここで見張ること
     🔴 返車時間を打ってから「返車予定に入れる」で、ちゃんと入る（やめましたにならない）
     🔴 一度開いた候補パネルは閉じない＝ボタンが跳ねない
     🔴 押し始めが窓の中なら、離した場所が外でも**やめない**
     🔴 外側を押し始めて外側で離したら、今までどおり**やめる**（✕・キャンセルも今までどおり）
     🔴 完TEL依頼は今までどおり通る
     🔴 「外側を押したらやめる」は modal-outside.js の1本を通す（窓ごとに書き写さない）

   ◎使い方
     python3 -m http.server 8997      ← 別ウィンドウ
     PORT=8997 node test_calldone_click.mjs                                */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8997;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });

/* 1枚ぶんの舞台を作る（毎回まっさらから） */
async function stage(){
  const p = await b.newPage({ viewport: { width: 1500, height: 1050 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
  await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
  await p.waitForFunction('window.state && window.PitReturnPopup && window.applyCardDrop && window.pitModalOutside', null, { timeout: 25000 });
  await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    window.__toasts = [];
    const o = window.pitToast;
    window.pitToast = function (m){ window.__toasts.push(String(m)); return o && o.apply(this, arguments); };
  });
  await p.evaluate(() => showView('course1'));
  await p.waitForTimeout(400);
  return { p, errs };
}
/* 盤面のカードを1枚、完TEL済のエリアへドラッグ（当日返しなら1枚目の「通常」を選ぶ） */
async function dragToCallDone(p, which){
  /* 🔴 盤面に**出ているカード**から選ぶ（データだけ見ると、盤面に出ていない車を掴んでしまう） */
  const id = await p.evaluate(w => {
    const ids = [...document.querySelectorAll('#kanban-cols-1 .pit-card[data-card-id]')].map(x => x.dataset.cardId);
    const hit = ids.find(i => { const c = state.cards.find(x => x.id === i); if (!c) return false;
      const sd = !!(window.pitDropIsSameDay && pitDropIsSameDay(c));
      return w === 'sameday' ? sd : !sd; });
    return hit || '';
  }, which);
  if (!id) return '';
  const card = p.locator(`#kanban-cols-1 .pit-card[data-card-id="${id}"]`).first();
  const zone = p.locator(`#view-course1 .kb-droparea[data-drop="callDone"]`).first();
  await card.dragTo(zone);
  await p.waitForTimeout(400);
  if (await p.evaluate(() => !!document.getElementById('rk-backdrop')?.classList.contains('show'))){
    await p.click('#rk-backdrop .rk-pick');                    /* 「通常の完TEL済みにする」 */
    await p.waitForTimeout(350);
  }
  return id;
}
/* 人と同じ押し方（押す→少し待つ→離す）。跳ねたらそのまま外れる */
async function humanClick(p, sel){
  const r = await p.locator(sel).boundingBox();
  await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await p.mouse.down(); await p.waitForTimeout(70); await p.mouse.up();
}
const ymd = n => { const d = new Date(); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

console.log('\n── 🔴 ①ゆうた報告そのもの：時間を入れてから「返車予定に入れる」──');
{
  const { p, errs } = await stage();
  const id = await dragToCallDone(p, 'hold');
  ok('完TEL済の窓が出る', await p.evaluate(() => !!document.getElementById('rp-backdrop')?.classList.contains('show')));

  await p.fill('#rp-amt', '48000');
  await p.fill('#rp-date', ymd(1));
  await p.click('#rp-time-slot .cf-time-main');
  await p.fill('#rp-time-slot .cf-time-main', '15:00');
  await p.waitForTimeout(250);
  ok('🔴 時間の候補パネルが開く', await p.evaluate(() => document.querySelector('#rp-time-slot .cf-time').classList.contains('open')));

  const y1 = await p.evaluate(() => document.getElementById('rp-ok').getBoundingClientRect().y);
  await humanClick(p, '#rp-ok');
  await p.waitForTimeout(700);

  const r = await p.evaluate(i => { const c = state.cards.find(x => x.id === i);
    return { toasts: window.__toasts, status: c.status, stage: c.returnStage, date: c.returnDate, time: c.returnTime, amt: c.amountFinal }; }, id);
  ok('🔴 「やめました」が出ない', !r.toasts.some(t => /やめました/.test(t)), r.toasts);
  ok('🔴 はじかれず、返車予定へ入る', r.stage === 'returnWait' && r.status === 'workDone', r);
  ok('🔴 打った返車時間が残る', r.time === '15:00', r.time);
  ok('確定金額も入る', r.amt === 48000, r.amt);
  ok('返車予定日も入る', r.date === ymd(1), r.date);
  ok('エラーなし', errs.length === 0, errs.slice(0, 2));
  await p.close();
}

console.log('\n── 🔴 ②ボタンが跳ねない（押した所と離した所がズレない）──');
{
  const { p } = await stage();
  await dragToCallDone(p, 'hold');
  await p.click('#rp-time-slot .cf-time-main');
  await p.fill('#rp-time-slot .cf-time-main', '10:00');
  await p.waitForTimeout(200);
  const yOpen = await p.evaluate(() => document.getElementById('rp-ok').getBoundingClientRect().y);
  await p.click('#rp-amt');                                  /* 別の欄へ移る＝前は閉じて跳ねていた */
  await p.waitForTimeout(250);
  const yAfter = await p.evaluate(() => document.getElementById('rp-ok').getBoundingClientRect().y);
  ok('🔴 欄を移ってもボタンが動かない', Math.abs(yOpen - yAfter) < 2, { yOpen, yAfter });
  ok('🔴 候補パネルは開いたまま', await p.evaluate(() => document.querySelector('#rp-time-slot .cf-time').classList.contains('open')));
  await p.close();
}

console.log('\n── 🔴 ③押し始めが窓の中なら、離した場所が外でも やめない ──');
{
  const { p } = await stage();
  const id = await dragToCallDone(p, 'hold');
  await p.fill('#rp-amt', '30000');
  const box = await p.locator('#rp-backdrop .rp-box').boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height - 6);   /* 窓の中で押す */
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height + 160, { steps: 5 });  /* 外で離す */
  await p.mouse.up();
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => ({ toasts: window.__toasts, open: document.getElementById('rp-backdrop').classList.contains('show') }));
  ok('🔴 「やめました」にならない', !r.toasts.some(t => /やめました/.test(t)), r.toasts);
  ok('🔴 窓は開いたまま（入力が消えない）', r.open === true);
  ok('入力もそのまま', await p.evaluate(() => document.getElementById('rp-amt').value) === '30,000');
  await p.close();
}

console.log('\n── ④外側を押し始めて外側で離したら、今までどおり やめる ──');
{
  const { p } = await stage();
  const id = await dragToCallDone(p, 'hold');
  const box = await p.locator('#rp-backdrop .rp-box').boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height + 160);
  await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up();
  await p.waitForTimeout(500);
  const r = await p.evaluate(i => ({ toasts: window.__toasts, open: document.getElementById('rp-backdrop').classList.contains('show'),
    stage: (state.cards.find(x => x.id === i) || {}).returnStage }), id);
  ok('外側を押したら やめる', r.toasts.some(t => /やめました/.test(t)), r.toasts);
  ok('窓が閉じる', r.open === false);
  ok('カードは動かない', !r.stage);
  await p.close();
}

console.log('\n── ⑤✕とキャンセルは今までどおり ──');
{
  const { p } = await stage();
  await dragToCallDone(p, 'hold');
  await p.click('#rp-backdrop .modal-close');
  await p.waitForTimeout(400);
  ok('✕でやめる', await p.evaluate(() => window.__toasts.some(t => /やめました/.test(t))));
  await p.close();
}
{
  const { p } = await stage();
  await dragToCallDone(p, 'hold');
  await p.click('#rp-backdrop .pp-actions .vh-btn:not(.primary)');
  await p.waitForTimeout(400);
  ok('キャンセルでやめる', await p.evaluate(() => window.__toasts.some(t => /やめました/.test(t))));
  await p.close();
}

console.log('\n── ⑥完TEL依頼は今までどおり通る ──');
{
  const { p } = await stage();
  const id = await p.evaluate(() => {
    const ids = [...document.querySelectorAll('#kanban-cols-1 .pit-card[data-card-id]')].map(x => x.dataset.cardId);
    return ids.find(i => { const c = state.cards.find(x => x.id === i);
      return c && !(window.pitDropIsSameDay && pitDropIsSameDay(c)); }) || '';
  });
  const card = p.locator(`#kanban-cols-1 .pit-card[data-card-id="${id}"]`).first();
  await card.dragTo(p.locator(`#view-course1 .kb-droparea[data-drop="callReq"]`).first());
  await p.waitForTimeout(500);
  await p.fill('#rp-amt', '12000');
  await humanClick(p, '#rp-ok');
  await p.waitForTimeout(600);
  const r = await p.evaluate(i => { const c = state.cards.find(x => x.id === i); return { toasts: window.__toasts, stage: c.returnStage }; }, id);
  ok('完TEL待ちへ入る', r.stage === 'callWait', r);
  ok('「やめました」は出ない', !r.toasts.some(t => /やめました/.test(t)), r.toasts);
  await p.close();
}

console.log('\n── 🔴 ⑦窓ごとに書き写していないか（modal-outside 1本）──');
{
  const files = ['js/return-popup.js', 'js/mech-guard.js', 'js/phase-popup.js', 'js/card-view.js',
                 'js/reserve.js', 'js/result.js', 'js/today.js', 'js/undetermined.js', 'js/fleet.js',
                 'js/reset-pit.js', 'js/shaken.js'];
  let copied = [];
  files.forEach(f => {
    const s = fs.readFileSync(f, 'utf-8');
    /* 背景を自前で見張っている書き方が残っていないか（＝写し） */
    if (/addEventListener\(\s*'click'[^\n]*(backdrop|shk-pop|cv-shpop|pit-day-pop|today-action|pit-und-restore)/.test(s)) copied.push(f);
  });
  ok('🔴 背景の見張りを窓ごとに書いていない', copied.length === 0, copied);
  const mo = fs.readFileSync('js/modal-outside.js', 'utf-8');
  ok('押し始めの場所を覚えている', /pointerdown|mousedown/.test(mo) && /fromOutside/.test(mo));
  ok('index.html で使う側より前に読んでいる',
     fs.readFileSync('index.html', 'utf-8').indexOf('js/modal-outside.js') < fs.readFileSync('index.html', 'utf-8').indexOf('js/return-popup.js'));
}

console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail ? 1 : 0);
