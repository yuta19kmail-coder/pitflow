/* PitFlow ── 🧩 **「この代車の、この日に何が乗っているか」の部品**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた合意（2026-08-31）
     「代車のスケジュールはあくまで**代車カレンダーが本流でありマスター**で、
       車両管理カレンダーはあくまで**必要な情報をそこから抜き出して見やすくしたよ**、ってイメージ。
       新規予約の右カラムの代車カレンダーと同じ扱いって意味合い」

   ◎なぜ要るか（実際に踏んだ）
     🅿仮押さえ を足した時、出す場所が4つ（代車カレンダー／車両管理の月・日／新規予約の右カラム）
     あるのに **どの画面も自前で `state.loanerAssigns` を読んでいた**ので、
     `fleet.js` を手で直さないと出なかった。🔧整備の枠を足す前に、ここを1本にする。

   ◎ここで見張ること
     🔴 ① 部品が3つの種類（貸出／仮押さえ／代車自身の予定）を**まとめて**返す
     🔴 ② 「ふさがっているか」の答えが**今までと同じ**（busyOn / busyWhy を壊していない）
     🔴 ③ **画面が自前で読んでいない**（＝種類を増やした時に置いていかれる画面が無い）
     🔴 ④ **種類を1つ足したら、全部の画面に出る**（本番＝🔧整備の枠で効かせたい所）
     🔴 ⑤ 代車自身の予定の**色（赤・橙・紫）が落ちない**
        ⚠ `FL_EVT_TYPES` は fleet.js の const なので `window.` からは取れない。踏みやすい穴。

   ◎使い方
       node test_loaner_parts.mjs
       node test_loaner_parts.mjs --break=1  … 仮押さえを部品から外す → ①④が赤くなるのが正しい
       node test_loaner_parts.mjs --break=2  … 色を window から取る   → ⑤が赤くなるのが正しい
       node test_loaner_parts.mjs --break=3  … 自動で作った予定を弾くのをやめる → ⑤が赤くなるのが正しい
       　　　　　　　　　　　　　　　　　　　　　（＝古い車検の予定が代車カレンダーに戻ってくる状態）
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
    return src.replace("      out.push(_assignItem(a));", "      if (a.hold) return;\n      out.push(_assignItem(a));");
  if (BREAK === '2' && name === 'loaner-free.js')
    return src.replace("var TY = (typeof FL_EVT_TYPES !== 'undefined') ? FL_EVT_TYPES : null;", "var TY = w.FL_EVT_TYPES || null;");
  /* v2.70.1 …「アプリが勝手に作った予定を弾く」を外す＝古い車検の予定がまた出てくる */
  if (BREAK === '3' && name === 'loaner-free.js')
    return src.replace("      if (e.auto) return;", "      /* 弾くのをやめた */;");
  return src;
}

const 代車 = [
  { id:'l1', name:'代車1', number:1, model:'タント', category:'kei', shakenDate:'2026-10-31' },
  { id:'l2', name:'代車2', number:2, model:'アクア', category:'normal', shakenDate:'2027-03-20' }
];
const DATA = [
  { id:'la1', loanerId:'l1', cardId:null, customer:'小林 太郎', car:'アクア', purpose:'車販・乗り換え',
    fromDate:'2026-10-05', toDate:'2026-10-08', manual:true },
  { id:'lh1', loanerId:'l1', cardId:null, hold:true, memo:'隣にずらすかも', customer:'仮押さえ',
    purpose:'隣にずらすかも', fromDate:'2026-10-12', toDate:'2026-10-14', manual:true }
];
const EVENTS = [
  { id:'e1', vehicleId:'l1', type:'shakenIn', label:'車検入庫', fromDate:'2026-10-20', toDate:'2026-10-22' },
  { id:'e2', vehicleId:'l1', type:'tenken',   label:'',         fromDate:'2026-10-25', toDate:'2026-10-25', auto:true }
];

