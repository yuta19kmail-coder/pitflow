/* ================================================================================
   test_sales_date.mjs ── 💴 売上日（整備ソフトの伝票が立った日）  PitFlow v1.185.0
   ================================================================================
   ◎ゆうた指定（2026-08-23・すり合わせ済み）
     🗣「予約詳細カードに1行 売上日が足されて、完TEL時のポップアップに金額と共に出るイメージ」
     🗣「またログの完TEL日とはあくまで分けてね。日付の数字としては引っ張るけどってイメージ」
     🗣「完TEL依頼ログも残して。また依頼の欄から返車日を入力したのもログに入れたい」
     🗣「会社的にもともとAだから Aのまま」＝**売上を数える日は返車日のまま。1円も動かさない。**
     🗣「1でいい」＝**売上日は誰でも直せる**（実績カウント日とちがって鍵をかけない）

   ◎ここで見張ること
     ① 物差しは1本（自分の売上日 → 完TEL日を借りる → 無ければ空）
     ② 🔴🔴 **売上を数える日が1ミリも動いていない**（Aのまま）
     ③ 完TELのポップアップ（依頼／済／実績化）で、金額と一緒に売上日が入る
     ④ 🔴 完TEL依頼でも、完TEL待ちの欄から返車日を入れた時も、**ログが残る**
     ⑤ カード詳細に1行出る／**誰でも直せる**
     ⑥ データチェックは**月がちがう時だけ**言う（Qまたぎでは言わない）
     ⑦ 突き合わせが売上日で結ぶ／検算はずれない
     ⑧ ソースの見張り（写しを作っていない・版が3か所そろっている）

   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8980      ← 別ウィンドウ
     node test_sales_date.mjs
   ================================================================================ */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8980;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(x => fs.existsSync(x));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };
const src = f => fs.readFileSync(f, 'utf8');

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitSalesDate && window.PitReturnPopup && window.pitInspectRun', null, { timeout: 25000 });
await p.waitForTimeout(900);

/* 本番と同じ「管理かどうか」を効かせる（練習用サイトは全部さわれてしまうため） */
await p.evaluate(() => {
  window.PIT_CLOUD = true;
  window.__admin = true;
  window.pitIsAdmin = function(){ return !!window.__admin; };
  window.pitCurrentStaffName = function(){ return 'サンプル 花子'; };
});

const iso = off => { const d = new Date(); d.setDate(d.getDate() + off); const q = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); };
const TODAY = iso(0);

/* --------------------------------------------------------------------------
   テスト用のカードを1枚置く。
   🔴 日付は**呼ぶ側が決め打ちで渡す**（「今日から◯日」にすると定休日にぶつかる。
      2026-08-23 に test_inspect.mjs が日曜だけ落ちた原因がこれ）。
   -------------------------------------------------------------------------- */
const mk = async (id, extra) => p.evaluate(([i, ex]) => {
  state.cards = state.cards.filter(x => x.id !== i);
  const c = Object.assign({
    id: i, resNo: 'R-' + i, status: 'returned', customer: '売上 太郎', car: 'アクア',
    boardId: 'default', division: 'div1', workType: 'general', frontStaff: 'サンプル 花子',
    plate: '船橋 300 あ 1234', amountFinal: 120000, log: [], maint: {}, office: {}
  }, ex);
  state.cards.push(c);
  return c.id;
}, [id, extra]);

/* ============================================================================
   ① 物差しは1本（sales-date.js）
   ============================================================================ */
console.log('\n── ① 売上日の読み方は1本（自分の → 完TEL日を借りる → 無ければ空） ──');
{
  const r = await p.evaluate(() => {
    const A = { salesDate: '2026-08-05', completeCallAt: '2026-08-03' };
    const B = { completeCallAt: '2026-08-03' };
    const C = {};
    const D = { salesDate: 'めちゃくちゃ', completeCallAt: '2026-08-03' };
    return {
      own:      pitSalesDate(A),  ownB: pitSalesDateBorrowed(A),
      borrow:   pitSalesDate(B),  borB: pitSalesDateBorrowed(B),
      none:     pitSalesDate(C),  noneB: pitSalesDateBorrowed(C),
      junk:     pitSalesDate(D),
      seedA:    pitSalesDateSeed(A), seedB: pitSalesDateSeed(B), seedC: pitSalesDateSeed(C)
    };
  });
  ok('自分の売上日があれば、それを答える', r.own === '2026-08-05', r);
  ok('その時「借り物」とは言わない', r.ownB === false, r);
  ok('🔴 自分の売上日が無ければ、完TEL日を借りる', r.borrow === '2026-08-03', r);
  ok('🔴 借りている時は、借り物だと分かる', r.borB === true, r);
  ok('どちらも無ければ空（それらしい日をでっち上げない）', r.none === '' && r.noneB === false, r);
  ok('日付の形をしていない文字は日付として扱わない', r.junk === '2026-08-03', r);
  ok('入力欄の初期値＝自分の売上日', r.seedA === '2026-08-05', r);
  ok('入力欄の初期値＝無ければ完TEL日', r.seedB === '2026-08-03', r);
  ok('入力欄の初期値＝それも無ければ今日', r.seedC === TODAY, r);
}

console.log('\n── ①-2 完TEL日（ログ）は上書きしない（依頼→済 で2回通るため） ──');
{
  const r = await p.evaluate(() => {
    const c = {};
    const a = pitMarkCompleteCall(c, '2026-08-03');
    const b = pitMarkCompleteCall(c, '2026-08-07');   /* 2回目（かけ直し） */
    const empty = {}; const t = pitMarkCompleteCall(empty);
    return { a, b, keep: c.completeCallAt, today: t };
  });
  ok('🔴 2回目に通っても、最初の日が残る', r.a === '2026-08-03' && r.b === '2026-08-03' && r.keep === '2026-08-03', r);
  ok('日付を渡さなければ今日を記録する', r.today === TODAY, r);
}

