/* PitFlow v1.62.0 ── 受注の質（会社平均との差／見積との差）＋ クイック受注
   -------------------------------------------------------------------
   ◎ゆうた指定
     ①「会社平均（国産・輸入・車検12点などの振り分け後の単価）と自身の獲得受注との差分金額と％」
     ②「見積金額（見積中→連絡中間）と最終金額との差分金額と％」　どちらも全体と内容ごと
     ③「点検待ち・見積もり中から作業待ち・作業完了まで一気に飛ぶ場合は受注金額だけを入れられるようにして、
        内部的には見積もり金額と＝という扱い。返車予定日は当日をデフォルトで入力済みに」
   ◎ゆうた確認済み（2026-08-06）
     測る対象＝返車まで終わった車の確定額／会社平均＝見ている期間と同じ／最終金額＝確定額／
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
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1`);
await p.waitForFunction('window.state && window.renderSales && window.PitPhasePopup && window.pitIsOrderJump', null, { timeout: 25000 });
await p.waitForTimeout(700);

const W = await p.evaluate(() => {
  const pad = n => (n < 10 ? '0' : '') + n;
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return { today: ymd(t), mid: ymd(new Date(t.getFullYear(), t.getMonth(), Math.min(15, t.getDate()))) };
});

/* ───────────────────────────────────────────────
   仕込み：1課(国産)×車検 の会社平均が 10万 になるように4台置く。
   斎藤 … 12万 / 12万（平均より＋2万ずつ＝＋4万）
   田中 … 8万 / 8万 （平均より−2万ずつ＝−4万）
   さらに 2課(輸入)×一般 を 斎藤に1台（平均＝自分だけ＝差0）＝バケツ分けが効いていることの確認
   ─────────────────────────────────────────────── */
const seed = () => p.evaluate(([W]) => {
  const mk = (id, front, board, wt, final, quote) => ({
    id, resNo: 'R-' + id, customer: id, car: 'x', boardId: board, division: board === 'import' ? 'div2' : 'div1',
    workType: wt, workTypes: [wt], status: 'returned', completedAt: W.mid, returnDate: W.mid,
    amountFinal: final, amountQuote: quote, frontStaff: front
  });
  window._keepCards = state.cards;
  state.cards = [
    mk('Q1', '斎藤', 'default', 'shaken', 120000, 100000),   // 見積10万→確定12万（＋2万）
    mk('Q2', '斎藤', 'default', 'shaken', 120000, null),     // 見積なし＝見積差の分母から外れる
    mk('Q3', '田中', 'default', 'shaken', 80000, 100000),    // 見積10万→確定8万（−2万）
    mk('Q4', '田中', 'default', 'shaken', 80000, 100000),
    mk('Q5', '斎藤', 'import', 'general', 300000, 300000)    // 輸入×一般＝自分1台だけ＝平均差0
  ];
  window._svTab = 'front'; window._svMode = 'month'; window._svFrontView = 'quality';
  const now = new Date(); window._svYM = { y: now.getFullYear(), m: now.getMonth() };
  renderSales();
  return document.getElementById('view-sales-body').innerText.replace(/\n+/g, ' | ');
}, [W]);

console.log('\n── 📐 会社平均単価の表（比べるものさし） ──');
const txt = await seed();
{
  ok('「受注の質」の入口ボタンが出ている', /受注の質/.test(txt), txt.slice(0, 200));
  ok('会社平均単価の表が出ている', /会社平均単価/.test(txt), txt.slice(0, 300));
  ok('1課×車検の会社平均が 10万（4台）', /10万/.test(txt) && /4台/.test(txt), txt.slice(0, 600));
}

console.log('\n── 📊 軸1：会社平均との差 ──');
{
  const r = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.sv-qcard2')].map(el => ({
      name: el.querySelector('.sv-fcard-name').textContent,
      txt: el.innerText.replace(/\n+/g, ' | ')
    }));
    return cards;
  });
  const sai = r.find(x => x.name === '斎藤'), tan = r.find(x => x.name === '田中');
  ok('フロントごとのカードが2枚出る', r.length === 2, r.map(x => x.name));
  ok('🔴 斎藤＝会社平均より ＋4万（12万×2台 − 平均10万×2台）', /＋4万/.test(sai.txt), sai.txt);
  ok('🔴 田中＝会社平均より −4万（8万×2台 − 平均10万×2台）', /−4万/.test(tan.txt), tan.txt);
  ok('％も出る（斎藤＝＋20.0%／車検ぶん）', /＋20\.0%/.test(sai.txt), sai.txt);
  ok('％も出る（田中＝−20.0%）', /−20\.0%/.test(tan.txt), tan.txt);
  ok('平均より上は緑・下は赤の印が付く', /sv-dup/.test(await p.evaluate(() => document.getElementById('view-sales-body').innerHTML)) && /sv-ddn/.test(await p.evaluate(() => document.getElementById('view-sales-body').innerHTML)));
  ok('内容ごとの行（車検）が出る', /車検/.test(sai.txt), sai.txt);
  ok('🔴 バケツ分けが効く＝輸入×一般は自分1台なので差ゼロ扱い（一般の行が ±0）', /一般/.test(sai.txt) && /±0/.test(sai.txt), sai.txt);
}

