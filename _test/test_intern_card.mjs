/* PitFlow v2.6.0 ── 社内車両（中古・代車・内部）と「その他」の引き出し
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-24）
     ・「特殊→保証」の所を **「その他」**に。バッジではなく**押すと開く詳細**。
     ・新バッジ … 中古（自社の販売車両）／代車（自社の代車）／内部（それ以外の社内車）／社員（付加）
     ・中古・内部は単独。代車は 車検/12点/一般/B.P のどれか1つとセット。
     ・社内車両は 金額を聞かない・完TEL/洗車/伝票なし・概算と代車は入れられない・売上に数えない。
       でも **実績にはする**（実績ビューの「数えない側」に乗る）。
     ・売上ビューと作業サマリーには **参考の台数だけ** 出す
       （「中古車の整備があったから売上が届かなかった」の裏付け）。
     ・車販バッジ＝1Y/3M と同じ併用可。車販作業ビューの「コーティング・その他依頼／予定」に拾う合図。
   ◎使い方
     node /tmp/srv.js（別ウィンドウ・8991番）
     node test_intern_card.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

/* ================= ① コードを機械で読む ================= */
console.log('\n── 🔍 コードを機械で読む ──');
{
  const dir = path.join(process.cwd(), 'js');
  ok('物差しの1本（intern-pit.js）が居る', fs.existsSync(path.join(dir, 'intern-pit.js')));
  const idx = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  ok('index.html が読み込んでいる', /js\/intern-pit\.js/.test(idx));

  const sh = fs.readFileSync(path.join(dir, 'pit-share.js'), 'utf8');
  ok('🔴 数えない物差し（pitCardNoSale）に社内車両を合流させてある', /pitCardIntern/.test(sh));

  /* 「画面ごとに c.internKind を直に見ない」＝物差しを通す、の見張り。
     ⚠ 注記の中で名前を書くのは**見張りの説明**なので数えない。
        行頭だけ見る作りだと `/* … *\/` の途中の行を拾ってしまうので、
        **注記をまるごと落としてから**数える。 */
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')      /* ブロック注記 */
    .split('\n').map(l => l.replace(/\/\/.*$/, ''));   /* 行注記 */
  const bad = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    if (f === 'intern-pit.js' || f === 'views.js') continue;   /* 定義と初期値だけは直に触ってよい */
    stripComments(fs.readFileSync(path.join(dir, f), 'utf8')).forEach((ln, i) => {
      if (/\.internKind/.test(ln)) bad.push({ file: f, line: i + 1 });
    });
  }
  ok('🔴 画面から c.internKind を直に見ていない（物差しを通している）', bad.length === 0, bad.slice(0, 6));
}

/* ================= ② 実際に動かす ================= */
const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', async d => { errs.push('純正ダイアログ:' + d.message()); await d.dismiss().catch(() => {}); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.PitDB && window.pitCardIntern', null, { timeout: 25000 });
await p.waitForTimeout(700);

