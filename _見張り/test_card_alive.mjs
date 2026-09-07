/* PitFlow ── 🚙 **「集計から外すか」と「盤面に居るか」を混ぜない**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた報告（2026-09-07）
     🗣「代車と自社車両の車検が、車検予定に拾ってない？」

   ◎正体
     `pitCardActive`（＝まだ生きているカードか）が **`pitCardNoSale` を見ていた。**
     `pitCardNoSale` は v2.6.0 から**社内車両（中古・代車・内部）も合流している**物差しで、
     合流させたのは**集計から外すため**。「盤面に居ない」という意味は1ミリも無い。
     ＝ 代車・自社車両のカードが、車検予定／MHSの当日ビュー／前日LINEの画像／
        顧客詳細の「いま動いているもの」から**丸ごと消えていた。**

   ◎🔴🔴 同じ根っこで3回目
     v1.108.0 で混ぜ、v2.47.0 に `archive-pit.js` で1回捕まえて
     「使い分けを間違えないこと」と書いたのに、**物差し自身がまだ間違えたままだった。**
     だからこの見張りは**物差しそのもの**を見る（画面ではなく）。

   ◎決めごと（v2.81.0）
     ・数えるか     … `pitCardNoSale`（社内車両ぜんぶ＋手で売上なしにした車）
     ・盤面に居るか … `pitCardActive`（**人が手で付けた「売上なし」の印だけ**を外す）
     ・お客様の車だけ … `pitCardActiveCust`（社内車両も外す）

   ◎使い方（PitFlow のフォルダで）
     node _見張り/test_card_alive.mjs
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
  state: { cards: [], customers: [], loaners: [], companyCars: [], settings: {}, workTypes: [] } };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(JS('intern-pit.js'), ctx, { filename: 'intern-pit.js' });
vm.runInContext(JS('pit-share.js'), ctx, { filename: 'pit-share.js' });

const 代車  = { id:'a', internKind:'loanercar', workType:'shaken', status:'check' };
const 社用車 = { id:'b', internKind:'loanercar', workType:'shaken', status:'check' };
const 中古  = { id:'c', internKind:'used',      status:'work' };
const 内部  = { id:'d', internKind:'inhouse',   status:'work' };
const 客    = { id:'e', internKind:'',          workType:'shaken', status:'check' };
const 売上なし = { id:'f', internKind:'', status:'returned', noSale:true };
const 廃車  = { id:'g', status:'scrap' };
const キャンセル = { id:'h', status:'cancelled' };

console.log('\n── ①🔴🔴 社内車両は「盤面に居る」（ここが報告の正体） ──');
{
  ok('🔴🔴 代車のカードは生きている', ctx.pitCardActive(代車) === true);
  ok('🔴🔴 社用車のカードは生きている', ctx.pitCardActive(社用車) === true);
  ok('中古も生きている', ctx.pitCardActive(中古) === true);
  ok('内部も生きている', ctx.pitCardActive(内部) === true);
  ok('お客様の車はもちろん生きている', ctx.pitCardActive(客) === true);
}

console.log('\n── ② 外すものは今までどおり外す（塞ぎすぎ・開けすぎていない） ──');
{
  ok('🔴 廃車は生きていない', ctx.pitCardActive(廃車) === false);
  ok('🔴 予約キャンセルは生きていない', ctx.pitCardActive(キャンセル) === false);
  ok('🔴 人が手で「売上なし」にした車は生きていない（前からの決まり）', ctx.pitCardActive(売上なし) === false);
}

console.log('\n── ③ 「集計から外すか」は1文字も変えていない ──');
{
  ok('🔴 代車は今までどおり売上に数えない', ctx.pitCardNoSale(代車) === true);
  ok('🔴 中古・内部も数えない', ctx.pitCardNoSale(中古) === true && ctx.pitCardNoSale(内部) === true);
  ok('🔴 手で売上なしにした車も数えない', ctx.pitCardNoSale(売上なし) === true);
  ok('お客様の車は数える', ctx.pitCardNoSale(客) === false);
  ok('🔴 「手で付けた印だけ」の物差しは社内車両を含まない', ctx.pitCardNoSaleMarked(代車) === false);
}

console.log('\n── ④ 社内車両を出さない画面のための物差し（お客様の車だけ） ──');
{
  ok('🔴 代車は入らない', ctx.pitCardActiveCust(代車) === false);
  ok('🔴 社用車も入らない', ctx.pitCardActiveCust(社用車) === false);
  ok('お客様の車は入る', ctx.pitCardActiveCust(客) === true);
  ok('廃車・キャンセルは当然入らない',
     ctx.pitCardActiveCust(廃車) === false && ctx.pitCardActiveCust(キャンセル) === false);
}

console.log('\n── ⑤🚗 車検予定・MHS・前日LINE が拾う（同じ物差しを借りている所） ──');
{
  const 代車車検 = { id:'s1', internKind:'loanercar', workType:'shaken', status:'check',
    customer:'自社代車', car:'タント', plate:'柏 500 あ 12-34',
    inspSchedule:{ mode:'manual', slots:{}, decided:'2026-09-10', decidedSlot:'am', history:[] } };
  const rows = ctx.pitShakenOnDate([代車車検], '2026-09-10');
  ok('🔴🔴 代車の車検が、その日の車検の並びに出る（報告の所）', rows.length === 1, rows.length);
  ok('🔴 名前は「自社代車」のまま', rows[0] && /自社代車/.test(rows[0].name || ''), rows[0] && rows[0].name);
}

console.log('\n── ⑥ ソースの見張り（もう混ぜていない） ──');
{
  const s = JS('pit-share.js');
  ok('🔴🔴 生きているかの物差しが `pitCardNoSale` を見ていない',
     !/function pitCardActive\(c\)\{?[\s\S]{0,400}?pitCardNoSale\(c\)/.test(s.replace(/\r/g,'')),
     '');
  ok('🔴 お客様の車だけの物差しがある', /w\.pitCardActiveCust\s*=/.test(s));
  const av = JS('avail.js'), cd = JS('card-detail.js'), ir = JS('inspect-rules.js');
  ok('🔴 その日の入庫一覧は「お客様の車だけ」を名指ししている', /pitCardActiveCust/.test(av));
  ok('🔴 新規予約の右カラムも名指ししている', /pitCardActiveCust/.test(cd));
  ok('⏭ データチェックは、規則ごとの判断が済むまで「お客様の車だけ」のまま', /pitCardActiveCust/.test(ir));
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（緑 ' + pass + '件）' : '✅ 全部緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
