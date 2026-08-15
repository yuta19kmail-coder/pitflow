/* PitFlow v1.101.0 ── 当日を過ぎたものの自動移動 ／ 未入庫カードの⋮メニュー ／ 予約キャンセル
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-15）
     「当日を過ぎた時点で入庫が完了していない車両に関しては、予約→未定の未入庫のエリアに自動で移動する。
       返車が完了してない車両に関しては全て日付未定にし、返車→未定の返車日未定エリアに自動で移動する。
       未入庫車両の詳細の…のメニュー制御＝
         仮予約にする／承認予約にする／入庫中にする／予約キャンセルにする／消去する
       で新しいところで予約キャンセル。
       これは顧客情報の来店履歴にキャンセルの旨を記載し、アーカイブとして残す」

   ◎ゆうたに確かめた決めごと
     🔴 自動で動かすのは**本予約だけ**（仮予約・承認待ちは動かさない）
     🔴 自動の「未入庫」と、人が押す「予約キャンセル」は**別物**
        （未入庫＝1ヶ月で自動アーカイブ・来店履歴に出さない／キャンセル＝すぐアーカイブ・来店履歴に残す）
     🔴 返車は**待ち・当日返しの車も対象**（盤面には残したまま「返車日未定」に出す）
     🔴 予約キャンセルは**理由を1行聞く**（任意）

   ◎使い方
     python3 -m http.server 8935      ← 別ウィンドウ
     node test_overdue.mjs                                              */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8935;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.openDetail && window.pitAutoOverdue && window.pitReturnPlace', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

/* カードを並べて自動移動を1回まわす */
const runWith = list => p.evaluate(arr => {
  const pad = n => (n < 10 ? '0' : '') + n;
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const day = n => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + n); return ymd(d); };
  state.cards = arr.map((o, i) => Object.assign({
    id: 'OD' + i, resNo: 'R-' + i, customer: '期限 太郎' + i, kana: 'キゲン タロウ', car: 'ノート',
    boardId: 'default', division: 'div1', workType: 'general', dropType: 'drop',
    status: 'reserved', reserveTime: '10:00', log: []
  }, o, {
    reserveDate: (o._rd != null ? day(o._rd) : day(-3)),
    returnDate:  (o._retd != null ? day(o._retd) : (o.returnDate || ''))
  }));
  state.cards.forEach(c => { delete c._rd; delete c._retd; });
  const moved = pitAutoOverdue();
  return {
    moved,
    cards: state.cards.map(c => ({
      id: c.id, status: c.status, noShow: !!c.noShow, cancelled: !!c.cancelled,
      cancelledAt: c.cancelledAt || '', returnDate: c.returnDate || '',
      returnDateFinal: c.returnDateFinal, returnStage: c.returnStage || null,
      tentative: !!c.tentative, approvalPending: !!c.approvalPending,
      place: window.pitReturnPlace ? pitReturnPlace(c) : null,
      logLast: (function (e) { return (e && (e.label || e.text)) || ''; })((c.log || [])[(c.log || []).length - 1])
    }))
  };
}, list);

console.log('\n── 🚪 入庫日を過ぎた本予約は「未入庫」へ ──');
{
  const r = await runWith([
    { _rd: -3 },                                    /* 0 ふつうの本予約・3日前 */
    { _rd: 0 },                                     /* 1 今日＝まだ動かさない */
    { _rd: 2 },                                     /* 2 未来 */
    { _rd: -3, tentative: true },                   /* 3 仮予約 */
    { _rd: -3, approvalPending: true },             /* 4 承認待ち */
    { _rd: -3, intakeTbd: true },                   /* 5 入庫日未定 */
    { _rd: -3, status: 'check' }                    /* 6 もう入庫している */
  ]);
  const C = r.cards;
  ok('🔴 過ぎた本予約は未入庫（cancelled）へ', C[0].status === 'cancelled' && C[0].noShow === true, C[0]);
  ok('🔴 それは「予約キャンセル」ではない（別物）', C[0].cancelled === false, C[0]);
  ok('1ヶ月の数えはじめが入る', /^\d{4}-\d{2}-\d{2}$/.test(C[0].cancelledAt), C[0].cancelledAt);
  ok('なぜ動いたかフローに残る', /未入庫/.test(C[0].logLast), C[0].logLast);
  ok('🔴 今日の予約は動かさない', C[1].status === 'reserved', C[1]);
  ok('🔴 未来の予約は動かさない', C[2].status === 'reserved', C[2]);
  ok('🔴 仮予約は動かさない（ゆうた指定）', C[3].status === 'reserved' && C[3].tentative, C[3]);
  ok('🔴 承認待ちは動かさない（承認され忘れに気づけなくなるため）', C[4].status === 'reserved' && C[4].approvalPending, C[4]);
  ok('入庫日未定は動かさない（過ぎようがない）', C[5].status === 'reserved', C[5]);
  ok('もう入庫している車は触らない', C[6].status === 'check', C[6]);
  ok('動かした数を返す', r.moved === 1, r.moved);
}

