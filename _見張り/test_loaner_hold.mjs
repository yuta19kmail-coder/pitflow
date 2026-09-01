/* PitFlow ── 🅿 **仮押さえ**（代車カレンダー・ブラウザは使わない）
   ===================================================================
   ◎ゆうた指定（2026-08-31）
     「空きをクリックorドラッグ → その手前に『仮押さえ』『予約以外で代車を貸出』の2択。
       仮押さえは一言メモをそえて埋めるだけ。カレンダーは色付きの網掛け。
       新規予約などからその部分は埋まっているのと同義。
       メモがカレンダーから直接見れて、クリック→解除→でなくなる」

   ◎ここで見張ること（この機能のいちばん危ない所は「どっちで数えるか」）
     🔴 ① **埋まりとして数える側**（loaner-free.js）＝新規予約・最短入庫日・空きガント
     🔴 ② **貸出として数えない側**＝札／二重貸しの赤／当日かぶりの耳／貸出回数／貸出履歴／データチェック
     🔴 ③ 見た目＝網掛けが出る・`.lo-free` が付かない（＝ドラッグの範囲選択に入らない）・メモが読める
     🔴 ④ 窓＝メモ必須／期間の前後／重複したら1回聞く／直しは増やさず同じ1件を書き換える
     🔴 ⑤ 解除＝その1件だけ消える（他の貸出を巻き込まない）

   ◎使い方
       node test_loaner_hold.mjs            … 全部グリーンになるのが正しい
       node test_loaner_hold.mjs --break=1  … 「札から仮押さえを外す」を壊す → ③が赤くなるのが正しい
       node test_loaner_hold.mjs --break=2  … 「埋まりに数える」を壊す     → ①が赤くなるのが正しい
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

/* わざと壊す（この見張りが本当に効いているかを確かめるため） */
function bend(name, src) {
  if (BREAK === '1' && name === 'loaner.js') {
    /* 仮押さえを札の対象から外すのをやめる＝カレンダーで貸出の札になってしまう */
    return src.replace("return x.loanerId === l.id && !x.hold && x.fromDate <= dStr", "return x.loanerId === l.id && x.fromDate <= dStr");
  }
  if (BREAK === '2' && name === 'loaner-free.js') {
    /* 仮押さえを「埋まり」に数えるのをやめる＝新規予約から空きに見える */
    return src.replace("      if (skip && a.id === skip) return false;\n      return a.loanerId === l.id", "      if (skip && a.id === skip) return false;\n      if (a.hold) return false;\n      return a.loanerId === l.id");
  }
  return src;
}

const 代車 = [
  { id:'l1', name:'代車1', number:1, model:'タント', category:'kei' },
  { id:'l2', name:'代車2', number:2, model:'アクア', category:'normal' },
  { id:'l3', name:'代車3', number:3, model:'MINI',  category:'import' }
];

