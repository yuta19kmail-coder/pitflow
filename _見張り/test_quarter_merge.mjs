/* PitFlow ── 🧩 **日付がバラバラのPDFでも、同じQの伝票は1つにまとまる**（ブラウザ・PDF不要）
   ===================================================================
   ◎ゆうた報告（2026-10-02）
     🗣「必ずQごとにできるわけではない。正直入れるPDFの日付はバラバラ」
     🗣「1回目 ABCDEF、2回目 ABCDEFGHIJK の時、2回目は GHIJK しか読んでない？ or 更新できてない？
     　　1件金額が合わないと言われたが、渡してるPDFではすでに直ってて PitFlow とも合うはず」

   ◎正体
     Qの途中から（途中まで）のPDFは「一部」＝保存していなかった。
     月を開き直すと、そのQは前に残した**古い伝票**で組み直される → 直したはずの1件が「合わない」。

   ◎ここで見張ること（quarter-store.js の pitQMergeSaved）
     🔴🔴 ① 新しいPDFに入っている日は、**新しい伝票だけ**（前の古い金額は捨てる）
     🔴🔴 ② 新しいPDFの外の日は、前に残した伝票を生かす
     🔴  ③ 読んだ範囲がQの窓を全部覆ったら「まるごと」になる
     🔴  ④ 前の版の書類（読んだ範囲なし＝Qまるごと）とも合わせられる
     🔴  ⑤ 前の範囲と離れている時はまとめない（間の日の実績が「PitFlowだけ」に化けるため）
     🔴  ⑥ 保存の名前はQの窓で付き、一部なら「一部」と書く

   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_quarter_merge.mjs
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

const ctx = { console, setTimeout, clearTimeout };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(JS('quarter-store.js'), ctx);
const M = ctx.pitQMergeSaved;

const Q2 = { s: '2026-09-08', e: '2026-09-15' };
const slip = (d, no, yen) => ({ 売上日: d, 伝票: no, 金額: yen });
const yenOf = (soft, no) => (soft.find(x => x.伝票 === no) || {}).金額;

console.log('── ①② 1回目 ABCDEF → 2回目 ABCDEFGHIJK ──');
/* 1回目：9/8〜9/11 を読んだ（D の金額が古い） */
const doc1 = { 伝票: [slip('2026-09-08', 'A', 1000), slip('2026-09-09', 'B', 2000), slip('2026-09-10', 'C', 3000),
                     slip('2026-09-10', 'D', 9999), slip('2026-09-11', 'E', 5000), slip('2026-09-11', 'F', 6000)],
               読んだ範囲: { from: '2026-09-08', to: '2026-09-11' }, 全部: false, 走らせた日時: '2026-09-20T10:00:00Z' };
/* 2回目：9/8〜9/13 を読んだ（D は直っている・G〜K が増えた） */
const g2 = { from: '2026-09-08', to: '2026-09-13', soft: [
  slip('2026-09-08', 'A', 1000), slip('2026-09-09', 'B', 2000), slip('2026-09-10', 'C', 3000),
  slip('2026-09-10', 'D', 4000), slip('2026-09-11', 'E', 5000), slip('2026-09-11', 'F', 6000),
  slip('2026-09-12', 'G', 7000), slip('2026-09-12', 'H', 1), slip('2026-09-13', 'I', 2), slip('2026-09-13', 'J', 3), slip('2026-09-13', 'K', 4)] };
const m2 = M(g2, Q2, doc1);
ok('🔴🔴 直った D は新しい金額（古い 9,999 円が残らない）', yenOf(m2.soft, 'D') === 4000, m2.soft);
ok('🔴🔴 同じ伝票が二重にならない（11枚）', m2.soft.length === 11, m2.soft.length);
ok('🔴 範囲は 9/8〜9/13・まだ一部', m2.from === '2026-09-08' && m2.to === '2026-09-13' && m2.全部 === false, m2);

