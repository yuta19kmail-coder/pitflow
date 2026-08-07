/* PitFlow v1.64.0 ── 受注の質（基準値との差／見積との差）＋ クイック受注
   -------------------------------------------------------------------
   ◎ゆうた指定
     ①「会社平均（国産・輸入・車検12点などの振り分け後の単価）と自身の獲得受注との差分金額と％」
     ②「見積金額（見積中→連絡中間）と最終金額との差分金額と％」　どちらも全体と内容ごと
     ③「点検待ち・見積もり中から作業待ち・作業完了まで一気に飛ぶ場合は受注金額だけを入れられるようにして、
        内部的には見積もり金額と＝という扱い。返車予定日は当日をデフォルトで入力済みに」
   ◎ゆうた確認済み（2026-08-06）
     測る対象＝返車まで終わった車の確定額／**基準値＝設定の概算金額の表**（カードごとの概算は見ない）／最終金額＝確定額／
     クイック受注＝受注の関門（パーツ待ち）を飛び越えた時ぜんぶ
   ◎使い方（PitFlow のフォルダで）
     python3 -m http.server 8988      ← 別ウィンドウ
     node test_front_quality.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8988;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.renderSales && window.PitPhasePopup && window.pitIsOrderJump', null, { timeout: 25000 });
await p.waitForTimeout(700);

const W = await p.evaluate(() => {
  const pad = n => (n < 10 ? '0' : '') + n;
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return { today: ymd(t), mid: ymd(new Date(t.getFullYear(), t.getMonth(), Math.min(15, t.getDate()))) };
});

/* ───────────────────────────────────────────────
   仕込み：基準値（設定の概算金額）を国産×車検＝10万 に固定してから、
   斎藤 … 12万 / 12万（基準より＋2万ずつ＝＋4万）
   田中 … 8万 / 8万 （基準より−2万ずつ＝−4万）
   さらに 輸入×一般（基準30万）を斎藤に1台＝30万ぴったり（＝±0）
   🔴 月平均ではなく基準値と比べるので、**1台しかいないバケツでも差がちゃんと出る**のが要点。
   ─────────────────────────────────────────────── */
const seed = () => p.evaluate(([W]) => {
  /* 🔴 v1.64.0 評価の基準値＝PIT_BASE_AMOUNT（裏の平均値）。設定の概算金額とは別物なので、
     わざと**まったく違う値**を入れて「どちらを見ているか」がはっきり分かるようにする。 */
  window.PIT_BASE_AMOUNT = {
    default: { shaken: 100000, '12pt': 30000, general: 50000, oil: 5000 },
    import:  { shaken: 200000, '12pt': 60000, general: 300000, oil: 9000 }
  };
  state.settings = state.settings || {};
  state.settings.estAmount = {   /* ← こちらは概算（中央値）。評価には使われないはず */
    default: { shaken: 1, '12pt': 1, general: 1, oil: 1, _default: 1 },
    import:  { shaken: 1, '12pt': 1, general: 1, oil: 1, _default: 1 }
  };
  const mk = (id, front, board, wt, final, quote) => ({
    id, resNo: 'R-' + id, customer: id, car: 'x', boardId: board, division: board === 'import' ? 'div2' : 'div1',
    workType: wt, workTypes: [wt], status: 'returned', completedAt: W.mid, returnDate: W.mid,
    amountFinal: final, amountQuote: quote, frontStaff: front,
    estAmount: 999999999   /* ⚠ カードごとの概算は物差しに使わない（これが混ざったら数字が壊れる） */
  });
  window._keepCards = state.cards;
  state.cards = [
    mk('Q1', '斎藤', 'default', 'shaken', 120000, 100000),   // 基準10万 → ＋2万 ／ 見積10万→確定12万
    mk('Q2', '斎藤', 'default', 'shaken', 120000, null),     // 見積なし＝見積差の分母から外れる
    mk('Q3', '田中', 'default', 'shaken', 80000, 100000),    // 基準10万 → −2万
    mk('Q4', '田中', 'default', 'shaken', 80000, 100000),
    mk('Q5', '斎藤', 'import', 'general', 300000, 300000)    // 基準30万ぴったり＝±0
  ];
  window._svTab = 'front'; window._svMode = 'month'; window._svFrontView = 'info';
  const now = new Date(); window._svYM = { y: now.getFullYear(), m: now.getMonth() };
  renderSales();
  return document.getElementById('view-sales-body').innerText.replace(/\n+/g, ' | ');
}, [W]);