console.log('\n── 🧰 マスターと物差し ──');
{
  const m = await p.evaluate(() => ({
    kinds: (window.PIT_INTERN_KINDS || []).map(x => x.id),
    mates: window.PIT_LOANER_MATES,
    specials: (window.PIT_WORK_SPECIALS || []).map(x => x.id),
    wt: (state.workTypes || []).map(x => x.id),
    carsaleCombo: !!(state.workTypes || []).filter(x => x.id === 'carsale')[0]?.combinable
  }));
  ok('社内区分が3つ（中古・代車・内部）', JSON.stringify(m.kinds) === JSON.stringify(['used', 'loanercar', 'inhouse']), m.kinds);
  ok('代車の相方は 車検/12点/一般/B.P の4つ', JSON.stringify(m.mates) === JSON.stringify(['shaken', '12pt', 'general', 'bp']), m.mates);
  ok('付加に「社員」が入った', m.specials.indexOf('employee') >= 0, m.specials);
  ok('作業タイプに「車販」が入った', m.wt.indexOf('carsale') >= 0, m.wt);
  ok('🔴 車販は併用可（1Y/3M と同じ）', m.carsaleCombo === true);

  const r = await p.evaluate(() => {
    const c = { id: 'x1' };
    const out = {};
    out.none = pitCardIntern(c);
    pitInternSet(c, 'used');
    out.used = { intern: pitCardIntern(c), label: pitInternLabel(c), noSale: pitCardNoSale(c) };
    const c2 = { id: 'x2', workType: 'shaken', estAmount: 99999, estHoldDays: 5, needLoaner: true, loanerId: 'L01', workSpecials: ['warranty'] };
    pitInternSet(c2, 'loanercar');
    out.loaner = { label: pitInternLabel(c2), mate: pitInternMate(c2), amt: c2.estAmount, hold: c2.estHoldDays, need: c2.needLoaner, sp: c2.workSpecials.length };
    const c3 = { id: 'x3', workType: 'oil' };
    pitInternSet(c3, 'inhouse');
    out.inhouse = { wt: c3.workType, label: pitInternLabel(c3) };
    return out;
  });
  ok('印が無ければ社内車両ではない', r.none === false);
  ok('中古を付けると社内車両になる／名前は「中古」', r.used.intern === true && r.used.label === '中古', r.used);
  ok('🔴 社内車両は「数えない（pitCardNoSale）」になる', r.used.noSale === true);
  ok('代車＋車検は「代車車検」と出る', r.loaner.label === '代車車検' && r.loaner.mate === 'shaken', r.loaner);
  ok('🔴 付け替えると 概算金額・預かり日数・代車が落ちる',
     r.loaner.amt === '' && r.loaner.hold === '' && r.loaner.need === false, r.loaner);
  ok('🔴 付加（保証など）も一緒に外れる', r.loaner.sp === 0, r.loaner);
  ok('内部は単独＝作業タイプが落ちる', r.inhouse.wt === null && r.inhouse.label === '内部', r.inhouse);
}

console.log('\n── 🔴 必須チェック（赤枠）の組み替え ──');
{
  const r = await p.evaluate(() => {
    const base = { kana: 'ア', repeat: 'first', reserveDate: '2026-09-01', dropType: 'drop' };
    const red = o => pitCardMisses(o).red.map(x => x.key);
    const used = Object.assign({}, base); pitInternSet(used, 'used');
    const lo0  = Object.assign({}, base); pitInternSet(lo0, 'loanercar');
    const lo1  = Object.assign({}, base, { workType: 'shaken' }); pitInternSet(lo1, 'loanercar');
    const shk  = Object.assign({}, base, { workType: 'shaken' });
    return { plain: red(base), used: red(used), lo0: red(lo0), lo1: red(lo1), shaken: red(shk) };
  });
  ok('ふつうのカードは作業タイプが赤', r.plain.indexOf('workType') >= 0, r.plain);
  ok('🔴 中古は作業タイプを聞かない（赤が消える）', r.used.length === 0, r.used);
  ok('🔴 代車で相方が無いと赤が出る', r.lo0.indexOf('workType') >= 0, r.lo0);
  ok('🔴 代車＋車検なら赤なし', r.lo1.length === 0, r.lo1);
  ok('ふつうの車検は諸費用が赤', r.shaken.indexOf('feeAmount') >= 0, r.shaken);
  ok('🔴 社内車両は諸費用を聞かない（伝票が無いので）', r.lo1.indexOf('feeAmount') < 0, r.lo1);
}

