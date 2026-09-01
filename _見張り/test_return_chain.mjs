/* PitFlow v1.65.0 ── 返車日の3段チェーン（概算A → 予定B → 確定C）と「返車の一覧に出るか」
   -------------------------------------------------------------------
   ◎ゆうた確定（2026-08-07）
     ・待・当のバッジが付いている車 → 完TEL関門に関係なく **入庫日** に返車として出す。
       ただし **入庫前には出さない**（その日になったら自動で入る）
     ・それ以外の預かり → **完TEL関門を通った確定日（C）** でだけ返車に出す
     ・タスクボードで入れた日付（B）は「予定・約束」。**売上の見込みには使うが、返車カレンダーには使わない**
     ・クイック受注も同じ。待・当は出る／預かりは飛ばしても完TELまで出ない
     ・待・当でも「やっぱり明日取りに行くわ」があるので、**C を入れ直せばその日付で動く**
     ・返車時間は **C にだけ**付く。時間が無い車は「終日」で**最後尾**、C＋時間が入ったら並び替える
   ◎売上（ゆうた確定）
     ・実績＝実績カウント日／予定で月内に入るかは **B**（完TEL済なら C のほうが確かなので C→B→A）
   ◎使い方（PitFlow のフォルダで）
     python3 -m http.server 8989      ← 別ウィンドウ
     node test_return_chain.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8989;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitReturnListDate && window.pitReturnDates && window.pitDropIsSameDay', null, { timeout: 25000 });
await p.waitForTimeout(700);

const W = await p.evaluate(() => {
  const pad = n => (n < 10 ? '0' : '') + n;
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const y = t.getFullYear(), m = t.getMonth(), dd = t.getDate();
  return { today: ymd(t), tomorrow: ymd(new Date(y, m, dd + 1)), yesterday: ymd(new Date(y, m, dd - 1)) };
});

/* 1台だけ差し込んで聞く */
const ask = card => p.evaluate(c => ({
  sameDay: pitDropIsSameDay(c),
  dates: pitReturnDates(c),
  listDate: pitReturnListDate(c),
  allDay: pitReturnAllDay(c),
  sales: pitSalesCountDate(c)
}), card);

const base = { id: 'RC', resNo: 'R-RC', customer: '返車 太郎', car: 'アクア', boardId: 'default', division: 'div1', workType: 'oil', workTypes: ['oil'], estHoldDays: 0 };

console.log('\n── 🅰🅱🅲 3段チェーンの中身 ──');
{
  const a = await ask({ ...base, status: 'reserved', dropType: 'drop', reserveDate: W.today, estHoldDays: 3 });
  ok('A＝入庫日＋概算 預かり日数（自動計算）', a.dates.a > W.today && a.dates.b === '' && a.dates.c === '', a.dates);

  const bb = await ask({ ...base, status: 'parts', dropType: 'drop', reserveDate: W.today, returnDatePlan: W.tomorrow });
  ok('B＝受注のときに入れた約束の日', bb.dates.b === W.tomorrow && bb.dates.c === '', bb.dates);

  const cc = await ask({ ...base, status: 'workDone', dropType: 'drop', reserveDate: W.today, returnStage: 'returnWait', returnDate: W.tomorrow });
  ok('C＝完TELを通ったときの確定返車日', cc.dates.c === W.tomorrow, cc.dates);

  const old = await ask({ ...base, status: 'parts', dropType: 'drop', reserveDate: W.today, returnDate: W.tomorrow });
  ok('🔴 旧データの吸収＝盤面にいる車の日付は B とみなす（C にしない）', old.dates.b === W.tomorrow && old.dates.c === '', old.dates);
}

console.log('\n── 🚗 待ち・当日返しは、入庫日に自動で出る ──');
{
  const w = await ask({ ...base, status: 'check', dropType: 'wait', reserveDate: W.today });
  ok('待ち＝完TEL前でも今日の返車に出る', w.listDate === W.today, w);

  const s = await ask({ ...base, status: 'work', dropType: 'sameDay', reserveDate: W.today });
  ok('当日返し＝同じく出る', s.listDate === W.today, s);

  const fut = await ask({ ...base, status: 'reserved', dropType: 'wait', reserveDate: W.tomorrow });
  ok('🔴 入庫前（明日入庫）は出さない', fut.listDate === '', fut);

  const past = await ask({ ...base, status: 'check', dropType: 'wait', reserveDate: W.yesterday });
  ok('昨日入庫でまだ返していなければ、その日のまま残る', past.listDate === W.yesterday, past);

  const both = await ask({ ...base, status: 'check', dropType: 'wait', dropType2: 'drop', reserveDate: W.today });
  ok('🔴 「待or預」の2つ付きも出す（取りこぼさない側に倒す）', both.sameDay === true && both.listDate === W.today, both);

  const moved = await ask({ ...base, status: 'work', dropType: 'wait', reserveDate: W.today, returnDate: W.tomorrow });
  ok('🔴 「やっぱり明日取りに行くわ」＝C を入れたらその日付で動く', moved.listDate === W.tomorrow, moved);
}

