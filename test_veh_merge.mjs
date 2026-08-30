/* PitFlow ── 🚗 **同じ車が2件に分かれているのを1台にまとめる**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた指定（2026-08-30）
     🗣「複数台として登録されている車両の統合。**顧客はいじらない。**
     　　主とサブを決めて、**主の車両にサブの履歴やその他情報を入れる**」
     🗣 サブのナンバーは「**その場で選ばせる**」

   ◎ここで見張ること
     🔴 **履歴が行方不明にならない**（伝票もカードも、必ず主から引ける）
     🔴 **黙って上書きしない**（食い違う欄は、選ばれた時だけ動く）
     🔴 **サブを消していない**（アーカイブするだけ・中身はそのまま＝取り消しの道）
     🔴 **ナンバーの扱いを選ばないと、1文字も動かない**
     🔴 **取り消したら、本当に元どおり**（ただし、あとから人が直した値は上書きしない）
     🔴 引き当ての物差しが**1本**（customers.js が `pitVehPlates` を通している・写しを作っていない）

   ◎使い方
     node test_veh_merge.mjs
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
const 写し = (o) => JSON.parse(JSON.stringify(o));

/* =====================================================================
   見せかけの画面（ブラウザは使わない）
   🔴 ナンバーの物差し（`pitIsRealPlate`）は **本物の customers.js から借りる**。
      ここで書き写すと、本体を直した時に見張りだけ古いままになる。
   ===================================================================== */
function boot(データ, opt) {
  opt = opt || {};
  const 出た札 = [];
  const ctx = {
    console,
    setTimeout, clearTimeout,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                addEventListener: () => {}, createElement: () => ({ style: {}, classList: { add(){}, remove(){} } }) },
    state: { customers: 写し(データ.customers), cards: 写し(データ.cards), divisions: [], staff: [], loaners: [] },
    PitDB: { save: function () { this.回数++; }, 回数: 0 },
    pitToast: (m, code) => 出た札.push({ m, code }),
    pitOpLog: () => {},
    pitCurrentStaffName: () => 'テスト太郎'
  };
  ctx.window = ctx;
  if (opt.PitArchive) ctx.PitArchive = opt.PitArchive;
  vm.createContext(ctx);
  vm.runInContext(JS('customers.js'), ctx, { filename: 'customers.js' });
  vm.runInContext(JS('veh-merge.js'), ctx, { filename: 'veh-merge.js' });
  return { ctx, M: ctx.PitVehMerge, S: ctx.state, 出た札 };
}

const 主 = () => ({ id:'vm', plate:'野田 300 あ 1111', maker:'トヨタ', car:'', karteNo:'K001', vin:'',
                    boardId:'default', division:'d1', frontStaff:'蓮沼',
                    伝票:[{ 伝票番号:'A1', 売上日:'2026-05-01', 金額:10000 }] });
const サブ = () => ({ id:'vs', plate:'野田 500 か 2222', maker:'トヨタ', car:'アクア', karteNo:'K999', vin:'ZZZ-1',
                      boardId:'import', division:'d2', frontStaff:'林',
                      伝票:[{ 伝票番号:'A1', 売上日:'2026-05-01', 金額:10000 },
                            { 伝票番号:'B2', 売上日:'2026-06-01', 金額:20000 }] });
const データ = () => ({
  customers: [{ id:'cu1', name:'見張り 太郎', kana:'ミハリ タロウ', contacts:[], vehicles:[主(), サブ()] }],
  cards: [
    { id:'c1', plate:'野田 500 か 2222', customerId:'cu1', status:'returned' },
    { id:'c2', plate:'',                 customerId:'cu1', vehId:'vs', status:'reserved' },
    { id:'c3', plate:'野田 300 あ 1111', customerId:'cu1', status:'returned' }
  ]
});
const 車 = (S, id) => S.customers[0].vehicles.find(v => v.id === id);

/* =====================================================================
   ① 先に「何が起きるか」を出せる
   ===================================================================== */
console.log('\n── 🔎 ① まとめる前に、何が動くかを出す ──');
{
  const { M, ctx } = boot(データ());
  ok('本物の物差しを借りられている（pitIsRealPlate）', typeof ctx.pitIsRealPlate === 'function');
  const P = M.plan('cu1', 'vm', 'vs');
  ok('下ごしらえが出る', !!P);
  const k = (key) => (P.rows.find(r => r.k === key) || null);
  ok('同じ欄（メーカー）は出さない', !k('maker'));
  ok('主が空の欄（車種）は「サブを採る」が既定', k('car') && k('car').既定 === 'sub', k('car'));
  ok('食い違う欄（カルテNo）は「主を残す」が既定', k('karteNo') && k('karteNo').既定 === 'main', k('karteNo'));
  ok('国産／輸入も出る', !!k('boardId'));
  ok('🔴 重なっている伝票は足さない（足す1・重なり1）', P.伝票.足す === 1 && P.伝票.重なり === 1, P.伝票);
  ok('関わるカードを数えている（ナンバー1・紐づけ1）', P.カード.ナンバー === 1 && P.カード.紐づけ === 1, P.カード);
  ok('🔴 両方が本物のナンバー＝扱いを選ばせる', P.ナンバーを選ぶ === true);
}

