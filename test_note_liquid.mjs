/* ============================================================
   test_note_liquid.mjs
   リキッド（ダーク／ライト）で **付箋の色が消えていないか** を見張る。

   きっかけ：ゆうた 2026-08-27
     「リキッドダークの付箋が**色が完全になくなってる**。CarFlow見て。
       リキッドだけ特殊な付箋表示を使ってる。それを参考にして**完全に同じ**にして」

   何が起きていたか（v2.15.1 まで）：
     リキッドのガラス（`.bn-card` を `--panel-bg-overlay` で塗る）が、付箋の5色を丸ごと消していた。
     CarFlow は同じ所で色を消したうえで **同色のネオン枠＋左上の色タブ** で色を戻している。
     PitFlow にはその戻しが無かった。

   いまの決めごと（v2.16.0）：
     `css/topbar.css` に CarFlow `css/base.css` の「v2.18.20 付箋リキッド確定版」を**丸写し**。
     🔴 直す時は **CarFlow 側を直して、こちらへ写し直す**（片方だけ直さない）。

   使い方：
     node /tmp/srv.js &            ← 8995
     NODE_PATH=... node test_note_liquid.mjs
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const cp   = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = process.env.PORT || 8995;
let OK = 0, NG = 0;
function ok(name, cond, extra){
  if (cond) { OK++; console.log('  ✅ ' + name); }
  else { NG++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
/* 空白のちがいだけで赤くしない */
const norm = s => String(s).replace(/\s+/g, ' ').trim();
/* コメントを外してから、**付箋だけの**リキッド規則を抜き出す。
   ⚠ ガラス板の共通規則（`#topbar, .md-box, … , .bn-card { … }`）は**数に入れない**。
      あれは付箋以外も並んでいて、アプリごとに中身がちがって当たり前だから
      （ここを入れると「CarFlow と1文字ちがう」が毎回赤くなる）。
   ＝ **カンマで区切った行が全部 `.bn-card` を含む規則だけ**を見る。 */
function liquidNoteRules(css){
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /([^{}]*\.bn-card[^{}]*)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(body))){
    if (!/-liquid/.test(m[1])) continue;
    const sels = m[1].split(',').map(norm).filter(Boolean);
    if (!sels.length || !sels.every(x => x.indexOf('.bn-card') >= 0)) continue;
    out.push(sels.join(', ') + '{' + norm(m[2]) + '}');
  }
  return out;
}

