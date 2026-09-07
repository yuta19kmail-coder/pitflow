/* PitFlow ── 🏢 **代車・社用車のカードの「お客様欄」と「どちらの課へ行くか」**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた報告（2026-09-07）
     🗣「社用車の方、予約カードの顧客名が**自社車両になってない。本当の顧客名が出ちゃってる**」
     🗣「また**紐づけしてるにも関わらず輸入車のチェックが入らず、1課タスクボードに入っちゃった**」

   ◎正体（2つとも別の場所）
     ① お客様欄 … 作る時は代車も社用車も「自社代車」。そのうえ**入庫した瞬間に、
        紐づけたお客様の名前で上書き**していた（`_intakeGo`）。
     ② 課 …… 作業予定のカードは **`boardId:'default'`（国産・1課）で決め打ち**。
        紐づけも車両管理の区分も、1つも見ていなかった。

   ◎決めごと（ゆうた確定 2026-09-07）
     ① **種別で分ける**＝代車→「自社代車」／社用車→「自社車両」。**入庫しても上書きしない。**
        ⚠ 紐づけた相手は消していない（`c.customerId` はそのまま）＝顧客ビューにも履歴にも行ける。
     ② 課は **①紐づけたお客様の車の設定 → ②無ければ車両管理の区分「輸入車」** の順で決める。
        ⚠ 食い違う時は**紐づけが勝つ**（顧客控えは車検証の写しなので）。
     ③ **すでに入庫してしまったカードは、アプリでは直さない**（人が手で直す）。

   ◎使い方（PitFlow のフォルダで）
     node _見張り/test_maint_own.mjs
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

function boot(state) {
  const ctx = { console, setTimeout, clearTimeout,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    state: state };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(JS('fleet-link.js'), ctx, { filename: 'fleet-link.js' });
  return ctx;
}
/* お客様（小林モータース）の控え。v1＝国産／v2＝輸入 */
const 顧客 = () => ([{ id:'cu1', name:'小林モータース', vehicles:[
  { id:'v1', plate:'柏 500 あ 12-34', car:'タント',   boardId:'default' },
  { id:'v2', plate:'柏 300 い 56-78', car:'ミニ',     boardId:'import'  }
]}]);

console.log('\n── ①🏢 お客様欄の言葉は、種別で分ける ──');
{
  const ctx = boot({ customers: 顧客(), cards: [],
    loaners:     [{ id:'L1', name:'代車1', model:'タント', category:'kei' }],
    companyCars: [{ id:'C1', name:'積載車', model:'キャンター', category:'commercial' }] });
  ok('🔴 代車は「自社代車」', ctx.pitFleetCardName('L1') === '自社代車', ctx.pitFleetCardName('L1'));
  ok('🔴🔴 社用車は「自社車両」（ゆうた報告の所）', ctx.pitFleetCardName('C1') === '自社車両', ctx.pitFleetCardName('C1'));
  ok('知らない車は代車あつかい（空にしない）', ctx.pitFleetCardName('xx') === '自社代車', ctx.pitFleetCardName('xx'));
}

console.log('\n── ②🔴🔴 どちらの課へ行くか（紐づけが正・無ければ車両管理の区分） ──');
{
  const ctx = boot({ customers: 顧客(), cards: [],
    loaners: [
      { id:'L1', name:'代車1', model:'タント', category:'kei' },                                  /* 紐づけ無し・国産 */
      { id:'L2', name:'代車2', model:'ミニ',   category:'import' },                               /* 紐づけ無し・輸入 */
      { id:'L3', name:'代車3', model:'ミニ',   category:'kei', custId:'cu1', custVehId:'v2' },     /* 紐づけ＝輸入／区分＝軽 */
      { id:'L4', name:'代車4', model:'タント', category:'import', custId:'cu1', custVehId:'v1' }   /* 紐づけ＝国産／区分＝輸入 */
    ], companyCars: [] });
  ok('紐づけ無し・区分が軽 → 1課（国産）', ctx.pitFleetBoardOf('L1') === 'default', ctx.pitFleetBoardOf('L1'));
  ok('🔴 紐づけ無しでも、区分が「輸入車」なら 2課（輸入）', ctx.pitFleetBoardOf('L2') === 'import', ctx.pitFleetBoardOf('L2'));
  ok('🔴🔴 紐づけた相手が輸入なら 2課（区分が軽でも紐づけが勝つ）', ctx.pitFleetBoardOf('L3') === 'import', ctx.pitFleetBoardOf('L3'));
  ok('🔴 紐づけた相手が国産なら 1課（区分が輸入でも紐づけが勝つ）', ctx.pitFleetBoardOf('L4') === 'default', ctx.pitFleetBoardOf('L4'));
  ok('知らない車は 1課（空にしない）', ctx.pitFleetBoardOf('xx') === 'default', ctx.pitFleetBoardOf('xx'));
}

