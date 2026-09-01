/* PitFlow v1.28.0 ── メーカー／車種の候補を「入力欄の上」に出す のテスト
   -------------------------------------------------------------------
   ◎考え方
     本物の js/carname-pit.js と css/polish.css を小さなページに載せて、
     **候補の箱が入力欄より上に出ているか**を実際の座標で測る。
     ねらい＝Windows の変換候補（IMEの予測）は入力欄の下に出るので、そこと重ねない。
     ⚠ 上の余白が足りない位置では下に出る（画面外へ逃げないため）。それも測る。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8946      ← 別ウィンドウ
     node test_carname_place.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const dir = process.cwd();

/* ---- 試験台：上に余白がある所と、ほとんど無い所の2つに同じ欄を置く ---- */
(function build(){
  const page = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="css/views.css">
<link rel="stylesheet" href="css/polish.css">
<style>
:root{--bg:#12161f;--bg2:#161c28;--bg3:#1e2634;--border:#2b3547;--border2:#39455c;--text:#dbe3ef;--text2:#93a2bb;--text3:#63718a;--brand:#1db97a;--r:10px}
body{margin:0;background:var(--bg);color:var(--text);font-family:sans-serif;width:900px}
.spacer{height:420px}
</style><body>
<!-- ① 画面のいちばん上＝上に余白がほぼ無い -->
<div class="cf-row" id="rowTop">
  <div class="cf-field" style="flex:0 0 8.5em"><div class="cf-label">メーカー</div>
    <input type="text" class="cf-input" data-key="maker" value="" data-cn="maker"></div>
</div>
<div class="spacer"></div>
<!-- ② 十分に下＝上に余白がある（ふつうの位置） -->
<div class="cf-row" id="rowMid">
  <div class="cf-field" style="flex:0 0 8.5em"><div class="cf-label">メーカー</div>
    <input type="text" class="cf-input" data-key="maker" value="" data-cn="maker2"></div>
</div>
<div class="spacer"></div>
<script>
function veh(maker, car, boardId, n){ var out=[]; for(var i=0;i<n;i++) out.push({maker:maker, car:car, boardId:boardId}); return out; }
var V=[].concat(veh('トヨタ','ヴォクシー','default',120))
        .concat(veh('ニッサン','セレナ','default',70))
        .concat(veh('ホンダ','フィット','default',50))
        .concat(veh('スズキ','ワゴンR','default',40))
        .concat(veh('ダイハツ','タント','default',30))
        .concat(veh('スバル','インプレッサ','default',20))
        .concat(veh('マツダ','デミオ','default',15))
        .concat(veh('三菱','デリカ','default',10));
window.state={ customers: V.map(function(v,i){ return {id:'cu'+i, name:'客'+i, vehicles:[v]}; }) };
<\/script>
<script src="js/carname-pit.js"><\/script>
<script>
window.card={ boardId:null, maker:'', car:'' };
/* attach() をそのまま使う＝mount() は data-cn="maker"/"car" しか見ないので、2つ目は手で付ける */
PitCarName.mount(document.body, card, {});
PitCarName.attach(document.querySelector('input[data-cn="maker2"]'), {
  list: function(){ return PitCarName.makers(card.boardId); }
});
window.__ready=1;
<\/script>`;
  fs.writeFileSync(path.join(dir, 'test-carname-place.html'), page);
})();

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1000, height: 760 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://127.0.0.1:8946/test-carname-place.html');
await p.waitForFunction('window.__ready===1');

/* ▼を押して開く → 入力欄と候補の箱の座標を返す */
async function openAt(sel){
  await p.evaluate(s => {
    document.querySelector(s).parentElement.querySelector('.cn-arrow')
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  }, sel);
  await p.waitForTimeout(80);
  return p.evaluate(s => {
    const inp = document.querySelector(s);
    const dd = inp.parentElement.querySelector('.cn-dd');
    const a = inp.getBoundingClientRect(), b = dd.getBoundingClientRect();
    return { shown: dd.classList.contains('show'), down: dd.classList.contains('cn-down'),
             inpTop: a.top, inpBottom: a.bottom, ddTop: b.top, ddBottom: b.bottom,
             ddH: b.height, vh: window.innerHeight, n: dd.querySelectorAll('.cn-i').length };
  }, sel);
}
const shut = () => p.evaluate(() => { document.activeElement && document.activeElement.blur();
  document.querySelectorAll('.cn-dd').forEach(e => e.classList.remove('show')); });

console.log('\n── ① ふつうの位置＝入力欄の「上」に出る（今回の本題） ──');
{
  const r = await openAt('input[data-cn="maker2"]');
  ok('候補が開く', r.shown);
  ok('候補は8メーカーぶん', r.n === 8, r.n);
  ok('候補の箱の下辺が、入力欄の上辺より上にある', r.ddBottom <= r.inpTop, { ddBottom: r.ddBottom, inpTop: r.inpTop });
  ok('下向きの印（cn-down）は付いていない', r.down === false);
  ok('入力欄の下（＝変換候補が出る場所）に重なっていない', r.ddTop < r.inpTop, { ddTop: r.ddTop, inpTop: r.inpTop });
  ok('画面の外にはみ出していない', r.ddTop >= 0, r.ddTop);
  await shut();
}

console.log('\n── ② 画面のいちばん上＝上に入らないので「下」に出る（はみ出し防止） ──');
{
  const r = await openAt('input[data-cn="maker"]');
  ok('候補が開く', r.shown);
  ok('下向きの印（cn-down）が付く', r.down === true);
  ok('候補の箱の上辺が、入力欄の下辺より下にある', r.ddTop >= r.inpBottom, { ddTop: r.ddTop, inpBottom: r.inpBottom });
  ok('画面の外にはみ出していない', r.ddBottom <= r.vh + 1, { ddBottom: r.ddBottom, vh: r.vh });
  await shut();
}

console.log('\n── ③ 本体との食い違い（配線チェック） ──');
const css = fs.readFileSync(path.join(dir, 'css', 'polish.css'), 'utf8');
const js  = fs.readFileSync(path.join(dir, 'js', 'carname-pit.js'), 'utf8');
ok('polish.css の .cn-dd の既定が「上」（bottom:calc(100% + 3px)）', /\.cn-dd\{[\s\S]*?bottom:calc\(100% \+ 3px\)/.test(css));
ok('polish.css に下向きの .cn-dd.cn-down がある', /\.cn-dd\.cn-down\{/.test(css));
ok('carname-pit.js に置き場所を決める place() がある', /function place\(\)/.test(js));
ok('render() が place() を呼んでいる', /dd\.classList\.add\('show'\);\s*\n\s*open = true;\s*\n\s*place\(\);/.test(js));
ok('JSエラー0', errs.length === 0, errs);

console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
