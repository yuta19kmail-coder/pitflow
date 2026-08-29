/* PitFlow v2.23.0 ── 🖼 **パレットに本物の見本を出す**（本物のブラウザ）
   ===================================================================
   ◎ゆうた依頼（2026-08-28）
     🗣「テキストで **返車 小 中 大** とか言われても、どんな仕様なのか、とか全然わからなくて使いにくい」
     → BOXカタログと同じ形（全サイズ並べ）を、本体のパレットに入れた。

   ◎この見張りが守るもの
     🔴 ① **絵を貼っていない**＝本物のBOXがその場で描かれている（画像・作り物ではない）
     🔴 ② **開いた瞬間に全部描かない**（34種×最大4サイズ＝115通り。全部描くと固まる）
     🔴 ③ スクロールすれば、ちゃんと描かれる
     🔴 ④ **見本は押せない**（中のカードやチップが生きていると、見本のつもりで本物を開く）
     🔴 ⑤ 枠を押すと、そのBOXが**その大きさで**追加される
     🔴 ⑥ 不向きな大きさは枠を出さない
     🔴 ⑦ 115通り全部を最後まで描いても **JSエラー0**

   ◎使い方
     python3 -m http.server 8977 --directory . &
     PORT=8977 node test_pal_preview.mjs
   =================================================================== */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8977;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 220)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.PIT_DASH_EL && window.mydOpenPalette && window.renderMyDash', null, { timeout: 30000 });
await p.evaluate(() => showView('dashboard'));
await p.waitForTimeout(500);

const EL = await p.evaluate(() => {
  const o = {}; Object.keys(window.PIT_DASH_EL).forEach(k => { const d = window.PIT_DASH_EL[k];
    o[k] = { sizes: (d.sizes && d.sizes.length) ? d.sizes : ['m'], person: !!d.person, title: d.title }; });
  return o;
});
const KEYS = Object.keys(EL);
const 通り = KEYS.reduce((n, k) => n + EL[k].sizes.length, 0);
console.log('  （BOX ' + KEYS.length + '種／全部で ' + 通り + '通り）');

/* ================= ① 開いた直後 ================= */
console.log('\n── 🔴 ①開いた直後：枠は全部ある／描くのは見えた分だけ ──');
const t0 = Date.now();
await p.evaluate(() => mydOpenPalette());
await p.waitForTimeout(700);
const 開く秒 = (Date.now() - t0) / 1000;
{
  const r = await p.evaluate(() => {
    const cells = [...document.querySelectorAll('#myd-pal .md-pv')];
    return {
      枠: cells.length,
      描いた: cells.filter(c => c.querySelector('.md-pv-stage .md-box')).length,
      節: document.querySelectorAll('#myd-pal .md-pvsec').length,
      名札: document.querySelectorAll('#myd-pal .md-pvnav a').length,
      見えている: document.getElementById('myd-pal').classList.contains('show')
    };
  });
  ok('パレットが開く', r.見えている);
  ok('🔴 全通りぶんの枠がある（' + 通り + '）', r.枠 === 通り, r);
  ok('BOXの数だけ節がある（' + KEYS.length + '）', r.節 === KEYS.length, r);
  ok('名前の札が全部ある', r.名札 === KEYS.length, r);
  ok('🔴 開いた瞬間に全部は描いていない', r.描いた > 0 && r.描いた < 通り, r);
  ok('🔴 でも上のほうは描けている', r.描いた >= 3, r);
  ok('開くのに1.5秒もかからない', 開く秒 < 1.5, 開く秒);
}

