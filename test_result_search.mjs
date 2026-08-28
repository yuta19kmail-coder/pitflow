/* ============================================================
   test_result_search.mjs
   実績ボードの検索の箱・ヒット一覧・光らせ方を見張る。

   きっかけ：ゆうた 2026-08-28
     「実績ボードに検索BOXを追加。検索するとBOXの下にヒットした一覧。
       その月にある場合は日付の数字or枠をハイライトにしてほしい」
     「来店履歴から実績をクリックして実績ビューにとんだときも同様」
     「+N件の表示で隠れているのもあるし、〇〇さんを見たいなと思っても
       その月にあるのが分かっていても探すのが一苦労になっちゃってる」

   いまの決めごと（v2.17.0）：
     ・探し方は search.js の `pitCardFields` 1本を借りる（実績側に書き写さない）
     ・集める集合はカレンダーと同じ（`_resultDayCards` と同じ条件）
     ・当たったカードはその日の**先頭**に出す＝ +N件 に隠れたままにしない
     ・行を押したら**その月へ飛んで光らせるだけ**（開くのは本人・ゆうた選択）
     ・🔴 並べ替えも光らせるのも画面の中だけ。件数も金額も1つも動かない

   使い方：
     python3 -m http.server 8967 --directory . &
     PORT=8967 node test_result_search.mjs
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const cp   = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = process.env.PORT || 8967;
let OK = 0, NG = 0;
function ok(name, cond, extra){
  if (cond) { OK++; console.log('  ✅ ' + name); }
  else { NG++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

/* ===== ① コードそのものを見る（物差しを書き写していないか） ===== */
console.log('\n── 🧭 物差しは1本か ──');
{
  const raw = fs.readFileSync(path.join(process.cwd(), 'js', 'result.js'), 'utf8');
  const js  = raw.replace(/\/\*[\s\S]*?\*\//g, '');          /* 自分のコメントに当たらないよう先に外す */
  ok('🔴 探す材料は search.js から借りている（pitCardBlob）', /pitCardBlob/.test(js));
  ok('🔴 当たった欄の名前も借りている（pitSearchWhere）', /pitSearchWhere/.test(js));
  ok('🔴 欄の表を実績側に書き写していない', !/'ナンバー'|"ナンバー"/.test(js), js.slice(0, 0));
  ok('🔴 カードに書き込む所が増えていない（PitDB.save を呼ばない）', !/PitDB\.save/.test(js));
  const se = fs.readFileSync(path.join(process.cwd(), 'js', 'search.js'), 'utf8');
  ok('search.js が pitCardFields / pitCardBlob を外へ出している',
     /window\.pitCardFields\s*=/.test(se) && /window\.pitCardBlob\s*=/.test(se));
  const vw = fs.readFileSync(path.join(process.cwd(), 'js', 'views.js'), 'utf8');
  ok('🔴 飛び先の月は実績の日で決める（pitResultDateOf を通す）', /pitResultDateOf/.test(vw));
  ok('🔴 飛び先の段もカードに合わせる（pitResultModeOf を通す）', /pitResultModeOf/.test(vw));
  const cu = fs.readFileSync(path.join(process.cwd(), 'js', 'customers.js'), 'utf8');
  ok('来店履歴の「実績ボード」がカードidを渡している', /pitGotoResultMonth\([\s\S]{0,200}?esc\(c\.id\)/.test(cu));
}

/* ===== ② 実際に描いて確かめる ===== */
const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.renderResult && window.showView', null, { timeout: 25000 });
await p.waitForTimeout(600);

/* 土台＝2026-05 に5件（うち1件だけ当たる・わざと**最後**に積む＝直す前なら +N件 に隠れる）
   ＋ 2026-04 に1件（別の月）＋ 非カウント側に1件（もう片方の段） */
await p.evaluate(() => {
  const mk = (id, date, name, extra) => Object.assign({
    id: id, resNo: 'T-' + id, status: 'returned', completedAt: date,
    reserveDate: date, returnDate: date, boardId: 'default',
    customer: name, car: 'テスト車', plate: '習志野 300 あ 11-11',
    workType: 'general', amountFinal: 10000
  }, extra || {});
  window.state.cards = (window.state.cards || []).filter(c => String(c.id).indexOf('RS-') !== 0);
  window.state.cards.push(mk('RS-1', '2026-05-12', 'あいうえ 一郎'));
  window.state.cards.push(mk('RS-2', '2026-05-12', 'かきくけ 二郎'));
  window.state.cards.push(mk('RS-3', '2026-05-12', 'さしすせ 三郎'));
  window.state.cards.push(mk('RS-4', '2026-05-12', 'たちつて 四郎'));
  window.state.cards.push(mk('RS-5', '2026-05-12', 'ゆうたろう 花子'));      /* ← これだけ当たる。5番目 */
  window.state.cards.push(mk('RS-6', '2026-04-20', 'ゆうたろう 太郎'));      /* 別の月 */
  window.state.cards.push(mk('RS-7', '2026-05-20', 'ゆうたろう 次郎', { noSale: true }));  /* 非カウント側 */
  window.state.resultMode = 'count';
  window.state.resultQ = ''; window.state.resultHit = null;
  window.state.resultMonth = new Date(2026, 4, 1);
  window.showView('result');
  window.renderResult();
});
await p.waitForTimeout(300);

/* カレンダーに出ている実績の総数（見えている分＋「+N件」）＝検索の前後で変わってはいけない */
const countAll = () => p.evaluate(() => {
  let seen = 0, more = 0;
  document.querySelectorAll('#result-cal .reserve-month-cell').forEach(cell => {
    seen += cell.querySelectorAll('.reserve-month-event').length;
    const m = cell.querySelector('.reserve-month-more');
    if (m) more += parseInt(String(m.textContent).replace(/[^0-9]/g, ''), 10) || 0;
  });
  return { seen: seen, more: more, all: seen + more };
});

console.log('\n── 🔎 検索の箱 ──');
{
  const has = await p.$('#result-search-bar #result-q');
  ok('実績ビューに検索の箱がある', !!has);
  const hits0 = await p.$eval('#result-hits', el => el.innerHTML.trim());
  ok('打つ前は一覧を出さない', hits0 === '');
  const before = await countAll();
  ok('土台＝5/12 に5件ある（3件＋「+2件」）', before.all >= 5, before);

  await p.fill('#result-q', 'ゆうたろう');
  await p.waitForTimeout(450);                       /* 打ち終わるまで待つ（pitTypeSoon 140ms） */

  const rows = await p.$$eval('.rs-hit', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok('箱の下にヒットした一覧が出る', rows.length === 2, rows);
  ok('🔴 別の月のものも一覧に出る（4/20）', rows.some(t => t.indexOf('4/20') === 0), rows);
  ok('この月のものも出る（5/12）', rows.some(t => t.indexOf('5/12') === 0), rows);
  ok('件数を出している', (await p.$eval('.rs-head', e => e.textContent)).indexOf('2件') >= 0);
  ok('この月の件数も出している', (await p.$eval('.rs-head', e => e.textContent)).indexOf('この月 1件') >= 0);
  ok('🔴 もう片方の段にある分を黙って落としていない',
     (await p.$$eval('.rs-other', els => els.map(e => e.textContent).join('|'))).indexOf('非カウント一覧に 1件') >= 0);

  const lit = await p.$$eval('#result-cal .reserve-month-cell.rs-day .day-num', els => els.map(e => e.textContent.trim()));
  ok('🔴 その月の当たった日の枠が光る（12日だけ）', lit.length === 1 && lit[0] === '12', lit);

  const shown = await p.$$eval('#result-cal .reserve-month-event', els => els.map(e => e.getAttribute('data-card-id')));
  ok('🔴 当たったカードが +N件 に隠れない（5番目でも枠に出る）', shown.indexOf('RS-5') >= 0, shown.filter(x => String(x).indexOf('RS-') === 0));
  const evOne = await p.$$eval('#result-cal .reserve-month-event.rs-ev', els => els.map(e => e.getAttribute('data-card-id')));
  ok('当たったカードに印が付く', evOne.length === 1 && evOne[0] === 'RS-5', evOne);
  const marked = await p.$eval('#result-cal .reserve-month-event.rs-ev', e => e.innerHTML.indexOf('<mark') >= 0);
  ok('当たった字を塗っている', marked);

  const after = await countAll();
  ok('🔴 探しても件数が1つも動かない', after.all === before.all, { before, after });
}

console.log('\n── 👆 一覧の行を押す＝その月へ飛んで光らせるだけ ──');
{
  /* 別の月（4/20）の行を押す */
  const idx = await p.$$eval('.rs-hit', els => els.findIndex(e => e.textContent.trim().indexOf('4/20') === 0));
  await p.$$eval('.rs-hit', (els, i) => els[i].click(), idx);
  await p.waitForTimeout(300);
  const mo = await p.evaluate(() => state.resultMonth.getMonth() + 1);
  ok('🔴 その月へ飛ぶ（4月）', mo === 4, mo);
  const one = await p.$$eval('#result-cal .reserve-month-cell.rs-day-one .day-num', els => els.map(e => e.textContent.trim()));
  ok('🔴 飛んだ先で日が光る（20日）', one.length === 1 && one[0] === '20', one);
  const hit = await p.evaluate(() => state.resultHit);
  ok('光らせている1件を覚えている', hit === 'RS-6', hit);
  const modal = await p.evaluate(() => !!document.querySelector('.modal-backdrop.show'));
  ok('🔴 押しただけでは予約詳細を開かない（ゆうた選択）', modal === false);
  ok('一覧は出たまま（続けて探せる）', (await p.$$('.rs-hit')).length === 2);

  /* 月を送ったら、光らせていた1件は外れる（語は残る） */
  await p.evaluate(() => window.nextMonth());
  await p.waitForTimeout(250);
  ok('月を送ると光は消える', (await p.evaluate(() => state.resultHit)) === null);
  ok('月を送っても探した語は残る', (await p.evaluate(() => state.resultQ)) === 'ゆうたろう');
  ok('5月に戻ってきて、また当たった日が光る',
     (await p.$$eval('#result-cal .reserve-month-cell.rs-day .day-num', els => els.map(e => e.textContent.trim()))).join(',') === '12');
}

console.log('\n── 🕘 来店履歴から飛んだ時も同じ ──');
{
  await p.evaluate(() => { state.resultMonth = new Date(2026, 7, 1); state.resultQ = ''; renderResult(); });
  await p.evaluate(() => window.pitGotoResultMonth('2026-05-12', 'RS-3'));
  await p.waitForTimeout(300);
  ok('その月へ飛ぶ（5月）', (await p.evaluate(() => state.resultMonth.getMonth() + 1)) === 5);
  const one = await p.$$eval('#result-cal .reserve-month-cell.rs-day-one .day-num', els => els.map(e => e.textContent.trim()));
  ok('🔴 その日が光る（12日）', one.length === 1 && one[0] === '12', one);
  const ev = await p.$$eval('#result-cal .reserve-month-event.rs-ev-one', els => els.map(e => e.getAttribute('data-card-id')));
  ok('🔴 そのカードも光る（+N件 に隠れない）', ev.length === 1 && ev[0] === 'RS-3', ev);
  ok('検索の語は持ち込まない', (await p.evaluate(() => state.resultQ)) === '');

  /* 段がちがうカード（非カウント）を渡したら、段ごと合わせる */
  await p.evaluate(() => window.pitGotoResultMonth('2026-05-20', 'RS-7'));
  await p.waitForTimeout(300);
  ok('🔴 段もそのカードが居る方へ合わせる（非カウント）', (await p.evaluate(() => state.resultMode)) === 'nocount');
  const one2 = await p.$$eval('#result-cal .reserve-month-cell.rs-day-one .day-num', els => els.map(e => e.textContent.trim()));
  ok('🔴 非カウント側でもその日が光る（20日）', one2.length === 1 && one2[0] === '20', one2);

  /* 実績の日（completedAt）が返車日と別の月なら、実績の日の月へ行く */
  await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'RS-2');
    c.returnDate = '2026-07-03';                 /* 返車日は7月／実績の日は5/12 のまま */
    state.resultMode = 'count';
    window.pitGotoResultMonth(c.returnDate, c.id);
  });
  await p.waitForTimeout(300);
  ok('🔴 返車日ではなく実績の日の月へ行く（5月）', (await p.evaluate(() => state.resultMonth.getMonth() + 1)) === 5);
  ok('🔴 そこで日が光る（12日）',
     (await p.$$eval('#result-cal .reserve-month-cell.rs-day-one .day-num', els => els.map(e => e.textContent.trim()))).join(',') === '12');
}