console.log('\n── 📜 CarFlow と同じものが入っているか ──');
{
  const pit = fs.readFileSync(path.join(process.cwd(), 'css', 'topbar.css'), 'utf8');
  const mine = liquidNoteRules(pit);
  ok('リキッドの付箋規則が入っている（30本以上）', mine.length >= 30, mine.length);
  ok('🔴 5色ぶんのネオン枠がある（dark-liquid）',
     ['red','orange','yellow','green','blue'].every(c =>
       mine.some(r => r.indexOf('[data-theme="dark-liquid"]') >= 0 && r.indexOf('.bn-color-' + c + '{') >= 0 && /border:/.test(r))));
  ok('🔴 5色ぶんの色タブ（::before）がある（dark-liquid）',
     ['red','orange','yellow','green','blue'].every(c =>
       mine.some(r => r.indexOf('[data-theme="dark-liquid"]') >= 0 && r.indexOf('.bn-color-' + c + '::before{') >= 0)));
  ok('ライト・リキッドぶんもある',
     ['red','orange','yellow','green','blue'].every(c =>
       mine.some(r => r.indexOf('[data-theme="light-liquid"]') >= 0 && r.indexOf('.bn-color-' + c + '{') >= 0)));
  ok('ダーク・リキッドの文字を明るくする行がある', mine.some(r => /\.bn-card\{/.test(r) && /color: ?#eef2f7/i.test(r)), mine.filter(r=>/\.bn-card\{/.test(r)));

  /* 🔴 CarFlow と1文字ちがわないか。CarFlow が読めない時は**赤くせずに飛ばす**
     （作業箱に隣のフォルダを持ってきていないだけ、で赤くしない＝2026-08-25 の反省） */
  const cf = path.resolve(process.cwd(), '..', '..', 'CarFlow', 'carflow', 'css', 'base.css');
  if (!fs.existsSync(cf)){
    console.log('  ⏭ CarFlow の base.css が見つからないので、突き合わせは飛ばす（' + cf + '）');
  } else {
    const theirs = liquidNoteRules(fs.readFileSync(cf, 'utf8'));
    const only = a => a.filter(x => !theirs.includes(x));
    const lack = theirs.filter(x => !mine.includes(x));
    ok('🔴 CarFlow に在って PitFlow に無い規則が無い', lack.length === 0, lack.slice(0, 3));
    ok('🔴 PitFlow が勝手に足した規則が無い', only(mine).length === 0, only(mine).slice(0, 3));
  }
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.renderBoardNotes', null, { timeout: 25000 });
await p.waitForTimeout(700);
await p.evaluate(() => { if (window.showView) showView('dashboard'); });
await p.waitForTimeout(500);
await p.evaluate(() => {
  state.boardNotes = ['red','orange','yellow','green','blue'].map(function(c, i){
    return { id:'bnZ' + i, color:c, order:i, title:c + ' の付箋',
      body:'本文がここに入ります。', deadline:'2026-08-30', authorName:'こばやし', authorUid:'x', members:[] };
  });
  renderBoardNotes();
});
await p.waitForTimeout(400);

async function look(theme){
  await p.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
  await p.waitForTimeout(300);
  return await p.evaluate(() => {
    var r = {};
    ['red','orange','yellow','green','blue'].forEach(function(c){
      var el = document.querySelector('.bn-card.bn-color-' + c);
      if (!el) return;
      var cs = getComputedStyle(el), bf = getComputedStyle(el, '::before');
      /* 🔴 タブが「カードの中へ入り込んでいないか」。
         top / height は **padding box（枠の内側）** が基準なので、
         `top + height` が 0 より大きい＝**枠を越えて中に入っている**（2026-08-27 ゆうた指摘）。 */
      var into = parseFloat(bf.top) + parseFloat(bf.height);
      r[c] = { bg: cs.backgroundColor, bgImg: cs.backgroundImage, border: cs.borderTopColor,
               shadow: cs.boxShadow, tabBg: bf.backgroundColor, tabW: bf.width, tabH: bf.height,
               中へ: isFinite(into) ? Math.round(into * 100) / 100 : null,
               左: parseFloat(bf.left) + parseFloat(cs.borderLeftWidth),
               text: getComputedStyle(el).color };
    });
    return r;
  });
}
const NEON = { red:'rgb(255, 122, 122)', orange:'rgb(255, 176, 86)', yellow:'rgb(255, 229, 102)',
               green:'rgb(138, 212, 134)', blue:'rgb(147, 194, 250)' };

console.log('\n── 🌙 ダーク・リキッド ──');
{
  const m = await look('dark-liquid');
  ['red','orange','yellow','green','blue'].forEach(function(c){
    ok('「' + c + '」に色タブが出ている（' + NEON[c] + '）', m[c] && m[c].tabBg === NEON[c], m[c]);
    ok('「' + c + '」の枠が灰色（ガラスの枠）のままでない', m[c] && m[c].border !== 'rgba(255, 255, 255, 0.22)', m[c] && m[c].border);
    ok('「' + c + '」に発光（box-shadow）が乗っている', m[c] && /rgba?\(/.test(m[c].shadow) && m[c].shadow !== 'none', m[c] && m[c].shadow);
  });
  ok('🔴 カードの文字が明るい（ガラスに黒文字が沈まない）', m.red && m.red.text === 'rgb(238, 242, 247)', m.red && m.red.text);
  /* 🔴 2026-08-27 ゆうた「タブがちょっとだけ中にはみ出てる」
     枠 1.5px を前提に `top:-12.5px` で置いていたが、枠は端末によって 1px に丸められるので
     そのぶんタブが中へ入り込んでいた。`bottom:100%` で枠の内側にピタッと止める。 */
  ['red','orange','yellow','green','blue'].forEach(function(c){
    ok('🔴 「' + c + '」のタブがカードの中へ入り込んでいない', m[c] && m[c].中へ <= 0.5, m[c] && m[c].中へ);
    ok('「' + c + '」のタブが左へはみ出していない', m[c] && m[c].左 >= -0.01, m[c] && m[c].左);
  });
}

console.log('\n── 💎 ライト・リキッド ──');
{
  const m = await look('light-liquid');
  ok('5色とも色タブが出ている',
     ['red','orange','yellow','green','blue'].every(c => m[c] && m[c].tabBg !== 'rgba(0, 0, 0, 0)'), m);
}

console.log('\n── 🖤 リキッドでない時（今までどおり） ──');
{
  const m = await look('dark');
  ok('🔴 ふつうのダークは5色のベタ塗りのまま（グラデーションが生きている）',
     ['red','orange','yellow','green','blue'].every(c => m[c] && /gradient/.test(m[c].bgImg)), m.red);
  ok('🔴 ふつうのダークには色タブを出さない',
     ['red','orange','yellow','green','blue'].every(c => m[c] && m[c].tabBg === 'rgba(0, 0, 0, 0)'), m.red);
}

console.log('\n── 🧭 まわり ──');
{
  ok('エラーなし', errs.length === 0, errs.slice(0, 3));
  const ver = await p.evaluate(() => (document.querySelector('meta[name=app-version]') || {}).content || '');
  const vn = (String(ver).match(/\d+/g) || []).map(Number);
  const need = '2.16.1'.split('.').map(Number);
  const ge = (a, b2) => (a[0]||0) !== (b2[0]||0) ? (a[0]||0) > (b2[0]||0)
                      : (a[1]||0) !== (b2[1]||0) ? (a[1]||0) > (b2[1]||0)
                      : (a[2]||0) >= (b2[2]||0);
  ok('版が v2.16.1 以降', ge(vn, need), ver);
}

await b.close();
console.log('\n' + (NG ? '⚠ ' : '🎉 ') + OK + ' OK / ' + NG + ' NG');
process.exit(NG ? 1 : 0);
