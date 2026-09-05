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
       node test_maint_flow.mjs --break=4  … 入庫しても当日ビューから消さない（v2.48.0 前の姿）→ ⑨が赤
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
  /* ⚠ v2.49.0 保存先がカードに変わったので、**壊す場所も付け替えた。**
     わざと壊すモードが空振りすると、見張りが効いていないのに緑に見える（いちばん危ない状態）。 */
  if (BREAK === '1' && name === 'maint-pit.js')
    return src.replace("    c.maintFixSid = sp.sid;\n    sp.from = td;",
      "    c.maintSpans = [sp];\n    c.maintFixSid = sp.sid;\n    sp.from = td;");   /* 入庫の時点で残りを消す */
  if (BREAK === '2' && name === 'pit-share.js')
    return src.replace("if ((c.maintSkipped || []).indexOf(ds) >= 0) return null;", "");
  if (BREAK === '3' && name === 'maint-pit.js')
    return src.replace('w.flMaintCellMenu = function(vehId, ds, to){', 'w.flMaintCellMenu = function(vehId, ds){')
              .replace('to = to || ds;', '');
  /* ⚠ v2.49.0 「入庫したら消える」は **status が進むこと**で起きるようになった
     （前は自前の `started` の印を見ていた）。だから壊す場所もそこ。 */
  if (BREAK === '4' && name === 'pit-share.js')
    return src.replace("if (c.status !== 'reserved') return null;      /* 入庫済み以降はここには出ない */", "")
              .replace("if (c.actualInAt) return null;", "");
  return src;
}

/* 今日を固定できないので、**今日を起点に**見本を作る */
const T = new Date(); T.setHours(0,0,0,0);
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const add = (n) => { const x = new Date(T); x.setDate(x.getDate()+n); return ymd(x); };
const TODAY = ymd(T);

