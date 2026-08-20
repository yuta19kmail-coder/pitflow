/* PitFlow v1.156.0 ── 最短入庫日（代車あり）の作り直し
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-20）
     「現状**代車が1日でも空いてたらOKの扱い**だから、結局最短入庫日が『今日』から動かない。
       ただ実態としてはさすがに違う。だから最短可能日の日付は
       **1週間きちっと枠がとれる日程**から案内するようにして。
       加えて、作業タイプを選んだ場合はそこに入っている**暫定預かり日数と前後1日ずつの予備**が
       とれる日程を最短入庫日に指定したい」
     「客の車が国産車／輸入車かバッジが入力された場合は、**国産車→国産車、輸入車→国産車・輸入車**で、
       国産車の場合は**輸入車の代車も避けて**案内してほしい（最終的に輸入車の代車で予約することは可能）。
       **あくまで初期の案内の日付の付け方として**」
     「右カラムの代車カレンダーには**透過のグリーンでどこを指しているのか**わかるようにしたい」
     「入庫と返車の間、センターにバッジでいいから**その日付を表示**してほしい」

   ◎決めごと
     🔴 窓は loaner-free.js の `pitLoanerPlanWindow` 1本（画面ごとに数え直さない）
     🔴 作業タイプ未選択＝**7日連続**／選択済＝**前日〜入庫日＋預かり日数（＝預かり＋2日）**
     🔴 国産のお客様は**輸入の代車を数えない**（案内だけ。列は減らさない・あとから選べる）
     🔴 過ぎた日は押さえられないので、前日の予備は今日より前へは遡らない

   ◎使い方
     python3 -m http.server 8996      ← 別ウィンドウ
     node test_short_intake.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8996;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitLoanerPlanWindow && window.pitCardHoldDays', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(900);

/* 代車3台（国産2・輸入1）だけの世界にする。予約は空。 */
const seed = async () => await p.evaluate(() => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const q = n => (n < 10 ? '0' : '') + n;
  const iso = d => d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate());
  const add = n => { const d = new Date(t); d.setDate(d.getDate() + n); return iso(d); };
  window._T = { today: iso(t), add: add };
  window._iso = iso; window._add = add;
  state.cards = [];
  state.fleetEvents = [];
  state.loanerAssigns = [];
  state.loaners = [
    { id: 'K1', name: '代車1', number: 1, model: 'タント',   category: 'kei' },
    { id: 'N1', name: '代車2', number: 2, model: 'ノート',   category: 'normal' },
    { id: 'I1', name: '代車3', number: 3, model: 'ゴルフ',   category: 'import' }
  ];
  return window._T;
});
const T = await seed();
const add = async n => await p.evaluate(k => window._add(k), n);

/* ===== ① 窓の決め方 ===== */
console.log('\n■ 🔴 いる窓（1週間／預かり＋前後1日）');
const need = await p.evaluate(() => ({
  未選択: pitLoanerPlanNeed(null), ゼロ: pitLoanerPlanNeed(0), 三日: pitLoanerPlanNeed(3), 五日: pitLoanerPlanNeed(5)
}));
ok('🔴 作業タイプ未選択＝7日連続', need.未選択.days === 7 && need.未選択.back === 0, need.未選択);
ok('0日も未選択あつかい', need.ゼロ.days === 7, need.ゼロ);
ok('🔴 預かり3日＝5日連続（前1日＋3日＋後1日）', need.三日.days === 5 && need.三日.back === 1, need.三日);
ok('🔴 預かり5日＝7日連続', need.五日.days === 7 && need.五日.back === 1, need.五日);
ok('どの決まりで出したか言葉でも返る', /1週間/.test(need.未選択.why) && /預かり3日/.test(need.三日.why), [need.未選択.why, need.三日.why]);

console.log('\n■ 🔴 窓の位置（前日から後ろ1日まで）');
const win = await p.evaluate(() => {
  const d10 = window._add(10);
  return { 未選択: pitLoanerPlanWindow(d10, null, {}), 三日: pitLoanerPlanWindow(d10, 3, {}), base: d10 };
});
ok('🔴 未選択＝入庫日から7日ぶん', win.未選択.from === win.base && win.未選択.to === (await add(16)), win.未選択);
ok('🔴 預かり3日＝前日から入庫日＋3日まで', win.三日.from === (await add(9)) && win.三日.to === (await add(13)), win.三日);

console.log('\n■ 🔴 過ぎた日は押さえられない（前日が今日より前なら今日から）');
const wToday = await p.evaluate(() => pitLoanerPlanWindow(window._T.today, 3, {}));
ok('🔴 今日を入庫日にしても、前日まで遡らない', wToday.from === T.today, wToday);

