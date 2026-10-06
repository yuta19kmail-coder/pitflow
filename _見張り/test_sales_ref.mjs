/* PitFlow v2.145.0 ── 保険・社員は売上の集計の外（参考の別枠）／区分別の一覧PDF（A4白黒）
   ===================================================================
   ◎ゆうた指定（2026-10-06）
     🗣「保険と社員は集計から抜いてほしい。ビュー自体も参考値として別枠として表示して欲しい」
     🗣「この感じに返車予定日を入れて、A4白黒印刷対応のPDFを自動で作成してDL出来るボタンを作成してほしい」

   ◎ここで見張ること
     🔴 保険・社員の**実績待〜予測**は 区分の合計・課別・フロント別に**入らない**。参考（ref）に入る
     🔴 🗣「実績になった社員と保険（入金により実績化）は入れてOK」＝実績は今までどおり数える
     🔴 rows には残る（ref の印つき）＝分析用の書き出し・AIレポートが全台を引ける
     🔴 FlowDesk の売上ボード（app-summary）も合計に入れず、ref に分ける
     🔴 当月ビューに参考の別枠が出る／「一覧PDF」は売上タブの当月だけ
     🔴 一覧は課ごと・実績〜見込（予測は載せない）・返車日つき。PDF は色を使わない

   ◎使い方
     python3 -m http.server 8995      ← 別ウィンドウ
     node _見張り/test_sales_ref.mjs                                   */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import fs from 'fs';

const PORT = process.env.PORT || 8995;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: chromePath() });
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitSalesRefKind && window.renderSales && window.svListModel', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(900);

