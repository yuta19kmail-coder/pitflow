/* ============================================================
   test_app_summary.mjs
   📡 CoreFlow のダッシュボードへ配る PitFlow の概況（js/app-summary.js）を見張る。

   きっかけ：ゆうた 2026-09-13
     🗣「コアフローのダッシュボードを仕上げる…一気にやっちゃってよ」
     🗣「基本考えうる全てを作成して欲しい　時間かかっていい」／売上は「金額も出す」

   ◎決めごと
     🔴 数え方は mydash.js の物差し（PIT_DASH_API）を借りるだけ＝ PitFlow のBOXと数字が同じ
     🔴 見本・デモ（PIT_CLOUD が true でない）では**配らない**
     🔴 クラウドに書ける形（undefined・配列の中の配列・NaN が無い／1MB より十分小さい）
     🔴 CoreFlow の dash.js が知っている項目の鍵と、ここが配る鍵が**そろっている**
     🔴 自分の分（perUser）の鍵は state.staff の id（＝メンバーid）
     🔴 2026-09-17 ゆうた：最短入庫日（earliest）に FlowDesk 用の grid（日付そのもの）と days（3週間の空き）
     🔴 2026-09-17 ゆうた：売上ボード（salesBoard）＝売上画面「当月」と同じ数字／自分のフロント成績（perUser.front）

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
  /* 🔴 2026-09-17 版は決め打ちしない＝ app-version を読んで、画面の2か所とそろっているか */
  const _aVer = (idx.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  const _lVer = (idx.match(/login-ver">v([\d.]+)</) || [])[1] || '';
  const _tVer = (idx.match(/class="ver">v([\d.]+)</) || [])[1] || '';
  ok('版は 3か所ともそろっている（v' + _aVer + '）', !!_aVer && _aVer === _lVer && _aVer === _tVer, [_aVer, _lVer, _tVer]);
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
    earliest: (function () {
      const E = S.earliest || {}, G = E.grid || {}, D = E.days || [];
      const isDs = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
      const want = {};
      [['dom', 'default'], ['imp', 'import']].forEach(([k, tm]) => {
        want[k] = {};
        [['no', 'noLoaner'], ['loan', 'loaner'], ['same', 'same']].forEach(([kk, kind]) => {
          const d = window.dashEarliestIntake(tm, kind, new Date(new Date().setHours(0, 0, 0, 0)));
          want[k][kk] = d ? ymd(d) : null;
        });
      });
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const cap = (state.settings && state.settings.reserveCap) || {};
      const total = window.pitLoanerUsableList().length;
      return {
        grid: G, want,
        gridShape: ['dom', 'imp'].every(k => G[k] && ['no', 'loan', 'same'].every(kk => G[k][kk] === null || isDs(G[k][kk]))),
        metricsText: E.metrics.map(m => m.value),
        titleOk: E.title === '最短入庫日' && E.metrics.length === 5 && E.items.length === 5,
        daysN: D.length,
        firstDs: D[0] && D[0].ds, todayDs: ymd(t0), lastDs: D[20] && D[20].ds, lastWant: ymd(addDays(t0, 20)),
        rowShape: D.every(r => isDs(r.ds) && typeof r.closed === 'boolean' && typeof r.label === 'string'
          && ['dom', 'imp'].every(k => Array.isArray(r[k]) && r[k].length === 2 && r[k].every(x => Number.isInteger(x)))
          && Number.isInteger(r.loanFree) && Number.isInteger(r.loanTotal)),
        seq: D.every((r, i) => r.ds === ymd(addDays(t0, i))),
        sameAsFill: D.every((r, i) => {
          const it = S.fill.items[i];
          return r.closed ? it.right === '休' : it.right === '国産 ' + r.dom[0] + '/' + r.dom[1] + '・輸入 ' + r.imp[0] + '/' + r.imp[1];
        }),
        intakeSame: D.every(r => r.dom[0] === dashIntake('default', r.ds) && r.imp[0] === dashIntake('import', r.ds)),
        closedList: D.filter(r => r.closed).map(r => r.ds + ':' + r.label),
        closedHasNums: D.filter(r => r.closed).every(r => r.label !== '' && r.dom.length === 2 && r.imp.length === 2 && Number.isInteger(r.loanFree)),
        closedCal: D.every(r => !PitCal.isClosed(r.ds) || r.closed),
        loanOk: D.every(r => r.loanFree >= 0 && r.loanFree <= r.loanTotal && r.loanTotal === total && r.loanFree === pitLoanerFreeOn(r.ds).length),
        total
      };
    })(),
    board: (function () {
      /* 🔴 売上ボード＝売上画面（sales.js collectMonth）と同じ数字か。区分は pitSalesTier＋pitSalesInRange で数え直して突き合わせる */
      const B = S.salesBoard || null; if (!B) return null;
      const MAP = { actual: 'act', actualWait: 'wait', confirmed: 'fixed', planned: 'plan', prospect: 'est', forecast: 'fore' };
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const moS = ymd(new Date(t0.getFullYear(), t0.getMonth(), 1)), moE = ymd(new Date(t0.getFullYear(), t0.getMonth() + 1, 0));
      const D = window.pitSalesMonthCollect(moS, moE);
      const scr = {}, scrN = {}; Object.keys(MAP).forEach(id => { scr[MAP[id]] = Math.round(D.tiers[id].sum); scrN[MAP[id]] = D.tiers[id].count; });
      /* 物差しだけで台数を数え直す（売上なし・廃車は pitSalesTier が null） */
      const own = {}; Object.values(MAP).forEach(k => own[k] = 0);
      let noSaleIn = 0, scrapIn = 0;
      state.cards.forEach(c => {
        const tr = pitSalesTier(c);
        if (tr && pitSalesInRange(c, moS, moE, ymd(t0))) own[MAP[tr]]++;
        if (window.pitCardNoSale && pitCardNoSale(c) && pitSalesInRange(c, moS, moE, ymd(t0))) noSaleIn++;
        if (c.status === 'scrap' && pitSalesTier(c)) scrapIn++;
      });
      const K = Object.values(MAP), KF = ['act', 'wait', 'fixed', 'plan'];
      const isInt = v => Number.isInteger(v);
      const sumK = (a, b, k) => a[k] + b[k];
      const fr = B.fronts || [];
      const frSum = {}; KF.forEach(k => { frSum[k] = fr.reduce((a, f) => a + f.tiers[k], 0); });
      const frCnt = {}; KF.forEach(k => { frCnt[k] = fr.reduce((a, f) => a + f.counts[k], 0); });
      /* 平均預かり日数をここで数え直す（実績の車・入庫日 actualInAt||reserveDate → pitSalesCountDate） */
      const dd = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
      let ss = 0, sn = 0;
      D.rows.filter(r => r.tier === 'actual').forEach(r => { const a = dd(r.c.actualInAt || r.c.reserveDate), b = dd(pitSalesCountDate(r.c)); if (a && b) { const x = Math.round((b - a) / 86400000); if (x >= 0) { ss += x; sn++; } } });
      const tg = (state.settings && state.settings.target) || {};
      const ratioD = tg.ratioD != null ? +tg.ratioD : 50;
      const staffBy = {}; (state.staff || []).forEach(s => { if (s.id && !s.isSelf && s.name && !staffBy[s.name]) staffBy[s.name] = s.id; });
      const pu = doc.perUser || {};
      const puFront = Object.keys(pu).filter(id => pu[id].sections && pu[id].sections.front).map(id => ({ id, f: pu[id].sections.front, name: pu[id].name }));
      const named = fr.filter(f => f.name !== '（未割当）');
      return {
        B: JSON.parse(JSON.stringify(B)),
        shape: B.title === '売上ボード' && Array.isArray(B.metrics) && Array.isArray(B.items) && /^\d{4}-\d{2}$/.test(B.month)
          && B.month === moS.slice(0, 7) && B.day === t0.getDate() && B.days === D.lastDay
          && isInt(B.min) && isInt(B.max) && K.every(k => isInt(B.tiers[k]) && isInt(B.counts[k]))
          && ['div1', 'div2'].every(d => B.divs[d] && isInt(B.divs[d].min) && isInt(B.divs[d].max) && K.every(k => isInt(B.divs[d].tiers[k]) && isInt(B.divs[d].counts[k])))
          && fr.every(f => typeof f.key === 'string' && typeof f.name === 'string' && (f.memberId === null || typeof f.memberId === 'string')
            && KF.every(k => isInt(f.tiers[k]) && isInt(f.counts[k])) && Object.keys(f.tiers).length === 4 && isInt(f.avgPrice)
            && (f.avgStayDays === null || typeof f.avgStayDays === 'number'))
          && B.company && isInt(B.company.avgPrice) && (B.company.avgStayDays === null || typeof B.company.avgStayDays === 'number'),
        sameScreen: K.every(k => B.tiers[k] === scr[k] && B.counts[k] === scrN[k]), scr, scrN,
        sameRule: K.every(k => B.counts[k] === own[k]), own, noSaleIn, scrapIn,
        target: B.min === window.pitSalesTarget().min && B.max === window.pitSalesTarget().max,
        divSum: K.every(k => sumK(B.divs.div1.tiers, B.divs.div2.tiers, k) === B.tiers[k] && sumK(B.divs.div1.counts, B.divs.div2.counts, k) === B.counts[k]),
        divScreen: K.every(k => { const id = Object.keys(MAP).find(x => MAP[x] === k); return B.divs.div1.tiers[k] === Math.round(D.byCourse.div1[id].sum) && B.divs.div2.counts[k] === D.byCourse.div2[id].count; }),
        divTarget: B.divs.div1.min + B.divs.div2.min === B.min && B.divs.div1.max + B.divs.div2.max === B.max
          && B.divs.div1.min === Math.round(B.min * ratioD / 100) && B.divs.div1.max === Math.round(B.max * ratioD / 100), ratioD,
        frontSum: KF.every(k => frSum[k] === B.tiers[k] && frCnt[k] === B.counts[k]), frSum,
        frontScreen: Object.keys(D.fronts).length === fr.length && fr.every(f => { const x = D.fronts[f.name]; return x && KF.every(k => { const id = Object.keys(MAP).find(z => MAP[z] === k); return Math.round(x[id]) === f.tiers[k]; }); }),
        frontSorted: fr.every((f, i) => i === 0 || fr[i - 1].tiers.act >= f.tiers.act),
        frontAvg: fr.every(f => f.avgPrice === (f.counts.act ? Math.round(f.tiers.act / f.counts.act) : 0)) && B.company.avgPrice === (B.counts.act ? Math.round(B.tiers.act / B.counts.act) : 0),
        frontMember: fr.every(f => f.memberId === (f.name === '（未割当）' ? null : (staffBy[f.name] || null))),
        stay: [B.company.avgStayDays, sn ? Math.round(ss / sn * 10) / 10 : null],
        frontStayN: fr.filter(f => f.avgStayDays !== null).length,
        puFront: puFront.map(x => ({ id: x.id, name: x.name, rank: x.f.rank, of: x.f.of, act: x.f.tiers.act })),
        puFrontOk: puFront.every(x => { const i = named.findIndex(f => f.name === x.f.name); return i >= 0 && x.f.rank === i + 1 && x.f.of === named.length && x.name === x.f.name
            && JSON.stringify(x.f.tiers) === JSON.stringify(named[i].tiers) && JSON.stringify(x.f.counts) === JSON.stringify(named[i].counts)
            && x.f.avgPrice === named[i].avgPrice && x.f.avgStayDays === named[i].avgStayDays && x.f.key === named[i].key; }),
        puFrontAll: named.filter(f => f.memberId).every(f => pu[f.memberId] && pu[f.memberId].sections.front && pu[f.memberId].sections.front.name === f.name),
        puKeepSections: puFront.every(x => ['reserve', 'task', 'ret', 'resstaff', 'sales'].every(k => pu[x.id].sections[k]) && Array.isArray(pu[x.id].metrics)),
        size: JSON.stringify(B).length
      };
    })(),
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
{
  /* 🔴 2026-09-17 ゆうた：FlowDesk「最短入庫日の案内」が読む earliest.grid／earliest.days */
  const E = R.earliest;
  ok('🔴 最短入庫日の見出し・数字5つ・明細5行は今までどおり', E.titleOk, E.metricsText);
  ok('🔴 grid＝国産・輸入 × 代車なし・代車あり・当日作業、日付(YYYY-MM-DD)か null', E.gridShape, E.grid);
  ok('🔴 grid＝dashEarliestIntake と同じ日（当日作業は輸入も）', JSON.stringify(E.grid) === JSON.stringify(E.want), [E.grid, E.want]);
  const vDs = ds => !ds ? 'なし' : ds === E.todayDs ? '今日' : null;
  const mOk = [E.grid.dom.no, E.grid.dom.loan, E.grid.imp.no, E.grid.imp.loan, E.grid.dom.same].every((ds, i) => {
    const t = vDs(ds), v = E.metricsText[i];
    return t ? v === t : v.indexOf((+ds.slice(5, 7)) + '/' + (+ds.slice(8, 10)) + '(') === 0;
  });
  ok('🔴 grid と今までの数字（文字）が同じ日を指す', mOk, [E.grid, E.metricsText]);
  ok('🔴 days＝今日から21日・1日ずつ', E.daysN === 21 && E.seq && E.firstDs === E.todayDs && E.lastDs === E.lastWant, [E.daysN, E.firstDs, E.lastDs]);
  ok('🔴 days の1行＝ds・closed・label・dom[数,枠]・imp[数,枠]・loanFree・loanTotal（整数）', E.rowShape);
  ok('🔴 days の数字＝予約の埋まり（fill）と同じ', E.sameAsFill && E.intakeSame, [E.sameAsFill, E.intakeSame]);
  ok('🔴 休みの日も数字は入る（label あり）・PitCal の休みは closed', E.closedHasNums && E.closedCal, E.closedList);
  ok('🔴 代車の空き＝pitLoanerFreeOn の台数・0〜全台数', E.loanOk, E.total);
  console.log('     休みの日: ' + (E.closedList.join(' ') || 'なし') + '／代車 ' + E.total + '台／grid ' + JSON.stringify(E.grid));
}
{
  /* 🔴 2026-09-17 ゆうた：FlowDesk のサイドバーに PitFlow の売上カード（sections.salesBoard／perUser[id].sections.front） */
  const X = R.board;
  ok('🔴 売上ボード（salesBoard）が届く', !!X);
  if (X) {
    ok('🔴 形＝month・day・days・min・max・tiers/counts（6区分）・divs・fronts・company（整数・null）', X.shape, X.B);
    ok('🔴 6区分の金額・台数＝売上画面「当月」（collectMonth）と同じ', X.sameScreen, [X.B.tiers, X.scr, X.B.counts, X.scrN]);
    ok('🔴 台数＝物差し（pitSalesTier＋pitSalesInRange）で数え直しても同じ（売上なし・廃車は入らない）', X.sameRule && X.scrapIn === 0, [X.B.counts, X.own, X.scrapIn]);
    ok('🔴 目標＝売上画面の target（最低・最高）', X.target, [X.B.min, X.B.max]);
    ok('🔴 1課＋2課＝全体（6区分の金額・台数）', X.divSum);
    ok('🔴 課ごとの数字＝売上画面の課別と同じ', X.divScreen);
    ok('🔴 課の目標＝ratioD（国産の％）で割る・足すと全体', X.divTarget, [X.ratioD, X.B.divs.div1.min, X.B.divs.div2.min]);
    ok('🔴 フロント4区分の合計＝全体（未割当も1行で持つので必ずそろう）', X.frontSum, [X.frSum, X.B.tiers]);
    ok('🔴 フロントごとの金額＝売上画面のフロント別と同じ', X.frontScreen);
    ok('フロントは実績の多い順', X.frontSorted);
    ok('平均単価＝実績÷実績台数（フロント・全社）', X.frontAvg);
    ok('🔴 memberId＝state.staff の id（未割当・名簿に無い名前は null）', X.frontMember, X.B.fronts.map(f => [f.name, f.memberId]));
    ok('🔴 平均預かり日数＝入庫日（actualInAt／reserveDate）→実績カウント日 の平均（小数1桁）', X.stay[0] === X.stay[1] && X.stay[0] !== null, X.stay);
    ok('🔴 自分のフロント成績（perUser.front）＝ボードの行と同じ・順位と人数', X.puFront.length > 0 && X.puFrontOk, X.puFront);
    ok('🔴 名簿にいるフロントは全員 perUser.front を持つ', X.puFrontAll);
    ok('自分の分の今までの5項目はそのまま', X.puKeepSections);
    ok('売上ボードは小さい（10KB未満）', X.size < 10000, X.size);
    console.log('     売上ボード: ' + JSON.stringify({ month: X.B.month, day: X.B.day, days: X.B.days, min: X.B.min, max: X.B.max, tiers: X.B.tiers, counts: X.B.counts, divs: X.B.divs, company: X.B.company }));
    console.log('     フロント: ' + X.B.fronts.map(f => f.name + '(' + (f.memberId || '-') + ') 実績' + f.tiers.act + '/' + f.counts.act + '台 預' + f.avgStayDays).join('／'));
    console.log('     順位: ' + X.puFront.map(x => x.name + ' ' + x.rank + '/' + x.of).join('／') + '／売上なしで範囲内 ' + X.noSaleIn + '台（数えない）');
  }
}
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
    /* salesBoard は FlowDesk だけが読む（機械で読む形・CoreFlow のBOXにはしない）ので dash.js に無くてよい */
    const FD_ONLY = ['salesBoard'];
    ok('🔴 配っている鍵は、ぜんぶ dash.js が知っている（FlowDesk 専用の salesBoard を除く）', R.keys.every(k => keys.indexOf(k) >= 0 || FD_ONLY.indexOf(k) >= 0), R.keys.filter(k => keys.indexOf(k) < 0));
    const me = (dj.match(/ME_SECTIONS = \{\s*pitflow: \[[\s\S]*?\]\],/) || [''])[0];
    const mk = [...me.matchAll(/\['([A-Za-z0-9_]+)', '/g)].map(m => m[1]);
    ok('🔴 自分の分の鍵もそろっている', mk.length === 5 && R.task && mk.every(k => R.task[2].indexOf(k) >= 0), [mk, R.task && R.task[2]]);
  } else ok('ポータルの dash.js が見つかる', false, portal);
}

await b.close();
console.log('\n結果: ' + OK + ' OK / ' + NG + ' NG');
process.exit(NG ? 1 : 0);
