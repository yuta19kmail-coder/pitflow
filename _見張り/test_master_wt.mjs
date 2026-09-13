/* PitFlow ── 🗂 **マスター入力の作業タイプ＝新規予約と同じ部品／保険の入金待ち・入金日**（ブラウザ）
   ===================================================================
   ◎ゆうた指定（2026-09-13）
     🗣「わかりにくい。作業タイプは新規予約の物をそのまま全部使って欲しい（車検などはプルダウン、BP等がバッチという構造が）」
     🗣「保険にした場合のストーリーの分岐がないと思う。実際には返車済み、入金待ち なども状態も存在するし、入金日みたいな表記もいるかと」

   ◎ここで見張ること（実物の画面で押す）
     🔴🔴 ① マスター入力の作業タイプは、予約詳細と**同じ3つの欄**（作業タイプ｜併用可｜その他）。選択欄は無い
     🔴  ② 基本（車検）を押す → 車検が付く／もう一度で外れる
     🔴🔴 ③ 併用可の B.P を押す → B.P だけでも付く／車検と重ねられる
     🔴  ④ 「その他」を押すと引き出しが開き、付加・社内区分・物販が出る（代車は押せない）
     🔴🔴 ⑤ 付加の「保険」を押す → 保険が付き、売掛（入金日の欄）が入る
     🔴🔴 ⑥ 返車済みにすると「入金待ち」。実績カウント日は空で、入金日の欄が出る。保存を止めない
     🔴🔴 ⑦ 入金日を入れると、その日が実績カウント日になる
     🔴  ⑧ 押しても本物のカードは保存されない（マスター入力は保存ボタンで一度に）

   ◎使い方（PitFlow のフォルダで）
       python -m http.server 8987      ← 別ウィンドウ
       PORT=8987 node _見張り/test_master_wt.mjs
   =================================================================== */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const PORT = process.env.PORT || 8987;
