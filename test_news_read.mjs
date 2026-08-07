/* PitFlow v1.68.1 ── 「お知らせの既読が保存できない」の見張り
   -------------------------------------------------------------------
   ◎ゆうた報告
     「お知らせ機能で既読が保存できない」
     ＝確認を押しても、次にログインするとまた同じお知らせが出てくる。

   ◎正体（v1.68.0 のバグ）
     main.js が起動 0.4 秒後に未読の丸を塗りに来る。本番ではその時点で
     まだログインが済んでいないので、既読の置き場が決まらない。
     v1.68.0 は そこで「この端末の控え（＝からっぽ）」を読んで、
     それを本物として覚えてしまっていた。
     そのあとログインしても二度と読み直さないので、
     ・クラウドに入っている既読が反映されない（毎回ぜんぶ未読）
     ・確認を押すと、からっぽの一覧に足した1件だけがクラウドへ上書きされる
     ＝過去の既読が消える、という二重の事故になっていた。

   ◎ここで見張ること
     ① ログイン前に丸を塗りに来ても、既読の置き場を取り違えない
     ② ログイン後はクラウドの既読を読む（前回の確認が効いている）
     ③ 確認を押すとクラウドに残る（しかも既に入っている分を消さない）
     ④ 入り直しても、確認済みのお知らせは二度と出てこない
     ⑤ 読み込みに失敗した時でも、クラウドの既読を消さない

   ◎使い方
     python3 -m http.server 8994      ← 別ウィンドウ
     node test_news_read.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8994;
const DIR = path.dirname(new URL(import.meta.url).pathname);
const HARNESS = path.join(DIR, '_news_cloud_harness.html');
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

/* お知らせの本体だけを、にせのクラウドと一緒に置く小さな画面。
   本物の index.html は Google ログインが要るので、ここでは
   「本番モードの手順」だけを同じ順番でなぞる。 */
fs.writeFileSync(HARNESS, `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="css/news-oplog.css"></head><body>
<div class="si-item" data-view="news">お知らせ</div>
<div id="news-body"></div>
<script>
/* ---- にせのクラウド（中身は Node 側が持っている） ---- */
window.PIT_CLOUD = true;
window.__net = { fail: false, gets: 0, sets: 0 };
function doc(uid) {
  return {
    get: function () {
      window.__net.gets++;
      if (window.__net.fail) return Promise.reject(new Error('offline'));
      return window.__cloudGet(uid).then(function (d) {
        return { exists: !!d, data: function () { return d || {}; } };
      });
    },
    set: function (obj, opt) {
      window.__net.sets++;
      if (window.__net.fail) return Promise.reject(new Error('offline'));
      return window.__cloudSet(uid, JSON.parse(JSON.stringify(obj)), !!(opt && opt.merge));
    }
  };
}
window.fb = {
  ready: true,
  currentUser: null,
  company: function () { return { collection: function () { return { doc: doc }; } }; },
  /* 本物と同じ形の arrayUnion（にせのクラウド側で解釈する） */
  FieldValue: { arrayUnion: function () { return { __op: 'arrayUnion', v: [].slice.call(arguments) }; } }
};
window.__login  = function (uid) { window.fb.currentUser = { uid: uid || 'u1' }; };
window.__logout = function () { window.fb.currentUser = null; if (window.pitNewsForget) window.pitNewsForget(); };
<\/script>
<script src="js/news-pit.js"><\/script>
</body></html>`);

const b = await chromium.launch({ executablePath: cp });
const cloud = {};                    // ← ここが「にせのFirestore」。ページを開き直しても残る
const errs = [];

async function openPage() {
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await p.exposeFunction('__cloudGet', uid => cloud[uid] || null);
  await p.exposeFunction('__cloudSet', (uid, obj, merge) => {
    const cur = merge ? (cloud[uid] || {}) : {};
    Object.keys(obj).forEach(k => {
      const v = obj[k];
      if (v && v.__op === 'arrayUnion') {
        const a = (cur[k] || []).slice();
        v.v.forEach(x => { if (a.indexOf(x) < 0) a.push(x); });
        cur[k] = a;
      } else cur[k] = v;
    });
    cloud[uid] = cur;
    return true;
  });
  await p.goto(`http://127.0.0.1:${PORT}/_news_cloud_harness.html`);
  await p.waitForFunction('window.PIT_NEWS && window.renderNews', null, { timeout: 25000 });
  return p;
}

/* 本番の起動と同じ順番をなぞる：
   ①0.4秒後 main.js が丸を塗る（まだログイン前）→ ②ログイン → ③showApp が丸＋ポップアップ */
