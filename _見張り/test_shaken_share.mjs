// ============================================================
// test_shaken_share.mjs  ―  🔧 車検予定の物差し（pit-share.js の pitShakenOnDate）の見張り
//   PitFlow の車検予定ボード／MHS の当日ビュー／前日LINEの画像は、
//   ぜんぶこの1本を通る。ここが緑なら **3つが必ず同じ答え**になる。
//
//   ここで見張っているのは、2026-08-16 に実際に見つかった 7 つの食い違い：
//     ①済んだ車が予定と同じ見た目 ②再検が消える ③担当がフロント担当
//     ④カナだけの客が「（未入力）」 ⑤車種が空だとメーカーも消える
//     ⑥売上なしの扱いが逆 ⑦キャンセルした予約が残る
//
//   使い方（サーバー不要）： node test_shaken_share.mjs
// ============================================================
import fs from 'fs';
import vm from 'vm';

const box = {};
box.window = box; box.globalThis = box; box.console = console;
vm.createContext(box);
vm.runInContext(fs.readFileSync(new URL('../js/pit-share.js', import.meta.url), 'utf8'), box);
box.PitShare.use({
  divisions: () => [{ id: 'div1', label: '1課', color: '#1db97a' }, { id: 'div2', label: '2課', color: '#ec4899' }],
  estAmount: () => 0, teamKey: () => 'default'
});