const R = await p.evaluate(() => {
  const L = x => { const y = new Date(); y.setDate(y.getDate() + x); return y.getFullYear() + '-' + String(y.getMonth()+1).padStart(2,'0') + '-' + String(y.getDate()).padStart(2,'0'); };
  const moS = L(0).slice(0, 8) + '01', moE = (() => { const t = new Date(); return L(0).slice(0, 8) + String(new Date(t.getFullYear(), t.getMonth()+1, 0).getDate()).padStart(2,'0'); })();
  const before = pitSalesMonthCollect(moS, moE);
  const base = { boardId: 'default', division: 'div1', workType: 'general', car: 'レガシィ', reserveDate: L(-3), returnDate: L(0), frontStaff: '椎名 祐太', log: [] };
  state.cards.push(Object.assign({}, base, { id: 'T_INS', customer: '保険 太郎', status: 'outsource', workSpecials: ['insurance'], amountOrder: 300000 }));
  state.cards.push(Object.assign({}, base, { id: 'T_EMP', customer: '社員 花子', division: 'div2', boardId: 'import', status: 'workDone', workSpecials: ['employee'], amountFinal: 50000 }));
  /* 🗣「実績になった社員と保険（入金により実績化）は入れてOK」＝実績は数える */
  state.cards.push(Object.assign({}, base, { id: 'T_INSA', customer: '保険 入金済', status: 'returned', workSpecials: ['insurance'], amountFinal: 400000, paymentDate: L(0), completedAt: L(0), returnDate: L(-1) }));
  state.cards.push(Object.assign({}, base, { id: 'T_EMPA', customer: '社員 返車済', status: 'returned', workSpecials: ['employee'], amountFinal: 20000, completedAt: L(0), returnDate: L(0) }));
  state.cards.push(Object.assign({}, base, { id: 'T_WAR', customer: '保証 次郎', status: 'work', workSpecials: ['warranty'], amountOrder: 70000 }));
  const after = pitSalesMonthCollect(moS, moE);
  window._svTab = 'sales'; window._svMode = 'month'; showView('sales'); renderSales();
  const monthHtml = document.getElementById('view-sales-body').innerHTML;
  const btnMonth = /svExportListPdf\(\)/.test(monthHtml);
  window._svMode = 'year'; renderSales(); const btnYear = /svExportListPdf\(\)/.test(document.getElementById('view-sales-body').innerHTML);
  window._svMode = 'month'; window._svTab = 'quarter'; renderSales(); const btnQ = /svExportListPdf\(\)/.test(document.getElementById('view-sales-body').innerHTML);
  window._svTab = 'sales'; renderSales();
  const LM = svListModel();
  const out = {
    kinds: [pitSalesRefKind(state.cards.find(c => c.id === 'T_INS')), pitSalesRefKind(state.cards.find(c => c.id === 'T_EMP')), pitSalesRefKind(state.cards.find(c => c.id === 'T_WAR'))],
    confDiff: after.tiers.confirmed.sum - before.tiers.confirmed.sum,
    actDiff: after.tiers.actual.sum - before.tiers.actual.sum,
    refAct: after.ref.tiers.actual.sum,
    listActIns: LM.courses[0].groups[0].rows.some(r => /保険 入金済/.test(r.name)),
    waitDiff: after.tiers.actualWait.sum - before.tiers.actualWait.sum,
    d1conf: after.byCourse.div1.confirmed.sum - before.byCourse.div1.confirmed.sum,
    refConf: after.ref.tiers.confirmed.sum, refWait: after.ref.tiers.actualWait.sum,
    refD2Wait: after.ref.byCourse.div2.actualWait.sum,
    rowRef: after.rows.filter(r => /^T_/.test(r.c.id) && r.tier !== 'actual').map(r => r.c.id + ':' + (r.ref || '')).sort(),
    frontIns: (after.fronts['椎名 祐太'] || {}).confirmed - ((before.fronts['椎名 祐太'] || {}).confirmed || 0),
    refBox: /sv-ref/.test(monthHtml) && /参考（保険・社員の実績待〜予測）/.test(monthHtml),
    btnMonth, btnYear, btnQ,
    listTiers: LM.courses.map(c => c.groups.map(g => g.id).join(',')),
    listHasIns: LM.courses.some(c => c.groups.some(g => g.rows.some(r => /保険 太郎/.test(r.name)))),
    listRef: LM.courses.map(c => c.refRows.map(r => r.ref + ':' + r.name).join('|')),
    warRet: (LM.courses[0].groups.find(g => g.id === 'confirmed').rows.find(r => /保証 次郎/.test(r.name)) || {}).ret,
    warKind: (LM.courses[0].groups.find(g => g.id === 'confirmed').rows.find(r => /保証 次郎/.test(r.name)) || {}).amtKind,
    insaRow: (() => { const r = LM.courses[0].groups[0].rows.find(r => /保険 入金済/.test(r.name)) || {}; return [r.amtKind, r.ret]; })(),
    kindsOk: LM.courses.every(c => c.groups.every(g => g.rows.every(r => /^(確定|受注|見積|概算)$/.test(r.amtKind) && /^(済|確定|予定|概算) \d|^未定$/.test(r.ret)))),
    custRow: (() => { const r = LM.courses[0].groups.find(g => g.id === 'confirmed').rows.find(r => /保証/.test(r.cust || '')); return r ? [r.cust, r.car, r.front] : null; })(),
    pages: null,
    board: (() => { try { const S = window.pitAppSummaryBuild ? pitAppSummaryBuild() : null; return S ? 1 : 0; } catch (e) { return String(e); } })()
  };
  state.cards = state.cards.filter(c => !/^T_/.test(c.id)); renderSales();
  return out;
});

console.log('\n── ① 見分け（sales-count.js の1本） ──');
ok('保険＝「保険」／社員＝「社員」／保証は対象外', R.kinds.join(',') === '保険,社員,', R.kinds);

