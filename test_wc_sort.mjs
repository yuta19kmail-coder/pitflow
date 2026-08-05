/* PitFlow v1.30.0 ── 作業内容テンプレート（症状ホイール）のカプセル並び替え のテスト
   -------------------------------------------------------------------
   ◎考え方
     本物の js/work-content.js と css/work-content.css を小さなページに載せて、
     **実際にマウスでカプセルをつまんで動かし**、並びと保存（設定の配列）を確かめる。
     ⚠ 削除の×が並び替えに食われていないか／別のグループへ移らないかも見る。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8947      ← 別ウィンドウ
     node test_wc_sort.mjs                                                  */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const dir = process.cwd();

(function build(){
  const page = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="css/work-content.css">
<style>
:root{--bg:#12161f;--bg2:#161c28;--bg3:#1e2634;--border:#2b3547;--border2:#39455c;--text:#dbe3ef;--text2:#93a2bb;--text3:#63718a;--brand:#1db97a}
body{margin:0;background:var(--bg);color:var(--text);font-family:sans-serif;padding:16px;width:900px}
.ps-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px}
.wc-s-h{font-size:12px;font-weight:700;margin:8px 0 6px}
.wc-s-add{margin-left:8px;font-size:11px}
</style><body>
<div id="host"></div>
<script>
/* 本体のかわりに、設定の入れ物と保存の受け口だけ用意する */
window.state={ settings:{} };
window.__saves=0;
window.PitDB={ save:function(){ window.__saves++; } };
window.pitToast=function(m){ window.__toast=m; };
<\/script>
<script src="js/work-content.js"><\/script>
<script>
document.getElementById('host').innerHTML = WorkContent.settingsCardHtml();
WorkContent.mountSettings();
window.__cfg=function(){ return state.settings.workContent; };
window.__ready=1;
<\/script>`;
  fs.writeFileSync(path.join(dir, 'test-wc-sort.html'), page);
})();

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
/* ⚠ 設定カードは縦に長い。ビューポートが短いと下のチップが画面の外に出て、マウスが届かない。 */
const p = await b.newPage({ viewport: { width: 1000, height: 1900 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://127.0.0.1:8947/test-wc-sort.html');
await p.waitForFunction('window.__ready===1');

const parts = () => p.evaluate(() => window.__cfg().parts.slice());
const chips = gi => p.evaluate(g => window.__cfg().chipGroups[g].items.slice(), gi);
const shown = sel => p.evaluate(s => Array.from(document.querySelectorAll(s))
  .map(e => e.textContent.replace(/\s+$/, '')), sel);

/* カプセルをつまんで、別のカプセルの真ん中まで運んで離す（実際のマウス操作） */
async function dragTo(grp, fromText, toText){
  const box = await p.evaluate(([g, a, b]) => {
    const row = document.querySelector('.wc-s-chips[data-wc-grp="' + g + '"]');
    const find = t => Array.from(row.querySelectorAll('.wc-s-chip')).find(e => e.textContent.indexOf(t) === 0);
    const ra = find(a).getBoundingClientRect(), rb = find(b).getBoundingClientRect();
    return { ax: ra.left + 14, ay: ra.top + ra.height / 2, bx: rb.left + rb.width / 2, by: rb.top + rb.height / 2 };
  }, [grp, fromText, toText]);
  await p.mouse.move(box.ax, box.ay);
  await p.mouse.down();
  await p.mouse.move(box.ax + 8, box.ay, { steps: 3 });     /* 4px のしきい値を越える */
  await p.mouse.move(box.bx, box.by, { steps: 12 });
  await p.mouse.up();
  await p.waitForTimeout(80);
}

console.log('\n── ① 出来上がりの形 ──');
ok('部位のカプセルにグループの印が付いている',
   await p.evaluate(() => !!document.querySelector('.wc-s-chips[data-wc-grp="parts"]')));
ok('チップのカプセルにもグループの印が付いている',
   await p.evaluate(() => document.querySelectorAll('.wc-s-chips[data-wc-grp^="chip:"]').length === 5),
   await p.evaluate(() => document.querySelectorAll('.wc-s-chips[data-wc-grp^="chip:"]').length));
ok('カプセルに番号が入っている',
   await p.evaluate(() => document.querySelector('.wc-s-chips[data-wc-grp="parts"] .wc-s-chip').getAttribute('data-wc-i') === '0'));

const P0 = await parts();
console.log('    もとの部位:', JSON.stringify(P0));

console.log('\n── ② 部位を前へ動かす（エアコン → 先頭のエンジンの位置へ） ──');
await dragTo('parts', 'エアコン', 'エンジン');
let P1 = await parts();
console.log('    あとの部位:', JSON.stringify(P1));
ok('エアコンが先頭に来た', P1[0] === 'エアコン', P1.slice(0, 3));
ok('中身は増えても減ってもいない', P1.length === P0.length && P0.every(x => P1.indexOf(x) >= 0), [P0.length, P1.length]);
ok('設定として保存された（PitDB.save が呼ばれた）', (await p.evaluate(() => window.__saves)) >= 1);
ok('保存しましたと知らせる', (await p.evaluate(() => window.__toast)) === '並び順を保存しました');
ok('画面の並びも同じ', (await shown('.wc-s-chips[data-wc-grp="parts"] .wc-s-chip'))[0].indexOf('エアコン') === 0);

console.log('\n── ③ 後ろへ動かす（エアコン → 最後尾のボディ/外装の位置へ） ──');
await dragTo('parts', 'エアコン', 'ボディ/外装');
let P2 = await parts();
console.log('    あとの部位:', JSON.stringify(P2));
ok('エアコンが最後に来た', P2[P2.length - 1] === 'エアコン', P2.slice(-3));
ok('ほかの並びは崩れていない',
   JSON.stringify(P2.slice(0, -1)) === JSON.stringify(P1.slice(1)), [P1, P2]);

console.log('\n── ④ チップも並び替えられる ──');
const C0 = await chips(0);
await dragTo('chip:0', '板金', '点検');
const C1 = await chips(0);
console.log('    もと:', JSON.stringify(C0), '\n    あと:', JSON.stringify(C1));
ok('板金が先頭に来た', C1[0] === '板金', C1.slice(0, 3));
ok('中身は増えても減ってもいない', C1.length === C0.length && C0.every(x => C1.indexOf(x) >= 0));
ok('別のグループは無傷', JSON.stringify(await chips(1)) === JSON.stringify(
   await p.evaluate(() => window.__cfg().chipGroups[1].items.slice())));

console.log('\n── ⑤ 触っただけでは動かない／×は今までどおり ──');
{
  const before = await parts();
  await p.evaluate(() => {
    const el = document.querySelector('.wc-s-chips[data-wc-grp="parts"] .wc-s-chip');
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, clientX:r.left+14, clientY:r.top+8, button:0 }));
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles:true, clientX:r.left+15, clientY:r.top+8 }));
    window.dispatchEvent(new PointerEvent('pointerup',   { bubbles:true, clientX:r.left+15, clientY:r.top+8 }));
  });
  await p.waitForTimeout(50);
  ok('1pxだけ動かしても並びは変わらない', JSON.stringify(await parts()) === JSON.stringify(before));
}
{
  const n0 = (await parts()).length;
  await p.evaluate(() => document.querySelector('.wc-s-chips[data-wc-grp="parts"] .wc-s-chip button').click());
  await p.waitForTimeout(50);
  ok('×を押すと今までどおり1つ消える', (await parts()).length === n0 - 1, [(await parts()).length, n0]);
}
ok('掴んでいる印は残っていない', await p.evaluate(() => !document.querySelector('.wc-s-drag') && !document.body.classList.contains('wc-s-dragging')));

console.log('\n── ⑥ 本体との食い違い（配線チェック） ──');
const js  = fs.readFileSync(path.join(dir, 'js', 'work-content.js'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'css', 'work-content.css'), 'utf8');
const idx = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
ok('work-content.js が pointer で作られている（HTML5のドラッグではない）',
   /addEventListener\('pointerdown', _wcDown\)/.test(js) && !/draggable="true"/.test(js));
ok('配線は入れ物側に1回だけ（_wcSortBound）', /_wcSortBound/.test(js));
ok('work-content.css に touch-action:none がある（タブレットでスクロールに取られない）',
   /\.wc-s-chips\[data-wc-grp\][^{]*\{[^}]*touch-action:\s*none/.test(css));
ok('×ボタンだけは今までどおり押せる', /\.wc-s-chip button\{[^}]*touch-action:\s*auto/.test(css));
{
  const _m = (idx.match(/<div class="login-ver">v([\d.]+)<\/div>/) || [])[1] || '';
  const _t = (idx.match(/<span class="ver">v([\d.]+)<\/span>/) || [])[1] || '';
  const _a = (idx.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('画面の版2か所と app-version がそろっている', !!_m && _m === _t && _m === _a, [_m, _t, _a]);
}
ok('JSエラー0', errs.length === 0, errs.slice(0, 3));

console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
