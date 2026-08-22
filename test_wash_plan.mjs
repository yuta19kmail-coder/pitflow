/* PitFlow v1.151.0 ── 洗車は完TELを待たない（車販作業の「今日・明日」「今週の洗車予定」）
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-20）
     「今日明日、今週の洗車予定に関しては、さっきの未完も含めて、
       **タスクボード上にあったとしても**、暫定返車予定・確定返車予定が
       今日明日 or 今週末にかぶるようなら**基本表示させる**ようにして。
       未完バッジなどは付けてOK。
       **とにかく状況によっては整備完了を待たずに洗車も始めないと
       スケジュールが追いつかなくなることがある**」

   ◎決めごと
     🔴 洗車の一覧は **完TELを通っていなくても拾う**（暫定でも未完でもいい）。
     🔴 日付は `pitReturnPlanDate` 1本＝**確定 → 未完 → 暫定 → 待・当の入庫日**。
     🔴 どの確からしさで出ているかを**札で必ず出す**（未完／暫定）。
     ⚠ **返車カレンダー・当日ビューは今までどおり「確定だけ」。** ここだけ物差しが違う（段取り用）。
     ⚠ **まだ入庫していない車は拾わない**（洗う車がここに無い）。
     ⚠ 「洗車で返車日未定」の枠は**今までどおり完TELを通った車だけ**（広げると一覧が埋まる）。

   ◎使い方
     python3 -m http.server 8994      ← 別ウィンドウ
     node test_wash_plan.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8994;
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
await p.waitForFunction('window.state && window.renderCarSales && window.pitReturnPlanDate', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(900);

/* 撒くカード（全部 洗車あり）
     F1 … 完TEL済・確定返車日＝今日            → 今日（確定・印なし）
     P1 … 盤面・作業完了・確定返車日＝今日      → 今日（🟠未完）
     B1 … 盤面・作業待ち・暫定返車日＝今日      → 今日（🟠暫定）
     B2 … 盤面・暫定＝翌営業日                  → 明日
     B3 … 盤面・暫定＝今週日曜                  → 今週
     X1 … 盤面・暫定＝来週                      → どこにも出ない
     X2 … まだ入庫していない（予約）・暫定＝今日 → 出ない
     N1 … 完TEL済・日付なし                     → 「返車日未定」の枠
     N2 … 盤面・日付なし                        → どこにも出ない（未定の枠も埋めない）        */
const seed = async () => await p.evaluate(() => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const q = n => (n < 10 ? '0' : '') + n;
  const iso = d => d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate());
  const add = n => { const d = new Date(t); d.setDate(d.getDate() + n); return iso(d); };
  /* 翌営業日・今週日曜は画面と同じ関数で取る（休みの日をまたぐと日付がズレるため） */
  const nextBiz = (typeof _csNextBizDay === 'function') ? iso(_csNextBizDay()) : add(1);
  const sun = (typeof _csThisSunday === 'function') ? _csThisSunday() : add(7);
  const nextWeek = (function(){ const d = new Date(sun + 'T00:00:00'); d.setDate(d.getDate() + 3); return iso(d); })();
  window._T = { today: iso(t), nextBiz, sun, nextWeek };
  const mk = (id, o) => Object.assign({
    id, resNo: 'R-' + id, boardId: 'default', division: 'div1',
    status: 'work', workType: 'general', workTypes: ['general'],
    customer: '洗車' + id, car: 'テスト車', reserveDate: add(-2), reserveTime: '09:00',
    dropType: 'drop', needWash: true, washSalesDone: false,
    returnStage: '', returnDate: '', returnDatePlan: '', returnTime: '', log: [],
    coverCall: { done: false, at: '', staff: '' }
  }, o);
  state.cards = [
    mk('F1', { returnStage: 'returnWait', status: 'workDone', returnDate: window._T.today, returnTime: '15:00' }),
    mk('P1', { status: 'workDone', returnDate: window._T.today, returnDateFinal: window._T.today }),
    mk('B1', { returnDatePlan: window._T.today }),
    mk('B2', { returnDatePlan: nextBiz }),
    mk('B3', { returnDatePlan: sun }),
    mk('X1', { returnDatePlan: nextWeek }),
    mk('X2', { status: 'reserved', reserveDate: window._T.today, returnDatePlan: window._T.today }),
    mk('N1', { returnStage: 'returnWait', status: 'workDone' }),
    mk('N2', {})
  ];
  return window._T;
});
const T = await seed();

