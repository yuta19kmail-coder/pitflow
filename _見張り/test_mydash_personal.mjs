/* PitFlow v2.144.0 ── マイダッシュの並びは「1人ずつ」の見張り（ブラウザは使わない）
   ◎ゆうた「直して」（2026-10-05）
     並びが state.settings.myDash ＝ pitSettings/main（会社で1枚）に入っていて、誰かが並べ替えると全員の並びが変わっていた。
   ◎決まり
     ・本番＝ companies/{会社}/userPrefs/{uid}.pitMyDash（set(…, {merge:true}) だけ）
     ・自分の欄がまだ無い人＝共通の並び（settings.myDash）から始まる。自分で並べ替えた時から自分の欄
     ・🔴 共通の並び（settings.myDash）は消さない・書き換えない＝本番では pitSettings/main を書かない
     ・「見た目と並びを端末ごとに」（CFDev の旗）がある人＝ devs.<端末>.pitMyDash
     ・CFDev が無い時＝userPrefs の pitMyDash を直接／練習モード＝今までどおり state.settings.myDash（端末保存）
   ◎やり方：makeBox（_サーバー\functions\analytics.js）の箱に js/mydash.js と _shared\coreflow-a11y.js を読み、
     Firestore は偽物（書いた中身を merge して覚える）。画面は描かない（getElementById は null）
   ◎使い方：PitFlow\pitflow で node _見張り\test_mydash_personal.mjs */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PIT = path.join(HERE, '..');
const SHARED = path.join(PIT, '..', '..', '_shared');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + JSON.stringify(x) : '')); } };
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 30; i++) await tick(); };
const J = (v) => JSON.stringify(v);
const order = (m) => m.presets[m.active].layout.map((x) => x.e).join(',');

const { makeBox } = createRequire(import.meta.url)(path.join(PIT, '..', '..', '_サーバー', 'functions', 'analytics.js'));
const MYDASH = fs.readFileSync(path.join(PIT, 'js', 'mydash.js'), 'utf8');
const A11Y = fs.readFileSync(path.join(SHARED, 'coreflow-a11y.js'), 'utf8');

function merge(dst, src) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) merge(dst[k], v);
    else dst[k] = JSON.parse(JSON.stringify(v));
  }
  return dst;
}

const SHARED_DASH = { v: 2, active: 0, presets: [{ name: '共通', layout: [{ e: 'hold', s: 's' }, { e: 'park', s: 's' }, { e: 'intake', s: 's' }] }] };

/* 箱を作る。cloud=false は練習モード。withDev=false は CFDev が無い（古い配布）。docs は uid → userPrefs の中身（箱をまたいで共有＝同じ Firestore） */
function load({ cloud = true, withDev = true, member = { email: 'a@example.com' }, docs = {}, uid = 'u1', cookie = 'cf_dev=dPC1' } = {}) {
  const ctx = makeBox();
  const store = {};
  ctx.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  let ck = cookie;
  const base = ctx.document;
  const body = { classList: { toggle: () => true, add: () => {}, remove: () => {}, contains: () => false }, appendChild: () => {} };
  ctx.document = new Proxy(base, {
    get: (t, k) => k === 'cookie' ? ck : k === 'getElementById' ? () => null : k === 'querySelectorAll' ? () => [] : k === 'querySelector' ? () => null
      : k === 'body' ? body : k === 'readyState' ? 'complete' : t[k],
    set: (t, k, v) => { if (k === 'cookie') { ck = String(v).split(';')[0]; return true; } t[k] = v; return true; },
  });
  ctx.location = { hostname: cloud ? 'pitflow.kobayashi-motors.com' : '127.0.0.1', protocol: 'https:', hash: '', search: '', href: '', pathname: '/' };
  ctx.MutationObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };
  ctx.getComputedStyle = () => new Proxy({}, { get: () => '' });
  ctx.pitToast = () => {};
  ctx.PIT_CLOUD = cloud;
  ctx.state = { settings: { myDash: JSON.parse(J(SHARED_DASH)) }, cards: [] };
  let pitSaves = 0;
  ctx.PitDB = { save: () => { pitSaves++; return true; } };
  /* 偽の Firestore */
  const writes = [];
  const prefsRef = (id) => ({
    get: async () => ({ exists: !!docs[id], data: () => (docs[id] ? JSON.parse(J(docs[id])) : undefined) }),
    set: async (data, opt) => { writes.push({ uid: id, data: JSON.parse(J(data)), opt }); docs[id] = (opt && opt.merge) ? merge(docs[id] || {}, data) : JSON.parse(J(data)); },
  });
  const userPrefs = { doc: (id) => prefsRef(id) };
  const q = { where: () => q, limit: () => q, get: async () => (member ? { empty: false, docs: [{ data: () => member }] } : { empty: true, docs: [] }) };
  const portal = { where: () => q, doc: () => ({ get: async () => ({ exists: !!member, data: () => member }) }) };
  const coll = (n) => n === 'userPrefs' ? userPrefs : portal;
  const pitSettingsWrites = [];
  const company = { collection: (n) => n === 'pitSettings' ? { doc: () => ({ set: async (d) => { pitSettingsWrites.push(d); } }) } : coll(n) };
  ctx.fb = { ready: true, currentUser: cloud ? { uid, email: 'a@example.com' } : null, currentCompanyId: 'kobayashi_motors',
    company: () => company, db: { collection: () => ({ doc: () => ({ collection: coll }) }) } };
  if (withDev) vm.runInContext(A11Y, ctx, { filename: 'coreflow-a11y.js' });
  vm.runInContext(MYDASH, ctx, { filename: 'mydash.js' });
  return { ctx, docs, writes, mine: () => writes.filter((w) => J(w.data).indexOf('pitMyDash') >= 0), pitSaves: () => pitSaves, pitSettingsWrites, setUser: (id) => { ctx.fb.currentUser = { uid: id, email: id + '@example.com' }; } };
}