console.log('\n── 📐 基準値の表（比べるものさし＝設定の概算金額） ──');
const txt = await seed();
{
  ok('🔴 「受注の質」の別ボタンは無くなっている（1枚に統合）', !/受注の質<\/button>/.test(await p.evaluate(() => document.getElementById('view-sales-body').innerHTML)), txt.slice(0, 200));
  ok('入口はインフォグラフィックと表の2つだけ', (await p.evaluate(() => [...document.querySelectorAll('.sv-vbtn')].map(b => b.textContent).join(','))) === 'インフォグラフィック,表');
  ok('基準値の表が出ている', /基準値（比べるものさし）/.test(txt), txt.slice(0, 400));
  ok('🔴 概算金額（中央値）とは別物だと断ってある', /新規予約の「概算金額」（設定・中央値）とは別の数字/.test(txt), txt.slice(0, 900));
  ok('🔴 半年後に自動計算へ切り替える予定が書いてある', /半年ほど運用したら、実績から自動計算に切り替えます/.test(txt), txt.slice(0, 900));
  ok('国産×車検＝10万 が出ている', /国産（1課）[\s\S]{0,40}10万/.test(txt), txt.slice(0, 600));
  ok('輸入×一般＝30万 が出ている', /輸入（2課）[\s\S]{0,60}30万/.test(txt), txt.slice(0, 700));
}

console.log('\n── 🧩 1枚に統合されているか ──');
{
  const blocks = await p.evaluate(() => [...document.querySelectorAll('.sv-fcard')].map(el => ({
    name: (el.querySelector('.sv-fcard-name') || {}).textContent,
    hasSales: !!el.querySelector('.sv-fcard-sales'),
    hasDow: !!el.querySelector('.sv-dowbars'),
    hasQuality: !!el.querySelector('.sv-q2'),
    hasQtbl: !!el.querySelector('.sv-qtbl'),
    txt: el.innerText.replace(/\n+/g, ' | ')
  })));
  ok('フロントごとのブロックが2枚', blocks.length === 2, blocks.map(b => b.name));
  ok('🔴 同じブロックの中に 売上・曜日・受注の質 が全部入っている',
     blocks.every(b => b.hasSales && b.hasDow && b.hasQuality && b.hasQtbl), blocks.map(b => ({ n: b.name, s: b.hasSales, d: b.hasDow, q: b.hasQuality })));
  ok('受注の質の区切り見出しが入っている', /受注の質/.test(blocks[0].txt), blocks[0].txt);
}

