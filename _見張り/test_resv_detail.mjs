/* PitFlow v1.56.0 ── 予約詳細（入庫前の1画面）と、予約編集の「保存する／キャンセル」
   -------------------------------------------------------------------
   ◎ゆうた依頼
     ・カード詳細の顧客名の下に**小さくフリガナ**。
     ・**新規／リピーターのバッジ**。
     ・予約詳細の代車は**代車ナンバーではなく車種名**。
     ・予約（入庫に至る前）の段階は、表紙／フロー／整備／バックオフィスではなく
       **「予約詳細」1画面だけ**。上に**概算 預かり日数と概算 金額を大きめ**、その下に
       **フローの内容とアクション**。**フローは共通のものを引っ張る**（写しを作らない）。
     ・カード詳細から予約編集に入ったら、**エリア外クリックでは閉じない**。
       右上の**「保存する」「キャンセル」**（✕ の代わり）でだけ出られて、
       **そこまで自動保存は効かない**。**どちらを押しても予約詳細に戻る**（勝手に閉じない）。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8979      ← 別ウィンドウ
     node test_resv_detail.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8979;
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
await p.waitForFunction('window.state && window.renderCardView && window.PitDB && window.PitFlowLog', null, { timeout: 25000 });
await p.waitForTimeout(900);

/* 試験用のカードを2枚だけ用意する（予約の段階／入庫したあと）。
   ⚠ 本物のサンプルは触らず、頭に足すだけ。 */
await p.evaluate(() => {
  window.pitCurrentStaffName = function(){ return 'サンプル 花子'; };
  const _d = n => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  const base = {
    tel: '090-1111-2222', car: 'アクア', plate: '横浜 300 あ 12-34', karteNo: '1234',
    boardId: 'default', division: 'div1', workType: 'shaken', frontStaff: 'フロント 一郎', reserveStaff: '予約 二郎',
    /* 🔴🔴 2026-08-21 直した：**決め打ちの日付をやめる。**
       直す前は `reserveDate:'2026-08-20'` と**その日の日付を書き込んで**いた。
       ＝ **翌日からは「入庫日を過ぎた未入庫」**になり、v1.101.0 の自動移動で
          カードが勝手に「未入庫（cancelled）」へ移り、予約詳細の中身ごと消えて落ちる。
       ⚠ **見張りにも見本にも「◯年◯月◯日」を書かない。必ず今日からの日数で作る。** */
    reserveDate: _d(3), estHoldDays: 3, estAmount: 88000,
    needLoaner: true, loanerId: 'L01', loanerTo: _d(8), log: [], maint: {}, office: {}
  };
  const r = Object.assign({}, base, { id: 'TR1', resNo: 'R-TR1', status: 'reserved',
    customer: '試験 太郎', sei: '試験', mei: '太郎', kana: 'シケン タロウ', seiKana: 'シケン', meiKana: 'タロウ', repeat: 'repeater' });
  const w = Object.assign({}, base, { id: 'TW1', resNo: 'R-TW1', status: 'check',
    customer: '入庫 次郎', kana: 'ニュウコ ジロウ', repeat: 'first' });
  const k = Object.assign({}, base, { id: 'TK1', resNo: 'R-TK1', status: 'reserved',
    customer: '', kana: 'カナダケ ハナコ', repeat: '' });   /* 漢字が無い＝名前の欄がカナになる人 */
  state.cards.unshift(r, w, k);
});

const open = async (id) => { await p.evaluate(i => openCard(i, 'modal'), id); await p.waitForTimeout(350); };

console.log('\n── 🔤 顧客名の下にフリガナ ──');
{
  await open('TR1');
  const r = await p.evaluate(() => {
    const k = document.querySelector('#md-body-modal .cv-kana');
    const nm = document.querySelector('#md-body-modal .cv-nm');
    return { kana: k ? k.textContent.trim() : null, nm: nm ? nm.textContent.trim() : null,
             under: !!(k && nm && (k.compareDocumentPosition(nm) & Node.DOCUMENT_POSITION_PRECEDING)),
             size: k ? parseFloat(getComputedStyle(k).fontSize) : 0,
             nmSize: nm ? parseFloat(getComputedStyle(nm).fontSize) : 0 };
  });
  ok('フリガナが出る', r.kana === 'シケン タロウ', r);
  ok('お客様名の「下」に出ている', r.under === true, r);
  ok('名前より小さい字', r.size > 0 && r.size < r.nmSize, r);

  await open('TK1');
  const r2 = await p.evaluate(() => {
    const k = document.querySelector('#md-body-modal .cv-kana');
    const nm = document.querySelector('#md-body-modal .cv-nm');
    return { kana: k ? k.textContent.trim() : null, nm: nm ? nm.textContent.trim() : '' };
  });
  ok('🔴 漢字が無い人＝名前がカナなので、同じ文字を2度出さない', r2.kana === null, r2);
  ok('その人の名前はカナのまま出ている', /カナダケ ハナコ/.test(r2.nm), r2);
}

console.log('\n── 🏷 新規／リピーターのバッジ ──');
{
  await open('TR1');
  const a = await p.evaluate(() => { const e = document.querySelector('#md-body-modal .cv-rep'); return e ? { t: e.textContent.trim(), cls: e.className } : null; });
  ok('リピーターのバッジが出る', a && a.t === 'リピーター', a);
  ok('リピーター用の色が付いている', a && /cv-rep-repeater/.test(a.cls), a);

  await open('TW1');
  const c = await p.evaluate(() => { const e = document.querySelector('#md-body-modal .cv-rep'); return e ? { t: e.textContent.trim(), cls: e.className } : null; });
  ok('初回のバッジが出る', c && c.t === '初回' && /cv-rep-first/.test(c.cls), c);

  await open('TK1');
  const n = await p.evaluate(() => !!document.querySelector('#md-body-modal .cv-rep'));
  ok('🔴 選んでいない人には出さない（勝手に決めない）', n === false);
}

