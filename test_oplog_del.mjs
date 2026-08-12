/* PitFlow v1.84.0 ── 操作ログの「1件だけ消す」（マスター限定）の見張り
   -------------------------------------------------------------------
   ◎ゆうた依頼（2026-08-12）
     「ログにマスターだけ消去を付ける」＝操作ログの行を、マスター（ゆうた）だけが消せるようにする。
     ⚠ 全消しは作らない。**1行ずつ**（本人の決定）。

   ◎ここで見張ること
     ① マスター以外には ゴミ箱 が出ない（本番）
     ② マスターには出る。押すと確認が出て、「やめる」なら消えない
     ③ 「消す」と、**その1件だけ**がクラウドから消える（ほかの行は無事）
     ④ 消したことは記録に残るが、**中身は残さない**（消した行の時刻だけ）
     ⑤ 画面のボタンが無くても pitOplogDelete を直接呼べば消える…ようにはしない（権限ガード）
     ⑥ サーバーに拒否されたら、画面からも消さない（見た目だけ消える事故を防ぐ）
     ⑦ 練習用サイト（サンプル）は端末の中だけの記録なので誰でも消せる。
        消したら **localStorage からも消え、開き直しても復活しない**
        （＝消したあとに足す「消去の記録」が、古い控えを書き戻してしまわないこと）

   ◎使い方
     python3 -m http.server 8993      ← 別ウィンドウ
     node test_oplog_del.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8993;
const DIR = path.dirname(new URL(import.meta.url).pathname);
const HARNESS = path.join(DIR, '_oplog_del_harness.html');
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

/* 操作ログの本体だけを、にせのクラウドと一緒に置く小さな画面。
   本物の index.html は Google ログインが要るので、ここでは
   「本番モードの手順」だけを同じ順番でなぞる。
   ?sample を付けるとサンプルモード（この端末の中だけ）になる。 */
fs.writeFileSync(HARNESS, `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="css/news-oplog.css"></head><body>
<div id="oplog-body"></div>
<script>
var SAMPLE = location.search.indexOf('sample') >= 0;
window.PIT_CLOUD = !SAMPLE;
window.state = { currentView: 'oplog', staff: [{ id:'s1', name:'テスト太郎', front:true }] };
window.__toasts = [];
window.__answer = true;       /* 確認の窓の答え */
window.__canDel = true;       /* サーバーが削除を許すか（ルールの代わり） */
window.__asked = [];
window.__tick = 0;
window.__docs = {};           /* にせの pitAuditLogs（id → 中身） */
window.__seq = 0;

function col(name) {
  window.__lastCol = name;
  return {
    add: function (o) {
      var id = 'd' + (++window.__seq);
      window.__docs[id] = o;
      return Promise.resolve({ id: id });
    },
    orderBy: function () { return this; },
    limit:   function () { return this; },
    get: function () {
      var ids = Object.keys(window.__docs);
      ids.sort(function (a, b) { return window.__docs[b].time.toMillis() - window.__docs[a].time.toMillis(); });
      var arr = ids.map(function (id) { return { id: id, data: function () { return window.__docs[id]; } }; });
      return Promise.resolve({ forEach: function (f) { arr.forEach(f); } });
    },
    doc: function (id) {
      return {
        delete: function () {
          if (!window.__canDel) return Promise.reject(new Error('permission-denied'));
          delete window.__docs[id];
          return Promise.resolve();
        }
      };
    }
  };
}
window.fb = {
  ready: true,
  currentUser: { uid: 'u1' },
  currentMember: null,        /* ← 誰でログインしているか。テストから差し替える */
  /* ログインの見張りは何もしない（この試験では認証そのものは見ない） */
  auth: { currentUser: null, onAuthStateChanged: function () {} },
  serverTimestamp: function () { var n = 1000 + (++window.__tick); return { toMillis: function () { return n; } }; },
  company: function () { return { collection: col }; }
};
window.pitAsk = function (msg, opt) { window.__asked.push({ msg: msg, opt: opt || {} }); return Promise.resolve(window.__answer !== false); };
window.pitToast = function (m) { window.__toasts.push(String(m)); };
window.icoBoot = function () {};
<\/script>
<!-- 🔴 pitIsMaster は**にせ物を作らない**。本物（auth-pit.js）をそのまま読む＝
     「本番はマスターだけ／サンプルは全員」という線引きごと見張る。 -->
<script src="js/auth-pit.js"><\/script>
<script src="js/oplog-pit.js"><\/script>
</body></html>`);