async function bootLikeProduction(p, uid) {
  await p.evaluate(() => window.pitNewsRefreshBadge());   // ① ログイン前
  await p.waitForTimeout(120);
  await p.evaluate(u => window.__login(u), uid);          // ② ログイン
  await p.evaluate(() => { window.pitNewsRefreshBadge(); window.pitNewsMaybePopup(); });  // ③
  await p.waitForTimeout(250);
}
const popupTitles = p => p.evaluate(() => {
  const el = document.getElementById('nw-pop');
  return (el && el.classList.contains('open')) ? [el.querySelector('.nw-pop-it').textContent] : [];
});
async function confirmAll(p) {
  const seen = [];
  for (let i = 0; i < 20; i++) {
    const t = await popupTitles(p);
    if (!t.length) break;
    seen.push(t[0]);
    await p.evaluate(() => window.pitNewsPopOk());
    await p.waitForTimeout(120);
  }
  return seen;
}

try {
  console.log('\n── 1回目のログイン ──');
  let p = await openPage();
  await bootLikeProduction(p, 'u1');
  const first = await confirmAll(p);
  await p.waitForTimeout(200);
  ok('ログイン直後にポップアップが出る（1回3件まで）', first.length === 3, first);
  ok('確認した3件がクラウドに残った', (cloud.u1 && cloud.u1.pitNewsRead || []).length === 3, cloud.u1);
  {
    const n = await p.evaluate(() => document.querySelector('.si-newsbadge') && document.querySelector('.si-newsbadge').textContent);
    ok('未読の丸が 13 になった', n === '13', n);
  }
  await p.close();

  console.log('\n── 2回目のログイン（入り直し）＝ここが今回の不具合 ──');
  p = await openPage();
  await bootLikeProduction(p, 'u1');
  const second = await confirmAll(p);
  ok('前に確認した3件はもう出てこない', second.every(t => first.indexOf(t) < 0), { first, second });
  ok('続きの3件が出る', second.length === 3, second);
  ok('クラウドの既読が 6 件に増えた（前の3件を消していない）',
     (cloud.u1 && cloud.u1.pitNewsRead || []).length === 6, cloud.u1);
  {
    const n = await p.evaluate(() => document.querySelector('.si-newsbadge') && document.querySelector('.si-newsbadge').textContent);
    ok('未読の丸が 10 になった', n === '10', n);
  }
  await p.close();

  console.log('\n── 受信箱の「すべて確認済みにする」もクラウドに残る ──');
  p = await openPage();
  await bootLikeProduction(p, 'u1');
  await p.evaluate(() => { window.pitNewsPopClose(); window.renderNews(); });
  await p.waitForTimeout(150);
  await p.evaluate(() => window.pitNewsReadAll());
  await p.waitForTimeout(250);
  ok('16件ぜんぶ既読になった', (cloud.u1 && cloud.u1.pitNewsRead || []).length === 16, cloud.u1);
  await p.close();

  p = await openPage();
  await bootLikeProduction(p, 'u1');
  ok('入り直してもポップアップは出ない', (await popupTitles(p)).length === 0);
  {
    const n = await p.evaluate(() => document.querySelector('.si-newsbadge'));
    ok('未読の丸が消えた', n === null);
  }
  await p.close();

  console.log('\n── ほかの人が同じ端末で入っても混ざらない ──');
  p = await openPage();
  await bootLikeProduction(p, 'u2');
  const other = await confirmAll(p);
  ok('別の人には未読として出る', other.length === 3, other);
  ok('別の人の既読は別に残る', (cloud.u2 && cloud.u2.pitNewsRead || []).length === 3, cloud.u2);
  ok('先に入っていた人の既読は16件のまま', (cloud.u1.pitNewsRead || []).length === 16, cloud.u1);
  await p.close();

  console.log('\n── 通信が切れている時でも、入っている既読を消さない ──');
  p = await openPage();
  await p.evaluate(() => { window.__net.fail = true; });
  await bootLikeProduction(p, 'u1');
  await p.evaluate(() => { window.__net.fail = false; window.pitNewsConfirm(window.PIT_NEWS[0].id); });
  await p.waitForTimeout(250);
  ok('読めなかった時に確認しても、既読は16件のまま（消えない）',
     (cloud.u1.pitNewsRead || []).length === 16, cloud.u1);
  await p.close();

  console.log('\n── 画面のエラー ──');
  ok('赤いエラーが出ていない', errs.length === 0, errs.slice(0, 4));
} finally {
  try { fs.unlinkSync(HARNESS); } catch (e) {}
  await b.close();
}

console.log(`\n合計：${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
