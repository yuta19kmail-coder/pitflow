/* PitFlow v1.74.1 ── 定休日・受付終了の日に予約を入れようとした時
   -------------------------------------------------------------------
   ◎ゆうた報告
     「定休日に予約を入れようとすると **ブラウザ純正ポップアップ**を使ってる」
     「ついでに**表示に変なバグ**がある」
   ◎正体
     ① `rules.js` の `pitIntakeGuard` だけ、全アプリの決めごと（2026-07-28
        「ブラウザ標準の confirm・prompt はやめる」）から**取り残されていた**。
     ② 空き予約カレンダーのセルで **クラスの前の半角スペースが抜けていた**
        （`cfs-day ok` ＋ `sel` → `cfs-day oksel`）。
        だから **選んだ日が光らない／今日の枠が出ない／○△満休の色まで消える**。
   ◎直し
     ① アプリ内ダイアログ（ui-dialog.js）に入れ替え。**答えが後から返る（非同期）**ので、
        `pitIntakeGuard(card, newDate, oldDate, done)` の形にして、呼ぶ側5か所を全部 done に直した。
     ② スペースを入れた（`' sel'` / `' today'`）。同じ形の間違いが `rules.js` にもあったので一緒に直した。
   ◎使い方
     python3 -m http.server 8985      ← 別ウィンドウ
     node test_intake_guard.mjs                                        */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8985;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