console.log('\n── 🚗 代車は車種名（代車ナンバーではなく） ──');
{
  await open('TR1');
  const r = await p.evaluate(() => {
    const e = document.querySelector('#md-body-modal .cv-lowhich');
    const l = (state.loaners || []).find(x => x.id === 'L01');
    return { shown: e ? e.textContent.trim() : null, model: l ? l.model : '', name: l ? l.name : '' };
  });
  ok('車種名が出ている', r.shown === r.model && !!r.model, r);
  ok('🔴 「代車1」のような番号の呼び名は出ない', r.shown !== r.name, r);
  const helper = await p.evaluate(() => ({
    fn: typeof window.pitLoanerModel === 'function',
    v: window.pitLoanerModel ? pitLoanerModel('L01') : null,
    none: window.pitLoanerModel ? pitLoanerModel('なにもない') : null
  }));
  ok('呼び名の作り方が1か所にある（pitLoanerModel）', helper.fn === true && helper.v === r.model, helper);
  ok('知らない代車でも落ちない', helper.none === '', helper);
  const src = fs.readFileSync('js/card-view.js', 'utf8');
  ok('🔴 card-view.js は自分で組み立てず借りている', /pitLoanerModel\(c\.loanerId\)/.test(src));
}

console.log('\n── 📋 予約の段階は「予約詳細」1画面だけ ──');
{
  await open('TR1');
  const r = await p.evaluate(() => {
    const tabs = Array.prototype.map.call(document.querySelectorAll('#md-body-modal .cv-tab'), t => t.textContent.trim());
    return { tabs: tabs, resv: !!document.getElementById('cv-p-resv'),
      cover: !!document.getElementById('cv-p-cover'), flow: !!document.getElementById('cv-p-flow'),
      maint: !!document.getElementById('cv-p-maint'), office: !!document.getElementById('cv-p-office'),
      pbar: !!document.querySelector('#md-body-modal .cv-pbar') };
  });
  ok('タブは1つだけ', r.tabs.length === 1, r.tabs);
  ok('その名前は「予約詳細」', /予約詳細/.test(r.tabs[0] || ''), r.tabs);
  ok('🔴 表紙は出さない', r.cover === false);
  ok('🔴 整備は出さない', r.maint === false);
  ok('🔴 バックオフィスは出さない', r.office === false);
  ok('🔴 フロー（単独タブ）も出さない', r.flow === false);
  ok('予約詳細の面がある', r.resv === true);
  ok('進み具合のバーは今までどおり出る', r.pbar === true);

  const big = await p.evaluate(() => {
    const bs = Array.prototype.map.call(document.querySelectorAll('#cv-p-resv .cv-rsvb'), e => ({
      label: e.querySelector('.cv-rsvbl').textContent.trim(),
      val: e.querySelector('.cv-rsvbv').textContent.trim(),
      size: parseFloat(getComputedStyle(e.querySelector('.cv-rsvbv')).fontSize)
    }));
    const flow = document.querySelector('#cv-p-resv .cv-flow');
    const add = document.querySelector('#cv-p-resv .pf-flowadd');
    const y = e => e ? e.getBoundingClientRect().top : 0;
    return { bs: bs, hasFlow: !!flow, hasAdd: !!add,
             order: y(document.querySelector('#cv-p-resv .cv-rsvbig')) < y(flow) && y(flow) < y(add) };
  });
  ok('概算 預かり日数が上に出る', big.bs[0] && /預かり日数/.test(big.bs[0].label) && big.bs[0].val === '3日', big.bs);
  ok('概算 金額が上に出る', big.bs[1] && /金額/.test(big.bs[1].label) && big.bs[1].val === '¥88,000', big.bs);
  ok('どちらも大きめの字（20px超）', big.bs.every(x => x.size > 20), big.bs);
  ok('その下にフローの内容が出る', big.hasFlow === true);
  ok('フローのアクションもそのまま付く', big.hasAdd === true);
  ok('並びは 概算 → フロー → アクション', big.order === true, big);

  /* 🔴 フローは「引っ張ってくる」＝写しを作っていない */
  const src = fs.readFileSync('js/card-view.js', 'utf8');
  ok('🔴 予約詳細はフローを flowTab() から引いている', /function reserveTab[\s\S]{0,900}h \+= flowTab\(c\);/.test(src));

  /* 実際に記録を足すと、その場で出る（描き直しの相手を間違えていない） */
  const add = await p.evaluate(() => {
    PitFlowLog.add('TR1', 'テストの用件', 'cv');
    const rows = document.querySelectorAll('#cv-p-resv .cv-frow');
    return { n: rows.length, txt: rows[0] ? rows[0].textContent : '' };
  });
  ok('🔴 アクションを記録すると、その場のフローに出る', add.n >= 1 && /テストの用件/.test(add.txt), add);
  const who = await p.evaluate(() => PitFlowLog.byOf(state.cards.find(c => c.id === 'TR1').log.slice(-1)[0]));
  ok('担当は今までどおり入る（v1.55.0 の作りを壊していない）', who === 'サンプル 花子', who);
}

console.log('\n── 入庫したあとは、今までどおり4つのタブ ──');
{
  await open('TW1');
  const r = await p.evaluate(() => ({
    tabs: Array.prototype.map.call(document.querySelectorAll('#md-body-modal .cv-tab'), t => t.textContent.trim()),
    cover: !!document.getElementById('cv-p-cover'), flow: !!document.getElementById('cv-p-flow'),
    maint: !!document.getElementById('cv-p-maint'), office: !!document.getElementById('cv-p-office'),
    resv: !!document.getElementById('cv-p-resv')
  }));
  ok('タブは4つ', r.tabs.length === 4, r.tabs);
  ok('表紙／フロー／整備／バックオフィスがそろう', r.cover && r.flow && r.maint && r.office);
  ok('予約詳細は出ない', r.resv === false);
  const stage = await p.evaluate(() => ({
    yes: pitIsReserveStage({ status: 'reserved' }), kari: pitIsReserveStage({ status: 'reserved', tentative: true }),
    old: pitIsReserveStage({}), no: pitIsReserveStage({ status: 'check' }), done: pitIsReserveStage({ status: 'returned' })
  }));
  ok('仮予約も「予約の段階」に入る', stage.kari === true, stage);
  ok('工程を持たない古いカードも予約あつかい', stage.old === true, stage);
  ok('点検待ち・返車完了は予約あつかいしない', stage.no === false && stage.done === false, stage);
}