console.log('\n── 🗂 その日の全件ポップアップ ──');
{
  /* ⚠ 見本データにも 5/12 の実績が居ることがある＝件数を決め打ちしない。**探す前の数**と比べる。 */
  await p.evaluate(() => {
    state.resultMode = 'count'; state.resultMonth = new Date(2026, 4, 1); state.resultHit = null; state.resultQ = '';
    const i = document.getElementById('result-q'); if (i) i.value = '';
    renderResult();
  });
  const base = await p.evaluate(() => {
    pitResultDayPopup('2026-05-12');
    const n = document.querySelector('#pit-day-pop .pdp-list').children.length;
    if (window.pitReserveDayPopClose) pitReserveDayPopClose();
    return n;
  });
  await p.waitForTimeout(200);
  await p.fill('#result-q', 'ゆうたろう');
  await p.waitForTimeout(450);
  await p.evaluate(() => pitResultDayPopup('2026-05-12'));
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const box = document.querySelector('#pit-day-pop');
    return { hits: box.querySelectorAll('.pdp-hit').length,
             first: box.querySelector('.pdp-list').firstElementChild.className || '',
             n: box.querySelectorAll('.pdp-list > *').length,
             head: box.querySelector('.pdp-head span').textContent };
  });
  ok('🔴 当たったものが先頭に来る', r.first.indexOf('pdp-hit') >= 0, r);
  ok('当たったものに印が付く（1件）', r.hits === 1, r);
  ok('🔴 件数は1つも変わらない', r.n === base && r.head.indexOf(base + '件') >= 0, { r: r, base: base });
  await p.evaluate(() => { if (window.pitReserveDayPopClose) pitReserveDayPopClose(); });
  await p.waitForTimeout(200);
}

