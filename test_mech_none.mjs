/* PitFlow v1.174.0 ── 🔧 点検担当・整備担当の「なし」（該当者が本当に居ない）
   -------------------------------------------------------------------
   ◎ゆうた依頼（2026-08-22）
     🗣「タスクボード内のカード詳細の点検者・作業者を修正。**一番左にそれぞれ『なし』を作る**。
     　　リアルに該当者がいない場合に、**忘れなのか リアルなのか をこれで判断する**ように
     　　（オイル交換なら点検者はいないし、外注板金なら作業者がいない）」
     🗣「**忘れが多いから**、作業待ちから作業完了に移動した時に、点検者と作業者を入れるポップアップを出す
     　　（他の見積もり金額みたいに）。**ジャンプ挙動でも出るように**」
     🗣「またデータチェック時の項目にも同じように『なし』が入るようにして。
     　　また**閾値としても入ってないのは100％忘れになるから、そこも加味して**作って」

   ◎この試験が見張るもの
     ・状態は3つ（未入力／なし／1人以上）。**空っぽと「なし」はまったく別物**
     ・「なし」を押すと人は外れる／人を押すと「なし」は下りる（両立しない）
     ・作業完了へ動かす時、**片方でも決まっていなければ**窓が出る（ドラッグ・◀▶・ジャンプ）
     ・「なし」で決めれば、もう出ない
     ・データチェック（T03）＝**要対応**で、「なし」なら言わない
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8939      ← 別ウィンドウ
     node test_mech_none.mjs                                                  */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8939;
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

/* 1枚だけの盤面にする */
const put = (o) => p.evaluate((x) => {
  const d = new Date(); d.setDate(d.getDate() - 1);
  const q = n => (n < 10 ? '0' : '') + n;
  const iso = d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate());
  state.cards = [Object.assign({
    id: 'cMN', resNo: 'R-MN', customer: 'なし 太郎', car: 'アクア', plate: '野田 500 あ 11-11',
    boardId: 'default', division: 'div1', workType: 'oil', dropType: 'drop',
    reserveDate: iso, returnDate: iso, tel: '090-1111-2222', kana: 'ナシタロウ', repeat: 'repeat',
    status: 'work', inspectors: [], mechanics: [], log: [], maint: {}, office: {}
  }, x || {})];
  if (window.PitDB) PitDB.save();
}, o || null);

const card = () => p.evaluate(() => {
  const c = state.cards.find(x => x.id === 'cMN') || {};
  return { status: c.status, insp: (c.inspectors || []).slice(), mech: (c.mechanics || []).slice(),
           iNone: !!c.inspectorsNone, mNone: !!c.mechanicsNone,
           iIds: (c.inspectorIds || []).length, mIds: (c.mechanicIds || []).length };
});

const openMaint = () => p.evaluate(() => {
  const host = document.getElementById('md-body-modal') || (function () {
    const d = document.createElement('div'); d.id = 'md-body-modal'; document.body.appendChild(d); return d; })();
  renderCardView(state.cards[0], 'md-body-modal');
  const t = document.querySelector('#md-body-modal .cv-tab[data-tab="maint"]') ||
            Array.from(document.querySelectorAll('#md-body-modal .cv-tab')).find(x => /整備/.test(x.textContent));
  if (t) t.click();
});

console.log('\n── ① いちばん左に「なし」がある（点検・整備それぞれ） ──');
{
  await put(); await openMaint(); await p.waitForTimeout(250);
  const r = await p.evaluate(() => {
    const i = document.querySelectorAll('#cv-p-maint .cf-mech-i .cf-mchip');
    const m = document.querySelectorAll('#cv-p-maint .cf-mech-m .cf-mchip');
    return { iFirst: i[0] ? i[0].textContent.trim() : '', iNoneCls: i[0] ? i[0].className : '',
             mFirst: m[0] ? m[0].textContent.trim() : '',
             iCnt: (document.querySelector('#cv-p-maint .cf-mech-i .cf-mech-cnt') || {}).textContent || '',
             persons: document.querySelectorAll('#cv-p-maint .cf-mperson').length };
  });
  ok('🔴 点検の**いちばん左**が「なし」', r.iFirst === 'なし' && /cf-mnone/.test(r.iNoneCls), r);
  ok('🔴 整備の**いちばん左**も「なし」', r.mFirst === 'なし', r);
  ok('🔴 空っぽは「未入力」と出る（前は「なし」と出ていて読めなかった）', r.iCnt === '未入力', r.iCnt);
  ok('人のチップには目印が付いている（cf-mperson）', r.persons > 0, r.persons);
}