console.log('\n── 📊 軸1：基準値との差 ──');
{
  const r = await p.evaluate(() => [...document.querySelectorAll('.sv-fcard')].map(el => ({
    name: el.querySelector('.sv-fcard-name').textContent, txt: el.innerText.replace(/\n+/g, ' | ')
  })));
  const sai = r.find(x => x.name === '斎藤'), tan = r.find(x => x.name === '田中');
  ok('見出しが「基準値との差」になっている', /基準値との差/.test(sai.txt), sai.txt);
  ok('🔴 斎藤＝基準より ＋4万（12万×2台 − 基準10万×2台。輸入の1台は±0）', /＋4万/.test(sai.txt), sai.txt);
  ok('🔴 田中＝基準より −4万（8万×2台 − 基準10万×2台）', /−4万/.test(tan.txt), tan.txt);
  ok('田中の％は −20.0%', /−20\.0%/.test(tan.txt), tan.txt);
  const html = await p.evaluate(() => document.getElementById('view-sales-body').innerHTML);
  ok('基準より上は緑・下は赤の印が付く', /sv-dup/.test(html) && /sv-ddn/.test(html));
  ok('内容ごとの行（車検）が出る', /車検/.test(sai.txt), sai.txt);
  ok('🔴 1台しかいない輸入×一般でも、基準値と比べて ±0 と出る（月平均だと必ず±0で意味がなかった所）', /一般/.test(sai.txt) && /±0/.test(sai.txt), sai.txt);
  ok('🔴 カードごとの概算（99,999万）は物差しに使っていない', !/9999/.test(sai.txt), sai.txt);
  /* 斎藤＝車検国産(基準10万)×2 ＋ 一般輸入(基準30万)×1 → 1台あたりの基準は (10+10+30)/3 = 16.7万。
     設定の概算金額（1円）を見ていたらここは 0万 になる。 */
  ok('🔴 設定の概算金額（1円）ではなく、裏の基準値を見ている（1台あたり基準 16.7万）', /基準 16\.7万/.test(sai.txt), sai.txt);
}

console.log('\n── 🧾 軸2：見積との差（取りこぼし） ──');
{
  const r = await p.evaluate(() => [...document.querySelectorAll('.sv-fcard')].map(el => ({
    name: el.querySelector('.sv-fcard-name').textContent, txt: el.innerText.replace(/\n+/g, ' | ')
  })));
  const sai = r.find(x => x.name === '斎藤'), tan = r.find(x => x.name === '田中');
  ok('見積との差の見出しが出る', /見積との差/.test(sai.txt), sai.txt);
  ok('🔴 斎藤＝見積40万→確定42万で ＋2万（見積なしのQ2は数えない）', /見積 40万 → 確定 42万（2台）/.test(sai.txt), sai.txt);
  ok('🔴 田中＝見積20万→確定16万で −4万', /見積 20万 → 確定 16万（2台）/.test(tan.txt), tan.txt);
  const noQuote = await p.evaluate(([W]) => {
    state.cards = [{ id: 'QZ', resNo: 'R-QZ', customer: 'z', car: 'x', boardId: 'default', division: 'div1',
      workType: 'shaken', workTypes: ['shaken'], status: 'returned', completedAt: W.mid, returnDate: W.mid,
      amountFinal: 100000, frontStaff: '見積なし太郎' }];
    renderSales();
    return document.getElementById('view-sales-body').innerText.replace(/\n+/g, ' | ');
  }, [W]);
  ok('見積が1台も無いフロントは「—」と出る（0扱いにしない）', /見積額が入っている車がありません/.test(noQuote), noQuote.slice(0, 400));
}

console.log('\n── 📅 物差しが月ごとに動かない ──');
{
  const r = await p.evaluate(([W]) => {
    const pad = n => (n < 10 ? '0' : '') + n;
    const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const t = new Date();
    const prev = ymd(new Date(t.getFullYear(), t.getMonth() - 1, 15));
    /* 先月に1台だけ、同じ条件（国産×車検 12万）の車を置く */
    state.cards = [{ id: 'PM', resNo: 'R-PM', customer: 'p', car: 'x', boardId: 'default', division: 'div1',
      workType: 'shaken', workTypes: ['shaken'], status: 'returned', completedAt: prev, returnDate: prev,
      amountFinal: 120000, amountQuote: 120000, frontStaff: '斎藤' }];
    window._svYM = { y: t.getFullYear(), m: t.getMonth() - 1 };
    renderSales();
    return document.getElementById('view-sales-body').innerText.replace(/\n+/g, ' | ');
  }, [W]);
  ok('🔴 先月に1台だけでも、基準10万と比べて ＋2万 と出る（月平均なら±0になってしまう所）', /＋2万/.test(r), r.slice(0, 600));
  ok('％も出る（＋20.0%）', /＋20\.0%/.test(r), r.slice(0, 600));
}

