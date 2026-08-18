/* PitFlow v1.99.0 ── 売上なしでアーカイブ ／ 予約に戻す ／ ⋮メニューの整理
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-15）
     「最終的に売り上げ0円で返車したとか、そういう車両が必ず存在する。
       カード詳細の…から選べるメニューに『売上なしでアーカイブする』を追加。
       ついでにそのメニューも整理して、フェーズ移行はいらない。
       入庫済みの時点で仮予約にするもなし。
       **予約に戻す ／ 売上なしでアーカイブする ／ 消去する** の3つにする。
       予約に戻すは入庫実績自体をキャンセルにし、予約カレンダー状態に戻す。
       クリックした時点でフローやその時の内容は通常通りアーカイブする。
       来店履歴にも残すイメージ。でも実績には反映させずに、あくまで来店しただけの扱いで、
       ただ次回以降に内容を把握できるようにしたい」

   ◎ここで見張ること
     🔴 ⋮メニュー＝入庫済み以降は3つだけ。**フェーズ移動は1個も無い**
     🔴 入庫済みの車に「仮予約にする」を出さない／まだ予約の車には出す
     🔴 売上なし＝**実績カウント日を持たない**／実績カレンダー・売上・台数・メカ配分に1件も乗らない
     🔴 売上なし＝**来店履歴には出る**（「売上なし」と書く。¥0 とは書かない）
     🔴 予約に戻す＝入庫の記録だけ消す。**代車の貸出はそのまま残す**（ゆうた指定）

   ◎使い方
     python3 -m http.server 8998      ← 別ウィンドウ
     node test_nosale.mjs                                              */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8998;
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
await p.waitForFunction('window.state && window.openDetail && window.pitCardNoSale && window.pitSalesTier', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

/* 1枚だけ置いて詳細を開く。返ってくるのは ⋮メニューの中身 */
const openWith = card => p.evaluate(c => {
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = ymd(new Date());
  const full = Object.assign({
    id: 'cNS', resNo: 'R-0001', customer: '試験 太郎', kana: 'シケン タロウ', car: 'ノート',
    plate: '品川 300 あ 1234', boardId: 'default', division: 'div1',
    workType: 'general', dropType: 'drop', status: 'check',
    reserveDate: today, reserveTime: '10:00', log: []
  }, c);
  state.cards = [full];
  state.customers = [{
    id: 'cuNS', name: '試験 太郎', kana: 'シケン タロウ', contacts: [],
    vehicles: [{ id: 'vNS', plate: '品川 300 あ 1234', maker: '日産', car: 'ノート' }]
  }];
  full.customerId = 'cuNS';
  openDetail('cNS');
  const m = document.getElementById('cv-optmenu');
  return { menu: m ? m.innerHTML : '(メニューが無い)', top: (document.querySelector('.cv-top') || {}).textContent || '' };
}, card);

const closeIt = () => p.evaluate(() => { if (window.closeDetail) closeDetail(); });

console.log('\n── ⋮ 入庫済み以降のカード＝3つだけ ──');
{
  const r = await openWith({ status: 'work' });
  ok('🔴 予約に戻す がある', /予約に戻す/.test(r.menu), '');
  ok('🔴 売上なしでアーカイブする がある', /売上なしでアーカイブする/.test(r.menu), '');
  ok('🔴 消去する がある', /消去する/.test(r.menu), '');
  ok('🔴 フェーズ移動の見出しが無い', !/フェーズ移動/.test(r.menu), '');
  ok('🔴 cvMovePhase を呼ぶボタンが1つも無い', !/cvMovePhase/.test(r.menu), '');
  ok('🔴 入庫済みに「仮予約にする」を出さない', !/仮予約にする/.test(r.menu), '');
  ok('🔴 昔の「削除する」という言い方が残っていない', !/削除する/.test(r.menu), '');
  const n = (r.menu.match(/<button/g) || []).length;
  ok('🔴 ボタンはちょうど3つ', n === 3, n);
  await closeIt();
}

console.log('\n── ⋮ まだ入庫していない予約＝仮予約の切替を残す ──');
{
  const r = await openWith({ status: 'reserved' });
  ok('🔴 仮予約にする がある', /仮予約にする/.test(r.menu), '');
  ok('🔴 予約に戻す は出さない（もう予約なので）', !/予約に戻す/.test(r.menu), '');
  ok('🔴 売上なしでアーカイブ は出さない（まだ来ていない）', !/売上なしでアーカイブ/.test(r.menu), '');
  ok('消去する はある', /消去する/.test(r.menu), '');
  await closeIt();
  const r2 = await openWith({ status: 'reserved', tentative: true });
  ok('仮予約の車は「本予約に確定する」に変わる', /本予約に確定する/.test(r2.menu) && !/仮予約にする/.test(r2.menu), '');
  await closeIt();
}

console.log('\n── ⋮ もう片付いた車＝消去するだけ ──');
{
  const r = await openWith({ status: 'returned', completedAt: '2026-08-10', returnDate: '2026-08-10' });
  ok('🔴 実績の車に「予約に戻す」は出さない', !/予約に戻す/.test(r.menu), '');
  ok('🔴 実績の車に「売上なしでアーカイブ」は出さない', !/売上なしでアーカイブ/.test(r.menu), '');
  ok('消去する だけ残る', /消去する/.test(r.menu) && (r.menu.match(/<button/g) || []).length === 1, r.menu);
  await closeIt();
}

console.log('\n── 💤 売上なしでアーカイブする（本体） ──');
const doNoSale = () => p.evaluate(() => {
  window.cvNoSaleArchive();
  const c = state.cards.find(x => x.id === 'cNS');
  return {
    status: c.status, noSale: c.noSale, noSaleAt: c.noSaleAt || '',
    completedAt: c.completedAt || '', returnDateFinal: c.returnDateFinal || '',
    amountFinal: (c.amountFinal == null ? null : c.amountFinal),
    bayId: c.bayId, logN: (c.log || []).length,
    logLast: (function(e){ return (e && (e.label || e.text)) || ''; })((c.log || [])[(c.log || []).length - 1]),
    tier: window.pitSalesTier(c), cdate: window.pitSalesCountDate(c),
    inRange: window.pitSalesInRange(c, '2000-01-01', '2999-12-31', '2026-08-15'),
    isNoSale: window.pitCardNoSale(c)
  };
});
{
  await openWith({ status: 'workDone', returnStage: null, amountFinal: 12345, bayId: 'bay1', menu: '車検の見積もりだけ' });
  const r = await doNoSale();
  ok('🔴 印が付く（物差し pitCardNoSale が true）', r.isNoSale === true, r);
  ok('🔴 盤面から外れる（返車済み扱い）', r.status === 'returned', r.status);
  ok('🔴 実績カウント日は入れない（＝実績・売上に乗る道が無い）', r.completedAt === '', r.completedAt);
  ok('🔴 売上の区分に入らない（tier が null）', r.tier === null, r.tier);
  ok('🔴 数える日が無い', r.cdate === '', r.cdate);
  ok('🔴 どんなに広い期間でも数えない', r.inRange === false, r.inRange);
  ok('🔴 途中まで入れた金額は消さない（本当に見積もった額だから）', r.amountFinal === 12345, r.amountFinal);
  ok('PIT枠は外れる', !r.bayId, r.bayId);
  ok('フローに記録が残る', /売上なしでアーカイブ/.test(r.logLast), r.logLast);
  ok('片付けた日が残る', /^\d{4}-\d{2}-\d{2}$/.test(r.noSaleAt), r.noSaleAt);
  await closeIt();
}


console.log('\n── 📊 実績・売上・台数のどこにも出ない ──');
{
  const r = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'cNS');
    const day = c.returnDateFinal || c.reserveDate;
    /* 実績カレンダー：日付を無理やり入れても出さない（二重の守り） */
    const before = _resultDayCards(day).length;
    c.completedAt = day;
    const after = _resultDayCards(day).length;
    c.completedAt = '';
    /* 当日ビューの「返車済み」台数 */
    window._todayOffset = 0;
    showView('today'); renderToday();
    const todayTxt = (document.getElementById('view-today-body') || {}).textContent || '';
    return { before, after, day, todayTxt: todayTxt.slice(0, 400) };
  });
  ok('🔴 実績カレンダーに出ない', r.before === 0, r.before);
  ok('🔴 実績カウント日を入れても実績カレンダーに出ない（念のための二重の守り）', r.after === 0, r.after);
}
{
  const r = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'cNS');
    /* 売上ビューの月次：同じ車を「ふつうの実績」にした時と比べる */
    const moS = '2026-08-01', moE = '2026-08-31', td = '2026-08-15';
    c.completedAt = '2026-08-14'; c.returnDate = '2026-08-14'; c.returnDateFinal = '2026-08-14';
    const withNoSale = window.pitSalesTier(c);
    c.noSale = false;
    const asNormal = window.pitSalesTier(c);
    const rangeNormal = window.pitSalesInRange(c, moS, moE, td);
    c.noSale = true;
    const rangeNoSale = window.pitSalesInRange(c, moS, moE, td);
    return { withNoSale, asNormal, rangeNormal, rangeNoSale };
  });
  ok('🔴 印を外せば実績（actual）に戻る＝印だけで切り替わっている', r.asNormal === 'actual' && r.rangeNormal === true, r);
  ok('🔴 印が付いていれば当月の売上に入らない', r.withNoSale === null && r.rangeNoSale === false, r);
}
{
  const r = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'cNS');
    c.inspectors = ['小林 裕太']; c.mechanics = ['小林 裕太'];
    const view = (window.renderMechSummary || window.renderMech) ? true : false;
    /* メカの配分・整備ダッシュボードの物差しを直接聞く */
    const md = (typeof _mdDone === 'function') ? _mdDone(c) : null;
    return { view, md };
  });
  ok('🔴 整備ダッシュボードの「完了」に数えない', r.md === false, r.md);
}

