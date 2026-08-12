/* PitFlow v1.86.0 ── 未定欄のBOX（返車4つ・予約4つ）の見張り
   -------------------------------------------------------------------
   ◎ゆうた依頼（2026-08-12）
     「返車の未定欄（完TEL待ち、返車日未定、時間未定、入金待ち）
       予約の未定欄（仮予約、承認待ち、未定、未入庫）もそれぞれBOX化してほしい」

   ◎ここで見張ること（いちばん大事なのは①）
     ① 🔴 **BOXの件数＝未定ビューの件数**。ここがズレたら、どちらかが条件を書き写している。
        ・返車＝`pitReturnPlace`（return-slot.js）が唯一の物差し
        ・予約＝undetermined.js の renderReserveTbd と同じ式
     ② 8つのBOXが「＋ボックス」から足せて、中身（誰の何の車か）が出る
     ③ 中身のチップを押すとカード詳細が開く
     ④ プリセット「未定チェック用」で8つがまとめて出る
     ⑤ 赤いエラーが出ていない

   ◎使い方
     python3 -m http.server 8991      ← 別ウィンドウ・pitflow フォルダで
     node test_mydash_tbd.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

/* BOXのキー → 未定ビューの見出しに出ている言葉 */
const RET = [
  { e: 'telwait', col: '完TEL待ち' },
  { e: 'retDateTbd', col: '返車日未定' },
  { e: 'retTimeTbd', col: '返車時間未定' },
  { e: 'pay', col: '入金待ち', box: '入金待ち' }
];
const RSV = [
  { e: 'approval', col: '承認待ち' },
  { e: 'tentative', col: '仮予約' },
  { e: 'intakeTbd', col: '未定', box: '入庫日未定' },
  { e: 'noShow', col: '未入庫' }
];

const b = await chromium.launch({ executablePath: cp });
const errs = [];

