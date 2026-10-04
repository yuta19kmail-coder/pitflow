/* PitFlow ── 当日ボード：休憩の始まりちょうどで終わる時間の範囲は、休憩の前に置く（ブラウザ不要）
   ===================================================================
   ◎ゆうた報告（2026-10-04）
     🗣「当日ボードで、返車が 11:00〜12:00 の予定で、12:00〜の昼休みに被る枠に入ってる。
     　　11〜12時に行くね、の言い方は結構あると思う」
   ◎ここで見張ること
     🔴🔴 11:00-12:00（範囲・休憩の始まりで終わる）… 昼休みの前
     🔴  12:00（点）………………………………… 昼休みの中（今までどおり）
     🔴  11:30-12:30（休憩にまたがる範囲）………… 昼休みの中
     🔴  12:30-13:30 ………………………………… 昼休みの後（15:30 の休憩の前）
     🔴  15:00-15:30 ………………………………… 15:30 の休憩の前
     🔴  時刻なし ……………………………………… いちばん後ろ（消えない）
     🔴  並び順はそのまま（同じ区切りの中で入れ替わらない）
   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_today_break.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + JSON.stringify(x) : '')); } };

const src = fs.readFileSync(path.join(process.cwd(), 'js', 'today.js'), 'utf8');
const share = fs.readFileSync(path.join(process.cwd(), 'js', 'pit-share.js'), 'utf8');
/* pit-share.js から並びの物差し（pitTimeQuick / pitTimeMin とその仲間）だけを取り出す */
function cut(name){ const i = share.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = share.indexOf('{', i); for (; j < share.length; j++){ if (share[j] === '{') d++; else if (share[j] === '}' && --d === 0) break; } return share.slice(i, j + 1); }
const pre = share.match(/var PIT_TIME_ALL[\s\S]*?;\n/) ? share.match(/var PIT_TIME_ALL[\s\S]*?;\n/)[0] : '';
const ctx = { console };
ctx.window = ctx; vm.createContext(ctx);
/* ボタンの言葉（AM・朝一 など）の表はここでは要らない＝空にしておく（範囲と点の時刻だけを見る） */
const bits = 'var _pitTimeByLabel = {};\n' + ['pitTimeQuick', 'pitTimeMin'].map(cut).filter(Boolean).join('\n');
try { vm.runInContext(pre + bits + '\nwindow.pitTimeMin = pitTimeMin;', ctx); } catch (e) { console.log('（物差しの取り出しに失敗：' + e.message + '）'); }
const fn = (src.match(/const TODAY_BREAKS = \[[\s\S]*?\];/) || [''])[0] + '\n'
         + (src.match(/function _todMin\(t\)\{[\s\S]*?\n\}/) || [''])[0] + '\n'
         + (src.match(/function _todBuildRows\(cards, isReturn\)\{[\s\S]*?\n\}/) || [''])[0]
         + '\nwindow._todBuildRows = _todBuildRows;';
vm.runInContext(fn, ctx);
ctx.pitReturnSortMin = (c) => ctx.pitTimeMin(c.returnTime);

ok('並びの物差し（pitTimeMin）が範囲を終わりで数える前提', Math.floor(ctx.pitTimeMin('11:00-12:00')) === 720 && ctx.pitTimeMin('12:00') === 720, [ctx.pitTimeMin('11:00-12:00'), ctx.pitTimeMin('12:00')]);
const cards = [
  { id: 'a', returnTime: '10:00' },
  { id: 'r1112', returnTime: '11:00-12:00' },
  { id: 'p12', returnTime: '12:00' },
  { id: 'r1130', returnTime: '11:30-12:30' },
  { id: 'r1230', returnTime: '12:30-13:30' },
  { id: 'r1500', returnTime: '15:00-15:30' },
  { id: 'none', returnTime: '' }
].sort((x, y) => ctx.pitTimeMin(x.returnTime) - ctx.pitTimeMin(y.returnTime));
const B = ctx._todBuildRows(cards, true);
const where = {}; B.forEach((b, i) => b.cards.forEach(c => { where[c.id] = i + ':' + b.type + (b.from ? '@' + b.from : ''); }));
ok('🔴🔴 11:00-12:00 は昼休みの前', where.r1112 === '0:seg', where);
ok('🔴 12:00 ちょうど（点）は昼休みの中', where.p12 === '1:break@12:00', where);
ok('🔴 11:30-12:30（またがる）は昼休みの中', where.r1130 === '1:break@12:00', where);
ok('🔴 12:30-13:30 は昼休みの後・15:30 の休憩の前', where.r1230 === '2:seg', where);
ok('🔴 15:00-15:30 は 15:30 の休憩の前', where.r1500 === '2:seg', where);
ok('🔴 時刻なしはいちばん後ろ（消えない）', where.none === '4:seg', where);
ok('🔴 区切りの中の並び順はそのまま', B[0].cards.map(c => c.id).join() === 'a,r1112', B[0].cards.map(c => c.id));

console.log(fail ? `⚠ ${pass} OK / ${fail} NG` : `✅ 全部緑（${pass}件）`);
process.exit(fail ? 1 : 0);
