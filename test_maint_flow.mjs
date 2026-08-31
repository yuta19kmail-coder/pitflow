/* PitFlow ── 🔧 **整備の枠：日の候補 → 当日ビュー → 入庫 → 完TEL**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた確定（2026-08-31）
     🗣「7〜9／12〜16 であれば
     　7 当日ビュー→未入庫→消滅／8 同／9 同／10 なし／11 なし／12 同／13 当日ビュー→入庫→タスクボードに」
     🗣「いや、場合によってはその作業が長引く事もあるから、**関TEL関門を通った時**にして」（残りの候補を消すタイミング）
     🗣「基本は既存の物を出来る限り代車に寄せるレベルでいいよ。名前 自社代車 車種名 作業バッチ 車検・代車」

   ◎ここで見張ること
     🔴 ① 日ビューから候補を置ける／確定にできる／取り消せる
     🔴 ② 候補は**1日ずつ**当日ビューに出る（枠まるごとではない）
     🔴🔴 ③ **未入庫に溜まらない**（やらなかった日はカードにならない）
     🔴 ④ 「今日はやらない」は**その日だけ**消える（他の候補日は残る）
     🔴 ⑤ 入庫＝社内区分「代車」のカードが**点検待ち**で起きる／ナンバーでお客様を引く
     🔴🔴 ⑥ 残りの候補が消えるのは **完TELを通った時**（入庫時ではない）
     🔴 ⑦ 本黄色は**実際に合わせて縮む／伸びる**

   ◎使い方
       node test_maint_flow.mjs
       node test_maint_flow.mjs --break=1  … 入庫した時に残りの候補を消す → ⑥が赤
       node test_maint_flow.mjs --break=2  … 「今日はやらない」を無視する → ④が赤
       node test_maint_flow.mjs --break=3  … 選択肢の窓が範囲を受けない形に戻す → ⑧が赤
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
const tick = () => new Promise(r => setTimeout(r, 0));
function bend(name, src) {
  if (BREAK === '1' && name === 'maint-pit.js')
    return src.replace("    r.stage = 'fixed'; r.started = true;",
      "    r.stage = 'fixed'; r.started = true;\n    w.state.fleetEvents = arr(w.state.fleetEvents).filter(function(x){ return !(x.maint && x.groupId === r.groupId && x.id !== r.id); });");
  if (BREAK === '3' && name === 'maint-pit.js')
    return src.replace('w.flMaintCellMenu = function(vehId, ds, to){', 'w.flMaintCellMenu = function(vehId, ds){')
              .replace('to = to || ds;', '');
  if (BREAK === '2' && name === 'maint-pit.js')
    return src.replace("      if (arr(r.skipped).indexOf(ds) >= 0) return;      /* 「今日はやらない」を押した日 */", "");
  return src;
}

/* 今日を固定できないので、**今日を起点に**見本を作る */
const T = new Date(); T.setHours(0,0,0,0);
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const add = (n) => { const x = new Date(T); x.setDate(x.getDate()+n); return ymd(x); };
const TODAY = ymd(T);

const 代車 = [
  { id:'l1', name:'代車1', number:1, model:'タント', plate:'野田 580 あ 12-34', maker:'ダイハツ', shakenDate:add(45) },
  { id:'l2', name:'代車2', number:2, model:'アクア', plate:'', shakenDate:add(300) }
];
const 顧客 = [
  { id:'cu1', name:'小林モータース株式会社', kana:'', contacts:[{tel:'047-000-1111',primary:true}],
    vehicles:[ { id:'v1', plate:'野田 580 あ 12-34', maker:'ダイハツ', car:'タント', karteNo:'K-777' } ] }
];
/* 候補2本＝今日〜+2 と +5〜+7（飛び地） */
const 枠 = [
  { id:'mc1', vehicleId:'l1', maint:true, work:'shaken', stage:'candidate', groupId:'g1',
    fromDate:TODAY, toDate:add(2), skipped:[] },
  { id:'mc2', vehicleId:'l1', maint:true, work:'shaken', stage:'candidate', groupId:'g1',
    fromDate:add(5), toDate:add(7), skipped:[] }
];

