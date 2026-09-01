/* PitFlow v1.84.0 ── 操作ログの「選んでまとめて消す」（マスター限定）の見張り
   -------------------------------------------------------------------
   ◎ゆうた依頼（2026-08-12）
     「ログにマスターだけ消去を付ける」→「ゴミ箱じゃなくて右端にチェックBOXで、まとめて消去で」
     ＝行の右はしにチェックBOX。選んでから［選んだ ◯件 を消す］でまとめて消える。
     ⚠ 全消し（ぜんぶ消すボタン）は作らない。**必ず自分で選んでから**消す。

   ◎ここで見張ること
     ① マスター以外にはチェックBOXが出ない（「管理」でも出ない）
     ② 選ばないと消せない（ボタンが押せない）
     ③ 選んだぶんだけ消える。選んでいない行は無事
     ④ 🔴 消したことは**記録に残さない**（ゆうた指示。消せるのは本人だけなので追う相手がいない）
     ⑤ 画面にボタンが無くても、直接呼べば消える…ようにはしない（権限ガード）
     ⑥ サーバーに拒否されたら、画面からも消さない
     ⑦ 🔴 **絞り込みを変えたら選択は解除**（見えていない行が巻き添えで消える事故を防ぐ）
     ⑧ ［表示中のぜんぶを選ぶ］は**見えている行だけ**が対象
     ⑨ 練習用サイト（サンプル）は端末の中だけの記録なので誰でも消せる。
        消したら localStorage からも消え、**開き直しても復活しない**
        （＝消したあとに足す「消去の記録」が、古い控えを書き戻してしまわないこと）

   ◎使い方
     python3 -m http.server 8993      ← 別ウィンドウ
     node test_oplog_del.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = process.env.PORT || 8993;
/* 🔴 2026-08-21 `new URL(import.meta.url).pathname` は **%E3%82%A2… の形（URLエンコード）のまま**返る。
   本物のフォルダは `D:\Claude\アプリ開発\…` と日本語なので、**そのままではファイルが開けない**。
   （中身が英数字だけの仮フォルダで走らせている間は気づけない。）**必ず fileURLToPath を通す。** */
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   /* 🔄 _見張り/ に移したので1つ上（pitflow）を指す */
const HARNESS = path.join(DIR, '_oplog_del_harness.html');
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
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
window.__commits = 0;

function col(name) {
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
    doc: function (id) { return { __id: id }; }
  };
}
/* 本物と同じ形のバッチ（commit するまで消さない＝拒否された時に何も起きないことも見張れる） */
function batch() {
  var ops = [];
  return {
    delete: function (ref) { ops.push(ref.__id); return this; },
    commit: function () {
      if (!window.__canDel) return Promise.reject(new Error('permission-denied'));
      ops.forEach(function (id) { delete window.__docs[id]; });
      window.__commits++;
      return Promise.resolve();
    }
  };
}
window.fb = {
  ready: true,
  currentUser: { uid: 'u1' },
  currentMember: null,        /* ← 誰でログインしているか。テストから差し替える */
  auth: { currentUser: null, onAuthStateChanged: function () {} },
  db: { batch: batch },
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
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|まとめて消去に失敗/.test(m.text())) errs.push(m.text()); });
  await p.goto(`http://127.0.0.1:${PORT}/_oplog_del_harness.html` + (sample ? '?sample' : ''));
  await p.waitForFunction('window.pitLog && window.renderOplog', null, { timeout: 25000 });
  return p;
}
const rows   = p => p.evaluate(() => [].map.call(document.querySelectorAll('.op-row'), r => r.querySelector('.op-act').textContent));
const boxes  = p => p.evaluate(() => document.querySelectorAll('.op-ck input').length);
const docs   = p => p.evaluate(() => Object.keys(window.__docs).map(k => window.__docs[k].action));
const toasts = p => p.evaluate(() => window.__toasts.slice());
const btn    = p => p.evaluate(() => { const b = document.getElementById('op-delsel');
                                       return b ? { on: !b.disabled, label: b.textContent.trim() } : null; });
const selN   = p => p.evaluate(() => { const s = document.getElementById('op-seln'); return s ? s.textContent : null; });
const pick   = (p, i) => p.click(`.op-row:nth-child(${i}) .op-ck input`);

