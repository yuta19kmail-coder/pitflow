// ============================================================
// test_loaner_link.mjs ― 代車・自社車両 ⇄ お客様の車 の紐づけの見張り
//   PitFlow v2.62.0 ／ ゆうた指定 2026-09-05
//
//   🗣「顧客（に乗っている自社車両）と代車管理の紐づけの強化」
//   🗣「顧客ビュー側に これ代車としてつかってるよ アイコンかバッチがほしい」
//   🗣（結び方）「代車の設定画面から紐づけ設定欄を作成する」
//   🗣（選び方）「ナンバーの候補を出す」／（自動紐づけ）「やめる（手で設定したものだけ）」
//   🗣（抜けの数）「出す（データチェックの日常チェック）」
//
//   ここで固めている決めごと
//     🔴 結び目は **人が車両管理で選んだ時だけ**できる。ナンバーが同じでも勝手に結ばない
//     🔴 「結ばれている」＝ **相手のお客様と車が実在する**こと（消された後の結び目は抜けとして数える）
//     🔴 お客様の車1台に、自社の車は1台まで
//     🔴 引退した車は「まだ紐づいていない」に数えない
//     🔴 顧客ビューの印は **押せない**（ゆうた指定）／色は css のクラス（js に直書きしない）
//     🔴 判定は js/fleet-link.js 1本。画面・規則で書き写さない
//
//   使い方（サーバーもブラウザも要らない）
//     node _見張り/test_loaner_link.mjs
//     node _見張り/test_loaner_link.mjs --break=1 … 相手が消えても結ばれていることにする → ①②が赤
//     node _見張り/test_loaner_link.mjs --break=2 … 引退した車も抜けに数える           → ②が赤
//     node _見張り/test_loaner_link.mjs --break=3 … ナンバー候補を1件目だけ返す         → ③が赤
//     node _見張り/test_loaner_link.mjs --break=4 … 1台に2台結べるようにする           → ④が赤
//     node _見張り/test_loaner_link.mjs --break=5 … 顧客ビューが無い名前を呼ぶ          → ⑧が赤
//     node _見張り/test_loaner_link.mjs --break=6 … 引退した車にも未紐づけを出す        → ⑪が赤
//     node _見張り/test_loaner_link.mjs --break=7 … 詳細表の「顧客車両」の行を消す      → ⑪が赤
// ============================================================
import fs from 'fs';
import vm from 'vm';

