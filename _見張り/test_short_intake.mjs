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
/* 🔴🔴 v1.158.0（ゆうた確定）「0日あり得る。いって帰ってくるだけで代車使いたいと。
   代車的には1日利用として存在する」＝ **0 は「無し」ではなく「1日」**。未選択（null）とは別物。 */
ok('🔴🔴 預かり0日＝当日返し。代車は1日ぶん要る（前1日＋1日＋後1日＝3日連続）',
   need.ゼロ.days === 3 && need.ゼロ.back === 1, need.ゼロ);
ok('🔴 0日は「1週間」に化けない（未選択と混ぜない）', need.ゼロ.days !== 7, need.ゼロ);
ok('🔴 0日はそれと分かる言葉で出る（当日返し）', /当日返し/.test(need.ゼロ.why), need.ゼロ.why);
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
    待ち: pitCardHoldDays(mk({ workType: 'shaken', dropType: 'wait' })),
    手入力ゼロ: pitCardHoldDays(mk({ workType: 'shaken', estHoldDays: 0 }))
  };
});
ok('🔴 作業タイプ未選択は null（＝1週間の決まりになる）', holdOf.未選択 === null, holdOf);
ok('作業タイプを選ぶと日数が出る', typeof holdOf.車検 === 'number' && holdOf.車検 > 0, holdOf);
ok('手で入れた日数が最優先', holdOf.手入力 === 2, holdOf);
/* 🔴🔴 v1.158.0 0 は「決まった答え」。null（まだ決まっていない）に潰さない */
ok('🔴🔴 手で 0 と入れたら 0 が返る（null に化けない）', holdOf.手入力ゼロ === 0, holdOf);
ok('🔴 待ち・当日仕上げは 0（＝代車を使うなら1日ぶん。1週間ではない）', holdOf.待ち === 0, holdOf);

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

/* ===== ⑥ 🆕 v1.157.0 「まで」が空のうちは、打つそばから最短入庫日も帯も動く =====
   🗣 ゆうた「代車の**「まで」が入ってない間（いわば検討中の段階）**であれば、
   　　作業タイプや国産／輸入のチップ、手入力の概算預かり日数で
   　　**最短入庫日と、それに伴うカレンダーの透過グリーンがリニアに変わる**ようにしてほしい」
   🔴 打っている最中なので、**入力欄から焦点が飛んではいけない**（数字が打てなくなる）。 */
console.log('\n■ 🔴 v1.157.0 打つそばから動く（「まで」が空のうち）');
await seed();
await p.evaluate(async () => {
  state.cards = [];
  const c = { id: 'NEW2', _draft: false, resNo: 'R-NEW2', boardId: 'default', division: 'div1',
              status: 'reserved', customer: 'リニア', car: 'ノート',
              workType: null, workTypes: [], dropType: 'drop',
              estHoldDays: '', reserveDate: window._add(10), reserveTime: '09:00',
              needLoaner: true, loanerId: '', loanerFrom: '', loanerTo: '', log: [] };
  state.cards.push(c);
  openCard(c.id, 'page');
  await new Promise(r => setTimeout(r, 1000));
});
const snap = () => p.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('#cfs-lg-body tr.cfs-lg-band')).map(r => r.getAttribute('data-ds'));
  const note = document.querySelector('.cfs-lg-bandnote');
  const why  = document.querySelector('.cfs-card[data-shortbox][data-team="default"] .cfs-el-why');
  return { n: rows.length, from: rows[0] || '', to: rows[rows.length - 1] || '',
           note: note ? note.innerText : '', fixed: !!(note && note.classList.contains('fixed')),
           why: why ? why.innerText : '',
           focus: (document.activeElement && document.activeElement.getAttribute('data-key')) || '' };
});

const s0 = await snap();
ok('🔴 作業タイプ未選択のうちは 1週間ぶんの帯', s0.n === 7, s0);
ok('🔴 説明も「1週間」と言っている', /1週間/.test(s0.why), s0.why);

/* 実際に人が打つのと同じように、1文字ずつ入れる */
await p.click('[data-key="estHoldDays"]');
await p.type('[data-key="estHoldDays"]', '4', { delay: 60 });
await p.waitForTimeout(250);
const s1 = await snap();
ok('🔴 打った瞬間に帯が「預かり4日＋前後1日＝6日」になる', s1.n === 6, s1);
const _d9 = await p.evaluate(() => window._add(9));
ok('🔴 帯は入庫日（＋10日）の前日から', s1.from === _d9, { s1: s1, want: _d9 });
ok('🔴 最短入庫の説明もその場で変わる', /預かり4日/.test(s1.why), s1.why);
ok('🔴🔴 打っている欄から焦点が飛んでいない（数字が打ち続けられる）', s1.focus === 'estHoldDays', s1.focus);
ok('まだ「決まった貸出」ではない', s1.fixed === false && /案内|押さえる/.test(s1.note), s1.note);

