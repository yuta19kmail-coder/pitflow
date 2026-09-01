/* PitFlow ── 🔁 **ダブりが生まれる道すじを、そのまま再現する**（ブラウザは使わない）
   ===================================================================
   ◎現場の流れ（2026-08-30・ゆうたが受付に聞いてきた本当の流れ）
     ① 予約の電話。**枠が埋まってしまうので、相談来店と本予約を「両方いっぺんに」取る**
        ＝ この時点で**カードが2枚**。どちらも分かっているのは
           **読みの名前・電話番号・ざっくりした車種**だけ（ナンバーなし）
     ② 相談来店。話がまとまり、**車検証と顧客情報をもらう**
        ＝ 漢字の氏名・ナンバー・カルテNoが分かる
     ③ 「直そう」となる。でも **相談来店のカードはもう終わっている（アーカイブ）ので変えられない**
     ④ ＝ **本予約のカードだけ**が新しい内容に変わる
     ⑤ → **ダブる**

   ◎🔴🔴 突き止めたこと
     ダブった瞬間、**カードは「どの車か」を既に覚えていた**（`c.vehId`）。
     ところが `upsertCustomerFromCard` は、**ナンバーが入っているとナンバーでしか車を探さない**。
     覚えている車（ナンバーなし）を見ずに、**新しい車を作って**カードの覚えまで書き換えていた。

   ◎🔵 v2.34.0 で直した（ゆうた指定 2026-08-30）
     「**ナンバーなしの車が居るのに、本物のナンバーが入った**」時だけ、**1回聞く**。
       ・「**同じ車です**（ナンバーを入れる）」  … 1台のまま。過去の入庫もこの車の履歴に並ぶ
       ・「**別の車です**（乗り換え・増車）」    … 今までどおり新しい車
     ⚠ 名前・電話・担当・カルテNo の直しでは**聞かない**（車が別物になる変更ではない）。
     ⚠ 窓が無い所（取り込み・サンプル・この見張り）は**既定＝同じ車**＝ダブりを増やさない側。
     ⚠ どちらを選んでも**過去のカードは書き換えない**（当時は「ナンバー未定」のまま）。

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

function boot(答え) {
  const 聞かれた = [];
  const ctx = {
    console, setTimeout, clearTimeout,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                addEventListener: () => {}, createElement: () => ({ style:{}, classList:{ add(){}, remove(){} } }) },
    state: { customers: [], cards: [], divisions: [{ id:'d2', label:'2課' }], staff: [], loaners: [] },
    PitDB: { save: function(){} },
    pitToast: () => {}, pitOpLog: () => {},
    pitCurrentStaffName: () => 'チーフ'
  };
  /* 答え を渡した時だけ窓がある世界にする（true＝同じ車です／false＝別の車です） */
  if (答え !== undefined) ctx.pitAsk = (msg, opt) => { 聞かれた.push({ msg, opt }); return Promise.resolve(答え); };
  ctx.聞かれた = 聞かれた;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(JS('customers.js'), ctx, { filename: 'customers.js' });
  vm.runInContext(JS('veh-merge.js'), ctx, { filename: 'veh-merge.js' });
  return ctx;
}

/* 電話1本で取る2枚。どちらも分かっているのは 読みの名前・電話・ざっくりした車種だけ */
const 素の中身 = () => ({
  customer: '', kana: 'ミヤギ ヒロキ',
  tel: '090-2464-8948', contacts: [{ tel:'090-2464-8948', label:'個人携帯', primary:true }],
  maker: 'MINI', car: 'ミニF54', plate: '',
  boardId: 'import', division: 'd2', status: 'reserved'
});

let ctx = boot();
let S = ctx.state;
const 顧客 = () => S.customers[0] || null;

/* =====================================================================
   ① 電話1本で、相談来店と本予約を「両方いっぺんに」取る
   ===================================================================== */
console.log('\n── ☎️ ① 相談来店と本予約を、いっぺんに2枚取る ──');
const 相談   = Object.assign({ id:'c相談',   resNo:'B05106', reserveDate:日(-3) }, 素の中身());
const 本予約 = Object.assign({ id:'c本予約', resNo:'W69540', reserveDate:日(2)  }, 素の中身());
S.cards.push(相談, 本予約);
ctx.upsertCustomerFromCard(相談);
ctx.upsertCustomerFromCard(本予約);

