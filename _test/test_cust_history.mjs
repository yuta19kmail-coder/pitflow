/* ============================================================
   test_cust_history.mjs
   🕘 v2.11.0 来店履歴の画面（顧客詳細の行／広い履歴画面／左サイドバー）

   きっかけ：ゆうた 2026-08-25
     「タイトルに … **<i data-ic=van data-ics=16></i>代車（F56白） 7/31〜8/7**
      とコードの一部が出ちゃってる」
     「顧客の詳細、車が並んでるところの下部の**今の返車済みと記載があってクリック出来る所に
      「履歴」ボタンに入れ替える**」
     「**返車済みはBOX自体をもう1行足して**そこに細かいバッチ類や返車済み等情報を羅列」
     「あと**履歴の1BOXにナンバーの記載は要らない**。車種・担当者・代車 でいい」
     「履歴画面自体は今**ワイドがかなりなくてスクロールが入っちゃってる**。もっと広げてほしい」
     「また**左側にサイドバーを付けて履歴全体を横断**できるように」
     「サイドバーには**顧客全体でみるのか、車両で見るのかのソートボタン**も搭載」
     「**車体番号の記載が小さい**（顧客の車両BOXの中）」

   🔴 いちばん大事な見張り
     `esc()` は**中の値だけ**に掛ける。HTMLを丸ごと包むと `<i data-ic=van>` が
     そのまま文字で出る（＝ゆうたが見た「コードの一部」）。

   使い方：
     node /tmp/srv.js &            ← 8991
     NODE_PATH=... node test_cust_history.mjs
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let OK = 0, NG = 0;
const ok = (n, c, x) => { if (c) { OK++; console.log('  ✅ ' + n); }
                          else { NG++; console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
/* 🔴 自分のコメントに正規表現が当たる事故を何度もやっているので、必ず先に外す */
const bare = f => fs.readFileSync(path.join(process.cwd(), f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

console.log('\n── 🔍 コードの決めごと ──');
{
  const js = bare('js/customers.js');
  const css = fs.readFileSync(path.join(process.cwd(), 'css', 'customer-detail.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  /* 🔴 HTML を丸ごと esc しない（タグが文字で出る） */
  ok('🔴 HTMLの入った変数を esc() で丸ごと包んでいない', !/esc\(loa\)|esc\(tags\)|esc\(stBadge\)/.test(js),
     (js.match(/esc\((loa|tags|stBadge)\)/g) || []));
  ok('🕘 履歴の覚えが1つある（_hist）', /var _hist = \{ custId/.test(js));
  ok('🔀 見る範囲の切替がある（この車／お客様ぜんぶ）',
     /w?indow\.custHistMode/.test(js) && /custHistVeh/.test(js));
  ok('🔴 拾う決まりは今までどおり（_cardDone）', /\.filter\(_cardDone\)/.test(js));
  ok('📋 顧客詳細の行に「履歴」ボタンがある', /class="cd-hhist"/.test(js));
  ok('🔴 顧客詳細の行にナンバーを出していない', !/'<div class="cd-hmid">[^;]*c\.plate\?' ・ '/.test(js));
  ok('🏷 札は2行目にまとめている（cd-htags）', /class="cd-htags"/.test(js));
  ok('🚗 車体番号にラベルが付いている', /class="cd-vvin"><i>車体番号<\/i>/.test(js));
  const vin = (css.match(/\.cd-vvin\{[^}]*\}/) || [''])[0];
  ok('🔴 車体番号が小さくない（13px以上）', /font-size:\s*(1[3-9]|[2-9]\d)px/.test(vin), vin);
  const box = (css.match(/\.cm-box\.ch-box\{[^}]*\}/) || [''])[0];
  ok('🔴 履歴の画面が広い（1000px以上）', /width:\s*(1[0-9]{3,})px/.test(box), box);
  ok('🔴 履歴の画面が2列（左サイドバー）', /\.ch-wrap\{[^}]*grid-template-columns:\s*\d+px/.test(css));
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text().slice(0, 200)); });
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.custHistory && window.custOpen && window.state', null, { timeout: 25000 });
await p.waitForTimeout(700);

/* 3台・代車つき・保険つきの実績を作る */
const fx = await p.evaluate(() => {
  const cs = state.customers || [];
  let best = null;
  cs.forEach(c => { if (!best && (c.vehicles || []).filter(v => v && v.plate).length >= 3) best = c; });
  if (!best) return { なし: true };
  const L = (state.loaners || [])[0];
  best.vehicles[0].vin = 'WMWSX52040T287529';
  (best.vehicles || []).slice(0, 3).forEach((v, i) => {
    for (let k = 0; k < 2; k++){
      const d = '2026-0' + (7 + k) + '-1' + (i + 2);
      state.cards.push({ id:'HX' + i + k, resNo:'R' + i + k, status:'returned', plate:v.plate,
        customer:best.name, car:v.car || 'テスト車', boardId:'default',
        completedAt:d, returnDate:d, returnDateFinal:d, reserveDate:d, salesDate:d,
        amountFinal:80000 + i * 10000 + k * 3000, frontStaff:'菅谷 拓生',
        workType:'shaken', workAddons:(k ? ['bp'] : []), workTypes:(k ? ['shaken','bp'] : ['shaken']),
        workSpecials:(k ? ['insurance'] : []), menu:'12ヶ月点検・オイル交換',
        needLoaner:(k === 0), loanerId:(L ? L.id : ''), loanerFrom:'2026-07-31', loanerTo:'2026-08-07' });
    }
  });
  return { id: best.id, vid: best.vehicles[0].id, plate: best.vehicles[0].plate, 台: best.vehicles.length };
});
ok('（用意）3台ぶんの実績を作れた', !fx.なし, fx);

console.log('\n── 📋 顧客詳細の来店履歴の行 ──');
{
  await p.evaluate(id => { showView('customers'); custOpen(id); }, fx.id);
  await p.waitForTimeout(700);
  const r = await p.evaluate((plate) => {
    const row = document.querySelector('.cd-hist .cd-hrow');
    return {
      行がある: !!row,
      html: row ? row.innerHTML : '',
      文字: row ? row.textContent : '',
      履歴ボタン: !!(row && row.querySelector('.cd-hhist')),
      札の行: !!(row && row.querySelector('.cd-htags')),
      札: row ? [].slice.call(row.querySelectorAll('.cd-htag')).map(x => x.textContent.trim()) : [],
      /* ⚠ 代車は k=0 の行だけ。**代車がある行**を探して見る（先頭の行には無い） */
      代車アイコン: (function(){
        const el = document.querySelector('.cd-hist .cd-loa');
        return !!(el && (el.querySelector('svg') || el.querySelector('i')));
      })(),
      代車の文字: (function(){ const el = document.querySelector('.cd-hist .cd-loa');
        return el ? el.textContent : '(代車の行なし)'; })(),
      ナンバー: row ? row.textContent.indexOf(plate) >= 0 : false,
      車体番号の大きさ: (function(){ const e = document.querySelector('.cd-vvin');
        return e ? Math.round(parseFloat(getComputedStyle(e).fontSize)) : 0; })(),
      車体番号にラベル: !!document.querySelector('.cd-vvin i')
    };
  }, fx.plate);
  ok('来店履歴の行が出る', r.行がある === true);
  ok('🔴🔴 タグがそのまま文字で出ていない（<i data-ic= が見えない）',
     r.文字.indexOf('data-ic') < 0 && r.文字.indexOf('<i ') < 0, r.文字.slice(0, 160));
  ok('🔴 代車はアイコンとして出ている（コードが文字で出ない）',
     r.代車アイコン === true && r.代車の文字.indexOf('data-ic') < 0, r.代車の文字);
  ok('🔴 右の押せる所が「履歴」ボタン', r.履歴ボタン === true);
  ok('🔴 札は2行目にまとまっている', r.札の行 === true);
  ok('　札に状態が入っている', r.札.some(x => /返車|完了|売上なし|キャンセル/.test(x)), r.札);
  ok('　札に保険が入っている', r.札.indexOf('保険') >= 0, r.札);
  ok('🔴 行にナンバーを出していない（車種・担当・代車でいい）', r.ナンバー === false, r.文字.slice(0, 160));
  ok('🚗 車体番号が13px以上', r.車体番号の大きさ >= 13, r.車体番号の大きさ);
  ok('🚗 車体番号にラベルが付いている', r.車体番号にラベル === true);
}

console.log('\n── 🕘 履歴の画面（広い・左サイドバー） ──');
{
  await p.evaluate(([c, v]) => custHistory(c, v), [fx.id, fx.vid]);
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const box = document.querySelector('.cm-box.ch-box');
    const side = document.querySelector('.ch-side');
    const main = document.querySelector('.ch-main');
    return {
      幅: box ? Math.round(box.getBoundingClientRect().width) : 0,
      サイドバー: !!side,
      切替の数: document.querySelectorAll('.ch-mb').length,
      車の数: document.querySelectorAll('.ch-car').length,
      行の数: document.querySelectorAll('.ch-row').length,
      横スクロール: main ? (main.scrollWidth > main.clientWidth + 1) : true,
      文字: main ? main.textContent : ''
    };
  });
  ok('🔴 画面が広い（1000px以上）', r.幅 >= 1000, r.幅);
  ok('🔴 左にサイドバーがある', r.サイドバー === true);
  ok('🔴 切替が2つ（この車／お客様ぜんぶ）', r.切替の数 === 2, r.切替の数);
  ok('🔴 サイドバーに車が並ぶ（横断できる）', r.車の数 >= 3, r.車の数);
  ok('🔴 本文に横スクロールが出ていない', r.横スクロール === false);
  ok('🔴🔴 ここでもタグが文字で出ていない', r.文字.indexOf('data-ic') < 0, r.文字.slice(0, 160));
  ok('この車だけ＝2件', r.行の数 === 2, r.行の数);
}