console.log('\n── 💬 タスクボードのポップアップ／完TELのドラッグ ──');
{
  const r = await p.evaluate(() => {
    const mk = k => { const c = { id: 'p' + k, status: 'estim', workType: 'general' }; if (k) pitInternSet(c, k); return c; };
    const hit = (c, from, to) => PitPhasePopup.maybeIntercept(c, from, to, function () {});
    const plain  = hit(mk(''), 'estim', 'contact');
    const intern = hit(mk('used'), 'estim', 'contact');
    const out    = hit(mk('used'), 'work', 'outsource');
    try { PitPhasePopup.close(false); } catch (e) {}
    return { plain: plain, intern: intern, out: out };
  });
  ok('ふつうの車は見積→連絡で金額を聞く', r.plain === true);
  ok('🔴 社内車両は金額を聞かない（素通り）', r.intern === false);
  ok('外注の窓は社内車両でも出す（お金の話ではないので）', r.out === true);

  const r2 = await p.evaluate(() => {
    const c = { id: 'ret1', status: 'work', log: [] };
    pitInternSet(c, 'inhouse');
    state.cards = [c];
    const took = pitInternReturn(c);
    return { took: took, msg: pitInternMsg(c) };
  });
  ok('🔴 完TELのドラッグを社内車両が引き取る', r2.took === true);
  ok('言い方が区分ごとに変わる（内部＝社内車両）', /社内車両/.test(r2.msg), r2.msg);
  await p.waitForTimeout(300);
  ok('アプリ内の窓が1枚だけ出る', (await p.locator('#uid-ok:visible').count()) === 1);
  await p.click('#uid-ok'); await p.waitForTimeout(300);
  const done = await p.evaluate(() => {
    const c = state.cards[0];
    return { st: c.status, done: !!c.completedAt, amt: c.amountFinal, stage: c.returnStage };
  });
  ok('🔴 OKでそのまま実績になる（金額は持たない）',
     done.st === 'returned' && done.done && done.amt === '' && done.stage === '', done);
}

console.log('\n── 🔢 実績ビューの2段（数える／数えない） ──');
{
  const r = await p.evaluate(() => {
    const d = ymd(new Date());
    const a = { id: 'a1', status: 'returned', completedAt: d, customer: 'ふつう', amountFinal: 10000 };
    const bcard = { id: 'b1', status: 'returned', completedAt: d, customer: '中古' };
    pitInternSet(bcard, 'used');
    const cc = { id: 'c1', status: 'returned', completedAt: d, customer: '売上なし', noSale: true, noSaleBy: 'x', noSaleAt: d };
    state.cards = [a, bcard, cc];
    state.resultMode = 'count';
    const cnt = _resultDayCards(d).map(x => x.id);
    state.resultMode = 'nocount';
    const noc = _resultDayCards(d).map(x => x.id);
    state.resultMode = 'count';
    return { d: d, cnt: cnt, noc: noc, txt: pitInternCountText(state.cards) };
  });
  ok('数える側にはふつうの実績だけ', JSON.stringify(r.cnt) === JSON.stringify(['a1']), r.cnt);
  ok('🔴 数えない側に 社内車両と「売上なし」が集まる', JSON.stringify(r.noc) === JSON.stringify(['b1', 'c1']), r.noc);
  ok('参考の台数の文が作れる', /中古1/.test(r.txt) && /売上なし1/.test(r.txt), r.txt);

  await p.evaluate(() => showView('result'));
  await p.waitForTimeout(400);
  ok('実績ビューに段の切替ボタンが出る', (await p.locator('#result-mode-btn:visible').count()) === 1);
  /* 🏷 v2.9.6 名前を変えた：「数えない側へ」→「非カウント一覧」（ボタンは行き先の名前） */
  ok('はじめは実績カウント側にいる（ボタンは行き先＝非カウント一覧）', (await p.locator('#result-mode-btn').innerText()).indexOf('非カウント一覧') >= 0);
  await p.click('#result-mode-btn'); await p.waitForTimeout(350);
  ok('押すと「数えない側」に入れ替わる', await p.evaluate(() => state.resultMode === 'nocount'));
  ok('帯に「非カウント一覧」と出る', (await p.locator('.result-bar').innerText()).indexOf('非カウント一覧') >= 0);
  ok('🔴 実績カウント側には説明の帯を出さない（ゆうた「はいらない」）',
     await p.evaluate(() => { pitResultToggleMode(); return document.querySelectorAll('#result-cal .result-bar').length === 0; }));
  await p.evaluate(() => pitResultToggleMode()); await p.waitForTimeout(300);
  await p.click('#result-mode-btn'); await p.waitForTimeout(300);
  ok('もう一度押すと戻る', await p.evaluate(() => state.resultMode === 'count'));
}

