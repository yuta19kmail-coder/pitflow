/* PitFlow v1.76.0 ── 新規予約画面の入力チェック（赤＝必須 ／ 黄＝入れたほうがいい）
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-10）
     ・入力チェックの内容変更。**黄色枠も追加**＝「入れなくてもいいが入るのでは？」みたいな内容
     ・漢字名前は黄色で **カナは赤枠** ／ **初回リピーター 赤** ／ **入庫日 赤**
     ・**入庫時間 黄色** ／ **作業内容 黄色**
     ・**赤枠が埋まっていない場合はエラーで保存禁止。どこがダメか伝えて、再入力を促す**
     ・（追加で確認）**TEL は赤のまま／国産・輸入・メーカー・車種は黄色へ**
     ・（追加で確認）**止めるのはすべての保存**（仮予約・承認に回す・入庫中に保存 も含む）
     ・（追加で確認）**黄だけなら1回だけ聞いて通す**
   ◎ここで見張ること
     🔴 赤と黄の**振り分けが指定どおり**
     🔴 赤が残っていたら**どの保存でも止まる**（＝カードが増えない）
     🔴 止めた時に**どこがダメかを名前で伝える**
     🔴 黄だけなら**1回聞いて、OKなら保存できる**
   ◎使い方
     python3 -m http.server 8983      ← 別ウィンドウ
     node test_card_check.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8983;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
const native = [];
p.on('dialog', async d => { native.push(d.message()); await d.dismiss().catch(() => {}); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.openNewReserve && window.pitCardCheck', null, { timeout: 25000 });
await p.waitForTimeout(700);

/* ⚠ 保存の直後は「＋新規予約」が流れ弾よけで効かない（pitJustSaved）。
   試験では 800ms 待ってから開く＝本物の作りをすり抜けない。 */
const newCard = async () => {
  await p.waitForTimeout(800);
  await p.evaluate(() => { state.cards = []; openNewReserve(); });
  return true;
};
const keys = (cls) => p.evaluate(c => Array.from(document.querySelectorAll('#view-card .' + c)).map(e => e.dataset.key), cls);
const dlgOpen = () => p.locator('#uid-ok:visible').count();
const dlgText = () => p.evaluate(() => { const e = document.querySelector('#uid-ok'); return e ? e.closest('div').parentElement.innerText.replace(/\n/g, ' / ') : ''; });
/* 保存されたカード（下書きが外れたもの）の数 */
const savedCount = () => p.evaluate(() => (state.cards || []).filter(c => !c._draft).length);

console.log('\n── 🎨 空のカードで入力チェックを押す ──');
{
  await newCard(); await p.waitForTimeout(800);
  await p.evaluate(() => pitCardCheck());
  await p.waitForTimeout(400);
  const red = await keys('cf-miss'), yellow = await keys('cf-warn');

  /* 🔴 ゆうた指定の振り分け（入庫日は開いた時に今日が入るので、ここでは出ない＝別で確かめる） */
  ['kana', 'repeat', 'tel', 'dropType', 'workType'].forEach(k => {
    ok('🔴 赤：' + k, red.indexOf(k) >= 0, { red, yellow });
  });
  ['customer', 'boardId', 'maker', 'car', 'reserveTime', 'menu'].forEach(k => {
    ok('🟡 黄：' + k, yellow.indexOf(k) >= 0, { red, yellow });
  });
  ok('🔴 漢字の名前（customer）は赤ではない', red.indexOf('customer') < 0, red);
  ok('🔴 国産／輸入・メーカー・車種は赤ではない',
     red.indexOf('boardId') < 0 && red.indexOf('maker') < 0 && red.indexOf('car') < 0, red);
  ok('赤と黄が同じ欄に同時に付いていない', red.every(k => yellow.indexOf(k) < 0), { red, yellow });
}