let ok = 0, ng = 0;
const t = (n, c, x) => { c ? (ok++, console.log('  OK  ' + n)) : (ng++, console.log('  NG  ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : ''))); };
const D = '2026-08-20';
const on = cards => box.pitShakenOnDate(cards, D);
const base = (o) => Object.assign({
  id: 'c1', workTypes: ['shaken'], status: 'working', division: 'div1',
  customer: '山田 太郎', car: 'ヴォクシー', inspSchedule: { decided: D, decidedSlot: 'am' }
}, o);

console.log('── ① これから行く車 ──');
{
  const r = on([base({})]);
  t('1台出る', r.length === 1, r.length);
  t('印は無い（これから行く）', r[0] && r[0].mark === '', r[0]);
  t('午前', r[0] && r[0].slot === 'am');
  t('姓だけ出る', r[0] && r[0].name === '山田', r[0] && r[0].name);
}

console.log('\n── ② 🔴 済んだ車は出るが「済」の印が付く（前は予定と見分けが付かなかった）──');
{
  const r = on([base({ inspSchedule: { decided: D, decidedSlot: 'am', result: 'done', resultDate: D, resultSlot: 'am' } })]);
  t('出る', r.length === 1);
  t('印は「済」', r[0] && r[0].mark === '済', r[0] && r[0].mark);
  t('done の印が立つ（画面で薄くできる）', r[0] && r[0].done === true);
}
{
  const r = on([base({ inspSchedule: { decided: '2026-08-18', result: 'done', resultDate: D, resultSlot: 'pm' } })]);
  t('🔴 済の日を手で変えたら、実際に行った日に出る', r.length === 1 && r[0].slot === 'pm', r);
}
{
  const r = box.pitShakenOnDate([base({ inspSchedule: { decided: '2026-08-18', result: 'done', resultDate: D } })], '2026-08-18');
  t('🔴 もとの決定日には出ない（二重に数えない）', r.length === 0, r);
}

console.log('\n── ③ 🔴 再検（落ちてもう一度行く）が出る（前は完全に消えていた）──');
{
  const r = on([base({ inspSchedule: { decided: '', slots: {}, history: [{ result: 'recheck', date: D, slot: 'pm' }] } })]);
  t('出る', r.length === 1, r);
  t('印は「再検」', r[0] && r[0].mark === '再検');
  t('まだ終わっていない扱い', r[0] && r[0].done === false);
}

console.log('\n── ④ 🔴 担当＝陸運局へ行く人だけ（受付のフロント担当は出さない）──');
{
  const r = on([base({ frontStaff: 'フロント佐藤', inspSchedule: { decided: D, resultStaff: '整備の鈴木' } })]);
  t('行く人が出る', r[0] && r[0].staff === '整備の鈴木', r[0] && r[0].staff);
}
{
  const r = on([base({ frontStaff: 'フロント佐藤' })]);
  t('🔴 決まっていなければ空欄（フロント担当を出さない）', r[0] && r[0].staff === '', r[0] && r[0].staff);
}

console.log('\n── ⑤ 🔴 カナだけのお客様が「（未入力）」にならない ──');
{
  const r = on([base({ customer: '', kana: 'ヤマダタロウ' })]);
  t('カナがそのまま出る', r[0] && r[0].name && r[0].name !== '（未入力）' && r[0].name !== '', r[0] && r[0].name);
}

console.log('\n── ⑥ 🔴 車種が空でもメーカーやナンバーを出す（画像だけ空欄だった）──');
t('メーカーで出る', on([base({ car: '', maker: '日産' })])[0].car === '日産');
t('ナンバーで出る', on([base({ car: '', maker: '', plate: '品川300' })])[0].car === '品川300');

console.log('\n── ⑦ 🔴 片付いた車は出さない（画面と画像で扱いが逆だった）──');
t('廃車は出さない',            on([base({ status: 'scrap' })]).length === 0);
t('🔴 予約キャンセルは出さない', on([base({ status: 'cancelled' })]).length === 0);
t('🔴 売上なしアーカイブは出さない', on([base({ noSale: true })]).length === 0);

console.log('\n── ⑧ 車検の車かどうか（旧データも拾う）──');
t('workTypes に shaken', on([base({ workTypes: ['shaken', 'general'] })]).length === 1);
t('🔴 旧データ（workType だけ）も拾う', on([base({ workTypes: [], workType: 'shaken' })]).length === 1);
t('車検でない車は出さない', on([base({ workTypes: ['general'], workType: '' })]).length === 0);
t('車検の日でなければ出さない', box.pitShakenOnDate([base({})], '2026-08-21').length === 0);

console.log('\n── ⑨ 並び＝午前→午後 → まだ行っていないものが先 → 名前順（どこで見ても同じ）──');
{
  const r = on([
    base({ id: 'a', customer: '渡辺', inspSchedule: { decided: D, decidedSlot: 'pm' } }),
    base({ id: 'b', customer: '青木', inspSchedule: { decided: D, decidedSlot: 'am' } }),
    base({ id: 'c', customer: '安藤', inspSchedule: { decided: D, decidedSlot: 'am', result: 'done', resultDate: D, resultSlot: 'am' } }),
    base({ id: 'd', customer: '井上', inspSchedule: { decided: D, decidedSlot: 'am' } })
  ]);
  const key = r.map(x => x.id + ':' + x.slot + (x.done ? '済' : ''));
  t('午前が先・午後があと', r.filter(x=>x.slot==='am').length===3 && r[3].slot==='pm', key);
  t('🔴 午前の中では、まだ行っていないものが先／済はあと', !r[0].done && !r[1].done && r[2].done, key);
  const again = on([
    base({ id:'d', customer:'井上', inspSchedule:{decided:D,decidedSlot:'am'} }),
    base({ id:'c', customer:'安藤', inspSchedule:{decided:D,decidedSlot:'am',result:'done',resultDate:D,resultSlot:'am'} }),
    base({ id:'a', customer:'渡辺', inspSchedule:{decided:D,decidedSlot:'pm'} }),
    base({ id:'b', customer:'青木', inspSchedule:{decided:D,decidedSlot:'am'} })
  ]);
  t('🔴 渡す順番を変えても同じ並びになる（画面・画像・MHSで食い違わない）',
    again.map(x=>x.id).join(',') === r.map(x=>x.id).join(','), [r.map(x=>x.id).join(','), again.map(x=>x.id).join(',')]);
}

console.log(`\n${ok} OK / ${ng} NG`);
process.exit(ng ? 1 : 0);