console.log('\n── ①-3 ズレの言い方は quarter-match の1本を借りている ──');
{
  const r = await p.evaluate(() => {
    const mkc = (sd, cd) => ({ status: 'returned', salesDate: sd, completedAt: cd, returnDate: cd, returnDateFinal: cd });
    return {
      same:  pitSalesDateGap(mkc('2026-08-05', '2026-08-05')).kind,
      sameQ: pitSalesDateGap(mkc('2026-08-05', '2026-08-06')).kind,
      crossQ: pitSalesDateGap(mkc('2026-08-06', '2026-08-08')).kind,
      crossM: pitSalesDateGap(mkc('2026-07-31', '2026-08-03')).kind,
      nothing: pitSalesDateGap({ status: 'returned', completedAt: '2026-08-05' }).kind,
      warnM: pitSalesDateCrossMonth(mkc('2026-07-31', '2026-08-03')),
      warnQ: pitSalesDateCrossMonth(mkc('2026-08-06', '2026-08-08'))
    };
  });
  ok('同じ日は「同じ」', r.same === 'same', r);
  ok('同じクォーターの中', r.sameQ === 'sameQ', r);
  ok('クォーターまたぎ', r.crossQ === 'crossQ', r);
  ok('🔴 月またぎ（先に月を見ている）', r.crossM === 'crossMonth', r);
  ok('売上日が無ければ、何も言わない', r.nothing === '', r);
  ok('🔴 注意を出すのは月がちがう時だけ（ゆうた指定）', r.warnM === true && r.warnQ === false, r);
}

/* ============================================================================
   ②🔴🔴 売上を数える日が1ミリも動いていない（A案・ゆうた確定）
   ============================================================================ */
console.log('\n── ②🔴🔴 売上を数える日は返車日のまま。1円も動かない ──');
{
  const r = await p.evaluate(() => {
    const c = { status: 'returned', completedAt: '2026-08-10', returnDate: '2026-08-10', returnDateFinal: '2026-08-10', amountFinal: 100000 };
    const before = { d: pitSalesCountDate(c), tier: pitSalesTier(c),
                     inAug: pitSalesInRange(c, '2026-08-01', '2026-08-31', '2026-08-20'),
                     inJul: pitSalesInRange(c, '2026-07-01', '2026-07-31', '2026-08-20') };
    /* 売上日を**先月**にしてみる（いちばん数字が動きそうな入れ方） */
    pitSetSalesDate(c, '2026-07-30');
    const after = { d: pitSalesCountDate(c), tier: pitSalesTier(c),
                    inAug: pitSalesInRange(c, '2026-08-01', '2026-08-31', '2026-08-20'),
                    inJul: pitSalesInRange(c, '2026-07-01', '2026-07-31', '2026-08-20') };
    return { before, after, sd: pitSalesDate(c) };
  });
  ok('売上日は入った', r.sd === '2026-07-30', r);
  ok('🔴🔴 数える日は動かない', r.before.d === r.after.d && r.after.d === '2026-08-10', r);
  ok('🔴🔴 確度の区分も動かない', r.before.tier === r.after.tier, r);
  ok('🔴🔴 8月に数えるまま（先月へ移らない）', r.after.inAug === true && r.before.inAug === true, r);
  ok('🔴🔴 7月には出てこない', r.after.inJul === false && r.before.inJul === false, r);
}
{
  /* ソースの見張り＝数える日の物差しに「売上日」が1文字も入っていないこと */
  const sc = src('js/sales-count.js');
  ok('🔴🔴 数える日の物差しが売上日を読んでいない', !/salesDate/.test(sc), 'sales-count.js');
  ok('🔴 数える日の物差しは今までどおり3段（実績→確定→予定）',
     /completedAt\)\s*\|\|\s*s\(c\.returnDateFinal\)\s*\|\|\s*s\(c\.returnDate\)/.test(sc));
}

/* ============================================================================
   ③ 完TELのポップアップ（依頼／済／実績化）で、金額と一緒に入る
   ============================================================================ */