console.log('\n── 📅 入庫日を空にすると赤になる ──');
{
  await p.evaluate(() => {
    const c = state.cards[state.cards.length - 1];
    c.reserveDate = '';
    pitCardCheck();
  });
  await p.waitForTimeout(400);
  ok('🔴 入庫日が空なら赤', (await keys('cf-miss')).indexOf('reserveDate') >= 0, await keys('cf-miss'));
}

console.log('\n── 🚫 赤が残っていたら、どの保存でも止まる（ゆうた指定） ──');
{
  const saves = [
    ['印刷して保存',       () => pitSaveAndPrint()],
    ['予約保存のみ',       () => pitSaveCard()],
    ['仮予約で保存',       () => pitSaveTentative()],
    ['承認に回して保存',   () => pitSaveApproval()],
    ['入庫中に保存のみ',   () => pitSaveInWork(false)],
    ['入庫中に印刷して保存', () => pitSaveInWork(true)]
  ];
  for (const [name, fn] of saves){
    await newCard(); await p.waitForTimeout(700);
    /* 「中身が空」の道に落ちないように、名前だけ入れておく（赤はまだ残っている） */
    await p.evaluate(() => { const c = state.cards[state.cards.length - 1]; c.customer = 'テスト 太郎'; c.sei = 'テスト'; });
    await p.evaluate(fn);
    await p.waitForTimeout(500);
    const t = await dlgText();
    ok(name + '：止まって「保存できません」と出る', await dlgOpen() === 1 && /保存できません/.test(t), t);
    ok(name + '：🔴 カードが保存されていない', await savedCount() === 0, await savedCount());
    if (await dlgOpen()) { await p.click('#uid-ok'); await p.waitForTimeout(300); }
  }
}

console.log('\n── 🗣 止めた時に、どこがダメかを名前で伝える ──');
{
  await newCard(); await p.waitForTimeout(700);
  await p.evaluate(() => { const c = state.cards[state.cards.length - 1]; c.customer = 'テスト 太郎'; });
  await p.evaluate(() => pitSaveCard());
  await p.waitForTimeout(500);
  const t = await dlgText();
  ok('カナ・初回／リピーター・TEL・受付タイプ・作業タイプ が名前で出る',
     ['カナ', '初回／リピーター', 'TEL', '受付タイプ', '作業タイプ'].every(w => t.indexOf(w) >= 0), t);
  ok('「赤い枠のところを入れてから」と促している', /赤い枠/.test(t), t);
  ok('ボタンは「入力に戻る」', /入力に戻る/.test(t), t);
  ok('🔴 ブラウザ純正のポップアップではない', native.length === 0, native);
  await p.click('#uid-ok'); await p.waitForTimeout(300);
  /* 直したらすぐ押し直せる（二度押しの見張りに引っかからない） */
  await p.evaluate(() => pitSaveCard());
  await p.waitForTimeout(400);
  ok('🔴 直してすぐ押し直せる（「いま保存しています」で弾かれない）', await dlgOpen() === 1, await dlgText());
  await p.click('#uid-ok'); await p.waitForTimeout(300);
}

console.log('\n── 🟡 赤を全部埋めたら、黄だけになって「1回聞いて通す」 ──');
{
  await newCard(); await p.waitForTimeout(700);
  await p.evaluate(() => {
    const c = state.cards[state.cards.length - 1];
    c.kana = 'テスト タロウ'; c.seiKana = 'テスト'; c.meiKana = 'タロウ';
    c.repeat = (state.repeatTypes && state.repeatTypes[0] ? state.repeatTypes[0].id : 'new');
    c.tel = '090-1111-2222';
    c.dropType = 'drop';
    c.workType = 'general';
    /* 黄はわざと空のまま（customer / boardId / maker / car / reserveTime / menu） */
  });
  await p.evaluate(() => pitSaveCard());
  await p.waitForTimeout(500);
  const t = await dlgText();
  ok('🟡 1回だけ聞く（止めない）', await dlgOpen() === 1 && /このまま/.test(t), t);
  ok('空の項目を名前で出す', /お客様名（漢字）|メーカー|車種|入庫時刻|作業内容/.test(t), t);
  ok('ボタンは「このまま保存する」と「入力に戻る」', /このまま保存する/.test(t) && /入力に戻る/.test(t), t);

  /* 入力に戻る＝保存しない */
  await p.click('#uid-no'); await p.waitForTimeout(400);
  ok('🔴 「入力に戻る」なら保存しない', await savedCount() === 0, await savedCount());

  /* もう一度 → このまま保存する */
  await p.evaluate(() => pitSaveCard());
  await p.waitForTimeout(500);
  await p.click('#uid-ok'); await p.waitForTimeout(600);
  ok('🔴 「このまま保存する」なら保存できる', await savedCount() === 1, await savedCount());
}

