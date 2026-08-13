/* PitFlow v1.88.0 ── 「確認したのと同じお知らせがまた出る」の見張り
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-08-13）
     「お知らせの既読が保存されない」＝**確認したのと同じお知らせがまた出る**。

   ◎正体
     v1.68.1 で「既読の置き場」は直したが、**クラウドが読めなかった時の逃げ道**が
     「からっぽの一覧」だった。読めないと _read=[] ＝ぜんぶ未読になり、
     **前に確認したのと同じ 3 件がまた新着の窓に出る**。
     書き込みが失敗した時も、控えがどこにも残らないので同じことが起きる。

   ◎v1.88.0 の直し（ここで見張ること）
     ① 確認を押したら、通信より先に**この端末（人ごと）に必ず控える**
     ② クラウドが読めなかった時は、その控えで我慢する＝**確認済みは二度と出さない**
     ③ そもそも既読が読めていない間は、**新着の窓を出さない・丸も出さない**
     ④ クラウドへ送れていなかったぶんは、次に読めた時に**送り直す**（自己修復）
     ⑤ 別の人が同じ端末で入っても混ざらない（控えは uid ごと）

   ◎使い方
     python3 -m http.server 8994      ← 別ウィンドウ
     node test_news_keep.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8994;
const DIR = path.dirname(new URL(import.meta.url).pathname);
const HARNESS = path.join(DIR, '_news_keep_harness.html');
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

fs.writeFileSync(HARNESS, `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="css/news-oplog.css"></head><body>
<div class="si-item" data-view="news">お知らせ</div>
<div id="news-body"></div>
<script>
window.PIT_CLOUD = true;
window.__net = { failGet: false, failSet: false };
function doc(uid) {
  return {
    get: function () {
      if (window.__net.failGet) return Promise.reject(new Error('offline'));
      return window.__cloudGet(uid).then(function (d) {
        return { exists: !!d, data: function () { return d || {}; } };
      });
    },
    set: function (obj, opt) {
      if (window.__net.failSet) return Promise.reject(new Error('offline'));
      return window.__cloudSet(uid, JSON.parse(JSON.stringify(obj)), !!(opt && opt.merge));
    }
  };
}
window.fb = {
  ready: true, currentUser: null,
  company: function () { return { collection: function () { return { doc: doc }; } }; },
  FieldValue: { arrayUnion: function () { return { __op: 'arrayUnion', v: [].slice.call(arguments) }; } }
};
window.__login  = function (uid) { window.fb.currentUser = { uid: uid || 'u1' }; };
window.__logout = function () { window.fb.currentUser = null; if (window.pitNewsForget) window.pitNewsForget(); };
<\/script>
<script src="js/news-pit.js"><\/script>
</body></html>`);

const b = await chromium.launch({ executablePath: cp });
const cloud = {};                 // にせの Firestore（ページを開き直しても残る）
const store = {};                 // にせの localStorage（端末の控え。ページを開き直しても残る）
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
    cloud[uid] = cur; return true;
  });
  /* localStorage を「端末」として持ち越す（本物の端末の控えと同じ役割） */
  await p.addInitScript(s => {
    const mem = JSON.parse(s);
    const ls = {
      getItem: k => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); window.__lsDump && window.__lsDump(JSON.stringify(mem)); },
      removeItem: k => { delete mem[k]; window.__lsDump && window.__lsDump(JSON.stringify(mem)); },
      clear: () => { Object.keys(mem).forEach(k => delete mem[k]); }
    };
    Object.defineProperty(window, 'localStorage', { get: () => ls, configurable: true });
  }, JSON.stringify(store));
  await p.exposeFunction('__lsDump', s => { Object.assign(store, JSON.parse(s)); return true; });
  await p.goto(`http://127.0.0.1:${PORT}/_news_keep_harness.html`);
  await p.waitForFunction('window.PIT_NEWS && window.renderNews', null, { timeout: 25000 });
  return p;
}

/* 本番の起動と同じ順番：①0.4秒後に丸（まだログイン前）→ ②ログイン → ③丸＋ポップアップ */
async function boot(p, uid, net = {}) {
  await p.evaluate(n => Object.assign(window.__net, n), net);
  await p.evaluate(() => window.pitNewsRefreshBadge());
  await p.waitForTimeout(120);
  await p.evaluate(u => window.__login(u), uid);
  await p.evaluate(() => { window.pitNewsRefreshBadge(); window.pitNewsMaybePopup(); });
  await p.waitForTimeout(400);
}
const popTitle = p => p.evaluate(() => {
  const el = document.getElementById('nw-pop');
  return (el && el.classList.contains('open')) ? el.querySelector('.nw-pop-it').textContent : null;
});
async function confirmAll(p) {
  const seen = [];
  for (let i = 0; i < 20; i++) {
    const t = await popTitle(p);
    if (!t) break;
    seen.push(t);
    await p.evaluate(() => window.pitNewsPopOk());
    await p.waitForTimeout(120);
  }
  return seen;
}
const badge = p => p.evaluate(() => (document.querySelector('.si-item[data-view="news"] .si-newsbadge') || {}).textContent || '');
const readOf = u => (cloud[u] && cloud[u].pitNewsRead) || [];