console.log('\n── ③ 完TELのポップアップに、金額と一緒に売上日が出る（ゆうた指定） ──');
{
  await mk('SD-REQ', { status: 'workDone', completedAt: '', returnDate: '', returnDateFinal: null, dropType: 'keep' });
  const r = await p.evaluate(() => {
    PitReturnPopup.open('SD-REQ', 'callReq');
    const f = document.getElementById('rp-sales');
    return { has: !!f, val: f ? f.value : '', note: (document.getElementById('rp-sales-note') || {}).textContent || '',
             label: (f && f.closest('.pp-field').querySelector('.pp-lb').textContent) || '' };
  });
  ok('完TEL依頼でも売上日の欄が出る', r.has === true, r);
  ok('初期値が入っている（今日）', r.val === TODAY, r);
  ok('何の日か分かる書き方（伝票の日付）', /伝票/.test(r.label), r.label);
  ok('確かめてほしい一言が出る', /ちがったら直して/.test(r.note), r.note);

  const w = await p.evaluate(() => {
    document.getElementById('rp-amt').value = '150,000';
    document.getElementById('rp-sales').value = '2026-08-04';
    PitReturnPopup.close(true);
    const c = state.cards.find(x => x.id === 'SD-REQ');
    return { sd: c.salesDate, stage: c.returnStage, call: c.completeCallAt,
             log: (c.log || []).map(x => x.label || '').join(' | ') };
  });
  ok('OKを押すと売上日が入る', w.sd === '2026-08-04', w);
  ok('完TEL待ちへ入っている（今までどおり）', w.stage === 'callWait', w);
  ok('🔴🔴 完TEL依頼でも完TEL日（ログ）が残る（ゆうた指定）', w.call === TODAY, w);
  ok('🔴 フローにも完TEL日が残る', /完TEL依頼/.test(w.log) && /完TEL日/.test(w.log), w.log);
  ok('🔴 売上日を入れたこともフローに残る', /売上日を/.test(w.log), w.log);
}
{
  await mk('SD-DONE', { status: 'workDone', completedAt: '', returnDate: '', returnDateFinal: null, dropType: 'keep' });
  const r = await p.evaluate(() => {
    PitReturnPopup.open('SD-DONE', 'callDone');
    return { has: !!document.getElementById('rp-sales'), val: document.getElementById('rp-sales').value };
  });
  ok('完TEL済でも売上日の欄が出る', r.has === true && r.val === TODAY, r);
  const w = await p.evaluate((t) => {
    document.getElementById('rp-amt').value = '90,000';
    document.getElementById('rp-sales').value = '2026-08-06';
    document.getElementById('rp-date').value = t;
    PitReturnPopup.close(true);
    const c = state.cards.find(x => x.id === 'SD-DONE');
    return { sd: c.salesDate, call: c.completeCallAt, stage: c.returnStage };
  }, iso(2));
  ok('完TEL済でも売上日が入る', w.sd === '2026-08-06', w);
  ok('完TEL日も残る（今までどおり）', w.call === TODAY, w);
}
{
  /* 実績化＝返車予定日の欄は出ないが、売上日の欄は出る（伝票はもうある） */
  await mk('SD-ACT', { status: 'workDone', completedAt: '', returnDate: '', returnDateFinal: null, dropType: 'wait' });
  const r = await p.evaluate(() => {
    PitReturnPopup.open('SD-ACT', 'callDone');
    PitReturnPopup.kind(1);                       /* 1枚目で「実績化」を選ぶ */
    return { sales: !!document.getElementById('rp-sales'),
             salesShown: document.getElementById('rp-sales').closest('.pp-field').style.display !== 'none',
             dateShown: document.getElementById('rp-date-field').style.display !== 'none' };
  });
  ok('実績化でも売上日の欄は出る', r.sales === true && r.salesShown === true, r);
  ok('実績化では返車予定日の欄は出ない（今までどおり）', r.dateShown === false, r);
  const w = await p.evaluate(() => {
    document.getElementById('rp-sales').value = '2026-08-02';
    PitReturnPopup.close(true);
    const c = state.cards.find(x => x.id === 'SD-ACT');
    return { sd: c.salesDate, st: c.status, done: c.completedAt, call: c.completeCallAt };
  });
  ok('実績化でも売上日が入る', w.sd === '2026-08-02', w);
  ok('🔴 実績になった（今までどおり）', w.st === 'returned' && !!w.done, w);
  ok('🔴 売上日と実績日は別々（実績日は今日のまま）', w.done === TODAY && w.sd === '2026-08-02', w);
}

/* ============================================================================
   ④🔴 完TEL待ちの欄から返車日を入れた時も、ログに残る（ゆうた指定）
   ============================================================================ */
console.log('\n── ④🔴 「依頼の欄から返車日を入力」も完TELの記録に残る（ゆうた指定） ──');
{
  const r = await p.evaluate((d) => {
    const c = { id: 'SD-CW', status: 'workDone', returnStage: 'callWait', returnDate: '', returnTime: '', log: [] };
    state.cards = state.cards.filter(x => x.id !== 'SD-CW'); state.cards.push(c);
    pitReturnSetDateTime(c, d, '10:00');
    return { call: c.completeCallAt, stage: c.returnStage,
             log: (c.log || []).map(x => x.label || '').join(' | ') };
  }, iso(2));
  ok('🔴 完TEL日（ログ）が付く', r.call === TODAY, r);
  ok('返車待ちへ上がっている（今までどおり）', r.stage === 'returnWait', r);
  ok('🔴 フローに「完TEL待ちの欄から入力した」と残る', /完TEL済（完TEL待ちの欄から返車の予定を入力）/.test(r.log), r.log);
  ok('🔴 その時の返車の予定も一緒に残る', /返車 /.test(r.log), r.log);
  ok('⚠ 同じ操作が2行にならない（「返車の予定を更新」を重ねて書かない）',
     !/返車の予定を更新/.test(r.log), r.log);
}
{
  /* 空にした時は上がらない＝戻す道を塞がない（v1.71.0 の決めごとを壊していない） */
  const r = await p.evaluate(() => {
    const c = { id: 'SD-CW2', status: 'workDone', returnStage: 'callWait', returnDate: '', returnTime: '', log: [] };
    state.cards = state.cards.filter(x => x.id !== 'SD-CW2'); state.cards.push(c);
    pitReturnSetDateTime(c, '', '');
    return { call: c.completeCallAt || '', stage: c.returnStage, n: (c.log || []).length };
  });
  ok('⚠ 空にした時は完TEL日を付けない', r.call === '', r);
  ok('⚠ 完TEL待ちのまま（戻す道を塞いでいない）', r.stage === 'callWait', r);
  ok('⚠ 余計なログも増やさない', r.n === 0, r);
}
{
  /* もう完TEL日がある車は上書きしない */
  const r = await p.evaluate((d) => {
    const c = { id: 'SD-CW3', status: 'workDone', returnStage: 'callWait', completeCallAt: '2026-08-01',
                returnDate: '', returnTime: '', log: [] };
    state.cards = state.cards.filter(x => x.id !== 'SD-CW3'); state.cards.push(c);
    pitReturnSetDateTime(c, d, '');
    return c.completeCallAt;
  }, iso(3));
  ok('🔴 すでにある完TEL日は上書きしない', r === '2026-08-01', r);
}

