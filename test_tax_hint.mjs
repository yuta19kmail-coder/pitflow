/* PitFlow v1.65.1 ── 金額入力欄の下に「税込」をライブ表示（確認用）
   -------------------------------------------------------------------
   ◎ゆうた指定
     「タスクボードの各金額入力欄の下に自動税込み表示（確認用）をライブで表示する。
       自分が入れるべきが税抜だとわかり、また金額があっているか確認できるように」
   ◎大前提
     🔴 **PitFlow が持つ金額はすべて税抜**（2026-07-05 ゆうた決定・恒久ルール）。
        これは**目で確かめるための表示だけ**で、保存する値は1円も変えない。
   ◎物差しは state.js の `pitTaxIn` / `pitTaxHint` / `pitTaxHintSync` 1本。
     ⚠ 税率を変えるときはそこだけ直す。各ポップアップに 1.1 を書き写さないこと。
   ◎使い方（PitFlow のフォルダで）
     python3 -m http.server 8990      ← 別ウィンドウ
     node test_tax_hint.mjs                                               */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8990;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1`);
await p.waitForFunction('window.state && window.pitTaxIn && window.pitTaxHint && window.pitTaxHintSync', null, { timeout: 25000 });
await p.waitForTimeout(700);

console.log('\n── 🧾 計算そのもの ──');
{
  const r = await p.evaluate(() => ({
    rate: window.PIT_TAX_RATE,
    v70100: pitTaxIn(70100),
    comma: pitTaxIn('140,800'),
    yen: pitTaxIn('¥88,000'),
    zero: pitTaxIn(0),
    empty: pitTaxIn(''),
    junk: pitTaxIn('abc'),
    minus: pitTaxIn(-500),
    /* 端数＝円未満切り捨て（1円のズレで「合ってない」と思わせない） */
    odd: pitTaxIn(70105)
  }));
  ok('税率は 10%', r.rate === 0.10, r);
  ok('70,100 → 77,110', r.v70100 === 77110, r);
  ok('カンマ入りでも読む（140,800 → 154,880）', r.comma === 154880, r);
  ok('¥ が付いていても読む', r.yen === 96800, r);
  ok('端数は切り捨て（70,105 → 77,115）', r.odd === 77115, r);
  ok('0・空・文字・マイナスは出さない（null）', r.zero === null && r.empty === null && r.junk === null && r.minus === null, r);
}

console.log('\n── 🏷 出す文言 ──');
{
  const r = await p.evaluate(() => ({ empty: pitTaxHint(''), val: pitTaxHint('70,100'), zero: pitTaxHint('0') }));
  ok('🔴 空でも「税抜で入力」は必ず出る（何を入れるべきか分かる）', /税抜で入力/.test(r.empty), r);
  ok('空のときに税込は出さない', !/税込/.test(r.empty), r);
  ok('入っていれば「税込 ¥77,110」が付く', /税抜で入力/.test(r.val) && /税込 ¥77,110/.test(r.val), r);
  ok('0 のときも税込は出さない', !/税込/.test(r.zero), r);
}

console.log('\n── 💬 タスクボードのポップアップでライブに動く ──');
const seed = () => p.evaluate(() => {
  state.cards = [{ id: 'TX', resNo: 'R-TX', customer: '税込 太郎', car: 'アクア', boardId: 'default', division: 'div1',
    workType: 'shaken', workTypes: ['shaken'], status: 'contact', dropType: 'drop', estAmount: 70100 }];
  return state.cards[0].id;
});

{
  await seed();
  /* ① 受注完了（連絡中→パーツ待ち） */
  const r = await p.evaluate(() => {
    const c = state.cards[0];
    PitPhasePopup.maybeIntercept(c, 'contact', 'parts', function(){});
    const box = document.getElementById('pp-tax'), el = document.getElementById('pp-amt');
    const out = { open: box.innerText.replace(/\s+/g, ' ') };
    el.value = '88,000'; PitPhasePopup.onAmt(el);
    out.typed = box.innerText.replace(/\s+/g, ' ');
    el.value = ''; PitPhasePopup.onAmt(el);
    out.cleared = box.innerText.replace(/\s+/g, ' ');
    out.underInput = !!(el.closest('.pp-field') && el.closest('.pp-field').contains(box));
    PitPhasePopup.close(false);
    return out;
  });
  ok('受注ポップアップ＝開いた時点の概算にも税込が出る', /税込 ¥77,110/.test(r.open), r);
  ok('🔴 打ち替えたら即座に変わる（88,000 → 税込 ¥96,800）', /税込 ¥96,800/.test(r.typed), r);
  ok('消したら税込も消えて「税抜で入力」だけ残る', /税抜で入力/.test(r.cleared) && !/税込/.test(r.cleared), r);
  ok('表示は金額欄と同じ枠の中（＝入力欄の真下）', r.underInput === true, r);

  /* ② 見積（見積り中→連絡中） */
  await seed();
  const q = await p.evaluate(() => {
    const c = state.cards[0]; c.status = 'estim';
    PitPhasePopup.maybeIntercept(c, 'estim', 'contact', function(){});
    const el = document.getElementById('pp-amt'); el.value = '50,000'; PitPhasePopup.onAmt(el);
    const t = document.getElementById('pp-tax').innerText.replace(/\s+/g, ' ');
    PitPhasePopup.close(false); return t;
  });
  ok('見積ポップアップでも出る（50,000 → 税込 ¥55,000）', /税込 ¥55,000/.test(q), q);

  /* ③ クイック受注 */
  await seed();
  const k = await p.evaluate(() => {
    const c = state.cards[0]; c.status = 'check'; c.workType = 'oil'; c.workTypes = ['oil']; c.estAmount = 5000;
    PitPhasePopup.maybeIntercept(c, 'check', 'workDone', function(){});
    const el = document.getElementById('pp-amt'); el.value = '8,800'; PitPhasePopup.onAmt(el);
    const t = document.getElementById('pp-tax').innerText.replace(/\s+/g, ' ');
    PitPhasePopup.close(false); return t;
  });
  ok('クイック受注でも出る（8,800 → 税込 ¥9,680）', /税込 ¥9,680/.test(k), k);

  /* ④ 完TEL（確定金額） */
  await seed();
  const rp = await p.evaluate(() => {
    const c = state.cards[0]; c.status = 'workDone';
    PitReturnPopup.open(c, 'callDone');
    const out = { open: document.getElementById('rp-tax').innerText.replace(/\s+/g, ' ') };
    const el = document.getElementById('rp-amt'); el.value = '12,345'; PitReturnPopup.onAmt(el);
    out.typed = document.getElementById('rp-tax').innerText.replace(/\s+/g, ' ');
    PitReturnPopup.close(false);
    return out;
  });
  ok('完TELポップアップ＝開いた時点でも出る', /税込 ¥77,110/.test(rp.open), rp);
  ok('🔴 完TELでも打つたびに変わる（12,345 → 税込 ¥13,579）', /税込 ¥13,579/.test(rp.typed), rp);

  /* ⑤ 完TEL依頼（先に金額だけ）でも出る */
  await seed();
  const rq = await p.evaluate(() => {
    const c = state.cards[0]; c.status = 'workDone';
    PitReturnPopup.open(c, 'callReq');
    const el = document.getElementById('rp-amt'); el.value = '30,000'; PitReturnPopup.onAmt(el);
    const t = document.getElementById('rp-tax').innerText.replace(/\s+/g, ' ');
    PitReturnPopup.close(false); return t;
  });
  ok('完TEL依頼でも出る（30,000 → 税込 ¥33,000）', /税込 ¥33,000/.test(rq), rq);
}

console.log('\n── 🃏 カード詳細の直接入力欄でも出る ──');
{
  const r = await p.evaluate(() => {
    state.cards = [{ id: 'TX2', resNo: 'R-TX2', customer: 'c', car: 'x', boardId: 'default', division: 'div1',
      workType: 'shaken', workTypes: ['shaken'], status: 'parts', dropType: 'drop', amountOrder: 70100 }];
    openDetail('TX2');
    const out = {};
    const box = document.getElementById('cv-tax-final');
    out.open = box ? box.innerText.replace(/\s+/g, ' ') : '(なし)';
    const el = document.getElementById('cv-amt-final');
    if (el){ el.value = '99,000'; cvAmtChange('final'); out.typed = box.innerText.replace(/\s+/g, ' '); }
    return out;
  });
  await p.waitForTimeout(200);
  ok('カード詳細の金額欄の下にも出る', /税抜で入力/.test(r.open), r);
  ok('打ち替えたら変わる（99,000 → 税込 ¥108,900）', /税込 ¥108,900/.test(r.typed || ''), r);
}

console.log('\n── 🔒 保存する値は変わっていない（表示だけ） ──');
{
  const r = await p.evaluate(() => {
    state.cards = [{ id: 'TX3', resNo: 'R-TX3', customer: 'd', car: 'x', boardId: 'default', division: 'div1',
      workType: 'shaken', workTypes: ['shaken'], status: 'contact', dropType: 'drop', estAmount: 70100 }];
    const c = state.cards[0];
    PitPhasePopup.maybeIntercept(c, 'contact', 'parts', function(){ c.status = 'parts'; });
    const el = document.getElementById('pp-amt'); el.value = '70,100'; PitPhasePopup.onAmt(el);
    PitPhasePopup.close(true);
    return { order: c.amountOrder, quote: c.amountQuote };
  });
  ok('🔴 保存されるのは税抜のまま（77,110 ではなく 70,100）', r.order === 70100, r);
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  await p.evaluate(() => { state.cards = []; });
  for (const v of ['course1', 'today', 'return', 'sales', 'mydash']) {
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(120);
  }
  ok('課ボード・当日・返車・売上・ダッシュボードを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.65.1 以降', vn[0] > 1 || (vn[0] === 1 && (vn[1] > 65 || (vn[1] === 65 && vn[2] >= 1))), ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