/* =====================================================================
   ② ナンバーの扱いを選ばないと、1文字も動かない
   ===================================================================== */
console.log('\n── 🚧 ② ナンバーの扱いを選ばないと止まる ──');
{
  const { M, S, 出た札 } = boot(データ());
  const 前 = 写し(S.customers[0]);
  const r = M.apply('cu1', 'vm', 'vs', { 欄: {} });
  ok('まとめていない', r === null);
  ok('番号つきで知らせている（PF-6005）', 出た札.some(x => x.code === 'PF-6005'), 出た札);
  ok('🔴 車の中身は1文字も動いていない', JSON.stringify(S.customers[0]) === JSON.stringify(前));
}

/* =====================================================================
   ③ ナンバー変更だった＝旧ナンバーとして残す（過去のカードは書き換えない）
   ===================================================================== */
console.log('\n── 🔢 ③ ナンバー変更（旧として残す） ──');
let 記録id = '';
{
  const { M, S, ctx } = boot(データ());
  const 記録 = M.apply('cu1', 'vm', 'vs', { 欄: {}, ナンバー: '旧として残す' });
  ok('まとめた（記録が返る）', !!記録 && !!記録.id);
  記録id = 記録 ? 記録.id : '';
  const m = 車(S, 'vm'), s = 車(S, 'vs');
  ok('主の空欄がサブで埋まった（車種）', m.car === 'アクア', m.car);
  ok('主の空欄がサブで埋まった（車体番号）', m.vin === 'ZZZ-1', m.vin);
  ok('🔴 食い違う欄は黙って上書きしない（カルテNoは主のまま）', m.karteNo === 'K001', m.karteNo);
  ok('🔴 国産／輸入も主のまま', m.boardId === 'default', m.boardId);
  ok('伝票が2枚になった（重なりは足していない）', (m.伝票 || []).length === 2, m.伝票);
  ok('伝票は売上日の新しい順', m.伝票[0].売上日 === '2026-06-01', m.伝票.map(x => x.売上日));
  ok('🔴 旧ナンバーを持たせた', (m.oldPlates || []).length === 1 && m.oldPlates[0] === '野田 500 か 2222', m.oldPlates);
  ok('🔴 引き当てのナンバーが2つになった（pitVehPlates）', ctx.pitVehPlates(m).length === 2, ctx.pitVehPlates(m));
  ok('🔴 過去のカードのナンバーは書き換えていない', S.cards.find(c => c.id === 'c1').plate === '野田 500 か 2222');
  ok('車の紐づけ（vehId）は主を指す', S.cards.find(c => c.id === 'c2').vehId === 'vm');
  ok('🔴🔴 サブを消していない', !!s);
  ok('サブはアーカイブ済み', !!s.archived);
  ok('サブに「主はどれか」が残っている', s.mergedInto === 'vm', s.mergedInto);
  ok('サブの中身はそのまま（伝票2枚・カルテNo）', (s.伝票 || []).length === 2 && s.karteNo === 'K999');
  ok('取り消しの控えが主に残っている', (m.mergeLog || []).length === 1);
  ok('クラウドへ保存した', ctx.PitDB.回数 > 0);
  /* 吸収された車は、ナンバーから引かない（生きているのは主） */
  const 引き = ctx.pitVehByPlate('野田 500 か 2222');
  ok('🔴 旧ナンバーで引くと「主」が返る（サブではない）', 引き && 引き.veh.id === 'vm', 引き && 引き.veh.id);
}

/* =====================================================================
   ④ 登録間違いだった＝カードのナンバーを主に直す
   ===================================================================== */
console.log('\n── ✏️ ④ 登録間違い（ナンバーは捨てる） ──');
{
  const { M, S } = boot(データ());
  M.apply('cu1', 'vm', 'vs', { 欄: {}, ナンバー: '捨てる' });
  const m = 車(S, 'vm');
  ok('旧ナンバーは残していない', !(m.oldPlates || []).length, m.oldPlates);
  ok('🔴 そのナンバーのカードを主のナンバーに直した', S.cards.find(c => c.id === 'c1').plate === '野田 300 あ 1111');
  ok('もともと主のカードは触っていない', S.cards.find(c => c.id === 'c3').plate === '野田 300 あ 1111');
  ok('🔴 どちらの道でも履歴は主から引ける', (m.伝票 || []).length === 2);
}