console.log('\n── 📤 返車予定日を過ぎた車は「返車日未定」へ ──');
{
  const r = await runWith([
    { status: 'workDone', returnStage: 'returnWait', _retd: -2, returnTime: '15:00', returnDateFinal: 'x' },
    { status: 'workDone', returnStage: 'returnWait', _retd: 0,  returnTime: '15:00' },
    { status: 'workDone', returnStage: 'returnWait', _retd: 3 },
    { status: 'workDone', returnStage: 'callWait',   _retd: -2 },     /* 完TEL待ちでも日付が過ぎていれば */
    { status: 'returned', returnStage: 'returnWait', _retd: -2, completedAt: '2026-01-01' }
  ]);
  const C = r.cards;
  ok('🔴 過ぎた返車は日付が空になる', C[0].returnDate === '' , C[0]);
  ok('🔴 時間も確定返車日も外れる', C[0].returnDateFinal == null, C[0]);
  ok('🔴 「返車日未定」に落ちる', C[0].place === 'dateTbd', C[0]);
  ok('なぜ動いたかフローに残る', /返車日未定/.test(C[0].logLast), C[0].logLast);
  ok('🔴 今日の返車は動かさない', C[1].returnDate !== '', C[1]);
  ok('🔴 先の返車は動かさない', C[2].returnDate !== '', C[2]);
  /* ⚠ 完TEL待ちの車は、過ぎた日付を空にはするが**箱は「完TEL待ち」のまま**。
     まだ完TELをしていないのだから、そこが正しい場所（v1.60.0 の振り分けを崩さない）。 */
  ok('完TEL待ちの車は、過ぎた日付だけ空にする', C[3].returnDate === '', C[3]);
  ok('🔴 完TEL待ちの箱からは動かさない（まだ電話していないので）', C[3].place === 'callWait', C[3]);
  ok('🔴 もう返した車（実績）は触らない', C[4].returnDate !== '', C[4]);
}

console.log('\n── 🚗 待ち・当日返しの車も「返車日未定」に出す（盤面には残す） ──');
{
  const r = await runWith([
    { status: 'work', dropType: 'sameDay', _rd: -2 },              /* 入庫日に返るはずが過ぎた */
    { status: 'work', dropType: 'wait',    _rd: 0 },               /* 今日＝まだ */
    { status: 'reserved', dropType: 'sameDay', _rd: -2, tentative: true }  /* まだ入庫していない仮予約 */
  ]);
  const C = r.cards;
  ok('🔴 当日返しで日が過ぎた車は「返車日未定」に出る', C[0].place === 'dateTbd', C[0]);
  ok('🔴 盤面からは外さない（作業は続いている）', C[0].status === 'work', C[0]);
  ok('🔴 入庫日は書き換えない（本当に入庫した日だから）', C[0].returnDate === '', C[0]);
  ok('今日の待ちの車はまだ出さない', C[1].place !== 'dateTbd', C[1]);
  ok('まだ入庫していない車はここでは拾わない（入庫側の話）', C[2].place !== 'dateTbd', C[2]);
}

console.log('\n── ⋮ まだ入庫していない車のメニュー＝5つ ──');
const openResv = over => p.evaluate(o => {
  const pad = n => (n < 10 ? '0' : '') + n;
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const t = new Date(); t.setDate(t.getDate() + 2);
  state.cards = [Object.assign({
    id: 'RV1', resNo: 'R-RV1', customer: 'キャン 太郎', kana: 'キャン タロウ', car: 'ノート',
    plate: '品川 500 さ 7788', boardId: 'default', division: 'div1', workType: 'general',
    dropType: 'drop', status: 'reserved', reserveDate: ymd(t), reserveTime: '10:00',
    customerId: 'cuRV', log: []
  }, o || {})];
  state.customers = [{ id: 'cuRV', name: 'キャン 太郎', kana: 'キャン タロウ', contacts: [],
                       vehicles: [{ id: 'vRV', plate: '品川 500 さ 7788', maker: '日産', car: 'ノート' }] }];
  openDetail('RV1');
  const m = document.getElementById('cv-optmenu');
  return m ? m.innerHTML : '(メニューが無い)';
}, over || null);
{
  const m = await openResv();
  ok('🔴 仮予約にする がある', /仮予約にする/.test(m), '');
  ok('🔴 承認予約にする がある', /承認予約にする/.test(m), '');
  ok('🔴 入庫中にする がある', /入庫中にする/.test(m), '');
  ok('🔴 予約キャンセルにする がある', /予約キャンセルにする/.test(m), '');
  ok('🔴 消去する がある', /消去する/.test(m), '');
  ok('🔴 ボタンはちょうど5つ', (m.match(/<button/g) || []).length === 5, (m.match(/<button/g) || []).length);
  ok('フェーズ移動は無いまま', !/cvMovePhase|フェーズ移動/.test(m), '');
  ok('売上なしでアーカイブは出さない（まだ来ていない）', !/売上なしでアーカイブ/.test(m), '');

  const m2 = await openResv({ approvalPending: true });
  ok('🔴 もう承認待ちの車には「承認予約にする」を出さない', !/承認予約にする/.test(m2), '');
  ok('その時は4つ', (m2.match(/<button/g) || []).length === 4, (m2.match(/<button/g) || []).length);
}