const 代車 = [
  /* 🔗 v2.62.0 custId / custVehId ＝**車両管理で人が設定した紐づけ**。
     ⚠ ここが無い代車は、ナンバーが同じでもお客様が付かない（黙って引き当てるのをやめたため）。 */
  { id:'l1', name:'代車1', number:1, model:'タント', plate:'野田 580 あ 12-34', maker:'ダイハツ', shakenDate:add(45),
    custId:'cu1', custVehId:'v1' },
  { id:'l2', name:'代車2', number:2, model:'アクア', plate:'', shakenDate:add(300) }
];
const 顧客 = [
  { id:'cu1', name:'小林モータース株式会社', kana:'', contacts:[{tel:'047-000-1111',primary:true}],
    vehicles:[ { id:'v1', plate:'野田 580 あ 12-34', maker:'ダイハツ', car:'タント', karteNo:'K-777' } ] }
];
/* 🔧🔧 v2.49.0 候補2本＝今日〜+2 と +5〜+7（飛び地）。**カードは1枚**。 */
const 整備カード = [
  { id:'mcard1', internKind:'loanercar', status:'reserved', intakeTbd:true, customer:'自社代車',
    boardId:'default', car:'タント', maker:'ダイハツ', plate:'野田 580 あ 12-34',
    maintVehId:'l1', maintYm:TODAY.slice(0,7), workType:'shaken',
    maintFixSid:'', maintSkipped:[],
    maintSpans:[ { sid:'sp1', from:TODAY, to:add(2) }, { sid:'sp2', from:add(5), to:add(7) } ] }
];
/* 旧テストが使っていた「レコードid」に当たるもの＝カードid#候補の鍵 */
const R1 = 'mcard1#sp1', R2 = 'mcard1#sp2';

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
    document:{ body:{ appendChild(n){ if (n.id) els[n.id] = n; } }, head:node0(),
      documentElement:{ clientWidth:1280, style:{setProperty(){}} },
      getElementById(id){ if (form && (id in form)) return { value:form[id], checked:!!form['__chk_'+id], style:{} }; return els[id] || null; },
      createElement:()=>node0(), querySelector(){return null;}, querySelectorAll(){return [];},
      addEventListener(){}, removeEventListener(){} },
    innerHeight:900,
    state:{ loaners:JSON.parse(JSON.stringify(代車)), companyCars:[],
            customers:JSON.parse(JSON.stringify(顧客)),
            loanerAssigns:[], fleetEvents:[],
            cards:JSON.parse(JSON.stringify(整備カード)), staff:[], settings:{},
            workTypes:[{id:'shaken',label:'車検',color:'#ef4444'},{id:'12pt',label:'12点',color:'#f97316'},
                       {id:'general',label:'一般',color:'#84cc16'},{id:'bp',label:'B.P',color:'#a855f7'}] },
    PitDB:{ saved:0, save(){ this.saved++; } },
    pitAlert:(m,o)=>{ asked.push({kind:'alert',code:(o||{}).code}); },
    pitAsk:(m,o)=>{ asked.push({kind:'ask',title:(o||{}).title,detail:(o||{}).detail}); return Promise.resolve(answer !== false); },
    pitLog(){}, pitToast(){}, renderFleet(){}, renderToday(){}, showView(){}, logFlow(){}, statusLabel(){ return ''; },
    renderSettings(){},   /* ⚠ maint-pit.js が読まれる時に居ないと、引っ越しの入口が掛からない */
    ymd:(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
    addDays:(d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  };
  ctx.window = ctx; ctx.asked = asked; ctx.els = els;
  vm.createContext(ctx);
  vm.runInContext(bend('pit-share.js', JS('pit-share.js')), ctx, { filename:'pit-share.js' });
  vm.runInContext(JS('loaner-free.js'), ctx, { filename:'loaner-free.js' });
  vm.runInContext(JS('fleet-link.js'), ctx, { filename:'fleet-link.js' });   /* 🔗 v2.62.0 紐づけの物差し */
  vm.runInContext(JS('loaner.js'), ctx, { filename:'loaner.js' });
  vm.runInContext(JS('intern-pit.js'), ctx, { filename:'intern-pit.js' });
  vm.runInContext(bend('maint-pit.js', JS('maint-pit.js')), ctx, { filename:'maint-pit.js' });
  return ctx;
}
const mcard = (c) => c.state.cards.filter(x => x.id === 'mcard1')[0];
const rec  = (c, id) => c.pitMaintRecs ? c.pitMaintRecs().filter(x => x.id === id)[0] : null;
const spans = (c) => (mcard(c) ? mcard(c).maintSpans : []);
const cands = (c) => spans(c).filter(x => x.sid !== (mcard(c).maintFixSid || ''));

