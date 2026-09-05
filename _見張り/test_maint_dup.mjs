// ============================================================
// test_maint_dup.mjs ― 代車・社用車の整備が当日ビューで2枚出る／入庫の道が2本ある
//   PitFlow v2.63.0 ／ ゆうた報告 2026-09-05
//
//   🗣「U47540 自社代車 アクア青 松戸 500 す 8230　9/5〜9/25 で確定　詳細見れない
//   　　この予約が当日ビューで2枚出てる件を調査して」
//   🗣「とにかく **代車、社用車の入庫予定は前回決めたフローをきっちり通る**ようにしてほしい」
//
//   ◎起きていたこと
//     整備の枠を確定すると `reserveDate` に**期間の初日**が入る（maint-pit.js の `_fixSpan`）。
//     ＝ その初日だけ、**代車の整備行（期間で出る）と ふつうの入庫行（reserveDate で出る）が2枚**並ぶ。
//     🔴 MHS は前から二重を避けていた（`intake.indexOf(x.card) >= 0`）。PitFlow だけ抜けていた。
//
//   ここで固めている決めごと
//     🔴 当日ビューに出るのは **代車の整備行 1本**（ゆうた確定）
//     🔴 外す判定は **`pitCardMaint`（整備カードかどうか）1本**。
//        「その日に代車行として出るか」で外すと、**「今日はやらない」で見送った日にふつうの行が復活する**
//     🔴 入庫の道も1本。ふつうの入庫（当日ビュー・カードの入庫ボタン・右クリック・入庫中で保存）から
//        整備カードが入ると、確認・期間合わせ・紐づけたお客様の写し・記録の言葉が**まるごと抜ける**
//     🔴 代車の整備行から**カードが開ける**（確定すると未定タブの代車BOXからも消えるため、道が無かった）
//
//   使い方（サーバーもブラウザも要らない）
//     node _見張り/test_maint_dup.mjs
//     node _見張り/test_maint_dup.mjs --break=1 … 当日ビューが整備カードを外さない   → ①が赤
//     node _見張り/test_maint_dup.mjs --break=2 … 関門が整備カードを素通しする       → ③が赤
//     node _見張り/test_maint_dup.mjs --break=3 … 当日ビューが関門を呼ばない         → ④が赤
//     node _見張り/test_maint_dup.mjs --break=4 … 見送った日をふつうの行で出す作りに → ①が赤
// ============================================================
import fs from 'fs';
import vm from 'vm';