console.log('── ③ 3回目で Q がまるごとになる ──');
const doc2 = { 伝票: m2.soft, 読んだ範囲: { from: m2.from, to: m2.to }, 全部: false, 走らせた日時: '2026-09-25T10:00:00Z' };
const g3 = { from: '2026-09-12', to: '2026-09-15', soft: [slip('2026-09-12', 'G', 7000), slip('2026-09-14', 'L', 8000), slip('2026-09-15', 'M', 9000)] };
const m3 = M(g3, Q2, doc2);
ok('🔴🔴 PDFの外の日（9/8〜9/11）は前の伝票を生かす', ['A', 'B', 'C', 'D', 'E', 'F'].every(n => yenOf(m3.soft, n)), m3.soft.map(x => x.伝票));
ok('🔴🔴 PDFの日（9/12〜）は新しい伝票だけ（H〜K は消えた＝新しいPDFに無い）', !['H', 'I', 'J', 'K'].some(n => yenOf(m3.soft, n)), m3.soft.map(x => x.伝票));
ok('🔴 9/8〜9/15 を覆った＝まるごと', m3.全部 === true && m3.from === Q2.s && m3.to === Q2.e, m3);
ok('🔴 前から借りた伝票に読んだ時刻が付く', m3.soft.filter(x => x.伝票 === 'A')[0].読んだ === '2026-09-25T10:00:00Z');

console.log('── ④ 前の版の書類（Qまるごと・読んだ範囲なし） ──');
const old = { 伝票: [slip('2026-09-08', 'A', 1000), slip('2026-09-12', 'D', 9999)], 期間: { from: Q2.s, to: Q2.e }, 走らせた日時: 'x' };
const m4 = M({ from: '2026-09-10', to: '2026-09-15', soft: [slip('2026-09-12', 'D', 4000)] }, Q2, old);
ok('🔴 まるごとのまま・D は新しい金額', m4.全部 === true && yenOf(m4.soft, 'D') === 4000 && yenOf(m4.soft, 'A') === 1000, m4);

console.log('── ⑤ 離れている時はまとめない ──');
const far = { 伝票: [slip('2026-09-08', 'A', 1000)], 読んだ範囲: { from: '2026-09-08', to: '2026-09-09' }, 全部: false };
const m5 = M({ from: '2026-09-13', to: '2026-09-15', soft: [] }, Q2, far);
ok('🔴 離れている＝まとめない', m5 && m5.離れている === true, m5);
const near = M({ from: '2026-09-10', to: '2026-09-15', soft: [] }, Q2, far);
ok('🔴 隣り合う日（9/9 と 9/10）はまとめる', near && !near.離れている && near.全部 === true, near);

console.log('── ⑥ 保存の作り（コード） ──');
const store = JS('quarter-store.js'), view = JS('quarter.js');
ok('🔴 書類の名前はQの窓（opt.q）で付ける', /runId\(qf, qt\)/.test(store));
ok('🔴 書類に読んだ範囲と「まるごとか」を残す', /読んだ範囲: \{ from: s\(res\.期間\.from\)/.test(store) && /全部: d\.全部/.test(store));
ok('🔴 一部の組も残す（まとめられなかった組は残さない）', /!g\.保存しない && \(g\.全部 \|\| g\.q\)/.test(view));
ok('🔴 PDFを読んだら、一部の組を前の伝票とまとめてから突き合わせる', /mergePartial\(U\.groups\)\.then/.test(view));
ok('🔴 開き直した一部の書類は、読んだ範囲だけで突き合わせる', /r\.全部 === false/.test(view) && /pitQCollect\(\{ from: gf, to: gt \}\)/.test(view));
ok('🔴 直したあとの保存もQの窓の名前で', /q: q, 全部: g \? !!g\.全部 : true/.test(view));

console.log(fail ? `⚠ ${pass} OK / ${fail} NG` : `✅ 全部緑（${pass}件）`);
process.exit(fail ? 1 : 0);
