/* PitFlow ── 🗂 **マスター入力：話として成立しないものを弾く**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた指定（2026-09-07）
     🗣「その他、**話として成立しないものは自由といってもはじく仕様**にしたい。
     　　例えばさっきも**車検に合格してるのに理由がはいっていたり、返車日と入庫日が逆転した日を指していたり、
     　　確定売上が入ってるのに非カウント保存しようとしていたり**みたいな事」

   ◎決めごと（2段）
     🔴 止める … 話として成立しない。**保存を押せない**
     🟠 聞く  … ありうるが、押す前に一度確かめる
     ⚠ 「同じ車が同じ日に2枚」のように**実際には正しいことがある**ものは、止めずに聞く側
        （データチェックで R01 に「確認した」を出せるようにしたのと同じ考え方）。

   ◎ここで見張るもの
     ① ゆうたが挙げた3つが本当に止まる
     ② 日付の前後・状態と中身の食い違いが止まる
     ③ **正しいカードは止まらない**（塞ぎすぎていない）
     ④ 必須の判定を書き写していない（`pitCardMisses` を借りている）
     ⑤ 使われていない欄（急ぎ）を画面に並べていない

   ◎使い方（PitFlow のフォルダで）
     node _見張り/test_master.mjs
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

const ctx = { console, setTimeout, clearTimeout,
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
  state: { cards: [], customers: [], loaners: [], companyCars: [], boards: [{ id:'default', name:'国産車', cols:[] }],
           settings: {}, workTypes: [], staff: [], divisions: [], dropTypes: [], repeatTypes: [] } };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(JS('intern-pit.js'),  ctx, { filename:'intern-pit.js' });
vm.runInContext(JS('pit-share.js'),   ctx, { filename:'pit-share.js' });
vm.runInContext(JS('card-miss.js'),   ctx, { filename:'card-miss.js' });
vm.runInContext(JS('master-pit.js'),  ctx, { filename:'master-pit.js' });

/* 話の通る1枚（返車まで終わった車検）＝これが止まってはいけない */
const 良い = () => ({
  id:'m1', kana:'ミヤギ ヒロキ', customer:'宮城 大輝', repeat:'repeat', dropType:'drop',
  workType:'shaken', workTypes:['shaken'], feeAmount: 0, boardId:'import',
  reserveDate:'2026-07-14', actualInAt:'2026-07-14', returnDate:'2026-07-18',
  returnDateFinal:'2026-07-18', completedAt:'2026-07-18', salesDate:'2026-07-18',
  status:'returned', returnStage:'returnWait', amountFinal: 171500, plate:'柏 300 あ 12-34',
  inspSchedule:{ mode:'manual', slots:{}, decided:'2026-07-16', result:'done',
                 history:[{ date:'2026-07-16', slot:'pm', result:'recheck', why:'光軸' },
                          { date:'2026-07-17', slot:'am', result:'pass',    why:'' }] }
});
const stops = (c) => ctx.pitMasterChecks(c).stop;
const warns = (c) => ctx.pitMasterChecks(c).warn;
const 引っかかる = (c, w) => stops(c).some(x => x.indexOf(w) >= 0);

console.log('\n── ①🔴🔴 ゆうたが挙げた3つ ──');
{
  let c = 良い(); c.inspSchedule.history[1].why = 'なにか';
  ok('🔴🔴 車検に合格しているのに理由が入っている → 止まる', 引っかかる(c, '合格なのに'), stops(c));

  c = 良い(); c.returnDate = '2026-07-10';
  ok('🔴🔴 返車予定日が入庫日より前 → 止まる', 引っかかる(c, '返車予定日'), stops(c));

  c = 良い(); c.noSale = true;
  ok('🔴🔴 確定金額が入っているのに「売上なし」で保存 → 止まる', 引っかかる(c, '売上なし'), stops(c));
}