console.log('\n── ✏ 予約編集：出口は「保存する」「キャンセル」だけ ──');
{
  await open('TR1');
  await p.evaluate(() => openCardEditForm('TR1'));
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({
    editing: pitCardEditing(),
    actsShown: !document.getElementById('cv-edit-acts').hidden,
    closeHidden: document.getElementById('card-modal-close').hidden,
    labels: Array.prototype.map.call(document.querySelectorAll('#cv-edit-acts .cv-eact'), e => e.textContent.trim()),
    hold: !!PitDB.hold,
    form: !!document.querySelector('#md-body-modal .cf-panel[data-tab="basic"]')
  }));
  ok('編集中の印が立つ', r.editing === true);
  ok('右上に2つのボタンが出る', r.actsShown === true && r.labels.length === 2, r);
  ok('「キャンセル」「保存する」', /キャンセル/.test(r.labels[0] || '') && /保存する/.test(r.labels[1] || ''), r.labels);
  ok('🔴 ✕ は出さない', r.closeHidden === true);
  ok('🔴 自動保存は止まっている（PitDB.hold）', r.hold === true);
  ok('編集フォームが出ている', r.form === true);

  /* エリア外クリックで閉じない */
  await p.mouse.click(20, 20);
  await p.waitForTimeout(250);
  const still = await p.evaluate(() => ({
    open: document.getElementById('modal-detail').classList.contains('show'),
    form: !!document.querySelector('#md-body-modal .cf-panel[data-tab="basic"]'),
    editing: pitCardEditing()
  }));
  ok('🔴 エリア外クリックでは閉じない', still.open === true && still.form === true && still.editing === true, still);

  /* 打っても保存されない＝端末の控えは前のまま */
  const noSave = await p.evaluate(() => {
    const before = localStorage.getItem(PitDB.lsKey) || '';
    const c = state.cards.find(x => x.id === 'TR1');
    c.customer = '書き換え 太郎'; c.estAmount = 12345;
    PitDB.save(true);
    const after = localStorage.getItem(PitDB.lsKey) || '';
    return { same: before === after, wrote: /書き換え 太郎/.test(after) };
  });
  ok('🔴 「保存する」を押すまで保存されない', noSave.same === true && noSave.wrote === false, noSave);

  /* キャンセル＝開いた時点まで戻して、予約詳細に戻る（閉じない） */
  await p.evaluate(() => pitCardEditCancel());
  await p.waitForTimeout(350);
  const cancelled = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'TR1');
    return { name: c.customer, amt: c.estAmount, editing: pitCardEditing(), hold: !!PitDB.hold,
      open: document.getElementById('modal-detail').classList.contains('show'),
      view: !!document.getElementById('cv-p-resv'),
      form: !!document.querySelector('#md-body-modal .cf-panel[data-tab="basic"]'),
      closeShown: !document.getElementById('card-modal-close').hidden,
      actsHidden: document.getElementById('cv-edit-acts').hidden };
  });
  ok('🔴 キャンセルで開いた時点まで戻る', cancelled.name === '試験 太郎' && cancelled.amt === 88000, cancelled);
  ok('🔴 ポップアップは閉じない', cancelled.open === true);
  ok('🔴 予約詳細に戻る', cancelled.view === true && cancelled.form === false, cancelled);
  ok('見張りは外れている（保存が復活する）', cancelled.editing === false && cancelled.hold === false, cancelled);
  ok('✕ が戻り、ボタンは引っ込む', cancelled.closeShown === true && cancelled.actsHidden === true, cancelled);

  /* 編集中に増えた項目もキャンセルで消える */
  await p.evaluate(() => openCardEditForm('TR1'));
  await p.waitForTimeout(200);
  const extra = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'TR1');
    c.loanerOther = 'あとから足した'; c.consult = true;
    pitCardEditCancel();
    const d = state.cards.find(x => x.id === 'TR1');
    return { other: d.loanerOther, consult: d.consult };
  });
  await p.waitForTimeout(300);
  ok('🔴 編集中に増えたキーも消える', !extra.other && !extra.consult, extra);

  /* 保存する＝残って、予約詳細に戻る（閉じない） */
  await p.evaluate(() => openCardEditForm('TR1'));
  await p.waitForTimeout(250);
  const saved = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'TR1');
    c.estAmount = 99000;
    pitCardEditSave();
    return { amt: state.cards.find(x => x.id === 'TR1').estAmount, hold: !!PitDB.hold, editing: pitCardEditing() };
  });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({
    open: document.getElementById('modal-detail').classList.contains('show'),
    view: !!document.getElementById('cv-p-resv'),
    shown: (document.querySelector('#cv-p-resv .cv-rsvb:nth-child(2) .cv-rsvbv') || {}).textContent,
    ls: /99000/.test(localStorage.getItem(PitDB.lsKey) || '')
  }));
  ok('🔴 保存するで中身が残る', saved.amt === 99000, saved);
  ok('見張りが外れて端末にも書かれた', saved.hold === false && saved.editing === false && after.ls === true, { saved, after });
  ok('🔴 保存でもポップアップは閉じない', after.open === true);
  ok('🔴 保存でも予約詳細に戻る', after.view === true);
  ok('直した金額が予約詳細に出ている', /99,000/.test(after.shown || ''), after);
}