/* ============================================================================
   ⑤ カード詳細に1行。誰でも直せる（ゆうた指定「1でいい」）
   ============================================================================ */
{
  /* 後始末（pitReturnCommit）を通しても、同じことを2度書かない */
  const r = await p.evaluate((d) => {
    const c = { id: 'SD-CW4', status: 'workDone', returnStage: 'callWait', returnDate: '', returnTime: '', log: [] };
    state.cards = state.cards.filter(x => x.id !== 'SD-CW4'); state.cards.push(c);
    const res = pitReturnSetDateTime(c, d, '10:00');
    pitReturnCommit(c, res, { silent: true });
    const lines = (c.log || []).map(x => x.label || '');
    return { n: lines.length, lines, flag: !!res.完TEL };
  }, iso(4));
  ok('🔴 後始末を通してもフローは1行だけ', r.n === 1, r);
  ok('🔴 その1行が完TELの記録', /完TEL済（完TEL待ちの欄から/.test(r.lines[0] || ''), r.lines);
  ok('⚠ 「完TELを書いた」と後始末に伝わっている', r.flag === true, r);
}
{
  /* ⚠ 完TEL待ち以外の車は今までどおり「返車の予定を更新」が残る（消していない） */
  const r = await p.evaluate((d) => {
    const c = { id: 'SD-CW5', status: 'workDone', returnStage: 'returnWait', returnDate: '', returnTime: '', log: [] };
    state.cards = state.cards.filter(x => x.id !== 'SD-CW5'); state.cards.push(c);
    const res = pitReturnSetDateTime(c, d, '10:00');
    pitReturnCommit(c, res, { silent: true });
    return (c.log || []).map(x => x.label || '').join(' | ');
  }, iso(5));
  ok('⚠ もともとの「返車の予定を更新」は今までどおり残る', /返車の予定を更新/.test(r), r);
}