console.log('\n── 🛡 承認予約にする ──');
{
  await openResv({ tentative: true });
  const r = await p.evaluate(async () => {
    window.cvToApproval();
    await new Promise(r => setTimeout(r, 120));
    const btn = [].find.call(document.querySelectorAll('#uid-card .uid-b button'), b => /承認予約にする/.test(b.textContent));
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 200));
    const c = state.cards[0];
    return { ap: !!c.approvalPending, tent: !!c.tentative,
             logLast: (function (e) { return (e && (e.label || e.text)) || ''; })((c.log || [])[(c.log || []).length - 1]) };
  });
  ok('🔴 承認待ちの印が付く', r.ap === true, r);
  ok('🔴 仮予約は下りる（仮と承は同時に立てない）', r.tent === false, r);
  ok('フローに残る', /承認予約/.test(r.logLast), r.logLast);
}

console.log('\n── 🚫 予約キャンセルにする ──');
{
  await openResv();
  const r = await p.evaluate(async () => {
    window.cvAskCancelResv();
    await new Promise(r => setTimeout(r, 150));
    const inp = document.querySelector('#uid-card input[type=text], #uid-card textarea');
    if (inp) { inp.value = '日程変更のため'; }
    const btn = [].find.call(document.querySelectorAll('#uid-card .uid-b button'), b => /予約をキャンセルする/.test(b.textContent));
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 250));
    const c = state.cards[0];
    return {
      status: c.status, cancelled: !!c.cancelled, noShow: !!c.noShow, archived: !!c.archived,
      reason: c.cancelReason || '', at: c.cancelledAt || '', by: c.cancelledBy,
      tier: window.pitSalesTier ? window.pitSalesTier(c) : 'x',
      logLast: (function (e) { return (e && (e.label || e.text)) || ''; })((c.log || [])[(c.log || []).length - 1])
    };
  });
  ok('🔴 キャンセルになる', r.status === 'cancelled' && r.cancelled === true, r);
  ok('🔴 自動の未入庫の印は付かない（別物）', r.noShow === false, r);
  ok('🔴 すぐアーカイブされる（未入庫BOXで待たない）', r.archived === true, r);
  ok('🔴 理由が残る', r.reason === '日程変更のため', r.reason);
  ok('キャンセルした日が残る', /^\d{4}-\d{2}-\d{2}$/.test(r.at), r.at);
  ok('🔴 売上・実績には乗らない', r.tier === null, r.tier);
  ok('フローに理由つきで残る', /キャンセル/.test(r.logLast) && /日程変更/.test(r.logLast), r.logLast);
}

console.log('\n── 👤 来店履歴に「キャンセル」で残る ──');
{
  const r = await p.evaluate(() => {
    custOpen('cuRV');
    const hist = document.querySelector('.cd-hist');
    const stats = [].map.call(document.querySelectorAll('.cd-stat'), e => e.textContent.trim());
    return {
      html: hist ? hist.innerHTML : '(来店履歴が無い)',
      stats,
      total: (document.querySelector('.cd-total') || {}).textContent || ''
    };
  });
  ok('🔴 来店履歴に1件出る', /cd-hrow/.test(r.html), r.html.slice(0, 160));
  ok('🔴 「キャンセル」と書いてある', /キャンセル/.test(r.html), '');
  ok('🔴 理由も出る', /日程変更のため/.test(r.html), '');
  ok('🔴 実績カレンダーへ飛ぶボタンにしない', !/pitGotoResultMonth/.test(r.html), '');
  ok('🔴 「来店回数」には数えない（来ていないので）', /0/.test(r.stats.find(s => /来店回数/.test(s)) || ''), r.stats);
  ok('🔴 合計金額にも入れない', /¥0/.test(r.total), r.total);
  await p.evaluate(() => { if (window.custCloseModal) custCloseModal(); });
}

