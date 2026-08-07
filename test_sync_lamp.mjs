/* PitFlow ── 同期ランプ（リアルタイム同期のカプセル）の大きさが変わらない テスト
   -------------------------------------------------------------------
   ◎ゆうた指定
     「**リアルタイム同期のバッチ、受信中で文字数により幅が変わる。都度アバターの位置も
       微妙に変わって気持ち悪い。カプセルの大きさを一定にして各々の位置がぶれないようにしてほしい。
       これは同様のリアルタイム同期の表示があるものすべてに実装してほしい**」
   ◎直したところ
     🔴 **本体は `_shared\\coreflow-sync.js`**（全アプリ共通部品）。そこに
        「文字の入れ物（.sync-text）に min-width を持たせて中央寄せ」というCSSを足した。
     ⚠ ランプを**自前で描くアプリ（PitFlow＝PitSync）でも効くように**、
        このCSSだけは `boot()` の中で **BUBBLE_ONLY の判定より前**に流し込む。
     ⚠ 直したら `sync-shared.ps1` → 各アプリへ配布（?v= も自動で上がる）。
   ◎見かた
     **実際に描かれた幅と、隣にあるものの座標**で見る。
     「幅の種類が1つだけ」「隣が1pxも動かない」＝ぶれていない、の確かめ方。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8961      ← 別ウィンドウ
     node test_sync_lamp.mjs                                                 */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:8961/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.PitSync', null, { timeout: 20000 });
await p.waitForTimeout(800);

/* 6つの状態を順に出して、そのたびに「ランプの幅」と「隣にあるもの」を測る */
const STATES = ['idle', 'saving', 'recv', 'offline', 'error', 'local'];
const shots = [];
for (const s of STATES) {
  await p.evaluate(x => { window.PIT_CLOUD = (x !== 'local'); PitSync.set(x); }, s);
  await p.waitForTimeout(220);
  shots.push(await p.evaluate(() => {
    const e = document.querySelector('.sync-indicator');
    const t = e.querySelector('.sync-text');
    const dot = e.querySelector('.sync-dot');
    const box = x => { if (!x) return null; const r = x.getBoundingClientRect(); return { l: Math.round(r.left), w: Math.round(r.width) }; };
    const nb = {};
    ['.tb-avatar', '.tb-username', '.tb-newres'].forEach(function (sel) {
      const el = document.querySelector(sel); if (el) nb[sel] = Math.round(el.getBoundingClientRect().left);
    });
    return {
      txt: t ? t.textContent.trim() : '', lamp: box(e), text: box(t), dot: box(dot),
      cut: t ? (t.scrollWidth > t.clientWidth + 1) : false, neighbours: nb
    };
  }));
}

console.log('\n── ① 6つの状態がちゃんと出ている ──');
{
  ok('文字が状態ごとに変わっている', new Set(shots.map(s => s.txt)).size === STATES.length, shots.map(s => s.txt));
  ok('いちばん長いのは5文字（オフライン／保存エラー）', shots.some(s => s.txt.length === 5), shots.map(s => s.txt));
}

console.log('\n── ② 🔴 カプセルの幅がどの状態でも同じ ──');
{
  const ws = [...new Set(shots.map(s => s.lamp.w))];
  ok('🔴 幅の種類が1つだけ', ws.length === 1, shots.map(s => s.txt + ':' + s.lamp.w));
  const ls = [...new Set(shots.map(s => s.lamp.l))];
  ok('🔴 ランプの左端も動かない', ls.length === 1, ls);
}

console.log('\n── ③ 🔴 隣のもの（アバター・名前）が1pxも動かない ──');
{
  const keys = Object.keys(shots[0].neighbours);
  ok('比べる相手が見つかっている', keys.length >= 1, keys);
  keys.forEach(function (k) {
    const vals = [...new Set(shots.map(s => s.neighbours[k]))];
    ok('🔴 ' + k + ' の位置が変わらない', vals.length === 1, { key: k, vals: vals });
  });
}

console.log('\n── ④ 中身も動かない（点は左・文字は中央） ──');
{
  const dl = [...new Set(shots.map(s => s.dot.l))];
  ok('🔴 点（ランプ）の位置が変わらない', dl.length === 1, dl);
  const tw = [...new Set(shots.map(s => s.text.w))];
  ok('🔴 文字の入れ物の幅も一定', tw.length === 1, shots.map(s => s.txt + ':' + s.text.w));
  ok('文字は中央に置いている',
     (await p.evaluate(() => getComputedStyle(document.querySelector('.sync-indicator .sync-text')).textAlign)) === 'center');
}

console.log('\n── ⑤ 文字が切れていない（読めなくなっていない） ──');
{
  ok('🔴 どの状態でも文字が切れていない', shots.every(s => !s.cut), shots.filter(s => s.cut).map(s => s.txt));
  ok('文字の入れ物は言葉より広い', shots.every(s => s.text.w >= 40), shots.map(s => s.text.w));
}

console.log('\n── ⑥ 全アプリに効く形になっているか（配線チェック） ──');
{
  const src = fs.readFileSync('js/coreflow-sync.js', 'utf8');
  ok('🔴 共通部品に大きさのCSSが入っている', /function injectSizeCSS\(\)/.test(src));
  ok('min-width で幅を決めている（切らずに揃える）', /min-width:5\.6em;text-align:center/.test(src));
  ok('id・class のどの書き方のランプにも当たる',
     /#sync-indicator \.sync-text,#sync-ind \.sync-text/.test(src));
  /* 🔴 いちばん大事：ランプを自前で描くアプリ（PitFlow）でも流し込むこと。
     boot() の中で「BUBBLE_ONLY なら return」より**前**に呼んでいるかを見る。 */
  const boot = src.slice(src.indexOf('function boot()'), src.indexOf('function boot()') + 260);
  ok('🔴 boot() の中で、BUBBLE_ONLY の return より前に呼んでいる',
     boot.indexOf('injectSizeCSS()') >= 0 &&
     boot.indexOf('injectSizeCSS()') < boot.indexOf('if (BUBBLE_ONLY) return;'), boot.replace(/\s+/g, ' ').slice(0, 160));
  ok('本体の置き場所が書いてある（_shared）', /_shared.\\?coreflow-sync\.js/.test(src) || /_shared\\\\coreflow-sync\.js/.test(src) || /_shared.coreflow-sync\.js/.test(src));
  ok('版が上がっている（v1.3）', /v1\.3（2026-08-04）/.test(src));
  ok('JSエラー0', errs.length === 0, errs.slice(0, 5));
}

await p.evaluate(() => { window.PIT_CLOUD = false; PitSync.set('local'); });
await p.waitForTimeout(200);
console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