console.log('\n── 🛟 v1.56.1 見張り（hold）が置き去りにならない ──');
{
  /* ① 3分たったら見張りを無視して保存を再開する */
  await open('TR1');
  await p.evaluate(() => openCardEditForm('TR1'));
  await p.waitForTimeout(250);
  const r = await p.evaluate(() => {
    const before = { hold: !!PitDB.hold };
    PitDB._holdAt = Date.now() - 4 * 60 * 1000;      /* 4分前から握りっぱなし ということにする */
    const c = state.cards.find(x => x.id === 'TR1');
    c.estAmount = 55555;
    PitDB.save(true);
    return { before: before, after: { hold: !!PitDB.hold }, ls: /55555/.test(localStorage.getItem(PitDB.lsKey) || '') };
  });
  ok('🔴 3分を超えたら見張りを自分で外す', r.before.hold === true && r.after.hold === false, r);
  ok('🔴 そのとき打ったものはちゃんと保存される（黙って消えない）', r.ls === true, r);
  await p.evaluate(() => { if (window.pitCardEditRelease) pitCardEditRelease(); });

  /* ② 別のカードを開いたら見張りは外れる（置き去りにしない） */
  await open('TR1');
  await p.evaluate(() => openCardEditForm('TR1'));
  await p.waitForTimeout(200);
  const mid = await p.evaluate(() => ({ hold: !!PitDB.hold, editing: pitCardEditing() }));
  await open('TW1');
  const aft = await p.evaluate(() => ({ hold: !!PitDB.hold, editing: pitCardEditing() }));
  ok('編集中は見張りが立っている', mid.hold === true && mid.editing === true, mid);
  ok('🔴 別のカードを開くと見張りが外れる', aft.hold === false && aft.editing === false, aft);

  /* ③ 編集を抜けたら必ず1回保存する */
  const flushed = await p.evaluate(() => {
    let n = 0; const orig = PitDB.save;
    PitDB.save = function(){ n++; return orig.apply(this, arguments); };
    openCardEditForm('TR1');
    const c = state.cards.find(x => x.id === 'TR1'); c.karteNo = '9999';
    pitCardEditRelease();
    PitDB.save = orig;
    return { n: n, ls: /9999/.test(localStorage.getItem(PitDB.lsKey) || '') };
  });
  await p.waitForTimeout(200);
  ok('🔴 編集を抜けたら保存が走る', flushed.n >= 1, flushed);
  ok('🔴 抜け方が何であれ、打ったものは残る', flushed.ls === true, flushed);

  /* ④ 編集中のカードは、他の端末の更新で差し替えない（差し替えると打った内容が行き場を失う） */
  const src = fs.readFileSync('js/db-pit.js', 'utf8');
  ok('🔴 db-pit.js が「編集中のカードは差し替えない」を持っている',
     /pitCardEditingId\(\)\s*===\s*id\)\s*return;/.test(src));
  ok('🔴 見張りには時間の上限がある（置き去り防止）', /_holdAt/.test(src) && /180000/.test(src));
  const cv = fs.readFileSync('js/card-view.js', 'utf8');
  ok('編集中のカード番号を外に出している（pitCardEditingId）', /window\.pitCardEditingId\s*=/.test(cv));
  const cd = fs.readFileSync('js/card-detail.js', 'utf8');
  ok('openCard でも見張りを外している', /function openCard[\s\S]{0,420}pitCardEditRelease\(\)/.test(cd));
}