/* ================================================================= */
console.log('\n── ① 日ビューから候補を置く／確定にする／取り消す ──');
{
  const c = boot({ 'mbp-from':add(10), 'mbp-to':add(12) });
  const before = spans(c).length, cardsBefore = c.state.cards.length;
  c.flMaintPlaceSave('mcard1', 'l1', 'candidate', '', 'shaken', TODAY.slice(0,7));
  ok('🔴 候補が1本増える', spans(c).length === before + 1);
  ok('🔴🔴 カードは増えない（1作業＝1カード・予約カレンダーが代車で埋まらない）',
     c.state.cards.length === cardsBefore, 'カード ' + c.state.cards.length + ' 枚');
  const nu = spans(c).filter(x => x.from === add(10))[0];
  ok('同じカードの候補として束ねられる', !!nu && !!nu.sid);
  ok('🔴 候補は並び順ではなく鍵（sid）で指す（1本消しても他がずれない）',
     spans(c).every(x => x.sid) && new Set(spans(c).map(x => x.sid)).size === spans(c).length);
  ok('🔴 作業タイプは呼ぶ側から渡る（引き直して黙って「一般」に落ちない）', mcard(c).workType === 'shaken');
  /* 🔴 渡ってこず、引き直しても分からない時は**黙って作らない**（一般に落とさない） */
  const c9 = boot({ 'mbp-from':add(10), 'mbp-to':add(12) });
  const n9 = c9.state.cards.length;
  c9.flMaintPlaceSave('', 'l1', 'candidate', '', '', '');
  ok('🔴 作業が分からない時は止まる', c9.asked.length === 1 && c9.asked[0].code === 'PF-3056');
  ok('その時はカードも候補も作らない', c9.state.cards.length === n9);
  /* 🔴 まだカードが無い車に置いたら、その時に1枚生まれる（＝予約番号もここで振る） */
  const c8 = boot({ 'mbp-from':add(10), 'mbp-to':add(12) });
  c8.flMaintPlaceSave('', 'l2', 'candidate', '', '12pt', TODAY.slice(0,7));
  const born = c8.state.cards.filter(x => x.maintVehId === 'l2')[0];
  ok('🔴 まだカードが無ければ、候補を置いた時に1枚生まれる', !!born && born.maintSpans.length === 1);
  ok('🔴 生まれた時に予約番号を振る（ゆうた確定）', !!born && typeof born.resNo === 'string');
  ok('🔴 生まれたカードは未定（予約カレンダーには乗らない）', !!born && born.intakeTbd === true && !born.reserveDate);
  ok('保存が呼ばれる', c.PitDB.saved === 1);
  const nuId = 'mcard1#' + nu.sid;
  c.flMaintFix(nuId);
  ok('🔴 確定にできる', mcard(c).maintFixSid === nu.sid);
  ok('🔴🔴 確定＝ふつうの予約に変わる（reserveDate が入って未定が外れる）',
     mcard(c).reserveDate === add(10) && mcard(c).intakeTbd === false);
  c.flMaintDelRec(nuId);
  ok('🔴 取り消せる', !spans(c).some(x => x.sid === nu.sid));
  ok('🔴 確定を取り消したら未定に戻る（予約カレンダーからも消える）',
     !mcard(c).reserveDate && mcard(c).intakeTbd === true);
  ok('⚠ 最後の1本を取り消してもカードは消さない（消える道を増やさない）', !!mcard(c));
}
{
  const c = boot({ 'mbp-from':add(12), 'mbp-to':add(10) });
  c.flMaintPlaceSave('mcard1', 'l1', 'candidate', '', 'shaken', TODAY.slice(0,7));
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
  ok('🔴🔴 出しても未入庫に溜まらない（カードは1枚のまま・増えない）', c.state.cards.length === 1);
  ok('🔴 そのカードは未定＝予約カレンダーにも乗っていない', mcard(c).intakeTbd === true && !mcard(c).reserveDate);
  /* 「今日はやらない」＝その日だけ */
  c.pitMaintSkip(R1, TODAY);
  ok('🔴 今日は消える', c.pitMaintToday(TODAY).length === 0);
  ok('🔴 明日は残る（その日ぶんだけ）', c.pitMaintToday(add(1)).length === 1);
  ok('🔴 別の枠（+5）も残る', c.pitMaintToday(add(5)).length === 1);
  ok('枠そのものは消えていない', !!rec(c, R1));
  ok('押した日が記録に残る', rec(c, R1).skipped.join() === TODAY);
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
  c.pitMaintIntake(R1);
  await tick();
  const card = c.state.cards[0];
  ok('🔴 押す前に1回聞く', c.asked.length === 1 && c.asked[0].kind === 'ask');
  ok('🔴🔴 カードは**作られない**（もう在るカードの status が進むだけ）',
     c.state.cards.length === 1 && card.id === 'mcard1');
  ok('🔴🔴 社内区分は「代車」（売上・突合から外れる受け皿＝v2.6.0）', card.internKind === 'loanercar');
  ok('🔴 いきなり点検待ち（＝タスクボード）', card.status === 'check');
  ok('実入庫日が入る', card.actualInAt === TODAY);
  ok('作業タイプが渡る（変換表なし）', card.workType === 'shaken');
  /* 🔗 v2.62.0（ゆうた指定 2026-09-05）**ナンバーで引き当てるのをやめた。**
     持ち主が付くのは「車両管理で人が紐づけた代車」だけ。 */
  ok('🔴 紐づけてあるお客様が付く', card.customer === '小林モータース株式会社' && card.customerId === 'cu1');
  ok('カルテNoも拾う', card.karteNo === 'K-777');
  ok('車種・ナンバーが入る', card.car === 'タント' && card.plate === '野田 580 あ 12-34');
  ok('🔴 未定が外れて入庫日が入る（ふつうの車と同じ階段）',
     card.intakeTbd === false && card.reserveDate === TODAY);
  /* 🔴🔴 v2.62.0 **入庫は代車マスタに1文字も書かない。**（結び目を作るのは車両管理の紐づけ欄だけ）
     ⚠ 前は「入庫の瞬間にナンバーで引いて黙って覚える」だった。人が設定していない結び目は、
        間違っていても誰も気づけない／ダブっている時にどちらへ結ぶかが運になる、で外した。 */
  ok('🔴 入庫は代車マスタの紐づけを書き換えない',
     c.state.loaners[0].custId === 'cu1' && c.state.loaners[0].custVehId === 'v1');
  ok('🔴 枠が「確定・作業中」になる', rec(c,R1).stage === 'fixed' && rec(c,R1).started === true);
  ok('🔴 カードと枠は**同じもの**（つなぐ鍵がもう要らない）',
     card.maintVehId === 'l1' && Array.isArray(card.maintSpans));
  ok('🔴 金額は持たない（社内車両）', !('amountFinal' in card) || !card.amountFinal);
  ok('🔴🔴 入庫しただけでは残りの候補を消さない（消すのは完TEL）', !!rec(c, R2));
  ok('当日ビューからは消える（確定になったので入庫待ちではない）',
     c.pitMaintToday(TODAY).filter(x => x.rec.id === R1 && !x.fixed).length === 0);
}
{
  const c = boot(null, false);   /* 「いいえ」 */
  c.pitMaintIntake(R1);
  await tick();
  ok('🔴 「いいえ」なら1文字も動かない',
     mcard(c).status === 'reserved' && !mcard(c).actualInAt && !mcard(c).maintFixSid);
}