ok('お客様は1人だけできた', S.customers.length === 1, S.customers.length);
ok('漢字が無くてもカナで名前になる', ctx.pitCustDispName(顧客()) === 'ミヤギ ヒロキ');
ok('🔴 車も1台だけ（2枚取っても増えない）', (顧客().vehicles || []).length === 1, 顧客().vehicles);
ok('🔴🔴 **2枚とも、同じ車を覚えている**（c.vehId）',
   !!相談.vehId && 相談.vehId === 本予約.vehId, { 相談:相談.vehId, 本予約:本予約.vehId });
const 元の車 = 顧客().vehicles[0];
ok('その車はナンバーなし', !ctx.pitIsRealPlate(元の車.plate));

/* =====================================================================
   ②③ 相談来店が終わる → もう直せない（アーカイブ）
   ===================================================================== */
console.log('\n── 🔒 ②③ 相談来店が終わる（もう直せない） ──');
相談.status = 'returned'; 相談.returnDate = 日(-3); 相談.completedAt = 日(-3);
ok('相談来店は「終わった」側になった', ctx.pitCardIsDone(相談) === true);
ok('本予約はまだ動いている', ctx.pitCardIsDone(本予約) === false);

/* =====================================================================
   ④ 本予約だけを、判明した内容に直す → ここでダブる
   ===================================================================== */
console.log('\n── 🪪 ④ 本予約だけを直す（直したので、もうダブらない） ──');
const 直す前のvehId = 本予約.vehId;
本予約.customer = '宮城 広毅';
本予約.plate    = '船橋 312 ち 127';
本予約.karteNo  = 'K-7149C';
本予約.frontStaff = '箱崎 康起';
ctx.upsertCustomerFromCard(本予約);

ok('お客様は増えていない', S.customers.length === 1);
ok('漢字の名前に直った', 顧客().name === '宮城 広毅', 顧客().name);
ok('🔵🔵 **車は1台のまま**（ダブらない）', (顧客().vehicles || []).length === 1,
   (顧客().vehicles || []).map(v => v.plate || '(なし)'));
ok('🔵 覚えていた車に、そのままナンバーが入った', 顧客().vehicles[0].id === 直す前のvehId);
ok('カルテNoも同じ車に入った', 顧客().vehicles[0].karteNo === 'K-7149C');
ok('🔵 本予約は、その車を指したまま', 本予約.vehId === 直す前のvehId);
ok('🔵🔵 相談来店のカードも、同じ車を指したまま', 相談.vehId === 直す前のvehId);
ok('⚠ 当時のカードは書き換えていない（相談来店のナンバーは空のまま）', !String(相談.plate || '').trim());

/* =====================================================================
   ④-2 窓がある世界＝1回だけ聞く。「別の車です」なら今までどおり増える
   ===================================================================== */