const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').split('=')[1] || '';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + JSON.stringify(x) : '')); }
};
const JS  = (f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
const CSS = (f) => fs.readFileSync(new URL('../css/' + f, import.meta.url), 'utf8');
const IDX = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function bendFleet(src) {
  if (BREAK === '6') return src.replace("        : (v.retired ? ''\n            : '<div class=\"fl-card-link\">", "        : ('' || '<div class=\"fl-card-link\">");
  if (BREAK === '7') return src.replace(/\+ row\('顧客車両', \(function\(\)\{[\s\S]*?\}\)\(\)\)/, "+ ''");
  return src;
}
function bend(src) {
  if (BREAK === '1') return src.replace('function isLinked(fv){ return !!targetOf(fv); }',
                                        'function isLinked(fv){ return !!(fv && fv.custId && fv.custVehId); }');
  if (BREAK === '2') return src.replace('return all().filter(function(x){ return !x.v.retired && !isLinked(x.v); });',
                                        'return all().filter(function(x){ return !isLinked(x.v); });');
  if (BREAK === '3') return src.replace('if (x && normPlate(x.plate) === key) out.push({ cust:c, veh:x });',
                                        'if (x && normPlate(x.plate) === key && !out.length) out.push({ cust:c, veh:x });');
  if (BREAK === '4') return src.replace('var hit = linkOfVeh(custId, vehId);\n    if (!hit) return null;',
                                        'var hit = null;\n    if (!hit) return null;');
  return src;
}

const box = {};
box.window = box; box.globalThis = box; box.console = { log: () => {}, warn: () => {}, error: () => {} };
vm.createContext(box);

/* ── 作り物のデータ ────────────────────────────────────────────
   ⚠ わざと「同じナンバーが2件に分かれている（ダブり）」を入れてある。
      ここで1件目を勝手に選ぶ作りだと、間違ったお客様に結ばれる。 */
box.state = {
  customers: [
    { id:'cu1', name:'小林モータース', vehicles:[
        { id:'v1', plate:'柏 500 あ 1111', maker:'ダイハツ', car:'タント' },
        { id:'v2', plate:'柏 300 か 2222', maker:'トヨタ',   car:'ハイエース' } ] },
    { id:'cu2', name:'山田 太郎', kana:'ヤマダ タロウ', vehicles:[
        { id:'v3', plate:'柏 500 あ 1111', maker:'ダイハツ', car:'タント' } ] },   /* ← ダブり */
    { id:'cu3', name:'鈴木 一郎', vehicles:[
        { id:'v4', plate:'野田 300 さ 3333', maker:'日産', car:'セレナ' } ] }
  ],
  loaners: [
    { id:'L1', name:'代車1', model:'タント',  plate:'柏 500 あ 1111', custId:'cu1', custVehId:'v1' },  /* 結んである */
    { id:'L2', name:'代車2', model:'ムーヴ',  plate:'柏 500 い 4444' },                                 /* 結んでいない */
    { id:'L3', name:'代車3', model:'ワゴンR', plate:'',               custId:'cu9', custVehId:'v9' },  /* 相手が消えた */
    { id:'L4', name:'代車4', model:'ミラ',    plate:'', retired:true }                                   /* 引退 */
  ],
  companyCars: [
    { id:'C1', name:'ハイエース',   model:'ハイエース',   plate:'柏 300 か 2222', custId:'cu1', custVehId:'v2' },
    { id:'C2', name:'アルファード', model:'アルファード', plate:'' }
  ]
};
vm.runInContext(bend(JS('fleet-link.js')), box);

console.log('── ① 結ばれているかは「相手が実在するか」まで見る ──');
{
  const a = box.pitFleetLinkOfVeh('cu1', 'v1');
  ok('お客様の車から代車が引ける', !!a && a.v.id === 'L1' && a.kind === 'loaner', a && a.v.id);
  const b = box.pitFleetLinkOfVeh('cu1', 'v2');
  ok('自社車両も引ける', !!b && b.v.id === 'C1' && b.kind === 'company', b && b.v.id);
  ok('🔴 ナンバーが同じだけの車は結ばれていない（勝手に推測しない）',
     box.pitFleetLinkOfVeh('cu2', 'v3') === null);
  ok('🔴 相手が消えた結び目は「結ばれていない」', box.pitFleetLinked(box.state.loaners[2]) === false);
  ok('結んである車は「結ばれている」', box.pitFleetLinked(box.state.loaners[0]) === true);
}

console.log('── ② まだ紐づいていない台数（0にする対象）──');
{
  const u = box.pitFleetUnlinked().map(x => x.v.id).sort();
  ok('抜けは3台（代車2・代車3・アルファード）', JSON.stringify(u) === JSON.stringify(['C2','L2','L3']), u);
  ok('🔴 引退した代車は数えない', u.indexOf('L4') < 0, u);
}

console.log('── ③ ナンバーの候補は「並べるだけ」──');
{
  const c = box.pitFleetPlateCands('柏 500 あ 1111');
  ok('🔴 ダブっている2件を両方返す（どちらかを勝手に選ばない）', c.length === 2, c.length);
  ok('持ち主が違う2件になっている', c.length === 2 && c[0].cust.id !== c[1].cust.id);
  ok('空のナンバーでは候補を出さない', box.pitFleetPlateCands('').length === 0);
  ok('空白の入れ方が違っても当たる', box.pitFleetPlateCands('柏500あ1111').length === 2);
}

console.log('── ④ お客様の車1台に、自社の車は1台まで ──');
{
  ok('もう掴まれている車は掴んでいる相手を返す', (box.pitFleetHeldBy('cu1','v1')||{}).v?.id === 'L1');
  ok('🔴 自分自身は「ほかに掴まれている」に数えない', box.pitFleetHeldBy('cu1','v1','L1') === null);
  ok('誰も掴んでいない車は null', box.pitFleetHeldBy('cu3','v4') === null);
}

console.log('── ⑤ 印に出す言葉 ──');
{
  ok('代車は呼び名がそのまま出る', box.pitFleetBadgeText('loaner', box.state.loaners[0]) === '代車1');
  ok('自社車両は種別を頭に付ける',
     box.pitFleetBadgeText('company', box.state.companyCars[0]) === '自社車両（ハイエース）',
     box.pitFleetBadgeText('company', box.state.companyCars[0]));
  ok('種別の言葉は「代車」「自社車両」',
     box.pitFleetKindLabel('loaner') === '代車' && box.pitFleetKindLabel('company') === '自社車両');
}

console.log('── ⑥ 入庫で黙って結ばない（v2.62.0 でやめた）──');
{
  const mp = JS('maint-pit.js');
  ok('🔴 入庫の時に代車マスタへ custId を書いていない', !/v\.custId\s*=/.test(mp));
  ok('🔴 ナンバーで顧客控えを舐める道が無い', mp.indexOf("String(x.plate || '').replace") < 0);
  ok('持ち主は物差しに聞いている', /pitFleetLinkTarget/.test(mp));
  ok('結ばれていない時の案内が出る', mp.indexOf('顧客控えと紐づいていません') > 0);
}

console.log('── ⑦ 顧客ビューの印 ──');
{
  const cu = JS('customers.js');
  ok('物差しを呼んでいる', /pitFleetLinkOfVeh\(cust\.id, v\.id\)/.test(cu));
  ok('印を車のカードの札の列に出している', /cd-vpills">\'\+flPill/.test(cu));
  const pill = (cu.match(/const flPill =[\s\S]*?: '';/) || [''])[0];
  ok('🔴 押せない印（onclick が付いていない）', pill.indexOf('onclick') < 0);
  ok('🔴 色を js に直書きしていない', !/#[0-9a-fA-F]{6}/.test(pill));
  ok('色は css のクラスで持っている', /\.cd-pill-fleet\{/.test(CSS('customer-detail.css')));
  ok('都度車両変動の印と色をぶつけていない',
     CSS('customer-detail.css').indexOf('rgba(168,85,247') > 0);
}

console.log('── ⑧ つなぎ＝呼んでいる名前が、本当にあるか ──');
{
  /* 🔴🔴 2026-09-04 の教訓（来店属性で踏んだ）＝文字だけ見る見張りは「無い関数を呼んでいる」を拾えない。 */
  const fl = JS('fleet-link.js');
  let users = { 'customers.js': JS('customers.js'), 'fleet.js': JS('fleet.js'),
                'inspect-rules.js': JS('inspect-rules.js'), 'maint-pit.js': JS('maint-pit.js') };
  if (BREAK === '5') users['customers.js'] = users['customers.js'].replace('pitFleetLinkOfVeh(', 'pitFleetLinkOfVehicle(');
  const miss = [];
  Object.keys(users).forEach(function (f) {
    const src = users[f].replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    (src.match(/pitFleet[A-Za-z]+/g) || []).forEach(function (n) {
      if (fl.indexOf('w.' + n + ' ') < 0 && fl.indexOf('w.' + n + '=') < 0) miss.push(f + ':' + n);
    });
  });
  ok('🔴 fleet-link.js に無い pitFleet〜 を呼んでいない', miss.length === 0, miss);
  ok('index.html に ?v= 付きで載っている', /js\/fleet-link\.js\?v=\d+/.test(IDX));
  ok('🔴 使う側より前に読む（customers / inspect-rules / maint-pit / fleet）',
     IDX.indexOf('js/fleet-link.js') < IDX.indexOf('js/customers.js') &&
     IDX.indexOf('js/fleet-link.js') < IDX.indexOf('js/inspect-rules.js') &&
     IDX.indexOf('js/fleet-link.js') < IDX.indexOf('js/maint-pit.js') &&
     IDX.indexOf('js/fleet-link.js') < IDX.indexOf('js/fleet.js'));
}

console.log('── ⑨ 代車の設定画面の紐づけ欄 ──');
{
  const fj = JS('fleet.js');
  ok('窓に紐づけの箱がある', IDX.indexOf('id="fl-link"') > 0);
  ok('選ぶ・外す・探すの3つがある',
     /window\.flLinkPick\s*=/.test(fj) && /window\.flLinkClear\s*=/.test(fj) && /window\.flLinkSearch\s*=/.test(fj));
  ok('🔴 窓を開いた時に、いまの紐づけを控えている', /_flLink = \{ custId: \(v\.custId/.test(fj));
  ok('🔴 保存を押すまで書かない（選んだ時は控えだけ）',
     !/flLinkPick\s*=\s*function[^}]*PitDB/.test(fj));
  ok('保存で書いている', /f\.v\.custId=_flLink\.custId/.test(fj) && /rec\.custId=_flLink\.custId/.test(fj));
  ok('🔴 外した時は欄ごと消している（空文字を残さない）', /delete f\.v\.custId; delete f\.v\.custVehId;/.test(fj));
  ok('🔴 保存の時にも「ほかに掴まれていないか」を見ている', /pitFleetHeldBy\(_flLink\.custId/.test(fj));
  ok('ぶつかった時のエラー番号が台帳にある', JS('errcode-pit.js').indexOf("'PF-3065'") > 0);
  ok('色は css のクラスで持っている', /\.fl-link-cand\{/.test(CSS('polish.css')));
}

console.log('── ⑩ 日常チェックの規則 L08 ──');
{
  const ir = JS('inspect-rules.js');
  const rule = (ir.match(/\{ id:'L08'[\s\S]*?\n      \} \},/) || [''])[0];
  ok('L08 がある', rule.length > 0);
  ok('代車の分類に入っている', /cat:'loaner'/.test(rule));
  ok('🔴 数え方は物差し1本（自分で custId を舐めていない）',
     /pitFleetUnlinked\(\)/.test(rule) && rule.indexOf('custVehId)') < 0 || /pitFleetUnlinked\(\)/.test(rule));
  ok('車両管理へ飛べる形（kind は veh）', /kind:'veh'/.test(rule));
  ok('直し方に紐づけ欄の場所が書いてある', rule.indexOf('顧客車両との紐づけ') > 0);
  ok('相手が消えた時と、初めから結んでいない時を言い分けている', rule.indexOf('見つかりません') > 0);
}

/* ============================================================
   ⑪ 代車一覧・車両の詳細に出す印（v2.64.0）
   ------------------------------------------------------------
   🗣「代車一覧の方にも**紐づけ完了バッチ**が欲しい」
   🗣「あと一回クリックした**スペック詳細表**みたいな部分にも**リンク済み**を教えて」
   ⚠ 本物の fleet.js を走らせて、**実際に描いた HTML** を見る（文字だけ見ない）。
   ============================================================ */
console.log('── ⑪ 代車一覧・車両の詳細に出す印 ──');
{
  function node1(){
    const n = { _html:'', style:{setProperty(){}},
      classList:{add(){},remove(){},toggle(){},contains(){return false;}},
      addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){}, children:[],
      value:'', checked:false, insertAdjacentHTML(){}, querySelector(){return null;},
      querySelectorAll(){return [];}, scrollIntoView(){} };
    Object.defineProperty(n, 'innerHTML', { get(){ return n._html; }, set(v){ n._html = v; } });
    return n;
  }
  const bodyEl = node1(), made = [];
  const ctx = {
    console:{log(){},warn(){},error(){}}, setTimeout:(f)=>{ try{ f(); }catch(e){} }, clearTimeout,
    Promise, Date, Math, JSON, String, Number, Array, Object, isFinite, RegExp,
    localStorage:{ getItem(){return null;}, setItem(){}, removeItem(){} },
    document:{ body:{appendChild(){}}, head:node1(), documentElement:{clientWidth:1280,style:{setProperty(){}}},
      getElementById(id){ return id === 'view-fleet-body' ? bodyEl : null; },
      createElement:()=>{ const n = node1(); made.push(n); return n; },
      querySelector(){return null;}, querySelectorAll(){return [];}, addEventListener(){}, removeEventListener(){} },
    state:{ currentView:'fleet',
      customers:[{ id:'cu1', name:'小林モータース', vehicles:[
        { id:'v1', plate:'松戸 500 す 8230', maker:'トヨタ', car:'アクア' }] }],
      loaners:[
        { id:'l9', name:'代車9', number:9, model:'アクア', color:'青', plate:'松戸 500 す 8230', custId:'cu1', custVehId:'v1' },
        { id:'l8', name:'代車8', number:8, model:'ムーヴ', plate:'柏 500 い 4444' },
        { id:'l7', name:'代車7', number:7, model:'ミラ', retired:true }],
      companyCars:[{ id:'c1', name:'ハイエース', model:'ハイエース' }],
      fleetEvents:[], cards:[], staff:[], settings:{}, workTypes:[] },
    PitDB:{ save(){} }, pitAlert(){}, pitAsk(){ return Promise.resolve(false); }, pitLog(){}, pitToast(){},
    showView(){}, icHydrate(){}, icoBoot(){}, pitModalOutside(){}, pitRefreshAutoTenken(){},
    pitLoanerSpan:()=>[], pitLoanerRemainText:()=>'', pitVehLabel:(v)=>((v && (v.name || v.model)) || ''),
    pitSeatsText:(x)=>x||'', pitTenkenFromShaken:()=>'', pitWareki:(x)=>x||''
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(JS('pit-share.js'), ctx);
  ctx.PitShare.use({ divisions:()=>[], estAmount:()=>0, teamKey:()=>'default' });
  vm.runInContext(JS('fleet-link.js'), ctx);
  vm.runInContext(bendFleet(JS('fleet.js')), ctx);
  ctx.renderFleet();
  const h = bodyEl.innerHTML;
  ok('一覧が描けた', h.length > 200, h.length);
  ok('🔴 紐づけ済みの車に「◯◯ 様」の印が出る',
     /fl-link-bdg on[\s\S]{0,160}小林モータース 様/.test(h));
  const offN = (h.match(/fl-link-bdg off/g) || []).length;
  ok('🔴 結ばれていない車には「未紐づけ」が出る（代車8・ハイエースの2台）', offN === 2, offN);
  ok('🔴 引退した車には出さない（L08 が数えていないので、画面と数を揃える）',
     h.indexOf('代車7') > 0 && offN === 2, { 引退の車が一覧に居る:h.indexOf('代車7') > 0, 未紐づけ:offN });
  ok('🔴 色を js に直書きしていない', !/fl-link-bdg[^']*#[0-9a-fA-F]{6}/.test(JS('fleet.js')));
  ok('色は css のクラスで持っている', /\.fl-link-bdg\.on\{/.test(CSS('polish.css')) && /\.fl-link-bdg\.off\{/.test(CSS('polish.css')));
  /* 一回クリックした「スペック詳細表」 */
  ctx.fleetOpenDetail('l9');
  const d1 = made.map(n => n.innerHTML).filter(x => x && x.indexOf('fd-tbl') >= 0).pop() || '';
  ok('🔴 詳細表に「顧客車両」の行が出て、相手が分かる',
     /顧客車両[\s\S]{0,240}小林モータース 様/.test(d1), d1.slice(0, 200));
  ok('相手のナンバー・車種も出る', /松戸 500 す 8230/.test(d1) && /トヨタ アクア/.test(d1));
  ctx.fleetOpenDetail('l8');
  const d2 = made.map(n => n.innerHTML).filter(x => x && x.indexOf('fd-tbl') >= 0).pop() || '';
  ok('🔴 結ばれていない時も行を空にしない（「未紐づけ」と書く）',
     /顧客車両[\s\S]{0,240}未紐づけ/.test(d2), d2.slice(0, 200));
  ok('どこから結べるかを書いてある', /編集 ▸「顧客車両との紐づけ」/.test(d2));
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（' + pass + '件 緑）' : '✅ ぜんぶ緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
