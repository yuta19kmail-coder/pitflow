/* PitFlow v1.59.1 ── 画面いちばん上の見出しが、打つたびに追いつく
   -------------------------------------------------------------------
   ◎ゆうた報告
     「**新規予約で顧客を入力しているのに、一番上のタイトル的な顧客名と車種が未入力のまま。
       保存をするとちゃんと入る**」
   ◎正体
     見出しは `openCard()` で**1回書いて終わり**だった。打った内容はカードには入っているのに、
     見出しだけ書き直していなかった（＝保存して開き直すと入る）。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8983      ← 別ウィンドウ
     node test_card_title.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8983;
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
await p.waitForFunction('window.state && window.openNewReserve && window.pitCardTitleRefresh', null, { timeout: 25000 });
await p.waitForTimeout(900);

const title = () => p.evaluate(() => (document.getElementById('card-title') || {}).textContent || '');

console.log('\n── 🔤 新規予約：打つたびに見出しが追いつく ──');
{
  await p.evaluate(() => { try { localStorage.removeItem('pitflow_draft_card'); } catch (e) {} if (window.pitDropDraft) pitDropDraft(null, true); openNewReserve(); });
  await p.waitForTimeout(700);

  const first = await title();
  ok('開いた直後は「（未入力）様」', /（未入力）\s*様/.test(first), first);

  /* お客様名（姓／名）を打つ */
  await p.click('#md-body .cf-namebox[data-key="customer"] input[data-name="sei"]');
  await p.keyboard.type('見出し');
  await p.waitForTimeout(200);
  const t1 = await title();
  ok('🔴 姓を打った時点で見出しに出る', /見出し/.test(t1) && !/（未入力）/.test(t1), t1);

  await p.click('#md-body .cf-namebox[data-key="customer"] input[data-name="mei"]');
  await p.keyboard.type('太郎');
  await p.waitForTimeout(200);
  const t2 = await title();
  ok('🔴 名も続けて出る（姓 名）', /見出し 太郎\s*様/.test(t2), t2);

  /* 車種を打つ */
  await p.click('#md-body .cf-panel[data-tab="basic"] input[data-cn="car"]');
  await p.keyboard.type('アクア');
  await p.waitForTimeout(200);
  const t3 = await title();
  ok('🔴 車種も打った時点で出る', /アクア/.test(t3) && !/（車種未入力）/.test(t3), t3);

  /* 消したら見出しも戻る（片道ではない） */
  await p.evaluate(() => {
    const el = document.querySelector('#md-body .cf-panel[data-tab="basic"] input[data-cn="car"]');
    el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(200);
  const t4 = await title();
  ok('消したら見出しも戻る', /（車種未入力）/.test(t4), t4);

  /* 予約番号は出たまま */
  const hasNo = await p.evaluate(() => !!document.querySelector('#card-title span[title="予約番号"]'));
  ok('予約番号の印はそのまま残る', hasNo === true);
}

console.log('\n── 漢字が無くカナだけの人も、見出しに出る ──');
{
  const r = await p.evaluate(() => {
    const c = state.cards.find(x => x._draft);
    if (!c) return null;
    c.sei = ''; c.mei = ''; c.customer = ''; c.kana = 'カナダケ ハナコ';
    pitCardTitleRefresh();
    return (document.getElementById('card-title') || {}).textContent || '';
  });
  ok('🔴 カナだけの人はカナが見出しに出る（(未入力)にしない）', r && /カナダケ ハナコ/.test(r), r);
}

console.log('\n── ポップアップ側（予約を編集）でも追いつく ──');
{
  const r = await p.evaluate(() => {
    state.cards = state.cards.filter(x => x.id !== 'TT1');
    state.cards.push({ id: 'TT1', resNo: 'R-TT1', status: 'reserved', customer: '編集 次郎', car: 'ノート', log: [] });
    openCard('TT1', 'modal');
    openCardEditForm('TT1');
    const before = (document.getElementById('card-title-modal') || {}).textContent || '';
    const c = state.cards.find(x => x.id === 'TT1');
    c.customer = '書き換え 三郎'; c.car = 'タント';
    pitCardTitleRefresh();
    const after = (document.getElementById('card-title-modal') || {}).textContent || '';
    if (window.pitCardEditRelease) pitCardEditRelease();
    return { before: before, after: after };
  });
  await p.waitForTimeout(200);
  ok('ポップアップの見出しも書き直せる', /編集 次郎/.test(r.before) && /書き換え 三郎/.test(r.after) && /タント/.test(r.after), r);
}

console.log('\n── 無駄に書き直していないか ──');
{
  const r = await p.evaluate(() => {
    const el = document.getElementById('card-title-modal') || document.getElementById('card-title');
    const before = el.innerHTML;
    let writes = 0;
    const obs = new MutationObserver(() => { writes++; });
    obs.observe(el, { childList: true, subtree: true, characterData: true });
    for (let i = 0; i < 20; i++) pitCardTitleRefresh();   /* 中身は変わっていない */
    obs.disconnect();
    return { writes: writes, same: el.innerHTML === before };
  });
  ok('🔴 中身が変わっていなければ1回も書き直さない', r.writes === 0 && r.same === true, r);
}

console.log('\n── ソースの見張り ──');
{
  const cd = fs.readFileSync('js/card-detail.js', 'utf8');
  ok('見出しの書き方は _cardTitleHtml ひとつ', /function pitCardTitleRefresh[\s\S]{0,500}_cardTitleHtml\(c\)/.test(cd));
  ok('🔴 見張りは1本だけ（個々の入力欄に足して回っていない）',
     /\['input', 'change', 'click'\]\.forEach[\s\S]{0,200}pitCardTitleRefresh\(\)/.test(cd));
  ok('描き直しの最後でも合わせている', /pitCardTitleRefresh\(\);\s*\n\s*\/\/ v0\.83\.1/.test(cd));
  ok('全画面とポップアップで行き先を分けている', /md-body-modal'\) \? 'card-title-modal' : 'card-title'/.test(cd));

  const ix = fs.readFileSync('index.html', 'utf8');
  const vs = [(ix.match(/app-version" content="([\d.]+)"/) || [])[1],
              (ix.match(/login-ver">v([\d.]+)</) || [])[1],
              (ix.match(/class="ver">v([\d.]+)</) || [])[1]];
  const _num = x => String(x||'').split('.').map(Number);
  const _ge = (a, bb) => { const x=_num(a), y=_num(bb); for (let i=0;i<3;i++){ if ((x[i]||0)!==(y[i]||0)) return (x[i]||0)>(y[i]||0); } return true; };
  ok('版が3か所そろっている', vs.every(Boolean) && new Set(vs).size === 1, vs);
  ok('版が v1.59.1 より下がっていない', _ge(vs[0], '1.59.1'), vs);
  ok('card-detail.js にキャッシュ番号が付いている', /card-detail\.js\?v=\d+/.test(ix));
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