console.log('\n── ✅ 全部埋めたら何も聞かずに保存できる ──');
{
  await newCard(); await p.waitForTimeout(700);
  await p.evaluate(() => {
    const c = state.cards[state.cards.length - 1];
    c.customer = 'テスト 太郎'; c.sei = 'テスト'; c.mei = '太郎';
    c.kana = 'テスト タロウ'; c.seiKana = 'テスト'; c.meiKana = 'タロウ';
    c.repeat = (state.repeatTypes && state.repeatTypes[0] ? state.repeatTypes[0].id : 'new');
    c.tel = '090-1111-2222';
    c.boardId = 'default'; c.maker = 'トヨタ'; c.car = 'プリウス';
    c.reserveTime = '9:00'; c.menu = 'オイル交換';
    c.dropType = 'drop'; c.workType = 'general';
    c.needLoaner = false;
  });
  await p.evaluate(() => pitSaveCard());
  await p.waitForTimeout(600);
  ok('🔴 何も聞かずに保存できる', await dlgOpen() === 0 && await savedCount() === 1,
     { 窓: await dlgOpen(), 件数: await savedCount() });
}

console.log('\n── 🔎 入力チェックのボタン（赤と黄を分けて伝える） ──');
{
  await newCard(); await p.waitForTimeout(700);
  await p.evaluate(() => pitCardCheck());
  await p.waitForTimeout(400);
  const toast = await p.evaluate(() => { const e = document.getElementById('pit-toast'); return e ? e.textContent : ''; });
  ok('赤の件数と「保存できません」を伝える', /赤 \d+件（保存できません）/.test(toast), toast);
  ok('黄の件数と「入れたほうがいい」を伝える', /黄 \d+件（入れたほうがいい）/.test(toast), toast);

  /* 全部埋めれば「漏れはありません」 */
  await p.evaluate(() => {
    const c = state.cards[state.cards.length - 1];
    c.customer='テ 太'; c.kana='テ タ'; c.repeat=(state.repeatTypes&&state.repeatTypes[0]?state.repeatTypes[0].id:'new');
    c.tel='090-1'; c.boardId='default'; c.maker='ト'; c.car='プ'; c.reserveTime='9:00'; c.menu='オイル';
    c.dropType='drop'; c.workType='general'; c.needLoaner=false;
    pitCardCheck();
  });
  await p.waitForTimeout(400);
  const t2 = await p.evaluate(() => { const e = document.getElementById('pit-toast'); return e ? e.textContent : ''; });
  ok('全部埋めたら「漏れはありません」', /漏れはありません/.test(t2), t2);
  ok('枠が1つも残っていない', (await keys('cf-miss')).length === 0 && (await keys('cf-warn')).length === 0);
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  await p.evaluate(() => { try { closeDetail(); } catch(e){} state.cards = []; });
  for (const v of ['course1', 'today', 'return', 'reserve']){
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(150);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  ok('🔴 ブラウザ純正のダイアログは1回も出ていない', native.length === 0, native);
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.76.0 以降', vn[0] > 1 || (vn[0] === 1 && vn[1] >= 76), ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