/* 4件の記録を作ってから、操作ログの画面を出す */
async function seed(p) {
  await p.evaluate(() => {
    pitLog('予約を作成', { label: '山田 様 / タント' });
    pitLog('代車を貸出', { label: '3 ムーヴ' });
    pitLog('返車を確定', { label: '鈴木 様 / N-BOX' });
    pitLog('付箋を追加', { label: '部品待ち' });
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
  ok('4件ならんでいる', (await rows(p)).length === 4, await rows(p));
  ok('この人は「管理」ではある', await p.evaluate(() => window.pitIsAdmin() === true));
  ok('でもマスターではない', await p.evaluate(() => window.pitIsMaster() === false));
  ok('チェックBOXが1つも出ていない', (await boxes(p)) === 0);
  ok('［選んだ行を消す］も出ていない', (await btn(p)) === null);

  console.log('\n── 画面に無くても、呼べば消える…ようにはしない ──');
  await p.evaluate(() => { window.pitOplogPickAll(true); window.pitOplogPick('k1', true); window.pitOplogDeleteSelected(); });
  await p.waitForTimeout(250);
  ok('マスターでない人が直接呼んでも消えない', (await docs(p)).length === 4, await docs(p));
  ok('確認の窓すら出ていない', (await p.evaluate(() => window.__asked.length)) === 0);
  await p.close();

  console.log('\n── 本番モード：マスターには出る ──');
  p = await openPage(false);
  await p.evaluate(() => { window.fb.currentMember = { name: 'ゆうた', master: true }; });
  await seed(p);
  ok('4行ぶんのチェックBOXが出た', (await boxes(p)) === 4);
  /* ⚠ ゆうた指示で「あなただけに出ています」の説明文は出さない。増えていないか見張る。 */
  ok('よけいな説明文が出ていない', await p.evaluate(() => document.getElementById('oplog-body').innerHTML.indexOf('マスター') < 0));
  ok('選ぶ前はボタンが押せない', (await btn(p)).on === false, await btn(p));
  ok('「選択なし」と出ている', (await selN(p)) === '選択なし', await selN(p));

  console.log('\n── 選ぶと件数が出る ──');
  await pick(p, 1); await pick(p, 3);
  await p.waitForTimeout(150);
  ok('選択中 2 件', (await selN(p)) === '選択中 2 件', await selN(p));
  ok('ボタンが押せるようになり、件数が入った',
     (await btn(p)).on && (await btn(p)).label.indexOf('2 件') >= 0, await btn(p));

  console.log('\n── 「やめる」なら消えない ──');
  await p.evaluate(() => { window.__answer = false; });
  await p.click('#op-delsel');
  await p.waitForTimeout(300);
  ok('確認の窓が出た', (await p.evaluate(() => window.__asked.length)) === 1);
  ok('件数を見せて聞いている', await p.evaluate(() => /2 件/.test(window.__asked[0].msg)), await p.evaluate(() => window.__asked[0].msg));
  ok('危ない操作として聞いている', await p.evaluate(() => window.__asked[0].opt.danger === true));
  /* 選んだのは1行目（付箋を追加）と3行目（代車を貸出）＝新しい順にならんでいる */
  ok('消す中身も見せている', await p.evaluate(() => /付箋を追加/.test(window.__asked[0].opt.detail || '')
                                              && /代車を貸出/.test(window.__asked[0].opt.detail || '')),
     await p.evaluate(() => (window.__asked[0] || {}).opt));
  ok('やめたら消えていない', (await docs(p)).length === 4, await docs(p));

  console.log('\n── 「消す」＝選んだぶんだけ ──');
  await p.evaluate(() => { window.__answer = true; });
  const before = await rows(p);
  await p.click('#op-delsel');
  await p.waitForTimeout(400);
  const after = await rows(p);
  ok('選んだ2件が画面から消えた', after.indexOf(before[0]) < 0 && after.indexOf(before[2]) < 0, { before, after });
  ok('選ばなかった2件は残っている', after.indexOf(before[1]) >= 0 && after.indexOf(before[3]) >= 0, { before, after });
  ok('クラウドからも本当に消えた',
     !(await docs(p)).includes(before[0]) && !(await docs(p)).includes(before[2]), await docs(p));
  ok('1回の通信でまとめて消した', (await p.evaluate(() => window.__commits)) === 1);
  /* 🔴 ゆうた指示：消したこと自体は記録に残さない */
  ok('「消去しました」の記録が増えていない', !(await docs(p)).some(a => /消去/.test(a)), await docs(p));
  ok('残りはちょうど2件', (await docs(p)).length === 2, await docs(p));
  ok('選択は空に戻った', (await selN(p)) === '選択なし', await selN(p));
  ok('「2件消しました」と知らせた', (await toasts(p)).some(t => t.indexOf('2件消しました') >= 0), await toasts(p));

  console.log('\n── サーバーに拒否されたら、画面からも消さない ──');
  await p.evaluate(() => { window.__canDel = false; window.__toasts.length = 0; });
  await pick(p, 1);
  await p.waitForTimeout(120);
  const n1 = (await rows(p)).length;
  await p.click('#op-delsel');
  await p.waitForTimeout(400);
  ok('行が減っていない', (await rows(p)).length === n1, { n1, now: (await rows(p)).length });
  ok('消せなかったと知らせた', (await toasts(p)).some(t => t.indexOf('消せませんでした') >= 0), await toasts(p));
  ok('選んだままなので、もう一度押せる', (await btn(p)).on === true, await btn(p));
  await p.close();

  console.log('\n── 絞り込みと「表示中のぜんぶを選ぶ」 ──');
  p = await openPage(false);
  await p.evaluate(() => { window.fb.currentMember = { name: 'ゆうた', master: true }; });
  await seed(p);
  await pick(p, 1);
  await p.waitForTimeout(120);
  await p.evaluate(() => window.pitOplogSearch('代車'));
  await p.waitForTimeout(200);
  ok('絞り込むと1行だけ', (await rows(p)).length === 1, await rows(p));
  ok('🔴 絞り込みを変えたら選択は解除される', (await selN(p)) === '選択なし', await selN(p));
  await p.click('#op-ckall');
  await p.waitForTimeout(150);
  ok('「表示中のぜんぶを選ぶ」は見えている1件だけ', (await selN(p)) === '選択中 1 件', await selN(p));
  await p.click('#op-delsel');
  await p.waitForTimeout(400);
  await p.evaluate(() => window.pitOplogSearch(''));
  await p.waitForTimeout(250);
  const rest = await rows(p);
  ok('絞り込んだ1件だけが消えた（ほかは巻き添えになっていない）',
     rest.indexOf('代車を貸出') < 0 && rest.indexOf('予約を作成') >= 0 && rest.indexOf('返車を確定') >= 0, rest);
  await p.close();

  console.log('\n── 練習用サイト（サンプル）：この端末の中だけ ──');
  p = await openPage(true);
  await p.evaluate(() => { try { localStorage.removeItem('pitflow_oplog_v1'); } catch (e) {} });
  await seed(p);
  ok('サンプルは全員がマスターあつかい（端末の中だけの記録だから）', await p.evaluate(() => window.pitIsMaster() === true));
  ok('サンプルでもチェックBOXが出る', (await boxes(p)) === 4);
  const b2 = await rows(p);
  await pick(p, 1); await pick(p, 2);
  await p.waitForTimeout(150);
  await p.click('#op-delsel');
  await p.waitForTimeout(400);
  const sp = await rows(p);
  ok('画面から2件消えた', sp.indexOf(b2[0]) < 0 && sp.indexOf(b2[1]) < 0, sp);
  ok('端末の控えからも消えた',
     await p.evaluate(a => { const s = JSON.parse(localStorage.getItem('pitflow_oplog_v1') || '[]');
                             return !s.some(x => x.action === a[0]) && !s.some(x => x.action === a[1]); }, [b2[0], b2[1]]));
  ok('端末にも消去の記録は残っていない',
     await p.evaluate(() => !JSON.parse(localStorage.getItem('pitflow_oplog_v1') || '[]').some(x => /消去/.test(x.action))));

  /* 🔴 開き直して本当に消えているか（端末への書き戻しが効いているか） */
  await p.close();
  p = await openPage(true);
  await p.evaluate(() => { window.pitOplogReload(); });
  await p.waitForTimeout(300);
  const sp2 = await rows(p);
  ok('開き直しても、消した行は復活しない', sp2.indexOf(b2[0]) < 0 && sp2.indexOf(b2[1]) < 0, sp2);
  await p.close();

  console.log('\n── 画面のエラー ──');
  ok('赤いエラーが出ていない', errs.length === 0, errs.slice(0, 4));
} finally {
  try { fs.unlinkSync(HARNESS); } catch (e) {}
  await b.close();
}

console.log(`\n合計：${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
