/* ===================================================================
   test_settings_tidy.mjs － 設定画面の整理（PitFlow v2.50.0・ゆうた指定 2026-09-01）
   -------------------------------------------------------------------
   🗣「今みたいな単機能を機能つける時に使ったりしてるから、今後使わないであろうものも結構あるはず。
   　そのあたりを消去して。あとサイドバーを付けた方がいいのか？」

   ◎守るもの
     🔴 ① **1回きりの道具は外した**（過去の伝票を取り込む／顧客データの取込（本番）／空の予約カードを消去）
     🔴 ② **見るだけの写しは外した**（作業タイプ＝本体はルールページ）
     🔴🔴 ③ **外したのは道具だけ。防ぐ側は残っている**（空のカードを作らせない仕掛け）
     🔴 ④ グループは4つ。**道具と危ないものはたたむ**
     🔴 ⑤ 外から足す箱（引っ越し・初期化）が**正しいグループに入る**
     🔴🔴 ⑥ **危ないものは、たたんである時から危ないと分かる**
     ⚠ ⑦ 消したファイルは `_to_delete` に置いてある（消していない）

   ◎使い方
       node test_settings_tidy.mjs
       node test_settings_tidy.mjs --break=1  … 1回きりの道具を設定に戻す → ①が赤
       node test_settings_tidy.mjs --break=2  … 危ないものを普通のたたみに戻す → ⑥が赤
   =================================================================== */
import fs from 'fs';
import path from 'path';

const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').split('=')[1] || '';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const JS   = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');
const CSS  = (f) => fs.readFileSync(path.join(process.cwd(), 'css', f), 'utf8');
const HTML = () => fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
function bend(name, src){
  if (BREAK === '1' && name === 'settings.js')
    return src + "\n/* 戻した */ var _x = 'pitPastImportOpen()';\n";
  if (BREAK === '2' && name === 'polish.css')
    return src.replace('.ps-fold-danger > summary{ color:var(--red); }', '');
  return src;
}

const set = bend('settings.js', JS('settings.js'));
const idx = HTML();

console.log('\n── ① 1回きりの道具を外した ──');
{
  ok('🔴 過去の伝票を取り込む … 設定から消えた', set.indexOf('pitPastImportOpen()') < 0);
  ok('🔴 過去の伝票を取り込む … 読み込みも外した', idx.indexOf('js/past-import.js') < 0);
  ok('🔴 顧客データの取込（本番）… 読み込みを外した', idx.indexOf('js/import-cloud.js') < 0);
  ok('🔴 空の予約カードを消去する … 設定の箱を外した',
     JS('blank-cards.js').indexOf('空の予約カードを消去する</h4>') < 0);
  /* ⚠ 外したことは**記録に残す**（次の人が「なぜ無いのか」を追える） */
  ok('⚠ 外した理由が index.html に残っている', /v2\.50\.0 past-import\.js/.test(idx) && /v2\.50\.0 import-cloud\.js/.test(idx));
  /* 🗣「これも今は電源ボタンにあるから消去でいいでしょ？」＝**入口も1本にする** */
  ok('🔴🔴 全端末を今すぐ更新する … 設定から消えた（電源ボタンと二重だった）',
     set.indexOf("CFPower.force('app')") < 0);
  ok('🔴 電源ボタン側は生きている（消したのは入口だけ）',
     /全員の この画面を更新/.test(JS('coreflow-power.js')) && /force: doForce/.test(JS('coreflow-power.js')));
}

console.log('\n── ② 見るだけの写しを外した ──');
{
  ok('🔴 作業タイプ（見るだけ）が設定から消えた', set.indexOf('作業タイプ（メニュー）') < 0);
  ok('🔴 ルールページへの案内は残っている', /ルールページを開く/.test(set));
  ok('⚠ 本体（ルールページ）は生きている', fs.existsSync(path.join(process.cwd(), 'js', 'rules.js')));
}