console.log('\n── 👤 来店履歴には残る（「売上なし」と書く） ──');
{
  const r = await p.evaluate(() => {
    custOpen('cuNS');
    const txt = document.body.textContent || '';
    const hist = document.querySelector('.cd-hist');
    return {
      histHtml: hist ? hist.innerHTML : '(来店履歴が無い)',
      hasNoSale: /売上なし/.test(hist ? hist.innerHTML : ''),
      hasZeroYen: /¥0(?!\d)/.test(hist ? hist.innerHTML : ''),
      visitsTxt: (document.querySelector('.cd-stat') || {}).textContent || ''
    };
  });
  ok('🔴 来店履歴に1件出る', /cd-hrow/.test(r.histHtml), r.histHtml.slice(0, 200));
  ok('🔴 「売上なし」と書いてある', r.hasNoSale, '');
  ok('🔴 ¥0 とは書かない（入れ忘れと見分けが付かないため）', !r.hasZeroYen, '');
  ok('🔴 実績カレンダーへ飛ぶボタンにしない（実績に無いので）', !/pitGotoResultMonth/.test(r.histHtml), '');
  await p.evaluate(() => { if (window.custCloseModal) custCloseModal(); });
}

console.log('\n── ↩ 予約に戻す ──');
{
  await openWith({
    status: 'workDone', returnStage: 'returnWait', returnDate: '2026-08-20', returnTime: '15:00',
    returnDateFinal: '2026-08-20', completedAt: '2026-08-20', amountFinal: 88000, bayId: 'bay1',
    needLoaner: true, loanerId: 'lo1', loanerFrom: '2026-08-10', loanerTo: '2026-08-20',
    frontStaff: '小林 裕太', menu: 'ブレーキ異音', log: [{ text: '入庫済みにした', at: '8/10', by: '受付' }]
  });
  const r = await p.evaluate(() => {
    window.cvBackToReserve();
    const c = state.cards.find(x => x.id === 'cNS');
    return {
      status: c.status, stage: c.returnStage, rd: c.returnDate || '', rt: c.returnTime || '',
      rdf: c.returnDateFinal, comp: c.completedAt || '', amt: c.amountFinal,
      bay: c.bayId, noSale: !!c.noSale,
      needLoaner: !!c.needLoaner, loanerId: c.loanerId || '', loanerFrom: c.loanerFrom || '',
      front: c.frontStaff || '', menu: c.menu || '',
      logLast: (function(e){ return (e && (e.label || e.text)) || ''; })((c.log || [])[(c.log || []).length - 1]),
      logN: (c.log || []).length,
      tier: window.pitSalesTier(c)
    };
  });
  ok('🔴 予約に戻る', r.status === 'reserved', r.status);
  ok('🔴 完TEL・返車の予定が消える', !r.stage && r.rd === '' && r.rt === '' && !r.rdf, r);
  ok('🔴 実績カウント日が消える', r.comp === '', r.comp);
  ok('🔴 確定売上が消える（返した時に決まるものなので）', r.amt == null, r.amt);
  ok('🔴 PIT枠が外れる', !r.bay, r.bay);
  ok('🔴 代車の貸出はそのまま残す（ゆうた指定）', r.needLoaner === true && r.loanerId === 'lo1' && r.loanerFrom === '2026-08-10', r);
  ok('🔴 作業内容・担当者は残す（本当にあったことだから）', r.front === '小林 裕太' && r.menu === 'ブレーキ異音', r);
  ok('🔴 フロー（進捗ログ）は消さずに1行足す', r.logN === 2 && /予約に戻した/.test(r.logLast), r);
  ok('売上の区分は「予測」に戻る', r.tier === 'forecast', r.tier);
  await closeIt();
}