console.log('\n── ⚡ クイック受注：どこで出るか（物差し1本） ──');
{
  const j = await p.evaluate(() => ({
    checkWork:      pitIsOrderJump('check', 'work'),
    checkDone:      pitIsOrderJump('check', 'workDone'),
    estimWork:      pitIsOrderJump('estim', 'work'),
    estimDone:      pitIsOrderJump('estim', 'workDone'),
    estimParts:     pitIsOrderJump('estim', 'parts'),
    checkParts:     pitIsOrderJump('check', 'parts'),
    contactWork:    pitIsOrderJump('contact', 'work'),
    contactParts:   pitIsOrderJump('contact', 'parts'),
    estimContact:   pitIsOrderJump('estim', 'contact'),
    checkEstim:     pitIsOrderJump('check', 'estim'),
    partsWork:      pitIsOrderJump('parts', 'work'),
    workDoneBack:   pitIsOrderJump('workDone', 'work'),
    outsource:      pitIsOrderJump('check', 'outsource'),
    scrap:          pitIsOrderJump('estim', 'scrap')
  }));
  ok('🔴 点検待ち → 作業待ち＝出る', j.checkWork === true, j);
  ok('🔴 点検待ち → 作業完了＝出る', j.checkDone === true, j);
  ok('🔴 見積り中 → 作業待ち＝出る', j.estimWork === true, j);
  ok('🔴 見積り中 → 作業完了＝出る', j.estimDone === true, j);
  ok('見積り中 → パーツ待ち（連絡中を飛ばした）＝出る', j.estimParts === true, j);
  ok('点検待ち → パーツ待ち＝出る', j.checkParts === true, j);
  ok('連絡中 → 作業待ち（パーツ待ちを飛ばした）＝出る', j.contactWork === true, j);
  ok('⚠ 連絡中 → パーツ待ち＝出ない（今までどおりの受注ポップアップ）', j.contactParts === false, j);
  ok('見積り中 → 連絡中＝出ない（見積ポップアップ）', j.estimContact === false, j);
  ok('点検待ち → 見積り中＝出ない', j.checkEstim === false, j);
  ok('受注済みどうしの移動＝出ない', j.partsWork === false && j.workDoneBack === false, j);
  ok('外注・キャンセルは対象外', j.outsource === false && j.scrap === false, j);
}