console.log('\n── 📦 預かりは完TEL関門を通るまで出さない ──');
{
  const plan = await ask({ ...base, status: 'parts', dropType: 'drop', reserveDate: W.today, returnDatePlan: W.today });
  ok('🔴 約束の日（B）が今日でも、完TEL前なら返車には出さない', plan.listDate === '', plan);

  const done = await ask({ ...base, status: 'workDone', dropType: 'drop', reserveDate: W.yesterday, returnStage: 'returnWait', returnDate: W.today });
  ok('完TELを通ったら、その確定日で出る', done.listDate === W.today, done);

  const callWait = await ask({ ...base, status: 'workDone', dropType: 'drop', returnStage: 'callWait' });
  ok('完TEL依頼（日付まだ）は返車カレンダーには出ない（未定タブに残る）', callWait.listDate === '', callWait);

  const ret = await ask({ ...base, status: 'returned', dropType: 'drop', returnStage: 'returnWait', returnDate: W.today, completedAt: W.today });
  ok('返車済みは一覧から消える', ret.listDate === '', ret);
}

console.log('\n── ⏰ 終日と並び順（返車時間は C にだけ付く） ──');
{
  const w = await ask({ ...base, status: 'check', dropType: 'wait', reserveDate: W.today, reserveTime: '09:00' });
  ok('🔴 待ちの車は入庫時刻があっても「終日」（入庫時刻で代用しない）', w.allDay === true, w);

  const t = await ask({ ...base, status: 'workDone', dropType: 'drop', returnStage: 'returnWait', returnDate: W.today, returnTime: '14:00' });
  ok('確定返車日＋時間が入ったら終日ではなくなる', t.allDay === false, t);

  const order = await p.evaluate(([W]) => {
    const mk = (id, x) => Object.assign({ id, resNo: 'R-' + id, customer: id, car: 'x', boardId: 'default', division: 'div1', workType: 'oil', workTypes: ['oil'] }, x);
    const list = [
      mk('L1', { status: 'check', dropType: 'wait', reserveDate: W.today, reserveTime: '09:00' }),
      mk('L2', { status: 'workDone', dropType: 'drop', returnStage: 'returnWait', returnDate: W.today, returnTime: '16:00' }),
      mk('L3', { status: 'workDone', dropType: 'drop', returnStage: 'returnWait', returnDate: W.today, returnTime: '10:00' })
    ];
    return list.slice().sort((a, b) => pitReturnSortMin(a) - pitReturnSortMin(b)).map(c => c.id);
  }, [W]);
  ok('🔴 時間のある車が先、終日が最後尾', JSON.stringify(order) === JSON.stringify(['L3', 'L2', 'L1']), order);
}

console.log('\n── 💴 売上は C → B → A の順で見る ──');
{
  const a = await ask({ ...base, status: 'reserved', dropType: 'drop', reserveDate: W.today, estHoldDays: 1 });
  ok('まだ何も無ければ A（概算）で月を決める', a.sales === a.dates.a && a.sales === W.tomorrow, a);

  const bb = await ask({ ...base, status: 'parts', dropType: 'drop', reserveDate: W.today, estHoldDays: 1, returnDatePlan: W.yesterday });
  ok('🔴 B（約束）があれば B を見る', bb.sales === W.yesterday, bb);

  const cc = await ask({ ...base, status: 'workDone', dropType: 'drop', reserveDate: W.today, returnDatePlan: W.tomorrow, returnStage: 'returnWait', returnDate: W.yesterday });
  ok('🔴 C（確定）があれば C を優先', cc.sales === W.yesterday, cc);

  const ret = await ask({ ...base, status: 'returned', completedAt: W.yesterday, returnDate: W.today });
  ok('実績は実績カウント日のまま', ret.sales === W.yesterday, ret);

  ok('🔴 預かりの約束（B）は売上には効くが、返車には出ない（意味が分かれている）',
     (await ask({ ...base, status: 'parts', dropType: 'drop', reserveDate: W.today, returnDatePlan: W.today })).sales === W.today);
}

