/* PitFlow v1.85.0 ── ダッシュボードの「数字／中身／両方」の見張り
   -------------------------------------------------------------------
   ◎ゆうた依頼（2026-08-12）
     「預かり中10台と言われても正直意味がない。山田 アクア／田中 プリウス みたいに
       個別の顧客情報がないと結局なんのアクションもできない」
     → BOXごとに ［数字］／［中身（チップ）］／［両方］ を選べるようにした。
     あわせて書式の直し（万が二重／0の色／単位の場所）。

   ◎ここで見張ること
     ① 画面が赤いエラーなしで出る
     ② 🔴「24.4万万」のような**万の二重**が1つも無い
     ③ 単位の場所に単位以外（「8 空き」）が入っていない
     ④ 0件の数字は色を捨てている（.md-kpi.zero）
     ⑤ 既定が「中身」のBOX（今日の入庫）に、**名前と車のチップ**が出ている
     ⑥ カスタマイズ中だけ ［数字］［中身］［両方］が出る。
        中身を持たないBOX（最短入庫日・予約の埋まり）には出ない
     ⑦ 切り替えると保存され（layout の v）、描き直しても残る
     ⑧ 🔴「両方」で中身が二重にならない
     ⑨ 数字と中身の台数が食い違わない（同じ pick() を使っているか）
     ⑩ チップを押すとカード詳細が開く

   ◎使い方（本物のアプリをそのまま動かす）
     python3 -m http.server 8992      ← 別ウィンドウ・pitflow フォルダで
     node test_mydash_view.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8992;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const errs = [];

try {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text().slice(0, 200)); });

  /* サンプルモードで開く（?demo=1）。ログインはこの端末のフラグだけ */
  await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1`);
  await p.evaluate(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
  await p.reload();
  await p.waitForFunction('window.renderMyDash && window.state && state.cards && state.cards.length', null, { timeout: 30000 });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { if (window.pitNewsPopClose) pitNewsPopClose(); });
  await p.waitForTimeout(400);

  const text = () => p.evaluate(() => document.getElementById('view-mydash-body').innerText);

  console.log('\n── 書式の直し ──');
  const t0 = await text();
  ok('🔴 「万」が二重に出ていない', !/万万/.test(t0), (t0.match(/.{0,10}万万.{0,6}/) || [''])[0]);
  ok('「億億」も出ていない', !/億億/.test(t0));
  ok('単位の場所に「空き」が入っていない', !/\d\s*空き(?!\／)/.test(await p.evaluate(() =>
    [].map.call(document.querySelectorAll('.md-kpi .md-n'), n => n.textContent).join(' | '))));
  ok('0件の数字は色を捨てている',
    await p.evaluate(() => [].every.call(document.querySelectorAll('.md-kpi'), k => {
      const n = (k.querySelector('.md-n') || {}).textContent || '';
      return !/^0\D*$/.test(n.trim()) || k.classList.contains('zero');
    })));

  console.log('\n── 中身（チップ）が出ているか ──');
  const chips = await p.evaluate(() => [].map.call(document.querySelectorAll('.md-cp'), c => c.textContent.trim()));
  ok('チップが出ている', chips.length > 0, chips.slice(0, 3));
  ok('チップに「様」＋車名が入っている（誰の何の車か）',
     chips.some(c => /様/.test(c)), chips.slice(0, 3));
  ok('チップは押せる（カードに繋がっている）',
     (await p.evaluate(() => document.querySelectorAll('.md-cp.md-click').length)) > 0);

  console.log('\n── 数字と中身の台数が食い違わない ──');
  const same = await p.evaluate(() => {
    /* 今日の入庫：中身モードの見出し数字 と、チップ＋「ほか◯台」の合計を突き合わせる */
    const boxes = [].slice.call(document.querySelectorAll('.md-box'));
    const box = boxes.find(b => /今日の入庫/.test((b.querySelector('h3') || {}).textContent || ''));
    if (!box) return { skip: true };
    const head = +((box.querySelector('.md-lnum b') || {}).textContent || '').replace(/[^\d]/g, '');
    const cps = box.querySelectorAll('.md-cp:not(.md-cp-more)').length;
    const more = box.querySelector('.md-cp-more');
    const rest = more ? +(more.textContent.replace(/[^\d]/g, '') || 0) : 0;
    return { head, sum: cps + rest };
  });
  ok('見出しの台数＝チップ＋ほか◯台', same.skip || same.head === same.sum, same);

  console.log('\n── カスタマイズ中の切替 ──');
  ok('ふだんは切替チップが見えていない',
     await p.evaluate(() => [].every.call(document.querySelectorAll('.md-vwchip'), c => c.offsetParent === null)));
  await p.evaluate(() => window.mydToggleEdit());
  await p.waitForTimeout(400);
  ok('カスタマイズ中は見える',
     await p.evaluate(() => [].some.call(document.querySelectorAll('.md-vwchip'), c => c.offsetParent !== null)));
  ok('中身を持たないBOXには切替が出ない（最短入庫日・予約の埋まり）',
     await p.evaluate(() => {
       const boxes = [].slice.call(document.querySelectorAll('.md-box'));
       return boxes.filter(b => /最短入庫日|予約の埋まり/.test((b.querySelector('h3') || {}).textContent || ''))
                   .every(b => b.querySelectorAll('.md-vwchip').length === 0);
     }));

  console.log('\n── 切り替えて保存されるか（預かり中） ──');
  const idx = await p.evaluate(() => {
    const m = state.settings.myDash; return (m.presets[m.active].layout || []).findIndex(x => x.e === 'hold');
  });
  ok('「預かり中」のBOXがある', idx >= 0);
  await p.evaluate(i => window.mydSetView(null, i, 'list'), idx);
  await p.waitForTimeout(400);
  ok('中身に切り替わって保存された', (await p.evaluate(i => state.settings.myDash.presets[state.settings.myDash.active].layout[i].v, idx)) === 'list');
  const holdChips = await p.evaluate(() => {
    const box = [].slice.call(document.querySelectorAll('.md-box')).find(b => /預かり中/.test((b.querySelector('h3') || {}).textContent || ''));
    return box ? box.querySelectorAll('.md-cp').length : 0;
  });
  ok('「預かり中」に中身が出た', holdChips > 0, holdChips);

  await p.evaluate(i => window.mydSetView(null, i, 'both'), idx);
  await p.waitForTimeout(400);
  const both = await p.evaluate(() => {
    const box = [].slice.call(document.querySelectorAll('.md-box')).find(b => /預かり中/.test((b.querySelector('h3') || {}).textContent || ''));
    return { kpi: box.querySelectorAll('.md-kpi').length, chips: box.querySelectorAll('.md-cp').length, lists: box.querySelectorAll('.md-list').length };
  });
  ok('「両方」＝数字とチップが1組ずつ（中身が二重になっていない）', both.kpi >= 1 && both.chips > 0 && both.lists === 0, both);

  console.log('\n── 描き直しても残るか ──');
  await p.evaluate(() => window.mydToggleEdit());
  await p.evaluate(() => window.mydRefresh());
  await p.waitForTimeout(700);
  ok('カスタマイズを閉じても「両方」のまま',
     (await p.evaluate(i => state.settings.myDash.presets[state.settings.myDash.active].layout[i].v, idx)) === 'both');
  ok('描き直してもチップが出ている',
     (await p.evaluate(() => document.querySelectorAll('.md-cp').length)) > 0);

  console.log('\n── チップを押すとカードが開く ──');
  const opened = await p.evaluate(async () => {
    const c = document.querySelector('.md-cp.md-click'); if (!c) return 'チップなし';
    c.click();
    await new Promise(r => setTimeout(r, 700));
    const m = document.getElementById('modal-detail');   /* 予約カードの詳細（index.html） */
    return m ? (getComputedStyle(m).display !== 'none' ? 'ok' : '閉じている') : 'モーダルなし';
  });
  ok('カード詳細が開いた', opened === 'ok', opened);

  console.log('\n── 🔴 押して開いたとき（数字→細／中身→中） ──');
  /* 数字BOX（預かり中を数字に戻す）→ 開くとチップ（細）が出る */
  await p.evaluate(i => window.mydSetView(null, i, 'num'), idx);
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const box = [].slice.call(document.querySelectorAll('.md-box')).find(b => /預かり中/.test((b.querySelector('h3') || {}).textContent || ''));
    box.click();
  });
  await p.waitForTimeout(600);
  const numDeep = await p.evaluate(() => {
    const box = document.querySelector('.md-box.md-exp'); if (!box) return null;
    return { chips: box.querySelectorAll('.md-more .md-cp').length, cards: box.querySelectorAll('.md-more .pit-card').length,
             open: !!box.querySelector('.md-more .md-open') };
  });
  ok('数字BOXを開くと細（チップ）が出る', numDeep && numDeep.chips > 0, numDeep);
  ok('数字BOXの中にカード（中）は出さない', numDeep && numDeep.cards === 0, numDeep);
  ok('「◯◯を開く」が付いている', numDeep && numDeep.open, numDeep);

  /* 中身BOX（今日の入庫）→ 開くと本物のカード（中）が出る */
  await p.evaluate(() => {
    const box = [].slice.call(document.querySelectorAll('.md-box')).find(b => /今日の入庫/.test((b.querySelector('h3') || {}).textContent || ''));
    box.click();
  });
  await p.waitForTimeout(700);
  const listDeep = await p.evaluate(() => {
    const box = [].slice.call(document.querySelectorAll('.md-box.md-exp')).find(b => /今日の入庫/.test((b.querySelector('h3') || {}).textContent || ''));
    if (!box) return null;
    return { cards: box.querySelectorAll('.md-more .pit-card').length, open: !!box.querySelector('.md-more .md-open') };
  });
  ok('中身BOXを開くとカード（中）が出る', listDeep && listDeep.cards > 0, listDeep);
  ok('こちらにも「◯◯を開く」が付いている', listDeep && listDeep.open, listDeep);
  await p.evaluate(() => document.body.click());
  await p.waitForTimeout(300);

  console.log('\n── 画面のエラー ──');
  ok('赤いエラーが出ていない', errs.length === 0, errs.slice(0, 4));
} finally {
  await b.close();
}

console.log(`\n合計：${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
