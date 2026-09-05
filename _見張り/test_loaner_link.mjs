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
//     node _見張り/test_loaner_link.mjs --break=7 … 詳細表の「顧客紐づけ」の行を消す    → ⑪が赤
//     node _見張り/test_loaner_link.mjs --break=8 … 履歴に「どの車か」を渡さない        → ⑫が赤
//     node _見張り/test_loaner_link.mjs --break=9 … 未紐づけでもお客様側へ飛ばす        → ⑫が赤
//     node _見張り/test_loaner_link.mjs --break=10 … 車両の選択肢に番号を戻す           → ⑬が赤
//     node _見張り/test_loaner_link.mjs --break=11 … 内容テンプレの置き場所を戻さない   → ⑬が赤
//     node _見張り/test_loaner_link.mjs --break=12 … ×が候補ぜんぶを消すようにする      → ⑭が赤
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
  if (BREAK === '7') return src.replace(/\+ row\('顧客紐づけ', \(function\(\)\{[\s\S]*?\}\)\(\)\)/, "+ ''");
  if (BREAK === '8') return src.replace("custHistory(lk.cust.id, lk.veh.id)", "custHistory(lk.cust.id)");
  if (BREAK === '9') return src.replace("  if (!lk){", "  if (false){");
  return src;
}
function bendMaint(src) {
  if (BREAK === '10') return src.replace("+ '>' + esc(vehName(v)) + '</option>';",
                                         "+ '>' + esc(vehName(v)) + '（' + esc(vehNo(v)) + '）</option>';");
  if (BREAK === '11') return src.replace("try { w.WorkContent.setHost(''); if (w.WorkContent.closePanel) w.WorkContent.closePanel(); } catch(e){}", "");
  if (BREAK === '12') return src.replace("c.maintSpans = arr(c.maintSpans).filter(function(x){ return x.sid !== sp.sid; });",
                                         "c.maintSpans = [];");
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
  /* 🔴 v2.65.0（ゆうた「うるさい」「自社🔗済 ／ 🔗済 ぐらいの内容で」）
     印は**種別＋済**だけ。車の呼び名も、お客様の名前も画面には出さない。 */
  ok('🔴 代車の印は「代車」の2文字（呼び名を出さない）',
     box.pitFleetBadgeText('loaner', box.state.loaners[0]) === '代車',
     box.pitFleetBadgeText('loaner', box.state.loaners[0]));
  ok('🔴 自社車両の印は「自社」の2文字（車種を出さない）',
     box.pitFleetBadgeText('company', box.state.companyCars[0]) === '自社',
     box.pitFleetBadgeText('company', box.state.companyCars[0]));
  ok('相手のお名前は、カーソルを乗せた時の説明に回している',
     /小林モータース 様/.test(box.pitFleetBadgeTitle('loaner', box.state.loaners[0])),
     box.pitFleetBadgeTitle('loaner', box.state.loaners[0]));
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
  /* 🔴 v2.65.0 短い印になっているか＝「代車🔗済」「自社🔗済」 */
  ok('🔴 印は「済」で終わる短い形（車の呼び名を並べていない）',
     /data-ic=link[\s\S]{0,40}済<\/span>/.test(pill) && pill.indexOf('pitFleetBadgeTitle') > 0, pill.slice(-160));
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
        { id:'v1', plate:'松戸 500 す 8230', maker:'トヨタ', car:'アクア', karteNo:'K-777' }] }],
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
  /* 🔴 v2.65.0（ゆうた「うるさい」）代車一覧は**「🔗済」だけ**。ここは自社の車しか並ばないので種別も要らない。 */
  ok('🔴 紐づけ済みの車に「済」の印が出る',
     /fl-link-bdg on[\s\S]{0,140}data-ic=link[\s\S]{0,30}済<\/span>/.test(h));
  ok('🔴 一覧にお客様の名前を並べない（カーソルを乗せた時だけ）',
     h.indexOf('>小林モータース 様<') < 0 && /title="[^"]*小林モータース 様/.test(h));
  const offN = (h.match(/fl-link-bdg off/g) || []).length;
  ok('🔴 結ばれていない車には「未紐づけ」が出る（代車8・ハイエースの2台）', offN === 2, offN);
  ok('🔴 引退した車には出さない（L08 が数えていないので、画面と数を揃える）',
     h.indexOf('代車7') > 0 && offN === 2, { 引退の車が一覧に居る:h.indexOf('代車7') > 0, 未紐づけ:offN });
  ok('🔴 色を js に直書きしていない', !/fl-link-bdg[^']*#[0-9a-fA-F]{6}/.test(JS('fleet.js')));
  ok('色は css のクラスで持っている', /\.fl-link-bdg\.on\{/.test(CSS('polish.css')) && /\.fl-link-bdg\.off\{/.test(CSS('polish.css')));
  /* 一回クリックした「スペック詳細表」＝ v2.65.0「顧客紐づけ：🔗済み　カルテNo」ぐらいの内容で（ゆうた指定） */
  ctx.fleetOpenDetail('l9');
  const d1 = made.map(n => n.innerHTML).filter(x => x && x.indexOf('fd-tbl') >= 0).pop() || '';
  ok('🔴 詳細表に「顧客紐づけ」の行が出て、済みと分かる',
     /顧客紐づけ[\s\S]{0,200}済み/.test(d1), d1.slice(0, 200));
  ok('🔴 カルテNo が出る', /K-777/.test(d1));
  /* ⚠ 見るのは**その行だけ**。表には代車自身のナンバーの行があるので、
        表ぜんぶを見ると「お客様のナンバーが出ている」と読み違える。 */
  const row1 = (d1.match(/<td>顧客紐づけ<\/td>[\s\S]*?<\/tr>/) || [''])[0];
  ok('🔴 その行にお名前・ナンバー・車種を並べない（カーソルを乗せた時だけ）',
     row1.indexOf('松戸 500 す 8230') < 0 && row1.indexOf('トヨタ') < 0 &&
     /title="[^"]*小林モータース 様/.test(row1), row1);
  ctx.fleetOpenDetail('l8');
  const d2 = made.map(n => n.innerHTML).filter(x => x && x.indexOf('fd-tbl') >= 0).pop() || '';
  ok('🔴 結ばれていない時も行を空にしない（「未紐づけ」と書く）',
     /顧客紐づけ[\s\S]{0,200}未紐づけ/.test(d2), d2.slice(0, 200));
  ok('どこから結べるかは、カーソルを乗せた時に出る', /title="[^"]*顧客車両との紐づけ/.test(d2));
}

/* ============================================================
   ⑫ スペック表の一番下＝履歴・作業予定／カルテNo のリンク（v2.66.0）
   ------------------------------------------------------------
   🗣「閉じる、編集の一番下の列に **履歴**→顧客ビューの履歴ビューの車両で絞った画面／
   　　**作業予定**→この車でワンタイムの代車作業予定を入れるPOPアップ を追加」
   🗣「また **カルテナンバーはリンク**にして、車両（顧客の一覧画面）に飛ぶように」
   ⚠ 本物の fleet.js / maint-pit.js を走らせて、**どこへ何を渡したか**まで見る。
   ============================================================ */
console.log('── ⑫ スペック表から、お客様側と作業予定へ渡る ──');
{
  function node2(){
    const n = { _html:'', style:{setProperty(){}},
      classList:{add(){},remove(){},toggle(){},contains(){return false;}},
      addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){}, children:[],
      value:'', checked:false, insertAdjacentHTML(){}, querySelector(){return null;},
      querySelectorAll(){return [];}, scrollIntoView(){} };
    Object.defineProperty(n, 'innerHTML', { get(){ return n._html; }, set(v){ n._html = v; } });
    return n;
  }
  const bodyEl = node2(), made = [], went = [];
  const ctx = {
    console:{log(){},warn(){},error(){}}, setTimeout:(f)=>{ try{ f(); }catch(e){} }, clearTimeout,
    Promise, Date, Math, JSON, String, Number, Array, Object, isFinite, RegExp,
    localStorage:{ getItem(){return null;}, setItem(){}, removeItem(){} },
    document:{ body:{appendChild(){}}, head:node2(), documentElement:{clientWidth:1280,style:{setProperty(){}}},
      getElementById(id){ return id === 'view-fleet-body' ? bodyEl : null; },
      createElement:()=>{ const n = node2(); made.push(n); return n; },
      querySelector(){return null;}, querySelectorAll(){return [];}, addEventListener(){}, removeEventListener(){} },
    state:{ currentView:'fleet',
      customers:[{ id:'cu1', name:'小林モータース', vehicles:[
        { id:'v1', plate:'松戸 500 す 8230', maker:'トヨタ', car:'アクア', karteNo:'K-777' }] }],
      loaners:[
        { id:'l9', name:'代車9', number:9, model:'アクア', plate:'松戸 500 す 8230', custId:'cu1', custVehId:'v1' },
        { id:'l8', name:'代車8', number:8, model:'ムーヴ', plate:'柏 500 い 4444' }],
      companyCars:[], fleetEvents:[], cards:[], staff:[], settings:{},
      workTypes:[{ id:'shaken', label:'車検', color:'#ef4444' }] },
    PitDB:{ save(){} },
    pitAlert:(m,o)=>went.push({ kind:'alert', code:(o||{}).code }),
    pitAsk(){ return Promise.resolve(false); }, pitLog(){}, pitToast(){},
    showView:(v)=>{ went.push({ kind:'showView', v:v }); ctx.state.currentView = v; },
    custHistory:(cid, vid)=>went.push({ kind:'custHistory', cid:cid, vid:vid }),
    custOpen:(cid)=>went.push({ kind:'custOpen', cid:cid }),
    icHydrate(){}, icoBoot(){}, pitModalOutside(){}, pitRefreshAutoTenken(){}, renderSettings(){},
    pitLoanerSpan:()=>[], pitLoanerRemainText:()=>'', pitVehLabel:(v)=>((v && (v.name || v.model)) || ''),
    pitSeatsText:(x)=>x||'', pitTenkenFromShaken:()=>'', pitWareki:(x)=>x||''
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(JS('pit-share.js'), ctx);
  ctx.PitShare.use({ divisions:()=>[], estAmount:()=>0, teamKey:()=>'default' });
  vm.runInContext(JS('loaner-free.js'), ctx);
  vm.runInContext(JS('fleet-link.js'), ctx);
  vm.runInContext(JS('loaner.js'), ctx);
  vm.runInContext(JS('intern-pit.js'), ctx);
  vm.runInContext(JS('maint-pit.js'), ctx);
  vm.runInContext(bendFleet(JS('fleet.js')), ctx);

  ctx.fleetOpenDetail('l9');
  const box1 = made.map(n => n.innerHTML).filter(x => x && x.indexOf('fd-btns') >= 0).pop() || '';
  const btns = (box1.match(/<div class="fd-btns">[\s\S]*?<\/div>/) || [''])[0];
  ok('一番下の列に「履歴」がある', /履歴<\/button>/.test(btns), btns.slice(0,300));
  ok('一番下の列に「作業予定」がある', /作業予定<\/button>/.test(btns));
  ok('前からある「閉じる」「編集」も残っている', /閉じる<\/button>/.test(btns) && /編集<\/button>/.test(btns));
  ok('🔴 カルテNo が押せる形になっている（お客様の車両一覧へ）',
     /class="fd-linkkarte"[^>]*fleetGoCustomer/.test(box1) && /K-777/.test(box1));

  went.length = 0;
  ctx.fleetGoHistory('l9');
  ok('🔴 履歴＝顧客ビューへ切り替えてから開く',
     went.filter(x => x.kind === 'showView' && x.v === 'customers').length === 1, went);
  ok('🔴🔴 履歴は「この車で絞った」状態で開く（お客様と車の両方を渡す）',
     went.some(x => x.kind === 'custHistory' && x.cid === 'cu1' && x.vid === 'v1'), went);

  went.length = 0;
  ctx.fleetGoCustomer('l9');
  ok('🔴 カルテNo＝そのお客様の車両一覧を開く',
     went.some(x => x.kind === 'custOpen' && x.cid === 'cu1'), went);

  /* 紐づいていない車＝押しても飛ばさず、理由を言う */
  went.length = 0;
  /* ⚠ 関門を外すと、相手が居ないまま先へ進んで落ちる。落ちても「飛ばさない」は守れていないので赤にする。 */
  try { ctx.fleetGoHistory('l8'); } catch (e) { went.push({ kind:'crash', msg:String(e && e.message) }); }
  ok('🔴 紐づいていない車は飛ばさない',
     !went.some(x => x.kind === 'custHistory' || x.kind === 'showView' || x.kind === 'crash'), went);
  ok('理由に番号が付いている（PF-3068）',
     went.some(x => x.kind === 'alert' && x.code === 'PF-3068'), went);
  ctx.fleetOpenDetail('l8');
  const box2 = made.map(n => n.innerHTML).filter(x => x && x.indexOf('fd-btns') >= 0).pop() || '';
  ok('🔴 紐づいていない車では「履歴」が押せない形で出る',
     /履歴<\/button>/.test(box2) && /disabled[^>]*>\s*<i data-ic=clock/.test(box2), (box2.match(/<div class="fd-btns">[\s\S]*?<\/div>/)||[''])[0].slice(0,300));

  /* 作業予定＝その車が選ばれた状態で開く */
  made.length = 0;
  ctx.flMaintAdd('l9');
  const pop = made.map(n => n.innerHTML).filter(x => x && x.indexOf('mba-veh') >= 0).pop() || '';
  ok('🔴 作業予定の窓が開く', pop.indexOf('代車の作業予定を足す') > 0);
  ok('🔴🔴 その車が選ばれた状態になっている',
     /<option value="l9" selected>/.test(pop), (pop.match(/<select id="mba-veh">[\s\S]*?<\/select>/)||[''])[0]);
  ok('ほかの車にも選び直せる（押し間違いの逃げ道）', /<option value="l8"/.test(pop));
  ok('前からある「＋ 予定を足す」も同じ窓を使っている（写しを作っていない）',
     /flMaintAdd\(\)/.test(JS('maint-pit.js')));
}

/* ============================================================
   ⑬ 「代車の作業予定を足す」窓（v2.67.0）
   ------------------------------------------------------------
   🗣「代車名（数字）が入ってるが **数字をカット**、代車名だけで」
   🗣「作業は **車検 12点 一般 BP の並び**で、通常の新規予約のバッチから選ばせられないかな？」
   🗣「**一言メモもカット**で。通常予約画面の**作業内容のバッチとテンプレ**をそのまま載せてほしい」
   🗣「**✅急ぎはカット**で」
   ⚠ 本物の maint-pit.js / work-content.js を走らせて、**実際に描いた窓の中身**を見る。
   ============================================================ */
console.log('── ⑬ 代車の作業予定を足す窓 ──');
{
  const held = {};
  function node3(){
    const n = { _html:'', id:'', style:{setProperty(){}},
      classList:{add(){},remove(){},toggle(){},contains(){return false;}},
      addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){ if (n.id) delete held[n.id]; },
      children:[], value:'', checked:false, insertAdjacentHTML(){}, querySelector(){return null;},
      querySelectorAll(){return [];}, scrollIntoView(){} };
    Object.defineProperty(n, 'innerHTML', { get(){ return n._html; }, set(v){ n._html = v; } });
    return n;
  }
  const alerts = [];
  const ctx = {
    console:{log(){},warn(){},error(){}}, setTimeout:(f)=>{ try{ f(); }catch(e){} }, clearTimeout,
    Promise, Date, Math, JSON, String, Number, Array, Object, isFinite, RegExp,
    localStorage:{ getItem(){return null;}, setItem(){}, removeItem(){} },
    document:{ body:{ appendChild(n){ if (n.id) held[n.id] = n; } }, head:node3(),
      documentElement:{clientWidth:1280,style:{setProperty(){}}},
      getElementById(id){ return held[id] || null; },
      createElement:()=>node3(), querySelector(){return null;}, querySelectorAll(){return [];},
      addEventListener(){}, removeEventListener(){} },
    state:{ currentView:'fleet', customers:[], fleetEvents:[], cards:[], staff:[], settings:{},
      loaners:[{ id:'l9', name:'代車9', number:9, model:'アクア' }, { id:'l8', name:'代車8', number:8, model:'ムーヴ' }],
      companyCars:[{ id:'c1', name:'ハイエース', model:'ハイエース' }],
      workTypes:[{ id:'shaken', label:'車検', color:'#ef4444' }, { id:'12pt', label:'12点', color:'#f97316' },
                 { id:'general', label:'一般', color:'#84cc16' }, { id:'bp', label:'B.P', color:'#a855f7' }] },
    PitDB:{ save(){} },
    pitAlert:(m,o)=>alerts.push({ msg:m, code:(o||{}).code }),
    pitAsk(){ return Promise.resolve(false); }, pitLog(){}, pitToast(){}, showView(){}, icHydrate(){},
    renderFleet(){}, renderSettings(){}, pitRefreshAutoTenken(){}, pitGenResNo:()=>'X00001'
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(JS('pit-share.js'), ctx);
  ctx.PitShare.use({ divisions:()=>[], estAmount:()=>0, teamKey:()=>'default' });
  vm.runInContext(JS('loaner-free.js'), ctx);
  vm.runInContext(JS('fleet-link.js'), ctx);
  vm.runInContext(JS('loaner.js'), ctx);
  vm.runInContext(JS('intern-pit.js'), ctx);
  vm.runInContext(JS('work-content.js'), ctx);
  vm.runInContext(bendMaint(JS('maint-pit.js')), ctx);

  ctx.flMaintAdd('l9');
  const h = (held['mb-modal'] || {}).innerHTML || '';
  ok('窓が開く', h.length > 200);
  ok('🔴 車両の選択肢に番号が入っていない（代車名だけ）',
     !/（\d+）<\/option>/.test(h), (h.match(/<option[\s\S]*?<\/option>/) || [''])[0]);
  ok('その車が選ばれた状態', /<option value="l9" selected>/.test(h));
  const picks = (h.match(/flMaintPickWork\('([^']+)'\)/g) || []).map(x => x.replace(/[^a-z0-9]/gi, ''));
  ok('🔴🔴 作業は 車検→12点→一般→B.P の並びの札',
     JSON.stringify(picks) === JSON.stringify(['flMaintPickWorkshaken','flMaintPickWork12pt','flMaintPickWorkgeneral','flMaintPickWorkbp']), picks);
  ok('札は予約と同じ見た目の部品（cf-chip）', /class="cf-chip[^"]*"[^>]*onclick="flMaintPickWork/.test(h));
  ok('🔴 ひとことメモの欄が無い', h.indexOf('mba-memo') < 0 && h.indexOf('ひとことメモ') < 0);
  ok('🔴 急ぎのチェックが無い', h.indexOf('mba-urgent') < 0 && h.indexOf('急ぎ') < 0);
  ok('🔴 予約と同じ「作業内容」の欄がある', /textarea[^>]*data-key="menu"/.test(h));
  ok('🔴 内容テンプレとタグ札を、そのまま載せている',
     /id="wc-panel"/.test(h) && /class="wc-chip/.test(h) && /WorkContent\.chip\(this\)/.test(h));
  ok('🔴 中身は work-content.js 1本（写しを作っていない）',
     /w\.WorkContent \? w\.WorkContent\.builderHtml\(\)/.test(JS('maint-pit.js')));

  /* 札を押す＝選ばれる／もう一度で外れる */
  held['mba-work'] = node3(); held['mba-work'].id = 'mba-work';
  ctx.flMaintPickWork('general');
  ok('札を押すと選ばれる', /class="cf-chip active"[^>]*onclick="flMaintPickWork\('general'\)/.test(held['mba-work'].innerHTML));
  ctx.flMaintPickWork('general');
  ok('もう一度押すと外れる（押し間違いの逃げ道）',
     !/active/.test(held['mba-work'].innerHTML));

  /* 保存の関門 */
  held['mba-veh'] = { value:'l9' }; held['mba-ym'] = { value:'2026-09' }; held['mba-menu'] = { value:'' };
  alerts.length = 0;
  ctx.flMaintSave();
  ok('🔴 作業を選んでいないと足せない',
     ctx.state.cards.length === 0 && alerts.some(x => x.code === 'PF-3069'), alerts);
  ctx.flMaintPickWork('general');
  alerts.length = 0;
  ctx.flMaintSave();
  ok('🔴 一般は作業内容が空だと足せない（何の作業か分からなくなる）',
     ctx.state.cards.length === 0 && alerts.some(x => x.code === 'PF-3051'), alerts);
  held['mba-menu'] = { value:'エアコン 冷風が出ない（ぬるい）' };
  alerts.length = 0;
  ctx.flMaintSave();
  ok('🔴 作業内容を入れたら足せる', ctx.state.cards.length === 1, alerts);
  const card = ctx.state.cards[0];
  ok('作業内容がカードの「内容」に入る', card.menu === 'エアコン 冷風が出ない（ぬるい）');
  ok('作業が入る', card.workType === 'general');
  ok('🔴 急ぎは付かない（欄を無くしたので）', !card.urgent);
  ok('🔴 ボードの一言は作業内容の1行目で補う',
     ctx.pitMaintRecs().some(r => r.memo === 'エアコン 冷風が出ない（ぬるい）'),
     ctx.pitMaintRecs().map(r => r.memo));
  /* 車検は名前で通じるので、作業内容が空でも足せる */
  ctx.state.cards = [];
  ctx.flMaintAdd('l9');
  held['mba-veh'] = { value:'l9' }; held['mba-ym'] = { value:'2026-09' }; held['mba-menu'] = { value:'' };
  ctx.flMaintPickWork('shaken');
  ctx.flMaintSave();
  ok('車検は作業内容が空でも足せる（名前で通じる）', ctx.state.cards.length === 1, ctx.state.cards.length);

  /* 🔴 置き場所を必ず戻す＝戻し忘れると、次にカードを開いた時に内容テンプレが効かない */
  ok('🔴🔴 閉じる時に、内容テンプレの置き場所を戻している',
     /w\.WorkContent\.setHost\(''\)/.test(bendMaint(JS('maint-pit.js'))));
}

/* ============================================================
   ⑭ 作業予定ボードの候補に「×」（v2.68.0）
   ------------------------------------------------------------
   🗣「候補を置くのはOK。**一度決めた候補を横にちっちゃい×つけて**、
   　　飛び地の予定でも例えば**真ん中だけ消す**とかできるようにしてほしい」
   ⚠ 本物の maint-pit.js を走らせて、**実際に描いたボード**と**消した後の中身**を見る。
   ============================================================ */
console.log('── ⑭ 作業予定ボードの候補に「×」──');
{
  const held2 = {}, toasts = [];
  function node4(){
    const n = { _html:'', id:'', style:{setProperty(){}},
      classList:{add(){},remove(){},toggle(){},contains(){return false;}},
      addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){}, children:[],
      value:'', checked:false, insertAdjacentHTML(){}, querySelector(){return null;},
      querySelectorAll(){return [];}, scrollIntoView(){} };
    Object.defineProperty(n, 'innerHTML', { get(){ return n._html; }, set(v){ n._html = v; } });
    return n;
  }
  /* 飛び地3本＝4〜6／12〜16／24〜26。真ん中（12〜16）だけ消せるか。 */
  const YM = '2026-10';
  const CARD = {
    id:'mc1', resNo:'Z00001', internKind:'loanercar', status:'reserved', intakeTbd:true,
    customer:'自社代車', car:'アクア', maker:'トヨタ', plate:'', boardId:'default',
    workType:'general', maintVehId:'l9', maintYm:YM, menu:'エアコン 冷風が出ない',
    maintSpans:[{ sid:'a', from:YM+'-04', to:YM+'-06' },
                { sid:'b', from:YM+'-12', to:YM+'-16' },
                { sid:'c', from:YM+'-24', to:YM+'-26' }],
    maintFixSid:'', maintSkipped:[], reserveDate:'', returnDate:''
  };
  const ctx = {
    console:{log(){},warn(){},error(){}}, setTimeout:(f)=>{ try{ f(); }catch(e){} }, clearTimeout,
    Promise, Date, Math, JSON, String, Number, Array, Object, isFinite, RegExp,
    localStorage:{ getItem(){return null;}, setItem(){}, removeItem(){} },
    document:{ body:{ appendChild(n){ if (n.id) held2[n.id] = n; } }, head:node4(),
      documentElement:{clientWidth:1280,style:{setProperty(){}}},
      getElementById(id){ return held2[id] || null; }, createElement:()=>node4(),
      querySelector(){return null;}, querySelectorAll(){return [];}, addEventListener(){}, removeEventListener(){} },
    state:{ currentView:'fleet', customers:[], fleetEvents:[], staff:[], settings:{},
      loaners:[{ id:'l9', name:'代車9', number:9, model:'アクア' }], companyCars:[],
      cards:[JSON.parse(JSON.stringify(CARD))],
      workTypes:[{ id:'general', label:'一般', color:'#84cc16' }] },
    PitDB:{ save(){} }, pitAlert(){}, pitAsk(){ return Promise.resolve(false); }, pitLog(){},
    pitToast:(m)=>toasts.push(m), showView(){}, icHydrate(){}, renderFleet(){}, renderSettings(){},
    pitRefreshAutoTenken(){}, pitGenResNo:()=>'Z00002'
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(JS('pit-share.js'), ctx);
  ctx.PitShare.use({ divisions:()=>[], estAmount:()=>0, teamKey:()=>'default' });
  vm.runInContext(JS('loaner-free.js'), ctx);
  vm.runInContext(JS('fleet-link.js'), ctx);
  vm.runInContext(JS('loaner.js'), ctx);
  vm.runInContext(JS('intern-pit.js'), ctx);
  vm.runInContext(JS('work-content.js'), ctx);
  vm.runInContext(bendMaint(JS('maint-pit.js')), ctx);

  const board = ctx.flMaintBoardHtml();
  const xs = (board.match(/flMaintDelRec\('([^']+)'\)/g) || []).map(x => x.replace(/^.*\('|'\).*$/g, ''));
  ok('🔴 候補ぜんぶに × が付く（飛び地3本＝3つ）', xs.length === 3, xs);
  ok('× はその1本を指している（候補ごとに別の相手）',
     xs.length === 3 && new Set(xs).size === 3 && xs.every(x => x.indexOf('mc1#') === 0), xs);
  ok('× は候補の中に入っている（チップの横）', /class="mb-chip[^"]*"[^>]*>[^<]*<button type="button" class="mb-x"/.test(board));
  ok('🔴 押し間違いで行ごと反応しない（止めてある）', /event\.stopPropagation\(\);flMaintDelRec/.test(board));
  ok('色は css のクラスで持っている', /\.mb-x\{/.test(CSS('polish.css')));

  /* 真ん中（12〜16）だけ消す */
  const mid = xs.filter(x => x.indexOf('#b') > 0)[0];
  ctx.flMaintDelRec(mid);
  const spans = ctx.state.cards[0].maintSpans.map(x => x.sid);
  ok('🔴🔴 飛び地の真ん中だけ消える（前後は残る）',
     JSON.stringify(spans) === JSON.stringify(['a','c']), spans);
  ok('🔴 カードは消さない（月の目標として残る）', ctx.state.cards.length === 1);
  ok('消したことを知らせる（押す前に聞かないので）',
     toasts.some(t => /取り消しました/.test(t) && /残り 2本/.test(t)), toasts);

  /* 最後の1本まで消してもカードは残る */
  ctx.flMaintDelRec('mc1#a'); ctx.flMaintDelRec('mc1#c');
  ok('🔴 最後の1本を消してもカードは残る（カードごと無くすのは「取り下げ」だけ）',
     ctx.state.cards.length === 1 && ctx.state.cards[0].maintSpans.length === 0,
     ctx.state.cards.length);
  ok('🔴 カードごと消す道は「取り下げ」1本のまま（押す前に聞く）',
     /w\.flMaintDrop = function/.test(JS('maint-pit.js')) && /この予定を取り下げますか？/.test(JS('maint-pit.js')));
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（' + pass + '件 緑）' : '✅ ぜんぶ緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