try {
  console.log('\n── ① ふつうに確認する ──');
  let p = await openPage();
  await boot(p, 'u1');
  const first = await confirmAll(p);
  await p.waitForTimeout(200);
  ok('新着の窓が出て 3 件確認できた', first.length === 3, first);
  ok('クラウドに 3 件残った', readOf('u1').length === 3, readOf('u1'));
  ok('🔴 端末の控えにも 3 件残っている（クラウドが落ちても効く）',
     JSON.parse(store['pitflow_news_read_v1:u1'] || '[]').length === 3, store['pitflow_news_read_v1:u1']);
  await p.close();

  console.log('\n── ② クラウドが読めない状態で入り直す（今回の不具合の再現） ──');
  p = await openPage();
  await boot(p, 'u1', { failGet: true });
  await p.waitForTimeout(300);
  const t2 = await popTitle(p);
  ok('🔴 既読が読めない時は、新着の窓を出さない', t2 === null, t2);
  ok('🔴 未読の丸も出さない（27件と出してから減る、が起きない）', (await badge(p)) === '', await badge(p));
  const seen2 = await p.evaluate(() => {
    /* 受信箱を描いてみて、確認済みの3件が「未読」に戻っていないか */
    window.renderNews();
    return [].slice.call(document.querySelectorAll('#news-body .nw-item.is-read')).length;
  });
  await p.waitForTimeout(400);
  const seen2b = await p.evaluate(() => [].slice.call(document.querySelectorAll('#news-body .nw-item.is-read')).length);
  ok('🔴 受信箱でも、前に確認した3件は確認済みのまま（端末の控えで我慢する）', seen2b >= 3, { seen2, seen2b });
  await p.close();

  console.log('\n── ③ 読めるようになったら、続きの3件が出る ──');
  p = await openPage();
  await boot(p, 'u1');
  const second = await confirmAll(p);
  ok('前に確認した3件は出てこない', second.every(t => first.indexOf(t) < 0), { first, second });
  ok('続きの3件が出る', second.length === 3, second);
  ok('クラウドの既読が 6 件に増えた（前の3件を消していない）', readOf('u1').length === 6, readOf('u1'));
  await p.close();

  console.log('\n── ④ クラウドへ書けない時でも、確認したぶんは失われない ──');
  p = await openPage();
  await boot(p, 'u1', { failSet: true });
  const third = await confirmAll(p);
  await p.waitForTimeout(300);
  ok('確認は押せる（3件）', third.length === 3, third);
  ok('クラウドはまだ 6 件のまま（書けていない）', readOf('u1').length === 6, readOf('u1'));
  ok('🔴 端末の控えには 9 件入っている', JSON.parse(store['pitflow_news_read_v1:u1'] || '[]').length === 9,
     store['pitflow_news_read_v1:u1']);
  await p.close();

  console.log('\n── ⑤ 次に入った時、送れていなかったぶんを送り直す（自己修復） ──');
  p = await openPage();
  await boot(p, 'u1');
  await p.waitForTimeout(500);
  ok('🔴 クラウドが 9 件に追いついた', readOf('u1').length === 9, readOf('u1'));
  const fourth = await confirmAll(p);
  ok('🔴 書けなかったぶんの3件は、もう出てこない',
     fourth.every(t => third.indexOf(t) < 0), { third, fourth });
  await p.close();

  console.log('\n── ⑥ 別の人が同じ端末で入っても混ざらない ──');
  p = await openPage();
  await p.evaluate(() => window.__logout());
  await boot(p, 'u2');
  const other = await confirmAll(p);
  ok('別の人には未読として出る', other.length === 3, other);
  ok('別の人の既読は別に残る', readOf('u2').length === 3, readOf('u2'));
  ok('先に入っていた人の既読は減っていない', readOf('u1').length >= 9, readOf('u1'));
  ok('🔴 端末の控えも人ごとに分かれている',
     !!store['pitflow_news_read_v1:u1'] && !!store['pitflow_news_read_v1:u2'] &&
     JSON.parse(store['pitflow_news_read_v1:u2']).length === 3, Object.keys(store));
  await p.close();

  console.log('\n── 画面のエラー ──');
  ok('赤いエラーが出ていない', errs.length === 0, errs.slice(0, 5));
} finally {
  await b.close();
  try { fs.unlinkSync(HARNESS); } catch (e) {}
}
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
