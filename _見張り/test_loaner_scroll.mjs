/* PitFlow v1.95.0 ── 代車カレンダーのスクロールが「ガクッと戻る」を直す
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-08-15）
     「代車カレンダーのスクロール自体がちょっと変。できないとかではなく、
       **一回ガクッと戻る**みたいな挙動をする」

   ◎正体
     PitFlow は画面のどこかが変わるたびに `showView(state.currentView)` で
     **背後のビューをまるごと描き直す**作り（予約の保存・クラウド同期・MHSカレンダー着信…）。
     代車カレンダーの `renderLoaner()` は、そのたびに
       ① 日付の範囲を **今日−14日** に戻して作り直し
       ② `loScrollToday()` で **今日へアンカー**
     していた。＝**見ていた場所から今日まで一気に巻き戻る。**

   ◎ここで見張ること
     🔴 新しく開いた時は、今までどおり「今日の5日前」あたりに寄せる
     🔴 **同じ画面の描き直しでは、見ていた場所から動かない**
     🔴 描き直しで**日付の範囲も縮めない**（過去へ遡って見ていた分が消えない）
     🔴 横スクロール（代車の列）の位置も保つ

   ◎使い方
     python3 -m http.server 8991      ← 別ウィンドウ
     node test_loaner_scroll.mjs                                       */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.showView && window.renderLoaner', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

const pos = () => p.evaluate(() => {
  const w = document.getElementById('loaner-scroll');
  return w ? { top: Math.round(w.scrollTop), left: Math.round(w.scrollLeft),
               rows: w.querySelectorAll('.lo-date').length } : null;
});

console.log('\n── 📂 新しく開いた時は、今までどおり今日あたりへ ──');
{
  await p.evaluate(() => showView('dashboard'));
  await p.waitForTimeout(300);
  await p.evaluate(() => showView('loaner'));
  await p.waitForTimeout(1400);
  const a = await pos();
  ok('代車カレンダーが描けている', !!a && a.rows > 30, a);
  ok('🔴 いちばん上ではなく、今日あたりまで送られている', !!a && a.top > 100, a);
  /* 「今日の5日前」が画面の上のほうに来ているか */
  const anchored = await p.evaluate(() => {
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const t = new Date(); t.setDate(t.getDate() - 5);
    const w = document.getElementById('loaner-scroll');
    const el = w.querySelector('.lo-date[data-ld="' + ymd(t) + '"]');
    if (!el) return null;
    const r = el.getBoundingClientRect(), wr = w.getBoundingClientRect();
    return Math.round(r.top - wr.top);
  });
  ok('今日の5日前が画面の上のほうに来ている', anchored != null && anchored >= 0 && anchored < 90, anchored);
}

console.log('\n── 🔄 背後の描き直しで、見ていた場所から動かない（＝今回の直し） ──');
{
  /* 過去のほうへスクロールして、そこに居座る */
  await p.evaluate(() => { document.getElementById('loaner-scroll').scrollTop = 1200; });
  await p.waitForTimeout(400);
  const before = await pos();

  /* 予約が保存された時・クラウドから届いた時と同じ道＝背後をまるごと描き直す */
  await p.evaluate(() => showView(state.currentView));
  await p.waitForTimeout(900);
  const after = await pos();

  ok('🔴 描き直しても、見ていた場所から動かない',
     !!before && !!after && Math.abs(after.top - before.top) <= 4, { before, after });
  ok('🔴 日付の範囲も縮んでいない', !!after && after.rows >= before.rows, { before, after });
}
{
  /* 続けて何回か描き直しても動かない（同期は何度も来る） */
  const before = await pos();
  for (let i = 0; i < 3; i++) {
    await p.evaluate(() => showView(state.currentView));
    await p.waitForTimeout(300);
  }
  const after = await pos();
  ok('🔴 何回描き直しても動かない', Math.abs(after.top - before.top) <= 4, { before, after });
}

console.log('\n── ↔ 横（代車の列）の位置も保つ ──');
{
  await p.evaluate(() => { document.getElementById('loaner-scroll').scrollLeft = 300; });
  await p.waitForTimeout(300);
  const before = await pos();
  await p.evaluate(() => showView(state.currentView));
  await p.waitForTimeout(800);
  const after = await pos();
  ok('横スクロールも動かない', Math.abs(after.left - before.left) <= 4, { before, after });
}

console.log('\n── ⬆ 過去へ遡ったぶんが、描き直しで消えない ──');
{
  /* いちばん上まで行って過去を継ぎ足させる */
  await p.evaluate(() => { document.getElementById('loaner-scroll').scrollTop = 0; });
  await p.waitForTimeout(700);
  const grown = await pos();
  ok('過去が継ぎ足された（行が増えた）', grown.rows > 56, grown);

  await p.evaluate(() => { document.getElementById('loaner-scroll').scrollTop = 900; });
  await p.waitForTimeout(300);
  const before = await pos();
  await p.evaluate(() => showView(state.currentView));
  await p.waitForTimeout(900);
  const after = await pos();
  ok('🔴 継ぎ足した過去が描き直しで消えない', after.rows >= before.rows, { before, after });
  ok('🔴 位置も動かない', Math.abs(after.top - before.top) <= 4, { before, after });
}

console.log('\n── 📂 別の画面から戻ったら、また今日あたりへ ──');
{
  await p.evaluate(() => showView('dashboard'));
  await p.waitForTimeout(300);
  await p.evaluate(() => showView('loaner'));
  await p.waitForTimeout(1400);
  const a = await pos();
  const anchored = await p.evaluate(() => {
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const t = new Date(); t.setDate(t.getDate() - 5);
    const w = document.getElementById('loaner-scroll');
    const el = w.querySelector('.lo-date[data-ld="' + ymd(t) + '"]');
    if (!el) return null;
    const r = el.getBoundingClientRect(), wr = w.getBoundingClientRect();
    return Math.round(r.top - wr.top);
  });
  ok('🔴 開き直しは今までどおり今日あたりへ寄る', anchored != null && anchored >= 0 && anchored < 90, { a, anchored });
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  const src = fs.readFileSync('js/views.js', 'utf8');
  ok('切り替える前のビューを覚えている', /window\._pitPrevView = state\.currentView/.test(src), '');
  for (const v of ['dashboard', 'reserve', 'return', 'loaner', 'availcal', 'today']) {
    await p.evaluate(x => showView(x), v);
    await p.waitForTimeout(250);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
