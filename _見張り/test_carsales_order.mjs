/* ===================================================================
   🧽 車販作業ビュー：段が「受注が取れたか」で分かれるか（v2.51.0・D-1/D-2）

   ◎なにを見張るか
     ① 段は5つ（「その他依頼事項」は畳んだ）
     ② 受注前は「直近1か月」／受注後は「コーティング・その他依頼」
     ③ 同じ車が2つの段（上下）に同時に出ない
     ④ 「その他依頼事項」で押してあった完了の印を引き継ぐ
     ⑤ 「他にもあり」が出る／自分の段は書かない
     ⑥ 依頼メモが「コーティング・その他依頼」に出る

   ◎使い方
       node _見張り/test_carsales_order.mjs
       node _見張り/test_carsales_order.mjs --break=1 … 受注後の条件を昔（coatingOKだけ）に戻す → ②が赤
       node _見張り/test_carsales_order.mjs --break=2 … 直近1か月から「受注前だけ」を外す       → ③が赤
       node _見張り/test_carsales_order.mjs --break=3 … 完了の印を coatingDone だけに戻す        → ④が赤
       node _見張り/test_carsales_order.mjs --break=4 … 「他にもあり」を出さない                 → ⑤が赤
   ⚠ 壊し方が空振りしていないか（＝赤くなるか）を必ず確かめること。
      v2.49.0 で保存先が変わって壊し方が当たらなくなり、**効いていないのに全部緑**になっていた。
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
  if (BREAK === '1' && name === 'car-sales.js')
    return src.replace('_csSalesish(c) && _csOrdered(c) && _csActive(c)', '_csHasCoat(c) && c.coatingOK && _csActive(c)');
  if (BREAK === '2' && name === 'car-sales.js')
    return src.replace('_csSalesish(c) && !_csOrdered(c) && _csActive(c)', '_csSalesish(c) && _csActive(c)');
  if (BREAK === '3' && name === 'car-sales.js')
    return src.replace('function _csCoatDone(c){ return !!c.coatingDone || !!c.salesReqDone; }',
                       'function _csCoatDone(c){ return !!c.coatingDone; }');
  if (BREAK === '4' && name === 'car-sales.js')
    return src.replace("return '<div class=\"cs-dup\">他にもあり：' + w.join('・') + '</div>';", "return '';");
  return src;
}

const el = () => ({ innerHTML:'', style:{setProperty(){}},
  classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  addEventListener(){}, appendChild(){}, remove(){}, children:[], value:'',
  querySelector(){return null;}, querySelectorAll(){return [];} });

function ymdL(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dISO(n){ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+n); return ymdL(d); }

function boot(cards){
  const body = el();
  const ctx = { console, setTimeout(){}, clearTimeout, Promise, Date, Math, JSON,
    String, Number, Array, Object, isFinite, RegExp, parseInt, parseFloat,
    localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    document:{ body:el(), head:el(), documentElement:el(),
      getElementById(id){ return id === 'carsales-body' ? body : null; },
      createElement:()=>el(), querySelector(){return null;}, querySelectorAll(){return [];},
      addEventListener(){}, dispatchEvent(){} },
    state:{ cards, customers:[], staff:[], boards:[], settings:{}, workTypes:[
      { id:'shaken', label:'車検', color:'#ef4444' }, { id:'12pt', label:'12点', color:'#f97316' },
      { id:'general', label:'一般', color:'#84cc16' }, { id:'coat1y', label:'1Y', color:'#8b5cf6', combinable:true },
      { id:'coat3m', label:'3M', color:'#a855f7', combinable:true },
      { id:'carsale', label:'車販依頼', color:'#06b6d4', combinable:true, hideWhenOthers:true } ], dropTypes:[] },
    PitDB:{ save(){} }, pitAlert(){}, pitLog(){}, pitToast(){},
    ymd: ymdL, cardHtml(c){ return '<div class="pit-card" data-id="'+c.id+'"></div>'; },
    statusLabel(s){ return s; } };
  ctx.window = ctx; vm.createContext(ctx);
  ['pit-share.js','intern-pit.js','coreflow-return-plan.js','return-slot.js','car-sales.js']
    .forEach(f => { try { vm.runInContext(bend(f, JS(f)), ctx); } catch(e){ /* 無い部品は飛ばす */ } });
  ctx.renderCarSales();
  return body.innerHTML;
}

/* 段ごとに、中にいるカードの id を拾う */
function sections(html){
  const out = [];
  const parts = html.split('<div class="cs-sec">').slice(1);
  parts.forEach(p => {
    const t = (p.match(/<div class="cs-sec-h">([\s\S]*?)<\/div>/) || [,''])[1].replace(/<[^>]*>/g,'').trim();
    const ids = [...p.matchAll(/data-id="([^"]+)"/g)].map(m => m[1]);
    out.push({ title:t, ids, html:p });
  });
  return out;
}

