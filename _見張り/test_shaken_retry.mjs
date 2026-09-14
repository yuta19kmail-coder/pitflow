// ============================================================
// test_shaken_retry.mjs  ―  🔀 v2.112.0 車検の合否の分かれ道（再検の車は2択）の見張り
//   🗣 ゆうた（2026-09-14）
//     「再検の車にも 再検合格 一発合格 などの文言が出てきてまどろっこしい」
//     「再検の場合であれば『無事再検で合格』『やっぱり不合格』の2択になるのがいい」
//     「MHS上でも再検表記だったものが一発合格をクリックで ラベルのバッジが車検になってしまう」
//
//   ◎決めごと
//     🔴 押し先は pit-share.js の pitShakenChoices 1本（車検予定／予約詳細／MHS が並べるだけ）
//     🔴 1回目＝一発合格／再検合格（その場で直した）／不合格　・　再検＝今回は合格／今回も不合格
//     🔴 再検の車は済・不合格になっても頭の札（head）は「再検」のまま
//     🔴 古い画面から再検の車に repass が来ても、受かった事実は落とさない（done として記録）
//
//   使い方（サーバーもブラウザも要らない）： node test_shaken_retry.mjs
// ============================================================
import fs from 'fs';
import vm from 'vm';

const box = {};
box.window = box; box.globalThis = box; box.console = console;
vm.createContext(box);
vm.runInContext(fs.readFileSync(new URL('../js/pit-share.js', import.meta.url), 'utf8'), box);
box.PitShare.use({
  divisions: () => [{ id: 'div1', label: '1課', color: '#1db97a' }],
  estAmount: () => 0, teamKey: () => 'default'
});