console.log('\n── 🗣 ④-2 聞く／聞かない ──');
{
  /* 「同じ車です」と答えた時 */
  const c1 = boot(true); const s1 = c1.state;
  const a1 = Object.assign({ id:'a', resNo:'B1' }, 素の中身());
  s1.cards.push(a1); c1.upsertCustomerFromCard(a1);
  const b1 = Object.assign({ id:'b', resNo:'B2' }, 素の中身(), { customerId:s1.customers[0].id, vehId:a1.vehId, plate:'船橋 312 ち 127' });
  s1.cards.push(b1); c1.upsertCustomerFromCard(b1);
  await new Promise(r => setTimeout(r, 5));
  ok('🔴 ナンバーが入った時に、1回だけ聞いている', c1.聞かれた.length === 1, c1.聞かれた.length);
  ok('見出しは1行で言い切っている', /ナンバーは、この車のものですか/.test(c1.聞かれた[0].msg), c1.聞かれた[0].msg);
  ok('ボタンの言葉が「目的」になっている',
     /同じ車です/.test(c1.聞かれた[0].opt.ok) && /別の車です/.test(c1.聞かれた[0].opt.cancel),
     [c1.聞かれた[0].opt.ok, c1.聞かれた[0].opt.cancel]);
  ok('「同じ車です」→ 1台のまま', s1.customers[0].vehicles.length === 1, s1.customers[0].vehicles.map(v => v.plate));

  /* 「別の車です」と答えた時＝乗り換え・増車の道は残っている */
  const c2 = boot(false); const s2 = c2.state;
  const a2 = Object.assign({ id:'a', resNo:'B1' }, 素の中身());
  s2.cards.push(a2); c2.upsertCustomerFromCard(a2);
  const b2 = Object.assign({ id:'b', resNo:'B2' }, 素の中身(), { customerId:s2.customers[0].id, vehId:a2.vehId, plate:'船橋 312 ち 127' });
  s2.cards.push(b2); c2.upsertCustomerFromCard(b2);
  await new Promise(r => setTimeout(r, 5));
  ok('🔵 「別の車です」→ 2台になる（増車の道は塞がない）', s2.customers[0].vehicles.length === 2,
     s2.customers[0].vehicles.map(v => v.plate || '(なし)'));
  ok('新しい方を指すようになる', b2.vehId !== a2.vehId);

  /* 🔴 聞きすぎない＝車が別物になる変更でなければ、窓は出ない */
  const c3 = boot(true); const s3 = c3.state;
  const a3 = Object.assign({ id:'a', resNo:'B1' }, 素の中身());
  s3.cards.push(a3); c3.upsertCustomerFromCard(a3);
  const 回数 = c3.聞かれた.length;
  a3.customer = '宮城 広毅'; c3.upsertCustomerFromCard(a3);              /* 名前を直した */
  a3.frontStaff = '箱崎 康起'; c3.upsertCustomerFromCard(a3);            /* 担当を入れた */
  a3.karteNo = 'K-7149C'; c3.upsertCustomerFromCard(a3);                 /* カルテNoを入れた */
  a3.tel = '090-0000-0000'; c3.upsertCustomerFromCard(a3);               /* 電話を直した */
  await new Promise(r => setTimeout(r, 5));
  ok('🔴 名前・担当・カルテNo・電話の直しでは聞かない', c3.聞かれた.length === 回数, c3.聞かれた.length);
  ok('その間も車は1台のまま', s3.customers[0].vehicles.length === 1);

  /* 🔵 v2.34.1 車種名がちがっても拾う（ナンバーなしが1台だけなら） */
  const c5 = boot(true); const s5 = c5.state;
  const a5 = Object.assign({ id:'a', resNo:'B1' }, 素の中身());          /* 相談時＝ざっくり「ミニF54」 */
  s5.cards.push(a5); c5.upsertCustomerFromCard(a5);
  /* 車検証を見たら別の名前だった。しかも新しく取り直した予約なので、車を覚えていない */
  const b5 = Object.assign({ id:'b', resNo:'B2' }, 素の中身(),
    { customerId:s5.customers[0].id, car:'ミニF55', plate:'船橋 312 ち 127' });
  s5.cards.push(b5); c5.upsertCustomerFromCard(b5);
  await new Promise(r => setTimeout(r, 5));
  ok('🔵 車種名がちがっても聞く（ナンバーなしが1台だけ）', c5.聞かれた.length === 1, c5.聞かれた.length);
  ok('🔵 窓が「車種名がちがう」ことを先に言っている',
     (c5.聞かれた[0].opt.detail || []).some(x => /車種名がちがいます/.test(x)), c5.聞かれた[0].opt.detail);
  ok('「同じ車です」→ 1台のまま', s5.customers[0].vehicles.length === 1, s5.customers[0].vehicles.map(v => v.car));
  ok('🔵 車種名は車検証の方に直る', s5.customers[0].vehicles[0].car === 'ミニF55', s5.customers[0].vehicles[0].car);

  /* 🔴 ナンバーなしが2台あって、名前もどちらとも合わない時は、こちらで決めない */
  const c6 = boot(true); const s6 = c6.state;
  const x1 = Object.assign({ id:'x1', resNo:'B1' }, 素の中身());
  s6.cards.push(x1); c6.upsertCustomerFromCard(x1);
  const x2 = Object.assign({ id:'x2', resNo:'B2' }, 素の中身(), { customerId:s6.customers[0].id, car:'ミニF60' });
  s6.cards.push(x2); c6.upsertCustomerFromCard(x2);
  await new Promise(r => setTimeout(r, 5));
  ok('ナンバーなしが2台ある状態を作れた', s6.customers[0].vehicles.length === 2, s6.customers[0].vehicles.map(v => v.car));
  const 回数6 = c6.聞かれた.length;
  const x3 = Object.assign({ id:'x3', resNo:'B3' }, 素の中身(), { customerId:s6.customers[0].id, car:'ミニF57', plate:'船橋 300 あ 2' });
  s6.cards.push(x3); c6.upsertCustomerFromCard(x3);
  await new Promise(r => setTimeout(r, 5));
  ok('🔴 どれのことか決められない時は聞かない（今までどおり新しい車）', c6.聞かれた.length === 回数6, c6.聞かれた.length);
  ok('その時は3台になる', s6.customers[0].vehicles.length === 3);

  /* 2台目を本当に買った時（ナンバーなしの車が居ない）＝聞かずに増える */
  const c4 = boot(true); const s4 = c4.state;
  const a4 = Object.assign({ id:'a', resNo:'B1' }, 素の中身(), { plate:'船橋 312 ち 127' });
  s4.cards.push(a4); c4.upsertCustomerFromCard(a4);
  const b4 = Object.assign({ id:'b', resNo:'B2' }, 素の中身(), { customerId:s4.customers[0].id, car:'ミニF60', plate:'船橋 300 あ 1' });
  s4.cards.push(b4); c4.upsertCustomerFromCard(b4);
  await new Promise(r => setTimeout(r, 5));
  ok('🔴 ナンバーなしの車が居なければ聞かない（ふつうの増車）', c4.聞かれた.length === 0);
  ok('ふつうに2台になる', s4.customers[0].vehicles.length === 2);
}

