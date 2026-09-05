/* PitFlow v2.73.0 ── ✅ チェック担当者（3つ目の枠）
   -------------------------------------------------------------------
   ◎ゆうた依頼（2026-09-05）
     🗣「予約詳細の整備のなか、作業者のエリアに**チェック者**を追加する。
     　　ここは**一人1回までしかクリックできない。複数人のクリックはできる**」
     🗣「タスクボード中の**ドラッグ操作で出るポップアップにも同様に**チェック者の欄を追加。
     　　**無しも選べるが、未選択は警告、データチェック対象**」
     🗣「顧客ビュー内の**伝票画面**にて、一番上からヘッダーのメイン情報、その下に詳細の明細だが、
     　　**その間に点検者、作業者、チェック者をそれぞれ表示**するようにしたい」

   ◎この試験が見張るもの
     ① 予約詳細の整備タブに3つ目の枠が出る／候補は**全員**（フロント・受付も混じる）
     ② **1人1回まで**＝もう一度押しても ×2 にならず、外れる／**複数人**は入る
     ③ 「なし」は点検・整備と同じ動き（人が外れる／人を入れると下りる）
     ④ 作業完了へ動かす窓にも欄が出て、チェック担当だけ空でも窓が出る
     ⑤ データチェック（T03）が拾う／「なし」なら言わない
     ⑥ 🔴 **導入日より前のカードでは言わない**（昔のカードで要対応を数千件出さない）
     ⑦ 🔴 **作業サマリーの配分は1ミリも動かない**（チェック担当は取り分に関係しない）
     ⑧ 顧客ビューの伝票で、ヘッダーと明細の**あいだ**に3つの担当が出る
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8940      ← 別ウィンドウ
     node _見張り/test_mech_check.mjs                                        */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8940;
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
await p.waitForFunction('window.state && window.PitMechPick && window.PitMechGuard && window.renderCardView', null, { timeout: 25000 });
await p.waitForTimeout(900);

/* 盤面を1枚にする。日付は**導入日より後**（＝チェック担当を言う側）で固定 */
const put = (o) => p.evaluate((x) => {
  state.cards = [Object.assign({
    id: 'cCK', resNo: 'R-CK', customer: 'チェック 太郎', car: 'アクア', plate: '野田 500 あ 22-22',
    boardId: 'default', division: 'div1', workType: 'shaken', dropType: 'drop',
    reserveDate: '2099-01-01', returnDate: '2099-01-02', tel: '090-3333-4444', kana: 'チェックタロウ',
    repeat: 'repeat', status: 'work',
    inspectors: [], mechanics: [], checkers: [], log: [], maint: {}, office: {}
  }, x || {})];
  if (window.PitDB) PitDB.save();
}, o || null);

const card = () => p.evaluate(() => {
  const c = state.cards.find(x => x.id === 'cCK') || {};
  return { status: c.status, chk: (c.checkers || []).slice(), none: !!c.checkersNone,
           ids: (c.checkerIds || []).length };
});

const openMaint = () => p.evaluate(() => {
  const host = document.getElementById('md-body-modal') || (function () {
    const d = document.createElement('div'); d.id = 'md-body-modal'; document.body.appendChild(d); return d; })();
  renderCardView(state.cards[0], 'md-body-modal');
  const t = document.querySelector('#md-body-modal .cv-tab[data-tab="maint"]') ||
            Array.from(document.querySelectorAll('#md-body-modal .cv-tab')).find(x => /整備/.test(x.textContent));
  if (t) t.click();
});

