/* PitFlow v1.149.0 ── 「未完」＝盤面のまま確定返車日だけ入っている車
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-19）
     「確定返車日を入れた状態で、完TELドラッグがない状態（タスクボードにある状態）の時に、
       返車カレンダー、ひいては当日であれば当日にも表示してほしい。
       ただし完TELを通ってない以上『未完』ではあるから、未完なりグレーアウトなり、
       終わってるわけではないのは伝えつつ、
       ただ返車として確定はしてるんだなってのを入れたい」
     ＋（この場での確認）「触れるようにするか」→ **見えるだけ**／「件数に入れるか」→ **入れる**

   ◎決めごと
     🔴 出すのは **作業完了に入っていて、確定返車日を持っていて、完TELをまだ通っていない車**。
     　　（確定返車日の入力欄が出るのが作業完了からなので、そこより前の日付は「お客様への約束」）
     🔴 **盤面から消えない・returnStage は付かない・データは1文字も変わらない。**
     　　＝v1.132.0「返車系への入口は完TELのドラッグだけ」は 1ミリも緩めていない。
     🔴 **見えるだけ**＝つかめない／落としても止まる／当日ビューで返車済み・日時変更・キャンセルができない。
     🔴 **件数には入る**（画面に出ているのに数に入っていない、をつくらない）。

   ◎使い方
     python3 -m http.server 8993      ← 別ウィンドウ
     node test_return_pending.mjs                                       */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8993;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitReturnListDate && window.pitReturnIsPending', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(900);

/* 撒くカード
     P1 … 作業完了・確定返車日＝今日・完TEL前          → 未完（今日出る）
     P2 … 作業完了・確定返車日＝明日・完TEL前          → 未完（明日出る）
     N1 … 作業中（作業完了より前）・日付あり・完TEL前  → 出ない（それは「約束」）
     N2 … 作業完了・日付なし・完TEL前                  → 出ない
     N3 … 待ち（当日返し）・今日入庫                    → 今までどおり出る。未完ではない
     N4 … 完TEL済・今日・時間あり                      → ふつうの返車。未完ではない          */
const seed = async () => await p.evaluate(() => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const q = n => (n < 10 ? '0' : '') + n;
  const iso = d => d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate());
  const add = n => { const d = new Date(t); d.setDate(d.getDate() + n); return iso(d); };
  window._T = { today: iso(t), tomo: add(1) };
  const mk = (id, o) => Object.assign({
    id, resNo: 'R-' + id, boardId: 'default', division: 'div1',
    status: 'workDone', workType: 'general', workTypes: ['general'],
    customer: '未完' + id, car: 'テスト車', reserveDate: add(-2), dropType: 'drop',
    returnStage: '', returnDate: '', returnTime: '', bayId: null, log: [],
    coverCall: { done: false, at: '', staff: '' }
  }, o);
  state.cards = [
    mk('P1', { returnDate: window._T.today, returnDateFinal: window._T.today }),
    mk('P2', { returnDate: window._T.tomo,  returnDateFinal: window._T.tomo }),
    mk('N1', { status: 'work', returnDate: window._T.today }),
    mk('N2', {}),
    mk('N3', { dropType: 'wait', reserveDate: window._T.today }),
    mk('N4', { returnStage: 'returnWait', returnDate: window._T.today, returnTime: '14:00' })
  ];
  return window._T;
});
const T = await seed();
const look = async id => await p.evaluate(i => {
  const c = state.cards.find(x => x.id === i);
  return {
    未完: pitReturnIsPending(c),
    一覧日: pitReturnListDate(c, window._T.today),
    箱: pitReturnPlace(c),
    returnStage: c.returnStage, status: c.status, returnDate: c.returnDate
  };
}, id);

/* ===== ① 物差し ===== */
console.log('\n■ 🔴 だれが「未完」か');
const P1 = await look('P1'), P2 = await look('P2');
ok('🔴 作業完了＋確定返車日＋完TEL前＝未完', P1.未完 && P2.未完, [P1, P2]);
ok('🔴 その日で返車の一覧に出る', P1.一覧日 === T.today && P2.一覧日 === T.tomo, [P1, P2]);
ok('🔴 返車系の箱には入らない（盤面のまま）', P1.箱 === null && P2.箱 === null, [P1, P2]);
ok('🔴 returnStage は付かない（データを変えない）', !P1.returnStage && !P2.returnStage, [P1, P2]);

const N1 = await look('N1'), N2 = await look('N2'), N3 = await look('N3'), N4 = await look('N4');
ok('作業完了より前の日付は拾わない（お客様への約束）', !N1.未完 && N1.一覧日 === '', N1);
ok('日付が無ければ出ない', !N2.未完 && N2.一覧日 === '', N2);
ok('待ち・当日返しは今までどおり（未完ではない）', !N3.未完 && N3.一覧日 === T.today, N3);
ok('完TEL済はふつうの返車（未完ではない）', !N4.未完 && N4.箱 === 'calendar', N4);