/* ===== ① 物差し（どの日で拾うか・どの確からしさか） ===== */
console.log('\n■ 🔴 「いつ返す予定か」の拾う順（確定 → 未完 → 暫定 → 待・当）');
const kinds = await p.evaluate(() => {
  const one = id => { const c = state.cards.find(x => x.id === id);
    return { d: pitReturnPlanDate(c), k: pitReturnPlanKind(c) }; };
  /* 待ち・当日返しも見る（入庫日で拾う） */
  state.cards.push(Object.assign({}, state.cards[0], { id:'W1', returnStage:'', status:'work',
    returnDate:'', returnDatePlan:'', dropType:'wait', reserveDate: window._T.today }));
  return { F1: one('F1'), P1: one('P1'), B1: one('B1'), N2: one('N2'), W1: one('W1') };
});
ok('確定（完TEL済）は fixed', kinds.F1.k === 'fixed' && kinds.F1.d === T.today, kinds.F1);
ok('🔴 未完（盤面の確定日）は pending', kinds.P1.k === 'pending' && kinds.P1.d === T.today, kinds.P1);
ok('🔴 暫定（お客様への約束）は plan', kinds.B1.k === 'plan' && kinds.B1.d === T.today, kinds.B1);
ok('待ち・当日返しは入庫日', kinds.W1.k === 'sameday' && kinds.W1.d === T.today, kinds.W1);
ok('何も無ければ空', kinds.N2.k === '' && kinds.N2.d === '', kinds.N2);

/* ===== ② 車販作業の画面に、盤面の車が出る ===== */
console.log('\n■ 🔴 完TELを通っていない車も洗車の一覧に出る');
await seed();
const view = await p.evaluate(async () => {
  showView('carsales'); await new Promise(r => setTimeout(r, 600));
  const secs = Array.from(document.querySelectorAll('#carsales-body .cs-sec'));
  const pick = t => secs.find(s => (s.querySelector('.cs-sec-h') || {}).textContent.indexOf(t) >= 0);
  const 洗車 = pick('洗車'), 今週 = pick('今週の洗車予定');
  const ids = el => Array.from(el.querySelectorAll('.cs-sec-body [data-card-id]')).map(x => x.getAttribute('data-card-id'));
  /* 「今日」「明日」の小見出しで分ける */
  const grp = (el) => {
    const out = { 今日: [], 明日: [] }; let cur = null;
    Array.from(el.querySelector('.cs-sec-body').children).forEach(ch => {
      if (ch.classList.contains('cs-subh')) cur = /今日/.test(ch.textContent) ? '今日' : (/明日/.test(ch.textContent) ? '明日' : null);
      const c = ch.querySelector && ch.querySelector('[data-card-id]');
      if (c && cur) out[cur].push(c.getAttribute('data-card-id'));
    });
    return out;
  };
  const 札 = id => {
    const el = document.querySelector('#carsales-body [data-card-id="' + id + '"]');
    const wrap = el && el.closest('.cs-cardwrap');
    const ex = wrap && wrap.querySelector('.cs-extra');
    return { 未完: !!(ex && ex.querySelector('.ret-pend')), 暫定: !!(ex && ex.querySelector('.ret-plan')),
             未定: !!(ex && ex.querySelector('.ret-tbd')), 文: ex ? ex.textContent.trim() : '' };
  };
  return { 全部: ids(洗車).concat(ids(今週)), 今日明日: grp(洗車),
           今週: ids(今週),
           今週の小見出し: Array.from(今週.querySelectorAll('.cs-sec-body .cs-subh')).map(x => x.textContent.trim()),
           札F1: 札('F1'), 札P1: 札('P1'), 札B1: 札('B1'), 札N1: 札('N1') };
});
ok('🔴 今日＝確定・未完・暫定の3台がそろう',
   ['F1','P1','B1'].every(i => view.今日明日.今日.indexOf(i) >= 0), view.今日明日);
ok('🔴 明日＝暫定の車が出る', view.今日明日.明日.indexOf('B2') >= 0, view.今日明日);
/* 🔴 2026-08-22（土）に落ちた。**見張り側の日付の穴。**
   ◎正体
     B3 は「今週日曜」に置いている。ところが **土曜に走らせると『今週日曜』＝明日**になり、
     B3 は「明日」の枠に入る＝「今週」の枠に入る日が**そもそも1日も存在しない**。
   🔴 だから「今週に出るか」ではなく「**明日より後・今週日曜まで の枠がある時だけ**」見る。
      枠が無い日は、B3 が**明日に出ていること**を確かめる（どちらにせよ迷子にならない）。
   ⚠ 曜日で答えが変わる見張りは、走らせた日のせいで落ちる＝オオカミ少年になる。 */
const hasWeekSlot = T.sun > T.nextBiz;
if (hasWeekSlot) ok('🔴 今週＝暫定の車が出る', view.今週.indexOf('B3') >= 0, view.今週);
else             ok('🔴 今週の枠が無い日（土曜など）は、その車が明日に出る',
                    view.今日明日.明日.indexOf('B3') >= 0, { 明日: view.今日明日.明日, sun: T.sun, nextBiz: T.nextBiz });
