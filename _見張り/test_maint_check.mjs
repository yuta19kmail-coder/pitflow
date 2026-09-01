/* PitFlow v1.100.0 ── 整備タブの「作業チェック」を7項目に入れ替え
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-15）
     「タスクボード上の予約詳細から整備の部分で作業チェックの欄、これを既存のものから入れ替えて
        オイル入れ／タイヤローテーション／タイヤエア調整／LLC・ウォッシャー補充／
        タイヤ増締め／ライト回りチェック／サイドスリップ調整」

   ◎ここで見張ること
     🔴 予約詳細の整備タブに、**この7つがこの順で**出る
     🔴 昔の項目（受付・問診／点検／整備・調整／完成検査・洗車 …）が**1つも残っていない**
     🔴 **作業タイプで中身が変わらない**（車検でも一般整備でも同じ7つ）
     🔴 ✓は**番号ではなく合言葉（key）**で保存する＝項目を足しても過去の✓がずれない
     🔴 **昔の番号の✓は読まない**（項目が別物なので、引き継ぐと嘘になる）
     🔴 **「予約を編集」の画面も同じ7つ・同じ✓**（前は詳細と編集で別々の表だった）
     🔴 項目の表は state.js の1本だけ。画面側に書き写していない

   ◎使い方
     python3 -m http.server 8934      ← 別ウィンドウ
     node test_maint_check.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8934;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const WANT = ['オイル入れ', 'タイヤローテーション', 'タイヤエア調整', 'LLC・ウォッシャー補充',
              'タイヤ増締め', 'ライト回りチェック', 'サイドスリップ調整'];
const OLD  = ['受付・問診', '24ヶ月点検', '下回り点検', '整備・調整', '検査ライン', '完成検査・洗車',
              '点検', 'オイル交換', 'オイルエレメント', '空気圧調整', '灯火類', '洗車'];

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.openDetail && window.PIT_MAINT_CHECKS', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

/* 整備タブを開いて、作業チェックの中身を読む */
const openMaint = over => p.evaluate(o => {
  state.cards = [Object.assign({
    id: 'MK1', resNo: 'R-MK1', customer: '整備 太郎', car: 'プリウス', boardId: 'default', division: 'div1',
    workType: 'general', status: 'work', dropType: 'drop', maint: {}, log: []
  }, o || {})];
  openDetail('MK1');
  const t = document.querySelector('.cv-tab[data-p=maint]');
  if (t) cvTab(t);
  const wrap = document.querySelector('#cv-p-maint .cv-checks');
  const sec = wrap ? wrap.closest('.cv-sec') : null;
  return {
    labels: wrap ? [].map.call(wrap.querySelectorAll('.cv-chk'), e => e.textContent.trim()) : [],
    on: wrap ? [].map.call(wrap.querySelectorAll('.cv-chk'), e => e.classList.contains('on')) : [],
    title: sec ? (sec.querySelector('.cv-sect') || {}).textContent.trim() : '',
    prog: sec ? (sec.querySelector('.cv-prog') || {}).textContent.trim() : ''
  };
}, over || null);

console.log('\n── 🔧 7つがこの順で出る ──');
{
  const r = await openMaint();
  ok('🔴 ちょうど7つ', r.labels.length === 7, r.labels);
  WANT.forEach((w, i) => ok('🔴 ' + (i + 1) + '番目が「' + w + '」', r.labels[i] === w, r.labels[i]));
  ok('🔴 昔の項目が1つも残っていない', !r.labels.some(l => OLD.indexOf(l) >= 0), r.labels);
  ok('見出しは「作業チェック」（作業タイプ名は付けない＝中身が変わらないので）', r.title === '作業チェック', r.title);
  ok('「0 / 7 完了」と出る', /0 \/ 7/.test(r.prog), r.prog);
}

console.log('\n── 🚗 作業タイプで中身が変わらない ──');
for (const wt of ['shaken', '12pt', 'bp', 'general']) {
  const r = await openMaint({ workType: wt });
  ok('🔴 ' + wt + ' でも同じ7つ', JSON.stringify(r.labels) === JSON.stringify(WANT), r.labels);
}

console.log('\n── ✓ タップした時の保存の形 ──');
{
  await openMaint();
  const r = await p.evaluate(() => {
    const chks = document.querySelectorAll('#cv-p-maint .cv-checks .cv-chk');
    chks[0].click();          /* オイル入れ */
    chks[4].click();          /* タイヤ増締め */
    const c = state.cards[0];
    const sec = chks[0].closest('.cv-sec');
    return {
      keys: Object.keys(c.maint.checks || {}),
      checks: JSON.parse(JSON.stringify(c.maint.checks || {})),
      numKeys: Object.keys(c.maint.checks || {}).filter(k => /^\d+$/.test(k)),
      prog: (sec.querySelector('.cv-prog') || {}).textContent.trim(),
      onCls: [].map.call(chks, e => e.classList.contains('on'))
    };
  });
  ok('🔴 合言葉で保存している（番号ではない）', r.numKeys.length === 0, r.keys);
  ok('🔴 オイル入れ＝oil に入る', r.checks.oil === true, r.checks);
  ok('🔴 タイヤ増締め＝retorque に入る', r.checks.retorque === true, r.checks);
  ok('押した2つだけ✓が付く', r.onCls[0] && r.onCls[4] && !r.onCls[1] && !r.onCls[6], r.onCls);
  ok('「2 / 7 完了」に変わる', /2 \/ 7/.test(r.prog), r.prog);

  const r2 = await p.evaluate(() => {
    const chks = document.querySelectorAll('#cv-p-maint .cv-checks .cv-chk');
    chks[0].click();          /* もう一度押して外す */
    const sec = chks[0].closest('.cv-sec');
    return { oil: state.cards[0].maint.checks.oil, prog: (sec.querySelector('.cv-prog') || {}).textContent.trim() };
  });
  ok('もう一度押すと外れる', r2.oil === false && /1 \/ 7/.test(r2.prog), r2);
}

