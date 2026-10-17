/* ========================================================
   test_summary_server_equiv.mjs ── 🏭 2026-10-17（棚卸し C-08 第4段 4b）
   PitFlow の概況（appSummaries/pitflow）と通知のもと（feedFacts/pitflow）を、サーバーが PitFlow の画面のファイルを借りて作る。
   ◎見張ること：**見本データで、本物のブラウザが作る答えと、サーバーの箱（summary-server.js の pitBox）が作る答えが1文字も同じ**
     ＝読み込むファイルの並び・箱の作り（DOM の偽物）・状態の入れ方のどれかがずれたら赤
   走らせ方：python -m http.server 8997（PitFlow\pitflow で・別窓）→ node _見張り/test_summary_server_equiv.mjs（PitFlow\pitflow で）
   ======================================================== */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
const require = createRequire(import.meta.url);
const PORT = process.env.PORT || 8997;
const ROOT = path.join(process.cwd(), '..', '..');
const SS = require(path.join(ROOT, '_サーバー', 'functions', 'summary-server.js'));
process.env.TZ = 'Asia/Tokyo';

let ok = 0, ng = 0;
const T = (n, c, x) => { if (c) { ok++; console.log('  ✅ ' + n); } else { ng++; console.log('  ❌ ' + n + (x !== undefined ? '  → ' + String(x).slice(0, 400) : '')); } };

const cp = chromePath ? chromePath() : undefined;
const b = await chromium.launch(cp ? { executablePath: cp } : {});
const p = await b.newPage();
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && Array.isArray(state.cards) && state.cards.length > 0 && window.PIT_DASH_API && window._pitflowSummaryBuild && window._pitFeedFactsBuild', null, { timeout: 30000 });
await p.waitForTimeout(1500);
const got = await p.evaluate(() => JSON.stringify({
  state: (function () { var o = {}; Object.keys(state).forEach(function (k) { if (k !== 'currentView') o[k] = state[k]; }); return o; })(),
  sum: _pitflowSummaryBuild(),
  facts: _pitFeedFactsBuild(),
  cal: (window.PitCal && PitCal._raw) ? PitCal._raw() : null,
}));
await b.close();
const G = JSON.parse(got);

/* サーバーの箱に、ブラウザと同じ状態を入れて作る */
const box = SS.pitBox((pp) => fs.readFileSync(path.join(process.cwd(), pp.split('?')[0]), 'utf8'));
const r = await SS.pitBuildFromState(await box, G.state, G.cal);
const norm = (o) => JSON.stringify(o, (k, v) => (k === 'updatedAt' ? undefined : v));
T('🔴 概況（appSummaries/pitflow）が本物のブラウザと1文字も同じ（' + Object.keys(G.sum.sections || {}).length + 'の項目・' + Object.keys(G.sum.perUser || {}).length + '人）', norm(r.doc) === norm(G.sum), norm(r.doc).slice(0, 200) + ' ≠ ' + norm(G.sum).slice(0, 200));
T('🔴 通知のもと（feedFacts/pitflow）が本物のブラウザと1文字も同じ', norm(r.facts) === norm(G.facts), norm(r.facts).slice(0, 200) + ' ≠ ' + norm(G.facts).slice(0, 200));

/* 本番の読み込み道（buildPitflow）：見本データを偽の Firestore に入れ、名簿（portalMembers）・営業日も Firestore から読ませる */
{
  const cid = 'kobayashi_motors';
  const COLS = { cards: 'pitCards', customers: 'pitCustomers', loaners: 'pitLoaners', loanerAssigns: 'pitLoanerAssigns', companyCars: 'pitCompanyCars', fleetEvents: 'pitFleetEvents', boardNotes: 'pitBoardNotes' };
  const st = G.state;
  const store = {};
  Object.keys(COLS).forEach((k) => { store[COLS[k]] = (st[k] || []).map((x) => Object.assign({}, x)); });
  store.portalMembers = (st.staff || []).filter((x) => x && x.id && !x.isSelf).map((x) => ({ id: x.id, name: x.name, active: true, pitflow: { on: true }, master: false }));
  store.coreMembers = []; store.coreDepts = []; store.coreLocations = [];
  const docs = { 'pitSettings/main': { settings: st.settings || {}, bays: st.bays, floorPlan: st.floorPlan }, 'pitSettings/staffProps': { props: {} }, 'appSummaries/mhsCalendar': null };
  const snap = (list) => ({ docs: list.map((x) => ({ id: x.id, data: () => { const y = Object.assign({}, x); delete y.id; return y; } })) });
  const db = { collection: () => ({ doc: () => ({
    collection: (n) => ({ get: async () => snap(store[n] || []), doc: (id) => ({ get: async () => { const v = docs[n + '/' + id]; return { exists: v != null, data: () => v }; } }) }),
  }) }) };
  let r = null, err = null;
  try { r = await SS.buildPitflow({ db, cid, getText: async (pp) => fs.readFileSync(path.join(process.cwd(), pp.split('?')[0]), 'utf8') }); } catch (e) { err = e; }
  T('本番の読み込み道で作れる（Firestore → 車・名簿 → PitFlow 自身の読み込み処理）', !!r && !err, err && (err.stack || err.message));
  if (r) {
    const secA = JSON.stringify(r.doc.sections), secB = JSON.stringify(G.sum.sections);
    T('🔴 項目ごとの中身（sections）が本物のブラウザと同じ', secA === secB, secA.slice(0, 200) + ' ≠ ' + secB.slice(0, 200));
    const kA = Object.keys(r.doc.perUser || {}).sort().join(), kB = Object.keys(G.sum.perUser || {}).sort().join();
    T('🔴 担当者ごと（perUser）の人がそろう（名簿は portalMembers から PitFlow の members-pit.js が組む）', kA === kB && kA.length > 0, kA + ' ≠ ' + kB);
    const same = Object.keys(G.sum.perUser || {}).every((id) => JSON.stringify(r.doc.perUser[id]) === JSON.stringify(G.sum.perUser[id]));
    T('担当者ごとの中身も同じ', same);
    /* 名前→番号の表（staff・names）は名簿の並び順に並ぶ＝見本の名簿に入社日が無いので順だけ違う。中身で比べる */
    /* ⚠ memberDivs（人ごとの課）は CoreMembers の部署から組む＝この見本の名簿には部署を入れていないので比べない（課の物差しは上の「箱に同じ状態」の突き合わせで見ている） */
    const deep = (o) => Array.isArray(o) ? o.map(deep) : (o && typeof o === 'object') ? Object.keys(o).sort().reduce((a, k) => { a[k] = deep(o[k]); return a; }, {}) : o;
    const fa = deep(Object.assign({}, r.facts, { by: 0, updatedAt: 0, memberDivs: 0 }));
    const fb2 = deep(Object.assign({}, G.facts, { by: 0, updatedAt: 0, memberDivs: 0 }));
    const diffK = Object.keys(Object.assign({}, fa, fb2)).filter((k) => JSON.stringify(fa[k]) !== JSON.stringify(fb2[k]));
    T('通知のもとの中身（売上・入庫など）も同じ', !diffK.length, diffK.map((k) => k + ':' + JSON.stringify(fa[k]).slice(0, 150) + ' / ' + JSON.stringify(fb2[k]).slice(0, 150)).join(' ｜ '));
  }
}
console.log('\n' + (ng ? '❌' : '✅') + '  ' + ok + ' 件OK / ' + ng + ' 件NG');
process.exit(ng ? 1 : 0);