console.log('\n── ① 予約詳細の整備タブに3つ目の枠が出る ──');
{
  await put(); await openMaint(); await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('#cv-p-maint .cf-mech-block'));
    const c = document.querySelector('#cv-p-maint .cf-mech-c');
    const heads = blocks.map(x => (x.querySelector('.cf-label') || {}).textContent || '');
    return {
      n: blocks.length, heads: heads.map(t => t.replace(/\s+/g, ' ').trim()),
      third: blocks[2] ? blocks[2].className : '',
      cnt: c ? (c.querySelector('.cf-mech-cnt') || {}).textContent : '',
      first: c ? (c.querySelector('.cf-mchip') || {}).textContent : '',
      persons: c ? c.querySelectorAll('.cf-mperson').length : 0,
      sect: (document.querySelector('#cv-p-maint .cv-sect') || {}).textContent || ''
    };
  });
  ok('🔴 枠は3つ（点検・整備・チェック）', r.n === 3, r);
  ok('🔴 3つ目が「チェック担当者」', /チェック担当者/.test(r.heads[2] || ''), r.heads);
  ok('🔴 並び順は 点検 → 整備 → チェック', /cf-mech-c/.test(r.third), r.third);
  ok('見出しに「チェック」が入っている', /チェック/.test(r.sect), r.sect);
  ok('🔴 空っぽは「未入力」と出る（「なし」と混ぜない）', r.cnt === '未入力', r.cnt);
  ok('🔴 いちばん左は「なし」', (r.first || '').trim() === 'なし', r.first);

  /* 🔴 候補は全員（点検・整備は「メカ」だけ。ここはフロント・受付も出る） */
  const opt = await p.evaluate(() => ({
    all: (state.staff || []).length,
    mech: (state.staff || []).filter(s => s && s.mech).length,
    chk: PitMechPick.options('checkers').length,
    ins: PitMechPick.options('inspectors').length
  }));
  ok('🔴🔴 チェックの候補は**全員**（ゆうた確定）', opt.chk === opt.all && opt.all > opt.mech, opt);
  ok('点検・整備の候補は今までどおり「メカ」だけ', opt.ins === opt.mech, opt);
}

console.log('\n── ② 1人1回まで／複数人はOK ──');
{
  const tapC = (i) => p.evaluate((n) => {
    document.querySelectorAll('#cv-p-maint .cf-mech-c .cf-mperson')[n].click();
  }, i);
  await tapC(0); await p.waitForTimeout(220);
  let c = await card();
  ok('1回押すと1人入る', c.chk.length === 1, c);
  ok('メンバー番号も同じ数だけ入る', c.ids === c.chk.length, c);

  const nm = c.chk[0];
  await tapC(0); await p.waitForTimeout(220);
  c = await card();
  ok('🔴🔴 同じ人をもう一度押しても **×2 にならない**', c.chk.filter(x => x === nm).length <= 1, c);
  ok('🔴 もう一度押すと**外れる**（押し間違いを自分で戻せる）', c.chk.length === 0, c);

  await tapC(0); await tapC(1); await tapC(2); await p.waitForTimeout(260);
  c = await card();
  ok('🔴 **複数人**は入る', c.chk.length === 3, c);
  ok('🔴 同じ人が2回入っていない', new Set(c.chk).size === c.chk.length, c);

  const look = await p.evaluate(() => ({
    x: document.querySelectorAll('#cv-p-maint .cf-mech-c .cf-mchip-x').length,
    xi: document.querySelectorAll('#cv-p-maint .cf-mech-i .cf-mchip-x').length,
    cnt: (document.querySelector('#cv-p-maint .cf-mech-c .cf-mech-cnt') || {}).textContent || '',
    full: document.querySelectorAll('#cv-p-maint .cf-mech-c .cf-mchip.full').length
  }));
  ok('🔴 チェックの札に「×2」の印が1つも出ない', look.x === 0, look);
  ok('🔴 見出しは「枠」ではなく「人」（×2 が無いので）', look.cnt === '3人', look.cnt);
  ok('押せなくなっている札が無い（戻せなくならない）', look.full === 0, look);

  /* 部品ごしの物差しでも同じ */
  const dbl = await p.evaluate(() => {
    const c2 = state.cards[0];
    PitMechPick.tap('cv', 'cCK', 'checkers', c2.checkers[0]);   /* すでに居る人＝外れる */
    const a = c2.checkers.slice();
    PitMechPick.tap('cv', 'cCK', 'inspectors', '蓮沼');
    PitMechPick.tap('cv', 'cCK', 'inspectors', '蓮沼');           /* 点検は今までどおり ×2 */
    return { chk: a, insp: c2.inspectors.slice() };
  });
  ok('🔴 点検・整備の ×2 は今までどおり残っている（壊していない）', dbl.insp.length === 2, dbl);
}

console.log('\n── ③ 「なし」＝答え（点検・整備と同じ動き） ──');
{
  await put(); await openMaint(); await p.waitForTimeout(250);
  const noneC = () => p.evaluate(() => { document.querySelector('#cv-p-maint .cf-mech-c .cf-mnone').click(); });
  await noneC(); await p.waitForTimeout(220);
  let c = await card();
  ok('🔴 「なし」を押すと印が付く', c.none === true && c.chk.length === 0, c);
  const lbl = await p.evaluate(() => (document.querySelector('#cv-p-maint .cf-mech-c .cf-mech-cnt') || {}).textContent || '');
  ok('🔴 見出しは「該当者なし」（未入力と区別できる）', lbl === '該当者なし', lbl);

  await p.evaluate(() => { document.querySelector('#cv-p-maint .cf-mech-c .cf-mperson').click(); });
  await p.waitForTimeout(220);
  c = await card();
  ok('🔴 人を入れると「なし」は下りる（両立しない）', c.none === false && c.chk.length === 1, c);

  await noneC(); await p.waitForTimeout(220);
  c = await card();
  ok('🔴 「なし」を押すと入っていた人は外れる', c.none === true && c.chk.length === 0, c);
}

