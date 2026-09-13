/* ============================================================
   test_app_summary.mjs
   📡 CoreFlow のダッシュボードへ配る PitFlow の概況（js/app-summary.js・v2.108.0）を見張る。

   きっかけ：ゆうた 2026-09-13
     🗣「コアフローのダッシュボードを仕上げる…一気にやっちゃってよ」
     🗣「基本考えうる全てを作成して欲しい　時間かかっていい」／売上は「金額も出す」

   ◎決めごと
     🔴 数え方は mydash.js の物差し（PIT_DASH_API）を借りるだけ＝ PitFlow のBOXと数字が同じ
     🔴 見本・デモ（PIT_CLOUD が true でない）では**配らない**
     🔴 クラウドに書ける形（undefined・配列の中の配列・NaN が無い／1MB より十分小さい）
     🔴 CoreFlow の dash.js が知っている項目の鍵と、ここが配る鍵が**そろっている**
     🔴 自分の分（perUser）の鍵は state.staff の id（＝メンバーid）

   使い方：
     python -m http.server 8971   （PitFlow\pitflow で）
     PORT=8971 node _見張り/test_app_summary.mjs
   ============================================================ */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import fs from 'fs';
import path from 'path';

const cp = chromePath();
const PORT = process.env.PORT || 8971;
let OK = 0, NG = 0;
function ok(name, cond, extra) {
  if (cond) { OK++; console.log('  ✅ ' + name); }
  else { NG++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
const rd = f => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

console.log('\n── 🧭 置き方と物差し ──');
{
  const idx = rd('index.html');
  const a = idx.indexOf('js/mydash.js?v='), b = idx.indexOf('js/app-summary.js?v=');
  ok('index.html が app-summary.js を読む', b > 0);
  ok('🔴 mydash.js より後ろで読む（物差しを借りるため）', a > 0 && b > a);
  const src = rd('js/app-summary.js');
  ok('🔴 物差しは PIT_DASH_API から借りる', /window\.PIT_DASH_API/.test(src) && /P\.pickIntake\(\)/.test(src) && /P\.insStat\(\)/.test(src));
  ok('🔴 本番（PIT_CLOUD === true）の時だけ配る', /window\.PIT_CLOUD !== true\) return;/.test(src));
  ok('🔴 まるごと書き直す（古い項目を残さない）', /\.set\(doc, \{ merge: false \}\)/.test(src));
  const md = rd('js/mydash.js');
  ok('mydash.js が入口 PIT_DASH_API を出している', /window\.PIT_DASH_API = \{/.test(md));
  ok('版は 3か所とも v2.108.0', /content="2\.108\.0"/.test(idx) && /login-ver">v2\.108\.0</.test(idx) && /class="ver">v2\.108\.0</.test(idx));
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.PIT_DASH_API && window._pitflowSummaryBuild && state.cards && state.cards.length', null, { timeout: 30000 });
await p.waitForTimeout(1200);

console.log('\n── 📦 配る中身 ──');
const R = await p.evaluate(() => {
  const t0 = performance.now();
  const doc = window._pitflowSummaryBuild();
  const ms = performance.now() - t0;
  const bad = [];
  (function walk(v, at, inArr) {
    if (v === undefined) { bad.push(at + '＝undefined'); return; }
    if (typeof v === 'number' && !isFinite(v)) { bad.push(at + '＝' + v); return; }
    if (Array.isArray(v)) { if (inArr) bad.push(at + '＝配列の中の配列'); v.forEach((x, i) => walk(x, at + '[' + i + ']', true)); return; }
    if (v && typeof v === 'object') Object.keys(v).forEach(k => walk(v[k], at + '.' + k, false));
  })(doc, 'doc', false);
  const P = window.PIT_DASH_API; P.ctx();
  const S = doc.sections || {};
  const n = s => parseInt(String(s).replace(/[^\d-]/g, ''), 10);
  const staff = (state.staff || []).filter(s => !s.isSelf && s.name);
  const puKeys = Object.keys(doc.perUser || {});
  const withTask = staff.find(s => P.pickPTask({ p: [s.name] }).length) || null;
  const itemsAll = [];
  Object.keys(S).forEach(k => (S[k].items || []).forEach(it => itemsAll.push(it)));
  return {
    ms, bad, size: JSON.stringify(doc).length, keys: Object.keys(S),
    top: doc.metrics, topItems: (doc.items || []).length,
    intake: [n(S.intake.metrics[0].value), P.pickIntake().length],
    hold: [(S.hold.items || []).length + (S.hold.more || 0), P.pickHold().length],
    approval: [n(S.approval.metrics[0].value), P.pickApproval().length],
    telwait: [n(S.telwait.metrics[0].value), P.pickTelWait().length],
    pay: [n(S.pay.metrics[1].value), P.pickPay().length],
    red: [n(S.inspect.metrics[0].value), P.insStat().red],
    longhold: [n(S.longhold.metrics[0].value.replace(/.*?(\d+)台$/, '$1')), P.pickLongHold().length],
    order: [n(S.order.metrics[1].value), P.pickOrder().length],
    result: [n(S.result.metrics[0].value), P.pickResultMonth().length],
    salesVal: S.sales.metrics[0].value, salesPct: S.sales.metrics[1].value,
    salesStaffN: (S.salesStaff.items || []).length,
    loanerN: [(S.loaner.items || []).length, P.loanerStat(ymd(new Date())).total],
    fillN: (S.fill.items || []).length, parkN: (S.park.items || []).length, days7: (S.salesDays.items || []).length,
    everyTitle: Object.keys(S).every(k => S[k].title && Array.isArray(S[k].metrics) && Array.isArray(S[k].items)),
    qShape: itemsAll.filter(it => it.q).every(it => /^card=[^&]+$/.test(it.q)),
    qN: itemsAll.filter(it => it.q).length,
    rowShape: itemsAll.every(it => typeof it.main === 'string' && typeof it.sub === 'string' && typeof it.right === 'string' && typeof it.warn === 'boolean'),
    noTel: !/\d{2,4}-\d{2,4}-\d{3,4}/.test(JSON.stringify(doc)),
    puKeys, staffIds: staff.map(s => s.id),
    task: withTask ? [n(doc.perUser[withTask.id].metrics[1].value), P.pickPTask({ p: [withTask.name] }).length, Object.keys(doc.perUser[withTask.id].sections)] : null
  };
});
ok('🧯 作る時にJSエラー 0', errs.length === 0, errs.slice(0, 3));
ok('3秒以内に作れる', R.ms < 3000, Math.round(R.ms));
ok('🔴 クラウドに書ける形（undefined・NaN・配列の中の配列が無い）', R.bad.length === 0, R.bad.slice(0, 5));
ok('🔴 1件の上限（1MB）より十分小さい（500KB未満）', R.size < 500000, R.size);
const EXPECT = ['intake', 'returnout', 'hold', 'park', 'longhold', 'earliest', 'fill', 'inspect', 'thanks', 'rpweek',
  'retTbd', 'telwait', 'returnwait', 'retDateTbd', 'retTimeTbd', 'pay', 'resTbd', 'approval', 'tentative', 'intakeTbd', 'noShow',
  'production', 'order', 'result', 'sales', 'salesStaff', 'salesDays', 'shakenPlan', 'shakenLog', 'shakenStaff', 'loaner', 'carsales', 'course'];
ok('項目は33種ぜんぶ届く', EXPECT.every(k => R.keys.indexOf(k) >= 0), EXPECT.filter(k => R.keys.indexOf(k) < 0));
ok('どの項目も 題名・数字・明細 の形', R.everyTitle);
ok('概況（全社）の数字は6つ・明細あり', R.top.length === 6 && R.top.every(m => m.value && m.label));
ok('🔴 今日の入庫＝PitFlow のBOXと同じ台数', R.intake[0] === R.intake[1], R.intake);
ok('🔴 預かり中の明細＝PitFlow と同じ台数', R.hold[0] === R.hold[1], R.hold);
ok('🔴 承認待ち＝同じ', R.approval[0] === R.approval[1], R.approval);
ok('🔴 完TEL待ち＝同じ', R.telwait[0] === R.telwait[1], R.telwait);
ok('🔴 入金待ち＝同じ', R.pay[0] === R.pay[1], R.pay);
ok('🔴 データチェック 要対応＝同じ', R.red[0] === R.red[1], R.red);
ok('🔴 長期預かり＝同じ', R.longhold[0] === R.longhold[1], R.longhold);
ok('🔴 受注残＝同じ', R.order[0] === R.order[1], R.order);
ok('🔴 当月実績＝同じ', R.result[0] === R.result[1], R.result);
ok('🔴 売上は金額で出す（円・万・億）', /(円|万|億)$/.test(R.salesVal) && /%$/.test(R.salesPct), [R.salesVal, R.salesPct]);
ok('代車は1台ずつ並ぶ', R.loanerN[0] === R.loanerN[1] && R.loanerN[0] > 0, R.loanerN);
ok('予約の埋まり＝21日／置場＝14日／売上＝7日', R.fillN === 21 && R.parkN === 14 && R.days7 === 7, [R.fillN, R.parkN, R.days7]);
ok('🔴 明細の行き先は card=<id> の形', R.qShape && R.qN > 0, R.qN);
ok('明細の行は すべて文字＋真偽', R.rowShape);
ok('⚠ 電話番号らしきものを載せていない', R.noTel);
ok('🔴 自分の分の鍵は state.staff の id', R.puKeys.length > 0 && R.puKeys.every(k => R.staffIds.indexOf(k) >= 0), R.puKeys.slice(0, 5));
ok('🔴 自分のタスク数＝PitFlow の個人BOXと同じ', !!R.task && R.task[0] === R.task[1], R.task);
ok('自分の分は 予約・タスク・返車・受付・売上 の5項目', !!R.task && ['reserve', 'task', 'ret', 'resstaff', 'sales'].every(k => R.task[2].indexOf(k) >= 0), R.task && R.task[2]);

console.log('\n── 🔒 配る・配らない ──');
const G = await p.evaluate(async () => {
  const calls = [];
  const fakeDb = { collection: () => ({ doc: () => ({ collection: () => ({ doc: (id) => ({ set: (d, o) => { calls.push({ id, keys: Object.keys(d), o, hasTs: 'updatedAt' in d }); return Promise.resolve(); } }) }) }) }) };
  const saveFb = window.fb, saveCloud = window.PIT_CLOUD;
  window.fb = Object.assign({}, saveFb || {}, { db: fakeDb, currentUser: { uid: 'u1' }, serverTimestamp: () => 'TS' });
  window.PIT_CLOUD = false; window._pitflowSummaryPublish();
  const demoCalls = calls.length;
  window.PIT_CLOUD = true; window._pitflowSummaryPublish();
  await new Promise(r => setTimeout(r, 30));
  window.fb = saveFb; window.PIT_CLOUD = saveCloud;
  return { demoCalls, calls };
});
ok('🔴 見本・デモ（PIT_CLOUD=false）では書かない', G.demoCalls === 0, G);
ok('本番なら appSummaries/pitflow に1回書く', G.calls.length === 1 && G.calls[0].id === 'pitflow', G.calls);
ok('書く時は 更新時刻つき・まるごと（merge:false）', G.calls[0] && G.calls[0].hasTs && G.calls[0].o && G.calls[0].o.merge === false, G.calls[0]);

console.log('\n── 🤝 CoreFlow の dash.js と鍵がそろっているか ──');
{
  const portal = path.join(process.cwd(), '..', '..', 'ポータル', 'dash.js');
  if (fs.existsSync(portal)) {
    const dj = fs.readFileSync(portal, 'utf8');
    const block = (dj.match(/pitflow: \[\s*\[[\s\S]*?\]\s*\],\s*coremembers:/) || [''])[0];
    const keys = [...block.matchAll(/\['([A-Za-z0-9_]+)', '/g)].map(m => m[1]);
    ok('dash.js の PitFlow の項目を読めた', keys.length >= 30, keys.length);
    ok('🔴 dash.js が知っている鍵は、ぜんぶ配っている', keys.every(k => R.keys.indexOf(k) >= 0), keys.filter(k => R.keys.indexOf(k) < 0));
    ok('🔴 配っている鍵は、ぜんぶ dash.js が知っている', R.keys.every(k => keys.indexOf(k) >= 0), R.keys.filter(k => keys.indexOf(k) < 0));
    const me = (dj.match(/ME_SECTIONS = \{\s*pitflow: \[[\s\S]*?\]\],/) || [''])[0];
    const mk = [...me.matchAll(/\['([A-Za-z0-9_]+)', '/g)].map(m => m[1]);
    ok('🔴 自分の分の鍵もそろっている', mk.length === 5 && R.task && mk.every(k => R.task[2].indexOf(k) >= 0), [mk, R.task && R.task[2]]);
  } else ok('ポータルの dash.js が見つかる', false, portal);
}

await b.close();
console.log('\n結果: ' + OK + ' OK / ' + NG + ' NG');
process.exit(NG ? 1 : 0);
