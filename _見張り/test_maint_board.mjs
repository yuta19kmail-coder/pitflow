/* PitFlow ── 🔧 **代車作業予定ボード**（車両管理／ブラウザは使わない）
   ===================================================================
   ◎ゆうた指定（2026-08-31）
     🗣「車両カレンダーと代車一覧の間に **代車作業予定** の欄を追加。ココには直近半年分の予定が入る。
     　また壊れた場合の予定の入力もここから手入力。ここではあくまで **月の目標** として入力。
     　修理の場合は **急ぎ** もあり。今の車両カレンダーに予定が乗る。
     　この時 **枠を抑えてない場合は警告** というか『早くやれよ』の合図がでる」
     🗣「基本的な考え方は各カードに、**飛び地の作業予定とか、各種警告、等がまとまる**イメージ」
     🗣「カレンダーに飛ぶのではなくて、**今も管理カレンダーの月をクリックすると日ビューにかわる仕様、
     　それをそのまま使う**イメージで」

   ◎ここで見張ること
     🔴 ① 1行＝1つの整備予定。飛び地の候補・警告・状態がそこに集まる
     🔴 ② 警告の出し方（今月に入って候補0本／繰り越し／**車検の満了超過は赤で別扱い**）
     🔴 ③ 月カレンダーのバッジ＝**満了月＋その前2ヶ月の3ヶ月**
     🔴 ④ 「日を決める」＝**日ビューに切り替える**（代車カレンダーへ飛ばない）
     🔴 ⑤ 手入力は**月の目標だけ**（日はここで決めない）／メモ必須
     🔴 ⑥ 月の目標は**日の軸に出さない**（縮尺が違うものを日カレンダーに乗せない）
     🔴🔴 ⑦ **満了超過でも貸出は止めない**（このボードは知らせるだけ）

   ◎使い方
       node test_maint_board.mjs
       node test_maint_board.mjs --break=1  … 候補0本でも警告を出さない → ②が赤
       node test_maint_board.mjs --break=2  … バッジを満了月だけにする   → ③が赤
       node test_maint_board.mjs --break=3  … 元のバッジを月カレンダーに戻す・なぞりを外す
                                             ・「日を決める」の右寄せを外す → ⑧-2 が赤
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
  if (BREAK === '1' && name === 'maint-pit.js')
    return src.replace("else if (!live.length && p.inWindow){", "else if (false){");
  if (BREAK === '3' && name === 'fleet.js')
    return src.replace('/* ① 3ヶ月ぶち抜きのバー（車検） */', "inner += '<span class=\"fl-bdg shaken\">車検</span>';\n      /* ① 3ヶ月ぶち抜きのバー（車検） */")
              .replace('if (_flMode === \'day\') _flBindDayDrag();', '/* なぞりを外した */;');
  if (BREAK === '3' && name === 'polish.css')
    return src.replace('.mb-act{ grid-column:3; justify-self:end;', '.mb-act{');
  if (BREAK === '2' && name === 'loaner-free.js')
    return src.replace("months: [_ymAdd(_ym(v.shakenDate), -2), _ymAdd(_ym(v.shakenDate), -1), _ym(v.shakenDate)],",
                       "months: [_ym(v.shakenDate)],");
  return src;
}