function boot(assigns, opt) {
  opt = opt || {};
  const form = opt.form || {};
  const asked = [];      // pitAlert / pitAsk の記録
  let askAnswer = opt.askAnswer !== false;

  const node = () => {
    const n = { innerHTML:'', style:{}, dataset:{}, offsetHeight:120,
      classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
      addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){},
      querySelector(){ return null; }, querySelectorAll(){ return []; }, contains(){ return false; } };
    return n;
  };
  const body = node();

  const ctx = {
    console, setTimeout: (f) => { try { f(); } catch (e) {} }, clearTimeout, Promise, Date, Math, JSON, String, Number, Array, Object, isFinite,
    localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
    document: {
      body: body,
      documentElement: { clientWidth: 1280 },
      getElementById(id){ return (id in form) ? { value: form[id], style:{}, focus(){} } : null; },
      querySelector(){ return null; }, querySelectorAll(){ return []; },
      createElement(){ return node(); },
      addEventListener(){}, removeEventListener(){}
    },
    innerHeight: 900,
    state: {
      loaners: JSON.parse(JSON.stringify(opt.loaners || 代車)),
      loanerAssigns: JSON.parse(JSON.stringify(assigns || [])),
      fleetEvents: JSON.parse(JSON.stringify(opt.events || [])),
      cards: JSON.parse(JSON.stringify(opt.cards || [])),
      customers: [], companyCars: [], staff: [], settings: {}
    },
    PitDB: { saved: 0, save(){ this.saved++; } },
    pitAlert: (msg, o) => { asked.push({ kind:'alert', msg, code:(o||{}).code }); },
    pitAsk:   (msg, o) => { asked.push({ kind:'ask', msg, code:(o||{}).code, detail:(o||{}).detail });
                            return Promise.resolve(askAnswer); },
    pitLog: () => {},
    /* アプリ全体で使っている日付の道具（本体は別ファイル。ここは同じ中身の写し） */
    ymd: (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'),
    addDays: (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  };
  ctx.window = ctx;
  ctx.asked = asked;
  ctx.setAsk = (v) => { askAnswer = v; };
  vm.createContext(ctx);
  vm.runInContext(bend('loaner-free.js', JS('loaner-free.js')), ctx, { filename:'loaner-free.js' });
  vm.runInContext(bend('loaner.js',      JS('loaner.js')),      ctx, { filename:'loaner.js' });
  return ctx;
}

/* 見本＝l1 を 8/10〜8/12 仮押さえ／l2 は 8/10〜8/12 に本物の貸出 */
const 仮 = { id:'lh1', loanerId:'l1', cardId:null, hold:true, memo:'車検の代車で押さえ',
             customer:'仮押さえ', purpose:'車検の代車で押さえ', fromDate:'2026-08-10', toDate:'2026-08-12', manual:true };
const 貸 = { id:'la1', loanerId:'l2', cardId:null, customer:'小林', car:'アクア', purpose:'車販・乗り換え',
             fromDate:'2026-08-10', toDate:'2026-08-12', manual:true };

/* ================================================================= */
console.log('\n── ① 仮押さえは「埋まり」として数える（新規予約・最短入庫日が見る物差し）──');
{
  const c = boot([仮, 貸]);
  const l1 = c.state.loaners[0], l2 = c.state.loaners[1];
  ok('🔴 押さえた日はふさがっている', c.pitLoanerBusyOn(l1, '2026-08-11') === true);
  ok('🔴 初日もふさがっている',       c.pitLoanerBusyOn(l1, '2026-08-10') === true);
  ok('🔴 最終日もふさがっている',     c.pitLoanerBusyOn(l1, '2026-08-12') === true);
  ok('前日は空いている',              c.pitLoanerBusyOn(l1, '2026-08-09') === false);
  ok('翌日は空いている',              c.pitLoanerBusyOn(l1, '2026-08-13') === false);
  ok('その日の空き一覧から外れる',    c.pitLoanerFreeOn('2026-08-11').map(x => x.id).join() === 'l3');
  ok('🔴 貸出と同じ扱い（l2 も外れる）', c.pitLoanerFreeOn('2026-08-11').some(x => x.id === 'l2') === false);
  ok('ふさがっている理由を答えられる', (c.pitLoanerBusyWhy(l1, '2026-08-11') || {}).kind === 'assign');
  ok('🔴 それが仮押さえだと分かる',   !!(c.pitLoanerBusyWhy(l1, '2026-08-11') || {}).hold);
  ok('メモも取り出せる',              ((c.pitLoanerBusyWhy(l1, '2026-08-11') || {}).assign || {}).memo === '車検の代車で押さえ');
  ok('🔴 ぶつかり判定にも出る',       c.pitLoanerConflicts('l1', '2026-08-11', '2026-08-14').length === 1);
  ok('当日かぶり（返す日＝次の開始日）は今までどおり通す', c.pitLoanerConflicts('l1', '2026-08-12', '2026-08-14').length === 0);
}
{
  /* 3台とも塞げば「1週間まるごと空く代車」は無い＝最短入庫日が動く側。
     ⚠ 案内の窓（planWindow）は「過ぎた日は押さえられない」ので今日より前まで遡らない
        ＝この見張りは**必ず先の日付**で置く（過去日でやると窓が潰れて必ず ok になる）。 */
  const 先 = (d) => '2099-08-' + d;
  const c = boot([
    { ...仮, id:'lh1', loanerId:'l1', fromDate:先('08'), toDate:先('14') },
    { ...仮, id:'lh2', loanerId:'l2', fromDate:先('08'), toDate:先('14') },
    { ...仮, id:'lh3', loanerId:'l3', fromDate:先('08'), toDate:先('14') }
  ]);
  ok('🔴 3台とも押さえたら、その日から7日連続の空きは無い', c.pitLoanerFreeRun(先('08'), 7) === false);
  ok('押さえた期間を抜ければ空く',                          c.pitLoanerFreeRun(先('15'), 7) === true);
  ok('🔴 案内の窓（作業タイプ未選択＝1週間）も取れない',    c.pitLoanerPlanOk(先('10'), null) === false);
  ok('🔴 案内の窓（預かり2日＝前後1日）も取れない',         c.pitLoanerPlanOk(先('10'), 2) === false);
  ok('押さえた先なら案内できる',                            c.pitLoanerPlanOk(先('16'), 2) === true);
}

/* ================================================================= */
console.log('\n── ② 貸出としては数えない（札・二重貸し・耳）──');
{
  const c = boot([仮, 貸]);
  const h = c._loRenderDays(new Date(2026, 7, 10), 3);
  ok('🔴 網掛けが出ている',            h.indexOf('lo-holdbg') >= 0);
  ok('🔴 仮押さえの日に .lo-free を付けない（ドラッグの範囲選択に入らない）',
     h.indexOf('data-lo="l1"') >= 0 && !/lo-cell lo-free[^"]*"\s*data-lo="l1" data-ld="2026-08-11"/.test(h));
  ok('🔴 メモがカレンダーから直接読める', h.indexOf('車検の代車で押さえ') >= 0);
  ok('メモの札は初日に1枚だけ',        (h.match(/lo-hold-tag/g) || []).length === 1);
  ok('網掛けは押さえた3日ぶん出る',    (h.match(/lo-holdbg/g) || []).length === 3);
  ok('初日と最終日が分かる',           h.indexOf('lo-hold-start') >= 0 && h.indexOf('lo-hold-end') >= 0);
  /* 🔴 ここが「札にしない」の本丸。数で見る＝l2 の貸出1枚だけのはず。
     ⚠ 「lo-badge が有るか」で見ると、l2 の札があるだけで緑になってしまい、見張りにならない。 */
  ok('🔴 札（.lo-badge）は本物の貸出1枚だけ', (h.match(/lo-badge/g) || []).length === 1);
  ok('🔴 仮押さえの列に棒（.lo-bk）を作らない', !/lo-cell lo-bk[^"]*"[^>]*data-lo="l1"/.test(h));
  ok('🔴 メモを札の中に出さない（網掛けの札だけ）', h.split('車検の代車で押さえ').length - 1 === 2);
  ok('🔴 押すと解除の窓が開く',        h.indexOf('loHoldMenu(event') >= 0);
  ok('本物の貸出（l2）は今までどおり札で出る', h.indexOf('lo-badge') >= 0 && h.indexOf('小林') >= 0);
}
{
  /* 同じ代車で「仮押さえ」と「本物の貸出」が重なった時＝二重貸しの赤にはしない */
  const c = boot([仮, { ...貸, id:'la2', loanerId:'l1' }]);
  ok('🔴 二重貸しの赤には数えない',    c._loConflictSet().size === 0);
  const h = c._loRenderDays(new Date(2026, 7, 10), 3);
  ok('🔴 「2」の二重貸し印を出さない', h.indexOf('lo-dupmark') < 0);
  ok('それでも網掛けは重ねて見える',   h.indexOf('lo-holdbg') >= 0);
}
{
  /* 当日かぶりの耳＝返す日と次の開始日が同じ時に出る形。仮押さえでは作らない */
  const c = boot([
    { ...仮, id:'lh1', loanerId:'l1', fromDate:'2026-08-08', toDate:'2026-08-10' },
    { ...貸, id:'la3', loanerId:'l1', fromDate:'2026-08-10', toDate:'2026-08-12' }
  ]);
  const h = c._loRenderDays(new Date(2026, 7, 8), 6);
  ok('🔴 仮押さえの返す日で「耳」を作らない', h.indexOf('lo-handoff') < 0);
}

/* ================================================================= */
console.log('\n── ③ 2択（いきなり貸出の窓を開かない）──');
{
  const c = boot([]);
  ok('2択の窓がある',            typeof c.loPickFree === 'function');
  ok('仮押さえの窓がある',        typeof c.loAddHold === 'function');
  ok('貸出の窓は今までのまま残る', typeof c.loAddManualBlock === 'function');
  /* 出来上がりの HTML は、窓が作る要素の innerHTML を掴んで見る */
  let opened = '';
  const box = [];
  c.document.createElement = () => { const n = { innerHTML:'', style:{}, classList:{ add(){}, remove(){}, contains(){ return false; } },
      addEventListener(){}, appendChild(){}, remove(){}, offsetHeight:100, contains(){ return false; } };
    box.push(n); return n; };
  c.loPickFree('l1', '2026-09-01', '2026-09-03');
  opened = box.map(n => n.innerHTML).join('');
  ok('🔴 「仮押さえ」が出る',                 opened.indexOf('仮押さえ') >= 0);
  ok('🔴 「予約以外で代車を貸出」が出る',     opened.indexOf('予約以外で代車を貸出') >= 0);
  ok('選んだ代車と期間が見出しに出る',        opened.indexOf('タント') >= 0 && opened.indexOf('9/1〜9/3') >= 0);
}

/* ================================================================= */
console.log('\n── ④ 仮押さえの窓（メモ必須・期間・重複したら1回聞く）──');
{
  const c = boot([], { form:{ 'lhd-lo':'l1', 'lhd-memo':'', 'lhd-from':'2026-09-01', 'lhd-to':'2026-09-03' } });
  c.loSaveHold('');
  ok('🔴 メモが空なら止まる',              c.asked.length === 1 && c.asked[0].code === 'PF-3042');
  ok('🔴 空のまま1件も増えない',           c.state.loanerAssigns.length === 0);
}
{
  const c = boot([], { form:{ 'lhd-lo':'l1', 'lhd-memo':'あとで', 'lhd-from':'2026-09-05', 'lhd-to':'2026-09-01' } });
  c.loSaveHold('');
  ok('「まで」が「から」より前なら止まる', c.asked.length === 1 && c.asked[0].code === 'PF-3041');
}
{
  const c = boot([], { form:{ 'lhd-lo':'l1', 'lhd-memo':'車検の代車で押さえ', 'lhd-from':'2026-09-01', 'lhd-to':'2026-09-03' } });
  c.loSaveHold('');
  const a = c.state.loanerAssigns[0];
  ok('🔴 1件だけ増える',        c.state.loanerAssigns.length === 1);
  ok('🔴 仮押さえの印が付く',   !!a.hold);
  ok('メモが入っている',        a.memo === '車検の代車で押さえ');
  ok('代車と期間が入っている',  a.loanerId === 'l1' && a.fromDate === '2026-09-01' && a.toDate === '2026-09-03');
  ok('🔴 お客様は作らない',     a.cardId === null);
  ok('保存が呼ばれている',      c.PitDB.saved === 1);
  ok('確認は聞かれない（重複なし）', c.asked.length === 0);
}
{
  /* すでに貸出が入っている所を押さえようとした＝1回だけ聞く */
  const c = boot([貸], { form:{ 'lhd-lo':'l2', 'lhd-memo':'重ねる', 'lhd-from':'2026-08-11', 'lhd-to':'2026-08-14' } });
  c.loSaveHold('');
  ok('🔴 重複したら聞く',        c.asked.length === 1 && c.asked[0].kind === 'ask' && c.asked[0].code === 'PF-3043');
  ok('相手が誰か出る',           (c.asked[0].detail || '').indexOf('小林') >= 0);
}
{
  /* 仮押さえどうしが重なる時も、名前ではなくメモで知らせる */
  const c = boot([仮], { form:{ 'lhd-lo':'l1', 'lhd-memo':'かさねる', 'lhd-from':'2026-08-11', 'lhd-to':'2026-08-14' } });
  c.loSaveHold('');
  ok('🔴 相手の仮押さえをメモで名指しできる', (c.asked[0].detail || '').indexOf('車検の代車で押さえ') >= 0);
}
{
  /* 代車自身の予定（車検入庫）とぶつかる時も止める */
  const c = boot([], { events:[{ id:'e1', vehicleId:'l1', type:'shaken', label:'車検入庫', fromDate:'2026-09-02', toDate:'2026-09-04' }],
                       form:{ 'lhd-lo':'l1', 'lhd-memo':'押さえ', 'lhd-from':'2026-09-01', 'lhd-to':'2026-09-03' } });
  c.loSaveHold('');
  ok('🔴 代車自身の予定とぶつかったら聞く', c.asked.length === 1 && c.asked[0].code === 'PF-3043');
}
{
  /* 直し＝同じ1件を書き換える（増やさない） */
  const c = boot([仮], { form:{ 'lhd-lo':'l1', 'lhd-memo':'やっぱり洗車で押さえ', 'lhd-from':'2026-08-10', 'lhd-to':'2026-08-14' } });
  c.loSaveHold('lh1');
  ok('🔴 件数は増えない',       c.state.loanerAssigns.length === 1);
  ok('メモが書き換わる',        c.state.loanerAssigns[0].memo === 'やっぱり洗車で押さえ');
  ok('期間が伸びる',            c.state.loanerAssigns[0].toDate === '2026-08-14');
  ok('🔴 自分自身を重複扱いしない', c.asked.length === 0);
}

/* ================================================================= */
console.log('\n── ⑤ 解除（クリック→解除→でなくなる）──');
{
  const c = boot([仮, 貸]);
  c.loReleaseHold('lh1');
  ok('🔴 仮押さえが消える',       c.state.loanerAssigns.filter(a => a.hold).length === 0);
  ok('🔴 本物の貸出は残る',       c.state.loanerAssigns.length === 1 && c.state.loanerAssigns[0].id === 'la1');
  ok('保存が呼ばれている',        c.PitDB.saved === 1);
  const h = c._loRenderDays(new Date(2026, 7, 10), 3);
  ok('カレンダーから網掛けが消える', h.indexOf('lo-holdbg') < 0);
}
{
  const c = boot([仮, 貸]);
  c.loReleaseHold('la1');
  ok('🔴 貸出は「解除」では消せない（仮押さえ専用）', c.state.loanerAssigns.length === 2);
}

/* ================================================================= */
console.log('\n── ⑥ 車両管理・データチェックでは貸出として数えない ──');
{
  const src = JS('fleet.js');
  ok('🔴 貸出回数から仮押さえを外している', /_flUsedCount[\s\S]{0,220}!a\.hold/.test(src));
  ok('🔴 貸出履歴から仮押さえを外している', /_flHistoryHtml[\s\S]{0,220}!a\.hold/.test(src));
  ok('利用カレンダーには「仮押さえ」と出す', src.indexOf("'仮押さえ'") >= 0 || src.indexOf('仮押さえ') >= 0);
}
{
  const src = JS('inspect-rules.js');
  ok('🔴 データチェックの代車ダブりから仮押さえを外している', /if \(a\.hold\) return;/.test(src));
  ok('🔴 相手側にも仮押さえを混ぜない', /!x\.hold/.test(src));
}
{
  const src = JS('card-detail.js');
  ok('🔴 新規予約の空きガントで仮押さえが分かる', src.indexOf('cfs-lg-hold') >= 0);
}
{
  const idx = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  /* ⚠ 版の**数字そのもの**を見張らない（上げるたびにこの見張りが赤くなるだけで、何も守れない）。
     見るのは「3か所そろっているか」と「触ったファイルに ?v= が付いているか」。 */
  const meta = (idx.match(/app-version" content="([\d.]+)"/) || [])[1];
  const 画面 = (idx.match(/class="ver">v([\d.]+)</) || [])[1];
  const ログイン = (idx.match(/class="login-ver">v([\d.]+)</) || [])[1];
  ok('🔴 版が3か所そろっている（メタ・画面・ログイン）', !!meta && meta === 画面 && meta === ログイン, { meta, 画面, ログイン });
  ok('🔴 触ったファイルが ?v= 付きで載っている',
     ['loaner','loaner-free','fleet','card-detail','inspect-rules','errcode-pit']
       .every(f => new RegExp('js/' + f + '\\.js\\?v=\\d+').test(idx))
     && /css\/polish\.css\?v=\d+/.test(idx));
}
{
  const css = fs.readFileSync(path.join(process.cwd(), 'css', 'polish.css'), 'utf8');
  ok('網掛けの見た目がある',  css.indexOf('.lo-holdbg') >= 0 && css.indexOf('repeating-linear-gradient') >= 0);
  ok('メモの札の見た目がある', css.indexOf('.lo-hold-tag') >= 0);
}

/* ================================================================= */
console.log('\n─────────────────────────────');
if (BREAK) {
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  if (fail > 0) { console.log('🟢 正しい＝壊したら赤くなった（この見張りは効いている）'); process.exit(0); }
  console.log('🔴 まずい＝壊したのに全部緑のまま。見張りが効いていない'); process.exit(1);
}
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