console.log('\n── 🧠 昔の番号の✓を本物と思い込まない ──');
{
  /* v1.88.0 の決めごとと同じ考え方＝**別物のデータを、それらしいからと流用しない** */
  const r = await openMaint({ maint: { checks: { 0: true, 1: true, 2: true } } });
  ok('🔴 昔の番号の✓は1つも引き継がない', r.on.every(x => x === false), r.on);
  ok('「0 / 7 完了」のまま', /0 \/ 7/.test(r.prog), r.prog);
  const r2 = await openMaint({ maint: { 0: true, 3: true } });   /* さらに昔（編集画面）の形 */
  ok('🔴 もっと昔の形（編集画面の番号）も引き継がない', r2.on.every(x => x === false), r2.on);
}

console.log('\n── 📝 「予約を編集」の画面も同じ7つ・同じ✓ ──');
{
  const r = await p.evaluate(() => {
    state.cards = [{ id: 'MK2', resNo: 'R-MK2', customer: '整備 次郎', car: 'ノート', boardId: 'default',
                     workType: 'shaken', status: 'work', dropType: 'drop', maint: { checks: { air: true } }, log: [] }];
    openDetail('MK2');
    if (window.openCardEditForm) openCardEditForm('MK2');
    const wrap = document.querySelector('.cf-checks');
    return {
      /* ⚠ ✓の箱も同じ要素の中にあるので、ラベル（.cf-chkl）だけを読む */
      labels: wrap ? [].map.call(wrap.querySelectorAll('.cf-chk'), e => ((e.querySelector('.cf-chkl') || e).textContent || '').trim()) : [],
      on: wrap ? [].map.call(wrap.querySelectorAll('.cf-chk'), e => e.classList.contains('on')) : []
    };
  });
  ok('🔴 編集画面も同じ7つ（同じ順）', JSON.stringify(r.labels) === JSON.stringify(WANT), r.labels);
  ok('🔴 詳細で付けた✓がそのまま出る（3番目＝タイヤエア調整）', r.on[2] === true && r.on.filter(Boolean).length === 1, r.on);

  const r2 = await p.evaluate(() => {
    document.querySelectorAll('.cf-checks .cf-chk')[6].click();   /* サイドスリップ調整 */
    return JSON.parse(JSON.stringify(state.cards[0].maint.checks || {}));
  });
  ok('🔴 編集画面で付けても同じ場所（合言葉）に入る', r2.sideslip === true && r2.air === true, r2);
}

console.log('\n── 🧭 表が1本か・まわりが壊れていないか ──');
{
  const st = fs.readFileSync('js/state.js', 'utf8');
  ok('🔴 項目の表が state.js に1本ある', /PIT_MAINT_CHECKS\s*=\s*\[/.test(st) && /window\.PIT_MAINT_CHECKS/.test(st), '');
  ok('🔴 読み書きの物差しもある', /function pitMaintChecked/.test(st) && /function pitMaintToggle/.test(st), '');

  /* 画面側に項目名を書き写していないか（書き写すと、片方だけ直して食い違う） */
  for (const f of ['card-view.js', 'card-tabs.js']) {
    const src = fs.readFileSync('js/' + f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');   /* コメントを外してから調べる */
    ok('項目名を書き写していない（' + f + '）', !WANT.some(w => src.indexOf(w) >= 0), f);
    ok('昔の項目も残っていない（' + f + '）', !/受付・問診|オイルエレメント|完成検査・洗車/.test(src), f);
  }
  const ct = fs.readFileSync('js/card-tabs.js', 'utf8');
  ok('🔴 編集画面の作業タイプ別リスト（cfMaintItems）は消してある', !/cfMaintItems/.test(ct), '');

  await p.evaluate(() => { if (window.pitSampleData) pitSampleData(); });
  await p.waitForTimeout(400);
  for (const v of ['dashboard', 'today', 'task', 'reserve', 'return', 'result']) {
    await p.evaluate(x => { try { showView(x); } catch (e) {} }, v);
    await p.waitForTimeout(200);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
}

console.log('\n── 📣 お知らせ ──');
{
  const news = fs.readFileSync('js/news-pit.js', 'utf8');
  ok('🔴 作業チェックの入れ替えが1件入っている', /n-20260815-maintcheck/.test(news), '');
  ok('🔴 ⋮メニューと売上なしの1件も入っている', /n-20260815-nosale/.test(news), '');
  ok('お知らせに7項目が書いてある', WANT.every(w => news.indexOf(w) >= 0), '');
  const idx = news.indexOf('n-20260815-maintcheck');
  const idx2 = news.indexOf('n-20260815-nosale');
  ok('新しいほうが先頭側にある（受信箱は版の新しい順）', idx >= 0 && idx < idx2, [idx, idx2]);
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