console.log('\n── ④ 作業完了へ動かす窓（ドラッグ・◀▶・ジャンプ） ──');
const mgShown = () => p.evaluate(() => {
  const bd = document.getElementById('mg-backdrop');
  return !!(bd && bd.classList.contains('show'));
});
{
  /* 点検・整備は決まっていて、チェックだけ空＝それでも出る */
  await put({ status: 'work', inspectors: ['蓮沼'], mechanics: ['箱崎'], checkers: [] });
  await p.evaluate(() => applyCardDrop('cCK', 'status', 'workDone'));
  await p.waitForTimeout(400);
  ok('🔴🔴 チェック担当だけ空でも窓が出る', await mgShown() === true);
  const w = await p.evaluate(() => (document.getElementById('mg-warn') || {}).textContent || '');
  ok('🔴 空いている「チェック担当」を名指しで言う',
     /チェック担当/.test(w) && !/点検担当/.test(w) && !/整備担当/.test(w), w);
  const inside = await p.evaluate(() => ({
    blocks: document.querySelectorAll('#mg-pick .cf-mech-block').length,
    c: document.querySelectorAll('#mg-pick .cf-mech-c .cf-mperson').length,
    none: document.querySelectorAll('#mg-pick .cf-mnone').length,
    title: (document.querySelector('#mg-backdrop .modal-title') || {}).textContent || ''
  }));
  ok('🔴 窓の中も予約詳細と同じ部品（3つの枠が並ぶ）', inside.blocks === 3 && inside.c > 0, inside);
  ok('🔴 3つとも「なし」を選べる', inside.none === 3, inside);
  ok('窓の見出しが3つの役を言っている', /チェック/.test(inside.title), inside.title);

  /* その場で入れれば、文言が変わる */
  await p.evaluate(() => { document.querySelector('#mg-pick .cf-mech-c .cf-mperson').click(); });
  await p.waitForTimeout(300);
  const w2 = await p.evaluate(() => ({
    warn: (document.getElementById('mg-warn') || {}).textContent || '',
    btn: (document.getElementById('mg-ok') || {}).textContent || ''
  }));
  ok('🔴 その場で入れると「決まりました」に変わる', /決まりました/.test(w2.warn), w2);
  ok('ボタンの文言も変わる', /入れて作業完了へ/.test(w2.btn), w2.btn);
  await p.evaluate(() => PitMechGuard.close(1));
  await p.waitForTimeout(250);
  ok('そのまま作業完了へ入る（止めない）', (await card()).status === 'workDone');
}
{
  /* 3つとも決まっていれば出さない */
  await put({ status: 'work', inspectors: ['蓮沼'], mechanics: ['箱崎'], checkersNone: true });
  await p.evaluate(() => applyCardDrop('cCK', 'status', 'workDone'));
  await p.waitForTimeout(400);
  ok('🔴 チェックも「なし」で決めていれば出さない', await mgShown() === false);
  ok('そのまま作業完了へ進む', (await card()).status === 'workDone');
}
{
  /* ◀▶ボタンでも同じ */
  await put({ status: 'work', inspectors: ['蓮沼'], mechanics: ['箱崎'], checkers: [] });
  await p.evaluate(() => { state.currentBoardId = 'default'; advanceCard('cCK', 1); });
  await p.waitForTimeout(420);
  ok('🔴 ◀▶ボタンでも出る', await mgShown() === true);
  await p.evaluate(() => PitMechGuard.close(0));
  await p.waitForTimeout(200);
  ok('やめたらカードは動かない', (await card()).status === 'work');
}