console.log('\n── ③ 相手が消えている紐づけは、区分に落ちる（黙って輸入にしない） ──');
{
  const ctx = boot({ customers: [{ id:'cu1', name:'小林モータース', vehicles:[] }], cards: [],
    loaners: [{ id:'L5', name:'代車5', model:'ミニ', category:'import', custId:'cu1', custVehId:'v9' }], companyCars: [] });
  ok('相手の車が消えていたら車両管理の区分で決める', ctx.pitFleetBoardOf('L5') === 'import', ctx.pitFleetBoardOf('L5'));
}

console.log('\n── ③-2🔴 入庫でそろえ直すのは「紐づけた相手が持っている時」だけ ──');
{
  const ctx = boot({ customers: 顧客(), cards: [],
    loaners: [
      { id:'L6', name:'代車6', model:'タント', category:'kei' },                                 /* 紐づけ無し */
      { id:'L7', name:'代車7', model:'ミニ',   category:'kei', custId:'cu1', custVehId:'v2' }    /* 紐づけ＝輸入 */
    ], companyCars: [] });
  ok('🔴 紐づけていない車は空を返す（＝入庫でそろえ直さない＝人が選んだ課を巻き戻さない）',
     ctx.pitFleetLinkBoard('L6') === '', ctx.pitFleetLinkBoard('L6'));
  ok('🔴 紐づけてある車は相手の設定を返す（＝あとから分かった本当のことなので上書きしてよい）',
     ctx.pitFleetLinkBoard('L7') === 'import', ctx.pitFleetLinkBoard('L7'));
  ok('⚠ 空と「国産」は別物（既定に化けさせない）',
     ctx.pitFleetLinkBoard('L6') !== 'default' && ctx.pitFleetBoardOf('L6') === 'default');
}

console.log('\n── ④ ソースの見張り（判定を書き写していない・上書きを消した） ──');
{
  const mp = JS('maint-pit.js');
  ok('🔴 カードを作る時に、お客様欄を `pitFleetCardName` から取っている', /pitFleetCardName\(vehId\)/.test(mp));
  ok('🔴 カードを作る時に、課を `pitFleetBoardOf` から取っている', /pitFleetBoardOf\(vehId\)/.test(mp));
  ok('🔴 入庫の時にも課をそろえ直している（あとから紐づけることがある）',
     /pitFleetLinkBoard\(c\.maintVehId\)/.test(mp));
  ok('🔴🔴 入庫でお客様欄の名前を上書きしていない（ゆうた報告の正体）',
     !/c\.customer\s*=\s*own\.cust\.name/.test(mp),
     (mp.match(/.{0,40}c\.customer\s*=.{0,40}/) || [''])[0]);
  ok('🟢 紐づけた相手は控えたまま（顧客ビュー・履歴への道を切っていない）',
     /c\.customerId\s*=\s*own\.cust\.id/.test(mp));
  ok('🔴 `boardId:.default.` の決め打ちが残っていない', !/boardId:\s*'default',\s*bayId/.test(mp),
     (mp.match(/.{0,30}boardId:\s*'default',\s*bayId.{0,20}/) || [''])[0]);
  const cv = JS('card-view.js');
  ok('🔴 カードの中に「紐づけ：◯◯ 様」を出している（名前を消したぶんの逃げ道）',
     /紐づけ：/.test(cv) && /pitFleetLinkTarget/.test(cv));
  ok('🔴 紐づいていない時も黙らない', /紐づいていません/.test(cv));
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（緑 ' + pass + '件）' : '✅ 全部緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