const b = await chromium.launch({ executablePath: cp });
const errs = [];

async function openPage(sample) {
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  p.on('pageerror', e => errs.push(String(e)));
  /* ⚠ 「わざと拒否させる」試験で出る赤字だけは数に入れない（下で別に見ている） */
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|1件消去に失敗/.test(m.text())) errs.push(m.text()); });
  await p.goto(`http://127.0.0.1:${PORT}/_oplog_del_harness.html` + (sample ? '?sample' : ''));
  await p.waitForFunction('window.pitLog && window.renderOplog', null, { timeout: 25000 });
  return p;
}
const rows    = p => p.evaluate(() => [].map.call(document.querySelectorAll('.op-row'), r => r.querySelector('.op-act').textContent));
const delBtns = p => p.evaluate(() => document.querySelectorAll('.op-del').length);
const docs    = p => p.evaluate(() => Object.keys(window.__docs).map(k => window.__docs[k].action));
const toasts  = p => p.evaluate(() => window.__toasts.slice());

/* 3件の記録を作ってから、操作ログの画面を出す */
async function seed(p) {
  await p.evaluate(() => {
    pitLog('予約を作成', { label: '山田 様 / タント' });
    pitLog('代車を貸出', { label: '3 ムーヴ' });
    pitLog('返車を確定', { label: '鈴木 様 / N-BOX' });
  });
  await p.waitForTimeout(120);
  await p.evaluate(() => { window.pitOplogReload(); });
  await p.waitForTimeout(250);
}