/* =====================================================================
   ⑤ 統合で1台に戻す（履歴も予約も、どちらも残ること）
   ===================================================================== */
console.log('\n── 🔗 ⑤ すでにダブっている分は、統合で1台に戻す ──');
/* ⚠ v2.34.0 で新しくはダブらなくなったが、**すでに貯まっている分**は残る。その受け皿。 */
顧客().vehicles.push({ id:'v古い', plate:'', maker:'MINI', car:'ミニF54', updatedAt:Date.now() });
相談.vehId = 'v古い'; 相談.plate = '';
const 本物 = 顧客().vehicles.find(v => ctx.pitIsRealPlate(v.plate));
const なし = 顧客().vehicles.find(v => !ctx.pitIsRealPlate(v.plate));
const P = ctx.PitVehMerge.plan(顧客().id, 本物.id, なし.id);
ok('下ごしらえが出る', !!P);
ok('ナンバーの扱いは聞かれない（②にナンバーが無い）', P.ナンバーを選ぶ === false);
ok('🔴 かかっている予約を名指しできている（W69540）',
   P.予約.length === 1 && P.予約[0].resNo === 'W69540', P.予約);
ok('🔴 相談来店のカードは②側として数えられている（紐づけ1件）', P.カード.紐づけ === 1, P.カード);

const 記録 = ctx.PitVehMerge.apply(顧客().id, 本物.id, なし.id, { 欄:{} });
ok('まとめられた', !!記録);
ok('🔴 保有台数が 2 → 1', 顧客().vehicles.filter(v => !v.mergedInto && !v.archived).length === 1);
ok('🔴🔴 相談来店の履歴は消えていない', S.cards.some(c => c.resNo === 'B05106' && ctx.pitCardIsDone(c)));
ok('🔴🔴 本予約も消えていない', S.cards.some(c => c.resNo === 'W69540' && !ctx.pitCardIsDone(c)));
ok('🔴 相談来店のカードも、まとめたあとの車を指している', 相談.vehId === 本物.id, 相談.vehId);
ok('②は消えていない（アーカイブ）', !!顧客().vehicles.find(v => v.mergedInto));
ok('取り消せる', ctx.PitVehMerge.undo(顧客().id, 記録.id) === true);
ok('取り消すと、ダブっていた姿に戻る', 顧客().vehicles.filter(v => !v.mergedInto && !v.archived).length === 2);

/* =====================================================================
   ⑤-2 ナンバー変更（v2.35.0）＝聞かずに、その車のナンバーを書き換える
        🗣 ゆうた「新規予約からだと増車ボタンがあるよね？ だから間違えなくない？」
   ===================================================================== */
