/* PitFlow ── 🔎 **ダブりを洗い出す**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた指定（2026-08-30）「進めて。ボタンは顧客統合の隣にアイコンだけでOK」
   ◎ここで見張ること
     🔴 **1文字も書かない**（読むだけの窓）
     🔴 ① 同じ車体番号＝**100%ダブり**として言い切れる（同じ人／別の人 で飛び先が変わる）
     🔴 ② 同じ人の「ナンバーなし × 本物のナンバー」＝疑わしい（**車種まで同じならほぼ黒**）
     🔴 ③ 同じ電話・同じカナの人＝顧客の統合の受け皿（**家族・同姓同名もここに出る**＝人が決める）
     🔴 都度車両変動・アーカイブ済み・統合で吸収済みは相手にしない
     🔴 数だけで終わらせない＝**どれとどれか**を名指しして、まとめる窓へ飛ばす
   ◎使い方  node test_dup_find.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');

function boot(customers, cards) {
  const ctx = {
    console, setTimeout, clearTimeout,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                addEventListener: () => {}, createElement: () => ({ style:{}, classList:{ add(){}, remove(){} } }) },
    state: { customers: JSON.parse(JSON.stringify(customers||[])), cards: JSON.parse(JSON.stringify(cards||[])),
             divisions: [], staff: [], loaners: [] },
    PitDB: { save(){} }, pitToast: () => {}, pitOpLog: () => {}, pitCurrentStaffName: () => 'チーフ'
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(JS('customers.js'), ctx, { filename:'customers.js' });
  vm.runInContext(JS('veh-merge.js'), ctx, { filename:'veh-merge.js' });
  vm.runInContext(JS('cust-merge.js'), ctx, { filename:'cust-merge.js' });
  vm.runInContext(JS('dup-find.js'), ctx, { filename:'dup-find.js' });
  return ctx;
}

const 種 = [
  /* 同じ人の中で車体番号が同じ＝100%ダブり */
  { id:'c1', name:'一 太郎', kana:'ハジメ タロウ', contacts:[{tel:'090-0000-0001',primary:true}],
    vehicles:[ { id:'v1', plate:'野田 300 あ 1', maker:'MINI', car:'ミニF54', vin:'WMW-111' },
               { id:'v2', plate:'柏 500 か 2',   maker:'MINI', car:'ミニF54', vin:'WMW-111' } ] },
  /* 同じ人の中で ナンバーなし × 本物（車種まで同じ＝ほぼ黒） */
  { id:'c2', name:'二 次郎', kana:'ニ ジロウ', contacts:[{tel:'090-0000-0002',primary:true}],
    vehicles:[ { id:'v3', plate:'', maker:'MINI', car:'ミニF55' },
               { id:'v4', plate:'船橋 312 ち 127', maker:'MINI', car:'ミニF55', karteNo:'K-9' } ] },
  /* 同じ人の中で ナンバーなし × 本物（車種は違う＝疑わしい） */
  { id:'c3', name:'三 三郎', kana:'サン サブロウ', contacts:[{tel:'090-0000-0003',primary:true}],
    vehicles:[ { id:'v5', plate:'', maker:'トヨタ', car:'アクア' },
               { id:'v6', plate:'野田 500 さ 3', maker:'ホンダ', car:'フィット' } ] },
  /* 別の人どうしで車体番号が同じ＝人のダブりの可能性 */
  { id:'c4', name:'四 四郎', kana:'ヨン シロウ', contacts:[{tel:'090-0000-0004',primary:true}],
    vehicles:[ { id:'v7', plate:'習志野 300 た 4', maker:'BMW', car:'ミニR56', vin:'WBA-444' } ] },
  { id:'c5', name:'', kana:'ヨン シロウ', contacts:[{tel:'090-0000-0004',primary:true}],
    vehicles:[ { id:'v8', plate:'', maker:'BMW', car:'ミニR56', vin:'WBA-444' } ] },
  /* 同じカナだが電話は別＝別人かもしれない（出すが、決めない） */
  { id:'c6', name:'五 五郎', kana:'ゴ ゴロウ', contacts:[{tel:'090-0000-0006',primary:true}], vehicles:[] },
  { id:'c7', name:'五 悟',   kana:'ゴ ゴロウ', contacts:[{tel:'090-0000-0007',primary:true}], vehicles:[] },
  /* 触ってはいけないもの＝都度車両変動・アーカイブ済みの車・統合で吸収済みの人 */
  { id:'c8', name:'六 六郎', kana:'ロク ロクロウ', contacts:[{tel:'090-0000-0008',primary:true}],
    vehicles:[ { id:'v9', plate:'', perVisit:true, karteNo:'K-P' },
               { id:'v10', plate:'柏 300 む 9', maker:'日産', car:'ノート' },
               { id:'v11', plate:'', maker:'日産', car:'ノート', archived:true } ] },
  { id:'c9', name:'七 七郎', kana:'ナナ シチロウ', mergedInto:'c1', archived:true,
    contacts:[{tel:'090-0000-0001',primary:true}], vehicles:[] },
  /* 🙅 特例で外すお客様（レンタカー屋さん・この姿が本当の状態） */
  { id:'c10', name:'ANDRZEJ SCHMIDT', kana:'', contacts:[{tel:'090-9999-9999',primary:true}],
    vehicles:[ { id:'v20', plate:'', maker:'トヨタ', car:'ハイエース', vin:'REN-1' },
               { id:'v21', plate:'成田 300 わ 1', maker:'トヨタ', car:'ハイエース', vin:'REN-1' } ] },
  { id:'c11', name:'株式会社 Japan Campers', kana:'', contacts:[{tel:'090-9999-9999',primary:true}],
    vehicles:[ { id:'v22', plate:'', maker:'トヨタ', car:'ハイエース' },
               { id:'v23', plate:'成田 300 わ 2', maker:'トヨタ', car:'ハイエース' } ] },
  { id:'c12', name:'小林モータース株式会社', kana:'', contacts:[{tel:'047-000-1111',primary:true}],
    vehicles:[ { id:'v24', plate:'', maker:'トヨタ', car:'ハイエース' },
               { id:'v25', plate:'野田 300 あ 99', maker:'トヨタ', car:'ハイエース' } ] }
];

