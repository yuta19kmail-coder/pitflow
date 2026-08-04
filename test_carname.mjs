/* PitFlow v1.23.0 ── メーカー／車種の入力候補のテスト
   -------------------------------------------------------------------
   ◎考え方
     本体は動かさない。**本物の js/carname-pit.js** と、
     **card-detail.js から切り出した本物のメーカー欄・車種欄のHTML**を
     小さなページに載せて、本物の顧客データに近い形を流し込んで確かめる。
     ⚠ card-detail.js 側の目印（data-cn="maker" / data-cn="car"）が変わると
        ここが落ちる＝候補が出なくなったことに気づける。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8945      ← 別ウィンドウ
     node test_carname.mjs                                                  */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const dir = process.cwd();

/* ---- 試験台を組み立てる ---- */
(function build(){
  const page = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="css/views.css">
<link rel="stylesheet" href="css/polish.css">
<style>
:root{--bg:#12161f;--bg2:#161c28;--bg3:#1e2634;--border:#2b3547;--border2:#39455c;--text:#dbe3ef;--text2:#93a2bb;--text3:#63718a;--brand:#1db97a;--r:10px}
body{margin:0;background:var(--bg);color:var(--text);font-family:sans-serif;padding:18px;width:900px}
</style><body>
<div class="cf-row">
  <div class="cf-field cf-field-cn" style="flex:0 0 8.5em"><div class="cf-label">メーカー</div>
    <input type="text" class="cf-input" data-key="maker" value="" placeholder="トヨタ" data-cn="maker"></div>
  <div class="cf-field cf-field-cn" style="flex:1"><div class="cf-label">車種（グレード）</div>
    <input type="text" class="cf-input" data-key="car" value="" placeholder="例 アクアGz" data-cn="car"></div>
</div>
<script>
/* ---- 顧客データ（本物と同じ形・実データの特徴をそのまま再現） ----
   ⚠ ミニは年式で BMW と MINI の両方がある（車検証どおり）。まとめない。 */
function veh(maker, car, boardId, n){
  var out=[]; for(var i=0;i<n;i++) out.push({maker:maker, car:car, boardId:boardId}); return out;
}
var V=[]
  .concat(veh('トヨタ','ヴォクシー','default',120))
  .concat(veh('トヨタ','プリウス','default',90))
  .concat(veh('トヨタ','アクア','default',60))
  .concat(veh('トヨタ','アルファード','default',20))
  .concat(veh('ニッサン','セレナ','default',70))
  .concat(veh('ニッサン','ノート','default',40))
  .concat(veh('ニッサン MT','スカイライン','default',11))
  .concat(veh('ホンダ','フィット','default',50))
  .concat(veh('ホンダオブザユーケー','シビック','default',3))
  .concat(veh('TMUK','アベンシス','default',4))
  .concat(veh('BMW','3シリーズ','import',259))
  .concat(veh('BMW','ミニR56','import',168))
  .concat(veh('BMW','5シリーズ','import',111))
  .concat(veh('MINI','ミニF56','import',60))
  .concat(veh('MINI','ミニF55','import',47))
  .concat(veh('ミニ','ミニR50','import',1))
  .concat(veh('ベンツ','Cクラス','import',200))
  .concat(veh('プジョー','308','import',20))
  .concat(veh('VW','ゴルフ','import',80))
  .concat([{maker:'',car:'',boardId:'default'}]);   /* 空の車＝候補に出てはいけない */
/* 1人1台ずつの顧客にばらす（本物と同じ「人→車」のネスト） */
window.state={ customers: V.map(function(v,i){ return {id:'cu'+i, name:'客'+i, vehicles:[v]}; }) };
<\/script>
<script src="js/carname-pit.js"><\/script>
<script>
/* card-detail.js のかわりに、値を受ける所と「国産/輸入の自動判定」だけ用意する */
window.card={ boardId:null, maker:'', car:'' };
window.__renders=0; window.__focusCar=0;
document.querySelectorAll('input.cf-input').forEach(function(el){
  el.addEventListener('input', function(){ card[el.dataset.key]=el.value; });
});
window.__mount=function(){
  PitCarName.mount(document.body, card, {
    onMaker:function(v){
      if (card.boardId) return;
      var bd=PitCarName.boardOf(v);
      if (bd!=='default' && bd!=='import') return;
      card.boardId=bd; card.division=(bd==='import')?'div2':'div1';
      window.__renders++;
      var nx=document.querySelector('input[data-cn="car"]');
      if(nx){ nx.focus(); window.__focusCar++; }
    }
  });
};
window.__mount();
window.__ready=1;
<\/script>`;
  fs.writeFileSync(path.join(dir, 'test-carname.html'), page);
})();

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
/* ⚠ 狭いと polish.css のスマホ用CSSで .cf-row が縦積みになる。PCの見え方で見る。 */
const p = await b.newPage({ viewport: { width: 1000, height: 760 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.goto('http://127.0.0.1:8945/test-carname.html');
await p.waitForFunction('window.__ready===1');

const MK = 'input[data-cn="maker"]', CR = 'input[data-cn="car"]';
const setBoard = bd => p.evaluate(b => { window.card.boardId = b; }, bd);
const list = () => p.evaluate(() => Array.from(document.querySelectorAll('.cn-dd.show .cn-i .cn-v')).map(e => e.textContent));
const open = () => p.evaluate(() => !!document.querySelector('.cn-dd.show'));
const more = () => p.evaluate(() => { const e = document.querySelector('.cn-dd.show .cn-more'); return e ? e.textContent : ''; });
const arrow = sel => p.evaluate(s => { document.querySelector(s).parentElement.querySelector('.cn-arrow')
  .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); }, sel);
const shut = () => p.evaluate(() => { document.activeElement && document.activeElement.blur(); });

console.log('\n── ① 辞書（顧客データから作れているか） ──');
let m = await p.evaluate(() => PitCarName.makers('').map(x => x.v));
ok('メーカーが多い順に並ぶ', m[0] === 'BMW' && m[1] === 'トヨタ', m.slice(0, 4));
ok('空のメーカーは候補に入らない', m.indexOf('') < 0);
ok('ミニは BMW と MINI の両方が残る（車検証どおり・まとめない）',
   m.indexOf('BMW') >= 0 && m.indexOf('MINI') >= 0 && m.indexOf('ミニ') >= 0);
ok('「ニッサン MT」「TMUK」も消さない（車検証どおり）',
   m.indexOf('ニッサン MT') >= 0 && m.indexOf('TMUK') >= 0);
let dom = await p.evaluate(() => PitCarName.makers('default').map(x => x.v));
let imp = await p.evaluate(() => PitCarName.makers('import').map(x => x.v));
ok('国産で絞ると輸入のメーカーは出ない', dom.indexOf('BMW') < 0 && dom.indexOf('ベンツ') < 0, dom);
ok('輸入で絞ると国産のメーカーは出ない', imp.indexOf('トヨタ') < 0 && imp.indexOf('ホンダ') < 0, imp);
ok('未選択（空）なら国産＋輸入の全部', m.length === dom.length + imp.length, [m.length, dom.length, imp.length]);

console.log('\n── ② 車種はメーカーで絞る（カスケード） ──');
let cs = await p.evaluate(() => PitCarName.cars('', 'トヨタ').map(x => x.v));
ok('トヨタの車種だけ', cs.join(',') === 'ヴォクシー,プリウス,アクア,アルファード', cs);
cs = await p.evaluate(() => PitCarName.cars('', 'ホンダ').map(x => x.v));
ok('ホンダに「アコード以外の他社」は混ざらない', cs.join(',') === 'フィット', cs);
cs = await p.evaluate(() => PitCarName.cars('import', '').map(x => x.v));
ok('メーカー未入力なら輸入の車種が全部', cs.indexOf('3シリーズ') >= 0 && cs.indexOf('ヴォクシー') < 0, cs.slice(0, 5));
cs = await p.evaluate(() => PitCarName.cars('', 'MINI').map(x => x.v));
ok('MINI を選べば MINI 名義の車種だけ（BMW名義のミニは出ない）',
   cs.join(',') === 'ミニF56,ミニF55', cs);

console.log('\n── ③ 国産／輸入の自動判定 ──');
ok('トヨタ → 国産', (await p.evaluate(() => PitCarName.boardOf('トヨタ'))) === 'default');
ok('BMW → 輸入', (await p.evaluate(() => PitCarName.boardOf('BMW'))) === 'import');
ok('MINI → 輸入', (await p.evaluate(() => PitCarName.boardOf('MINI'))) === 'import');
ok('知らないメーカーは空（勝手に決めない）', (await p.evaluate(() => PitCarName.boardOf('テスラ'))) === '');

console.log('\n── ④ ▼で全件 ──');
await setBoard(null);
await arrow(MK); await p.waitForTimeout(80);
let L = await list();
ok('▼で候補が開く', await open());
ok('未選択なら国産も輸入も出る', L.indexOf('トヨタ') >= 0 && L.indexOf('BMW') >= 0, L.slice(0, 5));
ok('多い順（先頭がBMW）', L[0] === 'BMW', L.slice(0, 3));
/* BMW は 3シリーズ259＋ミニR56 168＋5シリーズ111 ＝ 538台。メーカー単位の台数が出る。 */
ok('台数が右に出る（メーカー単位の合計）',
   (await p.evaluate(() => (document.querySelector('.cn-dd.show .cn-n') || {}).textContent)) === '538',
   await p.evaluate(() => (document.querySelector('.cn-dd.show .cn-n') || {}).textContent));
await shut(); await p.waitForTimeout(200);
await setBoard('default');
await arrow(MK); await p.waitForTimeout(80);
L = await list();
ok('国産を選んでいれば国産のメーカーだけ', L.indexOf('トヨタ') >= 0 && L.indexOf('BMW') < 0, L);
await shut(); await p.waitForTimeout(200);

console.log('\n── ⑤ 打てば絞る ──');
await setBoard(null);
await p.fill(MK, 'ト'); await p.waitForTimeout(80);
L = await list();
ok('「ト」でトヨタが出る', L.indexOf('トヨタ') >= 0, L);
ok('「ト」でBMWは出ない', L.indexOf('BMW') < 0, L);
await p.fill(MK, 'bmw'); await p.waitForTimeout(80);
L = await list();
ok('小文字 bmw でも BMW が出る（大文字小文字は無視）', L.indexOf('BMW') >= 0, L);
await p.fill(MK, 'ぷ'); await p.waitForTimeout(80);
L = await list();
ok('ひらがな「ぷ」でプジョーが出る', L.indexOf('プジョー') >= 0, L);
await p.fill(MK, 'ニッサンMT'); await p.waitForTimeout(80);
L = await list();
ok('空白を無視して「ニッサンMT」→「ニッサン MT」', L.indexOf('ニッサン MT') >= 0, L);
await p.fill(MK, 'ザザザ'); await p.waitForTimeout(80);
ok('当たらなければ何も出さない（じゃまをしない）', !(await open()));
await shut(); await p.waitForTimeout(200);

console.log('\n── ⑥ 選ぶ・手で打つ ──');
await setBoard(null);
await p.evaluate(() => { window.card.boardId = null; window.card.maker = ''; document.querySelector('input[data-cn="maker"]').value = ''; });
await p.fill(MK, 'トヨ'); await p.waitForTimeout(80);
await p.evaluate(() => document.querySelector('.cn-dd.show .cn-i').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
await p.waitForTimeout(120);
ok('選ぶと入力欄に入る', (await p.inputValue(MK)) === 'トヨタ');
ok('選んだ値がカードに保存される（input が飛ぶ）', (await p.evaluate(() => window.card.maker)) === 'トヨタ');
ok('選んだら閉じる', !(await open()));
ok('国産／輸入が自動で入る', (await p.evaluate(() => window.card.boardId)) === 'default');
ok('課も一緒に入る', (await p.evaluate(() => window.card.division)) === 'div1');
ok('描き直しが1回だけ走る', (await p.evaluate(() => window.__renders)) === 1);
ok('次に打つ車種へ焦点が移る', (await p.evaluate(() => window.__focusCar)) === 1);

await p.evaluate(() => { window.card.boardId = 'import'; });
await p.fill(MK, 'トヨタ'); await p.waitForTimeout(60);
await p.evaluate(() => { const e = document.querySelector('.cn-dd.show .cn-i'); if (e) e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); });
await p.waitForTimeout(80);
ok('すでに国産／輸入を選んであれば上書きしない', (await p.evaluate(() => window.card.boardId)) === 'import');
await shut(); await p.waitForTimeout(200);

await p.evaluate(() => { window.card.boardId = null; });
await p.fill(MK, 'テスラ'); await p.waitForTimeout(80);
ok('候補に無い名前も手で打てる（そのまま保存される）', (await p.evaluate(() => window.card.maker)) === 'テスラ');
ok('候補に無い名前では国産／輸入を勝手に決めない', (await p.evaluate(() => window.card.boardId)) === null);
await shut(); await p.waitForTimeout(200);

console.log('\n── ⑦ 車種側もつながっているか ──');
await p.evaluate(() => { window.card.boardId = 'import'; window.card.maker = 'ベンツ'; document.querySelector('input[data-cn="maker"]').value = 'ベンツ'; });
await arrow(CR); await p.waitForTimeout(80);
L = await list();
ok('メーカーに合わせて車種が絞られる', L.join(',') === 'Cクラス', L);
await shut(); await p.waitForTimeout(200);
await p.evaluate(() => { document.querySelector('input[data-cn="maker"]').value = 'トヨタ'; window.card.maker = 'トヨタ'; window.card.boardId = 'default'; });
await arrow(CR); await p.waitForTimeout(80);
L = await list();
ok('メーカーを変えれば車種の候補も変わる', L.indexOf('ヴォクシー') >= 0 && L.indexOf('Cクラス') < 0, L);
await p.fill(CR, 'ぷ'); await p.waitForTimeout(80);
L = await list();
ok('車種もひらがなで引ける（ぷ→プリウス）', L.indexOf('プリウス') >= 0, L);
await shut(); await p.waitForTimeout(200);

console.log('\n── ⑧ キー操作・件数の上限 ──');
await p.evaluate(() => { window.card.boardId = null; document.querySelector('input[data-cn="maker"]').value = ''; });
await p.click(MK);
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(80);
ok('↓で候補が開く', await open());
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(40);
const before = await p.inputValue(MK);
await p.keyboard.press('Enter'); await p.waitForTimeout(80);
ok('Enterで選べる', (await p.inputValue(MK)) !== before && (await p.inputValue(MK)).length > 0, await p.inputValue(MK));
await p.keyboard.press('Escape'); await p.waitForTimeout(60);
await shut(); await p.waitForTimeout(200);
await p.evaluate(() => { window.card.boardId = null; document.querySelector('input[data-cn="maker"]').value = ''; });
await p.click(MK);
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(80);
await p.keyboard.press('Escape'); await p.waitForTimeout(60);
ok('Escで閉じる', !(await open()));
await shut(); await p.waitForTimeout(200);

const many = await p.evaluate(() => {
  const cs = state.customers;
  for (let i = 0; i < 40; i++) cs.push({ id: 'x' + i, vehicles: [{ maker: 'トヨタ', car: '車' + i, boardId: 'default' }] });
  if (window.pitCarNameReset) pitCarNameReset();
  return PitCarName.cars('', 'トヨタ').length;
});
ok('顧客データを足すと辞書が作り直される', many > 40, many);
await p.evaluate(() => { window.card.boardId = 'default'; document.querySelector('input[data-cn="maker"]').value = 'トヨタ'; window.card.maker = 'トヨタ'; });
await arrow(CR); await p.waitForTimeout(90);
L = await list();
ok('一度に出すのは30件まで', L.length === 30, L.length);
ok('あふれた分は「ほか◯件」と出す（黙って捨てない）', /ほか \d+ 件/.test(await more()), await more());
await shut(); await p.waitForTimeout(200);

console.log('\n── ⑨ 本体との食い違い（配線チェック） ──');
const idx = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const cd = fs.readFileSync(path.join(dir, 'js', 'card-detail.js'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'css', 'polish.css'), 'utf8');
ok('index.html が js/carname-pit.js を読み込んでいる', /<script src="js\/carname-pit\.js/.test(idx));
ok('carname-pit.js は card-detail.js より後ろ', idx.indexOf('js/carname-pit.js') > idx.indexOf('js/card-detail.js'));
ok('バージョンが v1.23.0', (idx.match(/v1\.23\.0/g) || []).length === 2, (idx.match(/v1\.23\.0/g) || []).length);
ok('card-detail.js のメーカー欄に data-cn="maker" がある', /data-cn=\\?"maker\\?"/.test(cd));
ok('card-detail.js の車種欄に data-cn="car" がある', /data-cn=\\?"car\\?"/.test(cd));
ok('card-detail.js が PitCarName.mount を呼んでいる', /PitCarName\.mount\(/.test(cd));
ok('国産／輸入の自動判定に boardOf を使っている', /PitCarName\.boardOf\(/.test(cd));
ok('polish.css に .cn-dd がある', /\.cn-dd\{/.test(css));
ok('JSエラー0', errs.length === 0, errs.slice(0, 3));

await p.evaluate(() => { window.card.boardId = null; document.querySelector('input[data-cn="maker"]').value = ''; window.card.maker = ''; });
await arrow(MK); await p.waitForTimeout(150);
await p.screenshot({ path: 'shot_carname.png' });
await b.close();
console.log(`\n===== ${pass} OK / ${fail} NG =====`);
process.exit(fail ? 1 : 0);
