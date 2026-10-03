/* PitFlow ── データチェック：社員の車は「空」を言わない（ブラウザ不要）
   ===================================================================
   ◎ゆうた指定（2026-10-03・D02-637202）
     🗣「大西さん、これは社員の作業タイプが入ってると思うけど、社員スイッチは言葉の通り社員だから、もろもろないってなくても OK にして」
   ◎ここで見張ること
     🔴🔴 社員（workSpecials に employee）の車は D01（必須が空）・D02（入れたほうがいい項目が空）・D03（漢字の名前が空）・D04（電話番号が空）を出さない
     🔴 社員でない車は今までどおり出る
   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_inspect_employee.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + JSON.stringify(x) : '')); } };

const ctx = { console, state: { cards: [], settings: {}, staff: [], customers: [], loaners: [], companyCars: [], loanerAssigns: [] },
  /* 空の項目は見張りの側で決める（物差しそのものは pit-share.js の別の見張りが見ている） */
  pitCardMisses: () => ({ red: [{ key: 'reserveDate', label: '入庫日' }], yellow: [{ key: 'tel', label: 'TEL' }, { key: 'inTime', label: '入庫時刻' }] }),
  pitCardActiveCust: () => true };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(process.cwd(), 'js', 'inspect-rules.js'), 'utf8'), ctx);

const cards = [
  { id: 'emp_live', status: 'outsource', workSpecials: ['employee', 'insurance'], customer: '大西 美咲' },
  { id: 'emp_done', status: 'returned', workSpecials: ['employee'], customer: '', kana: 'オオニシ', tel: '' },
  { id: 'cust_live', status: 'outsource', workSpecials: [], customer: '一般 太郎' },
  { id: 'cust_done', status: 'returned', workSpecials: [], customer: '', kana: 'イッパン', tel: '' }
];
const res = ctx.pitInspectRun({ cards, today: '2026-10-03' });
const by = {}; (res.findings || []).forEach(f => { (by[f.ruleId] = by[f.ruleId] || []).push(f.refId); });
const has = (rule, id) => (by[rule] || []).includes(id);
ok('🔴🔴 社員の車：D01・D02 を出さない', !has('D01', 'emp_live') && !has('D02', 'emp_live'), by);
ok('🔴🔴 社員の車：D03（漢字の名前）・D04（電話番号）を出さない', !has('D03', 'emp_done') && !has('D04', 'emp_done'), by);
ok('🔴 社員でない車は今までどおり D01・D02 が出る', has('D01', 'cust_live') && has('D02', 'cust_live'), by);
ok('🔴 社員でない車は今までどおり D03・D04 が出る', has('D03', 'cust_done') && has('D04', 'cust_done'), by);

console.log(fail ? `⚠ ${pass} OK / ${fail} NG` : `✅ 全部緑（${pass}件）`);
process.exit(fail ? 1 : 0);