console.log('\n── 🔎 ① 同じ車体番号＝100%ダブり ──');
{
  const ctx = boot(種); const R = ctx.PitDupFind.scan();
  ok('2件見つかる（同じ人・別の人）', R.車体番号.length === 2, R.車体番号.map(x => x.vin));
  const 同 = R.車体番号.find(x => x.vin === 'WMW-111');
  const 別 = R.車体番号.find(x => x.vin === 'WBA-444');
  ok('🔴 同じ人の中のダブりと分かる', 同 && 同.同じ人 === true);
  ok('🔴 別の人にまたがるダブりと分かる', 別 && 別.同じ人 === false);
  ok('どの車かを名指しできている', 同.件.length === 2 && 同.件[0].車.id === 'v1' && 同.件[1].車.id === 'v2');
}

console.log('\n── ⚠ ② ナンバーなし × 本物のナンバー ──');
{
  const ctx = boot(種); const R = ctx.PitDupFind.scan();
  ok('2人ぶん見つかる', R.ナンバーなし.length === 2, R.ナンバーなし.map(x => x.客.id));
  ok('🔴 車種まで同じなら「ほぼ黒」', R.ナンバーなし[0].同車種 === true && R.ナンバーなし[0].度 === 'ほぼ黒', R.ナンバーなし[0].度);
  ok('🔴 車種が違えば「疑わしい」', R.ナンバーなし[1].同車種 === false && R.ナンバーなし[1].度 === '疑わしい');
  ok('強い方が上に来る', R.ナンバーなし[0].客.id === 'c2');
  ok('🔴 都度車両変動は相手にしない', !R.ナンバーなし.some(x => x.なし.perVisit || x.なし.id === 'v9'));
  ok('🔴 アーカイブ済みの車は相手にしない', !R.ナンバーなし.some(x => x.なし.id === 'v11'));
}

console.log('\n── 👥 ③ 同じ電話・同じカナ ──');
{
  const ctx = boot(種); const R = ctx.PitDupFind.scan();
  const tel = R.人.filter(x => x.理由 === '同じ電話番号');
  const kana = R.人.filter(x => x.理由 === '同じカナ');
  ok('同じ電話の組が出る（四 四郎）', tel.length === 1 && tel[0].客.length === 2, tel.map(x => x.客.map(c => c.id)));
  ok('🔴 統合で吸収済みの人は数えない', !R.人.some(x => x.客.some(c => c.id === 'c9')));
  ok('同じカナの組も出る（五）', kana.length === 1 && kana[0].客.length === 2, kana.map(x => x.客.map(c => c.id)));
  ok('🔴 電話で出した組を、カナでもう一度出さない', !kana.some(x => x.客.some(c => c.id === 'c4')));
}

