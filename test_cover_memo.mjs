/* PitFlow v1.32.0 ── 表紙の依頼（罫線メモ）の文字サイズと自動折り返し のテスト
   -------------------------------------------------------------------
   ◎考え方
     本物の js/cover-print.js に本物の様式SVG（images/様式_お客様情報.svg）を渡して
     **表紙を実際に組み立てて描画**し、罫線の上に置かれた文字を1行ずつ測る。
     ⚠ はみ出していないか（罫線の幅に収まっているか）／長い依頼が折り返されているか／
        罫線が足りない時に「…ほか◯行」で知らせているか、を実寸で見る。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8948      ← 別ウィンドウ
     node test_cover_memo.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const dir = process.cwd();

/* 表紙を組み立てて開くだけのページ（印刷はしない） */
(function build(){
  const page = `<!doctype html><meta charset="utf-8"><body>
<script>window.state={workTypes:[{id:'shaken',label:'車検'}],loanerConditions:[],loaners:[],staff:[]};<\/script>
<script src="js/state.js"><\/script>
<script src="js/cover-print.js"><\/script>
<script>
window.__make=function(card){
  return fetch('images/様式_お客様情報.svg').then(function(r){return r.text();}).then(function(svg){
    var html=window.pitBuildCoverDoc(card,{formSvg:svg,noPrint:true});
    var f=document.getElementById('fr');
    if(f) f.remove();
    f=document.createElement('iframe');
    f.id='fr'; f.style.cssText='width:1200px;height:850px;border:0';
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    return new Promise(function(res){ setTimeout(res,450); });
  });
};
window.__memo=function(){
  var d=document.getElementById('fr').contentDocument;
  var g=d.getElementById('pcv-memo');
  if(!g) return null;
  return Array.from(g.querySelectorAll('text')).map(function(t){
    var b=t.getBBox();
    return { s:t.textContent, x:+t.getAttribute('x'), fs:+t.getAttribute('font-size'),
             y:+t.getAttribute('y'), right:b.x+b.width, w:b.width };
  });
};
window.__ready=1;
<\/script></body>`;
  fs.writeFileSync(path.join(dir, 'test-cover-memo.html'), page);
})();

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://127.0.0.1:8948/test-cover-memo.html');
await p.waitForFunction('window.__ready===1');

/* 様式SVGの罫線の実寸（この値からはみ出したらNG） */
const LINE_RIGHT = 240.4;

const CARD = {
  id: 'c1', customer: '小林 勇太', kana: 'コバヤシ ユウタ', car: 'アクア', maker: 'トヨタ',
  plate: '袖ヶ浦 300 あ 1234', tel: '090-1111-2222', reserveDate: '2026-08-10', reserveTime: '10:00',
  karteNo: 'K-12345', workType: 'shaken', dropType: 'drop', division: 'div1', boardId: 'default',
  menu: [
    'エンジンオイル交換',
    'エアコンから異音がするので見てほしい、走行中にキーという音が出るとのこと。冷風は出ている。',
    'タイヤ4本交換（銘柄はお任せ・国産で）'
  ].join('\n')
};

console.log('\n── ① 文字の大きさ ──');
await p.evaluate(c => window.__make(c), CARD);
let M = await p.evaluate(() => window.__memo());
ok('メモが描かれている', M && M.length > 0, M && M.length);
ok('文字は 11.5（13より小さくした）', M.every(r => r.fs === 11.5), M.map(r => r.fs));

console.log('\n── ② 罫線の幅からはみ出していない ──');
M.forEach(r => {
  if (r.right > LINE_RIGHT + 0.5) { fail++; console.log('  ❌ はみ出し「' + r.s + '」右端 ' + r.right.toFixed(1)); }
});
ok('全部の行が罫線の中に収まっている', M.every(r => r.right <= LINE_RIGHT + 0.5),
   M.map(r => [r.s.slice(0, 10), +r.right.toFixed(1)]));

console.log('\n── ③ 長い依頼が折り返されている ──');
{
  const joined = M.map(r => r.s).join('');
  ok('長い一文が2行以上に分かれている', M.length > 5, M.length);
  ok('文字が欠けていない（つなげると元に戻る）',
     joined.indexOf('エアコンから異音がするので見てほしい') >= 0 &&
     joined.indexOf('冷風は出ている。') >= 0, joined.slice(0, 60));
  const conts = M.filter(r => r.x > 28);
  ok('続きの行は少し右に下がっている', conts.length >= 1, M.map(r => r.x));
  ok('行頭が句読点・閉じカッコになっていない',
     M.every(r => '、。，．）」』】〉》〕｝'.indexOf(r.s.charAt(0)) < 0), M.map(r => r.s.charAt(0)));
}