/* さらに1文字足す＝「4」→「45」ではなく打ち直しで確かめる */
await p.fill('[data-key="estHoldDays"]', '');
await p.type('[data-key="estHoldDays"]', '9', { delay: 60 });
await p.waitForTimeout(250);
const s2 = await snap();
ok('🔴 打ち直しにも追従する（9日＋前後1日＝11日）', s2.n === 11, s2);
ok('🔴 焦点はまだ入力欄', s2.focus === 'estHoldDays', s2.focus);

/* 🔴 「まで」を入れた＝人が決めた。以後は動かさない */
await p.evaluate(() => {
  const c = state.cards.find(x => x.id === 'NEW2');
  const set = (k, v) => { const el = document.querySelector('[data-key="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  set('loanerFrom', window._add(10));
  set('loanerTo',   window._add(12));
});
await p.waitForTimeout(300);
const s3 = await snap();
const want = await p.evaluate(() => ({ a: window._add(10), b: window._add(12) }));
ok('🔴🔴 「まで」が入ったら帯は決まった貸出の幅で止まる', s3.from === want.a && s3.to === want.b, { s3: s3, want: want });
ok('🔴 幅は3日ぴったり（前後の予備を足さない）', s3.n === 3, s3);
ok('🔴 言葉も「決まった貸出の幅」に変わる', /決まった貸出/.test(s3.note), s3.note);
ok('🔴 見た目も見分けが付く（fixed）', s3.fixed === true, s3);

/* 「まで」を消したら、また検討中に戻る */
await p.evaluate(() => {
  const el = document.querySelector('[data-key="loanerTo"]');
  el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));
});
await p.waitForTimeout(300);
const s4 = await snap();
ok('🔴 「まで」を消せば検討中に戻る（また動く）', s4.fixed === false && s4.n === 11, s4);

/* ===== ⑦ 🔴🔴 v1.157.1（ゆうた報告「全体的に動きが悪い」）
   **打つたびに予約カレンダーの日付マスが消えていた。**
   `cfs-short` は「最短入庫カード」だけでなく **予約カレンダーの
   「いつもと時間が違う日（午前休み・午後休み・早締め）」のマス** にも付いている。
   しかも**どちらにも `data-team` がある**ので、`.cfs-short[data-team]` で拾うと
   短縮営業日のマスまで「最短入庫カード」で置き換わって消えていた。
   🔴 **作り直す物には専用の目印（data-shortbox）を付ける。クラス名の使い回しで拾わない。** */
console.log('\n■ 🔴🔴 v1.157.1 打っても予約カレンダーのマスが消えない');
await p.evaluate(async () => {
  /* MHS から届く形のカレンダーを入れて、短縮営業日を3日つくる（現場では普通にある） */
  const days = {}; [3, 4, 8].forEach(n => { days[window._add(n)] = { h: 'am', l: '午前休み' }; });
  window.__PitCalTest({ ver: 1, from: window._add(-30), to: window._add(120), dow: [0], days: days });
  state.cards = [];
  const c = { id: 'NEW3', _draft: false, resNo: 'R-NEW3', boardId: 'default', division: 'div1',
              status: 'reserved', customer: '短縮', car: 'ノート',
              workType: null, workTypes: [], dropType: 'drop', estHoldDays: '',
              reserveDate: window._add(10), reserveTime: '09:00',
              needLoaner: true, loanerId: '', loanerFrom: '', loanerTo: '', log: [] };
  state.cards.push(c);
  openCard(c.id, 'page');
  await new Promise(r => setTimeout(r, 1000));
});
const cal0 = await p.evaluate(() => ({
  days: document.querySelectorAll('.cfs-day').length,
  short: document.querySelectorAll('.cfs-day.cfs-short').length,
  boxes: document.querySelectorAll('.cfs-card[data-shortbox]').length
}));
ok('前提：短縮営業日のマスが出ている', cal0.short === 3 && cal0.days > 0 && cal0.boxes === 1, cal0);
await p.click('[data-key="estHoldDays"]');
await p.type('[data-key="estHoldDays"]', '12', { delay: 60 });
await p.waitForTimeout(400);
const cal1 = await p.evaluate(() => ({
  days: document.querySelectorAll('.cfs-day').length,
  short: document.querySelectorAll('.cfs-day.cfs-short').length,
  boxes: document.querySelectorAll('.cfs-card[data-shortbox]').length,
  why: (document.querySelector('.cfs-card[data-shortbox] .cfs-el-why') || {}).innerText || '',
  band: document.querySelectorAll('#cfs-lg-body tr.cfs-lg-band').length
}));
ok('🔴🔴 予約カレンダーの日付マスが1つも消えていない', cal1.days === cal0.days, { 前: cal0, 後: cal1 });
ok('🔴 短縮営業日のマスも残っている', cal1.short === 3, cal1);
ok('🔴 最短入庫カードが増えていない（マスが化けていない）', cal1.boxes === 1, cal1);
ok('それでも中身はちゃんと変わっている', /預かり12日/.test(cal1.why) && cal1.band === 14, cal1);

