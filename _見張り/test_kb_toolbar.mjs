/* PitFlow v1.47.0 ── タスクボード右上のボタン列の「大きさの調和」テスト
   -------------------------------------------------------------------
   ◎ゆうた指定
     「**タスクボードの自分担当とラインのボタン、もうちょい小さく全体としての調和よくできないかな？
       今やぼったいというか**」
   ◎直したこと
     ① 「担当車両」「区切りライン」を**ふつうのボタン（.vh-btn）と同じ物差し**に
        （枠 2px→1px・角 10px→8px・padding 9/16→5/11・太さ 800→700・min-width 撤去）。
     ② 並びを `align-items:center` に。
        ⚠ 既定の stretch のせいで、**背の高い「完TEL済」に引っぱられて全部 44px** になっていた
          ＝これが「やぼったさ」の主犯。
     ③ 「完TEL済／完TEL依頼」も枠 2px→1.5px・少し詰めて、列全体の背を下げた（破線＝投げ込む場所、は維持）。
   ◎見かた
     **実際に描かれた寸法（getBoundingClientRect / computed style）で比べる**。
     「.vh-btn と同じくらいか、それより小さい」＝調和している、という言い方にしてある。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8959      ← 別ウィンドウ
     node test_kb_toolbar.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:8959/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.PitMyOnly && typeof window.showView === "function"', null, { timeout: 20000 });
await p.waitForTimeout(800);
/* 「担当車両」はフロントの人にだけ出るので、自分をフロントの人にしておく */
await p.evaluate(() => { const f = (state.staff || []).find(s => s.front); if (f) { try { localStorage.setItem('pitflow_bn_me', f.id); } catch (e) {} } });
await p.evaluate(() => showView('course1'));
await p.waitForTimeout(900);
await p.evaluate(() => { if (window.PitMyOnly) PitMyOnly.refresh(); });
await p.waitForTimeout(400);

const M = await p.evaluate(() => {
  const g = sel => {
    const e = document.querySelector('#view-course1 ' + sel); if (!e) return null;
    const r = e.getBoundingClientRect(), c = getComputedStyle(e);
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), right: Math.round(r.right),
             fs: parseFloat(c.fontSize), fw: +c.fontWeight, bw: parseFloat(c.borderTopWidth),
             r: parseFloat(c.borderTopLeftRadius), disp: c.display };
  };
  const drops = Array.from(document.querySelectorAll('#view-course1 .kb-droparea')).map(e => {
    const r = e.getBoundingClientRect(); return { h: Math.round(r.height), x: Math.round(r.left), right: Math.round(r.right) };
  });
  const wrap = getComputedStyle(document.querySelector('#view-course1 > .view-header > .view-actions'));
  /* 🔴 2026-08-21 「担当車両のすぐ右」との間隔を見る。
     ＝ v1.140.0 で **絞り込み・並び替えのボタンが2つ増えて**、担当車両と区切りラインは
        もう隣どうしではない。**特定の2つの距離で見張ると、ボタンが増えるたびに落ちる。** */
  const _my = document.querySelector('#view-course1 .kb-myonly');
  const _nx = _my && _my.nextElementSibling;
  const myNextGap = (_my && _nx) ? Math.round(_nx.getBoundingClientRect().left - _my.getBoundingClientRect().right) : null;
  return { my: g('.kb-myonly'), line: g('.kb-lineadd'), vh: g('.vh-btn'), drops, align: wrap.alignItems, myNextGap };
});

console.log('\n── ① ボタンが出ている ──');
{
  ok('「担当車両」が出ている', !!M.my && M.my.disp !== 'none', M.my && M.my.disp);
  ok('「区切りライン」が出ている', !!M.line);
  ok('比べる相手（PITボード＝ふつうのボタン）がある', !!M.vh);
  ok('完TEL済／依頼の2つがある', M.drops.length === 2, M.drops.length);
}

console.log('\n── ② 🔴 もう「やぼったく」ない（ふつうのボタンと同じ物差し） ──');
{
  ok('🔴 枠は1px（前は2px）', M.my.bw === 1 && M.line.bw === 1, { my: M.my.bw, line: M.line.bw });
  ok('🔴 角は8px（前は10px）＝ふつうのボタンと同じ', M.my.r === M.vh.r && M.line.r === M.vh.r, { my: M.my.r, line: M.line.r, vh: M.vh.r });
  ok('🔴 高さがふつうのボタン以下', M.my.h <= M.vh.h && M.line.h <= M.vh.h, { my: M.my.h, line: M.line.h, vh: M.vh.h });
  ok('🔴 高さは 34px 以下（前は44px）', M.my.h <= 34 && M.line.h <= 34, { my: M.my.h, line: M.line.h });
  ok('文字の太さは 700 以下（前は800）', M.my.fw <= 700 && M.line.fw <= 700, { my: M.my.fw, line: M.line.fw });
  ok('文字はふつうのボタンより大きくない', M.my.fs <= M.vh.fs && M.line.fs <= M.vh.fs, { my: M.my.fs, line: M.line.fs, vh: M.vh.fs });
  ok('🔴 余白で横に広がっていない（min-width を外した）', M.my.w <= 90, M.my.w);
}