console.log('\n── ② そのほかの「話として成立しない」 ──');
{
  let c = 良い(); c.returnDateFinal = '2026-07-13';
  ok('確定返車日が実入庫日より前 → 止まる', 引っかかる(c, '確定返車日'), stops(c));
  c = 良い(); c.completedAt = '2026-07-01';
  ok('実績カウント日が入庫日より前 → 止まる', 引っかかる(c, '実績カウント日'), stops(c));
  c = 良い(); c.completedAt = '';
  ok('返車済みなのに実績カウント日が空 → 止まる', 引っかかる(c, '実績カウント日が空'), stops(c));
  c = 良い(); c.amountFinal = '';
  ok('返車済みなのに確定金額が空 → 止まる', 引っかかる(c, '確定金額が空'), stops(c));
  c = 良い(); c.status = 'reserved'; c.completedAt = '';
  ok('まだ入庫していないのに実入庫日が入っている → 止まる', 引っかかる(c, '実際に入庫した日'), stops(c));
  c = 良い(); c.needLoaner = true; c.loanerId = 'L1'; c.loanerFrom = '2026-07-18'; c.loanerTo = '2026-07-14';
  ok('代車の「まで」が「から」より前 → 止まる', 引っかかる(c, '貸出まで'), stops(c));
  c = 良い(); c.inspSchedule.history[1].date = '2026-07-25';
  ok('車検に行った日が確定返車日より後 → 止まる', 引っかかる(c, '確定返車日より後'), stops(c));
  c = 良い(); c.inspSchedule.history[1].result = 'recheck'; c.inspSchedule.history[1].why = '光軸';
  ok('「終わった（合格）」なのに最後の記録が不合格 → 止まる', 引っかかる(c, '最後の記録が不合格'), stops(c));
  c = 良い(); c.kana = '';
  ok('🔴 必須（カナ）が空 → 止まる（判定は card-miss.js を借りている）', 引っかかる(c, '必須が空'), stops(c));
}

console.log('\n── ③🟢 正しいカードは止まらない（塞ぎすぎていない） ──');
{
  const c = 良い();
  ok('🟢🟢 話の通る1枚は1つも止まらない', stops(c).length === 0, stops(c));
  ok('🟠 それでも「月次の数字が動く」とは言う（押す前に一度聞く）',
     warns(c).some(x => x.indexOf('月次の数字が動きます') >= 0), warns(c));
  const c2 = 良い(); c2.noSale = true; c2.amountFinal = '';
  ok('🟢 売上なしで確定金額も空なら通る', stops(c2).length === 0, stops(c2));
}

console.log('\n── ④ 同じ車・同じ日は「止めずに聞く」（正しいことがあるため） ──');
{
  const c = 良い();
  ctx.state.cards = [{ id:'other', plate:'柏 300 あ 12-34', reserveDate:'2026-07-14', status:'check' }];
  ok('🔴 止めない', !引っかかる(c, '同じ車'), stops(c));
  ok('🔴 でも聞く', warns(c).some(x => x.indexOf('同じ車') >= 0), warns(c));
  ctx.state.cards = [];
}