const cp = chromePath();
const b = await chromium.launch(cp ? { executablePath: cp } : {});
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
let ok = 0, ng = 0;
const t = (name, cond, x) => { if (cond) { ok++; console.log('  ✅ ' + name); } else { ng++; console.log('  ❌ ' + name + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction(() => typeof window.pitMasterOpen === 'function' && typeof window.pitWorkTypeBind === 'function' && typeof window.showView === 'function', null, { timeout: 30000 });
await p.waitForTimeout(800);
await p.evaluate(() => { showView('master'); pitMasterOpen(); });
await p.waitForTimeout(400);

const M = () => p.evaluate(() => { const m = pitMasterCurrent() || {}; return { wt: m.workType || null, adds: m.workAddons || [], types: m.workTypes || [], sp: m.workSpecials || [], paySep: !!m.paymentSeparate, pay: m.paymentDate || null, done: m.completedAt || '', status: m.status }; });
const click = (sel) => p.evaluate((sel) => { const el = document.querySelector('#master-body ' + sel); if (!el) return false; el.click(); return true; }, sel);

console.log('\n── ① 予約詳細と同じ3つの欄 ──');
let v = await p.evaluate(() => {
  const wt = document.querySelector('#master-body #ms-wt');
  return {
    has: !!wt,
    base: wt ? wt.querySelectorAll('.cf-chips[data-key="workType"]:not([data-drawerwt]) .cf-chip').length : 0,
    combo: wt ? [...wt.querySelectorAll('.cf-chips[data-combo] .cf-chip')].map(x => x.dataset.val) : [],
    other: !!(wt && wt.querySelector('#cf-other-btn')),
    select: !!document.querySelector('#master-body select[onchange*="\'workType\'"]'),
    labels: wt ? [...wt.querySelectorAll('.cf-label')].map(x => x.textContent.trim()) : []
  };
});
t('🔴🔴 作業タイプの欄がある', v.has, v);
t('🔴🔴 3つの欄（作業タイプ｜併用可｜その他）', v.labels.join('|') === '作業タイプ|併用可|その他', v.labels);
t('🔴 基本のチップが並ぶ（車検・12点・一般・オイル）', v.base >= 4, v.base);
t('🔴🔴 併用可に B.P がある', v.combo.indexOf('bp') >= 0, v.combo);
t('🔴 作業タイプの選択欄（プルダウン）は無い', !v.select, v);

console.log('\n── ② 基本（車検） ──');
await click('.cf-chips[data-key="workType"]:not([data-drawerwt]) .cf-chip[data-val="shaken"]');
await p.waitForTimeout(200);
v = await M();
t('🔴 車検が付く', v.wt === 'shaken' && v.types.join() === 'shaken', v);

console.log('\n── ③ 併用可（B.P） ──');
await click('.cf-chips[data-combo] .cf-chip[data-val="bp"]');
await p.waitForTimeout(200);
v = await M();
t('🔴🔴 車検と B.P を重ねられる', v.types.join() === 'shaken,bp', v);
await click('.cf-chips[data-key="workType"]:not([data-drawerwt]) .cf-chip[data-val="shaken"]');
await p.waitForTimeout(200);
v = await M();
t('🔴🔴 車検を外すと B.P だけで立つ', !v.wt && v.types.join() === 'bp', v);

console.log('\n── ④ その他の引き出し ──');
await click('#cf-other-btn');
await p.waitForTimeout(200);
v = await p.evaluate(() => {
  const wt = document.querySelector('#master-body #ms-wt');
  const lo = wt && wt.querySelector('.cf-chips[data-intern] .cf-chip[data-val="loanercar"]');
  return {
    panel: !!(wt && wt.querySelector('.cf-other-panel')),
    special: wt ? [...wt.querySelectorAll('.cf-chips[data-special] .cf-chip')].map(x => x.dataset.val) : [],
    intern: wt ? [...wt.querySelectorAll('.cf-chips[data-intern] .cf-chip')].map(x => x.dataset.val) : [],
    goods: !!(wt && wt.querySelector('.cf-chips[data-drawerwt] .cf-chip[data-val="goods"]')),
    loanerLocked: !!(lo && lo.disabled)
  };
});
t('🔴 引き出しが開く', v.panel, v);
t('🔴 付加（保証・保険・社員）が出る', v.special.indexOf('insurance') >= 0, v.special);
t('🔴 社内区分と物販も出る', v.intern.length >= 3 && v.goods, v);
t('🔴 代車は押せない（作業予定ボードからだけ）', v.loanerLocked, v);

console.log('\n── ⑤ 保険を付ける ──');
await click('.cf-chips[data-special] .cf-chip[data-val="insurance"]');
await p.waitForTimeout(200);
v = await M();
t('🔴🔴 保険が付く', v.sp.indexOf('insurance') >= 0, v);
t('🔴🔴 売掛（入金日の欄）が入る', v.paySep, v);

console.log('\n── ⑥ 返車済み＝入金待ち ──');
await p.evaluate(() => { pitMasterSet('amountFinal', '300000'); pitMasterSet('returnDateFinal', '2026-09-10'); pitMasterSet('status', 'returned'); });
await p.waitForTimeout(300);
v = await M();
const s6 = await p.evaluate(() => {
  const body = document.getElementById('master-body');
  const payInput = [...body.querySelectorAll('.ms-f')].find(f => /入金日（保険）/.test(f.textContent));
  return {
    payField: !!payInput,
    note: [...body.querySelectorAll('.ms-chk')].map(x => x.textContent).filter(x => /保険/.test(x)),
    stop: (pitMasterChecks(pitMasterCurrent()).stop || []).filter(x => /実績カウント日が空/.test(x)),
    warn: (pitMasterChecks(pitMasterCurrent()).warn || []).filter(x => /入金待ち/.test(x)),
    foot: (document.getElementById('ms-foot') || {}).textContent || ''
  };
});
t('🔴🔴 入金待ち（実績カウント日は空）', v.status === 'returned' && !v.done && !v.pay, v);
t('🔴🔴 入金日の欄が出る', s6.payField, s6);
t('🔴 「入金待ち」と画面で言う', s6.note.some(x => /入金待ち/.test(x)) && /入金待ち/.test(s6.foot), s6);
t('🔴🔴 入金待ちは「実績カウント日が空」で止めない（聞くだけ）', s6.stop.length === 0 && s6.warn.length === 1, s6);

console.log('\n── ⑦ 入金日を入れる ──');
await p.evaluate(() => pitMasterSet('paymentDate', '2026-09-20'));
await p.waitForTimeout(300);
v = await M();
t('🔴🔴 入金日がそのまま実績カウント日になる', v.pay === '2026-09-20' && v.done === '2026-09-20', v);

console.log('\n── ⑧ 押しても本物のカードは保存されない ──');
const saved = await p.evaluate(() => { const id = pitMasterCurrent().id; return (state.cards || []).some(x => x && x.id === id); });
t('🔴 まだカードになっていない（保存ボタンで一度に）', saved === false, saved);

console.log('\n── ⑨ ほかの欄も今までどおり動く（打つ・ボタン・時刻） ──');
{
  /* ⚠ v2.99.0 の書き換えで、打っている途中の入力（pitMasterSetQuiet）・ボタン（pitMasterToggle）・
     入庫時刻（pitMasterTime）の受け口を**一度消してしまった**。作業タイプだけ押す見張りでは捕まらなかったので足した。 */
  const r = await p.evaluate(() => ({
    fn: ['pitMasterSet','pitMasterSetQuiet','pitMasterToggle','pitMasterTime','pitMasterSave','pitMasterNoSale','pitMasterResNo']
          .filter(n => typeof window[n] !== 'function'),
    missing: [...new Set([...document.querySelectorAll('#master-body [onclick],#master-body [oninput],#master-body [onchange]')]
          .map(el => (el.getAttribute('onclick') || '') + ' ' + (el.getAttribute('oninput') || '') + ' ' + (el.getAttribute('onchange') || ''))
          .join(' ').match(/pit[A-Z][A-Za-z]+(?=\()/g) || [])].filter(n => typeof window[n] !== 'function')
  }));
  t('🔴🔴 マスター入力の受け口がそろっている', r.fn.length === 0, r.fn);
  t('🔴🔴 画面のボタン・欄が呼ぶ関数が全部ある（押して何も起きない、が無い）', r.missing.length === 0, r.missing);
  await p.evaluate(() => {
    const f = [...document.querySelectorAll('#master-body .ms-f')].find(x => /^カナ/.test(x.querySelector('label') ? x.querySelector('label').textContent.trim() : ''));
    const inp = f && f.querySelector('input');
    if (inp){ inp.value = 'テスト タロウ'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await p.evaluate(() => pitMasterToggle('tentative'));
  await p.evaluate(() => pitMasterTime('930'));
  await p.waitForTimeout(200);
  const m = await p.evaluate(() => { const x = pitMasterCurrent(); return { kana: x.kana, tentative: !!x.tentative, time: x.reserveTime }; });
  t('🔴 カナを打つと入る', m.kana === 'テスト タロウ', m);
  t('🔴 仮予約のボタンが効く', m.tentative === true, m);
  t('🔴 入庫時刻は新規予約と同じ整形（930 → 9:30）', /^0?9:30$/.test(m.time || ''), m);
}

t('ページのエラーが出ていない', errs.length === 0, errs.slice(0, 3));
await b.close();
console.log('\n===== ' + ok + ' OK / ' + ng + ' NG =====');
process.exit(ng ? 1 : 0);