console.log('\n── 🖼 画面が揃っているか（セルとポップアップの食い違いを潰す） ──');
{
  const r = await p.evaluate(([W]) => {
    const mk = (id, x) => Object.assign({ id, resNo: 'R-' + id, customer: id, car: 'x', boardId: 'default', division: 'div1', workType: 'oil', workTypes: ['oil'] }, x);
    state.cards = [
      mk('V1', { status: 'workDone', dropType: 'drop', returnStage: 'returnWait', returnDate: W.today, returnTime: '10:00' }),
      mk('V2', { status: 'parts', dropType: 'drop', reserveDate: W.today, returnDatePlan: W.today }),   // 完TEL前の預かり＝出ない
      mk('V3', { status: 'check', dropType: 'wait', reserveDate: W.today, reserveTime: '09:00' })       // 待ち＝出る（終日）
    ];
    const out = {};
    /* 返車ビュー：当日 */
    state.returnRange = 'day'; state.returnDate = new Date();
    showView('return'); renderReturn();
    const dayEl = document.getElementById('return-day-list');
    out.dayTxt = dayEl ? dayEl.innerText.replace(/\n+/g, ' | ') : '';
    out.dayIds = dayEl ? [...dayEl.querySelectorAll('[data-card-id]')].map(e => e.dataset.cardId) : [];
    /* ⚠ 「月」タブは日付リスト型。クリックで全件ポップアップが出る**カレンダーのマス**は「2ヶ月」タブのほう。
       月リストのほうも同じ物差しで拾えているかを別に見る。 */
    state.returnRange = 'month'; renderReturn();
    const ml = document.getElementById('return-month');
    out.monthListIds = ml ? [...ml.querySelectorAll('[data-card-id]')].map(e => e.dataset.cardId) : [];
    state.returnRange = '2month'; renderReturn();
    const cell = [...document.querySelectorAll('#return-2month .reserve-month-cell')].filter(e => /pitReserveDayPopup/.test(e.getAttribute('onclick') || ''));
    out.cellIds = [];
    cell.forEach(e => { if ((e.getAttribute('onclick') || '').indexOf(W.today) >= 0) out.cellIds = [...e.querySelectorAll('[data-card-id]')].map(x => x.dataset.cardId); });
    pitReserveDayPopup(W.today, 'return');
    out.popIds = [...document.querySelectorAll('#pit-day-pop [data-card-id]')].map(e => e.dataset.cardId);
    if (window.pitReserveDayPopClose) pitReserveDayPopClose();
    /* 当日ビュー */
    state.todayDate = new Date();
    showView('today'); renderToday();
    const tv = document.getElementById('view-today-body') || document.body;
    out.todayTxt = tv.innerText.replace(/\n+/g, ' | ');
    return out;
  }, [W]);
  ok('返車ビュー（当日）に完TEL済と待ちが出る', r.dayIds.includes('V1') && r.dayIds.includes('V3'), r.dayIds);
  ok('🔴 完TEL前の預かりは返車ビューに出ない', !r.dayIds.includes('V2'), r.dayIds);
  ok('🔴 「終日」の枠が出る', /終日/.test(r.dayTxt), r.dayTxt.slice(0, 300));
  ok('🔴 2ヶ月ビューのマスとクリックのポップアップの中身が一致する（前は1件対3件でズレていた）',
     r.cellIds.length > 0 && JSON.stringify(r.cellIds.slice().sort()) === JSON.stringify(r.popIds.slice().sort()), { cell: r.cellIds, pop: r.popIds });
  ok('月リストも同じ物差しで拾う（完TEL前の預かりは入らない）', !r.monthListIds.includes('V2'), r.monthListIds);
  ok('ポップアップにも完TEL前の預かりは入らない', !r.popIds.includes('V2'), r.popIds);
  ok('当日ビューにも待ちの車が返車として出る', /V3/.test(r.todayTxt), r.todayTxt.slice(0, 400));
}