console.log('\n── 🔁 売上なし → 予約に戻す で印が外れる ──');
{
  await openWith({ status: 'work' });
  const r = await p.evaluate(() => {
    window.cvNoSaleArchive();
    window.cvBackToReserve();
    const c = state.cards.find(x => x.id === 'cNS');
    return { noSale: !!c.noSale, at: c.noSaleAt, status: c.status, tier: window.pitSalesTier(c) };
  });
  ok('🔴 印が外れる（やり直せる）', r.noSale === false && !r.at, r);
  ok('予約に戻っている', r.status === 'reserved' && r.tier === 'forecast', r);
  await closeIt();
}

/* ===================================================================
   📦 v1.136.0（ゆうた確定・2026-08-18）アーカイブ済みの車
   -------------------------------------------------------------------
   🗣「アーカイブまで行った車は基本マスターとか管理者以外は触れない。
      詳細を見たりは出来るが、金額をいじったり、消去したり、入庫中に戻したり などは出来ない」
   🗣「アーカイブに統一しよう」「アーカイブから戻すは管理者ならOK」
   🗣「消すは誰でもでいいが、ポップアップを2重で出す」
   =================================================================== */
console.log('\n── 📦 アーカイブ済みの ⋮（v1.136.0） ──');
const opt = () => p.evaluate(() => {
  const m = document.getElementById('cv-optmenu');
  return m ? m.innerHTML : '(メニューが無い)';
});
const setAdmin = v => p.evaluate(v => {
  if (!window.__origCanRestore) window.__origCanRestore = PitArchive.canRestore;
  PitArchive.canRestore = function(){ return v; };
  if (window.renderCardView) renderCardView(state.cards.find(x => x.id === 'cNS'), 'md-body-modal');
}, v);
{
  await openWith({ status: 'work' });
  await p.evaluate(() => { window.cvNoSaleArchive(); openDetail('cNS'); });
  await setAdmin(true);
  const m = await opt();
  ok('🔴 管理者：「アーカイブから戻す」が出る', /アーカイブから戻す/.test(m), m);
  ok('🔴 「予約に戻す」という言い方はもう使わない', !/>[^<]*予約に戻す/.test(m), m);
  ok('「売上なしでアーカイブする」はもう出さない', !/売上なしでアーカイブする/.test(m), '');
  ok('「消去する」は出る（誰でも押せる）', /消去する/.test(m), '');
  ok('🔒 管理のみ の札は出ない（管理者なので）', !/管理のみ/.test(m), '');
  const n = (m.match(/<button/g) || []).length;
  ok('ボタンはちょうど2つ', n === 2, n);
}
{
  await setAdmin(false);
  const m = await opt();
  ok('🔴 管理者でない：「アーカイブから戻す」に 🔒 管理のみ が付く', /アーカイブから戻す/.test(m) && /管理のみ/.test(m), m);
  ok('🔴 押す先が cvDenyRestore（実行に行かない）', /cvDenyRestore/.test(m) && !/cvAskBackToReserve/.test(m), m);
  ok('「消去する」は出たまま（誰でも押せる・ゆうた指定）', /消去する/.test(m), '');
}
{
  /* 🔴 ボタンを消しただけにしない＝外から呼んでも止まる */
  const r = await p.evaluate(() => {
    const before = state.cards.find(x => x.id === 'cNS').status;
    window.cvBackToReserve();                       /* 管理者でないのに直接呼ぶ */
    const after = state.cards.find(x => x.id === 'cNS').status;
    return { before, after, noSale: !!state.cards.find(x => x.id === 'cNS').noSale };
  });
  ok('🔴 管理者でなければ、直接呼んでも戻らない', r.after === r.before && r.noSale === true, r);
  await p.evaluate(() => { if (window.UI && UI.close) UI.close(); const o = document.getElementById('uid-ov'); if (o) o.classList.remove('open'); });
}
{
  /* 管理者に戻せば、ちゃんと戻る */
  await setAdmin(true);
  const r = await p.evaluate(() => {
    window.cvBackToReserve();
    const c = state.cards.find(x => x.id === 'cNS');
    return { st: c.status, noSale: !!c.noSale };
  });
  ok('🔴 管理者なら戻る（予約の状態へ・売上なしの印も外れる）', r.st === 'reserved' && r.noSale === false, r);
  await closeIt();
}
{
  /* 📦 帯＝いちばん上に、状態だけ */
  await openWith({ status: 'work' });
  const bar = await p.evaluate(() => {
    window.cvNoSaleArchive(); openDetail('cNS');
    const b = document.querySelector('.cv-archbar');
    return { has: !!b, txt: b ? b.textContent.trim() : '', first: !!(b && b.parentElement && b.parentElement.firstElementChild === b) };
  });
  ok('🔴 アーカイブ済みの帯が出る', bar.has, bar);
  ok('🔴 帯は「アーカイブ済み（売上なし）」', /アーカイブ済み（売上なし）/.test(bar.txt), bar.txt);
  ok('🔴 帯に「見るだけ」などの説明を入れない（ゆうた指定）', !/見るだけ|管理者だけ/.test(bar.txt), bar.txt);
  ok('同じことを2か所に書かない（中ほどの注記から見出しを外した）',
     await p.evaluate(() => { const n = document.querySelector('.cv-nosalenote'); return !n || !/アーカイブ済み/.test(n.textContent); }), '');
  await closeIt();
}

