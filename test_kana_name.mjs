/* PitFlow v1.25.0 ── 漢字が分からない新規のお客様は「カナだけ」でOK のテスト
   -------------------------------------------------------------------
   ◎考え方
     本体は動かさない。**state.js の本物の pitCustName / pitCustSurname** と、
     **card-detail.js から切り出した本物の必須チェック（_cardMarkMisses）** を
     node で直接動かして確かめる。
     さらに「表示に使う各画面が pitCustName/pitCustSurname を通しているか」を
     ファイルの中身で見張る＝どれか1画面だけ直し忘れたら落ちる。
   ◎使い方（PitFlow のフォルダで）
     node test_kana_name.mjs                                                */
import fs from 'fs';
import path from 'path';

const dir = process.cwd();
const read = f => fs.readFileSync(path.join(dir, 'js', f), 'utf8');

let ok = 0, ng = 0;
function eq(label, got, want){
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { ok++; console.log('  OK  ' + label); }
  else { ng++; console.log('  NG  ' + label + '\n        期待: ' + b + '\n        実際: ' + a); }
}
function yes(label, cond){ eq(label, !!cond, true); }

/* ---- state.js から表示名の関数だけ切り出す ---- */
const stateSrc = read('state.js');
{
  const i = stateSrc.indexOf('function pitSurname(name){');
  const j = stateSrc.indexOf('/* v0.85.0 受付タイプの表示ラベル');
  if (i < 0 || j < 0 || j < i) throw new Error('state.js から pitSurname / pitCustName を切り出せません（構成が変わった？）');
  var NAME_FNS = stateSrc.slice(i, j);
}
const N = new Function('window', NAME_FNS + '\nreturn { pitSurname, pitCustName, pitCustSurname };')({});

console.log('\n■ 表示名＝漢字があれば漢字／無ければカナ');
eq('漢字あり',              N.pitCustName({ customer:'小林 勇太', kana:'コバヤシ ユウタ' }), '小林 勇太');
eq('漢字が空ならカナ',      N.pitCustName({ customer:'',         kana:'コバヤシ ユウタ' }), 'コバヤシ ユウタ');
eq('漢字が空白だけでもカナ',N.pitCustName({ customer:'   ',      kana:'コバヤシ ユウタ' }), 'コバヤシ ユウタ');
eq('両方空',                N.pitCustName({ customer:'',         kana:'' }), '');
eq('カナが無い（漢字だけ）',N.pitCustName({ customer:'小林 勇太' }), '小林 勇太');
eq('カードそのものが無い',  N.pitCustName(null), '');

console.log('\n■ カード用の短い表示名（姓だけ／法人はフル・略記）');
eq('漢字の姓',        N.pitCustSurname({ customer:'小林 勇太', kana:'コバヤシ ユウタ' }), '小林');
eq('カナでも姓だけ',  N.pitCustSurname({ customer:'',         kana:'コバヤシ ユウタ' }), 'コバヤシ');
eq('法人はフル＋略記', N.pitCustSurname({ customer:'小林モータース株式会社' }), '小林モータース㈱');
eq('カナの法人もフル', N.pitCustSurname({ customer:'', kana:'コバヤシモータースカブシキガイシャ' }), 'コバヤシモータースカブシキガイシャ');

/* 🔴 v1.76.0（ゆうた指定）で色分けが変わった。
   　・**カナ＝赤**（無いと保存できない）／**漢字の名前＝黄**（入れたほうがいい）
   　・_cardMarkMisses が返すのは配列ではなく **{ red, yellow, all }**
   ⚠ この試験は「表示名は漢字→カナ」という v1.25.0 の話が壊れていないかを見る所。
   　 色分けそのものの見張りは test_card_check.mjs が本体。 */
console.log('\n■ 入力チェック：カナは赤（必須）／漢字の名前は黄（入れたほうがいい）');
const cdSrc = read('card-detail.js');
{
  const i = cdSrc.indexOf('function _cardMarkMisses(c, root){');
  const j = cdSrc.indexOf('/* 再描画後に赤枠を貼り直す', i);
  if (i < 0 || j < 0 || j < i) throw new Error('card-detail.js から _cardMarkMisses を切り出せません（構成が変わった？）');
  var MISS_FN = cdSrc.slice(i, j);
}
const markMisses = new Function(MISS_FN + '\nreturn _cardMarkMisses;')();
/* root は「枠を付ける相手が1つも見つからない入れ物」で足りる（返ってくるラベルだけ見る） */
const fakeRoot = { querySelector: () => null };
/* 赤も黄も全部埋まっている状態を土台にする＝見たい項目だけを空にして比べられる */
const base = { customer:'小林 勇太', kana:'コバヤシ ユウタ', repeat:'repeater',
               tel:'090-0000-0000', boardId:'default', maker:'トヨタ', car:'アクア',
               reserveDate:'2026-08-10', reserveTime:'10:00', menu:'オイル交換',
               workType:'oil', dropType:'wait' };