console.log('\n── ② 集計に入らない・参考に入る ──');
ok('🔴 保険の確定は区分の合計に足されない', R.confDiff === 70000, R.confDiff);   /* 保証の7万だけ増える */
ok('🔴 社員の実績待は区分の合計に足されない', R.waitDiff === 0, R.waitDiff);
ok('課別（1課）にも保険は入らない', R.d1conf === 70000, R.d1conf);
ok('フロント別にも保険は入らない', R.frontIns === 70000, R.frontIns);
ok('参考に保険30万（確定）・社員5万（実績待・2課）', R.refConf === 300000 && R.refWait === 50000 && R.refD2Wait === 50000, R);
ok('🔴 rows には残る（ref の印つき）＝書き出し・AIレポートが全台を引ける', R.rowRef.join() === 'T_EMP:社員,T_INS:保険,T_WAR:', R.rowRef);
ok('🔴 実績になった保険（入金済）・社員は実績に数える（参考には入らない）', R.actDiff === 420000 && R.refAct === 0, [R.actDiff, R.refAct]);
ok('一覧の実績にも入金済みの保険が載る', R.listActIns);

console.log('\n── ③ 画面 ──');
ok('当月ビューに参考（保険・社員）の別枠', R.refBox);
ok('「一覧PDF」は売上タブの当月と、クォーター（v2.152.0〜 該当Q・翌Q・それ以外の一覧）。月間（年度）には出ない', R.btnMonth && !R.btnYear && R.btnQ, [R.btnMonth, R.btnYear, R.btnQ]);

console.log('\n── ④ 一覧（紙の材料） ──');
ok('区分は実績〜見込（予測は載せない）', R.listTiers.every(s => s === 'actual,actualWait,confirmed,planned,prospect'), R.listTiers);
ok('保険の車は本表に載らない', !R.listHasIns);
ok('参考の欄に保険（1課）・社員（2課）', /保険:保険 太郎/.test(R.listRef[0]) && /社員:社員 花子/.test(R.listRef[1]), R.listRef);
ok('🆕 返車日に種類の札（保証＝受注時の返車予定日＝「予定 M/D」）', /^予定 \d{1,2}\/\d{1,2}$/.test(R.warRet || ''), R.warRet);
ok('🆕 金額に種類（受注額で拾った車＝「受注」）', R.warKind === '受注', R.warKind);
ok('🆕 入金済みの保険＝確定金額・返車は「済」', R.insaRow[0] === '確定' && /^済 /.test(R.insaRow[1] || ''), R.insaRow);
ok('🆕 全行が 確定/受注/見積/概算 と 済/確定/予定/概算/未定 のどれか', R.kindsOk);
ok('🆕 お客様＝個人は苗字だけ・車種は別／フロントは通称か苗字（v2.153.0）', R.custRow && R.custRow[0] === '保証' && R.custRow[1] !== '' && R.custRow[2] && !/ /.test(R.custRow[2]), R.custRow);

console.log('\n── ⑤ 紙（A4・白黒） ──');
const src = fs.readFileSync('js/sales-print.js', 'utf8');
const body = src.slice(src.indexOf('function drawList'), src.indexOf('window.svExportListPdf'));
ok('一覧の描画に色（G() 以外の色指定）を使っていない', !/hexRgb|GREEN|tint\(|deep\(|setTextColor\(\s*\d+\s*,\s*\d+\s*,\s*\d+|setFillColor\(\s*\d+\s*,\s*\d+\s*,\s*\d+/.test(body));
const pages = await p.evaluate(async () => {
  if (!(window.jspdf && window.jspdf.jsPDF)) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  window.__cap = null; jspdf.jsPDF.API.save = function (n) { window.__cap = { n, pages: this.getNumberOfPages() }; return this; };
  svExportListPdf(); for (let i = 0; i < 60 && !window.__cap; i++) await new Promise(r => setTimeout(r, 250));
  return window.__cap;
});
ok('ボタンから A4 の PDF ができる（課ごとに改ページ＝2枚以上）', pages && pages.pages >= 2 && /^売上一覧_/.test(pages.n), pages);

console.log('\n── 落ちていないか ──');
ok('ページエラーなし', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log(`\n${pass} ✅ / ${fail} ❌`);
process.exit(fail ? 1 : 0);
