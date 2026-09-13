/* PitFlow ── 🗓 **2か月にまたがるPDFでも、Qの枠は表示中の月の4つだけ**（ブラウザ・PDF不要）
   ===================================================================
   ◎ゆうた指定（2026-09-13）
     🗣「8月〜9月中旬ぐらいまでのPDFを入れた場合に、8月のQが増えて表示される。
     　　この場合は8月は4Qで、9月側に表示自体をふってほしい」

   ◎ここで見張ること（本物のPDFの代わりに、PDFから来た組を手で置く）
     🔴🔴 ① 8月を見ている時、Qの枠は **4つだけ**（9月の組を枠として足さない）
     🔴  ② 「9月のぶんも入っています」の1行と「9月を見る」ボタンが出る（隠さない）
     🔴🔴 ③ 「9月を見る」で9月へ動いても、**PDFは捨てない**。9月の Q1〜Q4 に並び、9月の組が枠に入る
     🔴🔴 ④ 8月へ戻っても、PDFは残っていて 8月の枠は4つ
     🔴  ⑤ PDFが掛かっていない月（7月）へ動いたら、今までどおり捨てる
     🔴🔴 ⑥ PDFを読んだ直後に月を合わせる入口（pitInspectGoYm）は、**PDFの組を捨てない**

   ◎使い方（PitFlow のフォルダで）
       python -m http.server 8994      ← 別ウィンドウ
       PORT=8994 node _見張り/test_quarter_span.mjs
   =================================================================== */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const PORT = process.env.PORT || 8994;