/* 速さ＝打つたびに重くなっていないか（1文字あたり） */
const perf = await p.evaluate(() => {
  const el = document.querySelector('[data-key="estHoldDays"]');
  const ts = [];
  for (let i = 0; i < 10; i++){
    el.value = String(3 + i);
    const t0 = performance.now();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    ts.push(performance.now() - t0);
  }
  return ts.reduce((a, b) => a + b, 0) / ts.length;
});
ok('🔴 1文字あたりが重くない（50ms未満）', perf < 50, Math.round(perf) + 'ms');

/* ===== ⑧ 🔴🔴 v1.158.0 預かり0日（当日返し）でも代車は1日ぶん押さえる =====
   🗣 ゆうた「**0日あり得る。いって帰ってくるだけで代車使いたいと。
   　　代車的には1日利用として存在する**」
   ⚠ v1.157.1 までは 0 を「まだ決まっていない」と同じ扱いにして**1週間の窓**を出していた
      ＝ 当日返しのお客様に、1週間まるごと空いている日しか案内できていなかった。 */
console.log('\n■ 🔴🔴 v1.158.0 預かり0日＝当日返しでも代車は1日');
await seed();
const zero = await p.evaluate(async () => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  /* 3台とも 3日後〜9日後 を埋める＝今日〜2日後の3日間だけ空いている */
  state.loanerAssigns = state.loaners.map(function (l, i) {
    return { id: 'Z' + i, cardId: null, loanerId: l.id, customer: 'ふさぎ', manual: true,
             fromDate: window._add(3), toDate: window._add(9), returned: false };
  });
  const short = h => { const d = dashEarliestIntake('default', 'loaner', t, h, { board: 'default' }); return d ? window._iso(d) : null; };
  return {
    窓: pitLoanerPlanWindow(window._add(10), 0, {}),
    最短ゼロ: short(0), 最短未選択: short(null), 最短1日: short(1),
    今日ゼロOK: pitLoanerPlanOk(window._T.today, 0, {}),
    今日未選択OK: pitLoanerPlanOk(window._T.today, null, {})
  };
});
ok('🔴🔴 0日の窓は3日（前日・当日・翌日）', zero.窓.days === 3, zero.窓);
ok('🔴 位置も前日から翌日まで', zero.窓.from === (await add(9)) && zero.窓.to === (await add(11)), zero.窓);
ok('🔴🔴 当日返しなら今日から案内できる（3日空いていれば足りる）', zero.今日ゼロOK === true, zero);
ok('🔴 未選択のままなら今日は案内しない（1週間は取れない）', zero.今日未選択OK === false, zero);
ok('🔴🔴 最短入庫日も 0日 と 未選択 で変わる', zero.最短ゼロ === T.today && zero.最短未選択 >= (await add(10)), zero);
ok('🔴 0日と1日は同じ幅（どちらも代車を1日使う）', zero.最短ゼロ === zero.最短1日, zero);

/* 画面でも「当日返し」と分かるように出ているか */
await seed();
const zeroUi = await p.evaluate(async () => {
  state.cards = [];
  const c = { id: 'ZERO1', _draft: false, resNo: 'R-ZERO1', boardId: 'default', division: 'div1',
              status: 'reserved', customer: '当日返し', car: 'ノート',
              workType: 'shaken', workTypes: ['shaken'], dropType: 'drop', estHoldDays: 0,
              reserveDate: window._add(10), reserveTime: '09:00',
              needLoaner: true, loanerId: '', loanerFrom: '', loanerTo: '', log: [] };
  state.cards.push(c);
  openCard(c.id, 'page');
  await new Promise(r => setTimeout(r, 1000));
  return {
    why: (document.querySelector('.cfs-card[data-shortbox] .cfs-el-why') || {}).innerText || '',
    band: document.querySelectorAll('#cfs-lg-body tr.cfs-lg-band').length,
    note: (document.querySelector('.cfs-lg-bandnote') || {}).innerText || ''
  };
});
ok('🔴 画面の札が「当日返し（代車1日）」と言っている', /当日返し/.test(zeroUi.why), zeroUi.why);
ok('🔴 帯も3日ぶん', zeroUi.band === 3, zeroUi);
ok('🔴 帯の説明にも出ている', /当日返し/.test(zeroUi.note), zeroUi.note);

console.log('\n■ JSエラー');
ok('画面のエラーなし', errs.length === 0, errs.slice(0, 4));

console.log('\n' + '='.repeat(50));
console.log(`  結果： ${pass} OK / ${fail} NG`);
console.log('='.repeat(50));
await b.close();
process.exit(fail ? 1 : 0);
