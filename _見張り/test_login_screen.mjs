/* PitFlow ── ログイン画面とページタイトルのテスト
   -------------------------------------------------------------------
   ◎決めごと（2026-08-01 に全アプリで統一した形／開発全体メモ「② PitFlow v1.1.0」）
     ログイン画面に出すのは **アイコン／タイトル／リード／Googleログイン／版** だけ。
     ⚠ **サンプルの注意書きは練習用サイトの時だけ。**
   ◎起きていたこと（ゆうた報告・2026-08-04）
     本番のログイン画面に「※ この端末だけで動くサンプルです」が**出る事がある**。
   ◎正体
     注意書きが **既定で「出る」** 作りで、本番と分かったら消していた。
     Firebase の準備が終わるまでの一瞬（通信が遅い時はもっと長く）**本番でも出てしまう**。
   ◎直し
     🔴 **既定を「出さない」に反転**。練習用サイトだと分かった時にだけ `pl-sample` を付けて出す。
   ◎タブのタイトル（ゆうた指定）
     **「アプリ名 - ログイン画面のリード文」**。会社名や「開発中サンプル」は入れない。
     （CoreFlow＝ポータルだけは「CoreFlow」のみ）
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8963      ← 別ウィンドウ
     node test_login_screen.mjs                                              */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1100, height: 820 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto('http://127.0.0.1:8963/index.html?demo=1&nonews=1');
await p.waitForTimeout(1400);

console.log('\n── ① タブのタイトル ──');
{
  const t = await p.evaluate(() => document.title);
  ok('🔴 「アプリ名 - リード文」の形', t === 'PitFlow - 整備入庫管理システム', t);
  const lead = await p.evaluate(() => { const e = document.querySelector('#pit-login .login-logo p'); return e ? e.textContent.trim() : ''; });
  ok('🔴 リード文がログイン画面と同じ言葉', t === 'PitFlow - ' + lead, { t, lead });
  ok('会社名が入っていない', t.indexOf('小林モータース') < 0, t);
  ok('「開発中」「サンプル」が入っていない', !/開発中|サンプル/.test(t), t);
}

console.log('\n── ② ログイン画面に出すものは決めた5つだけ ──');
{
  const items = await p.evaluate(() => {
    const box = document.querySelector('#pit-login .login-box');
    return {
      icon: !!box.querySelector('.login-appicon'),
      title: (box.querySelector('h1') || {}).textContent,
      lead: (box.querySelector('.login-logo p') || {}).textContent,
      btn: !!box.querySelector('.btn-login'),
      ver: (box.querySelector('.login-ver') || {}).textContent,
      /* いま実際に画面に出ている文字（display:none のものは数えない） */
      shown: Array.from(box.querySelectorAll('*')).filter(function (e) {
        return e.children.length === 0 && e.textContent.trim() && getComputedStyle(e).display !== 'none'
          && !e.closest('[style*="display: none"]') && !e.closest('[style*="display:none"]');
      }).map(function (e) { return e.textContent.trim(); })
    };
  });
  ok('アイコンがある', items.icon);
  ok('タイトルは PitFlow', items.title === 'PitFlow', items.title);
  ok('リードは 整備入庫管理システム', items.lead === '整備入庫管理システム', items.lead);
  ok('Googleログインのボタンがある', items.btn);
  ok('版が出ている', /^v\d+\.\d+\.\d+$/.test((items.ver || '').trim()), items.ver);
}

console.log('\n── ③ 🔴 サンプルの注意書きは「練習用サイトの時だけ」 ──');
{
  ok('練習用サイト（?demo=1）では出る',
     await p.evaluate(() => {
       const n = document.querySelector('#pit-login .pl-note');
       return !!n && getComputedStyle(n).display !== 'none';
     }));
  ok('その時だけ pl-sample の印が付く',
     await p.evaluate(() => document.getElementById('pit-login').classList.contains('pl-sample')));

  /* 🔴 いちばん大事：**印が無い時（＝本番／まだ判定が終わっていない時）は出ない** */
  const hidden = await p.evaluate(() => {
    const box = document.getElementById('pit-login');
    box.classList.remove('pl-sample');
    const n = document.querySelector('#pit-login .pl-note');
    const d = getComputedStyle(n).display;
    box.classList.add('pl-sample');
    return d;
  });
  ok('🔴 印が無ければ出ない（＝本番では絶対に出ない）', hidden === 'none', hidden);
}

console.log('\n── ④ 読み込みの途中でも出ない（今回の不具合そのもの） ──');
{
  /* auth-pit.js を読ませずに開く＝「まだ判定が終わっていない状態」を作る。
     ⚠ 前の作りだと、この状態で注意書きが**出てしまっていた**。 */
  const p2 = await b.newPage({ viewport: { width: 1100, height: 820 } });
  await p2.route('**/js/auth-pit.js*', r => r.abort());
  await p2.goto('http://127.0.0.1:8963/index.html?demo=1&nonews=1');
  await p2.waitForTimeout(900);
  const d = await p2.evaluate(() => {
    const n = document.querySelector('#pit-login .pl-note');
    return n ? getComputedStyle(n).display : 'なし';
  });
  ok('🔴 判定が終わる前は出ない', d === 'none', d);
  await p2.close();
}

console.log('\n── ⑤ 配線チェック ──');
{
  const idx = fs.readFileSync('index.html', 'utf8');
  ok('🔴 注意書きは既定で display:none', /#pit-login \.pl-note\{display:none;/.test(idx));
  ok('練習用の時だけ出す指定がある', /#pit-login\.pl-sample \.pl-note\{display:block\}/.test(idx));
  ok('「本番なら消す」という古い作りが残っていない', !/pl-cloud \.pl-note/.test(idx));
  const a = fs.readFileSync('js/auth-pit.js', 'utf8');
  ok('印を付けるのはサンプルモードの入口だけ',
     /function initSampleMode\(\)[\s\S]{0,300}classList\.add\('pl-sample'\)/.test(a));
  const _mVer = (idx.match(/<div class="login-ver">v([\d.]+)<\/div>/) || [])[1] || '';
  const _tVer = (idx.match(/<span class="ver">v([\d.]+)<\/span>/) || [])[1] || '';
  const _aVer = (idx.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('画面の版2か所と app-version がそろっている', !!_mVer && _mVer === _tVer && _mVer === _aVer, [_mVer, _tVer, _aVer]);
  ok('JSエラー0', errs.length === 0, errs.slice(0, 5));
}

await p.locator('#pit-login .login-box').screenshot({ path: 'shot_login.png' });
console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
