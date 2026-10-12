/* ===================================================================
   🚙 車販作業ビュー：洗車の段に代車が出るか（v2.173.0・ゆうた 2026-10-12）

   ◎なにを見張るか
     ① 次に出す日の前日に、洗車の段（今日）に出る／明後日に出すなら「明日」
     ② 前の貸出が戻っていない代車はグレー＋「未返却」＋完了が押せない
     ③ 前の予約が返車済み（自動返却）なら戻ったことになる＝グレーにしない
     ④ 仮押さえ・キャンセルされた予約・引退した代車は出ない
     ⑤ 洗った印（washDone＝代車のid）で「完了済み」へ。代車を差し替えたら印は外れる
     ⑥ 担当は出す相手の予約の担当／出す相手の名前はカードに出さない（ホバーの文字だけ）

   ◎使い方
       node _見張り/test_carsales_loaner.mjs
       node _見張り/test_carsales_loaner.mjs --break=1 … 戻ったかを見ない（いつも戻った扱い）→ ②が赤
       node _見張り/test_carsales_loaner.mjs --break=2 … 仮押さえも拾う                       → ④が赤
       node _見張り/test_carsales_loaner.mjs --break=3 … 洗った印の代車idを見ない             → ⑤が赤
   ⚠ 壊し方が空振りしていないか（＝赤くなるか）を必ず確かめること。
   ⚠ 定休日・祝日の表（PitCal・Holidays）は読まない＝前の営業日は「前の日」になる。
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
  if (name !== 'car-sales.js') return src;
  const r = (a, b) => { if (src.indexOf(a) < 0) throw new Error('壊し方が当たらない: ' + a); return src.replace(a, b); };
  if (BREAK === '1') return r('if (prev && !prev.returned){', 'if (false){');
  if (BREAK === '2') return r('if (!a || a.hold || !a.loanerId', 'if (!a || !a.loanerId');
  if (BREAK === '3') return r('return !!a.washDone && a.washDone === a.loanerId;', 'return !!a.washDone;');
  return src;
}

const el = () => ({ innerHTML:'', style:{setProperty(){}},
  classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  addEventListener(){}, appendChild(){}, remove(){}, children:[], value:'',
  querySelector(){return null;}, querySelectorAll(){return [];} });

function ymdL(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dISO(n){ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+n); return ymdL(d); }

function boot(S){
  const body = el();
  const ctx = { console, setTimeout(){}, clearTimeout, Promise, Date, Math, JSON,
    String, Number, Array, Object, isFinite, RegExp, parseInt, parseFloat,
    localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    document:{ body:el(), head:el(), documentElement:el(),
      getElementById(id){ return id === 'carsales-body' ? body : null; },
      createElement:()=>el(), querySelector(){return null;}, querySelectorAll(){return [];},
      addEventListener(){}, dispatchEvent(){} },
    state:Object.assign({ customers:[], staff:[], boards:[], settings:{}, workTypes:[], dropTypes:[] }, S),
    PitDB:{ save(){} }, pitAlert(){}, pitLog(){}, pitToast(){},
    ymd: ymdL, cardHtml(c){ return '<div class="pit-card" data-id="'+c.id+'"></div>'; },
    statusLabel(s){ return s; } };
  ctx.window = ctx; vm.createContext(ctx);
  ['pit-share.js','coreflow-loaner-remain.js','loaner-free.js','coreflow-return-plan.js','return-slot.js','car-sales.js']
    .forEach(f => { try { vm.runInContext(bend(f, JS(f)), ctx); } catch(e){ if (f === 'car-sales.js') throw e; } });
  ctx.renderCarSales();
  return { html: body.innerHTML, ctx };
}

/* 代車カード1枚ずつ（どの段・今日/明日・グレーか・ボタン） */
function loItems(html){
  const out = [];
  const secs = html.split('<div class="cs-sec">').slice(1);
  secs.forEach(p => {
    const title = (p.match(/<div class="cs-sec-h">([\s\S]*?)<\/div>/) || [,''])[1].replace(/<[^>]*>/g,'').trim();
    const [open, done = ''] = p.split('cs-done-strip');
    const grab = (src, isDone) => {
      let group = '';
      src.split(/(?=<div class="cs-subh">|<div class="cs-item)/).forEach(chunk => {
        if (chunk.startsWith('<div class="cs-subh">')) { group = chunk.replace(/<[^>]*>/g,'').trim().slice(0, 2); return; }
        if (chunk.indexOf('cs-lo') < 0) return;
        const name = (chunk.match(/<span class="pcm-name">([^<]*)</) || [,''])[1];
        out.push({ sec: title, group, name, done: isDone, gray: chunk.indexOf('is-retpend') >= 0, html: chunk,
          canDone: chunk.indexOf('csLoDone(') >= 0, wait: chunk.indexOf('戻ってから洗車') >= 0 });
      });
    };
    grab(open, false); grab(done, true);
  });
  return out;
}