console.log('\n── ⑥⑦ 完TELを通った時 ──');
{
  const c = boot();
  c.pitMaintIntake(R1);
  await tick();
  const card = c.state.cards[0];
  ok('この時点ではまだ候補が残っている', cands(c).length === 1);
  /* 完TEL関門＝社内車両の実績化（intern-pit.js）。そこから pitMaintOnComplete が呼ばれる */
  c.pitInternReturn(card);
  await tick();
  ok('🔴 実績になる', card.status === 'returned');
  ok('🔴🔴 残りの候補がまとめて消える', cands(c).length === 0);
  ok('やった枠は残る（記録）', !!rec(c,R1) && rec(c,R1).done === true);
  ok('🔴 本黄色は実際に合わせる（返した日まで）', rec(c,R1).toDate === (card.returnDate || card.completedAt));
  ok('始まりは入庫した日のまま', rec(c,R1).fromDate === TODAY);
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
  /* 🔴 v2.70.0 日ビューの整備の枠は**期間ぜんぶで1本のバー**（.fl-bar3）になった。
     前は「開始日に札＋続きは細い帯（.fl-mn）」で、何本あるか数えられなかった。 */
  ok('日ビューに整備の枠のバーが出る', /fl-bar3/.test(fleet) && /flMaintChip\(/.test(fleet));
  ok('当日ビューが自社代車を出す', /pitMaintTodayHtml/.test(today));
  ok('🔴 当日ビューの件数にも入る', /maintN/.test(today));
  ok('🔴 翌日ビューには出さない（今日だけ）', /isToday\) \? pitMaintTodayHtml/.test(today));
  /* 🗣「候補日はドラッグでまとまった日を選べるように」＝範囲で受ける */
  const mp = bend('maint-pit.js', JS('maint-pit.js'));
  ok('🔴 選択肢の窓が範囲（から〜まで）を受ける', /flMaintCellMenu = function\(vehId, ds, to\)/.test(mp));
  ok('🔴 なぞった範囲がそのまま窓に入る', /dsTo \|\| ds/.test(mp));
  ok('クリックだけなら1日ぶん', /to = to \|\| ds;/.test(mp));
}