console.log('\n── 📥 入れ口が正しい欄に書いているか ──');
{
  const orderPop = await p.evaluate(() => {
    state.cards = [{ id: 'PB', resNo: 'R-PB', customer: 'b', car: 'x', boardId: 'default', division: 'div1',
      workType: 'shaken', workTypes: ['shaken'], status: 'contact', dropType: 'drop', reserveDate: '2026-08-01', estAmount: 70000 }];
    const c = state.cards[0];
    PitPhasePopup.maybeIntercept(c, 'contact', 'parts', function(){ c.status = 'parts'; });
    document.getElementById('pp-ret').value = '2026-09-15';
    PitPhasePopup.close(true);
    return { plan: c.returnDatePlan, date: c.returnDate, fin: c.returnDateFinal, listDate: pitReturnListDate(c), sales: pitSalesCountDate(c) };
  });
  ok('🔴 受注完了で入れた日は B（返車予定日）に入る', orderPop.plan === '2026-09-15', orderPop);
  ok('🔴 C（確定返車日）には入れない＝返車カレンダーには出ない', !orderPop.date && orderPop.listDate === '', orderPop);
  ok('売上の見込みには効く（9月に振り分けられる）', orderPop.sales === '2026-09-15', orderPop);

  const quick = await p.evaluate(() => {
    state.cards = [{ id: 'QB', resNo: 'R-QB', customer: 'q', car: 'x', boardId: 'default', division: 'div1',
      workType: 'oil', workTypes: ['oil'], status: 'check', dropType: 'drop', estAmount: 5000 }];
    const c = state.cards[0];
    PitPhasePopup.maybeIntercept(c, 'check', 'workDone', function(){ c.status = 'workDone'; });
    PitPhasePopup.close(true);
    return { plan: c.returnDatePlan, date: c.returnDate, listDate: pitReturnListDate(c) };
  });
  ok('🔴 クイック受注の日も B に入る', !!quick.plan && !quick.date, quick);
  ok('🔴 預かりはクイックで飛ばしても返車カレンダーに出ない', quick.listDate === '', quick);

  /* 当日ビューの「日時変更」＝C を入れる（唯一の入口を通る） */
  const editDt = await p.evaluate(([W]) => {
    state.cards = [{ id: 'ED', resNo: 'R-ED', customer: 'e', car: 'x', boardId: 'default', division: 'div1',
      workType: 'oil', workTypes: ['oil'], status: 'work', dropType: 'wait', reserveDate: W.today, reserveTime: '09:00' }];
    const c = state.cards[0];
    state.todayDate = new Date(); showView('today'); renderToday();
    pitTodayTap('ED', true);
    pitTodayEditDt('ED', true);
    document.getElementById('ta-dt-d').value = W.tomorrow;
    document.getElementById('ta-dt-t').value = '15:00';
    pitTodaySaveDt('ED', true);
    return { date: c.returnDate, time: c.returnTime, stage: c.returnStage || '', listDate: pitReturnListDate(c), fin: c.returnDateFinal || '' };
  }, [W]);
  ok('🔴 当日ビューの「日時変更」は C（確定返車日）を書く', editDt.date === W.tomorrow && editDt.time === '15:00', editDt);
  ok('🔴 待ちの車は日付を入れても完TEL済にされない（盤面から消えない）', editDt.stage === '', editDt);
  ok('その日付で返車カレンダーに移る', editDt.listDate === W.tomorrow, editDt);
}