console.log('\n── 🧹 消したら元どおり ──');
{
  /* ⚠ 前の段の語が残っていると「元どおり」を測れない＝先に空にしてから土台を取る */
  await p.evaluate(() => {
    state.resultMode = 'count'; state.resultMonth = new Date(2026, 4, 1); state.resultHit = null; state.resultQ = '';
    const i = document.getElementById('result-q'); if (i) i.value = '';
    renderResult();
  });
  const base0 = await countAll();
  const order0 = await p.$$eval('#result-cal .reserve-month-event', els => els.map(e => e.getAttribute('data-card-id')).filter(x => String(x).indexOf('RS-') === 0));
  await p.fill('#result-q', 'ゆうたろう');
  await p.waitForTimeout(450);
  await p.click('#result-search-bar .rs-x');
  await p.waitForTimeout(300);
  ok('× で語が消える', (await p.evaluate(() => state.resultQ)) === '');
  ok('一覧も消える', (await p.$eval('#result-hits', el => el.innerHTML.trim())) === '');
  ok('光も消える', (await p.$$('#result-cal .reserve-month-cell.rs-day')).length === 0);
  const order1 = await p.$$eval('#result-cal .reserve-month-event', els => els.map(e => e.getAttribute('data-card-id')).filter(x => String(x).indexOf('RS-') === 0));
  ok('🔴 並びも元どおり（データを触っていない）', order0.join(',') === order1.join(','), { order0, order1 });
  ok('件数も元どおり', (await countAll()).all === base0.all);
  const dirty = await p.evaluate(() => state.cards.some(c => c && (c.resultHit !== undefined || c.rsHit !== undefined)));
  ok('🔴 カードに新しい印を書いていない', dirty === false);
}

console.log('\n── 🧯 JSエラー ──');
ok('JSエラーが1つも出ていない', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log('\n===== ' + OK + ' OK / ' + NG + ' NG =====');
process.exit(NG ? 1 : 0);