/* ===== ② 盤面（タスクボード）から消えていない ===== */
console.log('\n■ 🔴 タスクボードからは消えない');
const onBoard = await p.evaluate(async () => {
  showView('task'); await new Promise(r => setTimeout(r, 400));
  const el = document.querySelector('#view-task [data-card-id="P1"]');
  return { いる: !!el, グレー: !!(el && el.classList.contains('is-retpend')),
           つかめる: !!(el && el.getAttribute('draggable') !== 'false') };
});
ok('🔴 タスクボードに居る', onBoard.いる, onBoard);
ok('🔴 盤面ではグレーにしない（普通のカード）', !onBoard.グレー, onBoard);
ok('🔴 盤面ではつかめる（今までどおり動かせる）', onBoard.つかめる, onBoard);

/* ===== ③ 返車カレンダー（日）＝グレー＋「未完」＋つかめない ===== */
console.log('\n■ 🔴 返車カレンダー（日）');
const day = await p.evaluate(async () => {
  showView('return'); await new Promise(r => setTimeout(r, 250));
  state.returnRange = 'day'; state.returnDate = new Date(); renderReturn();
  await new Promise(r => setTimeout(r, 400));
  const el = document.querySelector('#view-return [data-card-id="P1"]');
  const v = document.getElementById('view-return');
  return { 出る: !!el,
           グレー: !!(el && el.classList.contains('is-retpend')),
           札: !!(el && el.querySelector('.ret-pend')),
           札の字: el && el.querySelector('.ret-pend') ? el.querySelector('.ret-pend').textContent.trim() : '',
           つかめない: !!(el && el.getAttribute('draggable') === 'false'),
           件数: (v.textContent.match(/本日の返車予定\s*(\d+)\s*件/) || [])[1] || '' };
});
ok('🔴 返車カレンダーに出る', day.出る, day);
ok('🔴 グレーになっている', day.グレー, day);
ok('🔴 「未完」の札が出る', day.札 && day.札の字 === '未完', day);
ok('🔴 つかめない（見えるだけ）', day.つかめない, day);
ok('🔴 件数にも入っている（今日は P1 と N3 と N4 で3件）', day.件数 === '3', day);

/* ===== ④ 週・月・2ヶ月・日付ポップアップでも同じ ===== */
console.log('\n■ 🔴 週・月・2ヶ月・その日のポップアップ');
const other = await p.evaluate(async () => {
  const one = async (range) => {
    state.returnRange = range; state.returnDate = new Date(); renderReturn();
    await new Promise(r => setTimeout(r, 450));
    const el = document.querySelector('#view-return [data-card-id="P1"]');
    return { 出る: !!el, グレー: !!(el && el.classList.contains('is-retpend')),
             札: !!(el && el.querySelector('.ret-pend')),
             つかめない: !!(el && el.getAttribute('draggable') === 'false') };
  };
  const 週 = await one('week'), 月 = await one('month'), ふた = await one('2month');
  pitReserveDayPopup(window._T.today, 'return');
  await new Promise(r => setTimeout(r, 300));
  const pel = document.querySelector('#pit-day-pop [data-card-id="P1"]');
  const ポップ = { 出る: !!pel, グレー: !!(pel && pel.classList.contains('is-retpend')),
                   札: !!(pel && pel.querySelector('.ret-pend')) };
  if (window.pitReserveDayPopClose) pitReserveDayPopClose();
  return { 週, 月, ふた, ポップ };
});
['週', '月', 'ふた'].forEach(k => {
  const r = other[k];
  ok(k + 'ビュー：出る・グレー・札・つかめない', r.出る && r.グレー && r.札 && r.つかめない, r);
});
ok('その日のポップアップ：出る・グレー・札', other.ポップ.出る && other.ポップ.グレー && other.ポップ.札, other.ポップ);

/* ===== ⑤ 当日ビュー ===== */
console.log('\n■ 🔴 当日ビュー');
const today = await p.evaluate(async () => {
  showView('today'); await new Promise(r => setTimeout(r, 500));
  const rows = Array.from(document.querySelectorAll('#view-today-body .today-row'));
  const el = rows.find(r => /未完P1/.test(r.textContent));
  return { 出る: !!el,
           グレー: !!(el && el.classList.contains('is-retpend')),
           札: !!(el && el.querySelector('.ret-pend')),
           返車の列: !!(el && el.closest('.today-col') && /返車/.test(el.closest('.today-col').textContent.slice(0, 12))) };
});
ok('🔴 当日ビューに出る', today.出る, today);
ok('🔴 グレーになっている', today.グレー, today);
ok('🔴 「未完」の札が出る', today.札, today);