console.log('\n── ② 「なし」＝答え。空っぽとは別物 ──');
{
  await p.evaluate(() => { document.querySelector('#cv-p-maint .cf-mech-i .cf-mnone').click(); });
  await p.waitForTimeout(250);
  let c = await card();
  ok('🔴 「なし」を押すと印が付く', c.iNone === true, c);
  ok('🔴 名前の配列は空のまま（持ち方を変えていない）', c.insp.length === 0, c);
  const lbl = await p.evaluate(() => (document.querySelector('#cv-p-maint .cf-mech-i .cf-mech-cnt') || {}).textContent || '');
  ok('🔴 見出しに「該当者なし」と出る（未入力と区別できる）', lbl === '該当者なし', lbl);

  /* 人を押すと「なし」は下りる */
  await p.evaluate(() => { document.querySelector('#cv-p-maint .cf-mech-i .cf-mperson').click(); });
  await p.waitForTimeout(250);
  c = await card();
  ok('🔴 人を入れると「なし」は下りる（両立しない）', c.iNone === false && c.insp.length === 1, c);
  ok('メンバー番号も同じ数だけ入る', c.iIds === c.insp.length, c);

  /* 人が入っている時に「なし」を押すと外れる */
  await p.evaluate(() => { document.querySelector('#cv-p-maint .cf-mech-i .cf-mnone').click(); });
  await p.waitForTimeout(250);
  c = await card();
  ok('🔴 「なし」を押すと入っていた人は外れる', c.iNone === true && c.insp.length === 0, c);

  /* もう一度押すと未入力に戻る */
  await p.evaluate(() => { document.querySelector('#cv-p-maint .cf-mech-i .cf-mnone').click(); });
  await p.waitForTimeout(250);
  c = await card();
  ok('もう一度押すと未入力に戻る', c.iNone === false && c.insp.length === 0, c);
}

console.log('\n── ③ 物差し（決まっているか）は1本 ──');
{
  const r = await p.evaluate(() => {
    const c = state.cards[0];
    c.inspectors = []; c.mechanics = []; c.inspectorsNone = false; c.mechanicsNone = false;
    const a = PitMechPick.unsettled(c).slice();
    c.inspectorsNone = true;
    const b2 = PitMechPick.unsettled(c).slice();
    c.mechanics = ['蓮沼'];
    const c3 = PitMechPick.unsettled(c).slice();
    const borrowed = (window.pitMechUnsettled ? pitMechUnsettled(c).slice() : null);
    c.inspectorsNone = false; c.mechanics = [];
    return { a, b2, c3, borrowed };
  });
  ok('🔴 どちらも空＝2つとも未入力', r.a.join() === '点検担当,整備担当', r.a);
  ok('🔴 「なし」と決めたら、その役は決まっている', r.b2.join() === '整備担当', r.b2);
  ok('人が入っていれば決まっている', r.c3.length === 0, r.c3);
  ok('🔴 データチェックへ同じ1本を貸している（pitMechUnsettled）', r.borrowed !== null && r.borrowed.length === 0, r.borrowed);
}

console.log('\n── ④ 作業完了に入れる時の窓（片方でも空なら出す） ──');
const mgShown = () => p.evaluate(() => {
  const bd = document.getElementById('mg-backdrop');
  return !!(bd && bd.classList.contains('show'));
});
{
  await put({ status: 'work', inspectors: [], mechanics: ['蓮沼'] });
  await p.evaluate(() => applyCardDrop('cMN', 'status', 'workDone'));
  await p.waitForTimeout(350);
  ok('🔴🔴 整備だけ入れて点検が空なら出る（いちばん多い忘れ方）', await mgShown() === true);
  const w = await p.evaluate(() => (document.getElementById('mg-warn') || {}).textContent || '');
  ok('🔴 空いている側だけを名指しで言う', /点検担当/.test(w) && !/整備担当/.test(w), w);
  ok('🔴 「なし」を案内する', /なし/.test(w), w);
  const inside = await p.evaluate(() => ({
    none: document.querySelectorAll('#mg-pick .cf-mnone').length,
    persons: document.querySelectorAll('#mg-pick .cf-mperson').length
  }));
  ok('🔴 窓の中もカード詳細と同じ部品（なしも人も並ぶ）', inside.none === 2 && inside.persons > 0, inside);
  await p.evaluate(() => PitMechGuard.close(0));
  await p.waitForTimeout(200);
  ok('やめたらカードは動かない', (await card()).status === 'work');
}
{
  await put({ status: 'work', inspectors: [], mechanics: ['蓮沼'], inspectorsNone: true });
  await p.evaluate(() => applyCardDrop('cMN', 'status', 'workDone'));
  await p.waitForTimeout(350);
  ok('🔴🔴 「なし」で決めていれば出さない', await mgShown() === false);
  ok('そのまま作業完了へ進む', (await card()).status === 'workDone');
}
{
  /* 🔴 ジャンプ（点検待ち → 作業完了）＝金額の窓のあとに出る */
  await put({ status: 'check', inspectors: [], mechanics: [], amountOrder: null });
  await p.evaluate(() => applyCardDrop('cMN', 'status', 'workDone'));
  await p.waitForTimeout(400);
  const money = await p.evaluate(() => {
    const bd = document.getElementById('pp-backdrop');
    return !!(bd && bd.classList.contains('show'));
  });
  ok('🔴 ジャンプではまず金額の窓が出る（今までどおり）', money === true);
  await p.evaluate(() => {
    const i = document.getElementById('pp-amt'); if (i){ i.value = '120000'; }
    PitPhasePopup.close(true);
  });
  await p.waitForTimeout(400);
  ok('🔴🔴 金額のあとに担当者の窓が出る（ジャンプでも忘れを拾う）', await mgShown() === true);
  await p.evaluate(() => PitMechGuard.close(1));
  await p.waitForTimeout(250);
  ok('「このまま進める」で作業完了へ入る（止めない）', (await card()).status === 'workDone');
}
{
  /* ◀▶ボタンでも同じ */
  await put({ status: 'work', inspectors: [], mechanics: [] });
  await p.evaluate(() => { state.currentBoardId = 'default'; advanceCard('cMN', 1); });
  await p.waitForTimeout(400);
  ok('🔴 ◀▶ボタンでも出る', await mgShown() === true);
  await p.evaluate(() => PitMechGuard.close(0));
  await p.waitForTimeout(150);
}