/* =====================================================================
   ⑤ 選べばサブを採る／主にナンバーが無い時はナンバーも選べる
   ===================================================================== */
console.log('\n── 🖐 ⑤ 選んだとおりに動く ──');
{
  const { M, S } = boot(データ());
  M.apply('cu1', 'vm', 'vs', { 欄: { karteNo: 'sub', boardId: 'sub' }, ナンバー: '旧として残す' });
  const m = 車(S, 'vm');
  ok('選べばサブのカルテNoになる', m.karteNo === 'K999', m.karteNo);
  ok('選べばサブの国産／輸入になる', m.boardId === 'import', m.boardId);
}
{
  const D = データ();
  D.customers[0].vehicles[0].plate = '新規車両';     /* ナンバー無しで先に登録された形 */
  D.cards = D.cards.filter(c => c.id !== 'c3');
  const { M, S } = boot(D);
  const P = M.plan('cu1', 'vm', 'vs');
  ok('🔴 主にナンバーが無い時は、ナンバーも「選ぶ欄」に出る', !!P.rows.find(r => r.k === 'plate'), P.rows.map(r => r.k));
  ok('この時は扱いを聞かない（ぶつかっていない）', P.ナンバーを選ぶ === false);
  M.apply('cu1', 'vm', 'vs', { 欄: {} });
  ok('主がサブのナンバーを受け取った', 車(S, 'vm').plate === '野田 500 か 2222', 車(S, 'vm').plate);
}

/* =====================================================================
   ⑥ 取り消し（管理者だけ）
   ===================================================================== */
console.log('\n── ↩️ ⑥ 取り消したら元どおり ──');
{
  const 管理者じゃない = { canArchive: () => true, canRestore: () => false,
                          archiveVeh: (cid, vid) => true, restoreVeh: () => true,
                          vehSelfArchived: (v) => !!(v && v.archived) };
  const { M, S, 出た札 } = boot(データ(), { PitArchive: 管理者じゃない });
  const 記録 = M.apply('cu1', 'vm', 'vs', { 欄: {}, ナンバー: '旧として残す' });
  const 前 = 写し(車(S, 'vm'));
  ok('🔴 管理者でなければ取り消せない', M.undo('cu1', 記録.id) === false);
  ok('番号つきで知らせている（PF-6006）', 出た札.some(x => x.code === 'PF-6006'), 出た札);
  ok('取り消せなかった時、何も動いていない', JSON.stringify(車(S, 'vm')) === JSON.stringify(前));
}
{
  const { M, S } = boot(データ());
  const 記録 = M.apply('cu1', 'vm', 'vs', { 欄: {}, ナンバー: '旧として残す' });
  ok('取り消せた', M.undo('cu1', 記録.id) === true);
  const m = 車(S, 'vm'), s = 車(S, 'vs');
  ok('車種が空に戻った', m.car === '');
  ok('車体番号が空に戻った', m.vin === '');
  ok('伝票が1枚に戻った', (m.伝票 || []).length === 1, m.伝票);
  ok('もともと主にあった伝票は消していない', m.伝票[0].伝票番号 === 'A1');
  ok('旧ナンバーが外れた', !(m.oldPlates || []).length);
  ok('カードの紐づけが戻った', S.cards.find(c => c.id === 'c2').vehId === 'vs');
  ok('サブがアーカイブから戻った', !s.archived && !s.mergedInto);
  ok('控えを片づけた', !(m.mergeLog || []).length);
}
{
  /* 🔴 統合のあとで人が直した値は、取り消しても上書きしない */
  const { M, S } = boot(データ());
  const 記録 = M.apply('cu1', 'vm', 'vs', { 欄: {}, ナンバー: '旧として残す' });
  車(S, 'vm').car = 'ヤリス';                     /* あとから人が直した */
  M.undo('cu1', 記録.id);
  ok('🔴 あとから人が直した値は残す', 車(S, 'vm').car === 'ヤリス', 車(S, 'vm').car);
}
{
  const { M, 出た札 } = boot(データ());
  ok('無い記録は取り消せない', M.undo('cu1', 'mgXXXX') === false);
  ok('番号つきで知らせている（PF-6007）', 出た札.some(x => x.code === 'PF-6007'));
}

/* =====================================================================
   ⑦ 顧客はまたがない／物差しは1本（写しを作っていない）
   ===================================================================== */