console.log('\n── ③🔴🔴 外したのは道具だけ。防ぐ側は残っている ──');
{
  const bc = JS('blank-cards.js');
  ok('🔴🔴 空のカードを作らせない仕掛けは残っている',
     /function hookOpeners/.test(bc) && /function hookLeave/.test(bc) && /function hookSave/.test(bc));
  ok('🔴 その仕掛けはいまも掛けている', /hookOpeners\(\);/.test(bc) && /hookSave\(\);/.test(bc));
  /* ⚠ 使われなくなった関数を残さない（次に読む人が「まだ生きている」と勘違いする） */
  ['canShow', 'blanks', 'injectCSS', 'isCloud', 'isAdmin'].forEach(function(n){
    ok('⚠ 使われなくなった ' + n + ' を消した', bc.indexOf('function ' + n) < 0);
  });
}

console.log('\n── ④ グループは4つ。道具と危ないものはたたむ ──');
{
  ok('🔴 ① 毎日の設定', /① 毎日の設定/.test(set));
  ok('🔴 ② 見え方', /② 見え方/.test(set));
  ok('🔴 ③ 道具（たたむ）', /<details class="ps-fold">/.test(set) && /道具/.test(set));
  ok('🔴 ④ 危ないもの（たたむ）', /ps-fold ps-fold-danger/.test(set));
  ok('⚠ サイドバーは付けていない（覚える手間を増やさない）', !/ps-side|settings-nav/.test(set));
  /* 🔴 順番を変えただけで、保存する所は触っていない */
  ok('🔴🔴 保存する所は触っていない（読む id が全部残っている）',
     ['ps-lot-pit','ps-lot-yard','ps-lot-park','ps-lot-extra','ps-hold','ps-over-warn','ps-over-danger']
       .every(id => set.indexOf(id) >= 0));
}

console.log('\n── ⑤ 外から足す箱が正しいグループに入る ──');
{
  ok('🔴 引っ越しは「道具」の中へ', /ps-tools-body/.test(JS('maint-pit.js')));
  ok('🔴 初期化は「危ないもの」の中へ', /ps-danger-body/.test(JS('reset-pit.js')));
  ok('⚠ 場所が無い版でも落ちない（今までどおり一番下へ）',
     /ps-tools-body.\) \|\| document\.getElementById\('view-settings-body'\)/.test(JS('maint-pit.js'))
     && /ps-danger-body.\) \|\| d\.getElementById\('view-settings-body'\)/.test(JS('reset-pit.js')));
  ok('入れる場所が設定画面にある', /id="ps-tools-body"/.test(set) && /id="ps-danger-body"/.test(set));
}

console.log('\n── ⑥🔴🔴 危ないものは、たたんである時から危ないと分かる ──');
{
  const css = bend('polish.css', CSS('polish.css'));
  ok('🔴🔴 たたんだ見出しが赤い（開かないと分からない、をやらない）',
     /\.ps-fold-danger > summary\{[^}]*color:var\(--red\)/.test(css));
  ok('枠も赤い', /\.ps-fold-danger\{[^}]*border-color/.test(css));
  ok('たたむ／開くの印が出る', /\.ps-fold > summary::after/.test(css));
}

console.log('\n── ⑦ 消したファイルは _to_delete に置いてある ──');
{
  const dir = path.join(process.cwd(), '_to_delete');
  const ls = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  ok('🔴 past-import.js が _to_delete にある', ls.some(f => f.indexOf('past-import.js') === 0));
  ok('🔴 import-cloud.js が _to_delete にある', ls.some(f => f.indexOf('import-cloud.js') === 0));
  ok('⚠ js フォルダからは消えている',
     !fs.existsSync(path.join(process.cwd(), 'js', 'past-import.js'))
     && !fs.existsSync(path.join(process.cwd(), 'js', 'import-cloud.js')));
}

console.log('\n─────────────────────────────');
if (BREAK) {
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  if (fail > 0) { console.log('🟢 正しい＝壊したら赤くなった（この見張りは効いている）'); process.exit(0); }
  console.log('🔴 まずい＝壊したのに全部緑のまま。見張りが効いていない'); process.exit(1);
}
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
