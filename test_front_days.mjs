/* PitFlow v1.72.0 ── 売上サマリー：読みのズレ／預かりの中身／グラフの拡大
   -------------------------------------------------------------------
   ◎ゆうた指定
     ・フロント欄に、暫定預かり（＝概算返車日）と実際の返車日の **平均差分と最大差分**
     ・**預かりに限って**、作業待ち→作業完了／作業完了→確定返車日 の **共に平均日数**
     ・売上グラフに**フォーカス（拡大表示）**

   ◎数え方の決めごと
     ・概算返車日 A ＝ 入庫日 ＋ 概算 預かり日数（return-slot.js の pitReturnA 1本）
     ・ズレ ＝ 実際に返した日 − A（**＋＝遅れた／−＝早く返せた**）。最大は**いちばん外した1台**（符号つき）
     ・工程に入った時刻は flow-pit.js の pitPhaseEnteredMs 1本（フローを直せば数字も改まる）
     ・待ち・当日返しは混ぜない（その日のうちなので平均が潰れる）
     ・**数えているだけ。保存データは1バイトも触らない。**

   ◎使い方（PitFlow のフォルダで）
     python3 -m http.server 8998      ← 別ウィンドウ
     node test_front_days.mjs                                           */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8998;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1700, height: 1100 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitPhaseEnteredMs && window.pitReturnA', null, { timeout: 20000 });
await p.waitForTimeout(600);

console.log('\n── ⓪ 工程に入った時刻を、いまの工程以外にも聞ける ──');
{
  const r = await p.evaluate(() => {
    const c = { status:'returned', log:[
      { type:'phase', to:'work',     at: Date.parse('2026-08-01T10:00:00') },
      { type:'phase', to:'workDone', at: Date.parse('2026-08-03T15:00:00') }
    ]};
    return { work: pitPhaseEnteredMs(c,'work'), done: pitPhaseEnteredMs(c,'workDone'),
             none: pitPhaseEnteredMs(c,'estim') };
  });
  ok('作業待ちに入った時刻が取れる', r.work === Date.parse('2026-08-01T10:00:00'), r);
  ok('作業完了に入った時刻が取れる', r.done === Date.parse('2026-08-03T15:00:00'), r);
  ok('🔴 記録が無い工程は null（入庫日で代用しない）', r.none === null, r);
}

/* 検証用の車を作る。今月の1日入庫・概算5日 → 概算返車日は 6日。 */
const setup = await p.evaluate(() => {
  const now = new Date(); const Y = now.getFullYear(), M = now.getMonth();
  const d = n => window.ymd(new Date(Y, M, n));
  const ms = (n, h) => new Date(Y, M, n, h || 10).getTime();
  const mk = (id, o) => Object.assign({
    id, resNo:id, customer:'客'+id, car:'アクア', maker:'トヨタ', boardId:'default', division:'div1',
    status:'returned', frontStaff:'テスト太郎', workTypes:['shaken'], workType:'shaken',
    estHoldDays:5, amountFinal:100000, amountQuote:100000
  }, o);
  state.cards = [
    /* 預かり①：1日入庫・概算5日 → 概算返車 6日。実際は 9日返車＝＋3日
       作業待ち 3日 → 作業完了 7日（4日）／完了 7日 → 返車 9日（2日） */
    mk('P1', { dropType:'drop', reserveDate:d(1), returnDate:d(9), returnDateFinal:d(9), completedAt:d(9),
      log:[{type:'phase',to:'work',at:ms(3)},{type:'phase',to:'workDone',at:ms(7)}] }),
    /* 預かり②：1日入庫・概算5日 → 概算返車 6日。実際は 5日返車＝−1日
       作業待ち 2日 → 作業完了 4日（2日）／完了 4日 → 返車 5日（1日） */
    mk('P2', { dropType:'drop', reserveDate:d(1), returnDate:d(5), returnDateFinal:d(5), completedAt:d(5),
      log:[{type:'phase',to:'work',at:ms(2)},{type:'phase',to:'workDone',at:ms(4)}] }),
    /* 待ち：当日返し。ズレには入るが、預かりの日数には**入らない** */
    mk('W1', { dropType:'wait', reserveDate:d(10), returnDate:d(10), returnDateFinal:d(10), completedAt:d(10),
      estHoldDays:0, log:[{type:'phase',to:'work',at:ms(10,9)},{type:'phase',to:'workDone',at:ms(10,12)}] })
  ];
  state.currentView = 'sales';
  window._svTab = 'front'; window._svMode = 'month';
  window._svYM = { y:Y, m:M };
  window.showView('sales');
  return { estRetP1: pitReturnA(state.cards[0]), day6: d(6) };
});
await p.waitForTimeout(700);

console.log('\n── ① 概算返車日（暫定預かり）の読み方 ──');
ok('概算返車日＝入庫日＋概算 預かり日数（1日＋5日＝6日）', setup.estRetP1 === setup.day6, setup);