console.log('\n── ⑤⑥ データチェック（T03）と、導入日より前のカード ──');
{
  const r = await p.evaluate(() => {
    const FROM = PitMechPick.CHECKER_FROM;
    const before = '2000-01-01';                     /* 導入日より前 */
    const mk = (o) => Object.assign({
      id: o.id, resNo: 'R-' + o.id, customer: 'テ ス ト', kana: 'テスト', tel: '090-0000-0000',
      car: 'アクア', plate: '野田 500 あ 1-1', boardId: 'default', division: 'div1',
      workType: 'shaken', dropType: 'drop', repeat: 'repeat',
      reserveDate: '2099-01-01', returnDate: '2099-01-02',
      status: 'workDone', inspectors: ['蓮沼'], mechanics: ['箱崎'], checkers: [],
      log: [], maint: {}, office: {}
    }, o);
    state.cards = [
      mk({ id: 'k1' }),                                          /* チェックだけ空＝要対応 */
      mk({ id: 'k2', checkers: ['椎名'] }),                       /* 入っている */
      mk({ id: 'k3', checkersNone: true }),                       /* 「なし」と決めた */
      mk({ id: 'k4', reserveDate: before, returnDate: before }),  /* 導入日より前＝言わない */
      mk({ id: 'k5', reserveDate: before, returnDate: '' })       /* 予約は昔・まだ返車していない */
    ];
    state.inspectMarks = {}; state.inspectMutes = {};
    const res = pitInspectRun();
    const of = (id) => res.findings.filter(f => f.refId === id && f.ruleId === 'T03')[0] || null;
    const rule = (window.PIT_INSPECT_RULES || []).filter(x => x.id === 'T03')[0] || {};
    return { FROM,
      k1: (of('k1') || {}).text || '', k2: !!of('k2'), k3: !!of('k3'),
      k4: !!of('k4'), k5: !!of('k5'), level: rule.level,
      un4: PitMechPick.unsettled(state.cards[3]).slice(),
      scope4: PitMechPick.checkerScope(state.cards[3]),
      scope1: PitMechPick.checkerScope(state.cards[0]) };
  });
  ok('🔴 導入日が決まっている（空にしない）', /^\d{4}-\d{2}-\d{2}$/.test(r.FROM), r.FROM);
  ok('🔴🔴 チェックだけ空＝要対応で言う', /チェック担当/.test(r.k1) && r.level === 'red', r);
  ok('入っていれば言わない', r.k2 === false, r.k2);
  ok('🔴 「なし」と決めたら言わない', r.k3 === false, r.k3);
  ok('🔴🔴 **導入日より前のカードでは言わない**（昔のぶんで埋もれさせない）', r.k4 === false, r.k4);
  ok('🔴 まだ返車していない昔のカードでも言わない（予約日で見る）', r.k5 === false, r.k5);
  ok('🔴 物差しの中で弾いている（データチェック側に条件を書き写していない）',
     r.un4.indexOf('チェック担当') < 0 && r.scope4 === false && r.scope1 === true, r);
}

console.log('\n── ⑦ 作業サマリーの配分は動かない ──');
{
  const r = await p.evaluate(() => {
    const c = { id: 'cAL', workType: 'shaken', status: 'returned', amountFinal: 100000,
                inspectors: ['蓮沼'], mechanics: ['箱崎'], checkers: [] };
    const a = window.pitMechAllocText ? pitMechAllocText(c) : '';
    c.checkers = ['椎名', '山田', '大西'];
    const b2 = window.pitMechAllocText ? pitMechAllocText(c) : '';
    const al1 = window.pitMechAlloc ? JSON.stringify(pitMechAlloc(c)) : '';
    c.checkers = [];
    const al2 = window.pitMechAlloc ? JSON.stringify(pitMechAlloc(c)) : '';
    return { same: a === b2, alSame: al1 === al2, has: /%/.test(a) };
  });
  ok('配分バーがそもそも出ている（試験が空を比べていない）', r.has === true, r);
  ok('🔴🔴 チェック担当を3人入れても**配分の文言が1文字も変わらない**', r.same === true, r);
  ok('🔴🔴 取り分の中身（台数・金額）も変わらない', r.alSame === true, r);
  const src = fs.readFileSync('js/mech-summary.js', 'utf8');
  ok('🔴 作業サマリーのコードに checkers が1文字も入っていない', !/checkers/.test(src), '');
}

