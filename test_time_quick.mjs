/* PitFlow v1.33.0 ── 入庫時間のショートカット（AM／朝一／レッカー…）のテスト
   -------------------------------------------------------------------
   ◎考え方
     ① **state.js の本物の PIT_TIME_QUICK / pitTimeMin** を node で直接動かし、
        並び順（（）内のいちばん若い時刻／不明系は最後尾）を確かめる。
     ② **card-detail.js の本物の _normTime** で、言葉が時刻に化けないことを確かめる
        （「レッカー」の長音が - になって「レッカ」に切られる事故の見張り）。
     ③ 各画面が独自に時間を数えていないか（共通の物差しを通しているか）をファイルの中身で見張る。
   ◎使い方（PitFlow のフォルダで）
     node test_time_quick.mjs                                                */
import fs from 'fs';
import path from 'path';

const dir = process.cwd();
const read = f => fs.readFileSync(path.join(dir, 'js', f), 'utf8');

const stateSrc = read('state.js');
const cdSrc = read('card-detail.js');

/* ---- state.js から時間まわりだけ切り出す ---- */
{
  const a = stateSrc.indexOf('var PIT_TIME_ALL = [');   /* v1.60.0 表の名前が PIT_TIME_ALL（1本の表）に変わった */
  const b = stateSrc.indexOf('/* v0.85.0 受付タイプの表示ラベル');
  if (a < 0 || b < 0 || b < a) throw new Error('state.js から時間の定義を切り出せません（構成が変わった？）');
  var TIME_CODE = stateSrc.slice(a, b);
}
const W = {};
new Function('window', TIME_CODE)(W);

/* ---- card-detail.js から時刻の読み取りだけ切り出す ---- */
{
  const a = cdSrc.indexOf('function _timeHalf(s){');
  const b = cdSrc.indexOf('/* 時間ピッカー(input type=time)用の値');
  if (a < 0 || b < 0 || b < a) throw new Error('card-detail.js から _normTime を切り出せません（構成が変わった？）');
  var NORM = new Function('window', 'pitTimeQuick', cdSrc.slice(a, b) + '\nreturn { _normTime };')(W, W.pitTimeQuick);
}