/* ================= ② 本物か（絵を貼っていないか） ================= */
console.log('\n── 🔴 ②貼った絵ではなく、本物のBOXが描かれている ──');
{
  const r = await p.evaluate(() => {
    const st = document.querySelector('#myd-pal .md-pv[data-done="1"] .md-pv-stage');
    const box = st && st.querySelector('.md-box');
    return {
      画像を使っていない: !st.querySelector('img'),
      本物の器: !!box,
      見出しがある: !!(box && box.querySelector('.md-bh h3')),
      中身がある: !!(box && box.querySelector('.md-body')),
      道具は出さない: !(box && box.querySelector('.md-tools')),
      畳めない印: !!(box && box.classList.contains('md-noexp'))
    };
  });
  ok('🔴 画像を貼っていない', r.画像を使っていない, r);
  ok('🔴 本物のBOXの器で描いている', r.本物の器 && r.見出しがある && r.中身がある, r);
  ok('見本に編集の道具は出さない', r.道具は出さない, r);
  ok('見本は開閉しない印が付いている', r.畳めない印, r);
}

/* ================= ③ 見本は押せない ================= */
console.log('\n── 🔴 ③見本は押せない（本物と間違えない） ──');
{
  const r = await p.evaluate(() => {
    const st = document.querySelector('#myd-pal .md-pv[data-done="1"] .md-pv-stage');
    return { 指定: getComputedStyle(st).pointerEvents, 枠は押せる: getComputedStyle(st.closest('.md-pv')).pointerEvents };
  });
  ok('🔴 見本の中は押せない', r.指定 === 'none', r);
  ok('外側の枠は押せる', r.枠は押せる !== 'none', r);
}

/* ================= ④ 不向きな大きさは出さない ================= */
console.log('\n── ④不向きな大きさは枠を出さない ──');
{
  const 変 = await p.evaluate((EL) => {
    const bad = [];
    Object.keys(EL).forEach(k => {
      const sec = document.getElementById('md-pv-' + k); if (!sec) { bad.push([k, 'nosec']); return; }
      const got = [...sec.querySelectorAll('.md-pv')].map(c => c.getAttribute('data-s'));
      if (got.join(',') !== EL[k].sizes.join(',')) bad.push([k, got.join(','), EL[k].sizes.join(',')]);
    });
    return bad;
  }, EL);
  ok('🔴 出ている大きさが、そのBOXの決まりと全部一致', 変.length === 0, 変.slice(0, 5));
}

/* ================= ⑤ 最後まで描く（115通り・エラー0） ================= */
console.log('\n── 🔴 ⑤115通りを最後まで描く ──');
{
  const pal = await p.$('#myd-pal');
  for (let i = 0; i < 60; i++) {
    const done = await p.evaluate(() => {
      const m = document.getElementById('myd-pal');
      m.scrollTop = Math.min(m.scrollHeight, m.scrollTop + m.clientHeight * 0.8);
      return { 済: document.querySelectorAll('#myd-pal .md-pv[data-done="1"]').length, 底: m.scrollTop + m.clientHeight >= m.scrollHeight - 4 };
    });
    await p.waitForTimeout(160);
    if (done.底) break;
  }
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const cells = [...document.querySelectorAll('#myd-pal .md-pv')];
    return {
      描いた: cells.filter(c => c.querySelector('.md-pv-stage .md-box')).length,
      空: cells.filter(c => c.getAttribute('data-done') === '1' && !c.querySelector('.md-pv-stage .md-box')).map(c => c.getAttribute('data-k') + '/' + c.getAttribute('data-s')),
      表示エラー: [...document.querySelectorAll('#myd-pal .md-empty')].filter(e => /表示エラー/.test(e.textContent)).length,
      アイコン残り: [...document.querySelectorAll('#myd-pal [data-ic]')].filter(e => !e.getAttribute('data-icd')).length
    };
  });
  ok('🔴 最後まで描いた（' + r.描いた + '/' + 通り + '）', r.描いた === 通り, r.空.slice(0, 6));
  ok('🔴 描けなかったBOXが1つも無い', r.表示エラー === 0, r);
  ok('🔴 JSエラーが1つも出ていない', errs.length === 0, errs.slice(0, 3));
  ok('アイコンが流し込まれている（塗り残しゼロ）', r.アイコン残り === 0, r);
}