const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').split('=')[1] || '';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + JSON.stringify(x) : '')); }
};
const JS = (f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');

function bend(name, src) {
  if (name === 'today.js' && BREAK === '1') return src.replace(" && !_maintCard(c))", ")");
  if (name === 'today.js' && BREAK === '3') return src.replace('if (window.pitMaintIntakeGuard && pitMaintIntakeGuard(c)) return;', '');
  if (name === 'today.js' && BREAK === '4') return src.replace('!_maintCard(c)', '!(window.pitMaintSpanOn && pitMaintSpanOn(c, dayStr))');
  if (name === 'maint-pit.js' && BREAK === '2') return src.replace(
    "if (!(w.pitCardMaint && w.pitCardMaint(c))) return false;   /* 整備カードでなければ素通し */",
    "return false;");
  return src;
}

/* ── U47540 の形（ゆうた報告そのまま）────────────────────────── */
const CARD = {
  id:'mcard_u47540', resNo:'U47540', internKind:'loanercar', status:'reserved',
  customer:'自社代車', car:'アクア', maker:'トヨタ', plate:'松戸 500 す 8230',
  boardId:'default', workType:'shaken', maintVehId:'l9', maintYm:'2026-09',
  maintSpans:[{ sid:'sp1', from:'2026-09-05', to:'2026-09-25' }],
  maintFixSid:'sp1', maintSkipped:[], reserveDate:'2026-09-05', reserveTime:'', intakeTbd:false
};
const NORMAL = {
  id:'ncard1', resNo:'A11111', status:'reserved', customer:'山田 太郎', car:'ノート',
  boardId:'default', workType:'shaken', reserveDate:'2026-09-05', reserveTime:'09:00'
};

/* ============================================================
   ① 当日ビューの入庫リスト
   ------------------------------------------------------------
   🔴 **本物の today.js のソースから、入庫リストの式をそのまま切り出して走らせる。**
      「そう書いてあるか」ではなく「その式が何を返すか」を見る（2026-09-04 の教訓）。
   ============================================================ */
const TODAY_SRC = bend('today.js', JS('today.js'));
function intakeExpr(){
  const m = TODAY_SRC.match(/const intake = state\.cards\s*\n\s*\.filter\(c => ([^\n]*?)\)\s*\n/);
  return m ? m[1] : null;
}
function inLeftExpr(){
  const m = TODAY_SRC.match(/const inLeft\s*= state\.cards\.filter\(c => ([^\n]*?)\)\.length;/);
  return m ? m[1] : null;
}
const box = {};
box.window = box; box.globalThis = box; box.console = { log(){}, warn(){}, error(){} };
vm.createContext(box);
vm.runInContext(JS('pit-share.js'), box);
box.PitShare.use({ divisions:()=>[], estAmount:()=>0, teamKey:()=>'default' });
vm.runInContext(JS('intern-pit.js'), box);
box.state = { cards:[CARD, NORMAL], loaners:[{ id:'l9', name:'代車9', model:'アクア', color:'青', plate:'松戸 500 す 8230' }],
              companyCars:[], workTypes:[] };
/* today.js が使っている名前を、同じ中身で用意する */
box._maintCard = (c) => !!(box.pitCardMaint && box.pitCardMaint(c));
const runIntake = (ds) => {
  const e = intakeExpr(); if (!e) return null;
  return vm.runInContext('state.cards.filter(c => ' + e + ').length', Object.assign(box, { dayStr: ds }) && box);
};
function count(expr, ds){
  if (!expr) return null;
  box.dayStr = ds;
  return vm.runInContext('state.cards.filter(c => ' + expr + ').length', box);
}

console.log('── ① 当日ビューに2枚出さない（U47540 の形）──');
{
  const eI = intakeExpr(), eL = inLeftExpr();
  ok('入庫リストの式が読めた', !!eI, eI);
  ok('残（inLeft）の式が読めた', !!eL, eL);
  const maint05 = box.pitMaintCardsOn(box.state.cards, '2026-09-05').length;
  const in05    = count(eI, '2026-09-05');
  ok('9/5＝代車の整備行が1本出る', maint05 === 1, maint05);
  ok('🔴🔴 9/5＝ふつうの入庫行には出さない（＝合計1枚）', in05 === 1 && (maint05 + in05) === 2,
     { 代車行:maint05, 入庫行:in05, ふつうの車:1 });
  /* ⚠ 入庫行の1件は「山田 太郎」＝ふつうの車。整備カードが混じっていないことを名前で見る */
  box.dayStr = '2026-09-05';
  const names = vm.runInContext('state.cards.filter(c => ' + eI + ').map(c => c.resNo)', box);
  ok('🔴 入庫行に U47540 が居ない', names.indexOf('U47540') < 0, names);
  const maint10 = box.pitMaintCardsOn(box.state.cards, '2026-09-10').length;
  ok('9/10（期間の中日）も代車の整備行が1本', maint10 === 1, maint10);
  ok('9/26（期間の外）は1本も出ない', box.pitMaintCardsOn(box.state.cards, '2026-09-26').length === 0);
  const left05 = count(eL, '2026-09-05');
  ok('🔴 残の数にも整備カードを数えない（代車ぶんと二重になる）', left05 === 1, left05);
}

console.log('── ② 「今日はやらない」で見送った日に、ふつうの行として復活しない ──');
{
  const keep = CARD.maintSkipped;
  CARD.maintSkipped = ['2026-09-05'];
  const maint = box.pitMaintCardsOn(box.state.cards, '2026-09-05').length;
  const inn   = count(intakeExpr(), '2026-09-05');
  ok('代車の整備行は消える', maint === 0, maint);
  ok('🔴🔴 ふつうの入庫行に化けない（合計0枚のまま）', inn === 1, { 入庫行:inn, ふつうの車:1 });
  CARD.maintSkipped = keep;
}

/* ============================================================
   ③ 入庫の関門（本物の maint-pit.js を走らせる）
   ============================================================ */
function node0(){
  return { innerHTML:'', style:{setProperty(){}}, classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){}, children:[], value:'', checked:false,
    insertAdjacentHTML(){}, querySelector(){return null;}, querySelectorAll(){return [];},
    getBoundingClientRect(){return {top:0,bottom:0,left:0,right:0};}, contains(){return false;}, scrollIntoView(){} };
}
function bootMaint(card){
  const calls = [];
  const ctx = {
    console:{log(){},warn(){},error(){}}, setTimeout, clearTimeout, Promise, Date, Math, JSON, String, Number, Array, Object, isFinite, RegExp,
    localStorage:{ getItem(){return null;}, setItem(){}, removeItem(){} },
    document:{ body:{appendChild(){}}, head:node0(), documentElement:{clientWidth:1280,style:{setProperty(){}}},
      getElementById(){ return null; }, createElement:()=>node0(), querySelector(){return null;},
      querySelectorAll(){return [];}, addEventListener(){}, removeEventListener(){} },
    state:{ loaners:[{ id:'l9', name:'代車9', model:'アクア', plate:'松戸 500 す 8230' }], companyCars:[],
            customers:[], loanerAssigns:[], fleetEvents:[], cards:[JSON.parse(JSON.stringify(card))],
            staff:[], settings:{}, workTypes:[{id:'shaken',label:'車検',color:'#ef4444'}] },
    PitDB:{ save(){} },
    pitAlert:(m,o)=>calls.push({ kind:'alert', code:(o||{}).code }),
    pitAsk:(m,o)=>{ calls.push({ kind:'ask' }); return Promise.resolve(false); },
    pitLog(){}, pitToast(){}, renderFleet(){}, renderToday(){}, showView(){}, logFlow(){}, renderSettings(){},
    openDetail:(id)=>calls.push({ kind:'openDetail', id:id }),
    ymd:(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
    addDays:(d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  };
  ctx.window = ctx; ctx.calls = calls;
  vm.createContext(ctx);
  vm.runInContext(JS('pit-share.js'), ctx);
  ctx.PitShare.use({ divisions:()=>[], estAmount:()=>0, teamKey:()=>'default' });
  vm.runInContext(JS('loaner-free.js'), ctx);
  vm.runInContext(JS('fleet-link.js'), ctx);
  vm.runInContext(JS('loaner.js'), ctx);
  vm.runInContext(JS('intern-pit.js'), ctx);
  vm.runInContext(bend('maint-pit.js', JS('maint-pit.js')), ctx);
  return ctx;
}

console.log('── ③ 入庫の関門＝代車の道しか通さない ──');
{
  const c = bootMaint(CARD);
  const card = c.state.cards[0];
  /* pitMaintIntake が呼ばれたかを見たいので、その場で差し替える */
  let routed = '';
  c.pitMaintIntake = function(recId){ routed = recId; };
  ok('🔴🔴 整備カードは関門が引き取る', c.pitMaintIntakeGuard(card) === true);
  ok('🔴 代車の入庫（pitMaintIntake）へ回している', routed === 'mcard_u47540#sp1', routed);
  ok('ふつうの車は素通しする', c.pitMaintIntakeGuard(c2card()) === false);
  function c2card(){ return JSON.parse(JSON.stringify(NORMAL)); }
  /* もう入庫している整備カード＝ふつうの道でよい */
  const done = JSON.parse(JSON.stringify(CARD)); done.status = 'check'; done.actualInAt = '2026-09-05';
  ok('もう入庫している整備カードは引き取らない', c.pitMaintIntakeGuard(done) === false);
  /* 日が決まっていない（候補が1本も無い）＝止めて案内する */
  const tbd = JSON.parse(JSON.stringify(CARD)); tbd.maintSpans = []; tbd.maintFixSid = ''; tbd.intakeTbd = true;
  routed = '';
  ok('🔴 日が決まっていなければ止める', c.pitMaintIntakeGuard(tbd) === true && routed === '', routed);
  ok('止めた理由に番号が付いている（PF-3066）',
     c.calls.filter(x => x.kind === 'alert' && x.code === 'PF-3066').length === 1, c.calls);
}

console.log('── ④ ふつうの入庫の道が、全部この関門を通る ──');
{
  const td = TODAY_SRC, cd = JS('card-detail.js'), cv = JS('card-view.js'), cm = JS('ctxmenu-pit.js');
  ok('🔴 当日ビューの入庫が関門を通る（カードの入庫ボタン・右クリックもここを通る）',
     /window\.pitTodayCheckIn = function[\s\S]{0,600}?pitMaintIntakeGuard\(c\)\) return;/.test(td));
  ok('🔴 カード編集の「入庫中で保存」も関門を通る', /_pitSaveInWorkGo[\s\S]{0,900}?pitMaintIntakeGuard\(c\)/.test(cd));
  ok('カードの入庫ボタンは pitTodayCheckIn を呼んでいる（別の道を作っていない）',
     /pitTodayCheckIn\(id\)/.test(cv) && !/status\s*=\s*'check'/.test(cv));
  ok('右クリックも pitTodayCheckIn を呼んでいる', /pitTodayCheckIn\(c\.id\)/.test(cm));
  const mp = bend('maint-pit.js', JS('maint-pit.js'));
  ok('🔴 関門は maint-pit.js の1本（条件を写していない）',
     /w\.pitMaintIntakeGuard = function/.test(mp) &&
     !/pitCardMaint\(c\) && c\.status === 'reserved'/.test(td));
  /* 🔴 status を 'check' にする所は3つだけ（当日ビュー・入庫中で保存・代車の入庫） */
  const doors = ['today.js','card-detail.js','maint-pit.js'].filter(f => /status\s*=\s*'check'/.test(JS(f)));
  ok('🔴 点検待ちへ進める所は3か所のまま（増えていない）', doors.length === 3, doors);
}

console.log('── ⑤ 代車の整備行から、カードが開ける ──');
{
  const mp = JS('maint-pit.js');
  ok('「詳細を見る」がカードへ向いている', /pitMaintDetailFromToday\(/.test(mp));
  ok('🔴 開くのは openDetail 1本（窓を組み立てていない）', /w\.openDetail\(hit\.card\.id\)/.test(mp));
  ok('車両管理へは別のボタンになっている', /車両管理で見る/.test(mp) && /pitMaintGotoFromToday\(/.test(mp));
  const c = bootMaint(CARD);
  c.pitMaintDetailFromToday('mcard_u47540#sp1');
  ok('🔴 実際に押すとカードが開く',
     c.calls.filter(x => x.kind === 'openDetail' && x.id === 'mcard_u47540').length === 1, c.calls);
  c.pitMaintDetailFromToday('mcard_u47540#nope');
  ok('見つからない時は黙らずに番号を出す',
     c.calls.filter(x => x.kind === 'alert' && x.code === 'PF-3067').length === 1, c.calls);
}

console.log('── ⑥ MHS と揃っている（どちらも2枚出さない）──');
{
  const mhs = fs.readFileSync(new URL('../../../MHS/index.html', import.meta.url), 'utf8');
  ok('MHS は前から二重を避けている', /intake\.indexOf\(x\.card\) >= 0/.test(mhs));
  ok('MHS も判断を写さず PitFlow の物差しを借りている', /pitMaintCardsOn/.test(mhs) && !/maintSpans/.test(mhs));
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（' + pass + '件 緑）' : '✅ ぜんぶ緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
