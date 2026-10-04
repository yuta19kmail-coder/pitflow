/* PitFlow ── クォーターチェック：「別の車かも」の行が行き止まりにならない（ブラウザ不要）
   ===================================================================
   ◎ゆうた報告（2026-10-04・Q-879708）
     🗣「これも OK も修正もできない」
     伝票「株式会社自然資源計画／ＡＺ－オフロード」・PitFlow「栗原 雅博／AZオフロード」・ナンバー一致・車体番号は PitFlow に無い
     ＝客名がちがうので車種で見る → ハイフン1本で「車種がちがう」→ 札が1つも無い
   ◎ここで見張ること
     🔴🔴 「ＡＺ－オフロード」と「AZオフロード」は同じ車種
     🔴  長音「ー」は消さない（別の車種を同じにしない）
     🔴🔴 車種がちがう・車体番号がちがう行にも「確かめた（同じ車です）」の札が付く
     🔴  ナンバーが読めない行の札は今までどおり
   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_quarter_samecar.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + JSON.stringify(x) : '')); } };
const ctx = { console, state: { cards: [], settings: {}, staff: [] } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['quarter-match.js', 'quarter-fix.js']) {
  try { vm.runInContext(fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8'), ctx); } catch (e) { console.log('（' + f + ' の読み込み：' + e.message + '）'); }
}
const pair = (sc, pc, sv, pv) => ({
  soft: { ナンバー: '松戸 580 う 5912', 顧客名: '株式会社自然資源計画', 車種: sc, 車体番号: sv || '' },
  pit:  { ナンバー: '松戸 580 う 5912', 顧客名: '栗原 雅博', 車種: pc, 車体番号: pv || '' } });
ok('🔴🔴 ＡＺ－オフロード と AZオフロード は同じ車種', ctx.pitQSameCar(pair('ＡＺ－オフロード', 'AZオフロード')) === 'ok', ctx.pitQSameCar(pair('ＡＺ－オフロード', 'AZオフロード')));
ok('🔴 長音は残す（ノート と ノア は別）', ctx.pitQSameCar(pair('ノート', 'ノア')) === 'carNG');
ok('🔴 ちがう車種は今までどおり carNG', ctx.pitQSameCar(pair('ハイゼット', 'AZオフロード')) === 'carNG');
const kinds = (id) => (ctx.pitQKeepKinds({ 同一性: id }) || []).map(k => k.kind + ':' + k.label);
ok('🔴🔴 車種がちがう行に「確かめた（同じ車です）」', kinds('carNG').includes('同じ車:確かめた（同じ車です）'), kinds('carNG'));
ok('🔴🔴 車体番号がちがう行にも「確かめた（同じ車です）」', kinds('vinNG').includes('同じ車:確かめた（同じ車です）'), kinds('vinNG'));
ok('🔴 ナンバーが読めない行は今までどおり', kinds('plateNG').includes('同じ車:確かめた（同じ車です）'), kinds('plateNG'));
ok('🔴 同じ車の行には札を足さない', kinds('ok').length === 0 && kinds('plateOK').length === 0, [kinds('ok'), kinds('plateOK')]);


/* 👤 v2.140.7 ゆうた「逆に名前違いを出さないとだめじゃない？」＝お客様の名前がちがう行は「データがちがう」へ */
console.log('── 👤 お客様の名前がちがう ──');
ok('🔴 見た目が同じ別の字（祐 U+FA4F と U+7950）は同じ名前', ctx.pitQNormName('渡邉祐記') === ctx.pitQNormName('渡邉 祐記'), [ctx.pitQNormName('渡邉祐記'), ctx.pitQNormName('渡邉 祐記')]);
const one = (sn, pn) => {
  const soft = [{ i: 0, 顧客名: sn, ナンバー: '野田 330 に 7233', 車種: 'ノア', 売上日: '2026-09-18', 金額: 10000, 受付担当: '菅谷' }];
  const pit = [{ 顧客名: pn, ナンバー: '野田 330 に 7233', 車種: 'ノア', 売上日: '2026-09-18', 数える日: '2026-09-18', 確定金額: 10000, フロント担当: '菅谷', 対象期間内: true, 実績: true, 状態: 'returned', 生: { id: 'c1' } }];
  try { const R = ctx.pitQMatch(soft, pit, { from: '2026-09-16', to: '2026-09-23' }); const all = ['データ', '金額', '日付', 'OK'].flatMap(k => R.グループ[k].map(p => ({ k, p }))); return all[0] || null; } catch (e) { return { err: e.message }; }
};
const a1 = one('相馬亘孝', '相馬 亘高');
ok('🔴🔴 名前がちがう（亘孝／亘高）→ データがちがう', a1 && a1.k === 'データ' && a1.p.客名一致 === false, a1 && (a1.err || [a1.k, a1.p.客名一致]));
const a2 = one('相馬亘孝', '相馬 亘孝');
ok('🔴 名前が同じ（空白のちがいだけ）→ OK', a2 && a2.k === 'OK' && a2.p.客名一致 === true, a2 && (a2.err || [a2.k, a2.p.客名一致]));
const a3 = one('相馬亘孝', '');
ok('🔴 片方が空 → 言わない（OK）', a3 && a3.k === 'OK', a3 && (a3.err || a3.k));
const kk = (ctx.pitQKeepKinds({ 客名一致: false }) || []).map(k => k.kind + ':' + k.label);
ok('🔴🔴 名前がちがう行に「確かめた（このままでよい）」の札', kk.includes('客名:確かめた（このままでよい）'), kk);

console.log(fail ? `⚠ ${pass} OK / ${fail} NG` : `✅ 全部緑（${pass}件）`);
process.exit(fail ? 1 : 0);
