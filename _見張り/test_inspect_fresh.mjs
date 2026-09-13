/* PitFlow ── 🚪 **データチェックは、開いた瞬間はボタン2つだけ。押した時に、いまのデータで考える**（ブラウザ）
   ===================================================================
   ◎ゆうた指定（2026-09-13）
     🗣「PDFチェックの方で今だと8月のQ3が4件修正が出てるんだけど、Qの枠をクリックして再度考えさせると0になる。
     　　なんかの表示がそもそもまどろっこしいというか、あってるか不安になる」
     🗣「開いた瞬間は日常チェックとクォーターチェックのボタンしか出ていなくて、クリックするとちゃんと考えて、
     　　最新情報だけバッと出すようにできないかな？ 2こ押した場合はその時だけ読み込んだままでサクサク切り替える。
     　　ビューから出ちゃったら、またちゃんと再読み込みからって感じ」

   ◎ここで見張ること
     🔴🔴 ① 別のビューから入ると、**ボタン2つだけ**（数字もQの枠も出ない）
     🔴  ② 日常チェックを押すと、その場で数える
     🔴🔴 ③ クォーターチェックを押すと、**いまのデータで組み直す**（pitQFreshMonth が1回呼ばれる）
     🔴🔴 ④ ビューの中で行き来しても、**組み直さない**（持ったまま切り替える）
     🔴  ⑤ 背後の描き直し（同じビューの showView）では**捨てない**
     🔴🔴 ⑥ ビューを出て戻ると、**またボタン2つから**。クォーターを押すと、また組み直す
     🔴  ⑦ 月を変えたら、その月を組み直す

   ◎使い方（PitFlow のフォルダで）
       python -m http.server 8997      ← 別ウィンドウ
       PORT=8997 node _見張り/test_inspect_fresh.mjs
   =================================================================== */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const PORT = process.env.PORT || 8997;
const cp = chromePath();
const b = await chromium.launch(cp ? { executablePath: cp } : {});
const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));

let ok = 0, ng = 0;
const t = (name, cond, x) => { if (cond) { ok++; console.log('  ✅ ' + name); } else { ng++; console.log('  ❌ ' + name + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction(() => typeof window.renderInspect === 'function' && typeof window.showView === 'function', null, { timeout: 30000 });
await p.waitForTimeout(800);

/* pitQFreshMonth が何回呼ばれたか数える（中身はそのまま動かす） */
await p.evaluate(() => {
  const orig = window.pitQFreshMonth;
  window.__fresh = 0;
  window.pitQFreshMonth = function (ym) { window.__fresh++; return orig && orig.apply(this, arguments); };
});
const look = () => p.evaluate(() => {
  const body = document.getElementById('inspect-body');
  return {
    modes: body ? body.querySelectorAll('.ins-mode-b').length : -1,
    on: body ? [...body.querySelectorAll('.ins-mode-b.on')].length : -1,
    start: !!(body && body.querySelector('.ins-start')),
    daily: !!(body && body.querySelector('.ins-head')),
    qtop: !!(body && body.querySelector('.q-top')),
    qbox: body ? body.querySelectorAll('.q-pq').length : -1,
    mode: (window._insp || {}).mode,
    fresh: window.__fresh
  };
});

console.log('\n── ① 別のビューから入ると、ボタン2つだけ ──');
await p.evaluate(() => { showView('today'); showView('inspect'); });
await p.waitForTimeout(300);
let v = await look();
t('🔴🔴 ボタンは2つ（日常／クォーター）', v.modes === 2, v);
t('🔴🔴 どちらも押された状態ではない', v.on === 0 && !v.mode, v);
t('🔴🔴 日常チェックの数字は出ていない', !v.daily, v);
t('🔴🔴 クォーターの枠（Q1〜Q4）も出ていない', !v.qtop && v.qbox === 0, v);
t('案内の1行が出ている', v.start, v);
t('入っただけでは組み直さない（押すまで考えない）', v.fresh === 0, v);

console.log('\n── ② 日常チェックを押す ──');
await p.evaluate(() => pitInspectMode('daily'));
await p.waitForTimeout(300);
v = await look();
t('🔴 日常チェックの結果が出る', v.daily && v.mode === 'daily', v);

console.log('\n── ③ クォーターチェックを押す＝いまのデータで組み直す ──');
await p.evaluate(() => pitInspectMode('quarter'));
await p.waitForFunction(() => !((window._insp || {}).q || {}).busy, null, { timeout: 20000 });
await p.waitForTimeout(300);
v = await look();
t('🔴🔴 組み直しが1回だけ走った', v.fresh === 1, v);
t('🔴 クォーターの画面になっている（Q1〜Q4 の枠が出る）', v.mode === 'quarter' && v.qtop && v.qbox >= 4, v);

console.log('\n── ④ ビューの中で行き来しても、組み直さない ──');
await p.evaluate(() => pitInspectMode('daily'));
await p.waitForTimeout(200);
await p.evaluate(() => pitInspectMode('quarter'));
await p.waitForTimeout(400);
v = await look();
t('🔴🔴 日常 → クォーターに戻っても、組み直しは増えない', v.fresh === 1, v);

console.log('\n── ⑤ 背後の描き直しでは捨てない ──');
await p.evaluate(() => showView('inspect'));   /* 同期が来た時と同じ呼ばれ方 */
await p.waitForTimeout(400);
v = await look();
t('🔴 クォーターのまま（ボタン2つに戻らない）', v.mode === 'quarter' && !v.start, v);
t('🔴 組み直しも増えない', v.fresh === 1, v);

console.log('\n── ⑥ ビューを出て戻ると、またボタン2つから ──');
await p.evaluate(() => { showView('today'); });
await p.waitForTimeout(200);
await p.evaluate(() => { showView('inspect'); });
await p.waitForTimeout(300);
v = await look();
t('🔴🔴 戻ったらボタン2つだけ', v.modes === 2 && !v.mode && v.start && !v.qtop && !v.daily, v);
await p.evaluate(() => pitInspectMode('quarter'));
await p.waitForFunction(() => !((window._insp || {}).q || {}).busy, null, { timeout: 20000 });
await p.waitForTimeout(300);
v = await look();
t('🔴🔴 クォーターを押すと、また組み直す', v.fresh === 2, v);

console.log('\n── ⑦ 月を変えたら、その月を組み直す ──');
await p.evaluate(() => pitInspectMonth(-1));
await p.waitForFunction(() => !((window._insp || {}).q || {}).busy, null, { timeout: 20000 });
await p.waitForTimeout(300);
v = await look();
t('🔴 前の月へ動かすと、組み直しが1回増える', v.fresh === 3, v);

t('ページのエラーが出ていない', errs.length === 0, errs.slice(0, 3));
await b.close();
console.log('\n===== ' + ok + ' OK / ' + ng + ' NG =====');
process.exit(ng ? 1 : 0);
