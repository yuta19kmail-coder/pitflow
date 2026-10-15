/* =====================================================================
   PitFlow ── 顧客の編集は写しに対して行い、キャンセルしたら本物は変わらない（v2.185.0・棚卸し S-05）
   ---------------------------------------------------------------------
   ◎前の形：編集窓の「＋」「削除」を押した瞬間に本物の顧客を書き換えていた
     ＝車の行を削除→キャンセルでも、車が伝票・カルテNo・車体番号ごと消えたまま
   ◎見張るもの
     ① 編集窓で＋／削除を押しても、本物の顧客は変わらない（キャンセルで元のまま）
     ② 保存で画面から消えた車は、消さずにアーカイブ（印・誰・いつ）で残り、操作ログに1行
   ⚠ 画面（DOM）は最小の偽物：車の行は1つも無い＝「全部の行を消した」状態として扱う
   ===================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + JSON.stringify(x) : '')); } };

const 本物 = { id: 'k1', name: '山田', contacts: [{ tel: '090-1', label: '', primary: true }],
  vehicles: [{ id: 'v1', plate: '野田 300 あ 1', car: 'タント', karteNo: 'K-77', vin: 'LA600-123', boardId: 'default' }] };
const ctx = { console: { log() {}, warn() {}, error() {} } };
ctx.window = ctx;
const 記録 = [];
ctx.state = { customers: [JSON.parse(JSON.stringify(本物))], cards: [], staff: [], settings: {} };
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const modalSave = { getAttribute: () => "custSaveEdit('k1')" };
ctx.document = {
  getElementById: () => null,
  querySelector: (s) => (/cm-save/.test(s) ? modalSave : null),
  querySelectorAll: () => [],
  addEventListener() {}, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }),
  body: { appendChild() {} }
};
ctx.pitOpLog = (a, l) => 記録.push(a + ' / ' + l);
ctx.pitFlowMe = () => 'ゆうた';
ctx.PitDB = { save() {} };
ctx.renderCustomers = () => {};
vm.createContext(ctx);
try { vm.runInContext(fs.readFileSync(path.join(process.cwd(), 'js', 'customers.js'), 'utf8'), ctx, { filename: 'customers.js' }); }
catch (e) { console.log('  （読み込み：' + e.message + '）'); }
/* 窓の出し入れは見ない */
['openModal', 'closeModal'].forEach(n => { if (!ctx[n]) ctx[n] = () => {}; });

console.log('\n── ① ＋／削除を押しても本物は変わらない ──');
try { ctx.custEdit('k1'); } catch (e) { console.log('  （custEdit：' + e.message + '）'); }
try { ctx.custEditDelVehicle({ closest: () => null }); } catch (e) { console.log('  （削除：' + e.message + '）'); }
try { ctx.custEditAddContact(); } catch (e) { console.log('  （＋：' + e.message + '）'); }
const k = ctx.state.customers[0];
ok('🔴🔴 本物の車が残っている（伝票・カルテNo・車体番号ごと）', k.vehicles.length === 1 && k.vehicles[0].karteNo === 'K-77' && k.vehicles[0].vin === 'LA600-123', k.vehicles);
ok('🔴 本物の連絡先も変わっていない', JSON.stringify(k.contacts) === JSON.stringify(本物.contacts), k.contacts);

console.log('\n── ② 保存で消えた車はアーカイブで残る ──');
try { ctx.custSaveEdit('k1'); } catch (e) { console.log('  （保存：' + e.message + '）'); }
const v = (k.vehicles || []).find(x => x.id === 'v1');
ok('🔴🔴 車は消えずに残る', !!v, k.vehicles);
ok('🔴 アーカイブの印（誰・いつ）が付く', !!(v && v.archived && v.archivedAt && v.archivedBy === 'ゆうた'), v);
ok('伝票の手がかり（カルテNo・車体番号）も残る', !!(v && v.karteNo === 'K-77' && v.vin === 'LA600-123'), v);
ok('🔴 操作ログに1行', 記録.some(t => /車両を削除/.test(t) && /K-77/.test(t)), 記録);

console.log('\n' + (fail ? '  ❌ ' + fail + '件 赤／' + pass + '件 緑' : '  ✅ 全部そろっています（' + pass + '件）'));
process.exit(fail ? 1 : 0);