console.log('\n── ⑤ 予約詳細カードの「売上日」の行（誰でも直せる） ──');
{
  await mk('SD1', { completedAt: '2026-08-10', returnDate: '2026-08-10', returnDateFinal: '2026-08-10', salesDate: '2026-08-08' });
  await p.evaluate(() => openCard('SD1', 'modal'));
  await p.waitForTimeout(350);
  const r = await p.evaluate(() => {
    const row = document.querySelector('#md-body-modal .cv-salesdate');
    return { has: !!row,
             label: row ? row.querySelector('.cv-frt').textContent.replace(/\s+/g, ' ').trim() : '',
             val: (document.getElementById('cv-salesdate') || {}).value || '',
             note: row ? (row.querySelector('.cv-sdnote') || {}).textContent || '' : '',
             lock: row ? !!row.querySelector('.cv-locktag') : null,
             adminOnly: row ? !!row.querySelector('.cv-adminonly') : null };
  });
  ok('実績カードに「売上日」の行が出る', r.has === true, r);
  ok('何の日か分かる書き方（伝票が立った日）', /売上日/.test(r.label) && /伝票/.test(r.label), r.label);
  ok('いまの売上日が出ている', r.val === '2026-08-08', r);
  /* 🔒 v2.0.0（ゆうた指定）**アーカイブ（返車済み）になったら管理者だけ。** */
  ok('🔒 v2.0.0 返車済みの車では鍵がかかっている', r.lock === true, r);
  ok('管理なら「編集」が出る（管理のみ、にはならない）', r.adminOnly === false, r);
  ok('実績日とのちがいを添えている', /実績日/.test(r.note), r.note);

  /* 管理なら、編集を押すと入力欄が出て直せる */
  const e = await p.evaluate(() => {
    cvUnlockSalesDate();
    const input = !!document.getElementById('cv-salesdate');
    cvSetSalesDate('2026-08-09');
    const c = state.cards.find(x => x.id === 'SD1');
    return { input, sd: c.salesDate, done: c.completedAt, rd: c.returnDate, rf: c.returnDateFinal };
  });
  ok('管理なら編集で入力欄が出る', e.input === true, e);
  ok('管理なら直せる', e.sd === '2026-08-09', e);
  ok('🔴🔴 直しても実績カウント日は動かない', e.done === '2026-08-10', e);
  ok('🔴🔴 直しても返車日は動かない', e.rd === '2026-08-10' && e.rf === '2026-08-10', e);
}
{
  /* 🔒 v2.0.0 管理でない人には、返車済みの車の入力欄そのものを描かない */
  const r = await p.evaluate(() => {
    window.__admin = false;
    const c = state.cards.find(x => x.id === 'SD1');
    renderCardView(c, 'md-body-modal');
    const input = !!document.getElementById('cv-salesdate');
    const before = c.salesDate;
    cvSetSalesDate('2026-01-01');                     /* 外から直に呼んでも通らないこと */
    return { input, before, after: c.salesDate,
             adminOnly: !!document.querySelector('#md-body-modal .cv-salesdate .cv-adminonly'),
             val: (document.getElementById('cv-sdlock') || {}).textContent || '',
             resInput: !!document.getElementById('cv-resinput') };
  });
  ok('🔒 管理でない人には「管理のみ」を出す', r.adminOnly === true, r);
  ok('🔒 入力欄そのものを描かない', r.input === false, r);
  ok('🔴 外から直に呼んでも変わらない（ボタンを消しただけにしない）', r.before === r.after, r);
  ok('日付は見えるだけ残る', !!r.val && r.val !== '—', r);
  ok('⚠ 実績カウント日のほうは今までどおり管理だけ（壊していない）', r.resInput === false, r);
}
{
  /* 🔒 v2.0.0 アーカイブ**前**の車は、今までどおり誰でも直せる（返車日と同じ扱い） */
  const r = await p.evaluate(() => {
    window.__admin = false;
    state.cards = state.cards.filter(x => x.id !== 'SD1B');
    state.cards.push({ id:'SD1B', resNo:'R-SD1B', status:'workDone', returnStage:'returnWait',
                       customer:'返車前 太郎', car:'ノート', returnDate:'2026-08-20',
                       salesDate:'2026-08-08', log:[] });
    openCard('SD1B', 'modal');
    const input = !!document.getElementById('cv-salesdate');
    cvSetSalesDate('2026-08-07');
    const c = state.cards.find(x => x.id === 'SD1B');
    return { input, sd: c.salesDate,
             lock: !!document.querySelector('#md-body-modal .cv-salesdate .cv-locktag') };
  });
  ok('🔒 アーカイブ前は鍵をかけない', r.lock === false, r);
  ok('🔒 アーカイブ前は誰でも直せる', r.input === true && r.sd === '2026-08-07', r);
}
{
  /* 🔴🔴 v2.0.0 特例①＝データチェックの「ここを直す」からは、アーカイブ済みでも誰でも直せる */
  const r = await p.evaluate(() => {
    window.__admin = false;
    const fd = (window.PIT_FIX_FIELDS || []).filter(x => x.id === 'salesDate')[0] || null;
    const c = state.cards.find(x => x.id === 'SD1');
    const before = c.salesDate;
    if (fd && fd.set) fd.set(c, '2026-08-05');
    const money = (window.PIT_FIX_FIELDS || []).filter(x => x.id === 'amountFinal')[0] || null;
    const rdate = (window.PIT_FIX_FIELDS || []).filter(x => x.id === 'completedAt')[0] || null;
    return { has: !!fd, admin: fd ? !!fd.admin : null, before, after: c.salesDate,
             moneyAdmin: money ? !!money.admin : null, dateAdmin: rdate ? !!rdate.admin : null };
  });
  ok('🔴 特例① データチェックの欄に鍵は付いていない', r.has === true && r.admin === false, r);
  ok('🔴 特例① 管理でない人でも、そこからなら直せる', r.after === '2026-08-05' && r.before !== r.after, r);
  ok('⚠ 確定金額は特例に入れていない（今までどおり管理だけ）', r.moneyAdmin === true, r);
  ok('⚠ 実績カウント日も特例に入れていない（今までどおり管理だけ）', r.dateAdmin === true, r);
}
{
  /* 🔴🔴 v2.0.0 特例②＝クォーターチェックの直すボタンも、売上日だけは誰でも */
  const r = await p.evaluate(() => {
    window.__admin = false;
    const mk = (over) => Object.assign({
      soft: { i:0, 売上日:'2026-08-04', 伝票:'0001', ナンバー:'船橋 300 あ 1111', 顧客名:'あ 一郎', 金額:100000 },
      pit:  { 生:{id:'X'}, 数える日:'2026-08-06', 売上日:'2026-08-01', 確定金額:100000 },
      日付: { kind:'sameQ', label:'同じQ内（+2日）' }, 金額一致: true, 期間の外: false, 差: 0
    }, over);
    const kinds = pitQFixKinds(mk({}));
    const heavy = pitQFixKinds(mk({ 日付:{kind:'crossMonth',label:'月またぎ（+2日）'}, 金額一致:false, 差:-500 }));
    const by = {}; heavy.forEach(k => by[k.kind] = k.can);
    return { sd: (kinds.filter(k => k.kind === '売上日')[0] || {}).can,
             heavyKinds: heavy.map(k => k.kind), by };
  });
  ok('🔴 特例② 売上日は管理でなくても押せる', r.sd === true, r);
  ok('🔴 実績日と金額は、管理でなければ押せない', r.by['実績日'] === false && r.by['金額'] === false, r);
  ok('ズレの並びは「安いものから」（売上日→実績日→金額）',
     r.heavyKinds.join() === '売上日,実績日,金額', r.heavyKinds);
  await p.evaluate(() => { window.__admin = true; });
}
{
  /* 借り物の時は、そう言う */
  await p.evaluate(() => { window.__admin = true; });
  await mk('SD2', { completedAt: '2026-08-10', returnDate: '2026-08-10', returnDateFinal: '2026-08-10', completeCallAt: '2026-08-09' });
  await p.evaluate(() => openCard('SD2', 'modal'));
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({
    val: (document.getElementById('cv-salesdate') || {}).value || '',
    note: (document.querySelector('#md-body-modal .cv-salesdate .cv-sdnote') || {}).textContent || ''
  }));
  ok('売上日が無い車は、完TEL日を出す', r.val === '2026-08-09', r);
  ok('🔴 それが借り物だと画面にも書く', /完TELの日から/.test(r.note), r.note);
}
{
  /* 月がちがう時は赤で言う */
  await mk('SD3', { completedAt: '2026-08-03', returnDate: '2026-08-03', returnDateFinal: '2026-08-03', salesDate: '2026-07-31' });
  await p.evaluate(() => openCard('SD3', 'modal'));
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const n = document.querySelector('#md-body-modal .cv-salesdate .cv-sdnote');
    return { txt: n ? n.textContent : '', warn: n ? n.className.indexOf('is-warn') >= 0 : false };
  });
  ok('🔴 月がちがう車は、画面でも注意する', /月がちがいます/.test(r.txt), r.txt);
  ok('🔴 赤で出す', r.warn === true, r);
}
{
  /* 完TELも通っていない車には出さない（伝票がまだ無いのに日付を入れられてしまうため） */
  const r = await p.evaluate(() => {
    state.cards = state.cards.filter(x => x.id !== 'SD4');
    state.cards.push({ id: 'SD4', resNo: 'R-SD4', status: 'reserved', customer: '予約 次郎', car: 'ノート', log: [] });
    openCard('SD4', 'modal');
    return !!document.querySelector('#md-body-modal .cv-salesdate');
  });
  ok('⚠ 完TELも通っていない車には出さない', r === false, r);
}
{
  /* 入庫を取り消したら、売上日も消える */
  const r = await p.evaluate(() => {
    state.cards = state.cards.filter(x => x.id !== 'SD5');
    state.cards.push({ id: 'SD5', resNo: 'R-SD5', status: 'workDone', returnStage: 'returnWait',
                       customer: '取消 三郎', car: 'フィット', salesDate: '2026-08-05',
                       completeCallAt: '2026-08-05', log: [] });
    openCard('SD5', 'modal');
    cvBackToReserve();
    const c = state.cards.find(x => x.id === 'SD5');
    return { sd: c.salesDate || '', call: c.completeCallAt || '', read: pitSalesDate(c) };
  });
  ok('🔴 入庫を取り消したら売上日も消える', r.sd === '' && r.call === '', r);
  ok('🔴 消したのに借り物として復活しない', r.read === '', r);
}