console.log('\n── 🗑 消去は2枚聞く（v1.136.0） ──');
{
  await openWith({ status: 'work' });
  const step1 = await p.evaluate(() => {
    window.cvAskDelete();
    const ov = document.getElementById('uid-ov');
    const del = document.getElementById('cv-delpop');
    return { ov: !!(ov && ov.classList.contains('open')),
             ttl: (document.querySelector('#uid-card h4') || {}).textContent || '',
             det: (document.querySelector('#uid-card .uid-d') || {}).textContent || '',
             okTxt: (document.getElementById('uid-ok') || {}).textContent || '',
             delShown: !!(del && del.classList.contains('show')) };
  });
  ok('🔴 1枚目が出る', step1.ov, step1);
  /* ⚠ UI.confirm(title, opt) は**第1引数が見出し**。_cvAsk が渡している opt.title は上書きされて出ない。
     ＝ 見出しに出るのは本文のほう。ここではその実物を見張る。 */
  ok('1枚目の見出しが「データごと無くなります／元に戻せません」', /データごと無くなります/.test(step1.ttl) && /元に戻せません/.test(step1.ttl), step1.ttl);
  ok('🔴 戻せないことを言う', /元に戻せません/.test(step1.det) || /元に戻せません/.test(step1.ttl), step1);
  ok('🔴 ふつうはアーカイブに落ち着くことを言う', /アーカイブ/.test(step1.det), step1.det);
  ok('ボタンは「それでも消去する」', /それでも消去する/.test(step1.okTxt), step1.okTxt);
  ok('🔴 この時点では2枚目（最終確認）はまだ出ていない', step1.delShown === false, step1);

  const step2 = await p.evaluate(() => {
    document.getElementById('uid-ok').click();
    return new Promise(function(res){ setTimeout(function(){
      const del = document.getElementById('cv-delpop');
      res({ shown: !!(del && del.classList.contains('show')),
            ttl: (document.querySelector('#cv-delpop .cv-dpt') || {}).textContent || '',
            note: (document.querySelector('#cv-delpop .cv-dpnote') || {}).textContent || '',
            btn: (document.querySelector('#cv-delpop .cv-dpdel') || {}).textContent || '',
            ng: (document.querySelector('#cv-delpop .cv-ng') || {}).textContent || '',
            n: state.cards.length });
    }, 120); });
  });
  ok('🔴 押すと2枚目が出る', step2.shown, step2);
  ok('2枚目の見出しが「本当に消去しますか？」', /本当に消去しますか/.test(step2.ttl), step2.ttl);
  ok('2枚目でも「元に戻せません」と言う', /元に戻せません/.test(step2.note), step2.note);
  ok('ボタンは「消去する」（「削除」は使わない）', step2.btn.trim() === '消去する' && step2.ng.trim() === 'やめる', step2);
  ok('🔴 2枚目を出しただけでは、まだ1枚も消えていない', step2.n === 1, step2.n);

  const gone = await p.evaluate(() => { window.cvDeleteCard(); return state.cards.length; });
  ok('2枚目で押して初めて消える', gone === 0, gone);
}
{
  /* 実績を持った車は、2枚目で何が消えるかを名指しする */
  await openWith({ status: 'returned', completedAt: '2026-08-10', amountFinal: 88000, returnDate: '2026-08-10' });
  const d = await p.evaluate(() => {
    const el = document.getElementById('cv-delpop');
    return { note: el ? el.textContent : '', hard: !!(el && el.classList.contains('cv-delpop-hard')) };
  });
  ok('🔴 実績・確定売上・来店履歴から消えると書く', /実績/.test(d.note) && /確定売上/.test(d.note) && /来店履歴/.test(d.note), d.note);
  ok('見た目も分ける（同じ窓に見せない）', d.hard === true, d);
  await closeIt();
}
{
  /* 言葉の統一＝画面に「削除」を残さない */
  const cv = fs.readFileSync('js/card-view.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');   /* コメントを外してから調べる */
  ok('🔴 画面の文字に「削除」を使っていない', !/削除/.test(cv), (cv.match(/.{0,40}削除.{0,20}/) || [''])[0]);
  const ar = fs.readFileSync('js/archive-pit.js', 'utf8');
  ok('🔴 アーカイブ判定は archive-pit.js の1本', /cardArchived/.test(ar) && /PitArchive/.test(ar), '');
  ok('🔴 戻せない時の断り文は顧客・車両と同じ1本', /戻せるのは管理者だけです/.test(ar), '');
}