console.log('\n── 🧾 軸2：見積との差（取りこぼし） ──');
{
  const r = await p.evaluate(() => [...document.querySelectorAll('.sv-qcard2')].map(el => ({
    name: el.querySelector('.sv-fcard-name').textContent, txt: el.innerText.replace(/\n+/g, ' | ')
  })));
  const sai = r.find(x => x.name === '斎藤'), tan = r.find(x => x.name === '田中');
  ok('見積との差の見出しが出る', /見積との差/.test(sai.txt), sai.txt);
  /* 斎藤＝見積(10万+30万)→確定(12万+30万)＝＋2万・2台（Q2は見積なしで除外） */
  ok('🔴 斎藤＝見積40万→確定42万で ＋2万（見積なしのQ2は数えない）', /見積 40万 → 確定 42万（2台）/.test(sai.txt), sai.txt);
  /* 田中＝見積20万→確定16万＝−4万・2台 */
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
             returnDate: c.returnDate, returnDateFinal: c.returnDateFinal,
             status: c.status, committed: window._qkCommitted(),
             flow: (c.log || []).map(e => e.label || (e.type + ':' + e.to)) };
  });
  ok('移動が確定する', after.committed === true && after.status === 'workDone', after);
  ok('🔴 受注金額が入る', after.order === 8800, after);
  ok('🔴 見積金額も同じ額で入る（見積＝受注の扱い）', after.quote === 8800, after);
  ok('確定金額はまだ入れない（完TELで入れる）', after.final == null, after);
  ok('🔴 返車予定日が当日で入る', after.returnDate === W.today && after.returnDateFinal === W.today, after);
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
    return { order: c.amountOrder, quote: c.amountQuote, rd: c.returnDate, st: c.status };
  });
  ok('日付を打ち直したらその日が入る', other.rd === '2026-12-24' && other.order === 12000 && other.quote === 12000, other);

  /* キャンセルしたら何も入らない・動かない */
  const cancel = await p.evaluate(() => {
    state.cards = [{ id: 'QK3', resNo: 'R-QK3', customer: 'c', car: 'x', boardId: 'default', division: 'div1',
      workType: 'oil', workTypes: ['oil'], status: 'check', estAmount: 5000 }];
    const c = state.cards[0];
    PitPhasePopup.maybeIntercept(c, 'check', 'work', function(){ c.status = 'work'; });
    document.getElementById('pp-amt').value = '99,999';
    PitPhasePopup.close(false);
    return { order: c.amountOrder, quote: c.amountQuote, rd: c.returnDate, st: c.status };
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
    window._svTab = 'front'; window._svFrontView = 'quality';
    renderSales();
    return document.getElementById('view-sales-body').innerText.replace(/\n+/g, ' | ');
  }, [W]);
  ok('🔴 見積＝受注なので「見積との差」は ±0（取りこぼし扱いにならない）', /±0/.test(r), r.slice(0, 500));
  ok('会社平均との差も ±0（自分1台＝自分が平均）', (r.match(/±0/g) || []).length >= 2, r.slice(0, 500));
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  const back = await p.evaluate(() => {
    state.cards = window._keepCards || [];
    const out = {};
    ['info', 'table', 'quality'].forEach(v => {
      window._svTab = 'front'; window._svFrontView = v;
      renderSales();
      out[v] = document.getElementById('view-sales-body').innerText.length;
    });
    ['sales', 'quarter', 'work', 'front'].forEach(t => { window._svTab = t; renderSales(); });
    window._svMode = 'year'; renderSales(); window._svMode = 'month';
    return out;
  });
  ok('インフォグラフィック・表・受注の質 の3つとも描ける', back.info > 50 && back.table > 50 && back.quality > 50, back);
  ok('売上・クォーター・作業内容・フロント・年度 を回してもエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  ok('版が v1.62.0 になっている', ver === '1.62.0', ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
