/* PitFlow ── 🔔 FlowDesk の通知のもと（feedFacts/pitflow）と、ピットリストの配信
   ===================================================================
   ◎ゆうた（2026-09-14）「いいよ　ここでは予定されているものは実行していい」（通知と表示を全アプリ作りきる・1段目 PitFlow）
   ◎見張ること
     🔴 事実は PitFlow の物差し（PIT_DASH_API）で数える＝今日の入庫・返車・預かり・今月の売上が PitFlow の画面の数字と同じ
     🔴 まだ入庫していない・時刻のある車だけが「入庫の時間過ぎ」の候補／返車済みは「返車の時間過ぎ」に入らない
     🔴 担当の名前 → メンバーid の表・メンバーの課・課の名前 が入っている
     🔴 見本・デモ（PIT_CLOUD でない）では置かない
     🔴 ピットリスト（sections.pitlist）＝工程ごとの台数と車
   ◎使い方
       python -m http.server 8972   （CoreFlowアプリ で）
       PORT=8972 node _見張り/test_feed_facts.mjs   （PitFlow\pitflow で）
   =================================================================== */
import { createRequire } from 'module';
import { chromePath } from './_chrome.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('../../../CarFlow/carflow/node_modules/playwright');
const PORT = process.env.PORT || 8972;
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + JSON.stringify(x).slice(0, 400) : '')); } };

const b = await chromium.launch({ executablePath: chromePath() });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/PitFlow/pitflow/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && state.cards && state.cards.length && window._pitFeedFactsBuild && window.PIT_DASH_API', null, { timeout: 30000 });
await p.waitForTimeout(1200);

const R = await p.evaluate(() => {
  const P = window.PIT_DASH_API, C = P.ctx();
  /* 見張り用に、今日の入庫・返車に時刻のある車を1台ずつ用意する（見本データは時刻が無いことがある） */
  const cards = state.cards;
  const res = cards.find(c => c.status === 'reserved');
  if (res) { res.reserveDate = C.tStr; res.reserveTime = '09:00'; }
  const ret = cards.find(c => ['work', 'workDone'].indexOf(c.status) >= 0 && c !== res);
  if (ret) { ret.returnDate = C.tStr; ret.returnDateFinal = C.tStr; ret.returnStage = 'returnWait'; ret.returnTime = '16:30'; }
  const f = window._pitFeedFactsBuild();
  const sum = window._pitflowSummaryBuild();
  return {
    f, json: JSON.stringify(f).length, tStr: C.tStr, resId: res && res.id, retId: ret && ret.id,
    expIntake: P.pickIntake().filter(c => c.status === 'reserved' && /^\d{1,2}:\d{2}$/.test(String(c.reserveTime || ''))).map(c => c.id).sort(),
    expHold: P.pickHold().length,
    expSales: sum.sections.sales && sum.sections.sales.metrics[0].value,
    pitlist: sum.sections.pitlist, staffN: (state.staff || []).filter(s => s && s.id && !s.isSelf && s.name).length,
    cloud: window.PIT_CLOUD
  };
});
const f = R.f;
ok('事実が作れる（日・月・形）', f && f.v === 1 && f.day === R.tStr && f.month === R.tStr.slice(0, 7) && Array.isArray(f.intake) && Array.isArray(f.ret) && Array.isArray(f.hold) && !!f.sales, f && Object.keys(f));
ok('🔴 入庫の時間過ぎの候補＝PitFlow の「今日の入庫」のうち、まだ入庫していない・時刻のある車だけ', JSON.stringify(f.intake.map(x => x.id).sort()) === JSON.stringify(R.expIntake) && f.intake.some(x => x.id === R.resId && x.time === '09:00'), { got: f.intake, exp: R.expIntake });
ok('🔴 返車の時間過ぎの候補＝今日返車予定・まだ返車していない・時刻のある車（16:30）', f.ret.some(x => x.id === R.retId && x.time === '16:30'), f.ret);
ok('🔴 預かりの台数は PitFlow の「預かり中」と同じ・日数つき', f.hold.length === R.expHold && f.hold.every(h => typeof h.days === 'number'), { got: f.hold.length, exp: R.expHold });
ok('候補の車は見出し（名字様 車名）・課・担当を持つ', f.intake.concat(f.ret).every(x => f.cards[x.id] && /様/.test(f.cards[x.id].t) && Array.isArray(f.cards[x.id].staff)), f.cards[R.resId]);
ok('🔴 担当の名前 → メンバーid の表・名前・課の名前（1課・2課・受付課）', Object.keys(f.staff).length === R.staffN && f.divLabels.div1 && f.divLabels.div2 && f.divLabels.recept, { staff: Object.keys(f.staff).length, divLabels: f.divLabels });
ok('メンバーの課（divisions）が入っている', Object.keys(f.memberDivs).length > 0 && Object.values(f.memberDivs).every(a => a.every(d => /^(div1|div2|recept|other)$/.test(d))), f.memberDivs);
const man = v => { const n = Math.round(+v || 0); return n >= 10000 ? (Math.round(n / 1000) / 10) + '万' : n.toLocaleString('ja-JP') + '円'; };
ok('🔴 今月の売上は PitFlow の「売上（今月）」と同じ数字・最低目標つき', man(f.sales.sum) === R.expSales && f.sales.goalMin > 0, { got: man(f.sales.sum), exp: R.expSales, goal: f.sales.goalMin });
ok('担当ごとの金額（受注＝売上＋作業中）', Object.values(f.sales.byStaff).every(x => x.order >= x.sales), f.sales.byStaff);
ok('🔴 電話・住所は入れない', !/tel|phone|address|住所|電話/i.test(JSON.stringify(f)));
ok('1枚に収まる大きさ（900KB 未満）', R.json < 900000, R.json);
ok('🔴 見本・デモでは置かない（PIT_CLOUD が true の時だけ）', R.cloud !== true && await p.evaluate(() => { let wrote = false; const orig = window.fb; window.fb = { db: { collection: () => { wrote = true; return { doc: () => ({ collection: () => ({ doc: () => ({ set: () => Promise.resolve() }) }) }) }; } }, currentUser: {}, currentMember: { id: 'x' } }; window._pitFeedFactsPublish(true); window.fb = orig; return !wrote; }));

const pl = R.pitlist || {};
ok('🔴 ピットリストの配信（工程ごとの台数＋車）', pl.title === 'ピットリスト' && pl.metrics.length === 7 && pl.metrics.slice(1).map(m => m.label).join() === '点検,見積,連絡,部品,作業,作業完了' && Array.isArray(pl.items), pl && pl.metrics);
ok('ピットリストの車は押すとそのカードへ（card=）・何日目', (pl.items || []).every(it => /^card=/.test(it.q) && (it.right === '' || /日目$/.test(it.right))), (pl.items || []).slice(0, 3));
ok('🧯 JSエラー 0', errs.length === 0, errs.slice(0, 3));
await b.close();
console.log('\n─────────────────────────────');
console.log((fail ? '❌ ' : '✅ ') + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