console.log('\n── 🔀 お客様ぜんぶ で横断できる ──');
{
  const r = await p.evaluate(() => {
    custHistMode('cust');
    const rows = [].slice.call(document.querySelectorAll('.ch-row'));
    const dts = rows.map(x => (x.querySelector('.ch-dt') || {}).textContent || '');
    return { 行: rows.length, 日付: dts,
             新しい順: dts.slice().sort().reverse().join() === dts.join(),
             ナンバーが出る: rows.some(x => !!x.querySelector('.ch-plate')),
             切替が光る: (document.querySelectorAll('.ch-mb.on')[0] || {}).textContent === 'お客様ぜんぶ' };
  });
  ok('🔴 3台ぶんが混ざる（6件）', r.行 === 6, r.行);
  ok('🔴 日付の新しい順', r.新しい順 === true, r.日付);
  ok('🔴 どの車かが分かる（ナンバーを出す）', r.ナンバーが出る === true);
  ok('切替の光り方が合っている', r.切替が光る === true);
  const back = await p.evaluate(() => { custHistMode('veh'); return document.querySelectorAll('.ch-row').length; });
  ok('「この車」に戻せる', back === 2, back);
}

console.log('\n── 🧭 まわり ──');
{
  ok('エラーなし', errs.length === 0, errs.slice(0, 3));
  const ver = await p.evaluate(() => (document.querySelector('meta[name=app-version]') || {}).content || '');
  /* 🔴 版くらべは数で（'2.10.0' < '2.9.6' の事故を 2026-08-25 に踏んだ） */
  const vn = (String(ver).match(/\d+/g) || []).map(Number);
  const need = '2.11.0'.split('.').map(Number);
  const ge = (a, b) => (a[0]||0) !== (b[0]||0) ? (a[0]||0) > (b[0]||0)
                     : (a[1]||0) !== (b[1]||0) ? (a[1]||0) > (b[1]||0)
                     : (a[2]||0) >= (b[2]||0);
  ok('版が v2.11.0 以降', ge(vn, need), ver);
}

await b.close();
console.log('\n' + (NG ? '⚠ ' : '🎉 ') + OK + ' OK / ' + NG + ' NG');
process.exit(NG ? 1 : 0);