console.log('\n── ⑤🗑🖨 売上なしアーカイブ／表紙を印刷して保存（ゆうた指定 2026-09-07） ──');
{
  /* 🗣「保存の他に表紙を印刷して保存。売上なしとアーカイブのバッチはなしで、売上なしアーカイブで保存する」
     🗣「アーカイブは状態が実績なら勝手にそうなるでしょ？」＝そのとおり（archive-pit.js の物差し）。 */
  const s2 = JS('master-pit.js');
  ok('🔴 「売上なし」の札を置いていない', !/chip\(!!M\.noSale/.test(s2));
  ok('🔴 「アーカイブ」の札も置いていない（返車済みなら自動で付くため）', !/chip\(!!M\.archived/.test(s2));
  ok('🔴 かわりに「売上なしアーカイブで保存」のボタンがある', /pitMasterNoSale/.test(s2));
  ok('🔴 中身は予約詳細と同じ手順（印＋返車済み＋実績カウント日を空＋確定返車日）',
     /M\.noSale = true/.test(s2) && /M\.status = 'returned'/.test(s2)
     && /M\.completedAt = ''/.test(s2) && /M\.returnDateFinal =/.test(s2));
  ok('🖨 表紙は `pitPrintCover` 1本を呼ぶだけ', /w\.pitPrintCover\(live\.id\)/.test(s2));
  ok('🖨 保存が通った時だけ刷る（紙だけ出る道を作っていない）',
     /if \(print\)\{[\s\S]{0,320}pitPrintCover/.test(s2));

  /* 売上なしアーカイブの形が、関門を通ること */
  const c = 良い();
  c.noSale = true; c.completedAt = ''; c.amountFinal = '';
  ok('🔴 売上なしアーカイブの形（実績カウント日が空）は止まらない', stops(c).length === 0, stops(c));
  const c2 = 良い(); c2.noSale = true; c2.completedAt = '';
  ok('🔴 でも確定金額が残っていたら止まる（ゆうたの例）', 引っかかる(c2, '売上なし'), stops(c2));
  const c3 = 良い(); c3.completedAt = '';
  ok('🔴 ふつうの返車済みで実績カウント日が空なら、今までどおり止まる',
     引っかかる(c3, '実績カウント日が空'), stops(c3));
}

console.log('\n── ⑥ ソースの見張り（写しを作っていない・使われていない欄を並べていない） ──');
{
  const s = JS('master-pit.js');
  ok('🔴 必須の判定は `pitCardMisses` を借りている', /pitCardMisses\(c\)/.test(s));
  ok('🔴 時刻は新規予約と同じ `_normTime` / `PIT_TIME_QUICK`',
     /_normTime\(v\)/.test(s) && /PIT_TIME_QUICK/.test(s));
  /* 🔧 v2.99.0 作業タイプ・付加・社内区分・物販は、新規予約・予約詳細と**同じ部品**を呼ぶだけ（自前の並びを持たない） */
  const cd = JS('card-detail.js');
  const code0 = s.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('🔴🔴 作業タイプの欄は予約詳細と同じ部品（pitWorkTypeFieldsHtml／その他の引き出し）', /w\.pitWorkTypeFieldsHtml\(M\)/.test(s) && /w\.pitWorkTypeOtherPanelHtml\(M\)/.test(s));
  ok('🔴🔴 押した時の処理も予約詳細と同じ1本（pitWorkTypeBind）', /w\.pitWorkTypeBind\(wt, M, render, \{ save: false \}\)/.test(s));
  ok('🔴 自前の付加・社内区分・作業タイプの並びを持っていない', !/PIT_INTERN_KINDS|PIT_WORK_SPECIALS|pitMasterAddon|pitMasterIntern|pitMasterSpecial/.test(code0),
     (code0.match(/.{0,30}(PIT_INTERN_KINDS|PIT_WORK_SPECIALS|pitMasterAddon|pitMasterIntern|pitMasterSpecial).{0,30}/) || [''])[0]);
  ok('🔴 予約詳細側も同じ1本を呼んでいる（写しを作っていない）', /pitWorkTypeBind\(root, c, \(\) => renderCardForm\(c\), \{ save: true \}\)/.test(cd) && /h \+= workTypeFieldsHtml\(c\);/.test(cd));
  ok('🔴 代車の区分は、引き出しの中でも押せない（作業予定ボードだけ）', /var lock   = \(it\.id === 'loanercar'\);/.test(cd));
  /* ⚠ コメントは外して見る（この画面には「急ぎを置かないこと」と**書いてある**ため） */
  const code = s.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('🔴🔴 使われていない「急ぎ」を並べていない（ゆうた指定）', !/urgent/.test(code),
     (code.match(/.{0,40}urgent.{0,40}/) || [''])[0]);
  ok('🔴 「急ぎを置かないこと」と書き置きがある（次に触る人のため）', /急ぎ/.test(s));
  ok('🔴 予約番号は手で打てない（振り直しだけ）', /pitMasterResNo/.test(s) && /disabled/.test(s));
  ok('🔴 変えた欄の記録は `pitLogCardEdit` を借りている', /pitLogCardEdit\(live, BEFORE\)/.test(s));
  ok('🔴 顧客控え・代車カレンダーはふつうの道を呼ぶだけ',
     /upsertCustomerFromCard\(live\)/.test(s) && /pitSyncLoanerAssigns\(\)/.test(s));
  ok('🔴 管理者以上だけ（物差しは pitIsAdmin 1本）', /w\.pitIsAdmin && w\.pitIsAdmin\(\)/.test(s));
}



console.log('\n── 🛡 保険＝返車済み → 入金待ち → 入金日で実績（v2.99.0・ゆうた指定） ──');
{
  /* 🗣「保険にした場合のストーリーの分岐がないと思う。実際には返車済み、入金待ち なども状態も存在するし、入金日みたいな表記もいるかと」 */
  vm.runInContext(JS('insurance-pit.js'), ctx, { filename:'insurance-pit.js' });
  const 保険 = () => Object.assign(良い(), { id:'ins1', workType:'general', workTypes:['general'], workSpecials:['insurance'],
    inspSchedule:{ mode:'manual', slots:{}, history:[] }, completedAt:'', paymentDate:null, paymentSeparate:true });
  let c = 保険();
  ok('前提：保険の返車済み・入金日なし＝入金待ち', ctx.pitInsPayWait(c) === true);
  ok('🔴🔴 入金待ちは「実績カウント日が空」で止めない', !引っかかる(c, '実績カウント日が空'), stops(c));
  ok('🔴 入金待ちで保存することを、押す前に聞く', warns(c).some(x => x.indexOf('入金待ち') >= 0), warns(c));

  c = 保険(); c.paymentDate = '2026-08-05'; c.completedAt = '2026-07-18';
  ok('🔴🔴 入金日と実績カウント日がずれていたら止める（保険は入金日＝実績カウント日）', 引っかかる(c, '入金日（2026-08-05）'), stops(c));

  c = Object.assign(良い(), { completedAt:'' });
  ok('⚠ 保険でない返車済みは、今までどおり実績カウント日が空なら止まる', 引っかかる(c, '実績カウント日が空'), stops(c));

  /* 画面の道（pitMasterSet）で入金日を入れる＝insurance-pit.js の1本を通って、実績カウント日が動く */
  ctx.pitIsAdmin = () => true;              /* マスター入力は管理者以上だけ＝見張りも管理者として開く */
  ctx.state.cards = [保険()];
  ctx.pitMasterOpen('ins1');
  ctx.pitMasterSet('paymentDate', '2026-08-05');
  let M = ctx.pitMasterCurrent();
  ok('🔴🔴 入金日を入れると、その日が実績カウント日になる', M && M.paymentDate === '2026-08-05' && M.completedAt === '2026-08-05', M && { p:M.paymentDate, d:M.completedAt });
  ok('入金日を入れたら、止まる所は無い', stops(M).length === 0, stops(M));
  ctx.pitMasterSet('paymentDate', '');
  M = ctx.pitMasterCurrent();
  ok('🔴 入金日を消すと、実績カウント日も空に戻る（入金待ち）', !M.paymentDate && M.completedAt === '' && ctx.pitInsPayWait(M), { p:M.paymentDate, d:M.completedAt });
  ctx.pitMasterSet('status', 'check');
  ctx.pitMasterSet('paymentDate', '2026-08-06');
  M = ctx.pitMasterCurrent();
  ok('まだ返車していない時は、入金日を入れても実績カウント日は入らない', M.paymentDate === '2026-08-06' && !M.completedAt, { p:M.paymentDate, d:M.completedAt, s:M.status });
  ctx.pitMasterSet('status', 'returned');
  M = ctx.pitMasterCurrent();
  ok('🔴 そのあと返車済みにすると、入金日で実績カウント日がそろう', M.completedAt === '2026-08-06', M.completedAt);
  ctx.state.cards = [];
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（緑 ' + pass + '件）' : '✅ 全部緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