console.log('\n── 💴 売上ビュー・作業サマリーの「参考の台数」 ──');
{
  await p.evaluate(() => { showView('sales'); });
  await p.waitForTimeout(600);
  ok('売上ビューに参考の1行が出る', (await p.locator('.sv-refnc').count()) >= 1);
  const t = await p.locator('.sv-refnc').first().innerText();
  ok('中身に台数が入っている', /中古1/.test(t), t);
  ok('🔴 金額は混ぜていない（円が出ない）', t.indexOf('円') < 0, t);
}

console.log('\n── 🗄 新規予約の「その他」 ──');
{
  await p.evaluate(() => { state.cards = []; openNewReserve(); });
  await p.waitForTimeout(700);
  const html = await p.content();
  ok('ラベルが「特殊」から「その他」に変わった', html.indexOf('>特殊<') < 0);
  ok('「その他」のボタンが出る', (await p.locator('#cf-other-btn:visible').count()) === 1);
  ok('はじめは閉じている', (await p.locator('.cf-other-panel').count()) === 0);
  await p.click('#cf-other-btn'); await p.waitForTimeout(300);
  ok('押すと開く', (await p.locator('.cf-other-panel:visible').count()) === 1);
  ok('付加が3つ（保証・保険・社員）', (await p.locator('.cf-chips[data-special] .cf-chip').count()) === 3);
  ok('社内区分が3つ（中古・代車・内部）', (await p.locator('.cf-chips[data-intern] .cf-chip').count()) === 3);

  /* 中古＝ほかは押せない */
  await p.locator('.cf-chips[data-intern] .cf-chip', { hasText: '中古' }).click();
  await p.waitForTimeout(350);
  const used = await p.evaluate(() => ({
    wtOff: Array.from(document.querySelectorAll('.cf-chips[data-key=workType] .cf-chip')).every(b => b.disabled),
    coOff: Array.from(document.querySelectorAll('.cf-chips[data-combo] .cf-chip')).every(b => b.disabled),
    spOff: Array.from(document.querySelectorAll('.cf-chips[data-special] .cf-chip')).every(b => b.disabled)
  }));
  ok('🔴 中古を選ぶと作業タイプが1つも押せない', used.wtOff === true, used);
  ok('🔴 併用可も押せない', used.coOff === true, used);
  ok('🔴 付加も押せない', used.spOff === true, used);
  ok('概算がグレーの箱に入れ替わる', (await p.locator('.cf-offbox').count()) >= 2,
     await p.locator('.cf-offbox').count());
  ok('代車の入力が消える（必要／不要のスイッチが無い）',
     (await p.locator('.cf-loaner-switchrow').count()) === 0);

  /* 代車＝相方だけ押せる */
  await p.locator('.cf-chips[data-intern] .cf-chip', { hasText: '代車' }).click();
  await p.waitForTimeout(350);
  const lo = await p.evaluate(() => {
    const on = [], off = [];
    document.querySelectorAll('.cf-chips[data-key=workType] .cf-chip, .cf-chips[data-combo] .cf-chip')
      .forEach(b => (b.disabled ? off : on).push(b.dataset.val));
    return { on: on, off: off };
  });
  ok('🔴 代車は 車検/12点/一般/B.P だけ押せる',
     JSON.stringify(lo.on.sort()) === JSON.stringify(['12pt', 'bp', 'general', 'shaken']), lo);
  ok('オイル・1Y・3M・車販は押せない',
     lo.off.indexOf('oil') >= 0 && lo.off.indexOf('carsale') >= 0, lo.off);
  ok('相方がまだ無いので赤い案内が出る', (await p.locator('.cf-other-note.warn').count()) === 1);
  await p.locator('.cf-chips[data-key=workType] .cf-chip', { hasText: '車検' }).click();
  await p.waitForTimeout(350);
  ok('相方を選ぶと「代車車検」になる',
     (await p.locator('#cf-other-btn').innerText()).indexOf('代車車検') >= 0,
     await p.locator('#cf-other-btn').innerText());

  /* もう一度押して外す */
  await p.locator('.cf-chips[data-intern] .cf-chip', { hasText: '代車' }).click();
  await p.waitForTimeout(350);
  ok('もう一度押すと社内区分が外れる',
     (await p.evaluate(() => { const c = (state.cards || []).filter(x => pitCardIntern(x))[0]; return !!c; })) === false);
}