console.log('\n── 🔴 v1.56.1 中身が空のまま予約を作らない（2026-08-06 本番で6枚できた件） ──');
{
  /* 実際に起きた6枚と同じ形＝「予約作成」→「表紙を印刷して保存」の2件だけ */
  const real = await p.evaluate(() => {
    const c = { id: 'cBLANK1', resNo: 'J22207', status: 'reserved',
      bookedAt: '2026-08-06', reserveDate: '2026-08-06', reserveStaff: 'コバモ',
      inspSchedule: { mode: 'manual', slots: {}, cutBefore: '' }, coverCall: { done: false, at: '', staff: '' }, handover: 'store',
      log: [{ at: 1785986444356, label: '予約作成' }, { label: '表紙を印刷して保存', staff: 'コバモ', at: 1785986451562 }] };
    return { blank: pitIsBlankCard(c) };
  });
  ok('🔴 本番で生まれた6枚と同じ形が「空」と見抜ける', real.blank === true, real);

  const rules = await p.evaluate(() => ({
    made:   pitIsBlankCard({ id: 'b0', status: 'reserved', log: [{ label: '予約作成', at: 1 }] }),
    manual: pitIsBlankCard({ id: 'b1', status: 'reserved', log: [{ label: '予約作成', at: 1 }, { label: '電話した', at: 2, manual: true }] }),
    phase:  pitIsBlankCard({ id: 'b2', status: 'reserved', log: [{ label: '予約作成', at: 1 }, { type: 'phase', from: 'reserved', to: 'check', at: 2 }] }),
    typed:  pitIsBlankCard({ id: 'b3', status: 'reserved', customer: '山田', log: [{ label: '予約作成', at: 1 }] }),
    auto2:  pitIsBlankCard({ id: 'b4', status: 'reserved', log: [{ label: '予約作成', at: 1 }, { label: '仮予約で登録', at: 2 }] })
  }));
  ok('開いただけのカードは空', rules.made === true, rules);
  ok('🔴 自動で付く記録が増えても「空」のまま（ここが漏れていた）', rules.auto2 === true, rules);
  ok('手で足した記録があれば空ではない', rules.manual === false, rules);
  ok('工程が動いていれば空ではない', rules.phase === false, rules);
  ok('何か打ってあれば空ではない', rules.typed === false, rules);

  /* 🔴 v1.78.0（ゆうた指定）「印刷して保存」＝**足りなければ印刷にも行かせない。**
     ⚠ v1.76.0 までは「まっさらなら表紙だけ刷る」道が関門の手前にあった。**その道を廃止した。**
        「印刷して保存」を押したのに紙だけ出るのが分かりにくかったため。
     🔴 見たいのは「**刷った＝保存された**が必ず成り立つ」こと。 */
  const pr = await p.evaluate(() => {
    state.cards = state.cards.filter(x => x.id !== 'cP1');
    const c = { id: 'cP1', resNo: 'P-TEST', status: 'reserved', _draft: true,
      bookedAt: '2026-08-06', reserveDate: '2026-08-06', reserveStaff: 'コバモ',
      log: [{ label: '予約作成', at: Date.now() }] };
    state.cards.push(c);
    window._pitLastSaveAt = 0;          /* 二度押しの見張りを解除してから試す */
    let printed = 0, told = null;
    const keep = window.pitPrintCover, keepA = window.pitAlert;
    window.pitPrintCover = function(){ printed++; };
    window.pitAlert = function(t, o){ told = { t: t, d: (o && o.detail) || '' }; return Promise.resolve(true); };
    openCard('cP1', 'modal');           /* _editingCardId をこのカードに向ける */
    pitSaveAndPrint();
    window.pitPrintCover = keep; window.pitAlert = keepA;
    const d = state.cards.find(x => x.id === 'cP1');
    return { printed: printed, stillDraft: !!(d && d._draft), told: told, logs: (d.log || []).map(e => e.label) };
  });
  ok('🔴 空のときは印刷にも行かない', pr.printed === 0, pr);
  ok('🔴 予約は作らない（下書きのまま）', pr.stillDraft === true, pr);
  ok('🔴 「表紙を印刷して保存」の記録も付けない', pr.logs.indexOf('表紙を印刷して保存') < 0, pr);
  ok('🔴 足りないと教える', !!pr.told && /保存できません/.test(pr.told.t), pr.told);
  ok('🔴 どこが足りないか名前で伝える', !!pr.told && /カナ/.test(pr.told.d), pr.told);

  /* 空の表紙を刷りたい人の逃げ道＝「表紙印刷のみ」は今までどおり刷れる */
  const po = await p.evaluate(() => {
    window._pitLastSaveAt = 0;
    let printed = 0; const keep = window.pitPrintCover;
    window.pitPrintCover = function(){ printed++; };
    openCard('cP1', 'modal');
    pitPrintCoverOnly();
    window.pitPrintCover = keep;
    const d = state.cards.find(x => x.id === 'cP1');
    return { printed: printed, stillDraft: !!(d && d._draft) };
  });
  ok('🔴 「表紙印刷のみ」なら空でも刷れる（逃げ道は残す）', po.printed === 1, po);
  ok('🔴 それでも予約は作らない', po.stillDraft === true, po);

  /* 中身が入っていれば今までどおり保存される
     ⚠ v1.76.0 から赤（必須）が空だと関門で止まるので、**赤も黄も全部埋めてから**試す */
  const pr2 = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'cP1');
    Object.assign(c, { customer:'山田 太郎', kana:'ヤマダ タロウ', repeat:'repeater', tel:'090-0000-0000',
                       dropType:'wait', workType:'oil', boardId:'default', maker:'トヨタ', car:'アクア',
                       reserveTime:'10:00', menu:'オイル交換' });
    window._pitLastSaveAt = 0;
    let printed = 0; const keep = window.pitPrintCover;
    window.pitPrintCover = function(){ printed++; };
    openCard('cP1', 'modal');
    pitSaveAndPrint();
    window.pitPrintCover = keep;
    const d = state.cards.find(x => x.id === 'cP1');
    return { printed: printed, draft: !!(d && d._draft), logs: (d.log || []).map(e => e.label) };
  });
  ok('中身があれば今までどおり刷って保存する', pr2.printed === 1 && pr2.draft === false, pr2);
  ok('その時は記録も付く', pr2.logs.indexOf('表紙を印刷して保存') >= 0, pr2);

  /* 「保存する」＝空なら予約にならない
     🔴 v1.76.0 で入口が変わった。空のカードは**赤（必須）が全部空**なので、
        「空のまま作りますか？」より手前の**関門**で止まり、どこが足りないかを名前で伝える。
     ⚠ 見るべきは「空の予約ができないこと」＝2026-08-06 に本番で6枚できた件の再発防止。 */
  const sv = await p.evaluate(() => {
    state.cards = state.cards.filter(x => x.id !== 'cS1');
    state.cards.push({ id: 'cS1', resNo: 'S-TEST', status: 'reserved', _draft: true,
      bookedAt: '2026-08-06', reserveDate: '2026-08-06', reserveStaff: 'コバモ', log: [{ label: '予約作成', at: Date.now() }] });
    window._pitLastSaveAt = 0;
    let told = null; const keep = window.pitAlert;
    window.pitAlert = function(t, o){ told = { t: t, d: (o && o.detail) || '' }; return Promise.resolve(true); };
    openCard('cS1', 'modal');
    pitSaveCard();
    window.pitAlert = keep;
    return { told: told };
  });
  await p.waitForTimeout(200);
  const svAfter = await p.evaluate(() => { const d = state.cards.find(x => x.id === 'cS1'); return { draft: !!(d && d._draft) }; });
  ok('🔴 空で「保存する」を押すと止めて教える', !!sv.told && /保存できません/.test(sv.told.t), sv);
  /* ⚠ v1.89.0 で TEL は黄（空でも保存できる）へ格下げ＝赤の一覧には出ない。
     赤に残っているもので「名前で伝えているか」を見る。 */
  ok('🔴 どこが足りないか名前で伝える',
     !!sv.told && /カナ/.test(sv.told.d) && /受付タイプ/.test(sv.told.d), sv);
  ok('🔴 v1.89.0 TEL は赤の一覧に出ない', !!sv.told && sv.told.d.indexOf('TEL') < 0, sv.told);
  ok('🔴 予約にならない（下書きのまま）', svAfter.draft === true, svAfter);

  const src = fs.readFileSync('js/blank-cards.js', 'utf8');
  ok('🔴 空カード判定が「手で足した記録／工程」だけを見ている',
     /e\.manual === true \|\| e\.type === 'phase'/.test(src) && !/c\.log\.length > 1/.test(src));
}

