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

console.log('\n■ 入力チェック：漢字が空でもカナが入っていればお客様名はOK');
const cdSrc = read('card-detail.js');
{
  const i = cdSrc.indexOf('function _cardMarkMisses(c, root){');
  const j = cdSrc.indexOf('/* 再描画後に赤枠を貼り直す', i);
  if (i < 0 || j < 0 || j < i) throw new Error('card-detail.js から _cardMarkMisses を切り出せません（構成が変わった？）');
  var MISS_FN = cdSrc.slice(i, j);
}
const markMisses = new Function(MISS_FN + '\nreturn _cardMarkMisses;')();
/* root は「赤枠を付ける相手が1つも見つからない入れ物」で足りる（返ってくる未入力ラベルだけ見る） */
const fakeRoot = { querySelector: () => null };
const base = { tel:'090-0000-0000', boardId:'default', maker:'トヨタ', car:'アクア',
               reserveDate:'2026-08-10', workType:'oil', dropType:'wait' };
const miss = c => markMisses(c, fakeRoot);

eq('漢字あり＝未入力なし',        miss({ ...base, customer:'小林 勇太', kana:'コバヤシ ユウタ' }), []);
eq('カナだけ＝未入力なし',        miss({ ...base, customer:'',         kana:'コバヤシ ユウタ' }), []);
eq('カナだけ（姓のみ）でもOK',    miss({ ...base, customer:'',         kana:'コバヤシ' }), []);
eq('両方空＝お客様名が未入力',    miss({ ...base, customer:'',         kana:'' }), ['お客様名']);
eq('両方空白だけ＝未入力',        miss({ ...base, customer:'  ',       kana:'　' }), ['お客様名']);
eq('他の未入力は今までどおり出る',miss({ ...base, customer:'', kana:'コバヤシ', tel:'', car:'' }), ['TEL','車種（グレード）']);

console.log('\n■ 車検のときだけ「諸費用」も必須（v1.40.0・ゆうた指定）');
{
  const shaken = { ...base, customer:'小林 勇太', workType:'shaken', workTypes:['shaken'] };
  const oil    = { ...base, customer:'小林 勇太', workType:'oil',    workTypes:['oil'] };
  eq('車検で諸費用が空＝未入力に出る',      miss({ ...shaken, feeAmount:null }), ['諸費用（車検）']);
  eq('車検で諸費用が入っていればOK',        miss({ ...shaken, feeAmount:30000 }), []);
  eq('0円と決めた時も通す',                 miss({ ...shaken, feeAmount:0 }), []);
  eq('空文字も未入力あつかい',              miss({ ...shaken, feeAmount:'' }), ['諸費用（車検）']);
  eq('🔴 車検以外は今までどおり任意',       miss({ ...oil, feeAmount:null }), []);
  eq('車検を含む複数選択でも対象',          miss({ ...base, customer:'小林 勇太', workTypes:['oil','shaken'], feeAmount:null }), ['諸費用（車検）']);
  eq('ほかの未入力と一緒に並ぶ',            miss({ ...shaken, feeAmount:null, tel:'' }), ['TEL','諸費用（車検）']);
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
