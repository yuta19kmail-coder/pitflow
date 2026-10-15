/* =====================================================================
   PitFlow ── 🔴 **呼んでいる記録の関数が、本当にあるか**（v2.185.0・棚卸し S-26）
   ---------------------------------------------------------------------
   ◎なぜ要るか：顧客まわり（登録・名前/ナンバー変更・統合・ダブり）は `if (window.pitOpLog) pitOpLog(…)` で
     記録していたが、**pitOpLog がどこにも無く**、操作ログに1件も入っていなかった（黙って飛ばしていた）。
   ◎見張るもの
     ① js の中で呼んでいる記録の関数（pit…Log… / logFlow…）が、どこかで定義されている
     ② pitOpLog は pitLog へつながり、操作ログに1行入る
   ===================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + JSON.stringify(x) : '')); } };
const DIR = path.join(process.cwd(), 'js');
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.js') && !/^coreflow-en-dict/.test(f));
const src = {}; files.forEach(f => { src[f] = fs.readFileSync(path.join(DIR, f), 'utf8'); });
const all = Object.values(src).join('\n');

console.log('\n── ① 呼んでいる記録の関数が定義されているか ──');
const called = new Set();
const re = /\b(?:window\.|w\.)?((?:pit[A-Za-z]*Log[A-Za-z]*|logFlow[A-Za-z]*))\s*\(/g;
for (const f of files) { let m; while ((m = re.exec(src[f]))) called.add(m[1]); }
const defined = n => new RegExp('(?:window|w)\\.' + n + '\\s*=|function\\s+' + n + '\\s*\\(|\\b(?:var|let|const)\\s+' + n + '\\s*=').test(all);
const 無い = [...called].filter(n => !defined(n));
ok('🔴 呼んでいる記録の関数は全部ある（' + called.size + '種）', 無い.length === 0, 無い);
ok('🔴 pitOpLog がある', defined('pitOpLog'));

console.log('\n── ② pitOpLog は操作ログに1行入れる ──');
{
  const ctx = { console: { log() {}, warn() {}, error() {} } };
  ctx.window = ctx;
  const store = {};
  ctx.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } };
  ctx.document = { getElementById: () => null, addEventListener() {}, querySelector: () => null };
  ctx.state = { currentView: 'today' };
  ctx.fb = null; ctx.PIT_CLOUD = false;
  vm.createContext(ctx);
  try { vm.runInContext(src['oplog-pit.js'], ctx); } catch (e) { console.log('  （読み込みで ' + e.message + '）'); }
  let 書いた = null;
  const 本物 = ctx.pitLog;
  ctx.pitLog = function (a, o) { 書いた = { a, o }; return 本物 && 本物.apply(this, arguments); };
  try { if (ctx.pitOpLog) ctx.pitOpLog('顧客を登録', '山田 様 / タント'); } catch (e) {}
  ok('🔴 pitOpLog を呼ぶと pitLog に届く', !!書いた && 書いた.a === '顧客を登録' && 書いた.o && /山田/.test(書いた.o.label), 書いた);
}

console.log('\n' + (fail ? '  ❌ ' + fail + '件 赤／' + pass + '件 緑' : '  ✅ 全部そろっています（' + pass + '件）'));
process.exit(fail ? 1 : 0);