/* ===== ⑥ 当日ビューでは触れない（3つとも止まる） ===== */
console.log('\n■ 🔴 見えるだけ＝当日ビューで触れない');
const sheet = await p.evaluate(async () => {
  pitTodayTap('P1', true);
  await new Promise(r => setTimeout(r, 300));
  const box = document.querySelector('#today-action .ta-sheet');
  const btns = Array.from(box.querySelectorAll('button'));
  const 見つける = t => btns.find(x => new RegExp(t).test(x.textContent));
  const st = t => { const x = 見つける(t); return x ? { ある: true, 押せない: x.disabled === true } : { ある: false }; };
  const out = {
    返車済み: st('返車済みにする'), 日時変更: st('日時変更'),
    キャンセル: st('返車キャンセル'), 詳細: st('詳細を見る'),
    説明: !!box.querySelector('.ta-note'), 札: !!box.querySelector('.ret-pend')
  };
  if (window.pitTodayActionClose) pitTodayActionClose();
  return out;
});
ok('🔴 「返車済みにする」が押せない', sheet.返車済み.ある && sheet.返車済み.押せない, sheet);
ok('🔴 「日時変更」が押せない', sheet.日時変更.ある && sheet.日時変更.押せない, sheet);
ok('🔴 「返車キャンセル」が押せない', sheet.キャンセル.ある && sheet.キャンセル.押せない, sheet);
ok('「詳細を見る」は押せる（直すのはカードの中）', sheet.詳細.ある && !sheet.詳細.押せない, sheet);
ok('🔴 なぜ触れないかを画面で言っている', sheet.説明 && sheet.札, sheet);

/* 🔴 ボタンを消すだけにしない＝呼んでも止まる */
console.log('\n■ 🔴 呼んでも止まる（ボタンを消すだけにしない）');
const forced = await p.evaluate(async () => {
  const c = () => state.cards.find(x => x.id === 'P1');
  const 前 = JSON.stringify(c());
  window.pitTodayCancel('P1', true);   await new Promise(r => setTimeout(r, 250));
  window.pitTodaySaveDt('P1', true);   await new Promise(r => setTimeout(r, 250));
  applyCardDrop('P1', 'returnTime', '09:00');
  applyCardDrop('P1', 'returnDate', window._T.tomo);
  applyCardDrop('P1', 'returnDateTime', window._T.tomo + '|11:00');
  await new Promise(r => setTimeout(r, 300));
  /* 窓が開いてしまっていたら閉じる（開かないのが正しい） */
  const 窓 = !!document.querySelector('#pit-ask.show, #today-action.show');
  if (window.pitAskClose) try { pitAskClose(false); } catch (e) {}
  return { 変わっていない: 前 === JSON.stringify(c()), 窓, いま: JSON.parse(JSON.stringify(c())) };
});
ok('🔴 どの道からもカードが変わらない', forced.変わっていない, forced.いま);
ok('🔴 確定返車日は今日のまま', forced.いま.returnDate === T.today, forced.いま);
ok('🔴 returnStage も空のまま', !forced.いま.returnStage, forced.いま);

/* ===== ⑦ 完TELを通したら、ふつうの返車に変わる（未完が外れる） ===== */
console.log('\n■ 🔴 完TELを通したら未完が外れる');
await seed();
const after = await p.evaluate(async () => {
  showView('task'); await new Promise(r => setTimeout(r, 350));
  applyCardDrop('P1', 'callDone', '');
  await new Promise(r => setTimeout(r, 400));
  const d = document.getElementById('rp-date'); if (d) { d.value = window._T.today; PitReturnPopup.onDate(); }
  const t = document.querySelector('#rp-timeguide .cf-time-main');
  if (t) { t.value = '15:00'; t.dispatchEvent(new Event('change', { bubbles: true })); }
  await new Promise(r => setTimeout(r, 250));
  if (document.getElementById('rp-ok')) PitReturnPopup.close(true);
  await new Promise(r => setTimeout(r, 450));
  const c = state.cards.find(x => x.id === 'P1');
  state.returnRange = 'day'; state.returnDate = new Date();
  showView('return'); await new Promise(r => setTimeout(r, 450));
  const el = document.querySelector('#view-return [data-card-id="P1"]');
  return { 未完: pitReturnIsPending(c), returnStage: c.returnStage, 箱: pitReturnPlace(c),
           出る: !!el, グレー: !!(el && el.classList.contains('is-retpend')),
           つかめる: !!(el && el.getAttribute('draggable') !== 'false') };
});
ok('🔴 完TELを通すと未完ではなくなる', !after.未完, after);
ok('🔴 返車系の箱に入る', !!after.returnStage && after.箱 !== null, after);
ok('🔴 カレンダーではグレーが外れる', after.出る && !after.グレー, after);
ok('🔴 つかめるようになる', after.つかめる, after);