console.log('\n── 🧭 物差しが1本か・まわりが壊れていないか ──');
{
  const sc = fs.readFileSync('js/sales-count.js', 'utf8');
  ok('🔴 判定の物差しが sales-count.js に1本ある', /function pitCardNoSale/.test(sc) && /window\.pitCardNoSale/.test(sc), '');
  ok('🔴 区分・期間・数える日の3本すべてでふさいでいる',
     (sc.match(/pitCardNoSale\(c\)/g) || []).length >= 3, (sc.match(/pitCardNoSale\(c\)/g) || []).length);

  /* 集計する側が c.noSale を直に見ていないか（物差しを迂回していないか） */
  for (const f of ['sales.js', 'result.js', 'mydash.js', 'maintdash.js', 'today.js', 'mech-summary.js', 'customers.js', 'search.js', 'card-view.js']) {
    const src = fs.readFileSync('js/' + f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');   /* コメントを外してから調べる */
    const direct = /[^.\w]c\.noSale\b/.test(src) && f !== 'card-view.js';
    ok('物差しを迂回していない（' + f + '）', !direct, f);
  }

  const cv = fs.readFileSync('js/card-view.js', 'utf8');
  ok('🔴 ⋮メニューの中身が1か所（optMenuHtml）にまとまっている', /function optMenuHtml/.test(cv), '');
  ok('🔴 ブラウザ純正の confirm を使っていない', !/[^.\w]confirm\s*\(/.test(cv.replace(/UI\.confirm/g, '')), '');

  /* 見本データでも全ビューが開けるか */
  await p.evaluate(() => { if (window.pitSampleData) pitSampleData(); });
  await p.waitForTimeout(400);
  for (const v of ['dashboard', 'today', 'task', 'reserve', 'return', 'result', 'sales', 'customers']) {
    await p.evaluate(x => { try { showView(x); } catch (e) {} }, v);
    await p.waitForTimeout(220);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