console.log('\n── ⚡ クイック受注：入れた値がどう入るか ──');
{
  const open = await p.evaluate(() => {
    state.cards = [{ id: 'QK', resNo: 'R-QK', customer: 'クイック 太郎', car: 'アクア', boardId: 'default',
      division: 'div1', workType: 'oil', workTypes: ['oil'], status: 'check', estAmount: 5000 }];
    const c = state.cards[0];
    let committed = false;
    window._qkCommitted = () => committed;
    const took = PitPhasePopup.maybeIntercept(c, 'check', 'workDone', function(){ committed = true; c.status = 'workDone'; });
    return {
      took,
      shown: document.getElementById('pp-backdrop').classList.contains('show'),
      title: document.getElementById('pp-title').textContent,
      amtLb: document.getElementById('pp-amt-lb').textContent,
      amtVal: document.getElementById('pp-amt').value,
      retShown: document.getElementById('pp-ret-field').style.display !== 'none',
      retVal: document.getElementById('pp-ret').value,
      ref: document.getElementById('pp-amt-ref').textContent,
      okLb: document.getElementById('pp-ok').textContent
    };
  });
  ok('一気に飛ばすとポップアップが出る', open.took === true && open.shown === true, open);
  ok('見出しは「クイック受注」', open.title === 'クイック受注', open);
  ok('🔴 聞くのは「受注金額」ひとつだけ', open.amtLb === '受注金額', open);
  ok('概算（5,000円）があらかじめ入っている', open.amtVal === '5,000', open);
  ok('🔴 返車予定日の欄が出て、当日が入っている', open.retShown === true && open.retVal === W.today, open);
  ok('「見積は受注と同じ額で記録」と断ってある', /見積は受注と同じ額で記録/.test(open.ref), open);
  ok('ボタンは行き先の名前になる', /作業完了/.test(open.okLb), open);

  const after = await p.evaluate(() => {
    const el = document.getElementById('pp-amt');
    el.value = '8,800';
    PitPhasePopup.close(true);
    const c = state.cards.find(x => x.id === 'QK');
    return { order: c.amountOrder, quote: c.amountQuote, final: c.amountFinal,
             plan: c.returnDatePlan, returnDate: c.returnDate, returnDateFinal: c.returnDateFinal,
             status: c.status, committed: window._qkCommitted(),
             flow: (c.log || []).map(e => e.label || (e.type + ':' + e.to)) };
  });
  ok('移動が確定する', after.committed === true && after.status === 'workDone', after);
  ok('🔴 受注金額が入る', after.order === 8800, after);
  ok('🔴 見積金額も同じ額で入る（見積＝受注の扱い）', after.quote === 8800, after);
  ok('確定金額はまだ入れない（完TELで入れる）', after.final == null, after);
  /* 🔴 v1.65.0 ここで入るのは **B＝返車予定日（約束）**。確定返車日（C）は完TELで入る。 */
  ok('🔴 返車予定日（予定＝B）が当日で入る', after.plan === W.today && !after.returnDate, after);
  ok('フローに「クイック受注」と残る', after.flow.some(x => /クイック受注/.test(String(x))), after.flow);

  /* 打ち直した日付が効くこと */
  const other = await p.evaluate(() => {
    state.cards = [{ id: 'QK2', resNo: 'R-QK2', customer: 'b', car: 'x', boardId: 'default', division: 'div1',
      workType: 'oil', workTypes: ['oil'], status: 'estim', estAmount: 5000 }];
    const c = state.cards[0];
    PitPhasePopup.maybeIntercept(c, 'estim', 'work', function(){ c.status = 'work'; });
    document.getElementById('pp-amt').value = '12,000';
    document.getElementById('pp-ret').value = '2026-12-24';
    PitPhasePopup.close(true);
    return { order: c.amountOrder, quote: c.amountQuote, rd: c.returnDatePlan, st: c.status };
  });
  ok('日付を打ち直したらその日が予定（B）に入る', other.rd === '2026-12-24' && other.order === 12000 && other.quote === 12000, other);

  /* キャンセルしたら何も入らない・動かない */
  const cancel = await p.evaluate(() => {
    state.cards = [{ id: 'QK3', resNo: 'R-QK3', customer: 'c', car: 'x', boardId: 'default', division: 'div1',
      workType: 'oil', workTypes: ['oil'], status: 'check', estAmount: 5000 }];
    const c = state.cards[0];
    PitPhasePopup.maybeIntercept(c, 'check', 'work', function(){ c.status = 'work'; });
    document.getElementById('pp-amt').value = '99,999';
    PitPhasePopup.close(false);
    return { order: c.amountOrder, quote: c.amountQuote, rd: c.returnDatePlan, st: c.status };
  });
  ok('キャンセルしたら金額も日付も入らず、工程も動かない', cancel.order == null && cancel.quote == null && !cancel.rd && cancel.st === 'check', cancel);
}

