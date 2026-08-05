/* PitFlow v1.45.0 ── ダッシュボードの検索結果がBOXの下に回り込む不具合のテスト
   -------------------------------------------------------------------
   ◎起きていたこと（ゆうた報告・2026-08-04）
     **ダッシュボードで検索すると、結果が各BOXの下に回り込む**（付箋やBOXに隠れて読めない）。
   ◎正体
     結果パネルは `position:absolute` で「浮いている」だけで、**z-index が付いていなかった**。
     ダッシュボードの付箋（`.bn-card`）もBOX（`.md-box`）も `position:relative` なので、
     **重なった時は「HTMLで後ろに書いてある方」が上に乗る**＝検索結果（先に書いてある）が下になる。
     ⚠ 途中に stacking context（z-index や transform を持つ入れ物）は無かったので、
        **検索の入れ物に z-index を1つ付けるだけで直る**。
   ◎直し
     `css/search.css` の `#pit-search-wrap` / `.md-search` に **z-index:50**、
     念のため `.pit-search-results` 自身にも同じ数字。
     （モーダル・トースト＝60以上より下、ふつうの中身＝0 より上）
   ◎見かた
     **絵で見ない＝実際にその点で一番上にある要素を `elementFromPoint` で拾う**。
     「重なっているか」は座標で決まるので、これがいちばん確実。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8957      ← 別ウィンドウ
     node test_search_layer.mjs                                              */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:8957/index.html?demo=1');
await p.waitForFunction('window.state && typeof window.showView === "function"', null, { timeout: 20000 });
await p.waitForTimeout(900);
await p.evaluate(() => showView('dashboard'));
await p.waitForTimeout(800);

console.log('\n── ① まずダッシュボードに検索欄とBOXが両方ある ──');
{
  ok('検索欄がある', (await p.locator('#mydash-search-input').count()) === 1);
  const boxes = await p.evaluate(() => document.querySelectorAll('.md-box').length);
  ok('BOXが並んでいる', boxes >= 3, boxes);
  const notes = await p.evaluate(() => document.querySelectorAll('.bn-card').length);
  ok('付箋も出ている（重なる相手）', notes >= 1, notes);
}

console.log('\n── ② 検索するとパネルが開く ──');
await p.fill('#mydash-search-input', 'ア');
await p.waitForTimeout(700);
{
  ok('結果パネルが開いた', (await p.evaluate(() => document.getElementById('mydash-search-results').classList.contains('open'))));
  const h = await p.evaluate(() => document.getElementById('mydash-search-results').getBoundingClientRect().height);
  ok('中身が入っている（高さがある）', h > 100, Math.round(h));
  const rows = await p.evaluate(() => document.querySelectorAll('#mydash-search-results .psr-row').length);
  ok('ヒットした行が並んでいる', rows > 0, rows);
}

console.log('\n── ③ 🔴 パネルの上には何も乗っていない（回り込んでいない） ──');
{
  /* パネルの中を縦に5か所つついて、**その点で一番上にある要素**がパネルの中身かを見る。
     ⚠ 絵の見た目ではなく座標で判定＝これが「隠れていない」の本当の確かめ方。 */
  const probe = await p.evaluate(() => {
    const r = document.getElementById('mydash-search-results').getBoundingClientRect();
    const x = r.left + r.width * 0.35;                 /* 行の文字がある辺り */
    const ys = [0.1, 0.3, 0.5, 0.7, 0.9].map(f => r.top + r.height * f);
    return ys.map(y => {
      const el = document.elementFromPoint(x, Math.min(y, window.innerHeight - 2));
      return {
        y: Math.round(y),
        inResults: !!(el && el.closest('#mydash-search-results')),
        el: el ? (el.id ? '#' + el.id : '.' + String(el.className).split(' ')[0]) : null
      };
    });
  });
  probe.forEach(function(t, i){
    ok('パネルの中 ' + (i + 1) + '/5（y=' + t.y + '）に他のものが乗っていない', t.inResults, t.el);
  });
  ok('🔴 付箋（.bn-card）が上に乗っていない', probe.every(t => t.el !== '.bn-card'), probe.map(t => t.el));
  ok('🔴 BOX（.md-box）が上に乗っていない', probe.every(t => String(t.el).indexOf('.md-') !== 0), probe.map(t => t.el));
}