console.log('\n── 🔴 v1.56.1 「反応しないから連打」を受け止める（ゆうた証言） ──');
{
  /* ① 二度押しは飲み込む */
  const dbl = await p.evaluate(() => {
    state.cards = state.cards.filter(x => x.id !== 'cD1');
    /* ⚠ v1.76.0 の関門で止まらないよう、赤も黄も埋めておく（見たいのは連打の飲み込み） */
    state.cards.push({ id: 'cD1', resNo: 'D-TEST', status: 'reserved', _draft: true, customer: '連打 太郎',
      kana:'レンダ タロウ', repeat:'repeater', tel:'090-0000-0000', dropType:'wait', workType:'oil',
      boardId:'default', maker:'トヨタ', car:'アクア', reserveTime:'10:00', menu:'オイル交換',
      bookedAt: '2026-08-06', reserveDate: '2026-08-06', log: [{ label: '予約作成', at: Date.now() }] });
    window._pitLastSaveAt = 0;          /* 二度押しの見張りを解除してから試す */
    let printed = 0; const keepP = window.pitPrintCover, keepT = window.pitToast;
    const toasts = [];
    window.pitPrintCover = function(){ printed++; };
    window.pitToast = function(m){ toasts.push(m); };
    openCard('cD1', 'modal');
    pitSaveAndPrint();      /* 1回目 */
    pitSaveAndPrint();      /* 2回目＝すぐ押した＝飲み込まれる */
    pitSaveAndPrint();      /* 3回目 */
    window.pitPrintCover = keepP; window.pitToast = keepT;
    const d = state.cards.find(x => x.id === 'cD1');
    return { printed: printed, toasts: toasts, logs: (d.log || []).map(e => e.label) };
  });
  ok('🔴 3回押しても保存・印刷は1回だけ', dbl.printed === 1, dbl);
  ok('🔴 記録も1件しか増えない', dbl.logs.filter(x => x === '表紙を印刷して保存').length === 1, dbl.logs);
  ok('押した瞬間に手応えを返す', dbl.toasts.some(m => /印刷しています/.test(m)), dbl.toasts);
  ok('🔴 飲み込んだ時は黙らず知らせる', dbl.toasts.some(m => /お待ちください/.test(m)), dbl.toasts);

  /* ② 保存の直後の「＋ 新規予約」は受け流す＝空の予約が次々できない
     ⚠ 数えるのは「下書きが1枚できたか」。openNewReserve は前の下書きを外すので総数では見ない。 */
  const nr = await p.evaluate(() => {
    try { localStorage.removeItem('pitflow_draft_card'); } catch(e){}
    if (window.pitDropDraft) pitDropDraft(null, true);
    window._pitLastSaveAt = Date.now();       /* いま保存した直後、という状況を作る */
    const toasts = []; const keepT = window.pitToast;
    window.pitToast = function(m){ toasts.push(m); };
    openNewReserve();                          /* 保存の直後＝流れ弾 */
    window.pitToast = keepT;
    return { drafts: state.cards.filter(c => c._draft).length, justSaved: pitJustSaved(), toasts: toasts };
  });
  ok('🔴 保存の直後の「＋ 新規予約」では予約が作られない', nr.drafts === 0, nr);
  ok('🔴 そのことを知らせる', nr.toasts.some(m => /もう一度押して/.test(m)), nr.toasts);

  /* ③ 少し待てば、今までどおり新規予約は開く */
  await p.waitForTimeout(900);
  const nr2 = await p.evaluate(() => {
    openNewReserve();
    return { drafts: state.cards.filter(c => c._draft).length, justSaved: pitJustSaved() };
  });
  ok('少し待てば今までどおり新規予約は開く', nr2.drafts === 1 && nr2.justSaved === false, nr2);
  await p.evaluate(() => { if (window.pitDropDraft) pitDropDraft(null, true); });
}

console.log('\n── 👤 v1.56.3 フロント担当と予約担当を取り違えない（ゆうた報告） ──');
{
  await open('TR1');
  const r = await p.evaluate(() => {
    const tops = Array.prototype.map.call(document.querySelectorAll('#md-body-modal .cv-wtop .cv-wtt'), e => ({
      label: e.childNodes[0].textContent.trim(),
      name: (e.querySelector('.cv-pill') || {}).textContent
    }));
    const pill = document.querySelector('#md-body-modal .cv-id3 .cv-pill.cv-staff');
    return { tops: tops, id3: pill ? { text: pill.textContent, title: pill.getAttribute('title') } : null };
  });
  ok('担当が2つ並ぶ', r.tops.length === 2, r.tops);
  ok('🔴 フロント担当にはフロント担当の名前が出る',
     r.tops[0] && r.tops[0].label === 'フロント担当' && r.tops[0].name === 'フロント 一郎', r.tops);
  ok('🔴 予約担当には予約担当の名前が出る（前はフロント担当が出ていた）',
     r.tops[1] && r.tops[1].label === '予約担当' && r.tops[1].name === '予約 二郎', r.tops);
  ok('上の行の名前ピルは「フロント」と分かる', r.id3 && /フロント/.test(r.id3.text) && r.id3.title === 'フロント担当', r.id3);
  ok('上の行に出るのはフロント担当の名前', r.id3 && /フロント 一郎/.test(r.id3.text), r.id3);

  /* 片方しか居ない時／どちらも居ない時 */
  const one = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'TR1');
    const keepF = c.frontStaff, keepR = c.reserveStaff;
    c.frontStaff = ''; renderCardView(c, 'md-body-modal');
    const a = Array.prototype.map.call(document.querySelectorAll('#md-body-modal .cv-wtop .cv-wtt'), e => e.childNodes[0].textContent.trim());
    c.reserveStaff = ''; renderCardView(c, 'md-body-modal');
    const b = Array.prototype.map.call(document.querySelectorAll('#md-body-modal .cv-wtop .cv-wtt'), e => e.textContent.trim());
    c.frontStaff = keepF; c.reserveStaff = keepR; renderCardView(c, 'md-body-modal');
    return { one: a, none: b };
  });
  ok('片方だけの時は、その1つだけ出る', one.one.length === 1 && one.one[0] === '予約担当', one);
  ok('どちらも居ない時も欄が壊れない', one.none.length === 1 && /担当/.test(one.none[0]), one);

  /* 昔のカード（c.staff しか持っていない）も拾う */
  const old = await p.evaluate(() => {
    state.cards = state.cards.filter(x => x.id !== 'TOLD');
    state.cards.push({ id: 'TOLD', resNo: 'R-OLD', status: 'reserved', customer: '昔 太郎', staff: '昔の 担当', log: [] });
    openCard('TOLD', 'modal');
    return Array.prototype.map.call(document.querySelectorAll('#md-body-modal .cv-wtop .cv-wtt'), e => e.textContent.trim());
  });
  ok('昔のカードの担当も拾う（空にしない）', old.length === 1 && /フロント担当/.test(old[0]) && /昔の 担当/.test(old[0]), old);

  const src = fs.readFileSync('js/card-view.js', 'utf8');
  ok('🔴 予約担当が reserveStaff を見ている', /c\.reserveStaff/.test(src));
}