/* ============================================================================
   ⑥ データチェック M11（月がちがう時だけ）
   ============================================================================ */
console.log('\n── ⑥ データチェック：売上日と実績日で月がちがう（M11） ──');
{
  const r = await p.evaluate(() => {
    /* きれいな盤面にしてから、4種類だけ置く */
    const keep = state.cards.filter(c => /^SDR/.test(c.id));
    state.cards = [];
    const base = (id, ex) => Object.assign({
      id, resNo: 'R-' + id, status: 'returned', customer: 'チェック 車', car: 'アクア',
      boardId: 'default', division: 'div1', workType: 'general', frontStaff: 'サンプル 花子',
      plate: '船橋 300 あ 1111', amountFinal: 100000, log: [], maint: {}, office: {},
      reserveDate: '2026-07-28'
    }, ex);
    state.cards.push(base('SDR-M', { salesDate: '2026-07-31', completedAt: '2026-08-03', returnDate: '2026-08-03', returnDateFinal: '2026-08-03' }));   /* 月ちがい */
    state.cards.push(base('SDR-Q', { salesDate: '2026-08-06', completedAt: '2026-08-08', returnDate: '2026-08-08', returnDateFinal: '2026-08-08' }));   /* Qちがいだけ */
    state.cards.push(base('SDR-S', { salesDate: '2026-08-03', completedAt: '2026-08-03', returnDate: '2026-08-03', returnDateFinal: '2026-08-03' }));   /* 同じ日 */
    state.cards.push(base('SDR-N', { completedAt: '2026-08-03', returnDate: '2026-08-03', returnDateFinal: '2026-08-03' }));                             /* 売上日なし */
    /* ⚠ この1枚だけ返車予定日は**今日からの日数**で置く。
       決め打ちにすると、その日を過ぎた日から「予定を過ぎた車」として自動で箱が移り、
       いつか理由の分からない落ち方をする（2026-08-21 の教訓）。 */
    const soon = (function(){ const d = new Date(); d.setDate(d.getDate() + 30);
      const q = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); })();
    state.cards.push(base('SDR-B', { status: 'workDone', returnStage: 'returnWait', completedAt: '', returnDate: soon,
                                     returnDateFinal: soon, salesDate: '2026-07-31' }));                                  /* まだ返していない */
    const f = (pitInspectRun() || {}).findings || [];
    const m11 = f.filter(x => x.ruleId === 'M11');
    return { ids: m11.map(x => x.refId).sort(), no: (m11[0] || {}).no || '', text: (m11[0] || {}).text || '',
             level: (m11[0] || {}).level || '', fixKeys: (window.PIT_RULE_FIX || {}).M11 || [] };
  });
  ok('🔴 月がちがう車だけ出る（1件）', r.ids.join() === 'SDR-M', r.ids);
  ok('🔴 Qがちがうだけの車では出さない（ゆうた指定）', r.ids.indexOf('SDR-Q') < 0, r.ids);
  ok('同じ日の車では出さない', r.ids.indexOf('SDR-S') < 0, r.ids);
  ok('⚠ 売上日が無い車では出さない（直しようがないため）', r.ids.indexOf('SDR-N') < 0, r.ids);
  ok('⚠ まだ返していない車では出さない（相手が「予定」日のため）', r.ids.indexOf('SDR-B') < 0, r.ids);
  ok('🔢 1件ごとの番号が付いている（v1.178.0 の形）', /^M11-\d{6}$/.test(r.no), r.no);
  ok('所見に両方の日と月が出る', /売上日 2026-07-31/.test(r.text) && /7月/.test(r.text) && /8月/.test(r.text), r.text);
  ok('重さは「確認」（要対応ではない＝お金は消えていない）', r.level === 'amber', r.level);
  ok('🔴 「ここを直す」は売上日が先・実績カウント日が後',
     r.fixKeys.join() === 'salesDate,completedAt', r.fixKeys);
}
{
  /* 番号が毎回おなじ（v1.178.0 の決めごとを壊していない） */
  const r = await p.evaluate(() => {
    const a = ((pitInspectRun() || {}).findings || []).filter(x => x.ruleId === 'M11')[0];
    const b = ((pitInspectRun() || {}).findings || []).filter(x => x.ruleId === 'M11')[0];
    return { a: (a || {}).no, b: (b || {}).no };
  });
  ok('🔴 走らせ直しても同じ番号', !!r.a && r.a === r.b, r);
}
{
  /* 「ここを直す」の小窓に売上日が出て、直すと所見が消える */
  const r = await p.evaluate(() => {
    const f = ((pitInspectRun() || {}).findings || []).filter(x => x.ruleId === 'M11')[0];
    const fields = window.pitFixFieldsFor ? pitFixFieldsFor(f) : [];
    const sd = fields.filter(x => x.id === 'salesDate')[0] || null;
    const c = state.cards.find(x => x.id === 'SDR-M');
    if (sd && sd.set) sd.set(c, '2026-08-03');
    const after = ((pitInspectRun() || {}).findings || []).filter(x => x.ruleId === 'M11').length;
    return { has: !!sd, admin: sd ? !!sd.admin : null, label: sd ? sd.label : '', sd: c.salesDate, after };
  });
  ok('「ここを直す」に売上日の欄がある', r.has === true && /売上日/.test(r.label), r);
  ok('🔴 その欄に鍵はかけていない（誰でも直せる）', r.admin !== true, r);
  ok('🔴 直したら所見が0件になる（直せる指摘になっている）', r.sd === '2026-08-03' && r.after === 0, r);
}

/* ============================================================================
   ⑦ 突き合わせ（クォーターチェック②）
   ============================================================================ */