console.log('\n── ⑤ データチェック（T03）＝空っぽは要対応、「なし」なら言わない ──');
{
  const r = await p.evaluate(() => {
    const mk = (o) => Object.assign({
      id: o.id, resNo: 'R-' + o.id, customer: 'テ ス ト', kana: 'テスト', tel: '090-0000-0000',
      car: 'アクア', plate: '野田 500 あ 1-1', boardId: 'default', division: 'div1',
      workType: 'oil', dropType: 'drop', repeat: 'repeat',
      reserveDate: '2100-01-01', returnDate: '2100-01-02',
      status: 'workDone', inspectors: [], mechanics: [], log: [], maint: {}, office: {}
    }, o);
    state.cards = [
      mk({ id: 'n1' }),                                                   /* どちらも空 */
      mk({ id: 'n2', mechanics: ['蓮沼'] }),                              /* 点検だけ空 */
      mk({ id: 'n3', mechanics: ['蓮沼'], inspectorsNone: true }),        /* 点検はなし＝決まっている */
      mk({ id: 'n4', inspectorsNone: true, mechanicsNone: true })         /* どちらも「なし」 */
    ];
    state.inspectMarks = {}; state.inspectMutes = {};
    const res = pitInspectRun();
    const of = (id) => res.findings.filter(f => f.refId === id && f.ruleId === 'T03')[0] || null;
    const rule = (window.PIT_INSPECT_RULES || []).filter(x => x.id === 'T03')[0] || {};
    return { n1: (of('n1') || {}).text || '', n2: (of('n2') || {}).text || '',
             n3: !!of('n3'), n4: !!of('n4'), level: rule.level, title: rule.title, fix: rule.fix };
  });
  ok('🔴🔴 空っぽは「要対応」（入っていない＝100%忘れ）', r.level === 'red', r.level);
  ok('🔴 どちらも空なら両方を名指しで言う', /点検担当/.test(r.n1) && /整備担当/.test(r.n1), r.n1);
  ok('🔴 片方だけ空でも言う（前は言わなかった）', /点検担当/.test(r.n2) && !/整備担当/.test(r.n2), r.n2);
  ok('🔴🔴 「なし」と決めた側は言わない', r.n3 === false, r.n3);
  ok('🔴 どちらも「なし」なら1件も出ない', r.n4 === false, r.n4);
  ok('🔴 どうすればいいかに「なし」を書いてある', /なし/.test(r.fix), r.fix);
}

console.log('\n── 🧭 ソースの見張り ──');
{
  const mp = fs.readFileSync('js/mech-pick.js', 'utf8');
  const mg = fs.readFileSync('js/mech-guard.js', 'utf8');
  const ir = fs.readFileSync('js/inspect-rules.js', 'utf8');
  const cv = fs.readFileSync('js/card-view.js', 'utf8');
  ok('🔴 「なし」の持ち方は mech-pick の1本（noneKey）', /function noneKey/.test(mp), '');
  ok('🔴 決まっているかの物差しも1本（isSettled / unsettled）',
     /function isSettled/.test(mp) && /function unsettled/.test(mp), '');
  ok('🔴🔴 窓は物差しを借りている（自分で空かどうかを数えていない）',
     /PitMechPick\.unsettled\(c\)\.length > 0/.test(mg) && !/inspectors\s*\|\|\s*\[\]/.test(mg), '');
  ok('🔴🔴 データチェックも同じ1本を借りている（条件を書き写していない）',
     /pitMechUnsettled/.test(ir) && !/inspectorsNone/.test(ir), '');
  ok('🔴 カード詳細に「なし」を書き写していない（部品から出している）',
     !/cf-mnone/.test(cv), '');
  const ix = fs.readFileSync('index.html', 'utf8');
  const ver = (ix.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('版が3か所そろっている',
     !!ver && ix.indexOf('<span class="ver">v' + ver + '</span>') >= 0
           && ix.indexOf('<div class="login-ver">v' + ver + '</div>') >= 0, ver);
  ok('直したファイルにキャッシュ番号が付いている',
     /mech-pick\.js\?v=\d+/.test(ix) && /mech-guard\.js\?v=\d+/.test(ix) && /mech-summary\.css\?v=\d+/.test(ix));
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

console.log('\n' + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail ? 1 : 0);