function node0() {
  const n = { innerHTML:'', style:{ setProperty(){} }, dataset:{}, offsetHeight:100,
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){},
    insertAdjacentHTML(_w, h){ n.innerHTML += h; },
    querySelector(){ return null; }, querySelectorAll(){ return []; }, contains(){ return false; },
    getBoundingClientRect(){ return { top:0, bottom:0, left:0, right:0 }; }, children:[] };
  return n;
}
function boot(extraAssigns) {
  const ctx = {
    console, setTimeout:(f)=>{ try{ f(); }catch(e){} }, clearTimeout, Promise, Date, Math, JSON, String, Number, Array, Object, isFinite,
    localStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    document:{ body:node0(), documentElement:{ clientWidth:1280, style:{ setProperty(){} } },
      getElementById(){ return null; }, createElement(){ return node0(); },
      querySelector(){ return null; }, querySelectorAll(){ return []; }, addEventListener(){}, removeEventListener(){} },
    innerHeight:900,
    state:{ loaners:JSON.parse(JSON.stringify(代車)),
            loanerAssigns:JSON.parse(JSON.stringify(DATA.concat(extraAssigns || []))),
            fleetEvents:JSON.parse(JSON.stringify(EVENTS)),
            companyCars:[], cards:[], customers:[], staff:[], settings:{} },
    PitDB:{ save(){} }, pitAlert(){}, pitAsk(){ return Promise.resolve(true); }, pitLog(){},
    ymd:(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
    addDays:(d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(bend('loaner-free.js', JS('loaner-free.js')), ctx, { filename:'loaner-free.js' });
  vm.runInContext(JS('fleet.js'), ctx, { filename:'fleet.js' });     /* FL_EVT_TYPES はここで居る */
  vm.runInContext(JS('loaner.js'), ctx, { filename:'loaner.js' });
  return ctx;
}

/* ================================================================= */
console.log('\n── ① 部品が3つの種類をまとめて返す ──');
{
  const c = boot();
  ok('貸出の日', c.pitLoanerDay('l1','2026-10-06').lends.length === 1);
  ok('🔴 仮押さえの日', c.pitLoanerDay('l1','2026-10-13').holds.length === 1);
  ok('代車自身の予定の日', c.pitLoanerDay('l1','2026-10-21').events.length === 1);
  ok('何も無い日は空', c.pitLoanerDay('l1','2026-10-01').items.length === 0);
  const d = c.pitLoanerDay('l1','2026-10-05');
  ok('初日・最終日が分かる', !!d.lends[0] && d.lends[0].isStart === true && d.lends[0].isEnd === false);
  ok('メモが取れる', ((c.pitLoanerDay('l1','2026-10-12').holds[0])||{}).memo === '隣にずらすかも');
  ok('名前が取れる', ((d.lends[0])||{}).label === '小林 太郎');
  /* ⚠ 種類の**並びと数**を固定で見張らない（増やすたびに赤くなるだけで何も守れない）。
     見るのは「外から見えるか」と「いまある種類が載っているか」。 */
  ok('種類の一覧が外から見える',
     ['lend','hold','event','maint'].every(k => !!c.PIT_LOANER_KINDS[k]), Object.keys(c.PIT_LOANER_KINDS));
  /* ⚠ v2.70.1 で**自動で作った予定（e2）は物差しが弾く**ようになったので、1つ減った（下の⑤を見ること） */
  ok('期間で聞ける（月表示用）', c.pitLoanerSpan('l1','2026-10-01','2026-10-31').length === 3);
  ok('種類を選んで聞ける', c.pitLoanerSpan('l1','2026-10-01','2026-10-31',{kinds:['event']}).length === 1);
  ok('自分自身を外せる', c.pitLoanerDay('l1','2026-10-06',{ignoreAssignId:'la1'}).lends.length === 0);
  ok('代車自身の予定だけ外せる', c.pitLoanerDay('l1','2026-10-21',{noEvents:true}).items.length === 0);
}

console.log('\n── ② 「ふさがっているか」の答えが今までと同じ ──');
{
  const c = boot();
  const l1 = c.state.loaners[0];
  ok('貸出の日はふさがっている',     c.pitLoanerBusyOn(l1,'2026-10-06') === true);
  ok('🔴 仮押さえの日もふさがっている', c.pitLoanerBusyOn(l1,'2026-10-13') === true);
  ok('代車自身の予定もふさがっている', c.pitLoanerBusyOn(l1,'2026-10-21') === true);
  ok('空きは空き',                   c.pitLoanerBusyOn(l1,'2026-10-01') === false);
  ok('noEvents なら予定は数えない',   c.pitLoanerBusyOn(l1,'2026-10-21',{noEvents:true}) === false);
  ok('🔴 理由の形が今までのまま（貸出）', c.pitLoanerBusyWhy(l1,'2026-10-06').kind === 'assign');
  ok('🔴 理由の形が今までのまま（予定）', c.pitLoanerBusyWhy(l1,'2026-10-21').kind === 'event');
  ok('🔴 仮押さえは assign ＋ hold:true', (function(){ const y=c.pitLoanerBusyWhy(l1,'2026-10-13')||{}; return y.kind==='assign' && y.hold===true; })());
  ok('空きは null',                  c.pitLoanerBusyWhy(l1,'2026-10-01') === null);
  ok('主役は 貸出 → 仮押さえ → 予定 の順',
     c.pitLoanerDay('l1','2026-10-06').main.kind === 'lend');
}

console.log('\n── ③ 画面が自前で読んでいない ──');
{
  const fleet = JS('fleet.js'), cd = JS('card-detail.js'), lo = JS('loaner.js');
  const 自前 = (src) => (src.match(/state\.loanerAssigns\s*\|\|\s*\[\]\)\s*\.\s*(find|filter|some)\s*\(function[^)]*\)\s*\{[^}]*fromDate\s*<=/g) || []).length;
  ok('🔴 車両管理が自前で「その日の貸出」を探していない', 自前(fleet) === 0);
  ok('🔴 代車カレンダーも自前で探していない', 自前(lo) === 0);
  ok('🔴 車両管理は部品を呼んでいる', /pitLoanerDay\(/.test(fleet) && /pitLoanerSpan\(/.test(fleet));
  ok('🔴 代車カレンダーも部品を呼んでいる', /pitLoanerDay\(/.test(lo));
  ok('🔴 新規予約の右カラムも部品ごしに聞いている', /pitLoanerBusyWhy\(/.test(cd));
  ok('車両管理が自前で fleetEvents を日で探していない',
     !/_flEvents\(\)\.filter\(function\(e\)\{ return !e\.auto/.test(fleet.replace(/\s+/g,' ')));
  const lf = JS('loaner-free.js');
  ok('🔴 物差し（busyOn）も部品ごしになっている', /function busyOn[\s\S]{0,140}dayOf\(/.test(lf));
}

console.log('\n── ④ 種類を1つ足したら、全部の画面に出る ──');
{
  /* 🔧整備の枠の予行演習＝部品に kind を1つ足して、画面を1行も触らずに出るか */
  const c = boot();
  const add = `
    (function(){
      var K = window.PIT_LOANER_KINDS; K.maint = { label:'整備の枠', busy:true };
      var base = window.pitLoanerDay;
      window.pitLoanerDay = function(id, ds, opt){
        var d = base(id, ds, opt);
        (window.state.maintFrames || []).forEach(function(m){
          if (m.loanerId === id && m.fromDate <= ds && m.toDate >= ds){
            var it = { kind:'maint', id:m.id, from:m.fromDate, to:m.toDate, memo:m.memo, label:'整備の枠',
                       isStart:(m.fromDate===ds), isEnd:(m.toDate===ds), color:'#d6a846' };
            d.items.push(it); d.busy = true;
          }
        });
        return d;
      };
    })();`;
  vm.runInContext(add, c);
  c.state.maintFrames = [{ id:'m1', loanerId:'l2', fromDate:'2026-10-04', toDate:'2026-10-06', memo:'車検の候補' }];
  const d = c.pitLoanerDay('l2','2026-10-05');
  ok('🔴 部品に足すだけで新しい種類が返る', d.items.some(x => x.kind === 'maint'));
  ok('🔴 ふさがり扱いも一緒に付いてくる', d.busy === true);
  ok('🔴 種類の一覧にも載る', !!c.PIT_LOANER_KINDS.maint);
  /* 画面は1行も触っていないのに、items を回している所には出る */
  ok('🔴 画面の側は「items を回す」形になっている（種類名で分岐していない）',
     !/kind\s*===\s*'lend'/.test(JS('fleet.js')));
}

console.log('\n── ⑤ 代車自身の予定の色が落ちない ──');
{
  const c = boot();
  const e = c.pitLoanerDay('l1','2026-10-21').events[0] || null;
  ok('🔴 車検入庫は赤のまま', !!e && e.color === '#ef4444', e && e.color);
  ok('名前も取れる', !!e && e.label === '車検入庫');
  /* 🔴🔴 v2.70.1（ゆうた報告 2026-09-05「整備の仕組みになる以前の車検の予定が代車カレンダーに残ってる」）
     **アプリが勝手に作った予定（auto）は、どの画面にも出さない。**
     ◎正体 … v1.12 のころ、車を保存するたびに作っていた `auto_<車id>_shakenIn` / `_tenken`。
       車両カレンダーは**画面側で**隠していたが、代車カレンダーは隠していなかった＝そこだけ残って見えていた。
     ⚠ 弾くのは**物差し1本**（loaner-free.js）。画面側で隠すのはもうしない（隠し忘れた画面が必ず出る）。
     ⚠ 手で入れたものは auto が付かない＝**そのまま出る**（人が入れたものは勝手に消さない）。 */
  ok('🔴🔴 自動で作った予定は物差しが弾く',
     c.pitLoanerSpan('l1','2026-10-25','2026-10-25',{kinds:['event']}).length === 0);
  ok('🔴 その日を見ても出てこない', c.pitLoanerDay('l1','2026-10-25').events.length === 0);
  ok('🔴 手で入れた予定はちゃんと出る（消してしまわない）',
     c.pitLoanerDay('l1','2026-10-21').events.length === 1);
  /* 🔴 作る側も止めた＝もう増えない */
  ok('🔴🔴 車を保存しても自動の予定を作らない', !/_flSyncVehEvent\(/.test(JS('fleet.js')));
  ok('🔴 残っているぶんは開いた時に片付ける',
     /pitCleanupAutoVehEvents\s*=/.test(JS('fleet.js'))
     && /pitCleanupAutoVehEvents\(\)/.test(JS('fleet.js'))
     && /pitCleanupAutoVehEvents\(\)/.test(JS('loaner.js')));
  ok('⚠ 片付けるのは自動の印が付いたものだけ',
     /keep = evs\.filter\(function \(e\) \{ return !\(e && e\.auto\); \}\)/.test(JS('fleet.js')));
  /* ⚠ 見るのは**書き方（コード）**。説明文に名前が出るのは構わない。 */
  ok('🔴 画面側で「自動は隠す」と書かなくなった',
     !/filter\(function\(x\)\{ return !x\.auto/.test(JS('fleet.js'))
     && !/filter\(function\(e\)\{ return !e\.auto/.test(JS('fleet.js')));
  /* 🔴 代車カレンダーからも消せるようにした（前は車両管理まで行くしか無かった） */
  ok('🔴 代車カレンダーの予定を押すと直す・消せる窓が開く',
     /lo-evt-tag[\s\S]{0,400}flOpenEventModal\(/.test(JS('loaner.js')));
}

console.log('\n─────────────────────────────');
if (BREAK) {
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  if (fail > 0) { console.log('🟢 正しい＝壊したら赤くなった（この見張りは効いている）'); process.exit(0); }
  console.log('🔴 まずい＝壊したのに全部緑のまま。見張りが効いていない'); process.exit(1);
}
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