function node0(){
  const n = { innerHTML:'', style:{setProperty(){}}, classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){}, children:[], value:'', checked:false,
    insertAdjacentHTML(){}, querySelector(){return null;}, querySelectorAll(){return [];},
    getBoundingClientRect(){return {top:0,bottom:0,left:0,right:0};}, contains(){return false;}, scrollIntoView(){} };
  return n;
}
function boot(form, answer){
  const els = {}; const asked = [];
  const ctx = {
    console, setTimeout, clearTimeout, Promise, Date, Math, JSON, String, Number, Array, Object, isFinite, RegExp,
    localStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    document:{ body:{ appendChild(n){ if (n.id) els[n.id] = n; } },
      documentElement:{ clientWidth:1280, style:{setProperty(){}} },
      getElementById(id){ if (form && (id in form)) return { value:form[id], checked:!!form['__chk_'+id], style:{} }; return els[id] || null; },
      createElement:()=>node0(), querySelector(){return null;}, querySelectorAll(){return [];},
      addEventListener(){}, removeEventListener(){} },
    innerHeight:900,
    state:{ loaners:JSON.parse(JSON.stringify(代車)), companyCars:[],
            customers:JSON.parse(JSON.stringify(顧客)),
            loanerAssigns:[], fleetEvents:JSON.parse(JSON.stringify(枠)),
            cards:[], staff:[], settings:{},
            workTypes:[{id:'shaken',label:'車検',color:'#ef4444'},{id:'12pt',label:'12点',color:'#f97316'},
                       {id:'general',label:'一般',color:'#84cc16'},{id:'bp',label:'B.P',color:'#a855f7'}] },
    PitDB:{ saved:0, save(){ this.saved++; } },
    pitAlert:(m,o)=>{ asked.push({kind:'alert',code:(o||{}).code}); },
    pitAsk:(m,o)=>{ asked.push({kind:'ask',title:(o||{}).title,detail:(o||{}).detail}); return Promise.resolve(answer !== false); },
    pitLog(){}, pitToast(){}, renderFleet(){}, renderToday(){}, showView(){}, logFlow(){}, statusLabel(){ return ''; },
    ymd:(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
    addDays:(d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  };
  ctx.window = ctx; ctx.asked = asked; ctx.els = els;
  vm.createContext(ctx);
  vm.runInContext(JS('loaner-free.js'), ctx, { filename:'loaner-free.js' });
  vm.runInContext(JS('loaner.js'), ctx, { filename:'loaner.js' });
  vm.runInContext(JS('intern-pit.js'), ctx, { filename:'intern-pit.js' });
  vm.runInContext(bend('maint-pit.js', JS('maint-pit.js')), ctx, { filename:'maint-pit.js' });
  return ctx;
}
const rec = (c, id) => c.state.fleetEvents.filter(x => x.id === id)[0];
const cands = (c) => c.state.fleetEvents.filter(x => x.maint && (x.stage||'candidate') === 'candidate');

/* ================================================================= */
console.log('\n── ① 日ビューから候補を置く／確定にする／取り消す ──');
{
  const c = boot({ 'mbp-from':add(10), 'mbp-to':add(12) });
  const before = cands(c).length;
  c.flMaintPlaceSave('g1', 'l1', 'candidate', '', 'shaken');
  ok('🔴 候補が1本増える', cands(c).length === before + 1);
  const nu = c.state.fleetEvents.filter(x => String(x.id).indexOf('mc') === 0 && x.groupId === 'g1' && x.fromDate === add(10))[0];
  ok('同じ整備予定に束ねられる', !!nu && nu.groupId === 'g1');
  ok('🔴 作業タイプは呼ぶ側から渡る（引き直して黙って「一般」に落ちない）', nu.work === 'shaken');
  /* 🔴 渡ってこず、引き直しても分からない時は**黙って作らない**（一般に落とさない） */
  const c9 = boot({ 'mbp-from':add(10), 'mbp-to':add(12) });
  c9.flMaintPlaceSave('gzz', 'l1', 'candidate', '', '');
  ok('🔴 作業が分からない時は止まる', c9.asked.length === 1 && c9.asked[0].code === 'PF-3056');
  ok('その時は1本も作らない', c9.state.fleetEvents.filter(x => String(x.id).indexOf('mc') === 0 && x.groupId === 'gzz').length === 0);
  ok('保存が呼ばれる', c.PitDB.saved === 1);
  c.flMaintFix(nu.id);
  ok('🔴 確定にできる', rec(c, nu.id).stage === 'fixed');
  c.flMaintDelRec(nu.id);
  ok('🔴 取り消せる', !rec(c, nu.id));
}
{
  const c = boot({ 'mbp-from':add(12), 'mbp-to':add(10) });
  c.flMaintPlaceSave('g1', 'l1', 'candidate', '', 'shaken');
  ok('「まで」が前なら止まる', c.asked.length === 1 && c.asked[0].code === 'PF-3054');
}
{
  const c = boot();
  ok('🔴 その車のその月の予定が選べる', c.pitMaintPlansFor('l1', add(1)).length > 0);
  ok('関係ない車には出さない', c.pitMaintPlansFor('l2', add(1)).length === 0);
}

console.log('\n── ②③④ 当日ビュー（1日ずつ・未入庫に溜まらない・今日はやらない）──');
{
  const c = boot();
  ok('🔴 今日ぶんが1件出る', c.pitMaintToday(TODAY).length === 1);
  ok('明日も出る（枠の2日目）', c.pitMaintToday(add(1)).length === 1);
  ok('あさっても出る（枠の3日目）', c.pitMaintToday(add(2)).length === 1);
  ok('🔴 枠と枠のあいだ（+3・+4）は出ない', c.pitMaintToday(add(3)).length === 0 && c.pitMaintToday(add(4)).length === 0);
  ok('次の枠（+5）でまた出る', c.pitMaintToday(add(5)).length === 1);
  ok('枠の外（+8）は出ない', c.pitMaintToday(add(8)).length === 0);
  ok('🔴🔴 出しても未入庫に溜まらない（カードは1枚もできていない）', c.state.cards.length === 0);
  /* 「今日はやらない」＝その日だけ */
  c.pitMaintSkip('mc1', TODAY);
  ok('🔴 今日は消える', c.pitMaintToday(TODAY).length === 0);
  ok('🔴 明日は残る（その日ぶんだけ）', c.pitMaintToday(add(1)).length === 1);
  ok('🔴 別の枠（+5）も残る', c.pitMaintToday(add(5)).length === 1);
  ok('枠そのものは消えていない', !!rec(c, 'mc1'));
  ok('押した日が記録に残る', rec(c, 'mc1').skipped.join() === TODAY);
  /* 見た目＝既存のカードに寄せる（ゆうた指定の3つ） */
  const h = c.pitMaintTodayHtml(add(1));
  ok('🔴 名前＝自社代車', h.indexOf('自社代車') >= 0);
  ok('🔴 車種名が出る', h.indexOf('タント') >= 0);
  ok('🔴 作業バッジ＝車検・代車', h.indexOf('>車検<') >= 0 && h.indexOf('代車') >= 0);
  ok('既存のカードと同じ骨格を使っている', /today-row/.test(h) && /tr-main/.test(h) && /tr-plateline/.test(h));
  ok('ナンバーも出る', h.indexOf('野田 580 あ 12-34') >= 0);
  ok('月の目標は当日ビューに出さない',
     boot().pitMaintToday(TODAY).every(x => (x.rec.stage || '') !== 'month'));
}

console.log('\n── ⑤ 入庫＝社内区分「代車」のカードが点検待ちで起きる ──');
{
  const c = boot();
  c.pitMaintIntake('mc1');
  await tick();
  const card = c.state.cards[0];
  ok('🔴 押す前に1回聞く', c.asked.length === 1 && c.asked[0].kind === 'ask');
  ok('🔴 カードが1枚起きる', c.state.cards.length === 1);
  ok('🔴🔴 社内区分は「代車」（売上・突合から外れる受け皿＝v2.6.0）', card.internKind === 'loanercar');
  ok('🔴 いきなり点検待ち（＝タスクボード）', card.status === 'check');
  ok('実入庫日が入る', card.actualInAt === TODAY);
  ok('作業タイプが渡る（変換表なし）', card.workType === 'shaken');
  ok('🔴 ナンバーでお客様を引けている', card.customer === '小林モータース株式会社' && card.customerId === 'cu1');
  ok('カルテNoも拾う', card.karteNo === 'K-777');
  ok('車種・ナンバーが入る', card.car === 'タント' && card.plate === '野田 580 あ 12-34');
  ok('🔴 代車マスタに結び先を覚える', c.state.loaners[0].custId === 'cu1' && c.state.loaners[0].custVehId === 'v1');
  ok('🔴 枠が「確定・作業中」になる', rec(c,'mc1').stage === 'fixed' && rec(c,'mc1').started === true);
  ok('カードと枠がつながっている', card.maintGroupId === 'g1' && card.maintRecId === 'mc1');
  ok('🔴 金額は持たない（社内車両）', !('amountFinal' in card) || !card.amountFinal);
  ok('🔴🔴 入庫しただけでは残りの候補を消さない（消すのは完TEL）', !!rec(c, 'mc2'));
  ok('当日ビューからは消える（確定になったので入庫待ちではない）',
     c.pitMaintToday(TODAY).filter(x => x.rec.id === 'mc1' && !x.fixed).length === 0);
}
{
  const c = boot(null, false);   /* 「いいえ」 */
  c.pitMaintIntake('mc1');
  await tick();
  ok('🔴 「いいえ」なら1文字も動かない', c.state.cards.length === 0 && rec(c,'mc1').stage === 'candidate');
}

console.log('\n── ⑥⑦ 完TELを通った時 ──');
{
  const c = boot();
  c.pitMaintIntake('mc1');
  await tick();
  const card = c.state.cards[0];
  ok('この時点ではまだ候補が残っている', cands(c).length === 1);
  /* 完TEL関門＝社内車両の実績化（intern-pit.js）。そこから pitMaintOnComplete が呼ばれる */
  c.pitInternReturn(card);
  await tick();
  ok('🔴 実績になる', card.status === 'returned');
  ok('🔴🔴 残りの候補がまとめて消える', cands(c).length === 0);
  ok('やった枠は残る（記録）', !!rec(c,'mc1') && rec(c,'mc1').done === true);
  ok('🔴 本黄色は実際に合わせる（返した日まで）', rec(c,'mc1').toDate === (card.returnDate || card.completedAt));
  ok('始まりは入庫した日のまま', rec(c,'mc1').fromDate === TODAY);
}
{
  /* 完TELの関門は1か所だけ＝ここに条件を書き写していない */
  const src = JS('intern-pit.js');
  ok('🔴 完TEL関門から1か所だけ呼んでいる',
     (src.match(/if \(w\.pitMaintOnComplete\) w\.pitMaintOnComplete\(c\);/g) || []).length === 1);
  ok('関門の側に判断を書き写していない', !/groupId/.test(src));
}

console.log('\n── ⑧ 画面のつなぎ ──');
{
  const fleet = JS('fleet.js'), today = JS('today.js');
  ok('日ビューのセルが選択肢を出す', /flMaintCellMenu\(/.test(fleet));
  ok('🔴 いままでの「予定を追加」も残っている', /flOpenEventModal\(/.test(JS('maint-pit.js')));
  ok('日ビューに整備の枠のチップが出る', /fl-mn/.test(fleet) && /flMaintChip\(/.test(fleet));
  ok('当日ビューが自社代車を出す', /pitMaintTodayHtml/.test(today));
  ok('🔴 当日ビューの件数にも入る', /maintN/.test(today));
  ok('🔴 翌日ビューには出さない（今日だけ）', /isToday\) \? pitMaintTodayHtml/.test(today));
  /* 🗣「候補日はドラッグでまとまった日を選べるように」＝範囲で受ける */
  const mp = bend('maint-pit.js', JS('maint-pit.js'));
  ok('🔴 選択肢の窓が範囲（から〜まで）を受ける', /flMaintCellMenu = function\(vehId, ds, to\)/.test(mp));
  ok('🔴 なぞった範囲がそのまま窓に入る', /dsTo \|\| ds/.test(mp));
  ok('クリックだけなら1日ぶん', /to = to \|\| ds;/.test(mp));
}

console.log('\n─────────────────────────────');
if (BREAK) {
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  if (fail > 0) { console.log('🟢 正しい＝壊したら赤くなった（この見張りは効いている）'); process.exit(0); }
  console.log('🔴 まずい＝壊したのに全部緑のまま。見張りが効いていない'); process.exit(1);
}
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