console.log('\n── ✍ v1.183.0 引継ぎ・伝達の欄が、書いてある内容に合わせて伸びる（ゆうた指定） ──');
{
  /* 🗣「予約詳細カードのコメント部分を、書いてある内容に応じて、全部見える状態で開いてほしい。
     　　今はデフォルトのハイトが決まってる感じ」
     🔴 見るのは「中でスクロールしなくても全部見えるか」＝ **中身の高さ ≦ 欄の高さ**。
     ⚠ 高さの数値そのものは決め打ちしない（字の大きさが変われば変わるため）。 */
  await open('TR1');
  const r = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'TR1');
    const keep = c.handoffMemo;
    const read = () => {
      const el = document.querySelector('#md-body-modal textarea.cv-hoinput');
      if (!el) return null;
      return { h: el.offsetHeight, cls: el.className,
               oninput: el.getAttribute('oninput') || '',
               cut: el.scrollHeight > el.clientHeight + 1 };
    };
    c.handoffMemo = ''; renderCardView(c, 'md-body-modal');
    const empty = read();
    c.handoffMemo = '部品待ち'; renderCardView(c, 'md-body-modal');
    const one = read();
    c.handoffMemo = Array.from({ length: 12 }, (_, i) => 'ひきつぎ ' + (i + 1) + ' 行目です').join('\n');
    renderCardView(c, 'md-body-modal');
    const many = read();
    /* 打っている間も伸びるか */
    const el = document.querySelector('#md-body-modal textarea.cv-hoinput');
    const before = el.offsetHeight;
    el.value = el.value + '\n' + Array.from({ length: 8 }, (_, i) => 'あとから足した ' + (i + 1)).join('\n');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const after = el.offsetHeight;
    const cutAfter = el.scrollHeight > el.clientHeight + 1;
    c.handoffMemo = keep; renderCardView(c, 'md-body-modal');
    return { empty, one, many, typed: { before, after, cutAfter } };
  });
  ok('欄に「伸びる」印が付いている', r.many && /cv-grow/.test(r.many.cls), r.many && r.many.cls);
  ok('🔴🔴 12行書いてあっても、中でスクロールせずに全部見える', r.many && r.many.cut === false, r.many);
  ok('🔴 中身が増えたぶん、欄も高くなる（1行 → 12行）',
     r.many && r.one && r.many.h > r.one.h + 40, { one: r.one, many: r.many });
  ok('🔴 打っている間も伸びる', r.typed && r.typed.after > r.typed.before, r.typed);
  ok('🔴 打ったあともスクロールが出ない', r.typed && r.typed.cutAfter === false, r.typed);
  ok('空のときは小さくなりすぎない', r.empty && r.empty.h >= 40, r.empty);
  ok('空でもスクロールは出ない', r.empty && r.empty.cut === false, r.empty);
  ok('🔴 打った時に高さを直す手が配線されている', r.many && /cvGrow\(this\)/.test(r.many.oninput), r.many && r.many.oninput);

  /* 🔴🔴 ここが本番の道＝**カードを開く**（描いた瞬間はまだ窓が開ききっていない）。
     ⚠ 上の節は「見えている所で描き直した」だけなので、これを見ていないと
        **開いた時だけ小さいまま**という形を取り逃がす（実際そうなっていた）。 */
  const opened = await p.evaluate(async () => {
    const c = state.cards.find(x => x.id === 'TR1');
    const keep = c.handoffMemo;
    c.handoffMemo = Array.from({ length: 12 }, (_, i) => 'ひらいた時の ' + (i + 1) + ' 行目').join('\n');
    closeDetail && closeDetail();
    openCard('TR1', 'modal');
    await new Promise(r => setTimeout(r, 500));
    const el = document.querySelector('#md-body-modal textarea.cv-hoinput');
    const out = el ? { h: el.offsetHeight, cut: el.scrollHeight > el.clientHeight + 1 } : null;
    c.handoffMemo = keep; renderCardView(c, 'md-body-modal');
    return out;
  });
  ok('🔴🔴 カードを開いた時点で、12行が全部見えている（中でスクロールしない）',
     opened && opened.cut === false && opened.h > 100, opened);

  const src = fs.readFileSync('js/card-view.js', 'utf8');
  ok('🔴 伸ばす手は1本（cv-grow が付いた欄をまとめて測る）',
     /function growAll/.test(src) && /textarea\.cv-grow/.test(src), '');
  ok('🔴 枠のぶんを足している（足さないと1行ぶん足りない）', /offsetHeight - el\.clientHeight/.test(src), '');
  ok("🔴 開いた時にも測る（描き直しのたび・窓が開ききってからも）", /growSoon\(host\)/.test(src) && /function growSoon/.test(src), "");
  ok('🔴 タブを開いた時にも測る（隠れていると高さが0になるため）', /growSoon\(el \|\| document\)/.test(src), '');
  ok('🔴🔴 窓が開ききってから、もう一度測り直す（開く前は高さが測れない）',
     /function growSoon/.test(src) && /requestAnimationFrame/.test(src) && /260\)/.test(src), '');
  {
    const seg = src.slice(src.indexOf('function grow('), src.indexOf('function memoLines'));
    ok('⚠ 「◯行まで」の上限を付けていない', seg.length > 50 && !/maxHeight|max-height/.test(seg), '');
  }
}