console.log('\n── ⑦ 突き合わせが売上日で結ぶ／検算はずれない ──');
{
  const r = await p.evaluate(() => {
    const soft = [
      { 売上日: '2026-08-04', 伝票: '0001', ナンバー: '船橋 300 あ 1111', 顧客名: 'あ 一郎', 金額: 100000, 受付担当: '専務' },
      { 売上日: '2026-08-05', 伝票: '0002', ナンバー: '船橋 300 い 2222', 顧客名: 'い 二郎', 金額: 200000, 受付担当: '社長' }
    ];
    const pit = [
      /* ①-a で当たる：カードの売上日が伝票とぴったり（返車日はズレている） */
      { 予約番号: 'P1', 状態: 'returned', 実績: true, 対象期間内: true, 数える日: '2026-08-06',
        売上日: '2026-08-04', ナンバー: '船橋 300 あ 1111', 顧客名: 'あ 一郎', 確定金額: 100000, フロント担当: '小林和枝' },
      /* カードの売上日が伝票とちがう＝「売上日ちがい」に出る */
      { 予約番号: 'P2', 状態: 'returned', 実績: true, 対象期間内: true, 数える日: '2026-08-05',
        売上日: '2026-08-07', ナンバー: '船橋 300 い 2222', 顧客名: 'い 二郎', 確定金額: 200000, フロント担当: '小林政幸' }
    ];
    const R = pitQMatch(soft, pit, { from: '2026-08-01', to: '2026-08-07' });
    const p1 = R.結びついた.filter(x => x.pit.予約番号 === 'P1')[0];
    const p2 = R.結びついた.filter(x => x.pit.予約番号 === 'P2')[0];
    return { n: R.結びついた.length, how1: p1.結び方, how2: p2.結び方,
             ng1: p1.売上日ちがい, ng2: p2.売上日ちがい,
             list: (R.売上日ちがい || []).map(x => x.pit.予約番号),
             audit: R.検算, gap1: p1.日付.kind };
  });
  ok('2件とも結びついた', r.n === 2, r);
  ok('🔴 カードの売上日で結んだ（ナンバー＋売上日）', r.how1 === 'ナンバー＋売上日', r);
  ok('🔴 日付のズレは今までどおり「返車日」で見ている', r.gap1 === 'sameQ', r);
  ok('売上日がちがうカードは、そう言う', r.ng2 === true && r.ng1 === false, r);
  ok('🔴 「売上日ちがい」の一覧に出る', r.list.join() === 'P2', r.list);
  ok('🔴🔴 検算はずれない（お金の話ではないので足し算に混ぜていない）', r.audit.合う === true && r.audit.ずれ === 0, r.audit);
}
{
  /* 売上日を持っていないカードでも、今までどおり結べる（取りこぼしが増えない） */
  const r = await p.evaluate(() => {
    const soft = [{ 売上日: '2026-08-04', 伝票: '0003', ナンバー: '船橋 300 う 3333', 顧客名: 'う 三郎', 金額: 50000, 受付担当: '専務' }];
    const pit = [{ 予約番号: 'P3', 状態: 'returned', 実績: true, 対象期間内: true, 数える日: '2026-08-04',
                   ナンバー: '船橋 300 う 3333', 顧客名: 'う 三郎', 確定金額: 50000, フロント担当: '小林和枝' }];
    const R = pitQMatch(soft, pit, { from: '2026-08-01', to: '2026-08-07' });
    return { n: R.結びついた.length, how: R.結びついた[0].結び方, ng: R.結びついた[0].売上日ちがい,
             audit: R.検算.合う };
  });
  ok('🔴 売上日が無いカードも今までどおり結べる', r.n === 1 && r.how === 'ナンバー＋日付', r);
  ok('⚠ 売上日が無いカードを「ちがう」と言わない', r.ng === false, r);
  ok('検算も合う', r.audit === true, r);
}
{
  /* 集めるほうも売上日を持って来ている（読むだけ・書き換えていない） */
  const r = await p.evaluate(() => {
    state.cards = [{ id: 'QC1', resNo: 'Q1', status: 'returned', plate: '船橋 300 え 4444', customer: 'え 四郎',
                     completedAt: '2026-08-05', returnDate: '2026-08-05', returnDateFinal: '2026-08-05',
                     salesDate: '2026-08-03', amountFinal: 70000, log: [] }];
    const c0 = JSON.stringify(state.cards[0]);
    const g = pitQCollect({ from: '2026-08-01', to: '2026-08-07' });
    return { sd: (g.明細[0] || {}).売上日, cd: (g.明細[0] || {}).数える日, same: JSON.stringify(state.cards[0]) === c0 };
  });
  ok('集める時に売上日も持って来ている', r.sd === '2026-08-03', r);
  ok('数える日は今までどおり返車日', r.cd === '2026-08-05', r);
  ok('🔴 集めるだけでカードを1バイトも書き換えていない', r.same === true, r);
}

/* ============================================================================
   ⑧ ソースの見張り
   ============================================================================ */