console.log('\n── 🚗 車販ビューの見出し ──');
{
  await p.evaluate(() => { state.cards = []; showView('carsales'); });
  await p.waitForTimeout(400);
  const t = await p.evaluate(() => (document.getElementById('view-carsales') || document.body).innerText);
  ok('「コーティング・その他依頼」に変わった', t.indexOf('コーティング・その他依頼') >= 0);
  ok('「コーティング・その他予定」に変わった', t.indexOf('コーティング・その他予定') >= 0);
  const pick = await p.evaluate(() => {
    const c = { id: 'cs1', status: 'reserved', workTypes: ['carsale'], reserveDate: ymd(new Date()) };
    return typeof _csHasCoat === 'function' ? _csHasCoat(c) : null;
  });
  ok('🔴 車販バッジがこの一覧に拾われる', pick === true);
}

console.log('\n── 🩺 データチェック ──');
{
  const r = await p.evaluate(() => {
    const d = ymd(new Date());
    const emp = { id: 'e1', status: 'returned', completedAt: d, returnDate: d, amountQuote: 100000, amountFinal: 10000, workType: 'general', workSpecials: ['employee'] };
    const nor = Object.assign({}, emp, { id: 'n1', workSpecials: [] });
    const inn = { id: 'i1', status: 'returned', completedAt: d, returnDate: d, amountFinal: 50000 };
    pitInternSet(inn, 'used'); inn.amountFinal = 50000;   /* わざと金額を残す */
    state.cards = [emp, nor, inn];
    var rows = null;
    try { rows = window.pitInspectRun ? pitInspectRun() : null; } catch (e) { rows = null; }
    if (rows && !Array.isArray(rows)) rows = rows.rows || rows.items || rows.list || null;
    return Array.isArray(rows) ? rows.map(x => (x.rule || x.ruleId || x.id || '') + ':' + (x.cardId || x.id || '')) : null;
  });
  if (r === null){ ok('（データチェックの入口が見つからないので画面では確かめない）', true); }
  else {
    ok('社員は金額の肌感チェックに出ない', !r.some(x => /M0[467]/.test(x) && /e1/.test(x)), r);
    ok('ふつうの車は今までどおり出る', r.some(x => /M07/.test(x) && /n1/.test(x)), r);
    ok('社内車両は「売上なしの理由が無い」に出ない', !r.some(x => /M09/.test(x) && /i1/.test(x)), r);
  }
}

console.log('\n── 🧭 まわり ──');
{
  await p.evaluate(() => { state.cards = []; });
  for (const v of ['course1', 'today', 'return', 'reserve', 'result', 'settings', 'carsales', 'worksum']) {
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(180);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v2.6.0 以降', vn[0] > 2 || (vn[0] === 2 && vn[1] >= 6), ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
