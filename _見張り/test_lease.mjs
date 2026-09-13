/* PitFlow ── 🏁 **代車・社用車のリース車両**の見張り（ブラウザは使わない）
   ===================================================================
   ◎ゆうた指定（2026-09-13）
     🗣「代車にリース車両を追加。代車の車両設定画面にリース車両 スイッチを追加。チェックが入る場合に挙動変更」
     🗣「顧客との紐づけ→なし（リースなので自社登録してない）／車検満了日→入力なし 打てないようにしてほしい」
     🗣「新規 リースアップ日入力 日付ピッカーで入力」
     🗣「管理カレンダーにも予定イベントとして月ビューに暫定入力。作業予定と同じように、近づいてきたら日ビューにして締め切りを設定」
     🗣「作業予定カードにも入る（確定日で過ぎたら、予定通りリースアップでアーカイブする みたいなボタン）」
     🗣「代車カレンダーにも入る（かつそれ以降はグレーアウトみたいな感じにする）」
     🗣「他代車カードの🔗済 のボタンの変わりにリース車両 ばっちを付与」
     （確かめた答え）代車と社用車の両方／2ヵ月前から案内・分かればもっと手前から入力できる／
                     グレー＋貸出は警告（止めない）／アーカイブ＝引退

   ◎ここで見張ること
     🔴🔴 ① リースアップ日（確定→無ければ暫定）の**当日から先はふさがり**（空いている代車・案内から外れる）
     🔴🔴 ① 貸出の窓の「この代車自身の予定と重なります」に出る＝**止めずに聞く**
     🔴  ① 未紐づけの数（L08）にリース車両を数えない
     🔴🔴 ② 作業予定ボードに **2ヶ月前から** 行が出る（暫定＝警告／暫定を過ぎた＝赤／確定＝済み／確定日から＝アーカイブ）
     🔴🔴 ② 日ビューのマスから「この日をリースアップ日に確定」／ボードから「予定通りリースアップでアーカイブ」＝引退
     🔴  ③ 設定の窓：スイッチ・日付ピッカー（暫定／確定）・紐づけと車検満了日を打てなくする・保存でも書かない
     🔴  ③ 🔗済 の代わりに「リース車両」の札／管理カレンダー（月＝暫定の札・日＝紫の日とその先のグレー）／代車カレンダーのグレー

   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_lease.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');
const bare = (f) => JS(f).replace(/\/\*[\s\S]*?\*\//g, '');

const 車 = () => ({
  loaners: [
    { id:'L1', name:'代車1', number:1, model:'ルークス', lease:true, leaseUp:'2026-11-30' },                          /* 暫定だけ */
    { id:'L2', name:'代車2', number:2, model:'N-BOX', lease:true, leaseUp:'2026-11-30', leaseUpFixed:'2026-11-20' },   /* 確定あり */
    { id:'L3', name:'代車3', number:3, model:'タント', shakenDate:'2027-05-10' }                                         /* ふつうの代車 */
  ],
  companyCars: [ { id:'C1', name:'プロボックス', model:'プロボックス', lease:true, leaseUp:'2026-10-31' } ]
});