/* ================= ⑥ 押すと、その大きさで追加される ================= */
console.log('\n── 🔴 ⑥押すと、その大きさで追加される ──');
{
  const 前 = await p.evaluate(() => (state.settings.myDash.presets[state.settings.myDash.active].layout || []).length);
  const 的 = KEYS.find(k => !EL[k].person && EL[k].sizes.length >= 2);
  const sz = EL[的].sizes[EL[的].sizes.length - 1];
  await p.evaluate((a) => { document.querySelector('#md-pv-' + a.k + ' .md-pv[data-s="' + a.s + '"]').click(); }, { k: 的, s: sz });
  await p.waitForTimeout(300);
  const 後 = await p.evaluate(() => {
    const l = state.settings.myDash.presets[state.settings.myDash.active].layout || [];
    return { 数: l.length, 最後: l[l.length - 1] };
  });
  ok('1つ増えた', 後.数 === 前 + 1, { 前, 後 });
  ok('🔴 押したBOXが入った', 後.最後 && 後.最後.e === 的, { 的, 後 });
  ok('🔴 押した大きさで入った', 後.最後 && 後.最後.s === sz, { sz, 後 });

  /* 個人BOX＝誰のかを選んでから追加 */
  const 人 = KEYS.find(k => EL[k].person);
  if (人) {
    const sz2 = EL[人].sizes[0];
    await p.evaluate((a) => { document.querySelector('#md-pv-' + a.k + ' .md-pv[data-s="' + a.s + '"]').click(); }, { k: 人, s: sz2 });
    await p.waitForTimeout(250);
    const l2 = await p.evaluate(() => { const l = state.settings.myDash.presets[state.settings.myDash.active].layout; return l[l.length - 1]; });
    ok('個人BOXも追加できる', l2 && l2.e === 人, l2);
    ok('個人BOXは「誰の」が入る', l2 && !!l2.p, l2);
  }
}

/* ================= ⑦ 名前の札で飛べる／閉じたら見張りを外す ================= */
console.log('\n── ⑦名前の札で飛べる／閉じたら止まる ──');
{
  await p.evaluate(() => { document.getElementById('myd-pal').scrollTop = 0; });
  await p.waitForTimeout(150);
  const 的 = KEYS[KEYS.length - 1];
  await p.evaluate((k) => mydPalJump(k), 的);
  await p.waitForTimeout(700);
  const 飛んだ = await p.evaluate(() => document.getElementById('myd-pal').scrollTop > 200);
  ok('名前の札を押すとそこへ飛ぶ', 飛んだ);
  await p.evaluate(() => mydClosePalette());
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => ({ 閉じた: !document.getElementById('myd-pal').classList.contains('show') }));
  ok('閉じられる', r.閉じた);
  ok('🔴 閉じたあともJSエラーは出ない', errs.length === 0, errs.slice(0, 3));
}

/* ================= ⑧ ダッシュボード本体が壊れていない ================= */
console.log('\n── ⑧ダッシュボード本体は今までどおり ──');
{
  await p.evaluate(() => renderMyDash());
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => ({
    BOX: document.querySelectorAll('#mydash-flow .md-box').length,
    道具: document.querySelectorAll('#mydash-flow .md-tools').length,
    見本が混ざっていない: document.querySelectorAll('#mydash-flow .md-pv').length === 0
  }));
  ok('本体にBOXが描かれている', r.BOX > 0, r);
  ok('本体には編集の道具がある（見本と違う）', r.道具 > 0, r);
  ok('🔴 本体に見本が混ざっていない', r.見本が混ざっていない, r);
}

console.log('\n────────────────────────────');
console.log(fail === 0 ? `  ✅ 全部そろっています（${pass}件）` : `  ❌ ${fail}件 赤／${pass}件 緑`);
if (errs.length) console.log('  JSエラー:', errs.slice(0, 5));
await b.close();
process.exit(fail === 0 ? 0 : 1);