const cp = chromePath();
const b = await chromium.launch(cp ? { executablePath: cp } : {});
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
let ok = 0, ng = 0;
const t = (name, cond, x) => { if (cond) { ok++; console.log('  ✅ ' + name); } else { ng++; console.log('  ❌ ' + name + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction(() => typeof window.pitQMatch === 'function' && typeof window.pitQMonthPlan === 'function' && typeof window.showView === 'function', null, { timeout: 30000 });
await p.waitForTimeout(800);

/* 8/1〜9/15 のPDFを読んだ直後の形を作る（組は quarter-match の区切りのまま・1組1枚） */
const setup = () => p.evaluate(() => {
  const plansA = window.pitQMonthPlan('2026-08', []);
  const plansS = window.pitQMonthPlan('2026-09', []);
  const mk = (x, part) => {
    const soft = [{ 売上日: x.from, 伝票: 'D' + x.from, ナンバー: '柏 500 あ ' + x.no, 顧客名: 'テスト' + x.from,
                    車種: 'タント', 金額: 10000, 受付担当: '小林' }];
    const to = part ? part : x.to;
    return { no: x.no, label: x.label, from: x.from, to: to, 全部: !part, soft: soft,
             res: window.pitQMatch(soft, window.pitQCollect({ from: x.from, to: to }).明細, { from: x.from, to: to }),
             出どころ: 'PDF' };
  };
  showView('today'); showView('inspect');
  const U = window._insp.q || (window._insp.q = {});
  window.pitInspectSetYm && null;
  window._insp.mode = 'quarter';
  window._insp.ym = '2026-08';
  U.ym = '2026-08'; U.list = []; U.listBusy = false; U.busy = ''; U.err = '';
  U.pdf = '売上チェックリスト_0801-0915.pdf';
  U.term = { from: '2026-08-01', to: '2026-09-15' }; U.termSrc = 'PDF';
  U.groups = plansA.map(x => mk(x)).concat([mk(plansS[0]), mk(plansS[1], '2026-09-15')]);
  U.月そろえた = '2026-08'; U.月に無い = {};
  U.gi = 0; U.from = U.groups[0].from; U.to = U.groups[0].to; U.soft = U.groups[0].soft; U.res = U.groups[0].res;
  renderInspect();
  return { groups: U.groups.length, sep: plansS.slice(0, 2).map(x => x.from + '〜' + x.to) };
});
const look = () => p.evaluate(() => {
  const body = document.getElementById('inspect-body');
  const U = window._insp.q || {};
  return {
    month: (body.querySelector('.ins-m-now') || {}).textContent || '',
    boxes: body.querySelectorAll('.q-plan-b .q-pq').length,
    extraBoxes: body.querySelectorAll('.q-plan-x .q-pq').length,
    more: [...body.querySelectorAll('.q-plan-more')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
    boxText: [...body.querySelectorAll('.q-plan-b .q-pq')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
    pdf: U.pdf || null, groups: (U.groups || []).length,
    pdfGroups: (U.groups || []).filter(g => g.出どころ !== '保存').map(g => g.from),
    busy: U.busy || ''
  };
});
const idle = () => p.waitForFunction(() => !((window._insp || {}).q || {}).busy, null, { timeout: 20000 });

console.log('\n── ① 8月を見ている時、Qの枠は4つだけ ──');
const s0 = await setup();
await p.waitForTimeout(300);
let v = await look();
t('前提：PDFの組は 8月4つ＋9月2つ', s0.groups === 6, s0);
t('🔴🔴 8月の枠は4つだけ', v.boxes === 4 && v.extraBoxes === 0, v);

console.log('\n── ② 9月のぶんがあることは1行で言う ──');
t('🔴 「9月のぶん」の1行が出る', v.more.length === 1 && /9月のぶん/.test(v.more[0]) && /9月を見る/.test(v.more[0]), v.more);

console.log('\n── ③ 「9月を見る」で9月へ（PDFは持ったまま） ──');
await p.evaluate(() => { const bt = document.querySelector('.q-plan-go'); if (bt) bt.click(); });
await idle(); await p.waitForTimeout(300);
v = await look();
t('🔴 9月に動いた', /9月/.test(v.month), v.month);
t('🔴🔴 PDFは捨てていない（PDFの組は6つのまま）', !!v.pdf && v.pdfGroups.length === 6, v);
t('🔴🔴 9月の枠も4つ', v.boxes === 4 && v.extraBoxes === 0, v);
t('🔴 9月の Q1・Q2 の枠は、このPDFの組になっている', /このPDF/.test(v.boxText[0] || '') && /このPDF/.test(v.boxText[1] || ''), v.boxText);
t('🔴 9月からは「8月のぶん」を1行で言う', v.more.length === 1 && /8月のぶん/.test(v.more[0]), v.more);

console.log('\n── ④ 8月へ戻る（月バーの ‹） ──');
await p.evaluate(() => pitInspectMonth(-1));
await idle(); await p.waitForTimeout(300);
v = await look();
t('🔴 8月に戻った', /8月/.test(v.month), v.month);
t('🔴🔴 PDFはまだ残っている', !!v.pdf && v.pdfGroups.length === 6, v);
t('🔴🔴 8月の枠は4つ', v.boxes === 4 && v.extraBoxes === 0, v);

console.log('\n── ⑤ PDFが掛かっていない月（7月）へ動いたら、今までどおり捨てる ──');
await p.evaluate(() => pitInspectMonth(-1));
await idle(); await p.waitForTimeout(300);
v = await look();
t('🔴 7月に動いた', /7月/.test(v.month), v.month);
t('🔴 PDFは捨てた（別の月の話なので）', !v.pdf && v.pdfGroups.length === 0, v);

console.log('\n── ⑥ PDFを読んだ直後に月を合わせる入口は、PDFを捨てない ──');
await setup();
const g6 = await p.evaluate(() => {
  const U = window._insp.q;
  window._insp.ym = '2026-09'; U.ym = '2026-09';          /* 月バーが9月のまま、8月〜9月のPDFを入れた形 */
  window.pitInspectGoYm('2026-08-03');
  return { pdf: U.pdf || null, groups: (U.groups || []).length, ym: window._insp.ym };
});
t('🔴🔴 月が違っても、PDFの組を捨てない', !!g6.pdf && g6.groups === 6 && g6.ym === '2026-08', g6);

t('ページのエラーが出ていない', errs.length === 0, errs.slice(0, 3));
await b.close();
console.log('\n===== ' + ok + ' OK / ' + ng + ' NG =====');
process.exit(ng ? 1 : 0);