console.log('\n── ② フロント欄に数字が出る ──');
{
  const r = await p.evaluate(() => {
    const card = Array.from(document.querySelectorAll('#view-sales-body .sv-fcard'))
      .find(c => (c.querySelector('.sv-fcard-name')||{}).textContent === 'テスト太郎');
    if (!card) return { no:true };
    const o = {};
    card.querySelectorAll('.sv-fdays .sv-dm').forEach(function(d){
      o[(d.querySelector('span').childNodes[0].textContent||'').trim()] = d.querySelector('b').textContent.trim();
    });
    return { o, cls: Array.from(card.querySelectorAll('.sv-fdays .sv-dm')).map(d => d.className.trim()) };
  });
  ok('「読みのズレ／預かりの中身」の4つが出ている', !r.no && Object.keys(r.o||{}).length === 4, r);
  /* ズレ＝P1 +3 / P2 −1 / W1 ±0 → 平均 +0.7（(3-1+0)/3）・最大 +3 */
  ok('🔴 概算とのズレ 平均＝＋0.7日', r.o && r.o['概算とのズレ 平均'] === '＋0.7日', r.o);
  ok('🔴 いちばん外した＝＋3日', r.o && r.o['いちばん外した'] === '＋3日', r.o);
  /* 預かりだけ＝P1 4日 / P2 2日 → 平均 3日。W1（待ち）は入らない */
  ok('🔴 作業待ち→完了＝3日（預かり2台の平均・待ちは混ざらない）',
     r.o && r.o['作業待ち→完了'] === '3日', r.o);
  /* 完了→返車＝P1 2日 / P2 1日 → 平均 1.5日 */
  ok('🔴 完了→確定返車＝1.5日', r.o && r.o['完了→確定返車'] === '1.5日', r.o);
  ok('台数の添え書きが「預かり 2台」になっている', await p.evaluate(() => {
    const card = Array.from(document.querySelectorAll('#view-sales-body .sv-fcard'))
      .find(c => (c.querySelector('.sv-fcard-name')||{}).textContent === 'テスト太郎');
    return /預かり 2台/.test(card.innerHTML);
  }));
  ok('遅れは赤の印が付く（早い側と区別できる）', (r.cls||[]).some(c => /sv-dm-late/.test(c)), r.cls);
}

console.log('\n── ③ 表でも同じ数字が出る ──');
{
  await p.evaluate(() => window.svSetFrontView('table'));
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const heads = Array.from(document.querySelectorAll('#view-sales-body .sv-table thead th')).map(t => t.textContent.trim());
    const row = Array.from(document.querySelectorAll('#view-sales-body .sv-table tbody tr'))
      .find(tr => tr.cells[0].textContent.trim() === 'テスト太郎');
    const cells = row ? Array.from(row.cells).map(c => c.textContent.trim()) : [];
    const at = h => { const i = heads.indexOf(h); return i >= 0 ? cells[i] : null; };
    return { heads, ズレ平均: at('ズレ平均'), ズレ最大: at('ズレ最大'),
             待完: at('作業待ち→完了'), 完返: at('完了→返車') };
  });
  ok('表に4つの列が増えている',
     ['ズレ平均','ズレ最大','作業待ち→完了','完了→返車'].every(h => r.heads.indexOf(h) >= 0), r.heads);
  ok('表の数字がインフォグラフィックと同じ',
     r.ズレ平均 === '＋0.7日' && r.ズレ最大 === '＋3日' && r.待完 === '3日' && r.完返 === '1.5日', r);
  await p.evaluate(() => window.svSetFrontView('info'));
  await p.waitForTimeout(300);
}

console.log('\n── ④ 🔴 グラフの拡大 ──');
{
  await p.evaluate(() => { window._svTab = 'sales'; window.showView('sales'); });
  await p.waitForTimeout(700);
  const n = await p.evaluate(() => document.querySelectorAll('#view-sales-body .sv-zoombtn').length);
  ok('グラフのあるカードに「拡大」が付いている（1つ以上）', n >= 1, n);
  ok('グラフの無いカードには付いていない', await p.evaluate(() =>
    Array.from(document.querySelectorAll('#view-sales-body .sv-card'))
      .every(c => !!c.querySelector('svg.sv-chart, svg.sv-stack') || !c.querySelector('.sv-zoombtn'))));
  await p.evaluate(() => document.querySelector('#view-sales-body .sv-zoombtn').click());
  await p.waitForTimeout(300);
  const z = await p.evaluate(() => {
    const ov = document.getElementById('sv-zoom');
    const svg = ov && ov.querySelector('svg.sv-chart');
    return { open: !!(ov && ov.classList.contains('open')), hasSvg: !!svg,
             h: svg ? Math.round(svg.getBoundingClientRect().height) : 0,
             title: ov ? (ov.querySelector('.sv-zoom-h span')||{}).textContent : '',
             btnInside: !!(ov && ov.querySelector('.sv-zoombtn')) };
  });
  ok('🔴 大きい窓が開く', z.open === true, z);
  ok('中にグラフが入っている', z.hasSvg === true, z);
  ok('🔴 元より大きく描かれている（300px以上）', z.h >= 300, z);
  ok('見出しが引き継がれている', !!(z.title||'').trim(), z);
  ok('窓の中に「拡大」ボタンは残っていない', z.btnInside === false, z);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(250);
  ok('Esc で閉じる', await p.evaluate(() => !document.getElementById('sv-zoom').classList.contains('open')));
  /* 描き直しても二重に付かない */
  await p.evaluate(() => { window.showView('sales'); window.showView('sales'); });
  await p.waitForTimeout(600);
  ok('描き直しても「拡大」が二重に付かない', await p.evaluate(() =>
    Array.from(document.querySelectorAll('#view-sales-body .sv-card'))
      .every(c => c.querySelectorAll('.sv-zoombtn').length <= 1)));
}

console.log('\n── ⑤ データを触っていない ──');
{
  ok('🔴 カードの中身が変わっていない', await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'P1');
    return c.returnDate && c.reserveDate && c.estHoldDays === 5 && c.log.length === 2 && !c.returnDatePlan;
  }));
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  for (const v of ['course1', 'today', 'reserve', 'return', 'sales', 'mydash']) {
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(150);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.72.0 以降', vn[0] > 1 || (vn[0] === 1 && vn[1] >= 72), ver);
}

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