const TODAY = '2026-09-10';
const 代車 = [
  { id:'l1', name:'代車1', number:1, model:'タント',   shakenDate:'2026-10-31' },   /* 候補あり */
  { id:'l2', name:'代車2', number:2, model:'ヤリス',   shakenDate:'2026-09-30' },   /* 今月・候補0本＝警告 */
  { id:'l3', name:'代車3', number:3, model:'ハイゼット', shakenDate:'2026-08-20' },   /* 満了超過＝赤 */
  { id:'l4', name:'代車4', number:4, model:'ノート',   shakenDate:'2028-05-10' }    /* まだ先 */
];
const 社用車 = [ { id:'c1', name:'ハイエース', model:'ハイエース', shakenDate:'2026-10-15' } ];
/* 🔧🔧 v2.49.0 整備の枠は**ふつうの予約カード**（1作業1枚・候補は maintSpans の配列） */
const 保存 = [
  /* 代車自身の予定（青帯）＝混ざってはいけない。ここだけ fleetEvents に残る */
  { id:'e1', vehicleId:'l1', type:'shakenIn', label:'車検入庫', fromDate:'2026-12-01', toDate:'2026-12-02' }
];
const 整備カード = [
  /* 車検の候補が飛び地で2本＝**カードは1枚** */
  { id:'mcA', internKind:'loanercar', status:'reserved', intakeTbd:true, customer:'自社代車',
    maintVehId:'l1', maintYm:'2026-10', workType:'shaken', maintFixSid:'', maintSkipped:[],
    maintSpans:[ { sid:'a1', from:'2026-10-04', to:'2026-10-06' },
                 { sid:'a2', from:'2026-10-12', to:'2026-10-16' } ] },
  /* 手で入れた修理の月の目標（急ぎ）＝候補がまだ1本も無いカード */
  { id:'mcC', internKind:'loanercar', status:'reserved', intakeTbd:true, customer:'自社代車',
    maintVehId:'l2', maintYm:'2026-09', workType:'general', urgent:true, memo:'エアコンが効かない',
    maintFixSid:'', maintSkipped:[], maintSpans:[] }
];

