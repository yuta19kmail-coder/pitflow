/* PitFlow v1.26.0 ── 表紙印刷の代車欄は「車種名」を出す のテスト
   -------------------------------------------------------------------
   ◎考え方
     本体は動かさない。**cover-print.js から切り出した本物の loanerName / loanerVal**
     を node で動かし、表紙に出る文字そのものを確かめる。
     ⚠ 関数名や決めごとが変わるとここが落ちる。
   ◎使い方（PitFlow のフォルダで）
     node test_cover_loaner.mjs                                             */
import fs from 'fs';
import path from 'path';

const dir = process.cwd();
const src = fs.readFileSync(path.join(dir, 'js', 'cover-print.js'), 'utf8');

const i = src.indexOf('  /* 🔴 v1.26.0（ゆうた指定）表紙は通し番号を出さず');
const j = src.indexOf('  function loanerSpanVal(c){');
if (i < 0 || j < 0 || j < i) throw new Error('cover-print.js から loanerName / loanerVal を切り出せません（構成が変わった？）');
/* 途中の関数（DROP_FULL 等）は要らないので、代車まわりだけを拾う */
const cut = src.slice(i, j)
  .split('\n')
  .filter(l => !/^\s*var DROP_FULL/.test(l))
  .join('\n');

let ok = 0, ng = 0;
function eq(label, got, want){
  if (got === want) { ok++; console.log('  OK  ' + label + '  → 「' + got + '」'); }
  else { ng++; console.log('  NG  ' + label + '\n        期待: 「' + want + '」\n        実際: 「' + got + '」'); }
}

const LOANERS = [
  { id:'L05', name:'代車5',  number:5,  model:'アクア' },
  { id:'L12', name:'代車12', number:12, model:'N-BOX' },
  { id:'L99', name:'代車99', number:99, model:'' },      // 車種が未登録（古いデータ）
  { id:'L98', name:'代車98', number:98 },                // model キーそのものが無い
];
const win = { state: { loaners: LOANERS } };
const F = new Function('window', 'state',
  cut + '\nreturn { loanerName, loanerVal };')(win, win.state);

console.log('\n■ 代車欄＝車種名を素直に出す（通し番号は出さない）');
eq('アクア',  F.loanerVal({ needLoaner:true, loanerId:'L05' }), '有（アクア）');
eq('N-BOX',   F.loanerVal({ needLoaner:true, loanerId:'L12' }), '有（N-BOX）');

console.log('\n■ 「代車5」のような番号が出ていないこと');
[['L05','アクア'],['L12','N-BOX']].forEach(([id]) => {
  const v = F.loanerVal({ needLoaner:true, loanerId:id });
  if (/代車\s*\d/.test(v)) { ng++; console.log('  NG  ' + id + ' に番号が残っている → 「' + v + '」'); }
  else { ok++; console.log('  OK  ' + id + ' に番号が残っていない'); }
});

console.log('\n■ 車種が登録されていない代車は、呼び名で代替する（空にしない）');
eq('車種が空',        F.loanerVal({ needLoaner:true, loanerId:'L99' }), '有（代車99）');
eq('車種のキーが無い', F.loanerVal({ needLoaner:true, loanerId:'L98' }), '有（代車98）');

console.log('\n■ 今までどおりの動き（退行していないこと）');
eq('代車が不要',                F.loanerVal({ needLoaner:false }), '無');
eq('代車が要るが未選択',        F.loanerVal({ needLoaner:true, loanerId:'' }), '有');
eq('消えた代車を指している',    F.loanerVal({ needLoaner:true, loanerId:'L00' }), '有');
eq('名前を直接引く（車種名）',  F.loanerName('L05'), 'アクア');

console.log('\n────────────────────────────');
console.log(ok + ' OK / ' + ng + ' NG');
process.exit(ng ? 1 : 0);
