/* PitFlow ── 🔁 **ダブりが生まれる道すじを、そのまま再現する**（ブラウザは使わない）
   ===================================================================
   ◎ゆうたの説明（2026-08-30）＝**今まで見つかった重複は全部この形**
     ① TELで新規のお客様から「相談したい」の来店予約が入る
        → 分かるのは **ざっくりした車種と電話番号（と読みの名前）だけ**
     ② 予約に入力する → **顧客として登録がかかる**（ナンバーなしの車で1台できる）
     ③ 実際に来店。パッド交換で話がまとまり、作業日を相談してパーツを頼む
     ④ その時に **車検証と顧客情報をもらう**
        → **漢字の氏名・ナンバー・カルテNo** が分かる
     ⑤ その内容で**予約を入力する** → **ダブる**

   ◎この見張りがやること
     🔴 ①〜⑤を**本物の customers.js の道**（`upsertCustomerFromCard`）で流して、
        **本当にダブるところまで再現する。**（＝直したかどうかを、あとから測れる土台）
     🔴 そのうえで **`PitVehMerge` で1台に戻せる**ことを見る。
        ⚠ 大事なのは「**履歴（①の来店）も、⑤で入れた予約も、両方とも残る**」こと。

   ◎使い方
     node test_dup_flow.mjs
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
const 日 = (ずらす) => new Date(Date.now() + 86400000 * ずらす).toISOString().slice(0, 10);

function boot() {
  const ctx = {
    console, setTimeout, clearTimeout,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                addEventListener: () => {}, createElement: () => ({ style:{}, classList:{ add(){}, remove(){} } }) },
    state: { customers: [], cards: [], divisions: [{ id:'d2', label:'2課' }], staff: [], loaners: [] },
    PitDB: { save: function(){} },
    pitToast: () => {}, pitOpLog: () => {},
    pitCurrentStaffName: () => 'チーフ'
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(JS('customers.js'), ctx, { filename: 'customers.js' });
  vm.runInContext(JS('veh-merge.js'), ctx, { filename: 'veh-merge.js' });
  return ctx;
}

let ctx = boot();
let S = ctx.state;
const 顧客 = () => S.customers[0] || null;

/* =====================================================================
   ①② 相談の電話 → 予約を入力 → 顧客ができる
        分かっているのは「読みの名前・電話・ざっくりした車種」だけ
   ===================================================================== */
console.log('\n── ☎️ ①② 相談の電話で予約を入れる（ナンバーはまだ無い） ──');
const 相談 = {
  id: 'c相談', resNo: 'B05106',
  customer: '', kana: 'ミヤギ ヒロキ',              /* 🔴 漢字はまだ分からない＝カナだけ */
  tel: '090-2464-8948', contacts: [{ tel:'090-2464-8948', label:'個人携帯', primary:true }],
  maker: 'MINI', car: 'ミニF54', plate: '',          /* ざっくりした車種だけ */
  boardId: 'import', division: 'd2', frontStaff: '',
  status: 'reserved', reserveDate: 日(-3)
};
S.cards.push(相談);
ctx.upsertCustomerFromCard(相談);

ok('お客様が1人できた', S.customers.length === 1, S.customers.length);
ok('漢字が無くてもカナで名前になる', ctx.pitCustDispName(顧客()) === 'ミヤギ ヒロキ', ctx.pitCustDispName(顧客()));
ok('車が1台できた（ナンバーなし）', (顧客().vehicles || []).length === 1 && !ctx.pitIsRealPlate(顧客().vehicles[0].plate), 顧客().vehicles);
ok('カードにお客様が結び付いた', 相談.customerId === 顧客().id);

/* ③ 来店して話がまとまり、その日は終わる（＝来店履歴に残る）
   ⚠ 本物は「売上なし」だが、その判定は `pitCardNoSale`（別のファイル）1本なので、
      ここでは**同じ「終わった」側**にいる ふつうの返車済みで置く。見たいのは履歴と予約の分かれ方。 */
相談.status = 'returned'; 相談.returnDate = 日(-3); 相談.completedAt = 日(-3);
ctx.upsertCustomerFromCard(相談);
ok('①の来店が履歴として残っている', S.cards.filter(c => c.id === 'c相談').length === 1);

/* =====================================================================
   ④⑤ 車検証をもらって、漢字・ナンバー・カルテNoが分かる → その内容で予約を入れる
   ===================================================================== */
