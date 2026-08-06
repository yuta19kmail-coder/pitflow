/* PitFlow v1.61.0 ── 売上をどの月に数えるか（返車予定日で分ける）
   -------------------------------------------------------------------
   ◎ゆうた指定
     「売上サマリー等の集計に、受注済みの確定金額が入っている車両でも、
       返車予定が当月内でなければ、その時までずらす。
       基本的には**返車予定日が月内かどうか**が分けるポイント」
   ◎決めごと（ゆうた確認済み）
     ・返車予定日が未定 …… 当月に寄せる
     ・返車予定日が過ぎている …… 当月に寄せる（締めた過去の月を動かさない）
     ・当てはめる範囲 …… 確定・予定・見込・予測（進行中ぜんぶ）
     ・実績を数える日 …… 実績カウント日（completedAt）に統一
   ◎使い方（PitFlow のフォルダで）
     python3 -m http.server 8987      ← 別ウィンドウ
     node test_sales_month.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8987;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1`);
await p.waitForFunction('window.state && window.pitSalesCountDate && window.pitSalesTier && window.pitSalesInRange', null, { timeout: 25000 });
await p.waitForTimeout(600);

/* 今月・来月・先月の枠を作る（テストを走らせた月に追随させる＝月末に落ちないように） */
const W = await p.evaluate(() => {
  const pad = n => (n < 10 ? '0' : '') + n;
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const y = t.getFullYear(), m = t.getMonth();
  return {
    today: ymd(t),
    moS: ymd(new Date(y, m, 1)), moE: ymd(new Date(y, m + 1, 0)),
    nxS: ymd(new Date(y, m + 1, 1)), nxE: ymd(new Date(y, m + 2, 0)),
    pvS: ymd(new Date(y, m - 1, 1)), pvE: ymd(new Date(y, m, 0)),
    mid: ymd(new Date(y, m, 15)), nxMid: ymd(new Date(y, m + 1, 15)), pvMid: ymd(new Date(y, m - 1, 15))
  };
});

/* 1枚だけカードを差し込んで聞く */
const ask = (card, from, to) => p.evaluate(([card, from, to]) => {
  return {
    date: pitSalesCountDate(card),
    tier: pitSalesTier(card),
    inRange: pitSalesInRange(card, from, to)
  };
}, [card, from, to]);

const base = { id: 'SM1', resNo: 'R-SM1', customer: '売上 太郎', car: 'アクア', boardId: 'default', division: 'div1', workType: 'shaken', amountOrder: 100000 };

console.log('\n── 💴 受注済み（確定）の車は「返車予定日の月」に数える ──');
{
  const cur = await ask({ ...base, status: 'parts', returnDate: W.mid }, W.moS, W.moE);
  ok('返車予定が当月＝当月に数える', cur.tier === 'confirmed' && cur.inRange === true, cur);

  const nx = await ask({ ...base, status: 'parts', returnDate: W.nxMid }, W.moS, W.moE);
  ok('🔴 返車予定が翌月＝当月には出さない', nx.tier === 'confirmed' && nx.inRange === false, nx);

  const nx2 = await ask({ ...base, status: 'parts', returnDate: W.nxMid }, W.nxS, W.nxE);
  ok('🔴 返車予定が翌月＝翌月を見ると出る（ずれた先で数える）', nx2.inRange === true, nx2);

  const none = await ask({ ...base, status: 'parts', returnDate: '' }, W.moS, W.moE);
  ok('返車予定が未定＝当月に寄せる', none.date === '' && none.inRange === true, none);

  const noneNx = await ask({ ...base, status: 'parts', returnDate: '' }, W.nxS, W.nxE);
  ok('返車予定が未定＝翌月には出さない', noneNx.inRange === false, noneNx);

  const late = await ask({ ...base, status: 'parts', returnDate: W.pvMid }, W.moS, W.moE);
  ok('返車予定日が過ぎている＝当月に寄せる', late.inRange === true, late);

  const lateOld = await ask({ ...base, status: 'parts', returnDate: W.pvMid }, W.pvS, W.pvE);
  ok('🔴 まだ返していない車は、締めた先月には出さない', lateOld.inRange === false, lateOld);
}

console.log('\n── 📋 予定・見込・予測も同じ物差し ──');
{
  const pl = await ask({ ...base, status: 'contact', returnDate: W.nxMid }, W.moS, W.moE);
  ok('予定（連絡中）も返車予定が翌月なら当月に出さない', pl.tier === 'planned' && pl.inRange === false, pl);

  const pr = await ask({ ...base, status: 'check', returnDate: W.nxMid }, W.moS, W.moE);
  ok('見込（点検待ち）も同じ', pr.tier === 'prospect' && pr.inRange === false, pr);

  const fc = await ask({ ...base, status: 'reserved', reserveDate: W.mid, returnDate: W.nxMid }, W.moS, W.moE);
  ok('予測（未入庫予約）も返車予定日が優先', fc.tier === 'forecast' && fc.date === W.nxMid && fc.inRange === false, fc);

  const fc2 = await ask({ ...base, status: 'reserved', reserveDate: W.mid, returnDate: '', estHoldDays: 2 }, W.moS, W.moE);
  ok('返車予定日が無い予約＝入庫日＋預かり日数で着地を見る', fc2.date > W.mid && fc2.inRange === true, fc2);

  const sc = await ask({ ...base, status: 'scrap', returnDate: W.mid }, W.moS, W.moE);
  ok('キャンセル（scrap）はどこにも数えない', sc.tier === null, sc);
}

