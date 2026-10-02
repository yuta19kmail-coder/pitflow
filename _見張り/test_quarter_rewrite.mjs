/* PitFlow ── 🔁 **書き込んだあとで伝票が直されたら、「中身が変わった」と言って書き直せる**（ブラウザ不要）
   ===================================================================
   ◎ゆうた（2026-10-02）
     🗣「一度履歴の請求書データを書き込んだ後、あとあとPDF側で修正、もう一度UPした場合はどうなる？」→「入れよう」

   ◎正体
     「同じ予約番号＋同じ伝票番号が入っている」だけで書けたと数えていた。
     ＝ 直したPDFを入れ直しても、履歴は古い金額のまま「書き込み済み 39/39」に見えた。

   ◎ここで見張ること（quarter-write.js）
     🔴🔴 ① 金額・原価・消費税・伝票計のどれかが違えば「変わった」（書けたに数えない）
     🔴  ② 同じなら今までどおり「書けた」
     🔴  ③ 前の版で書き込んだ伝票に無い欄は比べない（欄が無いだけで「変わった」にしない）
     🔴🔴 ④ 明細が手元にあれば「書き直す」ボタン、無ければ「PDFを入れ直すと書き直せます」
     🔴🔴 ⑤ 書き直すと、同じ予約番号の古い伝票が新しい中身に置きかわる（二重にならない）
     🔴  ⑥ Qの箱に「中身が変わった ◯枚」

   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_quarter_rewrite.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');

const VEH = {
  P1: { 伝票: [{ 予約番号: 'R1', 伝票番号: '0001', 金額: 10000, 原価: 4000, 消費税: 1000, 伝票計: 11000 }] },
  P2: { 伝票: [{ 予約番号: 'R2', 伝票番号: '0002', 金額: 20000, 原価: 8000, 消費税: 2000, 伝票計: 22000 }] },
  P3: { 伝票: [{ 予約番号: 'R3', 伝票番号: '0003', 金額: 30000, 原価: 9000 }] }   /* 前の版＝消費税・伝票計なし */
};
let asked = 0;
const ctx = { console, _insp: { q: { groups: [], gi: 0 } }, pitQNokori: () => 0,
  pitVehByPlate: (plate) => VEH[plate] ? { veh: VEH[plate] } : null,
  pitAsk: () => { asked++; return Promise.resolve(true); }, pitToast: () => {}, renderInspect: () => {} };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(JS('quarter-write.js'), ctx, { filename: 'quarter-write.js' });

const MEI = [{ 種: '作業', 名: 'オイル交換', 金額: 1 }];
const pr = (i, soft, mei) => ({ soft: Object.assign({ 伝票: '000' + i, ナンバー: 'P' + i, 顧客名: 'テスト' + i,
                                                     明細: mei ? MEI : [], 明細が合う: true }, soft),
                                pit: { 予約番号: 'R' + i, ナンバー: 'P' + i, 車体番号: 'VIN' + i } });

console.log('── ①②③ 数え方 ──');
/* 1：原価が直った／2：同じ／3：前の版（金額・原価は同じ。消費税・伝票計は比べない） */
const R = { 結びついた: [
  pr(1, { 金額: 10000, 原価: 3500, 消費税: 1000, 伝票計: 11000 }, true),
  pr(2, { 金額: 20000, 原価: 8000, 消費税: 2000, 伝票計: 22000 }, true),
  pr(3, { 金額: 30000, 原価: 9000, 消費税: 3000, 伝票計: 33000 }, true)], 検算: { 合う: true } };
const wc = ctx.pitQWriteCount(R);
ok('🔴🔴 原価が直った 0001 は「変わった」', wc.変わった.join() === '0001', wc);
ok('🔴 同じ 0002 と、前の版の 0003 は「書けた」＝2/3', wc.書けた === 2 && wc.対象 === 3 && !wc.未.length, wc);

console.log('── ④ 帯 ──');
const h1 = ctx.pitQWritePanel(R, {});
ok('🔴🔴 明細が手元にある＝「書き直す」ボタン', /書き込んだあとで直されています/.test(h1) && /書き直す/.test(h1) && /0001/.test(h1), h1);
ok('🔴 「伝票の書き込み 2/3・中身が変わった 1枚」', /伝票の書き込み 2\/3・中身が変わった 1枚/.test(h1), h1);
const Rk = { 結びついた: R.結びついた.map(p => Object.assign({}, p, { soft: Object.assign({}, p.soft, { 明細: [] }) })), 検算: { 合う: true } };
const h2 = ctx.pitQWritePanel(Rk, { 再生: true });
ok('🔴🔴 明細が無い（残した伝票）＝「PDFを入れ直すと書き直せます」', /PDFを入れ直すと書き直せます/.test(h2) && !/pitQWriteGo/.test(h2), h2);

console.log('── ⑤ 書き直す ──');
ctx._insp.q.res = R;
ctx.pitQWriteGo();
await new Promise(r => setTimeout(r, 10));
ok('🔴🔴 0001 が新しい原価 3,500 に置きかわった', VEH.P1.伝票.length === 1 && VEH.P1.伝票[0].原価 === 3500, VEH.P1.伝票);
const wc2 = ctx.pitQWriteCount(R);
ok('🔴 書き直したら 3/3・変わった 0', wc2.書けた === 3 && !wc2.変わった.length, wc2);

console.log('── ⑥ Qの箱 ──');
const q = JS('quarter.js');
const box = (q.match(/function wBox\(g, nok, 保存\)\{[\s\S]*?\n  \}/) || [''])[0];
ok('🔴 Qの箱に「中身が変わった ◯枚」と「書き直す」', /中身が変わった /.test(box) && /書き直す/.test(box), box.slice(0, 300));

console.log(fail ? `⚠ ${pass} OK / ${fail} NG` : `✅ 全部緑（${pass}件）`);
process.exit(fail ? 1 : 0);