console.log('\n── 🧭 ⑦ 決めごとを守っているか（ソースを見る） ──');
{
  const { M, S } = boot(データ());
  ok('🔴 自分自身とはまとめられない', M.plan('cu1', 'vm', 'vm') === null);
  ok('🔴 別のお客様の車は相手にできない', M.plan('cu1', 'vm', 'よその車') === null);
  ok('顧客そのものは触っていない（名前・連絡先）', S.customers[0].name === '見張り 太郎' && !S.customers[0].contacts.length);
}
{
  const cus = JS('customers.js');
  ok('🔴 来店履歴の引き当てが `pitVehPlates` を通っている', /_histCards[\s\S]{0,400}pitVehPlates/.test(cus));
  ok('🔴 その人のカードの引き当ても通っている', /const plates=\[\][\s\S]{0,300}pitVehPlates/.test(cus));
  ok('🔴 吸収された車はナンバーから引かない', /pitVehMerged\(v\)\) continue/.test(cus));
  ok('🔴 履歴の車の一覧にも出さない（履歴がまた2つに割れない）', /_histCars[\s\S]{0,220}pitVehMerged/.test(cus));
  ok('車カードに「まとめる」の入口がある', /PitVehMerge\.open\(/.test(cus));
  ok('取り消しは canRestore を通る所にだけ出す', /canR\) \? '<span class="cd-vb cd-vb-restore"/.test(cus));

  const idx = fs.readFileSync('index.html', 'utf8');
  ok('🔴 index.html に `?v=` 付きで載っている', /js\/veh-merge\.js\?v=\d+/.test(idx));
  const vers = [...idx.matchAll(/v?(\d+\.\d+\.\d+)/g)].map(m => m[1]);
  const meta = (idx.match(/app-version" content="([\d.]+)"/) || [])[1];
  const 画面 = (idx.match(/class="ver">v([\d.]+)</) || [])[1];
  const ログイン = (idx.match(/class="login-ver">v([\d.]+)</) || [])[1];
  ok('🔴 版が3か所そろっている（メタ・画面・ログイン）', meta && meta === 画面 && meta === ログイン, { meta, 画面, ログイン });

  const err = JS('errcode-pit.js');
  ['PF-6004', 'PF-6005', 'PF-6006', 'PF-6007'].forEach(c => {
    ok('台帳に ' + c + ' が載っている', err.indexOf("['" + c + "'") >= 0);
  });
}

/* =====================================================================
   ⑧ 画面（ブラウザは使わないが、組み立てる所は本物を通す）
   ⚠ 出す文字は見ない。**押せる道が本当につながっているか**だけを見る。
   ===================================================================== */
console.log('\n── 🖥 ⑧ 窓の組み立てと、押した時の道 ──');
{
  const D = データ();
  D.customers[0].vehicles.push({ id:'v3', plate:'野田 800 さ 3333', maker:'日産', car:'ノート' });
  const { M, S, ctx } = boot(D);
  let 出たHTML = '';
  ctx.custShowModal = (h) => { 出たHTML = h; };
  ctx.custCloseModal = () => {};
  ctx.custOpen = () => {};
  ctx.pitAsk = () => Promise.resolve(true);

  M.open('cu1', 'vm');
  ok('相手が2台以上なら、まず相手を選ばせる', /vm-pick/.test(出たHTML) && /PitVehMerge\.pick/.test(出たHTML));
  /* ⚠ 見出しには主のナンバーが出る（それは正しい）。**候補の並びの中に**主が居ないことを見る。 */
  const 候補 = (出たHTML.split('vm-pick">')[1] || '');
  ok('相手の候補に主は出さない', 候補.indexOf('野田 300 あ 1111') < 0);
  ok('相手の候補は2台（サブとv3）', (候補.match(/vm-pickrow/g) || []).length === 2, (候補.match(/vm-pickrow/g) || []).length);

  M.pick('vs');
  ok('選ぶと、まとめる窓になる', /vm-sum/.test(出たHTML));
  ok('🔴 ナンバーの扱いを2つとも出している', /旧として残す/.test(出たHTML) && /捨てる/.test(出たHTML));
  ok('どちらもまだ選ばれていない', 出たHTML.indexOf('vm-pl on') < 0);

  M.setPlate('旧として残す');
  ok('選んだ方に印が付く', /vm-pl on/.test(出たHTML));
  M.setField('karteNo', 'sub');
  ok('欄の選び直しも効く', /vm-opt on/.test(出たHTML));

  M.go();
  await new Promise(r => setTimeout(r, 5));
  const m = 車(S, 'vm');
  ok('🔴 押したら本当にまとまる', (m.伝票 || []).length === 2 && m.karteNo === 'K999', { 伝票:(m.伝票||[]).length, karteNo:m.karteNo });
  ok('まとめたあとも、まだ1台残っている（v3）', S.customers[0].vehicles.filter(v => !v.mergedInto && !v.archived).length === 2);
}

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' 件が緑／' + fail + ' 件が赤\n');
process.exit(fail ? 1 : 0);