console.log('\n── 🔢 ⑤-2 ナンバー変更（聞かない） ──');
{
  /* 実績のある車のナンバーが変わった＝旧ナンバーを残す */
  const c1 = boot(true); const s1 = c1.state;
  /* ⚠ 素の中身() は status:'reserved' を持っているので、**あとから**上書きすること */
  const a = Object.assign({ id:'a', resNo:'B1' }, 素の中身(), { plate:'船橋 312 ち 127', status:'returned', completedAt:日(-10) });
  s1.cards.push(a); c1.upsertCustomerFromCard(a);
  const 車id = a.vehId;
  const b = Object.assign({ id:'b', resNo:'B2' }, 素の中身(), { customerId:s1.customers[0].id, vehId:車id, plate:'柏 300 あ 999' });
  s1.cards.push(b); c1.upsertCustomerFromCard(b);
  await new Promise(r => setTimeout(r, 5));
  ok('🔵 ナンバー変更では聞かない', c1.聞かれた.length === 0, c1.聞かれた.length);
  ok('🔵 車は増えない（1台のまま）', s1.customers[0].vehicles.length === 1, s1.customers[0].vehicles.map(v => v.plate));
  ok('🔵 新しいナンバーになった', s1.customers[0].vehicles[0].plate === '柏 300 あ 999');
  ok('🔵 実績があったので旧ナンバーを残した',
     (s1.customers[0].vehicles[0].oldPlates || []).indexOf('船橋 312 ち 127') >= 0, s1.customers[0].vehicles[0].oldPlates);
  ok('🔵 打ち替えた記録が車に残る（あとで混ざりに気づける）',
     (s1.customers[0].vehicles[0].plateLog || []).length === 1, s1.customers[0].vehicles[0].plateLog);
  ok('記録に 前→後 が入っている',
     s1.customers[0].vehicles[0].plateLog[0].前 === '船橋 312 ち 127' && s1.customers[0].vehicles[0].plateLog[0].後 === '柏 300 あ 999');

  /* 実績が1件も無いナンバー＝打ち間違い。旧ナンバーとして残さない */
  const c2 = boot(true); const s2 = c2.state;
  const x = Object.assign({ id:'x', resNo:'B1' }, 素の中身(), { plate:'船橋 312 ち 127' });   /* まだ予約中 */
  s2.cards.push(x); c2.upsertCustomerFromCard(x);
  x.plate = '船橋 312 ち 128';                                   /* 打ち間違いを直した */
  c2.upsertCustomerFromCard(x);
  await new Promise(r => setTimeout(r, 5));
  ok('🔵 打ち間違いの直しでも車は増えない', s2.customers[0].vehicles.length === 1);
  ok('🔵 実績が無いナンバーは旧ナンバーに残さない',
     !(s2.customers[0].vehicles[0].oldPlates || []).length, s2.customers[0].vehicles[0].oldPlates);
}

/* =====================================================================
   ⑤-3 旧姓（v2.35.0）＝名前が変わったら自動で残す
   ===================================================================== */
console.log('\n── 👤 ⑤-3 旧姓を自動で残す ──');
{
  const c1 = boot(true); const s1 = c1.state;
  const a = Object.assign({ id:'a', resNo:'B1' }, 素の中身(), { customer:'溝口 花子', kana:'ミゾグチ ハナコ' });
  s1.cards.push(a); c1.upsertCustomerFromCard(a);
  ok('はじめは旧姓なし', !(s1.customers[0].oldNames || []).length);
  a.customer = '田中 花子';                       /* 結婚・離婚で苗字が変わった */
  c1.upsertCustomerFromCard(a);
  ok('🔵 名前が変わったら、前の名前が旧姓に残る',
     (s1.customers[0].oldNames || []).indexOf('溝口 花子') >= 0, s1.customers[0].oldNames);
  ok('いまの名前は新しい方', s1.customers[0].name === '田中 花子');

  /* 空 → 入った（電話口のカナだけ → 漢字が分かった）は「変更」ではないので残さない */
  const c2 = boot(true); const s2 = c2.state;
  const b = Object.assign({ id:'b', resNo:'B2' }, 素の中身());     /* customer は空・カナだけ */
  s2.cards.push(b); c2.upsertCustomerFromCard(b);
  b.customer = '宮城 広毅';
  c2.upsertCustomerFromCard(b);
  ok('🔵 カナだけ → 漢字が入った時は旧姓に残さない', !(s2.customers[0].oldNames || []).length, s2.customers[0].oldNames);
}

/* =====================================================================
   ⑤-4 打っている最中の「似た方がいます」（v2.35.0・ソースを見る）
   ===================================================================== */