console.log('\n── 🙅 ③-2 特例で外すお客様 ──');
{
  const ctx = boot(種); const R = ctx.PitDupFind.scan();
  const 名 = [].concat(
    R.車体番号.map(x => x.件.map(k => k.客.name)).flat(),
    R.ナンバーなし.map(x => x.客.name),
    R.人.map(x => x.客.map(c => c.name)).flat());
  ok('🙅 ANDRZEJ SCHMIDT は洗い出しに出ない', !名.some(n => /ANDRZEJ/.test(n)), 名);
  ok('🙅 株式会社 Japan Campers も出ない', !名.some(n => /Japan Campers/.test(n)));
  ok('🙅 小林モータース株式会社（自社）も出ない', !名.some(n => /小林モータース/.test(n)), 名);
  ok('🔴 車体番号が同じでも（REN-1）出さない', !R.車体番号.some(x => x.vin === 'REN-1'), R.車体番号.map(x => x.vin));
  ok('🔴 同じ電話でも（090-9999-9999）人の候補に出さない',
     !R.人.some(x => /9999/.test(x.値||'')), R.人.map(x => x.値));
  ok('物差しは1つ（pitDupSkipped）', typeof ctx.pitDupSkipped === 'function'
     && ctx.pitDupSkipped({ name:'ANDRZEJ SCHMIDT' }) === true
     && ctx.pitDupSkipped({ name:'一 太郎' }) === false);
  ok('⚠ 外しているだけで、隠してはいない（顧客一覧には居る）',
     ctx.state.customers.some(c => c.id === 'c10'));
  /* あとから増やせる（設定に足せば、ここを触らずに増える） */
  const ctx2 = boot(種); ctx2.state.settings = { dupSkip:['一 太郎'] };
  ok('🔵 設定に足せば、あとから増やせる', !ctx2.PitDupFind.scan().車体番号.some(x => x.vin === 'WMW-111'));
}

console.log('\n── 🔒 ④ 探すだけでは1文字も書かない ──');
{
  const ctx = boot(種);
  const 前 = JSON.stringify(ctx.state);
  ctx.PitDupFind.scan(); ctx.PitDupFind.scan();
  ok('🔴 探しても、データは1文字も変わらない', JSON.stringify(ctx.state) === 前);
}

console.log('\n── ✅ ④-2 「これでOK」＝次から出さない（v2.37.3） ──');
{
  const ctx = boot(種); const M = ctx.PitDupFind;
  ctx.custShowModal = () => {};        /* 窓は開かない（ここで見たいのは印の付き方） */
  const 前 = M.scan();
  const x = 前.車体番号.find(v => v.vin === 'WMW-111');
  ok('はじめは OK 印が付いていない', x.ok === false && !!x.key, x.key);
  M.ok(x.key, x.ids.join(','), 0);
  const 後 = M.scan();
  const y = 後.車体番号.find(v => v.vin === 'WMW-111');
  ok('🔴 OK にすると印が付く', y.ok === true);
  ok('🔴 印はお客様のレコードに残る（設定に貯めない）',
     (ctx.state.customers.find(c => c.id === 'c1').dupOk || []).length === 1,
     ctx.state.customers.find(c => c.id === 'c1').dupOk);
  ok('🔴 中身は触っていない（車も名前もそのまま）',
     ctx.state.customers.find(c => c.id === 'c1').vehicles.length === 2 &&
     ctx.state.customers.find(c => c.id === 'c1').name === '一 太郎');
  M.ok(x.key, x.ids.join(','), 1);
  ok('🔴 やっぱり出す＝印が外れる', M.scan().車体番号.find(v => v.vin === 'WMW-111').ok === false);
  /* 人の組は、関わる2人ともに印が付く（どちらから見ても出ない） */
  const 人 = 前.人[0];
  M.ok(人.key, 人.ids.join(','), 0);
  ok('人の組は2人ともに印が付く', 人.ids.every(id => (ctx.state.customers.find(c => c.id === id).dupOk||[]).length === 1));
}

