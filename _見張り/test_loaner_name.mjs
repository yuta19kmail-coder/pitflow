/* PitFlow v1.46.0 ── 代車カレンダーの列見出しを「車種名メイン」にした のテスト
   -------------------------------------------------------------------
   ◎ゆうた指定
     「**メインの代車カレンダー、数字より車種名をメインに表記してほしい**」
     ＝現場は「代車5」ではなく「タント」で呼ぶので、**車種名を大きく・番号は小さく**。
   ◎決めごと
     ⚠ **番号は消さない**（鍵タグ・車両管理と突き合わせるのに要る）＝小さく下に残す。
     ⚠ **車種が未登録の代車**は車種欄が空なので、その時だけ**番号を主役に戻す**（列が真っ白にならないように）。
   ◎見かた
     文字の大きさは**実際に描かれた computed style** で見る（CSSの書き方が変わっても効く）。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8958      ← 別ウィンドウ
     node test_loaner_name.mjs                                               */
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
await p.goto('http://127.0.0.1:8958/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && typeof window.showView === "function"', null, { timeout: 20000 });
await p.waitForTimeout(900);

/* 1台だけ「車種が未登録」の代車を作っておく＝そこだけ番号が主役に戻るのを見る */
await p.evaluate(() => {
  const ls = (state.loaners || []).filter(l => !l.retired);
  if (ls.length) { ls[ls.length - 1].model = ''; ls[ls.length - 1]._noModelMark = true; }
});
await p.evaluate(() => showView('loaner'));
await p.waitForTimeout(1300);

const heads = () => p.evaluate(() => Array.from(document.querySelectorAll('.lo-head:not(.lo-corner)')).map(e => {
  const m = e.querySelector('.lo-model'), n = e.querySelector('.lo-no');
  const cs = x => x ? getComputedStyle(x) : null;
  const cm = cs(m), cn = cs(n);
  return {
    loid: e.getAttribute('data-loid'),
    model: m ? m.textContent.trim() : null,
    no: n ? n.textContent.trim() : null,
    modelPx: cm ? parseFloat(cm.fontSize) : 0,
    noPx: cn ? parseFloat(cn.fontSize) : 0,
    modelW: cm ? String(cm.fontWeight) : '',
    noneMark: !!(m && m.classList.contains('lo-model-none')),
    title: e.getAttribute('title') || ''
  };
}));

console.log('\n── ① 列見出しの並び ──');
const H = await heads();
{
  ok('代車の列が並んでいる', H.length >= 5, H.length);
  const withModel = H.filter(h => !h.noneMark);
  ok('車種が入っている列がある', withModel.length >= 4, withModel.length);
  ok('🔴 上の行が車種名（例：タント）', /^[^\d]/.test(withModel[0].model || ''), withModel.slice(0, 3).map(h => h.model));
  ok('🔴 下の行が番号（数字だけ）', withModel.every(h => /^\d+$/.test(h.no || '')), withModel.slice(0, 3).map(h => h.no));
}

console.log('\n── ② 🔴 車種名の方が大きい（数字より主役） ──');
{
  const withModel = H.filter(h => !h.noneMark);
  ok('車種名の文字が番号より大きい', withModel.every(h => h.modelPx > h.noPx),
     withModel.slice(0, 3).map(h => ({ m: h.modelPx, n: h.noPx })));
  ok('車種名が太字', withModel.every(h => +h.modelW >= 700), withModel[0].modelW);
  ok('車種名は 12px 以上', withModel.every(h => h.modelPx >= 12), withModel[0].modelPx);
  ok('番号は 11px 以下（控えめ）', withModel.every(h => h.noPx <= 11), withModel[0].noPx);
}

console.log('\n── ③ 番号は消していない（鍵タグと突き合わせるのに要る） ──');
{
  const withModel = H.filter(h => !h.noneMark);
  ok('🔴 どの列にも番号が出ている', withModel.every(h => (h.no || '') !== ''), withModel.map(h => h.no).slice(0, 5));
  ok('番号は代車の登録番号と一致する', await p.evaluate(() => {
    return Array.from(document.querySelectorAll('.lo-head:not(.lo-corner)')).every(e => {
      const l = (state.loaners || []).find(x => x.id === e.getAttribute('data-loid'));
      const n = e.querySelector('.lo-no');
      if (!l || !n || !l.model) return true;   /* 車種未登録の列は別あつかい */
      return n.textContent.trim() === String(l.number);
    });
  }));
  ok('マウスを乗せた時の説明にも車種と番号が両方出る',
     H.filter(h => !h.noneMark).every(h => h.title.indexOf('（') >= 0), H[0].title);
}

console.log('\n── ④ 車種が未登録の代車は、番号を主役に戻す ──');
{
  const none = H.filter(h => h.noneMark);
  ok('🔴 車種未登録の列がある（テスト用に1台つくった）', none.length === 1, none.length);
  ok('🔴 その列は上が番号＝真っ白にならない', /^\d+$/.test(none[0].model || ''), none[0].model);
  ok('下に「車種未登録」と出る', none[0].no === '車種未登録', none[0].no);
}

console.log('\n── ⑤ カレンダーの中身は今までどおり ──');
{
  const badges = await p.evaluate(() => document.querySelectorAll('.lo-badge').length);
  ok('貸出のバッジが出ている', badges > 0, badges);
  ok('バッジはお客様の名前＋その人の車（代車の車種ではない）',
     (await p.evaluate(() => {
        const el = document.querySelector('.lo-badge');
        return el ? el.textContent.indexOf('様') >= 0 : false;
     })));
  ok('列ヘッダにマウスを乗せる仕掛け（data-loid）は残っている',
     H.every(h => !!h.loid), H.map(h => h.loid).slice(0, 3));
}

console.log('\n── ⑥ 呼び名も「車種（番号）」になっている ──');
{
  const src = fs.readFileSync('js/loaner.js', 'utf8');
  ok('🔴 _loName が車種を先に返す', /return model \? \(model \+ \(num\?'（'\+num\+'）':''\)\) : \(l\.name\|\|id\)/.test(src));
  ok('見出しは車種→番号の順で組み立てている', /'<div class="lo-model">' \+ _loEsc\(model\) \+ '<\/div><div class="lo-no">'/.test(src));
  const css = fs.readFileSync('css/polish.css', 'utf8');
  ok('.lo-model が主役の見た目', /\.lo-model\{[^}]*font-weight:800[^}]*font-size:12\.5px/.test(css));
  ok('.lo-no が控えめの見た目', /\.lo-no\{[^}]*font-size:9\.5px/.test(css));
  const idx = fs.readFileSync('index.html', 'utf8');
  /* ⚠ 版は上がっていくので数字は固定しない。3か所がそろっているかだけ見る。 */
  const _mVer = (idx.match(/<div class="login-ver">v([\d.]+)<\/div>/) || [])[1] || '';
  const _tVer = (idx.match(/<span class="ver">v([\d.]+)<\/span>/) || [])[1] || '';
  const _aVer = (idx.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('画面の版2か所と app-version がそろっている', !!_mVer && _mVer === _tVer && _mVer === _aVer, [_mVer, _tVer, _aVer]);
  ok('JSエラー0', errs.length === 0, errs.slice(0, 5));
}

await p.locator('#main').screenshot({ path: 'shot_loaner_name.png' });
console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