console.log('\n── 🔎 ⑤-4 候補を出す土台 ──');
{
  const cus = fs.readFileSync(path.join(process.cwd(), 'js', 'customers.js'), 'utf8');
  const cd  = fs.readFileSync(path.join(process.cwd(), 'js', 'card-detail.js'), 'utf8');
  ok('候補を出す口がある（pitRecallHint）', /window\.pitRecallHint\s*=/.test(cus));
  ok('🔴 呼び出し済みのカードでは出さない', /c\.customerId\) return hide\(\)/.test(cus));
  ok('🔴 1文字では出さない', /norm\(q\)\.length<2/.test(cus));
  ok('名前・カナ・電話の3つに付いている', (cd.match(/pitRecallHint\(this,event\)/g) || []).length === 7,
     (cd.match(/pitRecallHint\(this,event\)/g) || []).length);
  ok('🔵 検索が旧姓を見る', /oldNames\|\|\[\]\)\.some/.test(cus));
  ok('🔵 検索が旧ナンバーを見る', /oldPlates\|\|\[\]\)\.some/.test(cus));
}

/* =====================================================================
   ⑥ もう1つの道 ── **顧客呼び出しをしないで入れると、人ごとダブる**
      （今回の主犯ではないが、別に残っている穴）
   ===================================================================== */
console.log('\n── 🚨 ⑥ 別の穴：呼び出さずに入れると人ごとダブる ──');
{
  ctx = boot(); S = ctx.state;
  const 相談2 = Object.assign({ id:'c1', resNo:'B05106', status:'returned', completedAt:日(-3) }, 素の中身());
  S.cards.push(相談2); ctx.upsertCustomerFromCard(相談2);
  ok('カナだけのお客様ができる', S.customers.length === 1 && !String(S.customers[0].name || '').trim());

  /* 🔴 呼び出さずに、いきなり漢字の名前で新しい予約を入れる */
  const 別枠 = Object.assign({ id:'c2', resNo:'X00001' }, 素の中身(), { customer:'宮城 広毅', plate:'船橋 312 ち 127' });
  S.cards.push(別枠); ctx.upsertCustomerFromCard(別枠);

  ok('🚨🚨 **お客様が2人になる**（カナだけの人に、漢字の予約がくっつかない）', S.customers.length === 2, S.customers.length);
  ok('電話番号は同じなのに別人になっている',
     S.customers[0].contacts[0].tel === S.customers[1].contacts[0].tel);
  ok('🔴 車の統合では直せない（別のお客様どうしだから）',
     ctx.PitVehMerge.plan(S.customers[0].id,
       (S.customers[0].vehicles[0]||{}).id, (S.customers[1].vehicles[0]||{}).id) === null);
}

/* =====================================================================
   ⑦ 洗い出しの物差し（あとで作る「見つける側」の下ごしらえ）
   ===================================================================== */
console.log('\n── 🔎 ⑦ 探せる形か ──');
{
  /* ⚠ v2.34.0 で新しくはダブらないので、**すでに貯まっている姿**を手で作って試す
     （洗い出しは「これから」ではなく「もう居る分」を見つけるための物差し） */
  ctx = boot(false); S = ctx.state;
  const a = Object.assign({ id:'c1', resNo:'B1' }, 素の中身());
  S.cards.push(a); ctx.upsertCustomerFromCard(a);
  const b = Object.assign({ id:'c2', resNo:'B2' }, 素の中身(), { customerId:S.customers[0].id, vehId:a.vehId, plate:'船橋 312 ち 127' });
  S.cards.push(b); ctx.upsertCustomerFromCard(b);
  await new Promise(r => setTimeout(r, 5));

  const あやしい = [];
  S.customers.forEach(function (cu) {
    const vs = (cu.vehicles || []).filter(v => v && !v.mergedInto && !v.archived);
    vs.forEach(function (x) {
      if (ctx.pitIsRealPlate(x.plate)) return;
      vs.forEach(function (y) {
        if (y === x || !ctx.pitIsRealPlate(y.plate)) return;
        if ((x.car || '').trim() && (x.car || '').trim() === (y.car || '').trim())
          あやしい.push({ 客: ctx.pitCustDispName(cu), 本物: y.plate });
      });
    });
  });
  ok('🔴 同じ人・同じ車種・片方ナンバーなし＝機械的に見つけられる',
     あやしい.length === 1 && あやしい[0].本物 === '船橋 312 ち 127', あやしい);
}

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' 件が緑／' + fail + ' 件が赤\n');
process.exit(fail ? 1 : 0);
