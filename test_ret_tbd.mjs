/* PitFlow v1.67.1 ── カード詳細の「返車日未定」チェックが外せなかった
   -------------------------------------------------------------------
   ◎ゆうた報告
     「詳細カードの 返車日未定 のチェックが外せない」
   ◎正体
     v1.66.0 は「返車日が空ならチェックON」と、**データから逆算**していた。
     外しても描き直した瞬間にまた付く。しかも日付欄は使えないままなので、
     日付を入れて外すこともできない＝袋小路。
   ◎直し
     「これから日付を入れるつもり」は**データに書けない気持ち**なので画面だけで覚える。
     🔴 保存する項目は増やしていない（v1.66.0 の「日付が空、それだけ」は守る）。
   ◎使い方
     python3 -m http.server 8992      ← 別ウィンドウ
     node test_ret_tbd.mjs                                              */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8992;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1`);
await p.waitForFunction('window.state && window.openDetail && window.cvReturnDateTbd', null, { timeout: 25000 });
await p.waitForTimeout(700);

/* 作業完了＝確定返車日の欄が出る状態（v1.66.0 の決めごと） */
const seed = (over) => p.evaluate(o => {
  state.cards = [Object.assign({
    id: 'RT', resNo: 'R-RT', customer: '返車 太郎', car: 'ノート', boardId: 'default', division: 'div1',
    workType: 'shaken', workTypes: ['shaken'], status: 'workDone', dropType: 'drop',
    amountOrder: 100000, returnDate: '', returnDateFinal: null
  }, o || {})];
  openDetail('RT');
  return true;
}, over || null);

const st = () => p.evaluate(() => {
  const cb = document.getElementById('cv-rettbd'), d = document.getElementById('cv-retdate');
  return { has: !!cb, checked: cb ? cb.checked : null, disabled: d ? d.disabled : null, val: d ? d.value : null,
           saveDate: state.cards[0].returnDate || '', saveFin: state.cards[0].returnDateFinal || '' };
});

console.log('\n── 🐞 まず、報告どおりに再現するか（直っていれば外せる） ──');
{
  await seed();
  await p.waitForTimeout(200);
  const a = await st();
  ok('日付が空なら、最初はチェックが付いている', a.has && a.checked === true, a);
  ok('チェック中は日付欄が使えない', a.disabled === true, a);

  await p.evaluate(() => document.getElementById('cv-rettbd').click());
  await p.waitForTimeout(200);
  const c = await st();
  ok('🔴 チェックを外せる（これが報告された不具合）', c.checked === false, c);
  ok('🔴 外したら日付欄が使えるようになる', c.disabled === false, c);
  ok('外しただけでは保存する値は変わらない（まだ日が決まっていない）', c.saveDate === '' && c.saveFin === '', c);
}

console.log('\n── 📅 外したあと、日付を入れられる ──');
{
  const r = await p.evaluate(() => {
    const d = document.getElementById('cv-retdate');
    d.value = '2026-08-20'; cvSetReturn(d.value);
    return true;
  });
  await p.waitForTimeout(250);
  const c = await st();
  ok('日付が入る', c.val === '2026-08-20', c);
  ok('日付が入ればチェックは付かない', c.checked === false, c);
  ok('カードに保存されている', c.saveDate === '2026-08-20', c);
}

console.log('\n── ↩ もう一度チェックを入れると、日付が空に戻る ──');
{
  await p.evaluate(() => document.getElementById('cv-rettbd').click());
  await p.waitForTimeout(250);
  const c = await st();
  ok('チェックが付く', c.checked === true, c);
  ok('日付欄が空になる', c.val === '', c);
  ok('日付欄が使えなくなる', c.disabled === true, c);
  ok('🔴 保存する値も空（＝「日付が空、それだけ」を守っている）', c.saveDate === '' && !c.saveFin, c);
}

console.log('\n── 🔁 入れる→外す→入れる を何度でも ──');
{
  let bad = '';
  for (let i = 0; i < 3; i++) {
    await p.evaluate(() => document.getElementById('cv-rettbd').click());   // 外す
    await p.waitForTimeout(120);
    let c = await st();
    if (c.checked !== false || c.disabled !== false) { bad = '外し' + i + ':' + JSON.stringify(c); break; }
    await p.evaluate(() => document.getElementById('cv-rettbd').click());   // 入れる
    await p.waitForTimeout(120);
    c = await st();
    if (c.checked !== true || c.disabled !== true) { bad = '入れ' + i + ':' + JSON.stringify(c); break; }
  }
  ok('3往復しても毎回ちゃんと切り替わる', bad === '', bad);
}

console.log('\n── 🚪 別のカードを開いたら、外していた状態は持ち越さない ──');
{
  await seed();
  await p.waitForTimeout(150);
  await p.evaluate(() => document.getElementById('cv-rettbd').click());     // RT を外した状態にする
  await p.waitForTimeout(150);
  const r = await p.evaluate(() => {
    state.cards.push({ id: 'RT2', resNo: 'R-RT2', customer: '別 花子', car: 'フィット', boardId: 'default', division: 'div1',
      workType: 'shaken', workTypes: ['shaken'], status: 'workDone', dropType: 'drop', returnDate: '', returnDateFinal: null });
    openDetail('RT2');
    const cb = document.getElementById('cv-rettbd'), d = document.getElementById('cv-retdate');
    return { checked: cb ? cb.checked : null, disabled: d ? d.disabled : null };
  });
  ok('別のカードは「未定」で開く（前のカードの操作を引きずらない）', r.checked === true && r.disabled === true, r);

  /* 戻ってきたら、そのカードも「未定」に戻っている（画面だけの印なので保存されていない） */
  const back = await p.evaluate(() => {
    openDetail('RT');
    const cb = document.getElementById('cv-rettbd');
    return cb ? cb.checked : null;
  });
  ok('元のカードに戻ると「未定」に戻る（印は保存していない）', back === true, back);
}

console.log('\n── 🔒 まだ作業完了に入っていないカードには、この欄自体を出さない（v1.66.0のまま） ──');
{
  for (const s of ['check', 'estim', 'contact', 'parts', 'work']) {
    await seed({ status: s });
    await p.waitForTimeout(120);
    const has = await p.evaluate(() => !!document.getElementById('cv-rettbd'));
    ok('「' + s + '」では確定返車日の欄を出さない', has === false, has);
  }
  await seed({ status: 'workDone' });
  await p.waitForTimeout(120);
  ok('「workDone」では出る', await p.evaluate(() => !!document.getElementById('cv-rettbd')), '');
}

console.log('\n── 🖱 ホバーの「未定」も外せる（同じ約束なので一緒に見張る） ──');
{
  /* ホバー側は描き直さないので元から外せていたが、
     「同じチェックなのに片方だけ外せない」を二度と作らないため、ここでも見張る。 */
  const r = await p.evaluate(() => {
    state.cards = [{ id: 'HVT', resNo: 'R-HVT', status: 'workDone', customer: 'ホバ 太郎', car: 'ラパン',
      boardId: 'default', division: 'div1', workType: 'shaken', workTypes: ['shaken'],
      returnStage: 'callWait', returnDate: '', log: [] }];
    state.currentView = 'return'; state.returnRange = 'tbd';
    showView('return');
    const el = document.querySelector('#return-tbd [data-card-id="HVT"]');
    if (!el) return { err: 'カードが出ていない' };
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const hp = document.getElementById('pit-hovercard');
    const cb = hp.querySelector('.ph-rt-datetbd'), d = hp.querySelector('.ph-rt-date');
    const out = { on0: cb.checked, dis0: d.disabled };
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
    out.on1 = hp.querySelector('.ph-rt-datetbd').checked;
    out.dis1 = hp.querySelector('.ph-rt-date').disabled;
    out.saved = state.cards[0].returnDate || '';
    return out;
  });
  await p.waitForTimeout(150);
  ok('ホバーも最初はチェックON・日付欄は使えない', !r.err && r.on0 === true && r.dis0 === true, r);
  ok('🔴 ホバーでも外せる／日付欄が使えるようになる', r.on1 === false && r.dis1 === false, r);
  ok('外しただけでは保存する値は変わらない', r.saved === '', r);
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  await p.evaluate(() => { state.cards = []; });
  for (const v of ['course1', 'today', 'return', 'sales', 'mydash']) {
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(120);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.67.1 以降', vn[0] > 1 || (vn[0] === 1 && (vn[1] > 67 || (vn[1] === 67 && vn[2] >= 1))), ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