console.log('\n── 📦 未入庫（自動）は来店履歴に出さない ──');
{
  const r = await p.evaluate(() => {
    const c = state.cards[0];
    c.cancelled = false; c.noShow = true; c.archived = false; delete c.cancelReason;
    custOpen('cuRV');
    const hist = document.querySelector('.cd-hist');
    const empty = document.querySelector('.cd-empty');
    return { hasRow: !!(hist && /cd-hrow/.test(hist.innerHTML)), empty: !!empty };
  });
  ok('🔴 未入庫の車は来店履歴に出さない（別物・ゆうた確定）', r.hasRow === false, r);
  await p.evaluate(() => { if (window.custCloseModal) custCloseModal(); });
}

console.log('\n── ↩ 未入庫の「予約に戻す」＝入庫日を選ばせる（v1.101.1） ──');
const seedNoShow = () => p.evaluate(() => {
  const pad = n => (n < 10 ? '0' : '') + n;
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const day = n => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + n); return ymd(d); };
  state.cards = [{ id: 'B1', resNo: 'Y00001', customer: '戻し 太郎', car: 'ノート', plate: '品川 300 あ 1',
    boardId: 'default', workType: 'general', dropType: 'drop',
    status: 'cancelled', noShow: true, noShowAt: day(-5), cancelledAt: day(-5), reserveDate: day(-5), log: [] }];
  showView('reserve');
  pitUndRestore('B1');
  const sheet = document.querySelector('#pit-und-restore .ta-sheet');
  return {
    today: day(0), past: day(-5),
    open: !!(document.getElementById('pit-und-restore') || {}).classList
          && document.getElementById('pit-und-restore').classList.contains('show'),
    html: sheet ? sheet.innerHTML : '(窓が出ない)',
    dateVal: (document.getElementById('und-rs-date') || {}).value || '',
    dateMin: (document.getElementById('und-rs-date') || {}).min || '',
    stillNoShow: state.cards[0].status === 'cancelled'
  };
});
{
  const r = await seedNoShow();
  ok('🔴 押しただけでは戻らない（窓が出る）', r.open === true && r.stillNoShow === true, r.open);
  ok('🔴 「今日の入庫予定にする」がある', /今日（.+）の入庫予定にする/.test(r.html), '');
  ok('🔴 日付を選ぶピッカーがある', /type="date"/.test(r.html), '');
  ok('🔴 「この日の入庫予定にする」がある', /この日の入庫予定にする/.test(r.html), '');
  ok('🔴 過ぎた日は選ばせない（min＝今日）', r.dateMin === r.today, r);
  ok('ピッカーの初期値は今日', r.dateVal === r.today, r);
  ok('元の入庫予定も見せる', /元の入庫予定/.test(r.html), '');
  ok('やめる がある', /やめる/.test(r.html), '');
}
{
  /* ① 今日にする */
  await seedNoShow();
  const r = await p.evaluate(() => {
    document.querySelector('#pit-und-restore .ta-btn.primary').click();
    const c = state.cards[0];
    const pad = n => (n < 10 ? '0' : '') + n;
    const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    return { st: c.status, rd: c.reserveDate, tbd: !!c.intakeTbd, noShow: !!c.noShow,
             today: ymd(new Date()), moved: pitAutoOverdue(),
             open: document.getElementById('pit-und-restore').classList.contains('show'),
             logLast: (function (e) { return (e && (e.label || e.text)) || ''; })((c.log || [])[(c.log || []).length - 1]) };
  });
  ok('🔴 今日の予約に戻る', r.st === 'reserved' && r.rd === r.today, r);
  ok('🔴 未定にはしない（日付が決まっているので）', r.tbd === false, r);
  ok('🔴 自動で付いた未入庫の印は外れる', r.noShow === false, r);
  ok('🔴 もう一度自動移動しても未入庫に落ちない', r.moved === 0 && r.st === 'reserved', r);
  ok('窓は閉じる', r.open === false, r.open);
  ok('入庫日つきでフローに残る', /予約に復帰/.test(r.logLast) && /\d{4}-\d{2}-\d{2}/.test(r.logLast), r.logLast);
}
{
  /* ② 日付を選ぶ */
  await seedNoShow();
  const r = await p.evaluate(() => {
    const pad = n => (n < 10 ? '0' : '') + n;
    const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + 6);
    const want = ymd(d);
    document.getElementById('und-rs-date').value = want;
    [].find.call(document.querySelectorAll('#pit-und-restore .ta-btn'), b => /この日の入庫予定にする/.test(b.textContent)).click();
    const c = state.cards[0];
    return { want, st: c.status, rd: c.reserveDate, tbd: !!c.intakeTbd };
  });
  ok('🔴 選んだ日の予約に戻る', r.st === 'reserved' && r.rd === r.want && r.tbd === false, r);
}
{
  /* ③ 過ぎた日は通さない（堂々巡りになるので） */
  await seedNoShow();
  const r = await p.evaluate(() => {
    const pad = n => (n < 10 ? '0' : '') + n;
    const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 2);
    document.getElementById('und-rs-date').value = ymd(d);
    [].find.call(document.querySelectorAll('#pit-und-restore .ta-btn'), b => /この日の入庫予定にする/.test(b.textContent)).click();
    const c = state.cards[0];
    return { st: c.status, open: document.getElementById('pit-und-restore').classList.contains('show') };
  });
  ok('🔴 過ぎた日を入れても実行しない', r.st === 'cancelled', r);
  ok('窓は開いたまま（選び直せる）', r.open === true, r);
  await p.evaluate(() => pitUndRestoreClose());
}
{
  /* ④ やめる＝何も変えない */
  await seedNoShow();
  const r = await p.evaluate(() => {
    document.querySelector('#pit-und-restore .ta-cancel').click();
    const c = state.cards[0];
    return { st: c.status, noShow: !!c.noShow,
             open: document.getElementById('pit-und-restore').classList.contains('show') };
  });
  ok('🔴 やめたら未入庫のまま', r.st === 'cancelled' && r.noShow === true, r);
  ok('窓は閉じる', r.open === false, r.open);
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  const od = fs.readFileSync('js/overdue-pit.js', 'utf8');
  ok('🔴 自動移動の物差しが1本ある', /function pitIntakeOverdue/.test(od) && /function pitReturnOverdue/.test(od), '');
  const vw = fs.readFileSync('js/views.js', 'utf8');
  ok('🔴 呼び出しは showView の1か所', (vw.match(/pitAutoOverdue\(\)/g) || []).length === 1, '');
  for (const f of ['views.js', 'undetermined.js', 'today.js']) {
    const src = fs.readFileSync('js/' + f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    ok('自動移動の条件を書き写していない（' + f + '）', !/reserveDate\s*<\s*(td|today)/.test(src), f);
  }
  const rs = fs.readFileSync('js/return-slot.js', 'utf8');
  ok('🔴 「返車日未定に出すか」の判断は pitReturnPlace の中', /pitDropIsSameDay\(c\) && c\.status !== 'reserved'/.test(rs), '');

  await p.evaluate(() => { if (window.pitSampleData) pitSampleData(); });
  await p.waitForTimeout(400);
  for (const v of ['dashboard', 'today', 'task', 'reserve', 'return', 'result', 'customers']) {
    await p.evaluate(x => { try { showView(x); } catch (e) {} }, v);
    await p.waitForTimeout(220);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));

  /* 未定ビューの箱に、ちゃんと落ちて見えるか */
  const seen = await p.evaluate(() => {
    const pad = n => (n < 10 ? '0' : '') + n;
    const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const day = n => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + n); return ymd(d); };
    state.cards = [
      /* ⚠ カードは苗字しか出さないので、見分けは**車種**でつける */
      { id: 'S1', customer: '未入 太郎', car: 'ムラーノ', boardId: 'default', workType: 'general',
        dropType: 'drop', status: 'reserved', reserveDate: day(-4), log: [] },
      { id: 'S2', customer: '返車 次郎', car: 'ハリアー', boardId: 'default', workType: 'general',
        dropType: 'drop', status: 'workDone', returnStage: 'returnWait', returnDate: day(-4), log: [] }
    ];
    showView('reserve'); if (window.renderReserveTbd) renderReserveTbd();
    const resvTxt = (document.getElementById('reserve-tbd') || {}).textContent || '';
    showView('return'); if (window.renderReturnTbd) renderReturnTbd();
    const retTxt = (document.getElementById('return-tbd') || {}).textContent || '';
    return { resv: /ムラーノ/.test(resvTxt), ret: /ハリアー/.test(retTxt) };
  });
  ok('🔴 予約→未定の画面に「未入庫」で並ぶ', seen.resv, seen);
  ok('🔴 返車→未定の画面に「返車日未定」で並ぶ', seen.ret, seen);
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
