/* PitFlow v1.68.0 ── お知らせを CarFlow と同じ仕様に入れ替えた
   -------------------------------------------------------------------
   ◎ゆうた指摘
     「お知らせ機能が前提としてちがうと思う。CarFlow、StockFlow などを確認して
       おなじ仕様のものに変えてほしい」→ CarFlow（announcements.js）に合わせた。
   ◎新しい前提
     ・お知らせは **js/news-pit.js の PIT_NEWS 配列にコードで書く**（手書き投稿は廃止）
     ・ログイン後、未読があれば **ポップアップで1件ずつ**（古い順）
     ・受信箱は **版が新しい順**／開いただけでは既読にならず **「確認する（OK）」で既読**
     ・既読は人ごと（本番＝userPrefs／サンプル＝この端末）
   ◎使い方
     python3 -m http.server 8993      ← 別ウィンドウ
     node test_news.mjs                                                 */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8993;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const errs = [];
const newPage = async (w = 1400) => {
  const p = await b.newPage({ viewport: { width: w, height: 1000 } });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
  return p;
};

const p = await newPage();
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1`);
await p.waitForFunction('window.PIT_NEWS && window.renderNews', null, { timeout: 25000 });
await p.waitForTimeout(600);

console.log('\n── 📦 お知らせ本体がコードにある ──');
{
  const r = await p.evaluate(() => {
    const L = window.PIT_NEWS || [];
    const ids = new Set(L.map(x => x.id));
    return {
      n: L.length,
      dupe: ids.size !== L.length,
      missing: L.filter(x => !x.id || !x.version || !x.date || !x.title || !x.body).map(x => x.id || '(id無し)'),
      html: L.every(x => /<p>|<ul>/.test(x.body)),
      newest: L[0] && L[0].version,
      /* 版がいちばん新しいもの（先頭に足す決まりが守られているか） */
      top: L.map(x => x.version).sort((a, b) => {
        const n = v => String(v).split('.').map(Number).reduce((s, x, i) => s + x * [10000, 100, 1][i], 0);
        return n(b) - n(a);
      })[0]
    };
  });
  /* ⚠ 件数は増える（リリースのたびに1件足す決まり）。数を決め打ちしない。 */
  ok('PIT_NEWS が配られている（16件以上）', r.n >= 16, r);
  ok('id が重複していない', r.dupe === false, r);
  ok('どの項目にも 版・日付・見出し・本文が揃っている', r.missing.length === 0, r.missing);
  ok('本文はHTML（見出し・箇条書きが使える）', r.html === true, r);
  ok('先頭が最新版', r.newest === r.top, r);
}

console.log('\n── 🗑 手で書く口は廃止した（CarFlowと同じ） ──');
{
  const r = await p.evaluate(() => ({
    modal: !!document.getElementById('nw-modal'),
    addBtn: !!document.querySelector('.nw-add'),
    open: typeof window.pitNewsOpen,
    save: typeof window.pitNewsSave,
    del: typeof window.pitNewsDel
  }));
  ok('「お知らせを書く」のモーダルが無い', r.modal === false, r);
  ok('「お知らせを書く」ボタンが無い', r.addBtn === false, r);
  ok('pitNewsOpen / pitNewsSave / pitNewsDel が無い',
     r.open === 'undefined' && r.save === 'undefined' && r.del === 'undefined', r);
}

console.log('\n── 📥 受信箱＝版が新しい順・全部未読で始まる ──');
{
  await p.evaluate(() => { localStorage.removeItem('pitflow_news_read_v1'); });
  await p.reload();
  await p.waitForFunction('window.PIT_NEWS && window.renderNews', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => { try { showView('news'); } catch (e) {} });
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#news-body .nw-item')];
    const vn = v => { const q = String(v).split('.').map(Number); return q[0] * 10000 + q[1] * 100 + q[2]; };
    const vers = items.map(x => (x.querySelector('.nw-ver') || {}).textContent || '');
    let desc = true;
    for (let i = 1; i < vers.length; i++) if (vn(vers[i - 1].slice(1)) < vn(vers[i].slice(1))) desc = false;
    return {
      n: items.length,
      unread: items.filter(x => x.classList.contains('is-unread')).length,
      desc, vers: vers.slice(0, 4),
      badge: (document.querySelector('.si-newsbadge') || {}).textContent || 'なし',
      bodyHidden: items[0].querySelector('.nw-body').style.display === 'none',
      all: (window.PIT_NEWS || []).length
    };
  });
  ok('ぜんぶ並ぶ', r.n === r.all, r);
  ok('版が新しい順', r.desc === true, r.vers);
  ok('最初は全部未読', r.unread === r.all, r);
  ok('サイドバーの未読の丸が全件ぶん', r.badge === String(r.all), r);
  ok('本文は閉じた状態で始まる', r.bodyHidden === true, r);
}

console.log('\n── 👆 開いただけでは既読にしない（読み飛ばし防止） ──');
{
  const r = await p.evaluate(() => {
    const it = document.querySelector('#news-body .nw-item');
    it.querySelector('.nw-h').click();
    const now = document.querySelector('#news-body .nw-item');
    return {
      open: now.querySelector('.nw-body').style.display !== 'none',
      stillUnread: now.classList.contains('is-unread'),
      hasOk: !!now.querySelector('.nw-ok2'),
      badge: (document.querySelector('.si-newsbadge') || {}).textContent || 'なし'
    };
  });
  ok('見出しを押すと本文が開く', r.open === true, r);
  ok('🔴 開いただけでは未読のまま', r.stillUnread === true, r);
  ok('本文の下に「確認する（OK）」がある', r.hasOk === true, r);
  ok('未読の数もまだ全件ぶん', r.badge === String(await p.evaluate(() => window.PIT_NEWS.length)), r);

  const r2 = await p.evaluate(() => {
    document.querySelector('#news-body .nw-item .nw-ok2').click();
    const now = document.querySelector('#news-body .nw-item');
    return {
      read: now.classList.contains('is-read'),
      done: !!now.querySelector('.nw-done'),
      badge: (document.querySelector('.si-newsbadge') || {}).textContent || 'なし',
      saved: JSON.parse(localStorage.getItem('pitflow_news_read_v1') || '[]').length
    };
  });
  ok('🔴 「確認する」を押すと既読になる', r2.read === true && r2.done === true, r2);
  ok('未読の数が1つ減る', r2.badge === String((await p.evaluate(() => window.PIT_NEWS.length)) - 1), r2);
  ok('既読が端末に記録される', r2.saved === 1, r2);
}

console.log('\n── ✅ 「すべて確認済みにする」 ──');
{
  const r = await p.evaluate(() => {
    document.querySelector('.nw-allread').click();
    return {
      unread: document.querySelectorAll('#news-body .nw-item.is-unread').length,
      badge: (document.querySelector('.si-newsbadge') || {}).textContent || 'なし',
      btn: !!document.querySelector('.nw-allread'),
      lb: (document.querySelector('.nw-top-lb') || {}).textContent || ''
    };
  });
  ok('未読が0になる', r.unread === 0, r);
  ok('サイドバーの丸が消える', r.badge === 'なし', r);
  ok('ボタンも消えて「すべて確認済みです」になる', r.btn === false && /すべて確認済み/.test(r.lb), r);
}

console.log('\n── 📢 ログイン直後のポップアップ ──');
{
  const q = await newPage(1400);
  await q.goto(`http://127.0.0.1:${PORT}/index.html?demo=1`);
  await q.waitForFunction('window.PIT_NEWS', null, { timeout: 20000 });
  await q.evaluate(() => localStorage.removeItem('pitflow_news_read_v1'));
  await q.reload();
  await q.waitForFunction('window.PIT_NEWS', null, { timeout: 20000 });
  await q.waitForTimeout(2000);   /* showApp の 900ms 待ちより後 */

  const r = await q.evaluate(() => {
    const ov = document.getElementById('nw-pop');
    return {
      open: !!(ov && ov.classList.contains('open')),
      prog: (document.querySelector('.nw-pop-prog') || {}).textContent || '',
      title: (document.querySelector('.nw-pop-it') || {}).textContent || '',
      ver: (document.querySelector('.nw-pop .nw-ver') || {}).textContent || '',
      ok: (document.querySelector('.nw-pop-ok') || {}).textContent || '',
      later: !!document.querySelector('.nw-pop-later')
    };
  });
  ok('🔴 ログインしたら未読のポップアップが出る', r.open === true, r);
  ok('3件までにしぼって出す（16連続で出さない）', /1 \/ 3/.test(r.prog), r);
  ok('🔴 古い順に出る（いちばん古い v1.33.0 から）', r.ver === 'v1.33.0', r);
  ok('「確認して次へ ▶」と「後で」がある', /次へ/.test(r.ok) && r.later === true, r);

  const r2 = await q.evaluate(() => {
    document.querySelector('.nw-pop-ok').click();
    return { prog: (document.querySelector('.nw-pop-prog') || {}).textContent || '',
             ver: (document.querySelector('.nw-pop .nw-ver') || {}).textContent || '',
             read: JSON.parse(localStorage.getItem('pitflow_news_read_v1') || '[]').length };
  });
  ok('「次へ」で2件目に進む／1件目は既読になる', /2 \/ 3/.test(r2.prog) && r2.read === 1, r2);
  ok('2件目は次に古いもの（v1.40.0）', r2.ver === 'v1.40.0', r2);

  const r3 = await q.evaluate(() => {
    document.querySelector('.nw-pop-ok').click();          // 3件目へ
    const last = { ok: (document.querySelector('.nw-pop-ok') || {}).textContent || '',
                   rest: (document.querySelector('.nw-pop-rest') || {}).textContent || '' };
    document.querySelector('.nw-pop-ok').click();          // 確認して閉じる
    last.closed = !document.getElementById('nw-pop').classList.contains('open');
    last.read = JSON.parse(localStorage.getItem('pitflow_news_read_v1') || '[]').length;
    last.badge = (document.querySelector('.si-newsbadge') || {}).textContent || 'なし';
    return last;
  });
  /* ⚠ 件数はリリースのたびに増える。「全部 − 出した3件」で数える（決め打ちしない） */
  const rest3 = String((await q.evaluate(() => window.PIT_NEWS.length)) - 3);
  ok('最後の1件は「確認」だけになる', r3.ok === '確認', r3);
  ok('🔴 残りの件数を知らせる（ほかに ◯件）', r3.rest.indexOf(rest3) >= 0 && /お知らせ/.test(r3.rest), r3.rest);
  ok('確認したら閉じる／3件が既読になる', r3.closed === true && r3.read === 3, r3);
  ok('未読の丸が残りの数に減っている', r3.badge === rest3, { badge: r3.badge, rest3 });

  /* もう一度読み込むと、続きの3件が出る＝取り残さない */
  await q.reload();
  await q.waitForFunction('window.PIT_NEWS', null, { timeout: 20000 });
  await q.waitForTimeout(2000);
  const r4 = await q.evaluate(() => ({
    open: document.getElementById('nw-pop').classList.contains('open'),
    ver: (document.querySelector('.nw-pop .nw-ver') || {}).textContent || ''
  }));
  /* 3件（v1.33.0 / v1.40.0 / v1.43.0）を確認済みにしたので、続きは v1.46.0 から */
  ok('🔴 次に開いた時は続きの3件が出る（v1.46.0 から）', r4.open === true && r4.ver === 'v1.46.0', r4);

  /* 全部読んだら出ない */
  await q.evaluate(() => { pitNewsReadAll(); });
  await q.reload();
  await q.waitForFunction('window.PIT_NEWS', null, { timeout: 20000 });
  await q.waitForTimeout(2000);
  ok('全部確認済みなら、もう出ない',
     await q.evaluate(() => !document.getElementById('nw-pop') || !document.getElementById('nw-pop').classList.contains('open')), '');
  await q.close();
}

console.log('\n── 📱 スマホでは大きな窓を被せない ──');
{
  const m = await newPage(420);
  await m.goto(`http://127.0.0.1:${PORT}/index.html?demo=1`);
  await m.waitForFunction('window.PIT_NEWS', null, { timeout: 20000 });
  await m.evaluate(() => localStorage.removeItem('pitflow_news_read_v1'));
  await m.reload();
  await m.waitForFunction('window.PIT_NEWS', null, { timeout: 20000 });
  await m.waitForTimeout(2000);
  const r = await m.evaluate(() => ({
    pop: !!(document.getElementById('nw-pop') && document.getElementById('nw-pop').classList.contains('open')),
    badge: (document.querySelector('.si-newsbadge') || {}).textContent || 'なし'
  }));
  ok('🔴 スマホ幅ではポップアップを出さない', r.pop === false, r);
  ok('未読の丸は出す（自分で開いて読める）', r.badge === String(await m.evaluate(() => window.PIT_NEWS.length)), r);
  await m.close();
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  for (const v of ['course1', 'today', 'return', 'sales', 'mydash', 'news', 'oplog']) {
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(120);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.69.0 以降', vn[0] > 1 || (vn[0] === 1 && vn[1] >= 69), ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