console.log('\n── 自分の欄がまだ無い人＝共通の並び（今の見た目のまま始まる）──');
{
  const B = load({ docs: { u1: { memberId: 'm1' } } });
  B.ctx.PIT_MYDASH_NOW(); await settle();
  const now = B.ctx.PIT_MYDASH_NOW();
  ok('共通の並び（hold,park,intake）が出る', order(now) === 'hold,park,intake' && now.presets[0].name === '共通', now);
  ok('開いただけでは何も書かない（userPrefs も pitSettings も）', B.mine().length === 0 && B.pitSaves() === 0);
  B.ctx.mydToggleEdit(); B.ctx.mydToggleEdit(); await settle();
  ok('カスタマイズを開いて閉じただけ（何も変えていない）＝自分の欄は作らない', B.mine().length === 0 && B.pitSaves() === 0, B.writes);
}

console.log('\n── 自分で並べ替えた＝自分の欄（userPrefs）に書く・pitSettings/main は書かない ──');
const DOCS = { u1: { memberId: 'm1', memberEmail: 'a@example.com' }, u2: { memberId: 'm2' } };
{
  const B = load({ withDev: false, docs: DOCS });
  B.ctx.PIT_MYDASH_NOW(); await settle();
  B.ctx.mydMove(null, 0, 1); await settle();
  const w = B.mine();
  ok('userPrefs/u1 に1回書いた', w.length === 1 && w[0].uid === 'u1', B.writes);
  ok('書き方は set(…, {merge:true})', w.length && w[0].opt && w[0].opt.merge === true, w[0] && w[0].opt);
  ok('中身＝並べ替えた後（park,hold,intake）', w.length && order(w[0].data.pitMyDash) === 'park,hold,intake', w[0] && w[0].data);
  ok('🔴 memberId など同じ書類の他の欄は残っている', DOCS.u1.memberId === 'm1' && DOCS.u1.memberEmail === 'a@example.com', DOCS.u1);
  ok('🔴 共通の並び（state.settings.myDash）は1バイトも変わらない', J(B.ctx.state.settings.myDash) === J(SHARED_DASH), B.ctx.state.settings.myDash);
  ok('🔴 PitDB.save（＝pitSettings/main）を呼ばない', B.pitSaves() === 0 && B.pitSettingsWrites.length === 0);
  ok('画面の並びも自分の並び', order(B.ctx.PIT_MYDASH_NOW()) === 'park,hold,intake');
  B.ctx.mydResize(null, 0, 'l'); await settle();
  ok('続けて変えても自分の欄に積む（2回目）', B.mine().length === 2 && B.mine()[1].data.pitMyDash.presets[0].layout[0].s === 'l');
  ok('CFDev が無い＝今までどおり userPrefs の pitMyDash を直接（devs は作らない）', B.mine().length > 1 && !('devs' in B.mine()[1].data));

  console.log('\n── 別の人には影響しない ──');
  const C = load({ withDev: false, docs: DOCS, uid: 'u2' });
  C.ctx.PIT_MYDASH_NOW(); await settle();
  ok('u2 は共通の並びのまま（u1 の並べ替えは届かない）', order(C.ctx.PIT_MYDASH_NOW()) === 'hold,park,intake', C.ctx.PIT_MYDASH_NOW());
  ok('u2 の書類に pitMyDash は無い', !('pitMyDash' in DOCS.u2), DOCS.u2);
  const D = load({ withDev: false, docs: DOCS, uid: 'u1' });
  D.ctx.PIT_MYDASH_NOW(); await settle();
  ok('u1 が別の窓で開き直す＝自分の並び（park,…）が戻る', order(D.ctx.PIT_MYDASH_NOW()) === 'park,hold,intake');
  D.setUser('u2'); D.ctx.PIT_MYDASH_NOW(); await settle();
  ok('同じ画面で人が替わる（u1→u2）＝u2 の並び（共通）に切り替わる', order(D.ctx.PIT_MYDASH_NOW()) === 'hold,park,intake');
}