const CARDS = [
  /* 受注前（バッジだけ）＝直近1か月 */
  { id:'A', customer:'受注前 太郎', status:'reserved', reserveDate:dISO(5), workTypes:['carsale'] },
  /* 受注後（工程の印）＝コーティング・その他依頼 */
  { id:'B', customer:'受注後 次郎', status:'work', reserveDate:dISO(-2), workTypes:['carsale'],
    salesReq:true, salesReqMemo:'全面ガラス撥水加工' },
  /* 受注後（コーティング受注OK）＋洗車も要る＝2つの段に出る */
  { id:'C', customer:'両方 三郎', status:'workDone', reserveDate:dISO(-3), workTypes:['coat1y'],
    coatingOK:true, needWash:true, returnStage:'returnWait', returnDate:dISO(1) },
  /* 昔「その他依頼事項」で完了を押してあった車 */
  { id:'D', customer:'済み 四郎', status:'work', reserveDate:dISO(-1), workTypes:['general'],
    salesReq:true, salesReqDone:true, salesReqMemo:'1Yコーティング施工依頼' },
  /* ふつうの洗車だけ */
  { id:'E', customer:'洗車 五郎', status:'workDone', needWash:true, returnStage:'returnWait', returnDate:dISO(1) }
];

const html = boot(JSON.parse(JSON.stringify(CARDS)));
const secs = sections(html);
const titles = secs.map(s => s.title);
const find = (kw) => secs.find(s => s.title.indexOf(kw) >= 0) || { ids:[], html:'', title:'(無い)' };

console.log('\n── ① 段は5つ。「その他依頼事項」は無い ──');
ok('段が5つある', secs.length === 5, titles);
ok('「その他依頼事項」が無い', !titles.some(t => t.indexOf('その他依頼事項') >= 0), titles);

console.log('\n── ② 受注前は予定・受注後は依頼 ──');
const plan = find('直近1か月'), req = find('コーティング・その他依頼');
ok('受注前（バッジだけ）は「直近1か月」', plan.ids.indexOf('A') >= 0, plan.ids);
ok('受注後（工程の印）は「コーティング・その他依頼」', req.ids.indexOf('B') >= 0, req.ids);
ok('受注前の車は「コーティング・その他依頼」に出ない', req.ids.indexOf('A') < 0, req.ids);
ok('受注後の車は「直近1か月」に出ない', plan.ids.indexOf('B') < 0, plan.ids);

console.log('\n── ③ 同じ車が上下2つの段に同時に出ない ──');
const dup = plan.ids.filter(x => req.ids.indexOf(x) >= 0);
ok('「直近1か月」と「コーティング・その他依頼」で重なる車が0台', dup.length === 0, dup);

console.log('\n── ④ 畳んだ段の完了の印を引き継ぐ ──');
ok('済み四郎は「完了済み」の棚にいる', /完了済み[\s\S]*data-id="D"/.test(req.html), req.html.slice(0,200));
ok('済み四郎は未完了の側にいない', !/cs-sec-body[\s\S]*?data-id="D"[\s\S]*?cs-done-strip/.test(req.html));

console.log('\n── ⑤ 他にもあり ──');
/* ⚠ 返車日が今日・明日なら「洗車」、それより先なら「今週の洗車予定」に入る。
   曜日で変わるので**どちらかに居ればよい**とする（ここで日付の条件を書き写さない）。 */
const washSecs = secs.filter(s => s.title.indexOf('洗車') >= 0);
const washIds  = washSecs.reduce((a, s) => a.concat(s.ids), []);
const wash     = { ids: washIds, html: washSecs.map(s => s.html).join('') };
ok('両方三郎は洗車の段にもいる', wash.ids.indexOf('C') >= 0, wash.ids);
ok('依頼の段のカードに「他にもあり」が出る', req.html.indexOf('他にもあり') >= 0);
ok('自分の段の名前は書かない', req.html.indexOf('他にもあり：コーティング依頼') < 0);
ok('洗車だけの車には「他にもあり」を出さない',
   !(wash.html.split('data-id="E"')[1] || '').startsWith('</div>他にもあり'));

console.log('\n── ⑥ 依頼メモ ──');
ok('依頼メモが「コーティング・その他依頼」に出る', req.html.indexOf('全面ガラス撥水加工') >= 0);

console.log('\n────────────────────────────');
console.log((fail ? '❌' : '✅') + ' ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
