/* =====================================================================
   PitFlow ── 名簿から自分を探す所の見張り（v2.185.3・2026-10-15）
   ---------------------------------------------------------------------
   玄関のメンバー管理の「外す」が完全削除から「在籍なし（active:false・removed の印）」に変わった。
   同じメールで在籍なしの古い書類が名簿に残る＝「uid の書類があればそれ」「メールの1件目」で止まると、
   古い方が先に当たって在籍中の本人まで入れなかった。
     ① 画面の入室（js/auth-pit.js findMyMember）
     ② AI の関数（functions/index.js assertAdmin）
   **在籍中の書類を先に拾う／在籍なししか無ければ入れない** を見張る。外へ通信しない。
   使い方：node _見張り/test_member_lookup.mjs              （pitflow フォルダで）
           node _見張り/test_member_lookup.mjs 古いauth-pit.js 古いfunctions/index.js  （直す前の形に当てると赤）
   ===================================================================== */
import fs from 'fs';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + JSON.stringify(x) : '')); } };

function grab(src, name) {
  const m = new RegExp('(async\\s+)?function\\s+' + name + '\\s*\\(').exec(src); if (!m) return '';
  let depth = 0;
  for (let j = src.indexOf('{', m.index); j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); } }
  return '';
}
/* 偽の名簿（doc().get／where().limit().get／limit().get。並びは書いた順） */
function fakeCol(rows) {
  const snap = arr => ({ empty: !arr.length, size: arr.length, docs: arr.map(r => ({ id: r.id, data: () => ({ ...r.data }) })), forEach(f) { this.docs.forEach(f); } });
  return {
    doc: id => ({ get: async () => { const r = rows.find(x => x.id === id); return { exists: !!r, id, data: () => (r ? { ...r.data } : undefined) }; } }),
    where: (k, op, v) => ({ limit: n => ({ get: async () => snap(rows.filter(r => r.data[k] === v).slice(0, n)) }) }),
    limit: n => ({ get: async () => snap(rows.slice(0, n)) })
  };
}
const d = (id, data) => ({ id, data });
const user = { uid: 'U1', email: 'Yuta@Example.com' };
const P = { pitflow: { on: true, role: '管理' } };

/* ---------- ① 画面の入室 ---------- */
const authSrc = fs.readFileSync(process.argv[2] || 'js/auth-pit.js', 'utf8');
const authCode = grab(authSrc, 'normEmail') + '\n' + grab(authSrc, 'findMyMember');
async function find(rows) {
  const w = { console: { log() {}, warn() {}, error() {} } }; w.window = w;
  const col = fakeCol(rows); w.fb = { company: () => ({ collection: () => col }) };
  vm.createContext(w); vm.runInContext(authCode, w);
  return w.findMyMember(user);
}
console.log('① 画面の入室（findMyMember）');
let r = await find([d('U1', { email: 'x', ...P })]);
ok('uid の書類（在籍中）で入れる', r && r.id === 'U1');
r = await find([d('old', { email: 'yuta@example.com', active: false, removed: { at: 1 } }), d('new', { email: 'yuta@example.com', ...P })]);
ok('🔴 在籍なしの古い書類が先にあっても、在籍中の本人', r && r.id === 'new', r && r.id);
r = await find([d('old', { email: 'Yuta@Example.com', active: false }), d('new', { email: 'Yuta@Example.com', ...P })]);
ok('🔴 表記そのままのメールでも在籍中の方', r && r.id === 'new', r && r.id);
r = await find([d('old', { email: 'YUTA@example.com', active: false }), d('new', { email: 'yuta@EXAMPLE.com', ...P })]);
ok('🔴 表記違いの全件探しでも在籍中の方', r && r.id === 'new', r && r.id);
r = await find([d('U1', { email: 'yuta@example.com', active: false }), d('p2', { email: 'yuta@example.com', ...P })]);
ok('🔴 uid の書類が在籍なしでも、同じメールの在籍中の書類', r && r.id === 'p2', r && r.id);
r = await find([d('U1', { email: 'yuta@example.com', active: false }), d('old', { email: 'yuta@example.com', active: false })]);
ok('在籍なししか無ければ在籍なしの書類を返す（画面は「在籍なし」と言って止める）', r && r.active === false, r);
r = await find([d('p9', { email: 'other@example.com' })]);
ok('名簿に居なければ null', r === null, r);

/* ---------- ② AI の関数 ---------- */
const fnSrc = fs.readFileSync(process.argv[3] || 'functions/index.js', 'utf8');
const fnCode = grab(fnSrc, 'assertAdmin');
async function fnCheck(rows, email = 'yuta@example.com') {
  class HttpsError extends Error { constructor(c, m) { super(m); this.code = c; } }
  const col = fakeCol(rows);
  const w = { HttpsError, APP_KEY: 'pitflow', COMPANY_ID: 'kobayashi_motors', db: { collection: () => ({ doc: () => ({ collection: () => col }) }) } };
  vm.createContext(w); vm.runInContext(fnCode, w);
  try { const m = await w.assertAdmin('U1', email); return { ok: true, m }; } catch (e) { return { ok: false, msg: e.message }; }
}
console.log('② AI の関数（assertAdmin）');
r = await fnCheck([d('old', { email: 'yuta@example.com', active: false, ...P }), d('new', { email: 'yuta@example.com', name: '新', ...P })]);
ok('🔴 在籍なしの古い書類が先にあっても通る', r.ok && r.m.name === '新', r);
r = await fnCheck([d('U1', { email: 'yuta@example.com', active: false, ...P }), d('p2', { email: 'yuta@example.com', name: '新', ...P })]);
ok('🔴 uid の書類が在籍なしでも、同じメールの在籍中の書類で通る', r.ok && r.m.name === '新', r);
r = await fnCheck([d('U1', { email: 'yuta@example.com', active: false, ...P })]);
ok('在籍なししか無ければ止める', !r.ok && /在籍/.test(r.msg), r);
r = await fnCheck([d('p9', { email: 'z@example.com', ...P })]);
ok('名簿に居なければ止める', !r.ok, r);

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} 件OK / ${fail} 件NG`);
process.exit(fail === 0 ? 0 : 1);