console.log('\n── 🪪 ④⑤ 車検証をもらって、正しい内容で予約を入れる ──');
/* 🔴 ここは **顧客呼び出しをした** 道（受付が既存のお客様を選んでから入力した）。
   ＝ カードが `customerId` を持っている。実データ（宮城様・髙橋様）はこの形だった。
   呼び出さずに入れた道は、下の「もう1つの道」で別に見る（**人ごとダブる**）。 */
const 本予約 = {
  id: 'c本予約', resNo: 'W69540', customerId: 顧客().id,
  customer: '宮城 広毅', kana: 'ミヤギ ヒロキ',        /* 🔴 ここで漢字が入る */
  tel: '090-2464-8948', contacts: [{ tel:'090-2464-8948', label:'個人携帯', primary:true }],
  maker: 'MINI', car: 'ミニF54', plate: '船橋 312 ち 127', karteNo: 'K-7149C',
  boardId: 'import', division: 'd2', frontStaff: '箱崎 康起',
  status: 'reserved', reserveDate: 日(2)
};
S.cards.push(本予約);
ctx.upsertCustomerFromCard(本予約);

ok('🔴 お客様は増えていない（人は当たっている）', S.customers.length === 1, S.customers.length);
ok('漢字の名前に直った', 顧客().name === '宮城 広毅', 顧客().name);
ok('🔴🔴 **車が2台になった＝これがダブり**', (顧客().vehicles || []).length === 2, (顧客().vehicles || []).map(v => v.plate));
const なし = 顧客().vehicles.find(v => !ctx.pitIsRealPlate(v.plate));
const 本物 = 顧客().vehicles.find(v => ctx.pitIsRealPlate(v.plate));
ok('片方はナンバーなし・片方は本物のナンバー', !!なし && !!本物, 顧客().vehicles);
ok('同じ車種なのに2台に見えている', なし.car === 本物.car && なし.car === 'ミニF54');
ok('カルテNoは新しい方だけが持っている', !((なし.karteNo||'').trim()) && (本物.karteNo||'').trim() === 'K-7149C');
/* 🔴🔴 ダブりの正体（ここが根っこ）
   ナンバーを持ったカードは、**ナンバーで車を探して、無ければ新しい車を作る**。
   「同じ人が持っている**ナンバーなしの同じ車種**」は見ていない＝だから2台になる。
   ⚠ 逆（ナンバーなしのカード）には、①カードが覚えている車 ②カルテNo ③メーカー+車種 の引き当てがある。
      **ナンバーが入った時のぶんが無い。** 直すならここ1か所（ゆうたの判断待ち）。 */

/* 現場で見えている姿＝保有2台・履歴1件・予約1件がばらばらに付いている */
const 済み = ctx.pitCardIsDone;
ok('来店履歴になるのは①だけ', S.cards.filter(済み).length === 1 && S.cards.filter(済み)[0].resNo === 'B05106');
ok('動いているのは⑤だけ', S.cards.filter(c => !済み(c)).length === 1 && S.cards.filter(c => !済み(c))[0].resNo === 'W69540');

/* =====================================================================
   ⑥ 統合で1台に戻す（🔴 履歴も予約も、どちらも残ること）
   ===================================================================== */
console.log('\n── 🔗 ⑥ 統合して1台に戻す ──');
const P = ctx.PitVehMerge.plan(顧客().id, 本物.id, なし.id);
ok('下ごしらえが出る', !!P);
ok('🔴 ナンバーの扱いは聞かれない（②にナンバーが無い＝ぶつかっていない）', P.ナンバーを選ぶ === false);
ok('🔴 かかっている予約を名指しできている（W69540）',
   P.予約.length === 1 && P.予約[0].resNo === 'W69540' && P.予約[0].側 === '主', P.予約);
ok('その予約は①の車としてそのまま残る（直さない）', P.予約[0].直す === false);