console.log('\n── 共通の並びが変わった時 ──');
{
  const B = load({ withDev: false, docs: { u3: {} }, uid: 'u3' });
  B.ctx.PIT_MYDASH_NOW(); await settle();
  B.ctx.state.settings.myDash = { v: 2, active: 0, presets: [{ name: '共通', layout: [{ e: 'intake', s: 's' }] }] };
  ok('自分の欄が無い人＝新しい共通の並びに付いていく', order(B.ctx.PIT_MYDASH_NOW()) === 'intake');
  const C = load({ withDev: false, docs: { u4: { pitMyDash: { v: 2, active: 0, presets: [{ name: '私', layout: [{ e: 'park', s: 'l' }] }] } } }, uid: 'u4' });
  C.ctx.PIT_MYDASH_NOW(); await settle();
  C.ctx.state.settings.myDash = { v: 2, active: 0, presets: [{ name: '共通', layout: [{ e: 'intake', s: 's' }] }] };
  ok('自分の欄がある人＝自分の並びのまま', order(C.ctx.PIT_MYDASH_NOW()) === 'park' && C.ctx.PIT_MYDASH_NOW().presets[0].name === '私');
}

console.log('\n── 「端末ごと」の旗（CFDev）──');
{
  const docs = { u1: { memberId: 'm1', pitMyDash: { v: 2, active: 0, presets: [{ name: 'アカウント', layout: [{ e: 'park', s: 's' }, { e: 'hold', s: 's' }] }] } } };
  const B = load({ member: { email: 'a@example.com', devPrefs: true }, docs, cookie: 'cf_dev=dPC1' });
  B.ctx.PIT_MYDASH_NOW(); await settle();
  ok('旗あり・この端末の値がまだ無い＝アカウントの値から始まる', B.ctx.CFDev.on() === true && B.ctx.PIT_MYDASH_NOW().presets[0].name === 'アカウント');
  B.ctx.mydMove(null, 0, 1); await settle();
  const w = B.mine();
  ok('旗ありの書き方＝devs.<この端末>.pitMyDash', w.length === 1 && w[0].data.devs && w[0].data.devs.dPC1 && order(w[0].data.devs.dPC1.pitMyDash) === 'hold,park' && !('pitMyDash' in w[0].data) && w[0].opt.merge === true, w);
  ok('🔴 アカウントの値（pitMyDash）は触らない', order(docs.u1.pitMyDash) === 'park,hold');
  ok('🔴 共通の並びも pitSettings/main も触らない', J(B.ctx.state.settings.myDash) === J(SHARED_DASH) && B.pitSaves() === 0);
  const C = load({ member: { email: 'a@example.com', devPrefs: true }, docs, cookie: 'cf_dev=dPC1' });
  C.ctx.PIT_MYDASH_NOW(); await settle();
  ok('同じ端末で開き直す＝この端末の並び', order(C.ctx.PIT_MYDASH_NOW()) === 'hold,park');
  const P = load({ member: { email: 'a@example.com', devPrefs: true }, docs, cookie: 'cf_dev=dPHONE' });
  P.ctx.PIT_MYDASH_NOW(); await settle();
  ok('別の端末＝アカウントの値（この端末の値はまだ無い）', order(P.ctx.PIT_MYDASH_NOW()) === 'park,hold');
  const N = load({ member: { email: 'a@example.com', devPrefs: false }, docs, cookie: 'cf_dev=dPC1' });
  N.ctx.PIT_MYDASH_NOW(); await settle();
  ok('旗を外す＝アカウントの値に戻る（端末の中身は消さない）', order(N.ctx.PIT_MYDASH_NOW()) === 'park,hold' && !!docs.u1.devs.dPC1.pitMyDash);
  N.ctx.mydMove(null, 0, 1); await settle();
  ok('旗が無い人の書き方＝pitMyDash（今までどおりの欄）', N.mine().length === 1 && 'pitMyDash' in N.mine()[0].data && !('devs' in N.mine()[0].data), N.mine());
}

console.log('\n── 練習モード（PIT_CLOUD 無し）＝今までどおり ──');
{
  const B = load({ cloud: false, docs: {} });
  B.ctx.mydMove(null, 0, 1); await settle();
  ok('state.settings.myDash が変わる（端末保存）', order(B.ctx.state.settings.myDash) === 'park,hold,intake');
  ok('PitDB.save を呼ぶ', B.pitSaves() === 1);
  ok('userPrefs には書かない', B.mine().length === 0);
}

console.log('\n── 書き方の決まり（ソース）──');
{
  ok('userPrefs への書き込みは merge だけ', /ref\.set\([^;]*pitMyDash[^;]*\{ merge: true \}\)/.test(MYDASH) && !/\.update\([^)]*pitMyDash/.test(MYDASH));
  ok('読む前に CFDev.ready を待つ', /D\.ready\(u\)/.test(MYDASH) && /mdReady\(u\)\.then\(function \(\) \{ return ref\.get\(\); \}\)/.test(MYDASH));
}

console.log('\n─────────────────────────────');
console.log((fail ? '⚠ ' : '🎉 ') + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