console.log('\n── ⑧ 顧客ビューの伝票：ヘッダーと明細のあいだに3つ ──');
{
  const r = await p.evaluate(() => {
    const c = { id: 'cD', workType: 'shaken', reserveDate: '2099-01-01', returnDate: '2099-01-02',
                inspectors: ['蓮沼'], mechanics: ['箱崎', '箱崎'], checkers: ['椎名', '山田'] };
    const h = pitMechLine(c);
    const d = document.createElement('div');
    d.innerHTML = '<div class="ch-den"><div class="ch-den-h">見出し</div>' + h + '<table></table></div>';
    const line = d.querySelector('.cf-mech-line');
    const items = Array.from(d.querySelectorAll('.cf-ml')).map(x => ({
      t: (x.querySelector('.cf-ml-t') || {}).textContent, v: (x.querySelector('.cf-ml-v') || {}).textContent,
      cls: x.className }));
    /* 未入力・なしの言い方 */
    const c2 = { id: 'cE', reserveDate: '2099-01-01', returnDate: '2099-01-02',
                 inspectors: [], inspectorsNone: true, mechanics: [], checkers: [] };
    const d2 = document.createElement('div'); d2.innerHTML = pitMechLine(c2);
    const v2 = Array.from(d2.querySelectorAll('.cf-ml')).map(x => ({
      v: (x.querySelector('.cf-ml-v') || {}).textContent, cls: x.className }));
    /* 導入日より前のカード＝チェックの欄そのものを出さない */
    const c3 = { id: 'cF', reserveDate: '2000-01-01', returnDate: '2000-01-02',
                 inspectors: ['蓮沼'], mechanics: ['箱崎'], checkers: [] };
    const d3 = document.createElement('div'); d3.innerHTML = pitMechLine(c3);
    return {
      items, v2, n3: d3.querySelectorAll('.cf-ml').length,
      afterHead: !!(line && line.previousElementSibling && line.previousElementSibling.className === 'ch-den-h'),
      beforeTable: !!(line && line.nextElementSibling && line.nextElementSibling.tagName === 'TABLE'),
      buttons: d.querySelectorAll('.cf-mech-line button').length,
      onclick: /onclick/.test(h)
    };
  });
  ok('🔴 ヘッダーのすぐ下に出る', r.afterHead === true, r);
  ok('🔴 明細の表のすぐ上に出る（あいだに入っている）', r.beforeTable === true, r);
  ok('🔴 3つとも出る', r.items.length === 3, r.items);
  ok('順番は 点検 → 整備 → チェック',
     /点検/.test(r.items[0].t) && /整備/.test(r.items[1].t) && /チェック/.test(r.items[2].t), r.items);
  ok('名前が出る', r.items[0].v === '蓮沼' && /椎名/.test(r.items[2].v) && /山田/.test(r.items[2].v), r.items);
  ok('整備の ×2 はここでも出る（取り分が違うので）', r.items[1].v === '箱崎×2', r.items[1]);
  ok('🔴 チェックには ×2 が付かない', !/×/.test(r.items[2].v), r.items[2]);
  ok('🔴 「該当者なし」と「未入力」を言い分ける',
     r.v2[0].v === '該当者なし' && /is-none/.test(r.v2[0].cls)
     && r.v2[1].v === '未入力' && /is-miss/.test(r.v2[1].cls), r.v2);
  ok('🔴 導入日より前のカードでは、チェックの欄を出さない（直しようが無いため）', r.n3 === 2, r.n3);
  ok('🔴 伝票は読む所＝押せない（ボタンも onclick も無い）', r.buttons === 0 && r.onclick === false, r);
}

console.log('\n── 🧭 ソースの見張り ──');
{
  const mp = fs.readFileSync('js/mech-pick.js', 'utf8');
  const mg = fs.readFileSync('js/mech-guard.js', 'utf8');
  const ir = fs.readFileSync('js/inspect-rules.js', 'utf8');
  const cu = fs.readFileSync('js/customers.js', 'utf8');
  const cv = fs.readFileSync('js/card-view.js', 'utf8');
  const mb = fs.readFileSync('js/members-pit.js', 'utf8');
  ok('🔴 3つの役は mech-pick の1か所（ROLES）に並んでいる', /var ROLES = \[/.test(mp), '');
  ok('🔴🔴 窓は自分でチェック担当を数えていない（物差しを借りている）', !/checkers/.test(mg), '');
  ok('🔴🔴 データチェックも書き写していない', !/checkers/.test(ir), '');
  ok('🔴 伝票は部品を呼んでいるだけ（見た目を書き写していない）',
     /pitMechLine\(c\)/.test(cu) && !/cf-ml-t/.test(cu), '');
  ok('🔴 予約詳細も部品から出している（チップを書き写していない）', !/cf-mech-c/.test(cv), '');
  ok('🔴 改名の追従に checkerIds が入っている（別人にならない）', /checkerIds/.test(mb), '');
  const ix = fs.readFileSync('index.html', 'utf8');
  const ver = (ix.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('版が3か所そろっている',
     !!ver && ix.indexOf('<span class="ver">v' + ver + '</span>') >= 0
           && ix.indexOf('<div class="login-ver">v' + ver + '</div>') >= 0, ver);
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

console.log('\n' + (fail ? '⚠ ' : '🎉 ') + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail ? 1 : 0);
