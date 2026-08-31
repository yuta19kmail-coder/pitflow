/* PitFlow ── 🔧 **整備の枠**（代車自身の車検・点検・修理／ブラウザは使わない）
   ===================================================================
   ◎ゆうた確定（2026-08-31）
     🗣「Aという代車の車検が10月です → 結局予定が詰まってるし、緊急で出さなきゃならない場合もあるしで、
     　4〜6／12〜16／22〜24 が空いてるからここのどこかで車検して！ みたいなスケジュールになる事が多い。
     　だから黄色の枠でとっておいて、そこから実際に作業する場合はタスクボードにカードとして入庫する」
     🗣「車検は満了日から2ヵ月前からだから、満了日の前2月分にも管理の予定バッチを入れてほしい」
     🗣（満了超過について）「**警告だけで実行部分は全部要らない。
     　どんなにあっても、もともと生命線だから落とすことはない**」

   ◎ここで見張ること（この機能でいちばん危ないのは「どこまで塞ぐか」）
     🔴 ① 3つの顔が返る（月の目標＝計算／日の候補＝保存／確定＝保存）
     🔴 ② **候補は塞がない・確定だけ塞ぐ**（C案）
     🔴 ③ **案内（最短入庫日）は候補も避ける**＝自動で約束する側だけ遠慮する
     🔴🔴 ④ **満了を過ぎても貸出を止めない**（生命線・ゆうた指定）
     🔴 ⑤ 月の目標は**保存しない**（開いただけでクラウドに書かない）
     🔴 ⑥ 代車自身の予定（車検入庫の青帯）と**混ざらない**

   ◎使い方
       node test_maint.mjs
       node test_maint.mjs --break=1  … 候補も塞ぐようにする   → ②③が赤くなるのが正しい
       node test_maint.mjs --break=2  … 満了超過で貸せなくする → ④が赤くなるのが正しい
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
function bend(name, src) {
  if (BREAK === '1' && name === 'loaner-free.js')
    return src.replace("function _maintBusy(it) { return it && it.stage === 'fixed'; }",
                       "function _maintBusy(it) { return !!it; }");
  if (BREAK === '2' && name === 'loaner-free.js')
    return src.replace("    if (l.retired) return false;",
                       "    if (l.retired) return false;\n    if (l.shakenDate && l.shakenDate < '2026-09-01') return false;");
  return src;
}

const TODAY = '2026-09-01';
const 代車 = [
  { id:'l1', name:'代車1', number:1, model:'タント',   category:'kei',    shakenDate:'2026-10-31' },
  { id:'l2', name:'代車2', number:2, model:'アクア',   category:'normal', shakenDate:'2027-03-20' },
  { id:'l3', name:'代車3', number:3, model:'ハイゼット', category:'commercial', shakenDate:'2026-08-20' }  /* 満了超過 */
];
/* 🔧 整備の枠は fleetEvents に `maint:true` で入れる（箱を増やさない） */
const 枠 = [
  { id:'m1', vehicleId:'l1', maint:true, work:'shaken', stage:'candidate', groupId:'g1',
    fromDate:'2026-10-04', toDate:'2026-10-06', label:'車検の候補' },
  { id:'m2', vehicleId:'l1', maint:true, work:'shaken', stage:'candidate', groupId:'g1',
    fromDate:'2026-10-12', toDate:'2026-10-16', label:'車検の候補', skipped:['2026-10-12'] },
  { id:'m3', vehicleId:'l2', maint:true, work:'fix', stage:'fixed', groupId:'g2', urgent:true,
    fromDate:'2026-09-02', toDate:'2026-09-03', label:'修理（確定）' }
];
const 予定 = [
  { id:'e1', vehicleId:'l1', type:'shakenIn', label:'車検入庫', fromDate:'2026-12-01', toDate:'2026-12-02' }
];

