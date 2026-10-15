/* PitFlow v2.186.0 ── 🔴🔴 操作ログは**誰も消せない**（マスターも）の見張り（ブラウザは使わない）
   -------------------------------------------------------------------
   ◎決まり⑧（2026-10-15・ゆうた「何があってもどうだったか？を確認できれば人力で戻せる」）
     操作ログは作るだけ。直す・消す道は作らない。ルール（pitAuditLogs の delete）も誰も消せない形にする。
     ⚠ v1.84.0〜v2.185.x にあった「マスターだけ選んでまとめて消す」（チェックBOX・［選んだ行を消す］）は外した。
       この見張りは前はその消し方を見張っていた＝いまは「無いこと」を見張る。

   ◎ここで見張ること
     ① マスターで開いても、チェックBOXも［選んだ行を消す］も出ない（本番・練習用とも）
     ② 消す入口（pitOplogPick／pitOplogPickAll／pitOplogDeleteSelected）が無い
     ③ oplog-pit.js に pitAuditLogs を消す書き方（delete／batch）が無い
     ④ 記録を残す（pitLog）・読む・絞り込みは今までどおり

   ◎使い方
     node _見張り/test_oplog_del.mjs                                    */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };
const src = fs.readFileSync(path.join(process.cwd(), 'js', 'oplog-pit.js'), 'utf8');
const 素 = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');

function 開く(cloud) {
  const box = { innerHTML: '' };
  const store = {};
  const ctx = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, JSON, Date, Math, Promise,
    document: { getElementById: (id) => id === 'oplog-body' ? box : null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    pitIsMaster: () => true, pitIsAdmin: () => true, pitCurrentStaffName: () => 'ゆうた' };
  ctx.window = ctx;
  ctx.state = { currentView: 'oplog', staff: [] };
  const 消した = [];
  if (cloud) {
    ctx.PIT_CLOUD = true;
    const col = { add: () => Promise.resolve({ id: 'n1' }), doc: (id) => ({ delete: () => { 消した.push(id); return Promise.resolve(); } }),
      orderBy: () => ({ limit: () => ({ get: () => Promise.resolve({ forEach: (f) => [{ id: 'd1', data: () => ({ action: '予約を作成', label: '山田 様', userName: '大野', timeStr: '10/15 9:00' }) }].forEach(f) }) }) }) };
    ctx.fb = { ready: true, currentUser: { uid: 'u1' }, company: () => ({ collection: () => col }), serverTimestamp: () => 0,
      db: { batch: () => ({ delete: (r) => 消した.push(r), commit: () => Promise.resolve() }) } };
  }
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'oplog-pit.js' });
  return { ctx, box, 消した };
}

for (const cloud of [false, true]) {
  console.log('\n── ' + (cloud ? '本番（クラウド）' : '練習用サイト（端末の中）') + '・マスターで開く ──');
  const { ctx, box, 消した } = 開く(cloud);
  ctx.pitLog('予約を作成', { label: '佐藤 様 / タント', cardId: 'c1' });
  ctx.renderOplog(); await new Promise(r => setTimeout(r, 20)); ctx.renderOplog();
  ok('記録は今までどおり出る', /予約を作成/.test(box.innerHTML), box.innerHTML.slice(0, 200));
  ok('🔴🔴 チェックBOXが出ない', !/type="checkbox"/.test(box.innerHTML));
  ok('🔴🔴 ［選んだ行を消す］が出ない', !/op-delsel|選んだ行を消す|消す<\/span>/.test(box.innerHTML));
  ok('🔴 消す入口が無い（直接呼んでも消えない）', typeof ctx.pitOplogDeleteSelected !== 'function' && typeof ctx.pitOplogPick !== 'function' && typeof ctx.pitOplogPickAll !== 'function');
  ok('何も消していない', 消した.length === 0, 消した);
  ctx.pitOplogSearch('佐藤');
  ok('絞り込みは今までどおり', typeof ctx.pitOplogSearch === 'function');
}

console.log('\n── 中身の文字（消す書き方が無い） ──');
ok('🔴 delete（1件）を書いていない', !/\.delete\(\)/.test(素));
ok('🔴 batch でまとめて消していない', !/batch\(\)/.test(素) && !/batch\.delete/.test(素));
ok('マスター判定（canDelete）も残っていない', !/canDelete/.test(素));

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' 件が緑／' + fail + ' 件が赤');
process.exit(fail ? 1 : 0);