const 記録 = ctx.PitVehMerge.apply(顧客().id, 本物.id, なし.id, { 欄:{} });
ok('まとめられた', !!記録);
const 生きてる = 顧客().vehicles.filter(v => !v.mergedInto && !v.archived);
ok('🔴 保有台数が 2 → 1 になった', 生きてる.length === 1, 生きてる.map(v => v.plate));
ok('残ったのは本物のナンバーの方', 生きてる[0].plate === '船橋 312 ち 127');
ok('カルテNoも残っている', 生きてる[0].karteNo === 'K-7149C');
ok('🔴🔴 ①の来店履歴は消えていない', S.cards.some(c => c.resNo === 'B05106' && 済み(c)));
ok('🔴🔴 ⑤の予約も消えていない', S.cards.some(c => c.resNo === 'W69540' && !済み(c)));
ok('予約はまだそのお客様に付いている', S.cards.find(c => c.resNo === 'W69540').customerId === 顧客().id);
ok('🔴 ②は消えていない（アーカイブ）', 顧客().vehicles.length === 2 && !!顧客().vehicles.find(v => v.mergedInto));
ok('取り消せる控えが残っている', (生きてる[0].mergeLog || []).length === 1);

/* 取り消すと、ダブっていた姿にちゃんと戻る（管理者だけ） */
ok('取り消せた', ctx.PitVehMerge.undo(顧客().id, 記録.id) === true);
ok('🔴 ダブっていた姿に戻る（2台）', 顧客().vehicles.filter(v => !v.mergedInto && !v.archived).length === 2);
ok('履歴も予約も、戻したあとも残っている',
   S.cards.some(c => c.resNo === 'B05106') && S.cards.some(c => c.resNo === 'W69540'));

/* =====================================================================
   ⑦ ここが根っこ ── **同じ人・同じ車種で、片方だけナンバーが無い**
      ＝ 探せる形になっているか（データチェックに出す時の物差し）
   ===================================================================== */
console.log('\n── 🔎 ⑦ 探せる形か（次にやる「洗い出し」の下ごしらえ） ──');
{
  const あやしい = [];
  S.customers.forEach(function (cu) {
    const vs = (cu.vehicles || []).filter(v => v && !v.mergedInto && !v.archived);
    vs.forEach(function (a) {
      if (ctx.pitIsRealPlate(a.plate)) return;              /* ナンバーなしの車を起点に */
      vs.forEach(function (b) {
        if (b === a || !ctx.pitIsRealPlate(b.plate)) return;
        const 同じ車種 = (a.car || '').trim() && (a.car || '').trim() === (b.car || '').trim();
        if (同じ車種) あやしい.push({ 客: ctx.pitCustDispName(cu), なし: a.id, 本物: b.plate });
      });
    });
  });
  ok('🔴 この形は機械的に見つけられる（同じ人・同じ車種・片方ナンバーなし）',
     あやしい.length === 1 && あやしい[0].本物 === '船橋 312 ち 127', あやしい);
}

/* =====================================================================
   ⑧ もう1つの道 ── **顧客呼び出しをしないで入れると、人ごとダブる**
      🔴 これは車のダブりより厄介（連絡先も履歴も2つに割れる）
   ===================================================================== */
console.log('\n── 🚨 ⑧ 呼び出さずに入れた道（人ごとダブる） ──');
{
  ctx = boot(); S = ctx.state;
  const 相談2 = Object.assign({}, 相談, { customerId: undefined, status:'returned', noSale:true });
  S.cards.push(相談2);
  ctx.upsertCustomerFromCard(相談2);
  ok('①でカナだけのお客様ができる', S.customers.length === 1 && !String(S.customers[0].name || '').trim());

  const 本予約2 = Object.assign({}, 本予約, { customerId: undefined });   /* 🔴 呼び出していない */
  S.cards.push(本予約2);
  ctx.upsertCustomerFromCard(本予約2);

  ok('🚨🚨 **お客様が2人になる**（カナだけの人に、漢字の予約がくっつかない）', S.customers.length === 2, S.customers.length);
  ok('電話番号は同じなのに別人になっている',
     S.customers[0].contacts[0].tel === S.customers[1].contacts[0].tel, S.customers.map(x => x.contacts[0].tel));
  /* 🔴 正体＝人を引く時、**漢字の名前があると漢字でしか探さない**。
     カナ＋TELで引く道は「漢字が無いカード」専用（`if(!nm && kn)`）なので通らない。
     ⚠ 車の統合では直せない（あれは同じお客様の中の話）。**顧客の統合**か、引き当ての作り直しが要る。 */
  ok('🔴 この形は車の統合では直せない（別のお客様どうしだから）',
     ctx.PitVehMerge.plan(S.customers[0].id,
       (S.customers[0].vehicles[0] || {}).id, (S.customers[1].vehicles[0] || {}).id) === null);
}

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' 件が緑／' + fail + ' 件が赤\n');
process.exit(fail ? 1 : 0);
