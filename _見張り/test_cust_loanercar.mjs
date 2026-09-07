/* PitFlow ── 🚙 **代車・自社車両のカードは、顧客控えに1文字も書き戻さない**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた報告（2026-09-07）
     🗣「顧客ビューの車種名は車種名なんだから **アクア** とか **タント** が出なきゃいけない。
     　　だが顧客ビューの車種名に**代車名が挿入されちゃってる**（アクア1号・タント茶みたいな感じに）」
     🗣「社内の呼び名で**わざわざ代車名でふってる**んだから、紐づけた結果同じでよければそんな事しない」

   ◎正体
     代車の整備カードは、車名の欄に**代車の呼び名**（車両管理で入れた車種名）を持っている。
     入庫すると紐づけたお客様がそのカードに写る。そのあとカードを開いて閉じる／保存すると
     `upsertCustomerFromCard` が走り、**カードの車名をお客様の車の「車種」に書き戻していた。**
     ⚠ 紐づけの設定そのものは無実。**カードの出口が犯人。**

   ◎ここで見張ること
     ① 代車のカードでは、お客様の車の車種名が**1文字も変わらない**
     ② 代車のカードでは、お客様も車も**増えない**（「自社代車」という人を作らない）
     ③ ふつうのお客様のカードは**今までどおり**書き戻る（塞ぎすぎていない）
     ④ 中古・内部の社内車両も書き戻さない
     ⑤ 判定を customers.js に書き写していない（`pitCardIntern` を呼んでいる）

   ◎使い方（PitFlow のフォルダで）
     node _見張り/test_cust_loanercar.mjs
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

function boot() {
  const ctx = {
    console, setTimeout, clearTimeout,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                addEventListener: () => {}, createElement: () => ({ style:{}, classList:{ add(){}, remove(){} } }) },
    state: { customers: [], cards: [], divisions: [], staff: [], loaners: [], workTypes: [] },
    PitDB: { save: function(){} },
    pitToast: () => {}, pitOpLog: () => {},
    pitCurrentStaffName: () => 'チーフ'
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(JS('intern-pit.js'), ctx, { filename: 'intern-pit.js' });
  vm.runInContext(JS('customers.js'), ctx, { filename: 'customers.js' });
  vm.runInContext(JS('veh-merge.js'), ctx, { filename: 'veh-merge.js' });
  return ctx;
}

/* お客様（小林モータース）の控え。車検証どおりの車種名が入っている。 */
const 控え = () => ({
  id: 'cu1', name: '小林モータース', kana: 'コバヤシモータース',
  contacts: [{ tel: '04-1111-2222', label: '会社', primary: true }],
  vehicles: [{ id: 'v1', plate: '柏 500 あ 12-34', maker: 'ダイハツ', car: 'タント',
               karteNo: 'K-001', boardId: 'default', updatedAt: 1 }],
  updatedAt: 1
});

/* 代車の整備カード。**車名は社内の呼び名**（入庫すると紐づけたお客様が写っている） */
const 代車カード = () => ({
  id: 'c1', internKind: 'loanercar', workType: 'shaken',
  customer: '小林モータース', customerId: 'cu1', kana: '', tel: '', contacts: [],
  maker: '', car: 'タント茶', plate: '柏 500 あ 12-34', karteNo: '',
  boardId: 'default', status: 'check'
});

console.log('\n── ①🔴🔴 代車のカードは、お客様の車の車種名を書き換えない ──');
{
  const ctx = boot();
  ctx.state.customers = [控え()];
  const c = 代車カード();
  ctx.state.cards = [c];
  ctx.upsertCustomerFromCard(c);
  const v = ctx.state.customers[0].vehicles[0];
  ok('🔴🔴 車種名は「タント」のまま（代車の呼び名で上書きされない）', v.car === 'タント', v.car);
  ok('🔴 メーカーも変わらない', v.maker === 'ダイハツ', v.maker);
  ok('🔴 カルテNoも変わらない', v.karteNo === 'K-001', v.karteNo);
  ok('🔴 車が増えない', ctx.state.customers[0].vehicles.length === 1, ctx.state.customers[0].vehicles.length);
  ok('🔴 お客様が増えない', ctx.state.customers.length === 1, ctx.state.customers.length);
}

console.log('\n── ②🔴 まだ紐づけていない代車のカードでも、「自社代車」という人を作らない ──');
{
  const ctx = boot();
  ctx.state.customers = [控え()];
  const c = 代車カード();
  c.customer = '自社代車'; c.customerId = '';     /* 入庫前の姿 */
  c.car = 'アクア1号'; c.plate = '柏 500 い 56-78';
  ctx.state.cards = [c];
  ctx.upsertCustomerFromCard(c);
  ok('🔴 お客様が増えない（「自社代車」が顧客控えに生まれない）',
     ctx.state.customers.length === 1 && !ctx.state.customers.some(x => /自社代車/.test(x.name || '')),
     ctx.state.customers.map(x => x.name));
  ok('🔴 もとの車も無傷', ctx.state.customers[0].vehicles[0].car === 'タント', ctx.state.customers[0].vehicles[0].car);
}

console.log('\n── ③🟢 ふつうのお客様のカードは、今までどおり書き戻る（塞ぎすぎていない） ──');
{
  const ctx = boot();
  ctx.state.customers = [控え()];
  const c = 代車カード();
  c.internKind = '';                       /* ← ふつうの予約カード */
  c.customer = '小林モータース';
  c.car = 'タントカスタム'; c.maker = 'ダイハツ';
  ctx.state.cards = [c];
  ctx.upsertCustomerFromCard(c);
  const v = ctx.state.customers[0].vehicles[0];
  ok('🟢 ふつうのカードは車種名が今までどおり更新される', v.car === 'タントカスタム', v.car);
}

console.log('\n── ④ 中古・内部の社内車両も書き戻さない ──');
{
  ['used', 'inhouse'].forEach(function (k) {
    const ctx = boot();
    ctx.state.customers = [控え()];
    const c = 代車カード();
    c.internKind = k; c.workType = null; c.car = '社内の呼び名';
    ctx.state.cards = [c];
    ctx.upsertCustomerFromCard(c);
    ok('社内区分「' + k + '」でも車種名は変わらない',
       ctx.state.customers[0].vehicles[0].car === 'タント', ctx.state.customers[0].vehicles[0].car);
  });
}

console.log('\n── ⑤ ソースの見張り（判定を書き写していない） ──');
{
  const src = JS('customers.js');
  ok('🔴 判定は `pitCardIntern` 1本を呼んでいる', /pitCardIntern\s*\(\s*c\s*\)/.test(src));
  ok('🔴 `internKind` を直に見ていない', !/c\.internKind/.test(src), (src.match(/.{0,40}c\.internKind.{0,40}/) || [''])[0]);
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（緑 ' + pass + '件）' : '✅ 全部緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