function node0(){
  const n = { innerHTML:'', style:{ setProperty(){} }, classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){}, children:[],
    insertAdjacentHTML(_w,h){ n.innerHTML += h; }, querySelector(){ return null; }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { top:0, bottom:0, left:0, right:0 }; }, contains(){ return false; } };
  return n;
}
function boot(extra){
  const ctx = {
    console, setTimeout:(f)=>{ try{ f(); }catch(e){} }, clearTimeout, Promise, Date, Math, JSON, String, Number, Array, Object, isFinite,
    localStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    document:{ body:node0(), documentElement:{ clientWidth:1280, style:{ setProperty(){} } },
      getElementById(){ return null; }, createElement(){ return node0(); },
      querySelector(){ return null; }, querySelectorAll(){ return []; }, addEventListener(){}, removeEventListener(){} },
    innerHeight:900,
    state:{ loaners:JSON.parse(JSON.stringify(代車)), loanerAssigns:[],
            fleetEvents:JSON.parse(JSON.stringify(枠.concat(予定, extra || []))),
            companyCars:[], cards:[], customers:[], staff:[], settings:{} },
    PitDB:{ saved:0, save(){ this.saved++; } }, pitAlert(){}, pitAsk(){ return Promise.resolve(true); }, pitLog(){},
    ymd:(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
    addDays:(d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(bend('loaner-free.js', JS('loaner-free.js')), ctx, { filename:'loaner-free.js' });
  vm.runInContext(JS('fleet.js'), ctx, { filename:'fleet.js' });
  vm.runInContext(JS('loaner.js'), ctx, { filename:'loaner.js' });
  return ctx;
}
const L = (c, id) => c.state.loaners.find(x => x.id === id);

/* ================================================================= */
console.log('\n── ① 整備の枠が返る ──');
{
  const c = boot();
  const d = c.pitLoanerDay('l1', '2026-10-05');
  ok('🔴 候補が返る', d.maints.length === 1 && d.maints[0].stage === 'candidate');
  ok('種類は maint（予定とは別）', d.maints[0].kind === 'maint');
  ok('作業タイプが分かる', d.maints[0].work === 'shaken');
  ok('同じ整備予定どうしが束ねられる', d.maints[0].groupId === 'g1');
  const d0 = c.pitLoanerDay('l1', '2026-10-04'), d2 = c.pitLoanerDay('l1', '2026-10-06');
  ok('初日が分かる', d0.maints[0].isStart === true && d0.maints[0].isEnd === false);
  ok('最終日が分かる', d2.maints[0].isEnd === true && d2.maints[0].isStart === false);
  ok('途中の日はどちらでもない', d.maints[0].isStart === false && d.maints[0].isEnd === false);
  const f = c.pitLoanerDay('l2', '2026-09-02');
  ok('🔴 確定が返る', f.maints.length === 1 && f.maints[0].stage === 'fixed');
  ok('急ぎの印が付く', f.maints[0].urgent === true);
  ok('「今日はやらない」を押した日が残る', c.pitLoanerDay('l1','2026-10-13').maints[0].skipped.join() === '2026-10-12');
  ok('飛び地は別々に返る（10/4〜6 と 10/12〜16）',
     c.pitLoanerSpan('l1','2026-10-01','2026-10-31',{kinds:['maint']}).length === 2);
  ok('何も無い日は空', c.pitLoanerDay('l1','2026-10-09').maints.length === 0);
}

console.log('\n── ② 候補は塞がない・確定だけ塞ぐ（C案）──');
{
  const c = boot();
  ok('🔴🔴 候補の日は「貸せる」', c.pitLoanerBusyOn(L(c,'l1'), '2026-10-05') === false);
  ok('🔴🔴 確定の日は「貸せない」', c.pitLoanerBusyOn(L(c,'l2'), '2026-09-02') === true);
  ok('候補の日でも空き一覧に残る', c.pitLoanerFreeOn('2026-10-05').some(x => x.id === 'l1'));
  ok('確定の日は空き一覧から外れる', c.pitLoanerFreeOn('2026-09-02').some(x => x.id === 'l2') === false);
  /* 実際に貸すのは自由＝ぶつかり警告も出さない（貸出どうしの重複だけが警告） */
  ok('🔴 候補の上に貸出を入れてもぶつかり扱いにしない', c.pitLoanerConflicts('l1','2026-10-04','2026-10-06').length === 0);
}

console.log('\n── ③ 案内（最短入庫日）は候補も避ける ──');
{
  const c = boot();
  ok('🔴 候補の日は案内で避ける', c.pitLoanerAvoidOn(L(c,'l1'), '2026-10-05') === true);
  ok('🔴 確定の日ももちろん避ける', c.pitLoanerAvoidOn(L(c,'l2'), '2026-09-02') === true);
  ok('何も無い日は避けない', c.pitLoanerAvoidOn(L(c,'l1'), '2026-10-09') === false);
  /* 3台とも候補で埋めたら、案内できる日が無くなる */
  const c2 = boot([
    { id:'m9', vehicleId:'l2', maint:true, work:'shaken', stage:'candidate', groupId:'g9',
      fromDate:'2099-10-01', toDate:'2099-10-31' },
    { id:'m10', vehicleId:'l3', maint:true, work:'shaken', stage:'candidate', groupId:'g10',
      fromDate:'2099-10-01', toDate:'2099-10-31' },
    { id:'m11', vehicleId:'l1', maint:true, work:'shaken', stage:'candidate', groupId:'g11',
      fromDate:'2099-10-01', toDate:'2099-10-31' }
  ]);
  ok('🔴 3台とも候補で埋まったら、1週間の案内は出せない', c2.pitLoanerPlanOk('2099-10-10', null) === false);
  ok('候補の外なら案内できる', c2.pitLoanerPlanOk('2099-11-10', null) === true);
  /* ⚠ ただし「実際に貸せるか」は今までどおり */
  ok('🔴 案内で避けても、実際には貸せるまま', c2.pitLoanerBusyOn(L(c2,'l1'), '2099-10-10') === false);
}

console.log('\n── ④ 満了を過ぎても貸出は止めない（生命線）──');
{
  const c = boot();
  const l3 = L(c, 'l3');   /* 満了 2026-08-20＝過ぎている */
  ok('🔴🔴 満了超過の代車も「貸せる代車」に残る', c.pitLoanerUsable(l3) === true);
  ok('🔴🔴 空き一覧にも出る', c.pitLoanerFreeOn('2026-09-10').some(x => x.id === 'l3'));
  ok('🔴🔴 案内にも出せる', c.pitLoanerPlanOk('2026-09-10', null) === true);
  const p = c.pitLoanerMaintPlans(l3, TODAY).find(x => x.work === 'shaken');
  ok('🔴 そのかわり「満了超過」の印は返す（警告に出す材料）', p && p.overdue === true);
  ok('🔴 車検はスライドしない', p && p.slipped === false);
}

console.log('\n── ⑤ 月の目標は計算（保存しない）──');
{
  const c = boot();
  const before = c.state.fleetEvents.length, saved = c.PitDB.saved;
  const plans = c.pitLoanerMaintPlans(L(c,'l1'), TODAY);
  ok('🔴 レコードが増えない', c.state.fleetEvents.length === before);
  ok('🔴 保存も呼ばれない（開いただけでクラウドに書かない）', c.PitDB.saved === saved);
  const sk = plans.find(x => x.work === 'shaken');
  ok('車検の目標が出る', !!sk && sk.dueDate === '2026-10-31');
  ok('🔴 受けられるのは満了の2ヶ月前から', sk.openFrom === '2026-08-31' && sk.openTo === '2026-10-31');
  ok('🔴🔴 バッジは満了月＋前2ヶ月の3ヶ月（8・9・10月）',
     sk.months.join() === '2026-08,2026-09,2026-10', sk.months);
  ok('いま受けられる期間の中に居る', sk.inWindow === true);
  ok('まだ超過していない', sk.overdue === false);
  const tk = plans.find(x => x.work === '12pt');
  ok('12ヶ月点検の目標も出る', !!tk && !!tk.dueDate);
  ok('12ヶ月点検は1ヶ月ぶん', tk.months.length === 1);
  /* 過ぎた12ヶ月点検は翌月へスライド（回数は数えない＝ゆうた指定） */
  const c2 = boot();
  const late = c2.pitLoanerMaintPlans({ id:'lx', shakenDate:'2027-06-30' }, '2027-01-15').find(x => x.work === '12pt');
  ok('🔴 過ぎた12ヶ月点検は今の月へスライドする', !late || late.slipped === false || late.ym === '2027-01');
  ok('繰り越しの回数は数えていない（そんな項目が無い）', !('slipCount' in (late || {})));
  /* 末日の繰り上がり */
  const e = c.pitLoanerMaintPlans({ id:'ly', shakenDate:'2027-03-31' }, TODAY).find(x => x.work === 'shaken');
  ok('⚠ 3/31 の2ヶ月前は 1/31（勝手に3/3へ繰り上がらない）', e.openFrom === '2027-01-31', e.openFrom);
}

console.log('\n── ⑥ 代車自身の予定（青帯）と混ざらない ──');
{
  const c = boot();
  const d = c.pitLoanerDay('l1', '2026-12-01');
  ok('🔴 車検入庫は event のまま', d.events.length === 1 && d.maints.length === 0);
  ok('色も落ちていない', d.events[0].color === '#ef4444');
  ok('🔴 整備の枠は event に混ざらない', c.pitLoanerDay('l1','2026-10-05').events.length === 0);
  /* 車両管理の月カレンダーは「予定」だけを拾っている＝整備の枠が二重に出ない */
  ok('期間で予定だけ取れる', c.pitLoanerSpan('l1','2026-10-01','2026-12-31',{kinds:['event']}).length === 1);
  ok('期間で整備の枠だけ取れる', c.pitLoanerSpan('l1','2026-10-01','2026-12-31',{kinds:['maint']}).length === 2);
}

console.log('\n─────────────────────────────');
if (BREAK) {
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  if (fail > 0) { console.log('🟢 正しい＝壊したら赤くなった（この見張りは効いている）'); process.exit(0); }
  console.log('🔴 まずい＝壊したのに全部緑のまま。見張りが効いていない'); process.exit(1);
}
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