console.log('\n── 🎨 v1.56.2 どのテーマでも文字が読める（ライトで --text1 が白いまま残っていた件） ──');
{
  const THEMES = ['dark', 'light', 'dark-liquid', 'light-liquid'];
  const res = await p.evaluate((themes) => {
    /* 相対輝度とコントラスト比（WCAG の式）＝背景と文字がどれだけ離れているかを数字で見る */
    const lum = (rgb) => {
      const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const parse = (s) => {
      s = String(s || '').trim();
      let m = s.match(/^#([0-9a-fA-F]{6})$/);
      if (m) return [parseInt(m[1].slice(0,2),16), parseInt(m[1].slice(2,4),16), parseInt(m[1].slice(4,6),16)];
      m = s.match(/rgba?\(([^)]+)\)/);
      if (m) return m[1].split(',').slice(0,3).map(x => parseInt(x, 10));
      return null;
    };
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b), hi = Math.max(l1,l2), lo = Math.min(l1,l2); return (hi + 0.05) / (lo + 0.05); };
    const keep = document.documentElement.getAttribute('data-theme');
    const out = {};
    themes.forEach(t => {
      document.documentElement.setAttribute('data-theme', t);
      const cs = getComputedStyle(document.documentElement);
      const bg = parse(cs.getPropertyValue('--bg'));
      out[t] = {};
      ['--text', '--text1', '--text2', '--text3'].forEach(v => {
        const raw = cs.getPropertyValue(v).trim();
        const col = parse(raw);
        out[t][v] = { set: !!raw, raw: raw, ratio: (bg && col) ? +ratio(bg, col).toFixed(2) : 0 };
      });
    });
    if (keep) document.documentElement.setAttribute('data-theme', keep); else document.documentElement.removeAttribute('data-theme');
    return out;
  }, THEMES);

  THEMES.forEach(t => {
    ok('『' + t + '』の --text1 が決まっている', res[t]['--text1'].set === true, res[t]['--text1']);
    ok('🔴『' + t + '』の --text1 が背景から十分離れている（4.5:1以上）', res[t]['--text1'].ratio >= 4.5, res[t]['--text1']);
    ok('『' + t + '』の --text も読める', res[t]['--text'].ratio >= 4.5, res[t]['--text']);
    ok('『' + t + '』の --text2 も読める（3:1以上）', res[t]['--text2'].ratio >= 3, res[t]['--text2']);
  });

  /* 実際の予約詳細カードで、ゆうたが見えないと言った3か所を測る */
  await p.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    const c = state.cards.find(x => x.id === 'TR1'); if (c) c.menu = '車検一式\nエンジンオイル交換';
  });
  await open('TR1');
  const real = await p.evaluate(() => {
    const lum = (rgb) => { const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; };
    const parse = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); return m ? m[1].split(',').slice(0,3).map(x => parseInt(x,10)) : null; };
    const ratio = (a,b) => { const l1=lum(a), l2=lum(b), hi=Math.max(l1,l2), lo=Math.min(l1,l2); return +((hi+0.05)/(lo+0.05)).toFixed(2); };
    const cs = getComputedStyle(document.documentElement);
    const bgRaw = cs.getPropertyValue('--bg2').trim() || cs.getPropertyValue('--bg').trim();
    const bg = (function(s){ const m = s.match(/^#([0-9a-fA-F]{6})$/); return m ? [parseInt(m[1].slice(0,2),16),parseInt(m[1].slice(2,4),16),parseInt(m[1].slice(4,6),16)] : parse(s); })(bgRaw);
    const pick = (sel) => { const e = document.querySelector(sel); return e ? ratio(bg, parse(getComputedStyle(e).color)) : null; };
    return { tel: pick('#md-body-modal .cv-tel'),
             memo: pick('#md-body-modal .cv-wl:not(.cv-muted)'),
             muted: pick('#md-body-modal .cv-wl.cv-muted'),   /* 「（なし）」は薄くてよい欄 */
             tab: pick('#md-body-modal .cv-tab.on') };
  });
  ok('🔴 ライトで「電話」が読める', real.tel !== null && real.tel >= 4.5, real);
  ok('🔴 ライトで「予約時内容の本文」が読める', real.memo !== null && real.memo >= 4.5, real);
  ok('「（なし）」の薄い字も、薄すぎはしない（3:1以上）', real.muted === null || real.muted >= 3, real);
  ok('🔴 ライトで「予約詳細」のタブ名が読める', real.tab !== null && real.tab >= 4.5, real);
  await p.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });

  const css = fs.readFileSync('css/base.css', 'utf8');
  const at = css.indexOf(':root[data-theme="light"]{');
  ok('ライトテーマの箱に --text1 が書いてある', at > 0 && /--text1\s*:/.test(css.slice(at, at + 1200)));
}

console.log('\n── 版とキャッシュ番号 ──');
{
  const ix = fs.readFileSync('index.html', 'utf8');
  const vs = [(ix.match(/app-version" content="([\d.]+)"/) || [])[1],
              (ix.match(/login-ver">v([\d.]+)</) || [])[1],
              (ix.match(/class="ver">v([\d.]+)</) || [])[1]];
  ok('版が3か所そろっている', vs.every(Boolean) && new Set(vs).size === 1, vs);
  /* 🔴 版は上がる一方なので、決め打ちで書かない（毎回テストが古くなるため）。
     **この節を書いた時の版（1.56.0）より下がっていないこと**だけを見る。 */
  const _num = v => String(v||'').split('.').map(Number);
  const _ge = (a, b) => { const x=_num(a), y=_num(b);
    for (let i=0;i<3;i++){ if ((x[i]||0) !== (y[i]||0)) return (x[i]||0) > (y[i]||0); } return true; };
  ok('版が v1.56.0 より下がっていない', _ge(vs[0], '1.56.0'), vs);
  ok('直したファイルにキャッシュ番号が付いている',
     /card-view\.js\?v=\d+/.test(ix) && /card-detail\.js\?v=\d+/.test(ix) && /db-pit\.js\?v=\d+/.test(ix)
     && /loaner\.js\?v=\d+/.test(ix) && /card-view\.css\?v=\d+/.test(ix));
  ok('背景クリックの受け口が編集中を見ている', /pitCardEditing\(\)\)\)closeDetail\(\)/.test(ix));
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
