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
  ok('🔀 見る範囲の切替がある（この車／お客様ぜんぶ）', /w?indow\.custHistMode/.test(js));
  /* 🔖 v2.12.1 左は伝票1件ごとの目次。飛ばし方は1本（_histJump）。 */
  ok('🔖 v2.12.1 左の目次から飛ぶ入口がある（custHistGo）', /w?indow\.custHistGo/.test(js));
  ok('🔴 飛ばし方は1本（_histJump）',
     /function _histJump\(id\)/.test(js) && (js.match(/_histJump\(/g) || []).length >= 3, // 定義＋開いた時＋目次
     (js.match(/_histJump\(/g) || []).length);
  ok('🚗 車のBOXはもう出さない', !/ch-car"/.test(js) && !/class="ch-cars/.test(js));
  ok('🔴 伝票の目印に伝票番号を使わない（"00" が重なる）', !/id="dnp'\+esc\(String\(den\.伝票番号/.test(js));
  ok('🔴 拾う決まりは今までどおり（_cardDone）', /\.filter\(_cardDone\)/.test(js));
  ok('📋 行のボタンの作り方が1本（_histBtns）', /function _histBtns\(c, opt\)/.test(js));
  ok('🔴 v2.11.1 状態の札は押させない（飛び先はボタン）',
     !/cd-htag st[^"]*clickable/.test(js) && /実績ボード/.test(js) && /予約表/.test(js));
  ok('🧾 v2.11.1 伝票の開け閉めは無い（最初から開く）', !/custDenToggle/.test(js));
  ok('🔘 v2.11.2 カードから開く入口が1本（custHistoryForCard）', /w?indow\.custHistoryForCard/.test(js));
  ok('🧾 v2.11.2 伝票は予約番号で引く（ナンバーが無くても紐づく）',
     /予約番号\|\|''\)\.trim\(\)===res/.test(js) && /\(list\(\)\|\|\[\]\)\.some/.test(js));
  ok('🔴 v2.11.2 車に紐づかないカードは「1件だけ」で出す', /_hist\.only/.test(js));
  const cv = bare('js/card-view.js');
  ok('🔴 v2.11.2 ボタンの名前は「作業履歴」', /> 作業履歴<\/button>/.test(cv));
  ok('🔴 v2.11.2 ナンバーの有無で出し分けない', !/pitIsRealPlate\(c\.plate\)\)\{[\s\S]{0,200}custHistory/.test(cv));
  ok('🔴 顧客詳細の行にナンバーを出していない', !/'<div class="cd-hmid">[^;]*c\.plate\?' ・ '/.test(js));
  /* 🕘 v2.11.2 2行に戻したので、印は**1行目の後ろ**に並べる（`cd-htags` の行は無くした） */
  ok('🏷 印は1行目の後ろに並べる（cd-htag）', /class="cd-htag/.test(js) && !/class="cd-htags"/.test(js));
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
      履歴ボタン: !!(row && [].slice.call(row.querySelectorAll('.cd-b')).some(x=>/履歴/.test(x.textContent))),
      実績ボタン: !!(row && [].slice.call(row.querySelectorAll('.cd-b')).some(x=>/実績ボード/.test(x.textContent))),
      状態は押せない: !(row && row.querySelector('.cd-htag.clickable')),
      札の高さ: row ? [].slice.call(row.querySelectorAll('.cd-htag')).map(x=>Math.round(x.getBoundingClientRect().height)) : [],
      /* v2.11.2 */
      行が押せる: !!(row && row.classList.contains('clickable')),
      予約番号が日付の下: !!(row && row.querySelector('.cd-hdt .cd-hres')),
      返車済みの札がない: row ? row.textContent.indexOf('返車') < 0 : false,
      本文の行数: row ? row.querySelectorAll('.cd-hmid > div').length : 0,
      ボタンにアイコンが無い: row ? [].slice.call(row.querySelectorAll('.cd-hbtns .cd-b')).every(x=>!x.querySelector('svg')) : false,
      ボタンが上下: (function(){
        if(!row) return false;
        const bs=[].slice.call(row.querySelectorAll('.cd-hbtns .cd-b'));
        if(bs.length<2) return false;
        return bs[1].getBoundingClientRect().top > bs[0].getBoundingClientRect().bottom - 2;
      })(),
      金額とボタンの縦: (function(){
        if(!row) return null;
        const a=row.querySelector('.cd-hamt'), b2=row.querySelector('.cd-hbtns');
        if(!a||!b2) return null;
        const ra=a.getBoundingClientRect(), rb=b2.getBoundingClientRect();
        return Math.abs((ra.top+ra.bottom)/2 - (rb.top+rb.bottom)/2);
      })(),
      札の行: !!(row && row.querySelector('.cd-hl1 .cd-htag')),
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
  ok('🔴 右に「履歴」ボタンがある', r.履歴ボタン === true);
  ok('🔴 「実績ボード」が別ボタンで並んでいる', r.実績ボタン === true);
  ok('🔴 状態の札は押させない', r.状態は押せない === true);
  ok('🔴 札の大きさがそろっている', r.札の高さ.length === 0 || new Set(r.札の高さ).size === 1, r.札の高さ);
  ok('🔴 v2.11.2 行ぜんぶを押すと予約詳細', r.行が押せる === true);
  ok('🔴 v2.11.2 日付の下に予約番号', r.予約番号が日付の下 === true);
  ok('🔴 v2.11.2 「返車済み」の札は出さない', r.返車済みの札がない === true);
  ok('🔴 v2.11.2 本文は2行（車種の行＋メモの行）', r.本文の行数 <= 2, r.本文の行数);
  ok('🔴 v2.11.2 ボタンにアイコンを付けない', r.ボタンにアイコンが無い === true);
  ok('🔴 v2.11.2 ボタンは上下に並ぶ', r.ボタンが上下 === true);
  ok('🔴 金額とボタンの縦がそろっている（2px以内）', r.金額とボタンの縦 != null && r.金額とボタンの縦 <= 2, r.金額とボタンの縦);
  ok('🔴 印は1行目の後ろに並んでいる', r.札の行 === true);
  ok('　印に保険が入っている', r.札.indexOf('保険') >= 0, r.札);
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
      目次の数: document.querySelectorAll('.ch-ix').length,
      目次に車種: document.querySelectorAll('.ch-ix-c').length,
      車のBOX: document.querySelectorAll('.ch-car').length,
      行の数: document.querySelectorAll('.ch-row').length,
      横スクロール: main ? (main.scrollWidth > main.clientWidth + 1) : true,
      サイドの横スクロール: side ? (side.scrollWidth > side.clientWidth + 1) : true,
      文字: main ? main.textContent : ''
    };
  });
  ok('🔴 画面が広い（1000px以上）', r.幅 >= 1000, r.幅);
  ok('🔴 左にサイドバーがある', r.サイドバー === true);
  ok('🔴 切替が2つ（この車／お客様ぜんぶ）', r.切替の数 === 2, r.切替の数);
  ok('🔖 v2.12.1 目次は**伝票1件ごと**＝本文の行と同じ数', r.目次の数 === r.行の数, r);
  ok('🚗 v2.12.1 車のBOXはもう無い', r.車のBOX === 0, r.車のBOX);
  ok('🔴「この車」の間は目次に車種を出さない（全部おなじ車だから）', r.目次に車種 === 0, r.目次に車種);
  ok('🔴 目次に横スクロールが出ていない', r.サイドの横スクロール === false);
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
    const ix = [].slice.call(document.querySelectorAll('.ch-ix'));
    return { 行: rows.length, 日付: dts,
             新しい順: dts.slice().sort().reverse().join() === dts.join(),
             ナンバーが出る: rows.some(x => !!x.querySelector('.ch-plate')),
             目次: ix.length,
             目次の日付: ix.map(x => (x.querySelector('.ch-ix-d') || {}).textContent || ''),
             目次に車種: ix.filter(x => !!x.querySelector('.ch-ix-c')).length,
             切替が光る: (document.querySelectorAll('.ch-mb.on')[0] || {}).textContent === 'お客様ぜんぶ' };
  });
  ok('🔴 3台ぶんが混ざる（6件）', r.行 === 6, r.行);
  ok('🔴 日付の新しい順', r.新しい順 === true, r.日付);
  ok('🔴 どの車かが分かる（ナンバーを出す）', r.ナンバーが出る === true);
  ok('切替の光り方が合っている', r.切替が光る === true);
  ok('🔖 目次も一緒に入れ替わる（6件）', r.目次 === 6, r.目次);
  ok('🔖 目次の並びは本文と同じ', r.目次の日付.join() === r.日付.join(), { 目次:r.目次の日付, 本文:r.日付 });
  ok('🔴「お客様ぜんぶ」の時だけ目次に車種を出す', r.目次に車種 === 6, r.目次に車種);
  /* 🔖 目次を押したら、その1件まで動いて、そこだと分かる */
  const 飛び = await p.evaluate(async () => {
    const main = document.querySelector('.ch-main');
    main.scrollTop = 0;
    const b = document.querySelectorAll('.ch-ix')[4];
    const id = (b.getAttribute('onclick') || '').replace(/^.*custHistGo\('/, '').replace(/'.*$/, '');
    b.click();
    await new Promise(r => setTimeout(r, 200));
    /* ⚠ 中身が短くて動かせない時は 0 のままが正しい。「動いた」ではなく**狙った所に居る**かを見る。 */
    const el = document.getElementById(id);
    const 狙い = Math.min(Math.max(0, el.offsetTop - main.offsetTop - 8),
                          Math.max(0, main.scrollHeight - main.clientHeight));
    return { 動いた: Math.abs(main.scrollTop - 狙い) <= 1,
             ここ: (document.querySelectorAll('.ch-item.is-here').length === 1)
                && document.querySelector('.ch-item.is-here').id === id,
             目次が光る: document.querySelectorAll('.ch-ix.on').length === 1,
             開き直していない: document.querySelectorAll('.ch-ix').length === 6 };
  });
  ok('🔖 押した1件の所まで動く', 飛び.動いた === true, 飛び);
  ok('🔖 押した1件だけが「ここ」になる', 飛び.ここ === true, 飛び);
  ok('🔖 目次のその行だけが光る', 飛び.目次が光る === true, 飛び);
  ok('🔴 押しても画面を開き直さない（跳ねない）', 飛び.開き直していない === true, 飛び);
  const back = await p.evaluate(() => { custHistMode('veh'); return document.querySelectorAll('.ch-row').length; });
  ok('「この車」に戻せる', back === 2, back);
}

console.log('\n── 🧾 ナンバーが無いカードでも「作業履歴」が開く ──');
{
  const r = await p.evaluate(() => {
    /* 伝票だけ在って、ナンバーが無いカード（仮登録車両） */
    const cu = state.customers[0];
    const v = (cu.vehicles || [])[0];
    v.伝票 = (v.伝票 || []).concat([{ 予約番号:'NOPLATE1', 伝票番号:'0708', 売上日:'2026-08-17',
      金額:32850, 原価:7810, 消費税:3285, 伝票計:36135, 法定:[],
      明細:[{ 種:'作業', 名:'点検', 区分:'点検', 数量:1, 単価:0, 金額:32850, 原価:7810 }],
      フロント:'小林モータース', 入れた日:'2026-08-25' }]);
    state.cards.push({ id:'NOPLATE', resNo:'NOPLATE1', status:'returned', plate:'仮登録車両',
      customer:'Faithful auto', car:'', boardId:'default',
      completedAt:'2026-08-17', returnDate:'2026-08-17', returnDateFinal:'2026-08-17',
      reserveDate:'2026-08-17', salesDate:'2026-08-17', amountFinal:32850, frontStaff:'小林モータース',
      workType:'general', workTypes:['general'], workSpecials:[] });
    custHistoryForCard('NOPLATE');
    const box = document.querySelector('.cm-box.ch-box');
    return {
      開いた: !!box,
      題: (document.querySelector('.cm-head') || {}).textContent || '',
      行: document.querySelectorAll('.ch-row').length,
      切替を出さない: document.querySelectorAll('.ch-mb').length === 0,
      伝票が出る: !!document.querySelector('.ch-den'),
      伝票番号: (document.querySelector('.ch-den-h i') || {}).textContent || ''
    };
  });
  ok('🔴 ナンバーが無くても開く', r.開いた === true);
  ok('🔴 題は「作業履歴」', /作業履歴/.test(r.題), r.題);
  ok('🔴 1件なら1件', r.行 === 1, r.行);
  ok('🔴 押しても変わらない切替は出さない', r.切替を出さない === true);
  ok('🔴🔴 伝票は予約番号で紐づくので出る', r.伝票が出る === true);
  ok('　その伝票番号が合っている', /0708/.test(r.伝票番号), r.伝票番号);
}

/* ================================================================
   💴 v2.12.2 金額の言い方（ゆうた「左上の計に（抜き）」「下の計の下に税込み計」）
   🔴 見出しは `pitQDenHead` 1本。伝票の足は 税抜 →（税込）→（伝票計）。
   ⚠ 消費税が分からない伝票では**税込を出さない**（税抜＝税込に見えるのは嘘）。
   ================================================================ */
console.log('\n── 💴 伝票の金額の言い方 ──');
{
  const js = bare('js/customers.js');
  ok('🔴 見出しを書き写していない（pitQDenHead を呼ぶ）',
     /pitQDenHead\(den\)/.test(js) && !/ch-den-h"><b>/.test(js));

  const r = await p.evaluate(async () => {
    const cu = state.customers[0], v = cu.vehicles[0];
    /* ① 法定費用あり（車検）② 法定なし ③ 消費税が分からない古い伝票 */
    v.伝票 = [
      { 予約番号:'', 伝票番号:'A1', 売上日:'2026-08-10', 金額:98960, 原価:40000,
        消費税:9896, 伝票計:161906,
        法定:[{名:'自賠責保険',金額:17650},{名:'重量税',金額:32800},{名:'印紙代',金額:2600}],
        明細:[{種:'作業',名:'車検基本料',区分:'点検',数量:1,単価:98960,金額:98960,原価:40000}] },
      { 予約番号:'', 伝票番号:'A2', 売上日:'2026-08-09', 金額:20000, 原価:5000,
        消費税:2000, 伝票計:22000, 法定:[],
        明細:[{種:'部品',名:'オイル',区分:'オイル',数量:1,単価:20000,金額:20000,原価:5000}] },
      { 予約番号:'', 伝票番号:'A3', 売上日:'2026-08-08', 金額:10000, 原価:3000,
        法定:[], 明細:[{種:'作業',名:'点検',区分:'点検',数量:1,単価:10000,金額:10000,原価:3000}] }
    ];
    custHistory(cu.id, v.id);
    await new Promise(r => setTimeout(r, 300));
    const it = [].slice.call(document.querySelectorAll('.ch-item'));
    const 足 = e => [].slice.call(e.querySelectorAll('tfoot tr'))
      .map(tr => [].slice.call(tr.querySelectorAll('th')).map(x => x.textContent.trim()).filter(Boolean).join(' '));
    return {
      抜き: [].slice.call(document.querySelectorAll('.ch-den-h .den-nuki')).map(x => x.textContent),
      見出し: (it[0].querySelector('.ch-den-h') || {}).textContent || '',
      法定あり: 足(it[0]), 法定なし: 足(it[1]), 税不明: 足(it[2])
    };
  });
  ok('🔴 左上の計に「（抜き）」が付く（3枚とも）',
     r.抜き.length === 3 && r.抜き.every(x => x === '（抜き）'), r.抜き);
  ok('　見出しは 金額（抜き）・原価・粗利・法定・伝票番号',
     /98,960円（抜き）/.test(r.見出し) && /原価/.test(r.見出し) && /粗利/.test(r.見出し)
     && /法定費用 53,050円/.test(r.見出し) && /伝票 A1/.test(r.見出し), r.見出し);
  ok('🔴 法定あり＝税抜・税込・伝票計の3行',
     r.法定あり.length === 3
     && /売上（税抜）.*98,960/.test(r.法定あり[0])
     && /売上（税込）.*108,856/.test(r.法定あり[1])
     && /伝票計（請求）.*161,906/.test(r.法定あり[2]), r.法定あり);
  ok('🔴 法定なし＝2行（同じ数を2回並べない）',
     r.法定なし.length === 2 && /売上（税込）.*22,000/.test(r.法定なし[1]), r.法定なし);
  ok('🔴 消費税が分からない伝票は税込を出さない（嘘をつかない）',
     r.税不明.length === 1 && /売上（税抜）.*10,000/.test(r.税不明[0]), r.税不明);
}

console.log('\n── 🧭 まわり ──');
{
  ok('エラーなし', errs.length === 0, errs.slice(0, 3));
  const ver = await p.evaluate(() => (document.querySelector('meta[name=app-version]') || {}).content || '');
  /* 🔴 版くらべは数で（'2.10.0' < '2.9.6' の事故を 2026-08-25 に踏んだ） */
  const vn = (String(ver).match(/\d+/g) || []).map(Number);
  const need = '2.11.2'.split('.').map(Number);
  const ge = (a, b) => (a[0]||0) !== (b[0]||0) ? (a[0]||0) > (b[0]||0)
                     : (a[1]||0) !== (b[1]||0) ? (a[1]||0) > (b[1]||0)
                     : (a[2]||0) >= (b[2]||0);
  ok('版が v2.11.2 以降', ge(vn, need), ver);
}

await b.close();
console.log('\n' + (NG ? '⚠ ' : '🎉 ') + OK + ' OK / ' + NG + ' NG');
process.exit(NG ? 1 : 0);