console.log('\n── ⑨ 入庫したら当日ビューから消える・見た目と窓を本来の形に（v2.48.0 ゆうた指摘）──');
{
  const c = boot();
  const before = c.pitMaintToday(TODAY);
  ok('入庫する前は当日ビューに出る', before.length === 1 && before[0].rec.id === R1);
  c.pitMaintIntake(R1);
  await tick();
  ok('入庫でカードが1枚できた', c.state.cards.length === 1);
  ok('🔴🔴 入庫したら当日ビューから消える', c.pitMaintToday(TODAY).length === 0,
     '残り ' + c.pitMaintToday(TODAY).length + ' 件');
  /* 🔴 前は行が残っていたので、もう一度押せてカードが2枚できた */
  const n0 = c.asked.length;
  c.pitMaintIntake(R1); await tick();
  ok('🔴🔴 もう一度押してもカードは増えない（二重入庫できない）', c.state.cards.length === 1,
     'カード ' + c.state.cards.length + ' 枚');
  ok('🔴 行を隠すだけでなく、実行する所（pitMaintIntake）でも止めている',
     c.asked.slice(n0).some(a => a.kind === 'alert' && a.code === 'PF-3058'));
  ok('⚠ 飛び地の次の候補はちゃんと残る（消したのは今日の分だけ）',
     spans(c).some(x => x.sid === 'sp2'));
  const h = c.pitMaintTodayHtml(TODAY);
  ok('入庫したあとは行そのものが出ない', h === '');

  const c2 = boot();
  const h2 = c2.pitMaintTodayHtml(TODAY);
  /* 🗣「網掛けがはいった変な表示」＝ふつうの入庫行と同じ骨格にする */
  ok('🔴 ふつうの入庫行と同じ骨格（tr-time / tr-front / tr-main / tr-tags）',
     /tr-time/.test(h2) && /tr-front/.test(h2) && /tr-main/.test(h2) && /tr-tags/.test(h2));
  ok('🔴 タグは3スロット（ふつうの行と同じ）', (h2.match(/tr-tag-slot/g) || []).length === 3);
  ok('🔴 当日ビューに無い入れ物（tr-side）を使っていない', h2.indexOf('tr-side') < 0);
  /* 🔴 意味の違うタグを借りない（前は「確定」に預かりの緑＝tag-drop-drop を借りていた） */
  ok('🔴 受付タイプ（預かり／待ち／当日）のタグを借りていない', !/tag-drop-/.test(h2));
  ok('候補は「候補」と文字で言う', /候補 /.test(h2));
  const c3 = boot(); mcard(c3).maintFixSid = 'sp1';
  ok('確定は「で確定」と文字で言う（タグではなく文字）', /で確定/.test(c3.pitMaintTodayHtml(TODAY)));
  const css = fs.readFileSync(path.join(process.cwd(), 'css', 'polish.css'), 'utf8');
  ok('🔴 網掛け（repeating-linear-gradient）をやめた',
     !/\.today-row\.tod-maint\{[^}]*repeating-linear-gradient/.test(css));
  ok('⚠ 色は JS から --pit-maint で配る（CSS と JS で別々に綴らない）',
     /PIT_MAINT_COLOR/.test(JS('maint-pit.js')) && /--pit-maint/.test(css));

  /* 🗣「POPアップの画面も自前出し」＝当日ビュー共通のシートに乗せる */
  const mp = bend('maint-pit.js', JS('maint-pit.js'));
  const tap = mp.slice(mp.indexOf('w.pitMaintTodayTap'), mp.indexOf('w.pitMaintGotoFromToday'));
  ok('🔴🔴 当日ビュー共通のシート（pitTodaySheet）を通す', /pitTodaySheet\(/.test(tap));
  ok('🔴 代車カレンダー用の自前ポップ（lo-bpop）はもう出さない', tap.indexOf('lo-bpop') < 0);
  ok('🔴 シートの殻は today.js の1本', /w(indow)?\.pitTodaySheet\s*=\s*function/.test(JS('today.js')));
  ok('⚠ ふつうの行の窓（pitTodayTap）も同じ殻を使っている（形が2つに割れていない）',
     /ta-sheet/.test(JS('today.js')));
  ok('主ボタンは「入庫済みにする」（ふつうの車と同じ言葉）', /入庫済みにする/.test(tap));
  ok('「今日はやらない」は未入庫に溜めないと書いてある', /未入庫には溜めません/.test(tap));
}

console.log('\n── ⑩ カードに引っ越した（v2.49.0）・未定BOX・MHS連動 ──');
{
  const c = boot();
  /* 🔴 保存先がカードになった＝fleetEvents に整備の枠を書く所がもう無い */
  const mp = bend('maint-pit.js', JS('maint-pit.js'));
  ok('🔴🔴 整備の枠を fleetEvents に書く所がもう無い', !/state\.fleetEvents\.push/.test(mp));
  ok('🔴 loaner-free.js も fleetEvents の maint を拾わない',
     /if \(e\.maint\) return;/.test(JS('loaner-free.js')));
  /* 🔴 未定タブに「代車・自社車両」BOX がある＝隠す例外ではなく振り分け */
  const und = JS('undetermined.js');
  ok('🔴 未定タブに「代車・自社車両」BOX がある', /代車・自社車両/.test(und));
  ok('🔴 ふつうの未定BOXからは外れる（振り分け）', /!_intern\(c\)/.test(und));
  ok('🔴 振り分けの物差しは pitCardIntern 1本（新しい隠しフラグを作っていない）',
     /pitCardIntern/.test(und));
  ok('BOXのボタンは「日を決める」（候補が飛び地なので日付ピッカー1つでは決められない）',
     /日を決める/.test(und));
  /* 🔴 確定日を過ぎたら未定へ戻る（ゆうた確定「落ちずに未定に戻る」） */
  const ov = JS('overdue-pit.js');
  ok('🔴🔴 確定日を過ぎた代車は未入庫ではなく「未定」へ戻す', /未定へ戻す/.test(ov));
  ok('⚠ 自動でやったことも記録に残す（v2.22.0 の決めごと）',
     /未定へ戻す\(c, td\)/.test(ov) && /代車の整備を未定へ戻した（自動）/.test(ov));
  ok('⚠ 実入庫日がある車は動かさない関門を通っている（v2.22.0）',
     /if \(!pitIntakeOverdue\(c, td\)\) return;/.test(ov));
  /* 🔴 MHS は PitFlow と同じ物差しを借りる（写しを作らない） */
  const mhs = fs.readFileSync(path.join(process.cwd(), '..', '..', 'MHS', 'index.html'), 'utf8');
  ok('🔴🔴 MHS の Today ボードが代車の整備を出す', /pitMaintCardsOn/.test(mhs));
  ok('🔴 MHS は判断を写さず PitFlow の物差しを借りる（条件を書いていない）',
     !/maintSpans/.test(mhs));
  ok('⚠ MHS は物差しが届いていなければ何も足さない',
     /window\.pitMaintCardsOn \? window\.pitMaintCardsOn\(all, bStr\) : \[\]/.test(mhs));
  ok('⚠ 確定して reserveDate が入ったものを二重に出さない', /intake\.indexOf\(x\.card\) >= 0/.test(mhs));
  /* 🔴 引っ越しは人が押した時だけ・元を消さない */
  ok('🔴 引っ越しは自動で走らない（設定のボタンから）', /pitMaintMigrateGo/.test(mp));
  ok('🔴 引っ越しても元のデータは消さない（印を付けるだけ）',
     /e\.migrated = true/.test(mp) && !/fleetEvents = arr\(w\.state\.fleetEvents\)\.filter/.test(mp));
  c.state.fleetEvents.push({ id:'old1', vehicleId:'l1', maint:true, work:'shaken', stage:'candidate',
                             groupId:'gOld', fromDate:add(20), toDate:add(22), skipped:[] });
  const n0 = c.state.cards.length;
  const r = c.pitMaintMigrate();
  ok('🔴 引っ越すとカードが1枚できる', r.cards === 1 && c.state.cards.length === n0 + 1);
  ok('🔴 元のレコードは残る（済みの印だけ）',
     c.state.fleetEvents.filter(x => x.id === 'old1')[0].migrated === true);
  ok('2回押しても増えない（済みの印を見ている）', c.pitMaintMigrate().cards === 0);
}

console.log('\n── ⑪ 引っ越しの入口は必ず何か出す（v2.49.1 ゆうた報告「これがでないよ」）──');
{
  /* 🔴 0件で箱ごと消すと「済んでいる」と「読み込めていない」の区別がつかない。
     ＝ 押す人は「出ないんだけど」としか言えなくなる。**必ず3つの顔のどれかを出す。** */
  const mkHost = () => ({ id:'view-settings-body', kids:[], innerHTML:'', textContent:'',
    style:{setProperty(){}}, classList:{add(){},remove(){},contains(){return false;}},
    addEventListener(){}, appendChild(n){ this.kids.push(n); }, removeChild(){}, remove(){},
    parentNode:null, querySelector(){return null;}, querySelectorAll(){return []; } });
  function settingsBox(fleetEvents, cards){
    const host = mkHost();
    const c = boot();
    c.document.getElementById = (id) => (id === 'view-settings-body' ? host : null);
    c.document.createElement = () => mkHost();
    c.state.fleetEvents = fleetEvents; c.state.cards = cards;
    c.renderSettings();
    return host.kids.length ? String(host.kids[0].innerHTML) : '';
  }
  const 旧 = [{ id:'m1', vehicleId:'l1', maint:true, work:'shaken', stage:'candidate',
                groupId:'g1', fromDate:add(20), toDate:add(22) }];
  const 済 = [Object.assign({}, 旧[0], { migrated:true })];
  const カ = [{ id:'k1', internKind:'loanercar', status:'reserved', intakeTbd:true,
               maintVehId:'l1', maintYm:TODAY.slice(0,7), workType:'shaken',
               maintSpans:[{ sid:'k', from:add(20), to:add(22) }] }];
  ok('🔴 引っ越すものがある → ボタンが出る', /pitMaintMigrateGo/.test(settingsBox(旧, [])));
  ok('🔴 引っ越し済み → 済んだと言う（黙って消えない）', /引っ越し済み/.test(settingsBox(済, カ)));
  ok('🔴 前の形が1件も無い → そう言う', /1件も見つかりません/.test(settingsBox([], カ)));
  ok('🔴🔴 どちらも0件でも黙らない（何が起きているか言う）',
     /可能性があります/.test(settingsBox([], [])) && /pit-mig-n">0</.test(settingsBox([], [])));
  ok('⚠ どの場合でも箱は必ず1つ出る（出ない＝この版が読み込まれていない、と分かる）',
     [旧, 済, [], []].every((f, i) => settingsBox(f, i === 0 ? [] : カ).length > 0));
  /* 🔴🔴 v2.49.2 読み終わる前に「無い」と言わない（v1.2.1「読む前に書かない」と同じ考え方） */
  {
    const host = mkHost();
    const c = boot();
    c.document.getElementById = (id) => (id === 'view-settings-body' ? host : null);
    c.document.createElement = () => mkHost();
    c.PIT_CLOUD = true; c.PitDB._loaded = false;
    c.state.fleetEvents = []; c.state.cards = [];
    c.renderSettings();
    const h = host.kids.length ? String(host.kids[0].innerHTML) : '';
    ok('🔴🔴 読み終わる前は「1件も見つかりません」と言わない',
       /読み終わっていません/.test(h) && !/1件も見つかりません/.test(h));
  }
  /* ⚠ 他の機能のCSSを借りない（借りると、あちらが出ていない時に裸の文字になる） */
  const mp = bend('maint-pit.js', JS('maint-pit.js'));
  ok('🔴 見た目を自分で持っている（blank-cards の CSS を借りていない）',
     /pit-mig-box/.test(mp) && !/className = 'pit-blank-box'/.test(mp)
     && !/class="pit-blank-box"/.test(mp));
  ok('⚠ 掛け直しは掛かったら止まる（掛かったあとも待ち続けない）',
     /if \(w\.renderSettings\.__pitMaintMig\) return;/.test(mp));
}

console.log('\n─────────────────────────────');
if (BREAK) {
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  if (fail > 0) { console.log('🟢 正しい＝壊したら赤くなった（この見張りは効いている）'); process.exit(0); }
  console.log('🔴 まずい＝壊したのに全部緑のまま。見張りが効いていない'); process.exit(1);
}
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