console.log('\n── 📆 実績は「実績カウント日」で数える（返車日ではない） ──');
{
  const r = await ask({ ...base, status: 'returned', completedAt: W.mid, returnDate: W.pvMid, amountFinal: 120000 }, W.moS, W.moE);
  ok('🔴 返車日が先月でも、実績カウント日が当月なら当月の実績', r.date === W.mid && r.tier === 'actual' && r.inRange === true, r);

  const r2 = await ask({ ...base, status: 'returned', completedAt: W.pvMid, returnDate: W.mid }, W.moS, W.moE);
  ok('実績カウント日が先月なら当月には出さない', r2.inRange === false, r2);

  const r3 = await ask({ ...base, status: 'returned', completedAt: W.pvMid, returnDate: W.mid }, W.pvS, W.pvE);
  ok('実績は過去の月にそのまま残る（寄せない）', r3.inRange === true, r3);

  const r4 = await ask({ ...base, status: 'returned', returnDateFinal: W.mid }, W.moS, W.moE);
  ok('実績カウント日が無い古いデータは確定返車日で拾う', r4.date === W.mid && r4.inRange === true, r4);
}

console.log('\n── 📊 売上ビューの数字が実際に動く ──');
{
  const r = await p.evaluate(([W]) => {
    const keep = state.cards.slice();
    state.cards = [
      { id: 'SV1', resNo: 'R-SV1', customer: 'A', car: 'x', boardId: 'default', division: 'div1', workType: 'shaken', status: 'parts', amountOrder: 100000, returnDate: W.mid },
      { id: 'SV2', resNo: 'R-SV2', customer: 'B', car: 'y', boardId: 'default', division: 'div1', workType: 'shaken', status: 'parts', amountOrder: 500000, returnDate: W.nxMid },
      { id: 'SV3', resNo: 'R-SV3', customer: 'C', car: 'z', boardId: 'default', division: 'div1', workType: 'shaken', status: 'returned', amountFinal: 70000, completedAt: W.mid, returnDate: W.mid }
    ];
    window._svTab = 'sales'; window._svMode = 'month';
    const now = new Date(); window._svYM = { y: now.getFullYear(), m: now.getMonth() };
    renderSales();
    const cur = document.getElementById('view-sales-body').innerText;
    window._svYM = { y: now.getFullYear(), m: now.getMonth() + 1 };
    renderSales();
    const nxt = document.getElementById('view-sales-body').innerText;
    state.cards = keep;
    return { cur, nxt };
  }, [W]);
  /* 当月＝確定10万（1台）／翌月＝確定50万（1台） */
  ok('🔴 当月の「確定」は 10万・1台（50万の翌月ぶんは入らない）', /確定[\s\S]{0,20}1台[\s\S]{0,20}10万/.test(r.cur.replace(/\n/g, ' ')), r.cur.split('\n').slice(0, 40).join(' | '));
  ok('🔴 翌月を見ると「確定」に 50万・1台が出る', /確定[\s\S]{0,20}1台[\s\S]{0,20}50万/.test(r.nxt.replace(/\n/g, ' ')), r.nxt.split('\n').slice(0, 40).join(' | '));
  ok('当月の実績は 7万（実績カウント日で計上）', /実績[\s\S]{0,20}1台[\s\S]{0,20}7万/.test(r.cur.replace(/\n/g, ' ')), r.cur.split('\n').slice(0, 40).join(' | '));
}

console.log('\n── 🧭 他のビューも同じ物差しを通っている ──');
{
  const wired = await p.evaluate(() => {
    const src = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
    return {
      loadedBeforeUsers: src.findIndex(s => /sales-count\.js/.test(s)) < src.findIndex(s => /^js\/sales\.js/.test(s)),
      hasCount: typeof window.pitSalesCountDate === 'function',
      ver: document.querySelector('meta[name=app-version]').content
    };
  });
  ok('sales-count.js は使う側より先に読まれている', wired.loadedBeforeUsers === true, wired);
  ok('物差しが window に出ている', wired.hasCount === true, wired);
  /* ⚠ 版は上がっていくので数字を打ち込まない（v1.61.0 以降かどうかだけ見る） */
  const vnum = String(wired.ver || '').split('.').map(Number);
  ok('版が v1.61.0 以降になっている', vnum[0] > 1 || (vnum[0] === 1 && vnum[1] >= 61), wired);

  /* 画面を一通り開いて、エラーが出ないこと */
  for (const v of ['mydash', 'sales', 'maintdash', 'mechsummary']) {
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(150);
  }
  ok('ダッシュボード・売上・整備ダッシュ・メカ別を開いてもエラーなし', errs.length === 0, errs.slice(0, 5));
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