try {
  console.log('\n── 本番モード：マスター以外には出ない（「管理」でも出ない） ──');
  let p = await openPage(false);
  await p.evaluate(() => { window.fb.currentMember = { name: '管理の人', admin: true, pitflow: { role: '管理' } }; });
  await seed(p);
  ok('3件ならんでいる', (await rows(p)).length === 3, await rows(p));
  ok('この人は「管理」ではある', await p.evaluate(() => window.pitIsAdmin() === true));
  ok('でもマスターではない', await p.evaluate(() => window.pitIsMaster() === false));
  ok('ゴミ箱が1つも出ていない', (await delBtns(p)) === 0);
  ok('「あなただけに出ています」の案内も出ていない',
     !(await p.evaluate(() => document.getElementById('oplog-body').innerHTML.indexOf('マスター') >= 0)));

  console.log('\n── 画面に無くても、呼べば消える…ようにはしない ──');
  await p.evaluate(() => { window.pitOplogDelete('k1'); });
  await p.waitForTimeout(200);
  ok('マスターでない人が直接呼んでも消えない', (await docs(p)).length === 3, await docs(p));
  ok('確認の窓すら出ていない', (await p.evaluate(() => window.__asked.length)) === 0);
  await p.close();

  console.log('\n── 本番モード：マスターには出る ──');
  p = await openPage(false);
  await p.evaluate(() => { window.fb.currentMember = { name: 'ゆうた', master: true }; });
  await seed(p);
  ok('3行ぶんのゴミ箱が出た', (await delBtns(p)) === 3);
  ok('案内が出た', await p.evaluate(() => document.getElementById('oplog-body').innerHTML.indexOf('あなた（マスター）にだけ') >= 0));

  console.log('\n── 「やめる」なら消えない ──');
  await p.evaluate(() => { window.__answer = false; });
  await p.click('.op-row:nth-child(1) .op-del');
  await p.waitForTimeout(250);
  ok('確認の窓が出た', (await p.evaluate(() => window.__asked.length)) === 1);
  ok('危ない操作として聞いている', await p.evaluate(() => window.__asked[0].opt.danger === true));
  ok('消した行の中身を見せてから聞いている', await p.evaluate(() => /タント|N-BOX|ムーヴ/.test(window.__asked[0].opt.detail || '')));
  ok('やめたら消えていない', (await docs(p)).length === 3, await docs(p));
  ok('画面も3行のまま', (await rows(p)).length === 3);

  console.log('\n── 「消す」＝その1件だけ ──');
  await p.evaluate(() => { window.__answer = true; });
  const before = await rows(p);
  await p.click('.op-row:nth-child(1) .op-del');
  await p.waitForTimeout(300);
  const after = await rows(p);
  ok('押した1件だけ画面から消えた', after.indexOf(before[0]) < 0, { before, after });
  ok('ほかの2件は残っている', before.slice(1).every(x => after.indexOf(x) >= 0), { before, after });
  ok('クラウドからも本当に消えた', !(await docs(p)).includes(before[0]), await docs(p));
  ok('消したことが記録に残った', (await docs(p)).includes('操作ログを1件消去'), await docs(p));
  ok('画面のいちばん上にも出ている', after[0] === '操作ログを1件消去', after);
  ok('消した中身は記録に残していない',
     !(await p.evaluate(() => Object.keys(window.__docs).some(k =>
        window.__docs[k].action === '操作ログを1件消去' && /タント|山田/.test(window.__docs[k].label || '')))));
  ok('「1件消しました」と知らせた', (await toasts(p)).some(t => t.indexOf('1件消しました') >= 0), await toasts(p));

  console.log('\n── サーバーに拒否されたら、画面からも消さない ──');
  await p.evaluate(() => { window.__canDel = false; window.__toasts.length = 0; });
  const n1 = (await rows(p)).length;
  await p.click('.op-row:nth-child(2) .op-del');
  await p.waitForTimeout(300);
  ok('行が減っていない', (await rows(p)).length === n1, { n1, now: (await rows(p)).length });
  ok('消せなかったと知らせた', (await toasts(p)).some(t => t.indexOf('消せませんでした') >= 0), await toasts(p));
  await p.close();

  console.log('\n── 練習用サイト（サンプル）：この端末の中だけ ──');
  p = await openPage(true);
  await p.evaluate(() => { try { localStorage.removeItem('pitflow_oplog_v1'); } catch (e) {} });
  await seed(p);
  ok('サンプルは全員がマスターあつかい（端末の中だけの記録だから）', await p.evaluate(() => window.pitIsMaster() === true));
  ok('サンプルでもゴミ箱が出る', (await delBtns(p)) === 3);
  const b2 = await rows(p);
  await p.click('.op-row:nth-child(1) .op-del');
  await p.waitForTimeout(300);
  ok('画面から消えた', (await rows(p)).indexOf(b2[0]) < 0, await rows(p));
  ok('端末の控えからも消えた',
     await p.evaluate(a => !JSON.parse(localStorage.getItem('pitflow_oplog_v1') || '[]').some(x => x.action === a), b2[0]));
  ok('消去の記録は端末に残っている',
     await p.evaluate(() => JSON.parse(localStorage.getItem('pitflow_oplog_v1') || '[]').some(x => x.action === '操作ログを1件消去')));

  /* 🔴 いちばん踏みやすい罠：消したあとに足す「消去の記録」が、
     消す前の控え（localStorage）を読み直して書き戻すと、消した行が生き返る。 */
  await p.close();
  p = await openPage(true);
  await p.evaluate(() => { window.pitOplogReload(); });
  await p.waitForTimeout(250);
  ok('開き直しても、消した行は復活しない', (await rows(p)).indexOf(b2[0]) < 0, await rows(p));
  await p.close();

  console.log('\n── 画面のエラー ──');
  ok('赤いエラーが出ていない', errs.length === 0, errs.slice(0, 4));
} finally {
  try { fs.unlinkSync(HARNESS); } catch (e) {}
  await b.close();
}

console.log(`\n合計：${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