const loaners = [
  { id:'L1', name:'代車1', model:'ワゴンR' }, { id:'L2', name:'代車2', model:'ムーヴ' },
  { id:'L3', name:'代車3', model:'タント' },  { id:'L4', name:'代車4', model:'ミラ' },
  { id:'L5', name:'代車5', model:'アルト' },  { id:'L6', name:'代車6', model:'N-BOX', retired:true },
  { id:'L7', name:'代車7', model:'ハスラー' }, { id:'L8', name:'代車8', model:'デイズ' },
  { id:'L9', name:'代車9', model:'キャスト' }
];
const cards = [
  { id:'P1', customer:'高橋 一郎', status:'work', reserveDate:dISO(-5) },                       /* L2の前の客＝まだ作業中 */
  { id:'P3', customer:'渡辺 三郎', status:'returned', reserveDate:dISO(-5) },                   /* L3の前の客＝返車済み */
  { id:'N1', customer:'田中 花子', status:'reserved', reserveDate:dISO(1), reserveTime:'9:30', frontStaff:'椎名', car:'プリウス' },
  { id:'N2', customer:'伊藤 次郎', status:'reserved', reserveDate:dISO(1), reserveTime:'10:00', frontStaff:'箱崎', car:'アクア' },
  { id:'N3', customer:'中村 四郎', status:'reserved', reserveDate:dISO(1), frontStaff:'菅谷' },
  { id:'N4', customer:'吉田 五郎', status:'reserved', reserveDate:dISO(2), frontStaff:'椎名' },
  { id:'N5', customer:'取消 六郎', status:'cancelled', reserveDate:dISO(1) },
  { id:'N7', customer:'洗済 七郎', status:'reserved', reserveDate:dISO(1) },
  { id:'N8', customer:'差替 八郎', status:'reserved', reserveDate:dISO(1) }
];
const A = (id, lo, cardId, f, t, x) => Object.assign({ id, loanerId:lo, cardId, fromDate:f, toDate:t }, x || {});
const assigns = [
  A('a1p','L1',null,dISO(-6),dISO(-2),{ returned:true, manual:true, customer:'前 太郎' }),
  A('a1', 'L1','N1',dISO(1),dISO(4)),                                  /* 戻っている→今日・完了できる */
  A('a2p','L2','P1',dISO(-5),dISO(0)),                                 /* まだ返ってこない */
  A('a2', 'L2','N2',dISO(1),dISO(3)),                                  /* → グレー */
  A('a3p','L3','P3',dISO(-5),dISO(-1)),                                /* 札は未返却だが予約は返車済み */
  A('a3', 'L3','N3',dISO(1),dISO(3)),
  A('a4', 'L4','N4',dISO(2),dISO(5)),                                  /* 明後日に出す→「明日」 */
  A('a5', 'L5',null,dISO(1),dISO(2),{ hold:true, memo:'仮押さえ' }),     /* 出ない */
  A('a5b','L5','N5',dISO(1),dISO(2)),                                  /* 予約キャンセル→出ない */
  A('a6', 'L6','N1',dISO(1),dISO(2)),                                  /* 引退→出ない */
  A('a7', 'L7','N7',dISO(1),dISO(2),{ washDone:'L7' }),                /* 洗った */
  A('a8', 'L8','N8',dISO(1),dISO(2),{ loanerId:'L8', washDone:'L9' })  /* 差し替え前の印 */
];

const { html, ctx } = boot(JSON.parse(JSON.stringify({ loaners, cards, loanerAssigns: assigns })));
const items = loItems(html);
const get = (nm) => items.find(x => x.name === nm) || null;

console.log('\n── ① 出す日の前日に出る ──');
const i1 = get('代車1');
ok('代車1（明日出す）は洗車の段の「今日」', i1 && i1.sec.indexOf('洗車') === 0 && i1.group === '今日', i1);
ok('代車1は完了を押せる', i1 && i1.canDone && !i1.gray, i1 && i1.html);
ok('カードの下は「入庫 日付 時間」', i1 && /入庫 \d+\/\d+（.）\s9:30/.test(i1.html), i1 && i1.html);
const i4 = get('代車4');
ok('代車4（明後日出す）は「明日」', i4 && i4.group === '明日', i4);

console.log('\n── ② 戻っていない代車 ──');
const i2 = get('代車2');
ok('代車2はグレー', i2 && i2.gray, i2);
ok('「未返却」が出る', i2 && i2.html.indexOf('未返却') >= 0);
ok('完了を押せない（戻ってから洗車）', i2 && !i2.canDone && i2.wait, i2 && i2.html);
ok('ホバーにどこにいるか', i2 && i2.html.indexOf('高橋様から') >= 0, i2 && i2.html);

console.log('\n── ③ 前の予約が返車済みなら戻っている ──');
const i3 = get('代車3');
ok('代車3はグレーにしない', i3 && !i3.gray && i3.canDone, i3);

console.log('\n── ④ 出さないもの ──');
ok('仮押さえ・キャンセルの代車5は出ない', !get('代車5'), items.map(x => x.name));
ok('引退した代車6は出ない', !get('代車6'));

console.log('\n── ⑤ 洗った印 ──');
const i7 = get('代車7');
ok('代車7は「完了済み」', i7 && i7.done, i7);
const i8 = get('代車8');
ok('別の代車の印（差し替え前）は効かない＝代車8は未完了', i8 && !i8.done, i8);
ctx.csLoDone('a1');
ok('完了を押すと札に代車のidが入る', ctx.state.loanerAssigns.find(a => a.id === 'a1').washDone === 'L1');
ctx.csLoUndo('a1');
ok('戻すと印が消える', !ctx.state.loanerAssigns.find(a => a.id === 'a1').washDone);

console.log('\n── ⑥ 担当・出す相手 ──');
ok('担当は出す相手の予約の担当', i1 && i1.html.indexOf('>椎名<') >= 0, i1 && i1.html);
ok('出す相手の名前はカードの文字に出ない（ホバーだけ）',
   i1 && i1.html.replace(/title="[^"]*"/g, '').indexOf('田中') < 0, i1 && i1.html);
ok('押すと出す相手の予約詳細', i1 && i1.html.indexOf("openDetail('N1')") >= 0);

console.log('\n────────────────────────────');
console.log((fail ? '❌' : '✅') + ' ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