ok('🔴 来週の車は出さない', view.全部.indexOf('X1') < 0, view.全部);
ok('🔴 まだ入庫していない車は出さない', view.全部.indexOf('X2') < 0, view.全部);

/* 🔄 v1.152.0（ゆうた指摘）「洗車で返車日未定」の別枠をやめ、同じ並びに札で混ぜた */
console.log('\n■ 🔄 「返車日未定」を別枠にしない（v1.152.0）');
ok('🔴 未定の車が今週の並びに一緒に入っている', view.今週.indexOf('N1') >= 0, view.今週);
ok('🔴 未定だけの小見出し（別枠）が無くなっている',
   view.今週の小見出し.every(t => !/未定/.test(t)), view.今週の小見出し);
/* ⚠ 上と同じ理由。今週の枠に日付のある車が居ない日は、並び順を比べようがない */
if (hasWeekSlot) ok('🔴 日付のある車が先・未定は最後', view.今週.indexOf('B3') < view.今週.indexOf('N1'), view.今週);
else             ok('今週の枠が無い日は、未定の車だけが並ぶ', view.今週.join() === 'N1', view.今週);
ok('🔴 盤面で日付なしは出さない（一覧が埋まる）', view.全部.indexOf('N2') < 0, view.全部);

/* ===== ③ どの確からしさかが札で分かる ===== */
console.log('\n■ 🔴 未完・暫定・未定の札が出る');
ok('確定の車には札を付けない', !view.札F1.未完 && !view.札F1.暫定 && !view.札F1.未定, view.札F1);
ok('🔴 未完の車には「未完」の札', view.札P1.未完 && !view.札P1.暫定, view.札P1);
ok('🔴 暫定の車には「暫定」の札', view.札B1.暫定 && !view.札B1.未完, view.札B1);
ok('🔴 未定の車には「未定」の札', view.札N1.未定 && !view.札N1.暫定 && !view.札N1.未完, view.札N1);
ok('🔴 返車予定の日付も出ている', /返車 \d+\/\d+/.test(view.札F1.文) && /返車 \d+\/\d+/.test(view.札B1.文), [view.札F1.文, view.札B1.文]);
ok('未定の車は「返車日未定」と書いてある', /返車日未定/.test(view.札N1.文), view.札N1);

/* ===== ④ 🔴 返車カレンダー・当日ビューは巻き込まれていない ===== */
console.log('\n■ 🔴🔴 返車カレンダー・当日ビューは「確定だけ」のまま');
const cal = await p.evaluate(async () => {
  state.returnRange = 'day'; state.returnDate = new Date();
  showView('return'); await new Promise(r => setTimeout(r, 500));
  const has = id => !!document.querySelector('#view-return [data-card-id="' + id + '"]');
  const 一覧日 = id => pitReturnListDate(state.cards.find(x => x.id === id), window._T.today);
  return { 確定: has('F1'), 未完: has('P1'), 暫定: has('B1'),
           日F1: 一覧日('F1'), 日P1: 一覧日('P1'), 日B1: 一覧日('B1'),
           盤面のまま: !state.cards.find(x => x.id === 'B1').returnStage };
});
ok('確定はカレンダーに出る', cal.確定 && cal.日F1 === T.today, cal);
ok('未完もカレンダーに出る（v1.149.0）', cal.未完 && cal.日P1 === T.today, cal);
ok('🔴🔴 暫定はカレンダーに出さない（v1.65.0 の決めごとを崩さない）', cal.暫定 === false && cal.日B1 === '', cal);
ok('🔴 暫定の車は盤面にいるまま（データを触っていない）', cal.盤面のまま, cal);

/* ===== ⑤ 洗車の「✓完了」は今までどおり効く ===== */
console.log('\n■ 洗車の「✓完了」（盤面の車でも押せる）');
const done = await p.evaluate(async () => {
  showView('carsales'); await new Promise(r => setTimeout(r, 500));
  csDone('B1', 'wash');
  await new Promise(r => setTimeout(r, 500));
  const c = state.cards.find(x => x.id === 'B1');
  const 完了欄 = !!document.querySelector('#carsales-body .cs-done-row [data-card-id="B1"]');
  csUndo('B1', 'wash');
  await new Promise(r => setTimeout(r, 400));
  return { 印: c.washSalesDone === false, 完了欄, 戻せた: !state.cards.find(x => x.id === 'B1').washSalesDone };
});
ok('🔴 暫定の車でも「完了」に送れる', done.完了欄, done);
ok('「戻す」で戻る', done.戻せた, done);

console.log('\n' + '='.repeat(50));
console.log(`  結果： ${pass} OK / ${fail} NG`);
if (errs.length) { console.log('  ⚠ 画面のエラー:'); errs.slice(0, 8).forEach(e => console.log('    - ' + e)); }
console.log('='.repeat(50));
await b.close();
process.exit(fail ? 1 : 0);
