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
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1`);
await p.waitForFunction('window.state && window.renderCardView && window.PitDB && window.PitFlowLog', null, { timeout: 25000 });
await p.waitForTimeout(900);

/* 試験用のカードを2枚だけ用意する（予約の段階／入庫したあと）。
   ⚠ 本物のサンプルは触らず、頭に足すだけ。 */
await p.evaluate(() => {
  window.pitCurrentStaffName = function(){ return 'サンプル 花子'; };
  const base = {
    tel: '090-1111-2222', car: 'アクア', plate: '横浜 300 あ 12-34', karteNo: '1234',
    boardId: 'default', division: 'div1', workType: 'shaken', frontStaff: '',
    reserveDate: '2026-08-20', estHoldDays: 3, estAmount: 88000,
    needLoaner: true, loanerId: 'L01', loanerTo: '2026-08-25', log: [], maint: {}, office: {}
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
    const before = localStorage.getItem('pitflow_data_v12') || '';
    const c = state.cards.find(x => x.id === 'TR1');
    c.customer = '書き換え 太郎'; c.estAmount = 12345;
    PitDB.save(true);
    const after = localStorage.getItem('pitflow_data_v12') || '';
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
    ls: /99000/.test(localStorage.getItem('pitflow_data_v12') || '')
  }));
  ok('🔴 保存するで中身が残る', saved.amt === 99000, saved);
  ok('見張りが外れて端末にも書かれた', saved.hold === false && saved.editing === false && after.ls === true, { saved, after });
  ok('🔴 保存でもポップアップは閉じない', after.open === true);
  ok('🔴 保存でも予約詳細に戻る', after.view === true);
  ok('直した金額が予約詳細に出ている', /99,000/.test(after.shown || ''), after);
}

console.log('\n── 版とキャッシュ番号 ──');
{
  const ix = fs.readFileSync('index.html', 'utf8');
  const vs = [(ix.match(/app-version" content="([\d.]+)"/) || [])[1],
              (ix.match(/login-ver">v([\d.]+)</) || [])[1],
              (ix.match(/class="ver">v([\d.]+)</) || [])[1]];
  ok('版が3か所そろっている', vs.every(Boolean) && new Set(vs).size === 1, vs);
  ok('版は v1.56.0', vs[0] === '1.56.0', vs);
  ok('直したファイルにキャッシュ番号が付いている',
     /card-view\.js\?v=\d+/.test(ix) && /card-detail\.js\?v=\d+/.test(ix) && /db-pit\.js\?v=\d+/.test(ix)
     && /loaner\.js\?v=\d+/.test(ix) && /card-view\.css\?v=\d+/.test(ix));
  ok('背景クリックの受け口が編集中を見ている', /pitCardEditing\(\)\)\)closeDetail\(\)/.test(ix));
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