console.log('\n── 🃏 カード詳細の確定返車日まわり（v1.66.0） ──');
{
  const mk = (id, x) => Object.assign({ id, resNo: 'R-' + id, customer: '山田', car: 'アクア', boardId: 'default',
    division: 'div1', workType: 'oil', workTypes: ['oil'], dropType: 'drop' }, x);

  /* ① 作業完了に入る前は、確定返車日（C）の欄そのものを出さない */
  const before = await p.evaluate(([W, mkS]) => {
    const mk = eval('(' + mkS + ')');
    state.cards = [mk('CV1', { status: 'work', reserveDate: W.today, returnDatePlan: W.today })];
    openDetail('CV1');
    return {
      date: !!document.getElementById('cv-retdate'),
      tbd: !!document.getElementById('cv-rettbd'),
      guide: !!document.querySelector('#cv-time-slot .cf-time'),
      /* チェーン（概算→予定→確定）は出たまま＝進み具合は見える */
      chain: !!document.querySelector('.cv-dchain')
    };
  }, [W, mk.toString()]);
  ok('🔴 作業待ちでは確定返車日の欄を出さない', before.date === false && before.tbd === false && before.guide === false, before);
  ok('チェーン（概算→予定→確定）は出たまま＝進み具合は見える', before.chain === true, before);

  /* ② 作業完了に入ったら出る＋返車時間はショートカット付き */
  const after = await p.evaluate(([W, mkS]) => {
    const mk = eval('(' + mkS + ')');
    state.cards = [mk('CV2', { status: 'workDone', returnStage: 'returnWait', reserveDate: W.today, returnDate: W.today, returnTime: '14:00' })];
    openDetail('CV2');
    return {
      date: !!document.getElementById('cv-retdate'),
      tbd: !!document.getElementById('cv-rettbd'),
      guide: !!document.querySelector('#cv-time-slot .cf-time'),
      picker: !!document.querySelector('#cv-time-slot .cf-time-pick'),
      chips: [...document.querySelectorAll('#cv-time-slot .cf-time-quick .cf-chip')].map(x => x.textContent),
      mainVal: (document.querySelector('#cv-time-slot .cf-time-main') || {}).value
    };
  }, [W, mk.toString()]);
  ok('作業完了に入ったら確定返車日の欄が出る', after.date === true, after);
  ok('🔴 返車時間に入力ガイド（打ち込み＋ピッカー＋ショートカット）が付いている', after.guide && after.picker, after);
  ok('🔴 AM・PM などのショートカットが並ぶ', after.chips.includes('AM') && after.chips.includes('PM') && after.chips.includes('未定'), after.chips);
  ok('返車のショートカットは9つ（予約の「鍵ポスト」ではなく「勝手に取る」が入る）',
     after.chips.length === 9 && after.chips.includes('勝手に取る') && !after.chips.includes('鍵ポスト'), after.chips);
  ok('いま入っている時間が枠に出ている', after.mainVal === '14:00', after);

  /* ③ ショートカットを押すと返車時間が入る（＝行き先も動く） */
  const chip = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('#cv-time-slot .cf-time-quick .cf-chip')];
    const t = btns.find(x => x.textContent === '未定'); t.click();
    const c = state.cards[0];
    return { time: c.returnTime, place: pitReturnPlace(c) };
  });
  ok('🔴 ショートカットを押すと返車時間に入り、行き先も「返車時間未定」へ動く', chip.time === '未定' && chip.place === 'timeTbd', chip);

  /* ④ 返車日未定のチェック */
  const tbd = await p.evaluate(() => {
    cvReturnDateTbd(true);
    const c = state.cards[0];
    return { date: c.returnDate, fin: c.returnDateFinal, place: pitReturnPlace(c),
             disabled: (document.getElementById('cv-retdate') || {}).disabled,
             checked: (document.getElementById('cv-rettbd') || {}).checked };
  });
  ok('🔴 「返車日未定」を入れると日付が空になり「返車日未定」へ動く', tbd.date === '' && tbd.place === 'dateTbd', tbd);
  ok('チェック中は日付欄が触れない（入れ違いを防ぐ）', tbd.disabled === true && tbd.checked === true, tbd);

  /* ⑤ 日付を入れ直したら返車カレンダーへ戻る（前は位置が動かなかった） */
  const back = await p.evaluate(([W]) => {
    cvSetReturn(W.tomorrow);
    const c = state.cards[0];
    return { date: c.returnDate, fin: c.returnDateFinal, place: pitReturnPlace(c), listDate: pitReturnListDate(c) };
  }, [W]);
  ok('🔴 確定返車日を直したら返車カレンダー上の位置も動く', back.date === W.tomorrow && back.listDate === W.tomorrow, back);
  ok('確定返車日の控えも一緒に揃う', back.fin === W.tomorrow, back);
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  await p.evaluate(() => { state.cards = []; });
  for (const v of ['return', 'today', 'mydash', 'sales', 'reserve', 'course1']) {
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(120);
  }
  await p.evaluate(() => { state.returnRange = 'tbd'; showView('return'); renderReturn(); });
  await p.waitForTimeout(150);
  await p.evaluate(() => { state.returnRange = 'week'; renderReturn(); state.returnRange = '2month'; renderReturn(); });
  await p.waitForTimeout(150);
  ok('返車の全レンジ・当日・ダッシュボード・売上・予約・課ボードを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.65.0 以降', vn[0] > 1 || (vn[0] === 1 && vn[1] >= 65), ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
