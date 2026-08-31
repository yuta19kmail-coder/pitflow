/* PitFlow ── 🔎🧹❔🔍 **代車カレンダーの上のバー**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた指定（2026-08-31）
     「検索BOXを作る／絞り込みと並び替えのチップがぎゅうぎゅうに並びすぎだからすっきりさせたい／
       操作が結構複雑だから簡易的マニュアルポップみたいなものをつくりたい・〇？があってクリックすると展開／
       カレンダーの縮尺を変更したい（AAAのスイッチじゃなく、がっつり動く摘まめるスライダー）」

   ◎ここで見張ること
     🔴 ① 検索＝**代車に当たった時だけ列を絞る。お客様名・メモでは列を消さず札を光らせる**
        （列を消すと前後の予定が見えなくなり、この画面の役目が壊れる）
     🔴 ② 絞込＝畳んでも**効いている数が分かる**／クリアで全部戻る
     🔴 ③ 並べ替え＝**ラジオ（1つだけ）**。同じものを選んでも解除されない
     🔴 ④ 縮尺＝**既定（23）が直す前とまったく同じ px**／端末に覚える／つまんでいる間は描き直さない
     🔴 ⑤ ？＝開く・閉じる・**下書きの説明が入っている**
     🔴 ⑥ 追加＝いまある3つだけ（**整備の枠はまだ出さない**）
     🔴 ⑦ 上のバーからチップ14個が消えている（畳めていなければ意味が無い）

   ◎使い方
       node test_loaner_head.mjs
       node test_loaner_head.mjs --break=1  … 検索で列も消すように壊す → ①が赤くなるのが正しい
       node test_loaner_head.mjs --break=2  … 縮尺の既定をずらす         → ④が赤くなるのが正しい
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').split('=')[1] || '';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');

function bend(src) {
  if (BREAK === '1') return src.replace('    if (byVeh.length) ls = byVeh;', '    ls = byVeh;');
  if (BREAK === '2') return src.replace('const LO_DAY_MIN = 28, LO_DAY_MAX = 72;', 'const LO_DAY_MIN = 20, LO_DAY_MAX = 72;');
  return src;
}

const 代車 = [
  { id:'l1', name:'代車1', number:1, model:'タント',   category:'kei',    etc:true,  navi:true,  camera:false, iso:false, seats:'4', shakenDate:'2026-10-31' },
  { id:'l2', name:'代車2', number:2, model:'アクア',   category:'normal', etc:true,  navi:true,  camera:true,  iso:false, seats:'5', shakenDate:'2027-03-20' },
  { id:'l3', name:'代車3', number:3, model:'MINI',    category:'import', etc:true,  navi:true,  camera:true,  iso:true,  seats:'4', shakenDate:'2027-01-10' },
  { id:'l4', name:'代車4', number:4, model:'ハイゼット', category:'commercial', etc:false, navi:false, camera:false, iso:false, seats:'2', shakenDate:'2027-05-15' }
];
const 貸 = { id:'la1', loanerId:'l2', cardId:null, customer:'小林 太郎', car:'アクア', purpose:'車販・乗り換え',
             fromDate:'2026-08-10', toDate:'2026-08-13', manual:true };
const 仮 = { id:'lh1', loanerId:'l3', cardId:null, hold:true, memo:'隣にずらすかも', customer:'仮押さえ',
             purpose:'隣にずらすかも', fromDate:'2026-08-11', toDate:'2026-08-12', manual:true };

function boot(){
  const store = {};
  const css = {};                       /* documentElement に当てた CSS 変数 */
  const els = {};
  const body = { kids: [] };
  const mk = (id) => {
    const n = {
      id: id || '', value: '', textContent: '', innerHTML: '', _cls: {},
      style: { setProperty(k, v){ this[k] = v; } },
      classList: {
        add(c){ n._cls[c] = 1; }, remove(c){ delete n._cls[c]; },
        toggle(c, on){ if (on === undefined) on = !n._cls[c]; if (on) n._cls[c] = 1; else delete n._cls[c]; return !!n._cls[c]; },
        contains(c){ return !!n._cls[c]; }
      },
      children: [],
      getAttribute(k){ return n['_a_' + k] || null; },
      setAttribute(k, v){ n['_a_' + k] = v; },
      getBoundingClientRect(){ return { top: 40, bottom: 68, left: 600, right: 760, width: 160, height: 28 }; },
      offsetWidth: 240, offsetHeight: 180,
      appendChild(c){ n.children.push(c); }, remove(){
        body.kids = body.kids.filter(x => x !== n); if (els[n.id] === n) delete els[n.id];
      },
      insertAdjacentHTML(_where, html){ n.innerHTML += html; },
      addEventListener(){}, removeEventListener(){}, contains(){ return false; },
      querySelector(){ return null; }, querySelectorAll(){ return []; }
    };
    return n;
  };
  /* 画面に置いてある部品 */
  ['lo-q','lo-fbtn','lo-sbtn','lo-fcnt','lo-zoom','lo-abtn','loaner-grid','loaner-scroll'].forEach(id => { els[id] = mk(id); });
  els['loaner-grid'].children = [1];   /* 中身がある扱い（_loApplyZoom が列幅を書く条件） */

  const ctx = {
    console, setTimeout: (f) => { try { f(); } catch (e) {} }, clearTimeout, Promise, Date, Math, JSON, String, Number, Array, Object, isFinite,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: {
      body: { appendChild(n){ body.kids.push(n); if (n.id) els[n.id] = n; }, kids: body.kids },
      documentElement: { clientWidth: 1400, style: { setProperty(k, v){ css[k] = v; } } },
      getElementById: (id) => els[id] || null,
      createElement: () => mk(''),
      querySelector: (sel) => (sel === '.lo-addbtn' ? (els['lo-abtn'] || null) : null),
      querySelectorAll: () => [],
      addEventListener(){}, removeEventListener(){}
    },
    innerHeight: 900,
    state: { loaners: JSON.parse(JSON.stringify(代車)), loanerAssigns: JSON.parse(JSON.stringify([貸, 仮])),
             fleetEvents: [], cards: [], customers: [], companyCars: [], staff: [], settings: {} },
    PitDB: { save(){} }, pitAlert(){}, pitAsk(){ return Promise.resolve(true); }, pitLog(){},
    ymd: (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'),
    addDays: (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  };
  ctx.window = ctx; ctx.css = css; ctx.els = els; ctx.store = store; ctx.bodyKids = body.kids;
  vm.createContext(ctx);
  vm.runInContext(JS('loaner-free.js'), ctx, { filename:'loaner-free.js' });
  vm.runInContext(bend(JS('loaner.js')), ctx, { filename:'loaner.js' });
  return ctx;
}
const names = (c) => c._loFiltered().map(l => l.model).join(',');

/* ================================================================= */
console.log('\n── ① 探す ──');
{
  const c = boot();
  ok('はじめは全部の列が出ている', names(c) === 'タント,アクア,MINI,ハイゼット');
  c.loSearch('タント');
  ok('🔴 代車の車種に当たったら、その列だけ', names(c) === 'タント');
  c.loSearch('3');
  ok('番号でも当たる', names(c) === 'MINI');
  c.loSearch('小林');
  ok('🔴 お客様名では列を消さない', names(c) === 'タント,アクア,MINI,ハイゼット');
  const h1 = c._loRenderDays(new Date(2026, 7, 10), 4);
  ok('🔴 当たった貸出の札が光る', h1.indexOf('lo-hit') >= 0);
  c.loSearch('ずらす');
  ok('仮押さえのメモでも当たる', c._loRenderDays(new Date(2026, 7, 10), 4).indexOf('lo-hit') >= 0);
  ok('メモに当たった時も列は消さない', names(c) === 'タント,アクア,MINI,ハイゼット');
  c.loSearch('アクア');
  ok('🔴 車種と貸出の車種が同じ言葉でも、列は代車で決まる', names(c) === 'アクア');
  c.loSearchClear();
  ok('消したら全部戻る', names(c) === 'タント,アクア,MINI,ハイゼット');
  ok('検索欄も空になる', c.els['lo-q'].value === '');
  c.loSearch('ぜったいに無い言葉');
  ok('🔴 当たらない時に列を全部消さない（真っ白にしない）', names(c) === 'タント,アクア,MINI,ハイゼット');
}

/* ================================================================= */
console.log('\n── ② 絞込（畳んでも効いているか分かる）──');
{
  const c = boot();
  c.loFilterMenu(null);
  ok('小窓が開く', !!c.els['lo-hpop']);
  ok('装備と区分の両方が入っている', /ETC[\s\S]*Bカメ[\s\S]*軽[\s\S]*商用/.test(c.els['lo-hpop'].innerHTML));
  c.loToggleFilter('camera');
  ok('🔴 Bカメ付きだけになる', names(c) === 'アクア,MINI');
  ok('🔴 効いている数がボタンに出る', c.els['lo-fcnt'].textContent === 1 || c.els['lo-fcnt'].textContent === '1');
  ok('数のバッジが見えている', c.els['lo-fcnt'].style.display === 'inline-block');
  ok('絞込ボタンが点いている', c.els['lo-fbtn'].classList.contains('lo-on'));
  c.loToggleCat('import');
  ok('区分と重ねて効く', names(c) === 'MINI');
  ok('数が2になる', String(c.els['lo-fcnt'].textContent) === '2');
  c.loFilterClear();
  ok('🔴 クリアで全部戻る', names(c) === 'タント,アクア,MINI,ハイゼット');
  ok('数のバッジが消える', c.els['lo-fcnt'].style.display === 'none');
  ok('絞込ボタンの点灯も消える', !c.els['lo-fbtn'].classList.contains('lo-on'));
}

/* ================================================================= */
console.log('\n── ③ 並べ替え（1つだけ・ラジオ）──');
{
  const c = boot();
  c.loSortMenu(null);
  ok('小窓が開く', !!c.els['lo-hpop']);
  ok('「標準」が入っている', c.els['lo-hpop'].innerHTML.indexOf('標準') >= 0);
  c.loToggleSort('camera');
  ok('🔴 Bカメ付きが先に来る', names(c).indexOf('アクア') === 0 || names(c).indexOf('MINI') === 0);
  ok('ボタンに選んだものが出る', c.els['lo-sbtn'].innerHTML.indexOf('Bカメ') >= 0);
  ok('並べ替えボタンが点いている', c.els['lo-sbtn'].classList.contains('lo-on'));
  c.loToggleSort('camera');
  ok('🔴 同じものをもう一度選んでも解除しない（ラジオ）', c.els['lo-sbtn'].classList.contains('lo-on'));
  c.loToggleSort('shakenDate');
  ok('入れ替えられる', names(c) === 'タント,MINI,アクア,ハイゼット');
  c.loToggleSort('');
  ok('🔴 「標準」で元に戻せる', names(c) === 'タント,アクア,MINI,ハイゼット');
  ok('ボタンの表示も戻る', c.els['lo-sbtn'].innerHTML.indexOf('並べ替え') >= 0 && !c.els['lo-sbtn'].classList.contains('lo-on'));
}

/* ================================================================= */
console.log('\n── ④ 縮尺（つまめるスライダー）──');
{
  const c = boot();
  c.loZoom(23);
  ok('🔴🔴 既定（23）＝1日 38px（直す前とまったく同じ）', c.css['--lo-dayh'] === '38px', c.css['--lo-dayh']);
  ok('🔴🔴 既定（23）＝列 112px（直す前とまったく同じ）',
     (c.els['loaner-grid'].style.gridTemplateColumns || '').indexOf('112px') >= 0, c.els['loaner-grid'].style.gridTemplateColumns);
  c.loZoom(0);
  ok('いちばん小さい側', c.css['--lo-dayh'] === '28px');
  c.loZoom(100);
  ok('いちばん大きい側', c.css['--lo-dayh'] === '72px');
  ok('列も一緒に広がる', (c.els['loaner-grid'].style.gridTemplateColumns || '').indexOf('166px') >= 0);
  ok('🔴 端末に覚える', c.store['pitflow_lo_zoom_v1'] === '100');
  c.loZoom(999); ok('上限を超えない', c.css['--lo-dayh'] === '72px');
  c.loZoom(-5);  ok('下限を割らない', c.css['--lo-dayh'] === '28px');
  ok('つまみの位置まで色が付く', (c.els['lo-zoom'].style['--lo-zfill'] || '').indexOf('%') >= 0);
  /* 🔴 つまんでいる間に描き直さない＝重くなるので、CSS変数と列幅だけ書き換えている */
  const c2 = boot();
  let rebuilt = 0; const orig = c2.loRebuild;
  c2.loRebuild = function(){ rebuilt++; return orig.apply(this, arguments); };
  c2.loZoom(60);
  ok('🔴 つまんでいる間は描き直さない（指について来なくなるため）', rebuilt === 0);
}
{
  /* 覚えた縮尺を次に開いた時に拾う */
  const c = boot();
  c.store['pitflow_lo_zoom_v1'] = '77';
  c._loZoomLoad();
  ok('🔴 次に開いた時、覚えた縮尺で出る', c._loDayH() === Math.round(28 + 44 * 0.77));
}

/* ================================================================= */
console.log('\n── ⑤ ？ 簡易マニュアル ──');
{
  const c = boot();
  c.loHelp();
  const el = c.els['lo-help'];
  ok('開く', !!el);
  ok('🔴 いちばん厚いのは下書きの話（ここが一番聞かれる）', el.innerHTML.indexOf('反映するまでクラウドに上がりません') >= 0);
  ok('色の見方が入っている', el.innerHTML.indexOf('仮押さえ') >= 0 && el.innerHTML.indexOf('返却済み') >= 0);
  ok('当日かぶりの決めごとが入っている', el.innerHTML.indexOf('同じ日') >= 0);
  ok('二重貸しの「2」の説明が入っている', el.innerHTML.indexOf('二重貸し') >= 0);
  ok('返却済みは消せないと書いてある', el.innerHTML.indexOf('消せません') >= 0);
  ok('検索とスライダーの説明が入っている', el.innerHTML.indexOf('列を絞る') >= 0 && el.innerHTML.indexOf('端末に覚えます') >= 0);
  c.loHelpClose();
  ok('閉じる', !c.els['lo-help']);
  c.loHelp(); c.loHelp();
  ok('🔴 二度押しで2枚重ならない', c.bodyKids.filter(n => n.id === 'lo-help').length === 1);
}

/* ================================================================= */
console.log('\n── ⑥ ＋追加（いまある入口を集めただけ）──');
{
  const c = boot();
  c.loAddMenu(null);
  const h = c.els['lo-hpop'].innerHTML;
  ok('予約以外で貸出がある', h.indexOf('loAddManualBlock') >= 0);
  ok('仮押さえがある', h.indexOf('loAddHold') >= 0);
  ok('緊急車両がある', h.indexOf('loAddEmergency') >= 0);
  ok('🔴 整備の枠はまだ出さない（決めごとが済んでいない）', h.indexOf('整備') < 0);
}

/* ================================================================= */
console.log('\n── ⑦ 画面（畳めているか）──');
{
  const idx = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  const head = idx.slice(idx.indexOf('id="view-loaner"'), idx.indexOf('id="loaner-scroll"'));
  ok('🔴 チップが並びっぱなしの形をやめた', head.indexOf('lo-filters') < 0);
  ok('🔴 出しっぱなしのチップが0個', (head.match(/class="lo-filter"/g) || []).length === 0);
  ok('検索BOXがある', head.indexOf('id="lo-q"') >= 0);
  ok('絞込ボタンがある', head.indexOf('loFilterMenu') >= 0 && head.indexOf('id="lo-fcnt"') >= 0);
  ok('並べ替えボタンがある', head.indexOf('loSortMenu') >= 0);
  ok('🔴 縮尺は段ではなくスライダー', head.indexOf('type="range"') >= 0 && head.indexOf('id="lo-zoom"') >= 0);
  ok('🔴 スライダーの左は小さい A ひとつだけ（AAの両端にしない）', (head.match(/lo-zoom-a/g) || []).length === 1);
  ok('？ボタンがある', head.indexOf('loHelp()') >= 0);
  ok('＋追加がある', head.indexOf('loAddMenu') >= 0);
  ok('今日へ・車両管理へは残っている', head.indexOf('loScrollToday()') >= 0 && head.indexOf("showView('fleet')") >= 0);

  const css = fs.readFileSync(path.join(process.cwd(), 'css', 'polish.css'), 'utf8');
  ok('🔴 1日の高さが縮尺の変数から引かれている', /\.lo-cell\{[^}]*var\(--lo-dayh/.test(css));
  ok('🔴 札の高さも縮尺について伸び縮みする', /\.lo-badge\.full\{[^}]*var\(--lo-dayh/.test(css));
  ok('🔴 当日かぶりのくり抜きも縮尺に合わせてある', /lo-handoff\{[^}]*var\(--lo-dayh/.test(css));
  ok('探し当てた札を光らせる見た目がある', css.indexOf('.lo-badge.lo-hit') >= 0);
  ok('スライダーの見た目がある', css.indexOf('.lo-zoom input[type=range]') >= 0);
  ok('簡易マニュアルの見た目がある', css.indexOf('.lo-help-ov') >= 0);
}

console.log('\n─────────────────────────────');
if (BREAK) {
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  if (fail > 0) { console.log('🟢 正しい＝壊したら赤くなった（この見張りは効いている）'); process.exit(0); }
  console.log('🔴 まずい＝壊したのに全部緑のまま。見張りが効いていない'); process.exit(1);
}
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