console.log('\n── ④ 実際にクリックできる（＝本当に手前にある） ──');
{
  /* 隠れていると「クリックしたつもりが後ろのBOXを押していた」になる。
     Playwright の click は覆われていると失敗するので、ここが通れば手前にいる証拠。 */
  /* ⚠ 行そのものには onclick が無く、右の「予約詳細」ボタンが入口。そこを押す。 */
  const btn = p.locator('#mydash-search-results .psr-act', { hasText: '予約詳細' }).first();
  await btn.click({ timeout: 5000 }).then(
    () => ok('🔴 いちばん上の「予約詳細」を押せた（覆われていない）', true),
    e => ok('🔴 いちばん上の「予約詳細」を押せた（覆われていない）', false, String(e).slice(0, 140))
  );
  await p.waitForTimeout(700);
  ok('押すと予約詳細が開く',
     (await p.evaluate(() => { const m = document.getElementById('modal-detail'); return !!(m && m.classList.contains('show')); })));
  await p.evaluate(() => { if (window.closeDetail) closeDetail(); });
  await p.waitForTimeout(400);
}

console.log('\n── ⑤ 重ね順の数字（ほかの窓とけんかしない） ──');
{
  await p.evaluate(() => showView('dashboard'));
  await p.waitForTimeout(600);
  await p.fill('#mydash-search-input', 'ア');
  await p.waitForTimeout(600);
  const z = await p.evaluate(() => {
    const w = document.getElementById('mydash-search-wrap');
    const r = document.getElementById('mydash-search-results');
    return { wrap: getComputedStyle(w).zIndex, res: getComputedStyle(r).zIndex };
  });
  ok('入れ物に重ね順が付いている', z.wrap !== 'auto' && +z.wrap > 0, z);
  ok('結果パネルにも付いている', z.res !== 'auto' && +z.res > 0, z);
  ok('🔴 モーダル（60以上）より下＝窓を邪魔しない', +z.wrap < 60 && +z.res < 60, z);
}

console.log('\n── ⑥ 二度と落ちないように（配線チェック） ──');
{
  const css = fs.readFileSync('css/search.css', 'utf8');
  ok('.md-search に重ね順が入っている', /\.md-search\s*\{[^}]*z-index:\s*50/.test(css) || /#pit-search-wrap,\s*\n?\.md-search\s*\{[^}]*z-index:\s*50/.test(css));
  ok('.pit-search-results 自身にも入っている', /\.pit-search-results\s*\{[^}]*z-index:\s*50/.test(css));
  const idx = fs.readFileSync('index.html', 'utf8');
  ok('search.css の ?v= が上がっている', /css\/search\.css\?v=[6-9]|css\/search\.css\?v=\d\d/.test(idx));
  /* ⚠ 版は上がっていくので数字は固定しない。3か所がそろっているかだけ見る。 */
  const _mVer = (idx.match(/<div class="login-ver">v([\d.]+)<\/div>/) || [])[1] || '';
  const _tVer = (idx.match(/<span class="ver">v([\d.]+)<\/span>/) || [])[1] || '';
  const _aVer = (idx.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('画面の版2か所と app-version がそろっている', !!_mVer && _mVer === _tVer && _mVer === _aVer, [_mVer, _tVer, _aVer]);
  ok('JSエラー0', errs.length === 0, errs.slice(0, 5));
}

await p.locator('#main').screenshot({ path: 'shot_search_layer.png' });
console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