let ok = 0, ng = 0;
function eq(label, got, want){
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { ok++; console.log('  ✅ ' + label + (typeof got === 'string' ? '  → 「' + got + '」' : '')); }
  else { ng++; console.log('  ❌ ' + label + '\n        期待: ' + b + '\n        実際: ' + a); }
}
function yes(label, cond, x = ''){ if (cond) { ok++; console.log('  ✅ ' + label); } else { ng++; console.log('  ❌ ' + label + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } }

const WANT = ['AM', 'PM', '朝一', 'お昼', '夕方', '決まり次第', 'レッカー', '鍵ポスト', '未定'];

console.log('\n── ① 中身と並び順（ゆうた指定のとおりか） ──');
eq('ボタンの並び', W.PIT_TIME_QUICK.map(t => t.label), WANT);
eq('時間ものは5つ', W.PIT_TIME_QUICK.filter(t => !t.unknown).map(t => t.label), ['AM','PM','朝一','お昼','夕方']);
eq('時刻不明は4つ', W.PIT_TIME_QUICK.filter(t => t.unknown).map(t => t.label), ['決まり次第','レッカー','鍵ポスト','未定']);
/* 🔴 v1.70.0 AM の終わりは 12:00 ではなく 12:59（午前は12時台まで＝ゆうた指定） */
eq('AM の時間', [W.pitTimeQuick('AM').from, W.pitTimeQuick('AM').to], ['09:00','12:59']);
eq('PM の時間', [W.pitTimeQuick('PM').from, W.pitTimeQuick('PM').to], ['13:00','19:00']);
eq('朝一の時間', [W.pitTimeQuick('朝一').from, W.pitTimeQuick('朝一').to], ['09:00','09:30']);
eq('お昼の時間', [W.pitTimeQuick('お昼').from, W.pitTimeQuick('お昼').to], ['12:00','13:00']);
eq('夕方の時間', [W.pitTimeQuick('夕方').from, W.pitTimeQuick('夕方').to], ['16:30','19:00']);

console.log('\n── ② 並び順の物差し（🔴 v1.70.0＝いちばん遅くなり得る時刻） ──');
eq('AM は 12時台のいちばん最後', Math.floor(W.pitTimeMin('AM')), 779);
eq('PM は 19:00',             Math.floor(W.pitTimeMin('PM')), 1140);
eq('朝一は 9:30',             Math.floor(W.pitTimeMin('朝一')), 570);
eq('お昼は 13:00',            Math.floor(W.pitTimeMin('お昼')), 780);
eq('夕方は 19:00',            Math.floor(W.pitTimeMin('夕方')), 1140);
eq('ふつうの時刻',            W.pitTimeMin('09:30'), 570);
eq('範囲は後ろの時刻',        Math.floor(W.pitTimeMin('09:00-10:00')), 600);

console.log('\n── ③ 実際に並べてみる ──');
{
  const list = ['未定','16:00','決まり次第','PM','朝一','','鍵ポスト','09:15','AM','レッカー','お昼','夕方','08:00'];
  const sorted = list.slice().sort((a, b) => W.pitTimeMin(a) - W.pitTimeMin(b));
  console.log('    ', JSON.stringify(sorted));
  /* 🔴 v1.70.0 朝一＝9:30／AM＝12時台の最後／お昼＝13:00／夕方・PM＝19:00（幅の広い PM が後ろ） */
  eq('時刻順→終わりの時刻→不明系→空 の順になる', sorted,
     ['08:00','09:15','朝一','AM','お昼','16:00','夕方','PM','決まり次第','レッカー','鍵ポスト','未定','']);
}
{
  /* 🔴 v1.70.0 終わりの時刻で決まる＝朝一（9:30）が先、AM（12時台の最後）が後ろ */
  yes('朝一 と AM は 朝一 が先', W.pitTimeMin('朝一') < W.pitTimeMin('AM'),
      [W.pitTimeMin('AM'), W.pitTimeMin('朝一')]);
  yes('不明系はどれも、どんな時刻より後ろ', ['決まり次第','レッカー','鍵ポスト','未定']
      .every(u => W.pitTimeMin(u) > W.pitTimeMin('23:59')));
  yes('不明系どうしの並びもボタン順',
      W.pitTimeMin('決まり次第') < W.pitTimeMin('レッカー') &&
      W.pitTimeMin('レッカー') < W.pitTimeMin('鍵ポスト') &&
      W.pitTimeMin('鍵ポスト') < W.pitTimeMin('未定'));
  yes('空（時間そのものが入っていない）はいちばん後ろ',
      W.pitTimeMin('') > W.pitTimeMin('未定'));
  yes('休憩バーの区切り（13:00＝780）と直接くらべられる',
      W.pitTimeMin('お昼') >= 780 && W.pitTimeMin('お昼') < 781, W.pitTimeMin('お昼'));
  yes('🔴 夕方と PM は同じ 19:00 で、幅の広い PM が後ろ',
      W.pitTimeMin('夕方') < W.pitTimeMin('PM'), [W.pitTimeMin('夕方'), W.pitTimeMin('PM')]);
}

console.log('\n── ④ 言葉が時刻に化けない（打ち直し・保存のたびに通る所） ──');
WANT.forEach(t => eq('「' + t + '」はそのまま', NORM._normTime(t), t));
eq('🔴 レッカーの長音が - に化けない', NORM._normTime('レッカー'), 'レッカー');

console.log('\n── ⑤ 時刻の書き方は今までどおり（退行していないこと） ──');
eq('900',        NORM._normTime('900'), '09:00');
eq('全角９：００', NORM._normTime('９：００'), '09:00');
eq('9時半',      NORM._normTime('9時半'), '09:30');
eq('九時半',     NORM._normTime('九時半'), '09:30');
eq('0900-1000',  NORM._normTime('0900-1000'), '09:00-10:00');
eq('9:00〜10:00', NORM._normTime('9:00〜10:00'), '09:00-10:00');

console.log('\n── ⑥ 各画面が共通の物差しを通しているか（配線チェック） ──');
yes('state.js が pitTimeMin を公開している', /window\.pitTimeMin\s*=/.test(stateSrc));
yes('card-detail.js のショートカットは state.js の定義から作っている',
    /const TIME_QUICK = \(window\.PIT_TIME_QUICK \|\| \[\]\)\.map/.test(cdSrc));
yes('card-detail.js の一覧が pitTimeMin を使っている', /const toMin = function \(s\)\{ return window\.pitTimeMin/.test(cdSrc));
[['today.js','当日ビュー'], ['reserve.js','予約ビュー'], ['return.js','返車ビュー'], ['mydash.js','マイダッシュ']]
  .forEach(([f, label]) => yes(label + ' が pitTimeMin を使っている', /pitTimeMin/.test(read(f))));
yes('reserve.js に独自の時刻数えが残っていない',
    !/const _min = function\(t\)\{ const m = String/.test(read('reserve.js')));
yes('return.js の文字くらべ（99:99）が残っていない', !/'99:99'/.test(read('return.js')));
yes('mydash.js の文字くらべ（localeCompare で時間）が残っていない',
    !/reserveTime \|\| '99'\)\.localeCompare/.test(read('mydash.js')));

console.log('\n── ⑦ 表紙印刷（時間欄に言葉がそのまま入る） ──');
{
  const cov = read('cover-print.js');
  yes('時間欄は c.reserveTime をそのまま渡している', /time:\s*c\.reserveTime \|\| ''/.test(cov));
  yes('時間欄にも自動縮小を付けた（言葉が入るため）', /'pcv-time':\s*\d+/.test(cov) && /fitBox\("pcv-time"/.test(cov));
  yes('{{time}} の文字に目印（id=pcv-time）を付けている',
      cov.indexOf('pcv-time"') >= 0 && cov.indexOf('{\\{time\\}\\}') >= 0);
}

console.log('\n===== ' + ok + ' OK / ' + ng + ' NG =====');
process.exit(ng ? 1 : 0);