console.log('\n── 🔗 クイック受注の車が、そのまま集計に乗る ──');
{
  const r = await p.evaluate(([W]) => {
    /* クイック受注で受注＝見積 8,800 が入り、返車まで行った車 */
    state.cards = [{ id: 'QF', resNo: 'R-QF', customer: 'クイック', car: 'x', boardId: 'default', division: 'div1',
      workType: 'oil', workTypes: ['oil'], status: 'returned', frontStaff: '斎藤',
      amountQuote: 8800, amountOrder: 8800, amountFinal: 8800, completedAt: W.mid, returnDate: W.mid }];
    window._svTab = 'front'; window._svFrontView = 'info';
    const now = new Date(); window._svYM = { y: now.getFullYear(), m: now.getMonth() };
    renderSales();
    return document.getElementById('view-sales-body').innerText.replace(/\n+/g, ' | ');
  }, [W]);
  ok('🔴 見積＝受注なので「見積との差」は ±0（取りこぼし扱いにならない）', /±0/.test(r), r.slice(0, 800));
  ok('🔴 基準値（オイル 5,000円）と比べて ＋3,800円ぶんの差が出る', /＋0\.4万|＋3,800|＋0\.4/.test(r), r.slice(0, 800));
}

console.log('\n── 📚 基準値は「概算金額」と別物になっているか ──');
{
  const r = await p.evaluate(() => ({
    hasFn: typeof window.pitBaseAmount === 'function',
    /* 表に無い作業タイプ（コーティング）は概算に落ちる */
    fallback: (function(){ state.settings.estAmount.default.coat1y = 33333; return pitBaseAmount('coat1y', 'default'); })(),
    base: pitBaseAmount('shaken', 'default'),
    est: pitEstAmount('shaken', 'default')
  }));
  ok('評価用の基準値を引く物差しがある（pitBaseAmount）', r.hasFn === true, r);
  ok('🔴 概算（1円）ではなく基準値（10万）を返す', r.base === 100000 && r.est === 1, r);
  ok('基準値の表に無い作業タイプは概算に落ちる（コーティング等）', r.fallback === 33333, r);
  const cell = await p.evaluate(() => {
    const el = [...document.querySelectorAll('.sv-card')].find(x => /基準値（比べるものさし）/.test(x.innerText));
    return el ? el.innerText.replace(/\n+/g, ' | ') : '';
  });
  ok('借り物のマスには「概算」と印が付く', /概算/.test(cell), cell.slice(0, 400));
}

console.log('\n── 📝 設定画面に「いずれ自動計算」と残っているか ──');
{
  const t = await p.evaluate(() => {
    try { showView('settings'); } catch (e) {}
    const el = document.getElementById('view-settings-body') || document.body;
    return el.innerText.replace(/\n+/g, ' | ');
  });
  ok('🔴 いずれ自動計算に切り替える旨が書いてある', /実績から自動計算に切り替えます/.test(t), t.slice(0, 300));
  ok('いまの値が中央値だと書いてある', /中央値/.test(t), t.slice(0, 300));
  ok('評価の基準値は別の数字だと書いてある', /これとは別の数字/.test(t), t.slice(0, 300));
  ok('半年ほど運用したら、と期限が書いてある', /半年ほど運用したら/.test(t), t.slice(0, 300));
  ok('そのとき詰めることまで残してある', /そのとき詰めること/.test(t), t.slice(0, 300));
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  const back = await p.evaluate(() => {
    state.cards = window._keepCards || [];
    const out = {};
    ['info', 'table'].forEach(v => {
      window._svTab = 'front'; window._svFrontView = v;
      renderSales();
      out[v] = document.getElementById('view-sales-body').innerText.length;
    });
    ['sales', 'quarter', 'work', 'front'].forEach(t => { window._svTab = t; renderSales(); });
    window._svMode = 'year'; renderSales(); window._svMode = 'month';
    return out;
  });
  ok('インフォグラフィックと表の2つとも描ける', back.info > 50 && back.table > 50, back);
  ok('売上・クォーター・作業内容・フロント・年度 を回してもエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  /* ⚠ 版は上がっていくので数字を打ち込まない（v1.62.0 以降かだけ見る） */
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.62.0 以降になっている', vn[0] > 1 || (vn[0] === 1 && vn[1] >= 62), ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