/* 🔴 ブラウザ純正のダイアログが出たら、それ自体が不合格。ここで捕まえる。 */
const native = [];
p.on('dialog', async d => { native.push(d.message()); await d.dismiss().catch(() => {}); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.openNewReserve && window.pitIntakeGuard && window.PitCal', null, { timeout: 25000 });
await p.waitForTimeout(700);

const newCard = () => p.evaluate(() => { state.cards = []; openNewReserve(); return true; });

/* 定休日・営業日を実データから拾う（曜日を決め打ちしない＝その日が来た時だけ落ちる試験にしない）。
   ⚠ **カレンダーに出ている月の中**から選ぶ（来月の日を押そうとしても画面に無い）。
   ⚠ 予約カードを空にしてから見る＝サンプルの台数で「満」になっている日を避ける。 */
await p.evaluate(() => { state.cards = []; });
const days = await p.evaluate(() => {
  const t = new Date(); const y = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  const out = { today: y(t), closed: '', open: '' };
  for (let dd = t.getDate() + 1; dd <= last; dd++){
    const ds = y(new Date(t.getFullYear(), t.getMonth(), dd));
    const v = pitVerdict(ds).default;
    if (!out.closed && v.mark === '休') out.closed = ds;
    if (!out.open && v.mark === '○') out.open = ds;
  }
  return out;
});
ok('今月の中に定休日と営業日を見つけた', !!days.closed && !!days.open, days);
const cardNow = () => p.evaluate(() => state.cards[state.cards.length - 1] || null);
const dlgOpen = () => p.locator('#uid-ok:visible').count();
const dlgText = () => p.evaluate(() => { const e = document.querySelector('#uid-ok'); return e ? e.closest('div').parentElement.innerText.replace(/\n/g, ' / ') : ''; });

console.log('\n── 🚫 定休日をタップした時 ──');
{
  await newCard(); await p.waitForTimeout(700);
  await p.click('.cfs-day[data-ds="' + days.closed + '"][data-team="default"]');
  await p.waitForTimeout(400);
  ok('🔴 ブラウザ純正のポップアップを出さない', native.length === 0, native);
  ok('アプリ内ダイアログが出る', await dlgOpen() === 1);
  const t = await dlgText();
  ok('「それでも予約を入れますか？」と聞く', /それでも予約を入れますか/.test(t), t);
  ok('理由（定休）を出す', /定休|休業/.test(t), t);
  ok('ボタンは「やめる」と「それでも入れる」', /やめる/.test(t) && /それでも入れる/.test(t), t);

  await p.click('#uid-no'); await p.waitForTimeout(400);
  const c1 = await cardNow();
  ok('🔴 やめたら入庫日は変わらない', c1.reserveDate !== days.closed, c1.reserveDate);
  ok('ダイアログが閉じる', await dlgOpen() === 0);

  await p.click('.cfs-day[data-ds="' + days.closed + '"][data-team="default"]');
  await p.waitForTimeout(300);
  await p.click('#uid-ok'); await p.waitForTimeout(500);
  const c2 = await cardNow();
  ok('🔴 それでも入れるを押したら、その日が入る（人の最終判断を通す）', c2.reserveDate === days.closed, c2.reserveDate);
}

console.log('\n── ⭕ 営業日（○）は何も聞かない ──');
{
  await newCard(); await p.waitForTimeout(700);
  await p.click('.cfs-day[data-ds="' + days.open + '"][data-team="default"]');
  await p.waitForTimeout(400);
  ok('確認は出ない', await dlgOpen() === 0);
  ok('そのまま入庫日に入る', (await cardNow()).reserveDate === days.open, (await cardNow()).reserveDate);
  ok('ブラウザ純正も出ていない', native.length === 0, native);
}

console.log('\n── 🎨 表示のバグ（クラスの前のスペース抜け） ──');
{
  const cls = await p.evaluate(o => {
    const el = document.querySelector('.cfs-day[data-ds="' + o.open + '"][data-team="default"]');
    const td = document.querySelector('.cfs-day[data-ds="' + o.today + '"][data-team="default"]');
    return { sel: el ? el.className : '', today: td ? td.className : '' };
  }, days);
  ok('🔴 選んだ日に sel が付く（緑に光る）', /\bsel\b/.test(cls.sel), cls.sel);
  ok('🔴 選んだ日の ○/△/満/休 の色クラスが消えていない', /\b(ok|near|full|closed)\b/.test(cls.sel), cls.sel);
  ok('🔴 今日に today が付く（点線枠）', /\btoday\b/.test(cls.today), cls.today);
  ok('🔴 今日の色クラスも消えていない', /\b(ok|near|full|closed)\b/.test(cls.today), cls.today);
  ok('くっついた別名（oksel / oktoday）が1つも無い', await p.evaluate(() =>
    !document.querySelector('[class*="oksel"],[class*="oktoday"],[class*="fullsel"],[class*="fulltoday"],[class*="closedsel"],[class*="closedtoday"],[class*="nearsel"],[class*="neartoday"]')));
}

console.log('\n── ⌨ 入庫日の欄に直接入れた時も同じ ──');
{
  await newCard(); await p.waitForTimeout(700);
  await p.evaluate(o => {
    const el = document.querySelector('#view-card input[type=date][data-key=reserveDate]');
    el.value = o.closed; el.dispatchEvent(new Event('change', { bubbles: true }));
  }, days);
  await p.waitForTimeout(400);
  ok('確認が出る', await dlgOpen() === 1);
  ok('ブラウザ純正は出ない', native.length === 0, native);
  await p.click('#uid-no'); await p.waitForTimeout(400);
  const c = await cardNow();
  ok('やめたら入庫日に入らない', c.reserveDate !== days.closed, c.reserveDate);
  const v = await p.evaluate(() => document.querySelector('#view-card input[type=date][data-key=reserveDate]').value);
  ok('入力欄の表示も元に戻る（画面とデータが食い違わない）', v !== days.closed, v);
}

console.log('\n── 🖱 ドラッグで定休日に落とした時も同じ ──');
{
  await p.evaluate(o => {
    state.cards = [{ id:'DG1', resNo:'R-DG1', customer:'ドラッグ 太郎', car:'ノート', boardId:'default', division:'div1',
      workType:'general', workTypes:['general'], status:'reserved', dropType:'drop', reserveDate:o.open, log:[] }];
    applyCardDrop('DG1', 'reserveDate', o.closed);
  }, days);
  await p.waitForTimeout(400);
  ok('確認が出る', await dlgOpen() === 1);
  ok('ブラウザ純正は出ない', native.length === 0, native);
  await p.click('#uid-no'); await p.waitForTimeout(400);
  ok('🔴 やめたらカードは動かない', await p.evaluate(() => state.cards[0].reserveDate) === days.open, await p.evaluate(() => state.cards[0].reserveDate));

  await p.evaluate(o => applyCardDrop('DG1', 'reserveDate', o.closed), days);
  await p.waitForTimeout(300);
  await p.click('#uid-ok'); await p.waitForTimeout(500);
  ok('🔴 それでも入れるなら動く', await p.evaluate(() => state.cards[0].reserveDate) === days.closed, await p.evaluate(() => state.cards[0].reserveDate));
}

console.log('\n── 🧰 ガードの形（呼ぶ側が間違えないように） ──');
{
  const r = await p.evaluate(() => {
    const out = {};
    out.len = pitIntakeGuard.length;                       /* 引数4つ（done を受け取る） */
    let got = null;
    pitIntakeGuard({ boardId:'default' }, '', '', function(v){ got = v; });   /* 空＝そのまま通る */
    out.empty = got;
    got = null;
    pitIntakeGuard({ boardId:'default' }, '2000-01-01', '', function(v){ got = v; });  /* 過去＝聞かない */
    out.past = got;
    return out;
  });
  ok('done を受け取る形になっている（引数4つ）', r.len === 4, r.len);
  ok('聞く必要がない時も必ず done を呼ぶ', r.past === '2000-01-01', r);
  ok('過去の日付は聞かない（あとから記録する用）', await dlgOpen() === 0);
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  await p.evaluate(() => { state.cards = []; });
  for (const v of ['course1', 'today', 'return', 'reserve', 'availcal', 'rules']){
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(150);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  ok('🔴 最後までブラウザ純正のダイアログは1回も出ていない', native.length === 0, native);
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.74.1 以降', vn[0] > 1 || (vn[0] === 1 && (vn[1] > 74 || (vn[1] === 74 && vn[2] >= 1))), ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