console.log('\n── ③ 🔴 縦に引き伸ばされていない（やぼったさの主犯） ──');
{
  ok('🔴 並びが center（stretch ではない）', M.align === 'center', M.align);
  ok('🔴 いちばん背の高いもの（完TEL済）に引っぱられていない',
     M.my.h < M.drops[0].h && M.line.h < M.drops[0].h, { my: M.my.h, line: M.line.h, drop: M.drops[0].h });
  ok('列全体の背も下がった（完TEL済が 40px 以下）', M.drops[0].h <= 40, M.drops[0].h);
}

console.log('\n── ④ 並び順と間隔は今までどおり ──');
{
  ok('🔴 担当車両 → 区切りライン → 完TEL済 の順', M.my.x < M.line.x && M.line.x < M.drops[0].x,
     { my: M.my.x, line: M.line.x, drop: M.drops[0].x });
  const toDrop = M.drops[0].x - M.line.right;
  const normal = M.drops[1].x - M.drops[0].right;
  ok('🔴 完TEL済とのあいだは、ふつうの間隔の2倍以上あける（ゆうた指定）', toDrop >= normal * 2, { toDrop, normal });
  ok('担当車両とそのすぐ右のボタンは、ふつうの間隔（くっつきすぎず、空きすぎず）',
     M.myNextGap !== null && M.myNextGap >= 4 && M.myNextGap <= 14, M.myNextGap);
}

console.log('\n── ⑤ 押した時の見え方は今までどおり（機能は壊していない） ──');
{
  await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').click());
  await p.waitForTimeout(500);
  ok('押すと「担当車両」が点く', await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').classList.contains('on')));
  const on = await p.evaluate(() => {
    const c = getComputedStyle(document.querySelector('#view-course1 .kb-myonly'));
    return { bg: c.backgroundColor, color: c.color };
  });
  ok('点いている時は塗りつぶし（背景が透明でない）', on.bg !== 'rgba(0, 0, 0, 0)' && on.bg !== 'transparent', on);
  ok('絞り込みも効いている', await p.evaluate(() => window.PitMyOnly.isOn() === true));
  await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').click());
  await p.waitForTimeout(400);
  ok('もう一度押すと戻る', !(await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').classList.contains('on'))));
  ok('区切りラインはドラッグできるまま（draggable）',
     await p.evaluate(() => document.querySelector('#view-course1 .kb-lineadd').getAttribute('draggable') === 'true'));
}

console.log('\n── ⑥ 明るいテーマでも読める（区切りラインの橙） ──');
{
  await p.evaluate(() => { if (window.setTheme) setTheme('light'); });
  await p.waitForTimeout(400);
  const lt = await p.evaluate(() => {
    const c = getComputedStyle(document.querySelector('#view-course1 .kb-lineadd'));
    const m = c.color.match(/\d+/g).map(Number);
    /* ざっくり明るさ（0〜255）。明るい下地に薄い橙だと溶けるので、文字は暗めであること。 */
    return { color: c.color, lum: Math.round(0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) };
  });
  ok('🔴 明るいテーマでは文字を濃くしている（下地に溶けない）', lt.lum < 150, lt);
  await p.evaluate(() => { if (window.setTheme) setTheme('dark'); });
  await p.waitForTimeout(300);
}

console.log('\n── ⑦ 二度と崩れないように（配線チェック） ──');
{
  const css = fs.readFileSync('css/polish.css', 'utf8');
  ok('2つのボタンを1か所でまとめて指定している', /\.kb-myonly, \.kb-lineadd\{/.test(css));
  ok('並びを center にしている', /view-actions\{ align-items:center/.test(css));
  ok('明るいテーマの橙の上書きがある', /\[data-theme\^="light"\] \.kb-lineadd\{/.test(css));
  const idx = fs.readFileSync('index.html', 'utf8');
  /* ⚠ ?v= は版を重ねるたびに増えるので、上限を作らない（v1.79.0 の 189 以降なら合格） */
  ok('polish.css の ?v= が上がっている（189 以降）',
     (((idx.match(/css\/polish\.css\?v=(\d+)/) || [])[1] | 0) >= 189));
  /* ⚠ 版は上がっていくので数字は固定しない。3か所がそろっているかだけ見る。 */
  const _mVer = (idx.match(/<div class="login-ver">v([\d.]+)<\/div>/) || [])[1] || '';
  const _tVer = (idx.match(/<span class="ver">v([\d.]+)<\/span>/) || [])[1] || '';
  const _aVer = (idx.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('画面の版2か所と app-version がそろっている', !!_mVer && _mVer === _tVer && _mVer === _aVer, [_mVer, _tVer, _aVer]);
  ok('JSエラー0', errs.length === 0, errs.slice(0, 5));
}

await p.locator('#view-course1 .view-header').screenshot({ path: 'shot_kb_toolbar.png' });
console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