try {
  const ctx = await b.newContext({ viewport: { width: 1700, height: 1200 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text().slice(0, 200)); });

  await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1`);
  await p.evaluate(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
  await p.reload();
  await p.waitForFunction('window.renderMyDash && window.state && state.cards && state.cards.length', null, { timeout: 30000 });
  await p.waitForTimeout(1600);
  await p.evaluate(() => { if (window.pitNewsPopClose) pitNewsPopClose(); });

  /* ---- 🔴 未定の車をこちらで作る（サンプルには居ないため） ----
     ⚠ フラグを立てるだけ。判定そのもの（pitReturnPlace 等）には触らない。 */
  const seeded = await p.evaluate(() => {
    const cs = state.cards.filter(c => !c._draft);
    const put = (c, f) => { Object.keys(f).forEach(k => { c[k] = f[k]; }); };
    const n = {};
    /* 予約の未定 */
    put(cs[0], { status: 'reserved', approvalPending: true, tentative: false, intakeTbd: false, archived: false });
    put(cs[1], { status: 'reserved', tentative: true, approvalPending: false, intakeTbd: false });
    put(cs[2], { status: 'reserved', tentative: true, approvalPending: false, intakeTbd: false });
    put(cs[3], { status: 'reserved', intakeTbd: true, tentative: false, approvalPending: false });
    put(cs[4], { status: 'cancelled', archived: false, cancelledAt: '2026-08-10', approvalPending: false });
    /* 返車の未定（pitReturnPlace が振り分ける） */
    put(cs[5], { status: 'parts', returnStage: 'callWait', approvalPending: false });
    put(cs[6], { status: 'parts', returnStage: 'returnWait', returnDate: '', returnTime: '', approvalPending: false });
    put(cs[7], { status: 'parts', returnStage: 'returnWait', returnDate: '2026-08-20', returnTime: '未定', approvalPending: false });
    put(cs[8], { status: 'returned', paymentSeparate: true, paymentDate: '', returnDate: '2026-08-05', amountFinal: 88000, approvalPending: false });
    n.total = cs.length;
    return n;
  });
  console.log('\n（試験用に未定の車を作った）', JSON.stringify(seeded));

  /* ---- 未定ビューの件数を読む（見出しの .und-cnt） ---- */
  async function viewCounts(view) {
    await p.evaluate(v => window.mydGo(v, 'tbd'), view);
    await p.waitForTimeout(900);
    return p.evaluate(v => {
      var out = {};
      var wrap = document.getElementById(v === 'return' ? 'return-tbd' : 'reserve-tbd');
      if (!wrap) return out;
      wrap.querySelectorAll('.ret-tbd-col').forEach(function (col) {
        var h = col.querySelector('.ret-tbd-h');
        if (!h) return;
        var n = h.querySelector('.und-cnt');
        var title = h.textContent.replace(/\d+$/, '').trim();
        out[title] = +(n ? n.textContent : '0');
      });
      return out;
    }, view);
  }
  const retV = await viewCounts('return');
  const rsvV = await viewCounts('reserve');
  console.log('\n── 未定ビューの件数 ──');
  console.log('  返車:', JSON.stringify(retV));
  console.log('  予約:', JSON.stringify(rsvV));
  ok('返車の未定は4カラムある', Object.keys(retV).length === 4, retV);
  ok('予約の未定は4カラムある', Object.keys(rsvV).length === 4, rsvV);

  function findCount(map, word) {
    var k = Object.keys(map).find(function (t) { return t.indexOf(word) >= 0; });
    return k == null ? null : map[k];
  }

  /* ---- 8つのBOXをダッシュボードに並べる ---- */
  await p.evaluate(keys => {
    const m = state.settings.myDash;
    m.presets[m.active].layout = keys.map(e => ({ e: e, s: 'm' }));
    window.renderMyDash();
  }, RET.concat(RSV).map(x => x.e));
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.showView('mydash'));
  await p.waitForTimeout(800);

  const boxCounts = await p.evaluate(() => {
    const out = {};
    document.querySelectorAll('#mydash-flow .md-box').forEach(box => {
      const t = (box.querySelector('h3') || {}).textContent || '';
      const n = box.querySelector('.md-lnum b');
      out[t.trim()] = n ? +n.textContent.replace(/[^\d]/g, '') : null;
    });
    return out;
  });
  console.log('\n── BOXの件数 ──');
  console.log(' ', JSON.stringify(boxCounts));

  console.log('\n── 🔴 突き合わせ（BOX＝未定ビュー） ──');
  function boxCount(name) {
    var k = Object.keys(boxCounts).find(function (t) { return t.indexOf(name) >= 0; });
    return k == null ? null : boxCounts[k];
  }
  RET.forEach(function (x) {
    const v = findCount(retV, x.col), bx = boxCount(x.box || x.col);
    ok('返車：' + x.col + ' が一致', v != null && bx != null && v === bx, { view: v, box: bx });
  });
  RSV.forEach(function (x) {
    const v = findCount(rsvV, x.col), bx = boxCount(x.box || x.col);
    ok('予約：' + x.col + ' が一致（BOX＝' + (x.box || x.col) + '）', v != null && bx != null && v === bx, { view: v, box: bx });
  });

  console.log('\n── 中身が出ているか ──');
  const withChips = await p.evaluate(() => {
    let n = 0;
    document.querySelectorAll('#mydash-flow .md-box').forEach(box => {
      const num = box.querySelector('.md-lnum b');
      const cps = box.querySelectorAll('.md-cp:not(.md-cp-more)').length;
      if (num && +num.textContent.replace(/[^\d]/g, '') > 0 && cps > 0) n++;
    });
    return n;
  });
  const nonEmpty = Object.keys(boxCounts).filter(k => boxCounts[k] > 0).length;
  ok('件数のあるBOXは中身（チップ）が出ている', withChips === nonEmpty, { withChips, nonEmpty });
  ok('チップに「様」＋車が入っている',
     await p.evaluate(() => [].some.call(document.querySelectorAll('.md-cp'), c => /様/.test(c.textContent))));

  const opened = await p.evaluate(async () => {
    const c = document.querySelector('.md-cp.md-click'); if (!c) return 'チップなし';
    c.click(); await new Promise(r => setTimeout(r, 700));
    const m = document.getElementById('modal-detail');
    return m && getComputedStyle(m).display !== 'none' ? 'ok' : '開かない';
  });
  ok('チップを押すとカードが開く', opened === 'ok', opened);
  await p.evaluate(() => { const b = document.getElementById('card-modal-close'); if (b) b.click(); });

  console.log('\n── プリセット「未定チェック用」 ──');
  await p.evaluate(() => window.mydOpenPresets());
  await p.waitForTimeout(600);
  ok('プリセット画面に雛形「未定チェック用」が出ている',
     await p.evaluate(() => /未定チェック用/.test(document.body.innerText)));
  await p.evaluate(() => { if (window.mydClosePresets) mydClosePresets(); else { const x = document.querySelector('.myd-modal'); if (x) x.remove(); } });
  await p.waitForTimeout(300);

  console.log('\n── 画面のエラー ──');
  ok('赤いエラーが出ていない', errs.length === 0, errs.slice(0, 4));
} finally {
  await b.close();
}

console.log(`\n合計：${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
