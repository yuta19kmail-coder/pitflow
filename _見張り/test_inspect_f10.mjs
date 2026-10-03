/* PitFlow ── データチェック F10「外注の戻り予定日を過ぎている」は、いま外注にいる車だけ（ブラウザ不要）
   ===================================================================
   ◎ゆうた報告（2026-10-03・F10-879283）
     🗣「外注のもどりで F10 が出てるんだけど、タスクから外したのに消えない。もしかして戻ってきたのを見てない？」
     ＝ ミニF56：8/18 外注 → 9/18 戻り（作業待ち）→ 10/2 作業完了。カードに戻り予定日 9/18 が残っていて出続けた
   ◎ここで見張ること
     🔴 外注にいて、戻り予定を過ぎた車 … 出る
     🔴🔴 外注から戻った車（作業待ち・作業完了・返車済み）… 戻り予定日が残っていても出ない
     🔴 外注にいて、戻り予定がまだ先 … 出ない
   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_inspect_f10.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + JSON.stringify(x) : '')); } };

const ctx = { console, state: { cards: [], settings: {}, staff: [], customers: [], loaners: [], companyCars: [], loanerAssigns: [] } };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(process.cwd(), 'js', 'inspect-rules.js'), 'utf8'), ctx);

const today = '2026-10-03';
const cards = [
  { id: 'still', status: 'outsource', outsourceTo: 'ブレス', outsourceDue: '2026-09-18', customer: 'A' },
  { id: 'back_work', status: 'work', outsourceTo: 'ブレス', outsourceDue: '2026-09-18', customer: 'B' },
  { id: 'back_done', status: 'workDone', outsourceTo: 'ブレス', outsourceDue: '2026-09-18', customer: 'C' },
  { id: 'not_yet', status: 'outsource', outsourceTo: 'ブレス', outsourceDue: '2026-10-10', customer: 'D' }
];
let res = null, err = '';
try { res = ctx.pitInspectRun({ cards, today }); } catch (e) { err = e.stack; }
ok('データチェックが走る', !!res, err);
const f10 = ((res && res.findings) || []).filter(f => f.ruleId === 'F10').map(f => f.refId).sort();
ok('🔴 外注にいて戻り予定を過ぎた車は出る', f10.includes('still'), f10);
ok('🔴🔴 外注から戻った車（作業待ち・作業完了）は出ない', !f10.includes('back_work') && !f10.includes('back_done'), f10);
ok('🔴 戻り予定がまだ先の車は出ない', !f10.includes('not_yet'), f10);

console.log(fail ? `⚠ ${pass} OK / ${fail} NG` : `✅ 全部緑（${pass}件）`);
process.exit(fail ? 1 : 0);