console.log('\n── 🖥 ⑤ 窓と飛び先 ──');
{
  const ctx = boot(種); let H = '';
  ctx.custShowModal = (h) => { H = h; };
  ctx.custCloseModal = () => {};
  ctx.PitDupFind.open();
  ok('窓が開く', /ダブりを洗い出す/.test(H));
  ok('3つのタブが出る', (H.match(/df-tab/g) || []).length >= 3);
  ok('🔴 同じ人のダブりは「車をまとめる」へ飛ぶ', /PitDupFind\.toVeh\('c1'\)/.test(H));
  ok('🔴 別の人にまたがるダブりは「お客様をまとめる」へ飛ぶ', /PitDupFind\.toCust\('c4','c5'\)/.test(H));
  ok('車体番号を名指ししている', /WMW-111/.test(H));
  ctx.PitDupFind.tab('plate');
  ok('②のタブに切り替わる', /ほぼ黒/.test(H) && /船橋 312 ち 127/.test(H));
  ok('車種まで同じ、と書いてある', /車種まで同じ/.test(H));
  ctx.PitDupFind.tab('cust');
  ok('③のタブに切り替わる', /同じ電話番号/.test(H) || /同じカナ/.test(H));
  ok('⚠ 家族・同姓同名は別の方、と断ってある', /ご家族・同姓同名は別の方/.test(H));
  ok('🙅 外しているお客様を、黙らずに書いてある', /洗い出しから外しているお客様/.test(H) && /ANDRZEJ SCHMIDT/.test(H));

  /* 🔎 v2.37.1 行を押すと下に顧客の中身が開く（まとめる窓と同じカード） */
  ctx.PitDupFind.tab('vin');
  ok('はじめは閉じている', H.indexOf('df-open') < 0);
  ctx.PitDupFind.toggle('vin0');
  ok('🔴 押すと下に開く', /df-open/.test(H));
  ok('🔴 顧客カードがそのまま出る（車種・ナンバーまで）', /um-one plain/.test(H) && /ミニF54/.test(H) && /野田 300 あ 1/.test(H));
  ok('連絡先も出る', /090-0000-0001/.test(H));
  ctx.PitDupFind.toggle('vin0');
  ok('もう一度押すと閉じる', H.indexOf('df-open') < 0);
  ctx.PitDupFind.tab('cust'); ctx.PitDupFind.toggle('cu0');
  ok('🔴 人の候補は2人ぶん並べて開く', /df-cards two/.test(H) && (H.match(/um-one plain/g)||[]).length === 2);

  /* ✅ v2.37.3 展開の中に「これでOK」ボタンがある／押すと次から出ない */
  ctx.PitDupFind.tab('vin'); ctx.PitDupFind.toggle('vin0');
  ok('🔴 展開の中に「これでOK」がある', /これでOK（もう出さない）/.test(H));
  ok('あとから戻せる、と書いてある', /あとから戻せます/.test(H));
  const key = (H.match(/PitDupFind\.ok\('([^']+)'/) || [])[1];
  const ids = (H.match(/PitDupFind\.ok\('[^']+','([^']+)'/) || [])[1];
  ctx.PitDupFind.ok(key, ids, 0);
  ok('🔴 押すと、その組は一覧から消える', H.indexOf('WMW-111') < 0, H.length);
  ok('🔴 「OKにしたもの」タブの数が増える', /OKにしたもの <b>1<\/b>/.test(H));
  ctx.PitDupFind.tab('ok');
  ok('OKにしたものタブに出る', /WMW-111/.test(H));
  ok('そこから「やっぱり出す」で戻せる', /やっぱり出す/.test(H));

  /* 飛び先が本当につながっている（①②を決め打ちで開ける） */
  let 開いた = '';
  ctx.custShowModal = (h) => { 開いた = h; };
  ctx.PitDupFind.toCust('c4', 'c5');
  ok('🔴 お客様をまとめる窓が、①②入りで開く', /um-one on1/.test(開いた) && /um-one on2/.test(開いた));
  ctx.PitDupFind.toVeh('c1');
  ok('🔴 車をまとめる窓が開く', /車をまとめる/.test(開いた));
}

console.log('\n── 🧭 ⑥ 決めごと（ソースを見る） ──');
{
  const cus = JS('customers.js'), df = JS('dup-find.js');
  ok('🔴 入口は顧客一覧の統合の隣に**アイコンだけ**',
     /cust-mergeico[\s\S]{0,260}PitDupFind\.open\(\)[\s\S]{0,120}<\/i><\/button>/.test(cus));
  /* ⚠ v2.37.3 で「これでOK」の印だけは書くようになった。**書くのは印だけ**を見張る。 */
  ok('🔴 書くのは「OKの印」だけ（車・人・カードの中身は触らない）',
     /c\.dupOk/.test(df) && !/\.vehicles\s*=/.test(df) && !/\.customerId\s*=/.test(df) && !/\.plate\s*=/.test(df));
  ok('🔴 保存を呼ぶのは印を付ける所だけ（1か所）', (df.match(/PitDB\.save/g)||[]).length === 1);
  const idx = fs.readFileSync('index.html', 'utf8');
  ok('🔴 index.html に `?v=` 付きで載っている', /js\/dup-find\.js\?v=\d+/.test(idx));
  const meta = (idx.match(/app-version" content="([\d.]+)"/)||[])[1];
  const 画面 = (idx.match(/class="ver">v([\d.]+)</)||[])[1];
  const ログ = (idx.match(/class="login-ver">v([\d.]+)</)||[])[1];
  ok('🔴 版が3か所そろっている', meta && meta === 画面 && meta === ログ, { meta, 画面, ログ });
}

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' 件が緑／' + fail + ' 件が赤\n');
process.exit(fail ? 1 : 0);