let ok = 0, ng = 0;
const t = (n, c, x) => { c ? (ok++, console.log('  OK  ' + n)) : (ng++, console.log('  NG  ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : ''))); };
const D = '2026-09-14', P = '2026-09-10';
const card = insp => ({ id: 'c1', workTypes: ['shaken'], status: 'working', division: 'div1',
  customer: '田中 一郎', car: 'ノート', inspSchedule: insp });
const J = o => JSON.parse(JSON.stringify(o));
const fail1 = { date: P, slot: 'am', result: 'recheck', note: '光軸' };

console.log('── ① 1回目の車＝3択（今までどおり）──');
{
  const ch = box.pitShakenChoices({ decided: D, decidedSlot: 'am', history: [] });
  t('再検ではない', ch.retry === false);
  t('3つ', ch.items.length === 3, ch.items.map(x => x.act));
  t('並び＝一発合格→再検合格→不合格', J(ch.items.map(x => x.act)) + '' === 'done,repass,recheck');
  t('一発合格は理由の窓を出さない／ほか2つは出す', J(ch.items.map(x => x.note)) + '' === 'false,true,true');
}

console.log('\n── ② 🔴🔴 再検の車＝2択（今回は合格／今回も不合格）──');
{
  const ch = box.pitShakenChoices({ decided: D, decidedSlot: 'am', history: [fail1] });
  t('再検', ch.retry === true && ch.reNo === 1);
  t('2つだけ', ch.items.length === 2, ch.items.map(x => x.label));
  t('done と recheck', J(ch.items.map(x => x.act)) + '' === 'done,recheck');
  t('🔴 「一発」「再検合格」の字は出ない', !ch.items.some(x => /一発|再検合格/.test(x.label + x.sub)), ch.items);
  t('今回も不合格＝次は2回目と書いてある', /2回目/.test(ch.items[1].sub), ch.items[1].sub);
}

console.log('\n── ③ 🔴🔴 再検の車は合格しても頭の札は「再検」（MHS で「車検」に戻っていた）──');
{
  const base = { decided: D, decidedSlot: 'am', history: [fail1] };
  const before = box.pitShakenOnDate([card(base)], D)[0];
  t('行く前＝頭は再検・右端は空', before.head === '再検' && before.tail === '' && before.re === true, before);
  const r = box.pitShakenApply(base, 'done', { today: D });
  const after = box.pitShakenOnDate([card(r.insp)], D)[0];
  t('合格にすると済', r.insp.result === 'done');
  t('🔴 頭は「再検」のまま', after.head === '再検', after.head);
  t('右端は「済」', after.tail === '済', after.tail);
  t('枠が1つの画面（決定カード）は「再検済」', after.mark === '再検済', after.mark);
  t('retry の旗が立つ', after.retry === true);
  t('フローの記録に「再検で合格」', /再検で合格/.test(r.log), r.log);
  t('言葉1つで言う＝再検で合格', /^再検で合格/.test(box.pitShakenResultLabel(r.insp)), box.pitShakenResultLabel(r.insp));
}

console.log('\n── ④ 1回目の車は今までどおり（済＝頭は車検・右端は済）──');
{
  const r = box.pitShakenApply({ decided: D, decidedSlot: 'am', history: [] }, 'done', { today: D });
  const row = box.pitShakenOnDate([card(r.insp)], D)[0];
  t('頭は車検', row.head === '車検', row.head);
  t('右端は済／mark も済', row.tail === '済' && row.mark === '済', row);
  t('retry は立たない', row.retry === false);
  t('言葉＝一発合格', box.pitShakenResultLabel(r.insp) === '一発合格');
  const r2 = box.pitShakenApply({ decided: D, decidedSlot: 'am', history: [] }, 'repass', { today: D, note: '光軸' });
  const row2 = box.pitShakenOnDate([card(r2.insp)], D)[0];
  t('再検合格（その場）は今までどおり', row2.repass === true && row2.tail === '再検合格' && row2.head === '車検', row2);
}

console.log('\n── ⑤ 今回も不合格＝2回目の不合格の日も「再検」の回として出る ──');
{
  const r = box.pitShakenApply({ decided: D, decidedSlot: 'pm', history: [fail1] }, 'recheck', { today: D, note: 'ブーツ切れ' });
  t('不合格が2本になる', box.pitShakenReCount(r.insp) === 2);
  t('記録に回数', /2回目/.test(r.log), r.log);
  const today = box.pitShakenOnDate([card(r.insp)], D)[0];
  t('🔴 今日の行＝頭は再検・右端は不合格', today.head === '再検' && today.tail === '不合格', today);
  const first = box.pitShakenOnDate([card(r.insp)], P)[0];
  t('🔴 1回目に落ちた日＝頭は車検のまま（その日はまだ再検ではなかった）', first.head === '車検' && first.tail === '不合格', first);
  const next = box.pitShakenChoices(r.insp);
  t('次に決め直した時も2択（今回も不合格＝3回目）', next.items.length === 2 && /3回目/.test(next.items[1].sub), next);
  const again = box.pitShakenOnDate([card(Object.assign({}, r.insp, { decided: '2026-09-16', decidedSlot: 'am' }))], '2026-09-16')[0];
  t('2回落ちた車の予定＝「再検2」', again.head === '再検2' && again.mark === '再検2', again);
}

console.log('\n── ⑥ 🔴 古い画面から再検の車に repass が来ても、受かった事実は落とさない ──');
{
  const r = box.pitShakenApply({ decided: D, decidedSlot: 'am', history: [fail1] }, 'repass', { today: D, note: 'x' });
  t('null にしない', !!r);
  t('済になる', r && r.insp.result === 'done');
  t('その場で直した印は付けない', r && r.insp.repass === false && !r.insp.repassNote, r && r.insp);
}

console.log('\n── ⑦ 古い記録（再検の車に再検合格が付いている）は「再検で合格」として出す ──');
{
  const old = { decided: D, decidedSlot: 'am', result: 'done', resultDate: D, resultSlot: 'am', repass: true, repassNote: '光軸', history: [fail1] };
  const row = box.pitShakenOnDate([card(old)], D)[0];
  t('頭は再検・右端は済（再検合格にしない）', row.head === '再検' && row.tail === '済' && row.repass === false, row);
  t('言葉＝再検で合格', /^再検で合格/.test(box.pitShakenResultLabel(old)));
  const r = box.pitShakenApply(old, 'doneedit', { at: { date: D, slot: 'am' }, patch: { kind: 'repass', note: 'y' } });
  t('🔴 直したら印は落ちる（再検の車に「その場で直した」は無い）', r && r.insp.repass === false && r.insp.repassNote === '', r && r.insp);
  t('直した記録も「再検で合格」', r && /再検で合格/.test(r.log), r && r.log);
}

console.log('\n── ⑧ 画面が場合分けを書いていない（物差しを呼んでいる）──');
{
  const src = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
  t('車検予定の窓', /pitShakenChoices\(s\)/.test(src('../js/shaken.js')));
  t('予約詳細', /pitShakenChoices\(_si\)/.test(src('../js/card-view.js')));
  const mhs = new URL('../../../MHS/index.html', import.meta.url);
  if (fs.existsSync(mhs)) {
    const m = fs.readFileSync(mhs, 'utf8');
    t('MHS の当日ボードの窓', /pitShakenChoices\(s\)/.test(m));
    t('MHS の行は head／tail を使う', /r\.head/.test(m) && /r\.tail/.test(m));
  }
}

console.log('\n' + (ng ? '❌' : '✅') + ' OK ' + ok + ' / NG ' + ng);
process.exit(ng ? 1 : 0);