function node0(){
  const n = { innerHTML:'', style:{ setProperty(){} }, classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){}, children:[], checked:false, value:'',
    insertAdjacentHTML(_w,h){ n.innerHTML += h; }, querySelector(){ return null; }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { top:0, bottom:0, left:0, right:0 }; }, contains(){ return false; }, scrollIntoView(){} };
  return n;
}
function boot(form){
  const els = {}; const body = [];
  const asked = [];
  const ctx = {
    console, setTimeout:(f)=>{ try{ f(); }catch(e){} }, clearTimeout, Promise, Date, Math, JSON, String, Number, Array, Object, isFinite, RegExp,
    localStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    document:{ body:{ appendChild(n){ body.push(n); if (n.id) els[n.id] = n; } },
      documentElement:{ clientWidth:1280, style:{ setProperty(){} } },
      getElementById(id){
        if (form && ((id in form) || ('__chk_' + id in form)))
          return { value: form[id] || '', checked: !!form['__chk_' + id], style:{} };
        return els[id] || null;
      },
      createElement(){ return node0(); },
      querySelector(){ return null; }, querySelectorAll(){ return []; }, addEventListener(){}, removeEventListener(){} },
    innerHeight:900,
    state:{ loaners:JSON.parse(JSON.stringify(代車)), companyCars:JSON.parse(JSON.stringify(社用車)),
            loanerAssigns:[], fleetEvents:JSON.parse(JSON.stringify(保存)),
            cards:JSON.parse(JSON.stringify(整備カード)), customers:[], staff:[], settings:{} },
    PitDB:{ saved:0, save(){ this.saved++; } },
    pitAlert:(m,o)=>{ asked.push({kind:'alert', code:(o||{}).code}); },
    pitAsk:(m,o)=>{ asked.push({kind:'ask', code:(o||{}).code}); return Promise.resolve(true); },
    pitLog(){}, renderFleet(){ ctx.rendered = (ctx.rendered||0)+1; },
    ymd:(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
    addDays:(d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  };
  ctx.window = ctx; ctx.asked = asked; ctx.els = els; ctx.bodyKids = body;
  vm.createContext(ctx);
  vm.runInContext(JS('pit-share.js'), ctx, { filename:'pit-share.js' });
  vm.runInContext(JS('intern-pit.js'), ctx, { filename:'intern-pit.js' });
  vm.runInContext(bend('loaner-free.js', JS('loaner-free.js')), ctx, { filename:'loaner-free.js' });
  vm.runInContext(JS('loaner.js'), ctx, { filename:'loaner.js' });          /* pitTenkenFromShaken */
  vm.runInContext(bend('maint-pit.js', JS('maint-pit.js')), ctx, { filename:'maint-pit.js' });
  return ctx;
}
const R = (c, vid, work) => c.pitMaintRows(TODAY).filter(r => r.vehicleId === vid && r.work === work)[0];

/* ================================================================= */
console.log('\n── ① 1行＝1つの整備予定 ──');
{
  const c = boot();
  const rows = c.pitMaintRows(TODAY);
  ok('行が出る', rows.length > 0);
  const r1 = R(c, 'l1', 'shaken');
  ok('🔴 飛び地の候補が1行にまとまる', !!r1 && r1.candidates.length === 2);
  ok('候補が日付順', r1.candidates[0].fromDate === '2026-10-04');
  ok('まだ来ていない候補だけ数える', r1.live.length === 2);
  ok('車両と作業が分かる', r1.workLabel === '車検' && r1.veh.model === 'タント');
  ok('🔴 社用車も乗る', rows.some(r => r.vehicleId === 'c1'));
  ok('🔴 手で入れた修理も1行になる', !!R(c, 'l2', 'general'));
  ok('急ぎの印が付く', R(c, 'l2', 'general').urgent === true);
  ok('メモが残る', R(c, 'l2', 'general').memo === 'エアコンが効かない');
  ok('🔴 半年より先はまだ出さない（ノート＝2028年）', !R(c, 'l4', 'shaken'));
  ok('代車自身の予定（青帯）は行にならない', !rows.some(r => r.groupId === 'e1'));
}

console.log('\n── ② 警告の出し方 ──');
{
  const c = boot();
  ok('🔴 今月に入って候補0本＝警告', R(c, 'l2', 'shaken').level === 'warn');
  ok('警告の文が「早くやれよ」の合図になっている', R(c, 'l2', 'shaken').msg.indexOf('候補がまだ1本もありません') >= 0);
  ok('🔴🔴 車検の満了超過＝赤（別扱い）', R(c, 'l3', 'shaken').level === 'bad');
  ok('何日超過か出る', R(c, 'l3', 'shaken').msg.indexOf('日超過') >= 0);
  ok('🔴 車検はスライドしない', R(c, 'l3', 'shaken').plan.slipped === false);
  ok('候補があれば警告にしない', R(c, 'l1', 'shaken').level === 'go');
  ok('まだ受けられる期間に入っていなければ静か', (R(c,'c1','shaken')||{}).level !== 'bad');
  /* 並び＝赤 → 警告 → 動いているもの */
  const lv = c.pitMaintRows(TODAY).map(r => r.level);
  ok('🔴 赤がいちばん上', lv[0] === 'bad');
  ok('赤の次は警告', lv.indexOf('warn') < (lv.indexOf('go') < 0 ? 99 : lv.indexOf('go')));
}

console.log('\n── ③ 車両カレンダーに出す「やること」（v2.70.0 で作り直し）──');
{
  const c = boot();
  const v1 = c.state.loaners[0];   /* タント・満了 2026-10-31 */
  const it1 = c.pitMaintCalItems(v1, TODAY).filter(x => x.work === 'shaken')[0];
  ok('車検の枠が1件だけ返る（3つに割れない）', !!it1);
  ok('🔴🔴 満了月の前々月（8月）に立つ', it1.months.indexOf('2026-08') >= 0);
  ok('🔴🔴 前月（9月）に立つ', it1.months.indexOf('2026-09') >= 0);
  ok('🔴🔴 満了月（10月）に立つ', it1.months.indexOf('2026-10') >= 0);
  ok('その前（7月）には立たない', it1.months.indexOf('2026-07') < 0);
  ok('その後（11月）には立たない', it1.months.indexOf('2026-11') < 0);
  /* 🔴 3ヶ月ぶち抜きの1本のバーにする＝月が2つ以上なら bar が立つ */
  ok('🔴🔴 3ヶ月を1本のバーでぶち抜く', it1.bar === true && it1.months.length === 3);
  /* 🔴 色は状態。作業の種類は前の四角（クラス名だけを配る＝色は CSS が持つ） */
  ok('🔴 候補があれば状態は「予定」', it1.state === 'cand' && it1.stateLabel.indexOf('予定') === 0);
  ok('🔴 候補の本数が出る', it1.stateLabel === '予定2');
  ok('🔴 作業の四角はクラス名で渡す', it1.workDot === 'wk-shaken');
  ok('作業の短い名前が付く', it1.workShort === '車検');
  ok('中身は title で分かる', it1.title.indexOf('10/4') >= 0 && it1.title.indexOf('10/12') >= 0);
  /* ⚠ 満了日そのものは「やること」ではない＝ここでは返さない（画面が別の行で出す） */
  ok('🔴🔴 満了日は「やること」に混ぜない', !c.pitMaintCalItems(v1, TODAY).some(x => x.state === 'due'));
  ok('満了日は参照用に持っている', it1.dueDate === '2026-10-31');
  const v2 = c.state.loaners[1];   /* ヤリス・今月・候補0本 */
  ok('🔴 候補が1本も無ければ「未割当」（赤）',
     c.pitMaintCalItems(v2, TODAY).some(x => x.work === 'shaken' && x.state === 'tbd'));
  const v3 = c.state.loaners[2];   /* 満了超過 */
  const it3 = c.pitMaintCalItems(v3, TODAY).filter(x => x.work === 'shaken')[0];
  ok('🔴 満了超過は「超過」', it3.state === 'over');
  ok('🔴 満了超過は今月の列に出す（消えない）', it3.months.length === 1 && it3.months[0] === '2026-09');
  ok('1ヶ月だけならバーにしない', it3.bar === false);
}

console.log('\n── ③-2 日の軸に出す整備の枠（期間ぜんぶで1本のバー）──');
{
  const c = boot();
  const bars = c.pitMaintDayBars('l1', '2026-10-01', '2026-10-31');
  ok('🔴 飛び地は本数ぶん並ぶ（数えられる）', bars.length === 2);
  ok('🔴 日ごとに切らない（1本＝期間ぜんぶ）', bars[0].from === '2026-10-04' && bars[0].to === '2026-10-06');
  ok('日付順に並ぶ', bars[1].from === '2026-10-12');
  ok('確定していなければ「予定」', bars[0].state === 'cand' && bars[0].stateLabel === '予定');
  ok('作業の四角はクラス名で渡す', bars[0].workDot === 'wk-shaken');
  /* ⚠ 画面からはみ出す側は端で分かるようにする */
  const cut = c.pitMaintDayBars('l1', '2026-10-05', '2026-10-05');
  ok('🔴 はみ出す側が分かる（左）', cut[0].cutL === true);
  ok('🔴 はみ出す側が分かる（右）', cut[0].cutR === true);
  ok('🔴 切り詰めた端が返る', cut[0].clipFrom === '2026-10-05' && cut[0].clipTo === '2026-10-05');
  /* 🔴 月の目標（候補が1本も無いカード）は日の軸に出さない＝縮尺が違うものを乗せない */
  ok('🔴🔴 月の目標は日の軸に出てこない', c.pitMaintDayBars('l2', '2026-09-01', '2026-09-30').length === 0);
}

console.log('\n── ④ 「日を決める」は日ビューに切り替える ──');
{
  const c = boot();
  let zoomed = null, wentLoaner = false;
  c.flZoomTo = (vid, y, m) => { zoomed = { vid, y, m }; };
  c.showView = () => { wentLoaner = true; };
  c.pitLoanerGoto = () => { wentLoaner = true; };
  c.flMaintGoto('l1', '2026-10');
  ok('🔴 日ビューに切り替える', !!zoomed && zoomed.y === 2026 && zoomed.m === 9);
  ok('🔴 その車の行をアクティブにする', zoomed.vid === 'l1');
  ok('🔴🔴 代車カレンダーへは飛ばさない', wentLoaner === false);
  const fleet = bend('fleet.js', JS('fleet.js'));
  ok('日ビュー側に行を光らせる用意がある', /fl-hl/.test(fleet) && /flZoomTo/.test(fleet));
  ok('車両管理がボードを差し込んでいる', /flMaintBoardHtml\(\)/.test(fleet));
  ok('月カレンダーが物差しから中身をもらっている', /pitMaintCalItems\(/.test(fleet));
}

console.log('\n── ⑤ 手入力は「月の目標」だけ ──');
/* 🔴 v2.67.0 で入力の形が変わった（ゆうた指定）。ここもその形に直した（v2.70.0）。
   ・「ひとことメモ」は無くなり、**予約と同じ「作業内容」**になった（mba-menu）
   ・作業は札（チップ）で選ぶ＝`flMaintPickWork` を押した状態
   ・「✅急ぎ」は無くなった（ボードの急ぎはカード側の印） */
{
  const c = boot({ 'mba-veh':'l1', 'mba-ym':'2026-10', 'mba-menu':'' });
  c.flMaintPickWork('general');
  c.flMaintSave();
  ok('🔴 一般・B.P は作業内容が空なら止まる', c.asked.length === 1 && c.asked[0].code === 'PF-3051');
  ok('カードが1枚も増えない', c.state.cards.length === 2);
}
{
  const c = boot({ 'mba-veh':'l1', 'mba-ym':'2026-10', 'mba-menu':'' });
  c.flMaintSave();
  ok('🔴 作業を選んでいなければ止まる', c.asked.length === 1 && c.asked[0].code === 'PF-3069');
}
{
  const c = boot({ 'mba-veh':'l1', 'mba-ym':'2026-10', 'mba-menu':'' });
  c.flMaintPickWork('shaken');
  c.flMaintSave();
  ok('⚠ 車検・12点は名前で通じるので作業内容が空でも通る', c.state.cards.length === 3);
}
{
  const c = boot({ 'mba-veh':'l1', 'mba-ym':'2026-10', 'mba-menu':'ブレーキから音' });
  c.flMaintPickWork('general');
  c.flMaintSave();
  const card = c.state.cards.filter(x => x.menu === 'ブレーキから音')[0];
  ok('🔴🔴 カードが1枚だけ増える（fleetEvents ではない）', !!card && c.state.cards.length === 3);
  ok('🔴 社内区分は「代車」（売上・突合から外れる受け皿）', card.internKind === 'loanercar');
  ok('🔴 予約カードとして生まれる', card.status === 'reserved');
  ok('🔴 日はまだ決まっていない（未定＝予約カレンダーに乗らない）',
     card.intakeTbd === true && !card.reserveDate);
  ok('🔴 候補はまだ1本も無い', Array.isArray(card.maintSpans) && card.maintSpans.length === 0);
  ok('🔴 予約番号は候補を置いた時（＝カードが生まれた時）に振る', typeof card.resNo === 'string');
  ok('月の目標が入る', card.maintYm === '2026-10');
  ok('🔴 作業内容が入る（ボードの一言はここの1行目で補う）', card.menu === 'ブレーキから音');
  ok('保存が呼ばれる', c.PitDB.saved === 1);
  ok('ボードに出る', c.pitMaintRows(TODAY).some(r => r.plan.manualId === card.id));
}
{
  const c = boot();
  c.flMaintDrop('mcC');
  ok('取り下げは1回聞く', c.asked.length === 1 && c.asked[0].code === 'PF-3052');
}

console.log('\n── ⑥ 月の目標は日の軸に出さない ──');
{
  const c = boot();
  ok('🔴🔴 日のカレンダーには出てこない（縮尺が違うものを日軸に乗せない）',
     c.pitLoanerDay('l2', '2026-09-15').maints.length === 0);
  /* 🔴 v2.49.0 **`withMonth` という逃げ道が要らなくなった。**
     月の目標＝候補が1本も無いカード＝日の軸に**出しようがない**（配列が空なので自然に出ない）。
     前は同じ箱に月と日が混ざっていたので、opt で「今回は月も出して」と頼む必要があった。
     ⚠ 逃げ道は、要らなくなったら消す。残すと「どっちで呼ぶんだっけ」が ひとつ増える。 */
  ok('🔴 逃げ道そのものが要らなくなった（条件として使っている所が無い）',
     !/\(\s*opt\s*&&\s*opt\.withMonth\s*\)/.test(JS('loaner-free.js')));
  ok('月の目標はボードには出る（日の軸ではなくボードの仕事）',
     c.pitMaintRows(TODAY).some(r => r.vehicleId === 'l2' && r.work === 'general'));
  ok('日の候補はふつうに出る', c.pitLoanerDay('l1', '2026-10-05').maints.length === 1);
}

console.log('\n── ⑦ 満了超過でも貸出は止めない ──');
{
  const c = boot();
  const l3 = c.state.loaners[2];
  ok('🔴🔴 赤で出しても、貸せる代車のまま', c.pitLoanerUsable(l3) === true);
  ok('🔴🔴 空き一覧にも出る', c.pitLoanerFreeOn('2026-09-15').some(x => x.id === 'l3'));
  /* ⚠ 見るのは**呼び出し**（`pitLoanerUsable(`）。説明文に名前が出るのは構わない。 */
  ok('🔴 ボードは「知らせるだけ」（貸出の可否に手を出していない）',
     !/pitLoanerUsable\s*\(/.test(JS('maint-pit.js')) && !/\.retired\s*=/.test(JS('maint-pit.js')));
}

console.log('\n── ⑧-2 二重バッジの始末・行の並び・なぞり（v2.46.0 ゆうた報告）──');
{
  const fleet = bend('fleet.js', JS('fleet.js'));
  const mStart = fleet.indexOf('function flMonthCalHtml');
  const dStart = fleet.indexOf('function flDayCalHtml');
  const month = fleet.slice(mStart, dStart);
  const day = fleet.slice(dStart, dStart + 7000);
  /* 🗣「今元のバッチとダブっちゃってる　まずもとのバッチを消してくれ」 */
  ok('🔴🔴 月カレンダーから元の「車検」バッジを消した', month.indexOf('fl-bdg shaken') < 0);
  ok('🔴🔴 月カレンダーから元の「12ヶ月」バッジを消した', month.indexOf('fl-bdg tenken') < 0);
  ok('🔴 やることは物差しからもらう', /pitMaintCalItems\(/.test(month));
  /* 🔴 v2.70.0 日ビューの満了日・12点は**マスごと塗る**（前は上端の細い線＝ほぼ気づけなかった） */
  ok('🔴🔴 日ビューの満了日はマスごと塗る', day.indexOf('d-exp') >= 0);
  ok('🔴 12点の日も同じ形（橙）', day.indexOf('d-tkc') >= 0);
  ok('🔴 日ビューの整備の枠は1本のバー', day.indexOf('fl-bar3') >= 0 && /pitMaintDayBars\(/.test(day));
  /* 🗣「候補日はドラッグでまとまった日を選べるように」 */
  ok('🔴 日ビューのマスに車と日の目印が付いている', /data-fv="/.test(day) && /data-fd="/.test(day));
  ok('🔴 なぞりを繋いでいる（日ビューを描いた後に呼んでいる）', /_flMode === 'day'\) _flBindDayDrag\(\)/.test(fleet));
  ok('🔴 同じ車の行の中だけで伸びる', /別の車へは伸ばさない/.test(fleet));
  ok('なぞった所が光る', /fl-pick/.test(fleet));
  ok('🔴 なぞりは1文字も保存しない', !/PitDB\.save/.test(fleet.slice(fleet.indexOf('function _flBindDayDrag'), fleet.indexOf('function flMonthCalHtml'))));
  /* 🗣「専務のW212の車検の日を決めるが左に来ちゃってる」 */
  const css = bend('polish.css', fs.readFileSync(path.join(process.cwd(), 'css', 'polish.css'), 'utf8'));
  ok('🔴 「日を決める」は3列目に固定して右端へ', /\.mb-act\{[^}]*grid-column:3/.test(css) && /\.mb-act\{[^}]*justify-self:end/.test(css));
  ok('🔴 真ん中の列が押し出されない（minmax(0,1fr)）', /\.mb-row\{[^}]*minmax\(0,1fr\)/.test(css));
}

console.log('\n── ⑧ ボードのHTML ──');
{
  const c = boot();
  const h = c.flMaintBoardHtml();
  ok('要対応の数が出る', h.indexOf('要対応 1') >= 0);
  ok('警告の数が出る', h.indexOf('警告') >= 0);
  ok('🔴 飛び地の候補が並ぶ', h.indexOf('10/4〜10/6') >= 0 && h.indexOf('10/12〜10/16') >= 0);
  ok('「日を決める」がある', h.indexOf('flMaintGoto') >= 0);
  ok('「予定を足す」がある', h.indexOf('flMaintAdd()') >= 0);
  ok('急ぎの印が出る', h.indexOf('mb-urgent') >= 0);
  ok('社用車と代車を言い分けている', h.indexOf('社用車') >= 0 && h.indexOf('代車1') >= 0);
  ok('🔴 赤・橙・黄の3段になっている', /mb-bad/.test(h) && /mb-warn/.test(h) && /mb-go/.test(h));
}

console.log('\n─────────────────────────────');
if (BREAK) {
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  if (fail > 0) { console.log('🟢 正しい＝壊したら赤くなった（この見張りは効いている）'); process.exit(0); }
  console.log('🔴 まずい＝壊したのに全部緑のまま。見張りが効いていない'); process.exit(1);
}
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