console.log('\n── ⑧ ソースの見張り（写しを作っていないか） ──');
{
  const files = fs.readdirSync('js').filter(f => /\.js$/.test(f) && !/^sample|^demo/.test(f));
  /* 🔴 売上日の借り方（自分 → 完TEL日）を書き写している所が無いか */
  /* ⚠ **コメントを外してから**見る。ここのコメント自体に「書き写すな」の例文が入っているため
     （例文まで拾うと、注意書きを書いた日にテストが落ちる）。 */
  const code = f => src('js/' + f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const copies = files.filter(f => f !== 'sales-date.js')
    .filter(f => /salesDate\s*\|\|\s*[\w.]*completeCallAt/.test(code(f)));
  /* ⚠ quarter-match.js は「物差しが読み込まれていない時の保険」として1行だけ持っている（許す） */
  const bad = copies.filter(f => f !== 'quarter-match.js');
  ok('🔴 売上日の借り方を書き写していない', bad.length === 0, bad);

  /* 🔴 完TEL日を直に書いている所が無いか（記録は1本を通す） */
  const direct = files.filter(f => f !== 'sales-date.js')
    .filter(f => /c\.completeCallAt\s*=\s*(?!.*(null|''))/.test(code(f)))
    .filter(f => !/^(card-view|undetermined)\.js$/.test(f));   /* 取り消し（null）と保険は別 */
  ok('🔴 完TEL日の記録は1本を通している', direct.length === 0, direct);

  /* 🔴 売上日の書き込みも1本 */
  const wr = files.filter(f => !/^(sales-date|card-view)\.js$/.test(f))
    .filter(f => /c\.salesDate\s*=/.test(code(f)) && !/pitSetSalesDate/.test(code(f)));
  ok('🔴 売上日の書き込みも1本を通している', wr.length === 0, wr);
}
{
  const idx = src('index.html');
  ok('🔴 新しい物差しを読み込んでいる', /js\/sales-date\.js\?v=/.test(idx));
  const posState = idx.indexOf('js/state.js');
  const posSd    = idx.indexOf('js/sales-date.js');
  const posSlot  = idx.indexOf('js/return-slot.js');
  const posCard  = idx.indexOf('js/card-view.js');
  const posRules = idx.indexOf('js/inspect-rules.js');
  const posMatch = idx.indexOf('js/quarter-match.js');
  const posPop   = idx.indexOf('js/return-popup.js');
  ok('🔴 読み込む順番が正しい（state → 売上日 → 使う側）',
     posState < posSd && posSd < posSlot && posSd < posCard && posSd < posRules && posSd < posMatch && posSd < posPop,
     { posState, posSd, posSlot, posCard, posRules, posMatch, posPop });

  const vers = [...idx.matchAll(/v?2\.0\.0/g)].length;
  ok('版が3か所そろっている（v2.0.0）', vers >= 3, vers);
  ok('版が v1 に戻っていない', !/content="1\./.test(idx));
  ['js/sales-date.js', 'js/return-slot.js', 'js/return-popup.js', 'js/card-view.js',
   'js/inspect-rules.js', 'js/inspect-fix.js', 'js/quarter-match.js', 'js/quarter.js',
   'js/quarter-store.js', 'js/undetermined.js', 'js/quarter-fix.js',
   'css/card-view.css', 'css/quarter.css']
    .forEach(f => ok('キャッシュ番号が付いている（' + f + '）', new RegExp(f.replace('.', '\\.') + '\\?v=') .test(idx)));
}
{
  /* 🔴 残す時も同じ名前（quarter.js のタブと quarter-store.js の見出し） */
  const q = src('js/quarter.js'), st = src('js/quarter-store.js');
  ok('🔴 残す中身にも「売上日ちがい」がある', /売上日ちがい:\s*cut\(/.test(st));
  ok('🔴 残した結果を開くタブの綴りがそろっている',
     /'Qまたぎ', '売上日ちがい', '整備ソフトだけ'/.test(q), 'quarter.js');
  ok('⚠ 「直す件数」に日付だけの直しを混ぜていない',
     /直す件数: \(res\.整備ソフトだけ\.length \+ res\.PitFlowだけ\.length[\s\S]{0,80}?res\.金額ちがい\.length \+ res\.内訳\.期間の外\.台数\)/.test(st), 'quarter-store.js');
}

console.log('\n── ⑨ ヘルプにも書いてある（読んで分かる形になっているか） ──');
{
  const hp = src('js/help-content.js');
  ok('🔴 ヘルプに売上日の説明がある', /売上日（v1\.185\.0）/.test(hp));
  ok('🔴 実績カウント日と別物だと書いてある', /実績カウント日とは別物/.test(hp), '');
  /* 🔒 v2.0.0 ヘルプも新しい鍵の書き方になっていること（アーカイブは管理者／画面からは特例） */
  ok('🔴 売上の数字が動かないと書いてある', /売上の数字は1円も動きません/.test(hp), '');
  ok('🔒 アーカイブ後は管理者だけ、と書いてある',
     /返車済みになった<strong>後<\/strong>＝カードからは<strong>管理者だけ<\/strong>/.test(hp), '');
  ok('🔴 特例（データチェック・クォーターチェックからは誰でも）が書いてある',
     /ただし特例[\s\S]{0,220}どなたでも<\/strong>直せます/.test(hp), '');
  ok('⚠ 確定金額・実績カウント日は特例に入らない、と書いてある',
     /確定金額・実績カウント日はこの特例に入りません/.test(hp), '');
  ok('🔴 完TELの窓で金額と一緒に入ると書いてある', /確定金額と一緒に入ります/.test(hp), '');
  ok('🔴 データチェックの規則も説明してある', /月がちがう」（v1\.185\.0）/.test(hp), '');
  ok('🔴 Qがちがうだけでは言わない、と書いてある', /クォーターがちがうだけなら言いません/.test(hp), '');
  ok('🔴 規則の本数がヘルプと合っている（41本）',
     /<strong>抜け・矛盾<\/strong>（41本）/.test(hp), '');
  ok('⚠ クォーターチェックの「準備中」が残っていない（v1.181.0 で中身ができた）',
     !/クォーターチェック[\s\S]{0,120}準備中/.test(hp), '');
  ok('🔢 v2.0.0 突き合わせの番号もヘルプに書いてある', /Q-816626/.test(hp), '');
}

console.log('\n── 🧭 まわりを壊していないか ──');
{
  const r = await p.evaluate(async () => {
    const views = ['board', 'today', 'return', 'sales', 'result', 'inspect'];
    const bad = [];
    for (const v of views){ try { showView(v); } catch (e){ bad.push(v + ':' + e.message); } }
    return bad;
  });
  ok('各ビューを開いてエラーなし', r.length === 0, r);
}
ok('🔴 画面がつまずいていない（赤いエラーが1つも出ていない）', errs.length === 0, errs.slice(0, 4));

console.log('\n' + (fail ? '' : '🎉 ') + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail ? 1 : 0);