function node0(){
  const n = { innerHTML:'', style:{ setProperty(){} }, classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){}, children:[], checked:false, value:'',
    insertAdjacentHTML(_w,h){ n.innerHTML += h; }, querySelector(){ return null; }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { top:0, bottom:0, left:0, right:0 }; }, contains(){ return false; }, scrollIntoView(){} };
  return n;
}
function boot(){
  const els = {}, body = [], asked = [];
  const v = 車();
  const ctx = {
    console, setTimeout:(f)=>{ try{ f(); }catch(e){} }, clearTimeout, Promise, Date, Math, JSON, String, Number, Array, Object, isFinite, RegExp,
    localStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    document:{ body:{ appendChild(n){ body.push(n); if (n.id) els[n.id] = n; } },
      documentElement:{ clientWidth:1280, style:{ setProperty(){} } },
      getElementById(id){ return els[id] || null; }, createElement(){ return node0(); },
      querySelector(){ return null; }, querySelectorAll(){ return []; }, addEventListener(){}, removeEventListener(){} },
    innerHeight:900,
    state:{ loaners:v.loaners, companyCars:v.companyCars, loanerAssigns:[], fleetEvents:[], cards:[], customers:[], staff:[], settings:{} },
    PitDB:{ saved:0, save(){ this.saved++; } },
    pitAlert:(m,o)=>{ asked.push({ kind:'alert', m }); },
    pitAsk:(m,o)=>{ asked.push({ kind:'ask', m, o }); return Promise.resolve(true); },
    pitLog(){}, pitToast(){}, renderFleet(){ ctx.rendered = (ctx.rendered||0)+1; },
    ymd:(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
    addDays:(d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  };
  ctx.window = ctx; ctx.asked = asked; ctx.bodyKids = body;
  vm.createContext(ctx);
  vm.runInContext(JS('pit-share.js'), ctx, { filename:'pit-share.js' });
  vm.runInContext(JS('intern-pit.js'), ctx, { filename:'intern-pit.js' });
  vm.runInContext(JS('loaner-free.js'), ctx, { filename:'loaner-free.js' });
  vm.runInContext(JS('fleet-link.js'), ctx, { filename:'fleet-link.js' });
  vm.runInContext(JS('loaner.js'), ctx, { filename:'loaner.js' });
  vm.runInContext(JS('maint-pit.js'), ctx, { filename:'maint-pit.js' });
  return ctx;
}

console.log('\n── ① リースアップ日の当日から先はふさがり（貸出は止めずに聞く） ──');
{
  const c = boot();
  const day = (id, ds) => c.pitLoanerDay(id, ds);
  ok('（前提）物差しが出ている（pitLeaseEnd）', typeof c.pitLeaseEnd === 'function');
  ok('🔴 使う日は 確定 → 無ければ暫定', c.pitLeaseEnd && c.pitLeaseEnd(c.state.loaners[0]) === '2026-11-30' && c.pitLeaseEnd(c.state.loaners[1]) === '2026-11-20');
  ok('🔴 前の日はまだ貸せる（暫定 11/30 の前日）', day('L1', '2026-11-29').busy === false);
  const d30 = day('L1', '2026-11-30');
  ok('🔴🔴 リースアップの当日からふさがり', d30.busy === true && (d30.leaseOut || []).length === 1 && d30.leaseOut[0].isStart === true, d30.items && d30.items.map(x => x.kind));
  ok('🔴🔴 その先もずっとふさがり', day('L1', '2027-02-01').busy === true);
  ok('🔴 確定があれば確定の日から（11/20 確定・暫定 11/30）', day('L2', '2026-11-25').busy === true && day('L2', '2026-11-19').busy === false);
  ok('ふつうの代車は変わらない', day('L3', '2027-02-01').busy === false);
  ok('🔴 空いている代車の数から外れる', !c.pitLoanerFreeOn('2026-12-01').some(l => l.id === 'L1') && c.pitLoanerFreeOn('2026-12-01').some(l => l.id === 'L3'));
  const why = c.pitLoanerBusyWhy(c.state.loaners[0], '2026-12-01');
  ok('古い呼び方（busyWhy）でも壊れない＝「代車自身の予定」の形で答える', !!why && why.kind === 'event' && /リースアップ/.test(why.event.label), why);
  const ev = c.pitLoanerEventsIn('L1', '2026-11-28', '2026-12-02');
  ok('🔴🔴 貸出の窓の「この代車自身の予定と重なります」に出る', ev.some(e => e.type === 'lease' && /リースアップ/.test(e.label)), ev);
  ok('🔴 リースアップより前だけの貸出には出ない', c.pitLoanerEventsIn('L1', '2026-11-01', '2026-11-10').length === 0);
  const lo = bare('loaner.js');
  ok('🔴🔴 貸出の窓は止めずに聞く（pitAsk「それでも登録しますか？」のまま）', /_loConflictEvents\(lo, from, to\)/.test(lo) && /pitAsk\('それでも登録しますか？'/.test(lo));
  const un = (c.pitFleetUnlinked ? c.pitFleetUnlinked() : []).map(x => x.v.id);
  ok('🔴 未紐づけの数（L08）にリース車両を数えない', !un.includes('L1') && !un.includes('C1') && un.includes('L3'), un);
}

console.log('\n── ② 作業予定ボード：2ヶ月前から・状態・確定・アーカイブ ──');
{
  const c = boot();
  const R = (td, id) => (c.pitMaintLeaseRows ? c.pitMaintLeaseRows(td) : []).filter(r => r.vehicleId === id)[0];
  ok('（前提）リースアップの行を出す関数がある', typeof c.pitMaintLeaseRows === 'function');
  ok('🔴🔴 2ヶ月より前は出さない（暫定 11/30 に対して 9/29）', !R('2026-09-29', 'L1'));
  const w1 = R('2026-09-30', 'L1');
  ok('🔴🔴 2ヶ月前の日から出る＝暫定なので警告＋「日を決める」', !!w1 && w1.level === 'warn' && !w1.fixed, w1 && { level:w1.level });
  const b1 = R('2026-12-02', 'L1');
  ok('🔴 暫定の日を過ぎた＝赤', !!b1 && b1.level === 'bad', b1 && b1.level);
  const g2 = R('2026-11-01', 'L2');
  ok('🔴 確定していてまだ先＝確定済み', !!g2 && g2.level === 'go' && g2.fixed === true, g2 && g2.level);
  const d2 = R('2026-11-20', 'L2');
  ok('🔴🔴 確定日の当日から＝アーカイブを聞く番（いちばん上）', !!d2 && d2.level === 'done', d2 && d2.level);
  ok('🔴 社用車にも出る（代車と社用車の両方）', !!R('2026-09-30', 'C1'));
  ok('ふつうの代車には出ない', !R('2026-12-01', 'L3'));

  const mp = bare('maint-pit.js');
  const board = (mp.match(/function boardHtml\(\)\{[\s\S]*?\n  \}/) || [''])[0];
  ok('🔴 ボードに足している（車検の行と同じ並び）', /rows\(td\)\.concat\(leaseRows\(td\)\)/.test(board) && /if \(r\.lease\)\{ h \+= leaseRowHtml\(r\); return; \}/.test(board));
  const rowHtml = (mp.match(/function leaseRowHtml\(r\)\{[\s\S]*?\n  \}/) || [''])[0];
  ok('🔴🔴 確定日からは「予定通りリースアップでアーカイブ」ボタン', /flLeaseArchive\(/.test(rowHtml) && /予定通りリースアップでアーカイブ/.test(rowHtml));
  ok('🔴 それまでは「日を決める」（日ビューへ）', /flMaintGoto\(/.test(rowHtml) && /日を決める/.test(rowHtml));
  ok('🔴 月カレンダーの札・日ビューの整備メニュー（rows）には混ぜていない', !/leaseRows/.test((mp.match(/function rows\(todayStr, horizonN\)\{[\s\S]*?\n  \}/) || [''])[0]));

  c.flMaintCellMenu('L1', '2026-11-15');
  const menu = c.bodyKids.map(n => n.innerHTML || '').join('');
  ok('🔴🔴 日ビューのマスに「この日をリースアップ日に確定」（2ヶ月前より手前でも出る）', /flLeaseFix\('L1','2026-11-15'\)/.test(menu) && /リースアップ日に確定/.test(menu), menu.slice(0, 300));
  c.flMaintCellMenu('L3', '2026-11-15');
  const menu3 = c.bodyKids.map(n => n.innerHTML || '').join('');
  ok('ふつうの代車のマスには出ない', (menu3.match(/flLeaseFix\('L3'/g) || []).length === 0);

  await c.flLeaseFix('L1', '2026-11-26');
  ok('🔴🔴 確定を押すと leaseUpFixed に入る（暫定は残す）', c.state.loaners[0].leaseUpFixed === '2026-11-26' && c.state.loaners[0].leaseUp === '2026-11-30' && c.PitDB.saved > 0, c.state.loaners[0]);
  ok('🔴 確定したら、その日からふさがり', c.pitLoanerDay('L1', '2026-11-26').busy === true && c.pitLoanerDay('L1', '2026-11-25').busy === false);
  /* 🔴 ボードは知らせるだけ＝引退にするのは車両管理（fleet.js）の fleetLeaseArchive 1本。ここでは呼んだかを見る */
  let called = '';
  c.fleetLeaseArchive = (id) => { called = id; c.state.loaners.find(x => x.id === id).retired = true; return Promise.resolve(true); };
  await c.flLeaseArchive('L2');
  ok('🔴🔴 ボードのアーカイブは車両管理の「リースアップでアーカイブ」を呼ぶ', called === 'L2');
  ok('🔴 引退したらボードから消える', !(c.pitMaintLeaseRows('2026-11-21') || []).some(r => r.vehicleId === 'L2'));
  ok('🔴 作業予定ボード（maint-pit.js）は車の引退に手を出さない', !/\.retired\s*=/.test(JS('maint-pit.js')));
  const flx = bare('fleet.js');
  const arc = (flx.match(/function fleetLeaseArchive\(id\)\{[\s\S]*?\n\}/) || [''])[0];
  ok('🔴🔴 アーカイブ＝引退（retired・retiredAt）にする／記録は残る', /f\.v\.retired = true/.test(arc) && /f\.v\.retiredAt = td/.test(arc) && /pitAsk\(/.test(arc), arc.slice(0, 200));
}

console.log('\n── ③ 設定の窓・札・カレンダー ──');
{
  const idx = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  ok('🔴🔴 設定の窓にリース車両のスイッチ', /<input type="checkbox" id="fl-lease" onchange="flLeaseToggle\(\)">/.test(idx) && /リース車両<\/span>/.test(idx));
  ok('🔴🔴 リースアップ日は日付ピッカー（暫定／確定）', /id="fl-leaseup" type="date"/.test(idx) && /id="fl-leaseup-fix" type="date"/.test(idx));
  ok('🔴 紐づけ欄・車検満了日の欄に「リースなら入れない」の言葉', /id="fl-link-row" data-off="/.test(idx) && /id="fl-shaken-row" data-off="/.test(idx));

  const fl = bare('fleet.js');
  const tog = (fl.match(/window\.flLeaseToggle = function\(\)\{[\s\S]*?\n\};/) || [''])[0];
  ok('🔴🔴 スイッチで車検満了日の欄を打てなくする', /\['fl-sh-era', 'fl-sh-y', 'fl-sh-m', 'fl-sh-d'\]/.test(tog) && /e\.disabled = on/.test(tog));
  ok('🔴🔴 スイッチで紐づけ欄を打てなくする', /fl-link-row/.test(tog) && /fl-off/.test(tog));
  ok('🔴🔴 保存でもリースなら車検満了日を書かない', /f\.v\.shakenDate = lease \? '' : shaken/.test(fl) && /shakenDate:\(lease \? '' : shaken\)/.test(fl));
  ok('🔴🔴 保存でもリースなら紐づけを書かない', /if \(!lease && _flLink\.custId && _flLink\.custVehId\)\{ f\.v\.custId/.test(fl) && /if \(!lease && _flLink\.custId && _flLink\.custVehId\)\{ rec\.custId/.test(fl));
  ok('🔴 保存でリースアップ日（暫定／確定）を持つ', /f\.v\.lease = true; f\.v\.leaseUp = leaseUp; f\.v\.leaseUpFixed = leaseUpFixed;/.test(fl) && /rec\.lease = true;/.test(fl));
  ok('🔴🔴 🔗済 の代わりに「リース車両」の札', /const _bdg = v\.lease \? '<div class="fl-card-link"><span class="fl-link-bdg lease"/.test(fl) && /\+ _bdg /.test(fl));
  ok('🔴 札の下は車検の代わりにリースアップ', /v\.lease \? _flLeaseFoot\(v\)/.test(fl));
  ok('🔴 管理カレンダー（月）に暫定の札', /fl-due lease/.test(fl) && /リースアップ ' \+ _flMd\(_le\)/.test(fl));
  ok('🔴 管理カレンダー（日）＝リースアップ日を紫・その先はグレー', /cls \+= ' d-lease'/.test(fl) && /cls \+= ' fl-leaseout'/.test(fl));
  const lo = bare('loaner.js');
  ok('🔴🔴 代車カレンダー＝リースアップ日から先はグレー＋札', /day\.leaseOut && day\.leaseOut\.length/.test(lo) && /lo-leaseout/.test(lo) && /lo-ls-tag/.test(lo));
  const css = fs.readFileSync(path.join(process.cwd(), 'css', 'polish.css'), 'utf8') + fs.readFileSync(path.join(process.cwd(), 'css', 'fleet-cal.css'), 'utf8');
  ok('見た目がある（札・グレー・薄くした欄）', /\.fl-link-bdg\.lease/.test(css) && /\.lo-cell\.lo-leaseout \.lo-lsbg/.test(css) && /\.fl-mlb\.fl-off/.test(css) && /\.fl-cal-cell\.d-lease/.test(css));
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（緑 ' + pass + '件）' : '✅ 全部緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