const red = c => markMisses(c, fakeRoot).red;
const yel = c => markMisses(c, fakeRoot).yellow;

eq('全部入り＝赤なし',            red({ ...base }), []);
eq('全部入り＝黄もなし',          yel({ ...base }), []);
eq('漢字が空でも赤にはならない',  red({ ...base, customer:'' }), []);
eq('漢字が空＝黄に出る',          yel({ ...base, customer:'' }), ['お客様名（漢字）']);
eq('漢字が空白だけでも黄',        yel({ ...base, customer:'  ' }), ['お客様名（漢字）']);
eq('🔴 カナが空＝赤に出る',       red({ ...base, kana:'' }), ['カナ']);
eq('カナが空白だけでも赤',        red({ ...base, kana:'　' }), ['カナ']);
eq('両方空＝カナだけ赤・漢字は黄',red({ ...base, customer:'', kana:'' }), ['カナ']);
/* 🔴 v1.89.0（ゆうた指定）TEL は赤 → 黄へ格下げ。空でも保存できる。 */
eq('🔴 TEL は赤ではない',          red({ ...base, tel:'' }), []);
eq('🔴 TEL は黄に出る',            yel({ ...base, tel:'' }), ['TEL']);
eq('車種は黄に落ちた',            yel({ ...base, car:'' }), ['車種（グレード）']);
eq('赤が複数なら並ぶ',            red({ ...base, kana:'', dropType:'' }), ['カナ','受付タイプ']);
eq('all は赤＋黄をまとめたもの',  markMisses({ ...base, kana:'', car:'' }, fakeRoot).all, ['カナ','車種（グレード）']);

console.log('\n■ 車検のときだけ「諸費用」も必須（v1.40.0・ゆうた指定／今も赤）');
{
  const shaken = { ...base, workType:'shaken', workTypes:['shaken'] };
  const oil    = { ...base, workType:'oil',    workTypes:['oil'] };
  eq('車検で諸費用が空＝赤に出る',          red({ ...shaken, feeAmount:null }), ['諸費用（車検）']);
  eq('車検で諸費用が入っていればOK',        red({ ...shaken, feeAmount:30000 }), []);
  eq('0円と決めた時も通す',                 red({ ...shaken, feeAmount:0 }), []);
  eq('空文字も未入力あつかい',              red({ ...shaken, feeAmount:'' }), ['諸費用（車検）']);
  eq('🔴 車検以外は今までどおり任意',       red({ ...oil, feeAmount:null }), []);
  eq('車検を含む複数選択でも対象',          red({ ...base, workTypes:['oil','shaken'], feeAmount:null }), ['諸費用（車検）']);
  eq('ほかの赤と一緒に並ぶ',                red({ ...shaken, feeAmount:null, kana:'' }), ['カナ','諸費用（車検）']);
}

console.log('\n■ 表示している画面が、ちゃんと共通の表示名を通しているか');
const WATCH = [
  ['reserve.js',     '予約ビューのカード'],
  ['today.js',       '当日ビュー'],
  ['return.js',      '返車ビュー'],
  ['card-view.js',   '予約詳細'],
  ['card-hover.js',  'ホバー情報カード'],
  ['search.js',      '検索結果'],
  ['parking.js',     '駐車場ビュー'],
  ['pit-floor.js',   'PIT配置図'],
  ['undetermined.js','未定ビュー'],
  ['mydash.js',      'マイダッシュ'],
  ['loaner.js',      '代車ビュー'],
  ['card-detail.js', '新規予約カード'],
  ['blank-cards.js', '空カードの片付け'],
];
WATCH.forEach(([f, label]) => {
  const s = read(f);
  yes(label + ' が表示名の共通関数を通している', /pitCustName|pitCustSurname/.test(s));
});

console.log('\n■ 表紙印刷のお名前欄');
{
  const s = read('cover-print.js');
  yes('お名前欄（name トークン）が表示名を通している', /name:\s*\(window\.pitCustName/.test(s));
}

console.log('\n■ 保存や検索は今までどおり（表示だけの話にとどめている）');
{
  const s = read('search.js');
  yes('検索は c.customer と c.kana の両方を今までどおり見ている',
      /c\.resNo,\s*c\.customer,\s*c\.kana/.test(s));
  const cd = read('card-detail.js');
  yes('保存は姓名の合成のまま（カナを漢字欄に書き込んでいない）',
      /c\.customer = \[c\.sei, c\.mei\]\.filter\(Boolean\)\.join\(' '\);/.test(cd));
}

console.log('\n────────────────────────────');
console.log(ok + ' OK / ' + ng + ' NG');
process.exit(ng ? 1 : 0);