/* ===== ② 1日空いているだけでは案内しない ===== */
console.log('\n■ 🔴🔴 「1日でも空いていればOK」をやめた');
const oneDay = await p.evaluate(() => {
  /* 3台とも今日から6日先まで貸出中。**今日だけ**は空いていない状態を作らず、
     「今日から7日連続」は取れないが「今日1日」は取れる、を作る＝
     ぜんぶ 明日〜6日後 を埋める（今日は空き） */
  state.loanerAssigns = state.loaners.map(function (l, i) {
    return { id: 'B' + i, cardId: null, loanerId: l.id, customer: 'ふさぎ', manual: true,
             fromDate: window._add(1), toDate: window._add(6), returned: false };
  });
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return {
    今日1日は空き: pitLoanerFreeRun(window._T.today, 1),
    今日から7日: pitLoanerPlanOk(window._T.today, null, {}),
    最短: (function () { const d = dashEarliestIntake('default', 'loaner', t, null, { board: 'default' }); return d ? window._iso(d) : null; })()
  };
});
ok('今日1日だけなら空いている（前の作りならここでOKだった）', oneDay.今日1日は空き === true, oneDay);
ok('🔴 でも「1週間きっちり」は取れないので案内しない', oneDay.今日から7日 === false, oneDay);
ok('🔴 最短入庫日が今日から動く', oneDay.最短 && oneDay.最短 !== T.today, oneDay);
ok('🔴 案内されるのは7日連続で取れる日（7日後以降）', oneDay.最短 >= (await add(7)), oneDay);

/* ===== ③ 作業タイプを選ぶと、必要な幅が変わる ===== */
console.log('\n■ 🔴 作業タイプを選ぶと幅が変わる');
await seed();
const byWork = await p.evaluate(() => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  /* 3台とも 3日後〜9日後 を埋める＝今日〜2日後の3日間だけ空いている */
  state.loanerAssigns = state.loaners.map(function (l, i) {
    return { id: 'B' + i, cardId: null, loanerId: l.id, customer: 'ふさぎ', manual: true,
             fromDate: window._add(3), toDate: window._add(9), returned: false };
  });
  const short = function (hold) { const d = dashEarliestIntake('default', 'loaner', t, hold, { board: 'default' }); return d ? window._iso(d) : null; };
  return { 未選択: short(null), 預かり1日: short(1), 預かり5日: short(5) };
});
ok('🔴 未選択（1週間）は10日後まで待たされる', byWork.未選択 >= (await add(10)), byWork);
ok('🔴 預かり1日（＝3日連続）なら今日から案内できる', byWork.預かり1日 === T.today, byWork);
ok('🔴 預かり5日（＝7日連続）は先になる', byWork.預かり5日 >= (await add(10)), byWork);

/* 作業タイプから暫定預かり日数を拾えているか */
console.log('\n■ 作業タイプから暫定預かり日数を拾う');
const holdOf = await p.evaluate(() => {
  const mk = o => Object.assign({ id: 'H', boardId: 'default', dropType: 'drop' }, o);
  return {
    未選択: pitCardHoldDays(mk({})),
    車検: pitCardHoldDays(mk({ workType: 'shaken' })),
    手入力: pitCardHoldDays(mk({ workType: 'shaken', estHoldDays: 2 })),
    待ち: pitCardHoldDays(mk({ workType: 'shaken', dropType: 'wait' }))
  };
});
ok('🔴 作業タイプ未選択は null（＝1週間の決まりになる）', holdOf.未選択 === null, holdOf);
ok('作業タイプを選ぶと日数が出る', typeof holdOf.車検 === 'number' && holdOf.車検 > 0, holdOf);
ok('手で入れた日数が最優先', holdOf.手入力 === 2, holdOf);
ok('待ち・当日返しは代車の話にならない（null）', holdOf.待ち === null, holdOf);