/* ===== ⑧ 実績になったら消える ===== */
console.log('\n■ 実績・廃車になったら出さない');
const gone = await p.evaluate(() => {
  const c = state.cards.find(x => x.id === 'P2');
  c.status = 'returned';
  const a = { 未完: pitReturnIsPending(c), 一覧日: pitReturnListDate(c, window._T.today) };
  c.status = 'scrap';
  const b2 = { 未完: pitReturnIsPending(c), 一覧日: pitReturnListDate(c, window._T.today) };
  c.status = 'reserved';
  const c2 = { 未完: pitReturnIsPending(c) };
  return { a, b2, c2 };
});
ok('実績になったら未完ではない', !gone.a.未完 && gone.a.一覧日 === '', gone.a);
ok('廃車も同じ', !gone.b2.未完 && gone.b2.一覧日 === '', gone.b2);
ok('まだ入庫していない車も拾わない', !gone.c2.未完, gone.c2);

/* ===== ⑨ v1.150.0 返車時間を入庫時刻で代用しない ＝ ゆうた報告
   　　「返車時間が入っていない＝未定なのに、当日ボードで AM が入っている」 ===== */
console.log('\n■ 🔴 返車時間が無い車に、入庫時刻を出さない（v1.150.0）');
await seed();
const timeTxt = await p.evaluate(async () => {
  /* 入庫が「AM」の車たち。返車時間は1文字も入れていない */
  state.cards.forEach(c => { c.reserveTime = 'AM'; });
  const one = id => { const c = state.cards.find(x => x.id === id); return pitReturnTimeText(c); };
  showView('today'); await new Promise(r => setTimeout(r, 500));
  const rows = Array.from(document.querySelectorAll('#view-today-body .today-row'));
  const row = rows.find(r => /未完P1/.test(r.textContent));
  const 時間欄 = row ? row.querySelector('.tr-time').textContent.trim() : '';
  const 札 = row ? row.querySelector('.ret-pend') : null;
  return {
    未完: one('P1'), 待当: one('N3'), 完TEL済: one('N4'),
    時間欄, 札がtagside: !!(札 && 札.classList.contains('tag-side')),
    /* AM の文字が返車の列に1つも残っていないこと */
    返車列にAM: /AM/.test((document.querySelectorAll('.today-col')[1] || {}).textContent || '')
  };
});
ok('🔴 未完で時間が無ければ「未定」（AM ではない）', timeTxt.未完 === '未定', timeTxt);
ok('🔴 待ち・当日返しで時間が無ければ「終日」', timeTxt.待当 === '終日', timeTxt);
ok('完TEL済で時間があればその時間', timeTxt.完TEL済 === '14:00', timeTxt);
ok('🔴 当日ビューの時間欄が「未定」になっている', timeTxt.時間欄 === '未定', timeTxt);
ok('🔴 返車の列に入庫時刻（AM）が出ていない', timeTxt.返車列にAM === false, timeTxt);
ok('🔴 未完の札の大きさが他の札とそろっている（同じ寸法の札を着ている）', timeTxt.札がtagside, timeTxt);

/* 札の色が抜けていないこと＝カード側に filter / opacity を掛けていない（ゆうた指摘） */
console.log('\n■ 🔴 未完の札の色が抜けていない（v1.150.0）');
const badgeCol = await p.evaluate(async () => {
  state.returnRange = 'day'; state.returnDate = new Date();
  showView('return'); await new Promise(r => setTimeout(r, 450));
  const el = document.querySelector('#view-return [data-card-id="P1"]');
  const cs = el ? getComputedStyle(el) : null;
  const bs = el && el.querySelector('.ret-pend') ? getComputedStyle(el.querySelector('.ret-pend')) : null;
  return { カードのfilter: cs ? cs.filter : '', カードのopacity: cs ? cs.opacity : '',
           札の背景: bs ? bs.backgroundColor : '', 札の字: bs ? bs.color : '' };
});
ok('🔴 カードに filter を掛けていない', badgeCol.カードのfilter === 'none', badgeCol);
ok('🔴 カードに opacity を掛けていない', badgeCol.カードのopacity === '1', badgeCol);
ok('🔴 札はハッキリした色（灰色ではない）', /245, *158, *11/.test(badgeCol.札の背景), badgeCol);

console.log('\n' + '='.repeat(50));
console.log(`  結果： ${pass} OK / ${fail} NG`);
if (errs.length) { console.log('  ⚠ 画面のエラー:'); errs.slice(0, 8).forEach(e => console.log('    - ' + e)); }
console.log('='.repeat(50));
await b.close();
process.exit(fail ? 1 : 0);