console.log('\n── ④ 罫線が足りない時は「…ほか◯行」で知らせる（黙って消さない） ──');
{
  const many = Object.assign({}, CARD, {
    menu: Array.from({ length: 14 }, (_, i) =>
      (i + 1) + '行目：ブレーキから異音、パッド残量の確認と必要なら交換をお願いします').join('\n')
  });
  await p.evaluate(c => window.__make(c), many);
  const M2 = await p.evaluate(() => window.__memo());
  const last = M2[M2.length - 1];
  ok('罫線の本数（15本）を超えない', M2.length <= 15, M2.length);
  ok('最後の行が「…ほか◯行」', /^…ほか \d+行$/.test(last.s), last.s);
  ok('その行も罫線に収まっている', last.right <= LINE_RIGHT + 0.5, last.right);
}

console.log('\n── ⑤ 短い依頼は今までどおり（余計なことをしない） ──');
{
  const few = Object.assign({}, CARD, { menu: 'オイル交換', karteNo: '', tel: '' });
  await p.evaluate(c => window.__make(c), few);
  const M3 = await p.evaluate(() => window.__memo());
  ok('折り返しは起きない', M3.filter(r => r.s).length <= 2, M3.map(r => r.s));
  ok('「…ほか」は出ない', !M3.some(r => /…ほか/.test(r.s)));
  ok('書き始めの位置は 28 のまま', M3.every(r => r.x === 28), M3.map(r => r.x));
}

console.log('\n── ⑤-2 代車ありなら「代車管理費」の四角にチェックが入る（v1.40.0） ──');
{
  const withLo = Object.assign({}, CARD, { needLoaner: true, loanerId: '', loanerFrom: '2026-08-10', loanerTo: '2026-08-12' });
  await p.evaluate(c => window.__make(c), withLo);
  const on = await p.evaluate(() => {
    const d = document.getElementById('fr').contentDocument;
    const e = d.getElementById('pcv-loanerfee');
    if (!e) return null;
    const b = e.getBBox();
    return { x: b.x, y: b.y, w: b.width, h: b.height, sw: e.getAttribute('stroke-width') };
  });
  ok('🔴 チェックが出る', !!on, on);
  /* 様式SVGの四角＝x271.82 y235.66 の 7.82角。その中に収まっているか */
  ok('🔴 代車管理費の四角の中にある',
     on && on.x >= 271.8 && on.x + on.w <= 271.82 + 7.82 + 0.5 &&
           on.y >= 235.6 && on.y + on.h <= 235.66 + 7.82 + 0.5, on);
  ok('印刷で見える太さ', on && parseFloat(on.sw) >= 1, on && on.sw);

  const noLo = Object.assign({}, CARD, { needLoaner: false });
  await p.evaluate(c => window.__make(c), noLo);
  ok('🔴 代車なしの時は出ない',
     (await p.evaluate(() => !document.getElementById('fr').contentDocument.getElementById('pcv-loanerfee'))));
}

console.log('\n── ⑥ 本体との食い違い（配線チェック） ──');
const js = fs.readFileSync(path.join(dir, 'js', 'cover-print.js'), 'utf8');
ok('MEMO_FS が 11.5', /MEMO_FS = 11\.5/.test(js));
ok('折り返す幅（MEMO_W）を持っている', /var MEMO_W = \d+/.test(js));
ok('プレースホルダに幅を渡している', /data-w="'\+MEMO_W/.test(js));
ok('測るための隠し文字を最後に消している', /g\.removeChild\(meas\)/.test(js));
ok('代車管理費の四角の座標を決め打ちで持っている', /var LOANER_FEE_BOX = \{ x: 271\.82/.test(js));
ok('組み立ての流れに入っている', /svg = injectLoanerFeeCheck\(svg, c\);/.test(js));
ok('JSエラー0', errs.length === 0, errs.slice(0, 3));

await p.evaluate(c => window.__make(c), CARD);
await p.waitForTimeout(200);
await p.locator('#fr').screenshot({ path: 'shot_cover_memo.png' });

console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