/* ===== ④🔴 車格（国産のお客様に輸入の代車を数えない） ===== */
console.log('\n■ 🔴🔴 国産のお客様には輸入の代車を数えない');
await seed();
const board = await p.evaluate(() => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  /* 国産の2台だけ 今日〜20日後を埋める＝**輸入車（ゴルフ）だけが空いている** */
  state.loanerAssigns = [
    { id: 'B1', cardId: null, loanerId: 'K1', customer: 'ふさぎ', manual: true, fromDate: window._T.today, toDate: window._add(20), returned: false },
    { id: 'B2', cardId: null, loanerId: 'N1', customer: 'ふさぎ', manual: true, fromDate: window._T.today, toDate: window._add(20), returned: false }
  ];
  const short = function (bd) { const d = dashEarliestIntake(bd, 'loaner', t, null, { board: bd }); return d ? window._iso(d) : null; };
  return {
    国産の窓: pitLoanerPlanWindow(window._T.today, null, { board: 'default' }).ok,
    輸入の窓: pitLoanerPlanWindow(window._T.today, null, { board: 'import' }).ok,
    絞らない: pitLoanerPlanWindow(window._T.today, null, {}).ok,
    国産の最短: short('default'), 輸入の最短: short('import'),
    合う判定: { 国産客x輸入車: pitLoanerFitsBoard({ category: 'import' }, 'default'),
              国産客x軽:     pitLoanerFitsBoard({ category: 'kei' }, 'default'),
              輸入客x輸入車: pitLoanerFitsBoard({ category: 'import' }, 'import'),
              未選択x輸入車: pitLoanerFitsBoard({ category: 'import' }, null) }
  };
});
ok('🔴 国産のお客様＝輸入車しか空いていないので案内できない', board.国産の窓 === false, board);
ok('🔴 輸入のお客様＝輸入車でよいので今日から案内できる', board.輸入の窓 === true, board);
ok('車を選んでいなければ絞らない', board.絞らない === true, board);
ok('🔴 最短入庫日にも効く（国産は先・輸入は今日）',
   board.輸入の最短 === T.today && board.国産の最短 !== T.today, board);
ok('🔴 合う／合わないの判定', board.合う判定.国産客x輸入車 === false && board.合う判定.国産客x軽 === true
   && board.合う判定.輸入客x輸入車 === true && board.合う判定.未選択x輸入車 === true, board.合う判定);

/* ===== ⑤ 画面：緑の帯と、その説明 ===== */
console.log('\n■ 🔴 代車カレンダーの透過グリーンの帯');
await seed();
const band = await p.evaluate(async () => {
  state.cards = [];
  const c = { id: 'NEW1', _draft: false, resNo: 'R-NEW1', boardId: 'default', division: 'div1',
              status: 'reserved', customer: 'テスト', car: 'ノート', workType: 'shaken', workTypes: ['shaken'],
              dropType: 'drop', reserveDate: window._add(10), reserveTime: '09:00',
              needLoaner: true, loanerId: '', loanerFrom: '', loanerTo: '', log: [] };
  state.cards.push(c);
  /* 実物の画面（新規予約の全画面）を開く */
  openCard(c.id, 'page');
  await new Promise(r => setTimeout(r, 1000));
  const rows = Array.from(document.querySelectorAll('#cfs-lg-body tr'));
  const banded = rows.filter(r => r.classList.contains('cfs-lg-band')).map(r => r.getAttribute('data-ds'));
  const note = document.querySelector('.cfs-lg-bandnote');
  const hold = pitCardHoldDays(c);
  const w = pitLoanerPlanWindow(c.reserveDate, hold, { board: 'default' });
  return { banded: banded, note: note ? note.innerText : '', from: w.from, to: w.to, hold: hold,
           chip: (document.querySelector('.dl-datechip') || {}).innerText || '',
           why: (document.querySelector('.cfs-el-why') || {}).innerText || '',
           note2: (document.querySelector('.cfs-el-note') || {}).innerText || '' };
});
ok('🔴 帯が出ている', band.banded.length > 0, band.banded);
ok('🔴 帯の左端＝入庫日の前日', band.banded[0] === band.from, band);
ok('🔴 帯の右端＝入庫日＋預かり日数', band.banded[band.banded.length - 1] === band.to, band);
ok('🔴 帯の日数＝預かり日数＋2', band.banded.length === band.hold + 2, band);
ok('🔴 何の期間かを言葉でも出している', /押さえる幅|案内している/.test(band.note) && /預かり/.test(band.note), band.note);

console.log('\n■ 🔴 入庫と返車の真ん中に日付バッジ');
ok('🔴 日付バッジが出る', /\d+\/\d+/.test(band.chip), band.chip);
console.log('\n■ 最短入庫カードの説明');
ok('🔴 どの決まりで出した日か書いてある', /が取れる日/.test(band.why), band.why);
ok('🔴 国産のお客様に「輸入は避けている」と言っている', /輸入車の代車は避けて/.test(band.note2), band.note2);

console.log('\n■ JSエラー');
ok('画面のエラーなし', errs.length === 0, errs.slice(0, 4));

console.log('\n' + '='.repeat(50));
console.log(`  結果： ${pass} OK / ${fail} NG`);
console.log('='.repeat(50));
await b.close();
process.exit(fail ? 1 : 0);
