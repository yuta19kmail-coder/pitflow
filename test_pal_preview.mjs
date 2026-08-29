/* PitFlow v2.23.0 ── 🖼 **ボックス追加の画面＝畳んでおいて、開いた時に本物を描く**（本物のブラウザ）
   ===================================================================
   ◎ゆうた依頼（2026-08-28）
     🗣「テキストで **返車 小 中 大** とか言われても、どんな仕様なのか、とか全然わからなくて使いにくい」
     🗣「それぞれアコーディオンで畳んでおいて、**開いた時に描写する**じゃだめか？
     　　**データ以前に見にくい**もある」

   ◎この見張りが守るもの
     🔴 ① **畳んだ状態で開く**（34行の一覧。全部ひろげると長くて探せない）
     🔴 ② **開くまで1つも描かない**（描くのは開いた1つだけ）
     🔴 ③ **一度に開くのは1つ**（2つ開くと、また一覧が読めなくなる）
     🔴 ④ 同じところを押したら閉じる／閉じても**描いたものは作り直さない**
     🔴 ⑤ 全部を順に開けば **115通り** 描けて、**JSエラー0**
     🔴 ⑥ **絵を貼っていない**＝本物のBOXがその場で描かれている
     🔴 ⑦ **見本は押せない**（中のカードが生きていると、見本のつもりで本物を開く）
     🔴 ⑧ 枠を押すと、そのBOXが**その大きさで**追加される
     🔴 ⑨ 不向きな大きさは枠を出さない
     ⚠ 名前の札（上に並べていた一覧）は**わざと外した**。畳んだ一覧が名前の一覧なので、
        同じ名前が2列に並んで**かえって見にくかった**。戻さないこと。

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

/* ================= ① 開いた直後＝畳まれている ================= */
console.log('\n── 🔴 ①開いた直後：全部畳まれていて、1つも描いていない ──');
const t0 = Date.now();
await p.evaluate(() => mydOpenPalette());
await p.waitForTimeout(500);
const 開く秒 = (Date.now() - t0) / 1000;
{
  const r = await p.evaluate(() => ({
    節: document.querySelectorAll('#myd-pal .md-pvsec').length,
    開いている: document.querySelectorAll('#myd-pal .md-pvsec.on').length,
    描いた: [...document.querySelectorAll('#myd-pal .md-pv')].filter(c => c.querySelector('.md-pv-stage .md-box')).length,
    枠: document.querySelectorAll('#myd-pal .md-pv').length,
    見出しが押せる: document.querySelectorAll('#myd-pal .md-pvhd[onclick]').length,
    中身は隠れている: [...document.querySelectorAll('#myd-pal .md-pvbody')].every(e => getComputedStyle(e).display === 'none'),
    名前の札: document.querySelectorAll('#myd-pal .md-pvnav').length,
    出ている: document.getElementById('myd-pal').classList.contains('show')
  }));
  ok('パレットが開く', r.出ている);
  ok('BOXの数だけ行がある（' + KEYS.length + '）', r.節 === KEYS.length, r);
  ok('🔴 開いた直後はどれも開いていない', r.開いている === 0, r);
  ok('🔴 開いた直後は1つも描いていない', r.描いた === 0, r);
  ok('🔴 中身は隠れている', r.中身は隠れている, r);
  ok('全通りぶんの枠は用意されている（' + 通り + '）', r.枠 === 通り, r);
  ok('行はどこを押しても開く', r.見出しが押せる === KEYS.length, r);
  ok('⚠ 名前の札は出していない（二重の一覧にしない）', r.名前の札 === 0, r);
  ok('開くのが速い（0.8秒未満）', 開く秒 < 0.8, 開く秒);
}

/* ================= ② 開いた1つだけ描く ================= */
console.log('\n── 🔴 ②開いた1つだけ描く／一度に開くのは1つ ──');
const 一 = KEYS.find(k => !EL[k].person && EL[k].sizes.length >= 2);
const 二 = KEYS.filter(k => !EL[k].person && k !== 一)[0];
{
  await p.evaluate((k) => mydPalToggle(k), 一);
  await p.waitForTimeout(500);
  const r = await p.evaluate((a) => ({
    開いている: [...document.querySelectorAll('#myd-pal .md-pvsec.on')].map(s => s.id),
    その節の描画: document.querySelectorAll('#md-pv-' + a.k + ' .md-pv-stage .md-box').length,
    ほかの描画: [...document.querySelectorAll('#myd-pal .md-pv')].filter(c => c.closest('.md-pvsec').id !== 'md-pv-' + a.k && c.querySelector('.md-pv-stage .md-box')).length
  }), { k: 一 });
  ok('🔴 押した1つだけが開く', r.開いている.length === 1 && r.開いている[0] === 'md-pv-' + 一, r);
  ok('🔴 その節の見本が全部描かれた（' + EL[一].sizes.length + '）', r.その節の描画 === EL[一].sizes.length, r);
  ok('🔴 ほかの節はまだ描いていない', r.ほかの描画 === 0, r);

  await p.evaluate((k) => mydPalToggle(k), 二);
  await p.waitForTimeout(500);
  const r2 = await p.evaluate(() => [...document.querySelectorAll('#myd-pal .md-pvsec.on')].map(s => s.id));
  ok('🔴 別を開くと、前のは閉じる（開いているのは常に1つ）', r2.length === 1 && r2[0] === 'md-pv-' + 二, r2);

  await p.evaluate((k) => mydPalToggle(k), 二);
  await p.waitForTimeout(300);
  const r3 = await p.evaluate(() => document.querySelectorAll('#myd-pal .md-pvsec.on').length);
  ok('🔴 同じところを押すと閉じる', r3 === 0, r3);

  /* 閉じても、描いたものは作り直さない */
  const 印 = await p.evaluate((k) => { const c = document.querySelector('#md-pv-' + k + ' .md-pv .md-pv-stage .md-box'); if (c) c.setAttribute('data-mark', '1'); return !!c; }, 二);
  await p.evaluate((k) => mydPalToggle(k), 二);
  await p.waitForTimeout(400);
  const のこった = await p.evaluate((k) => !!document.querySelector('#md-pv-' + k + ' .md-box[data-mark="1"]'), 二);
  ok('🔴 開け閉めで描き直さない（無駄に作らない）', 印 && のこった, { 印, のこった });
}

/* ================= ③ 本物か・押せないか ================= */
console.log('\n── 🔴 ③貼った絵ではない／見本は押せない ──');
{
  const r = await p.evaluate(() => {
    const st = document.querySelector('#myd-pal .md-pvsec.on .md-pv-stage');
    const box = st && st.querySelector('.md-box');
    return {
      画像なし: !!st && !st.querySelector('img'),
      本物の器: !!box, 見出し: !!(box && box.querySelector('.md-bh h3')), 中身: !!(box && box.querySelector('.md-body')),
      道具なし: !(box && box.querySelector('.md-tools')),
      畳めない印: !!(box && box.classList.contains('md-noexp')),
      指定: st ? getComputedStyle(st).pointerEvents : '',
      枠: st ? getComputedStyle(st.closest('.md-pv')).pointerEvents : ''
    };
  });
  ok('🔴 画像を貼っていない', r.画像なし, r);
  ok('🔴 本物のBOXの器で描いている', r.本物の器 && r.見出し && r.中身, r);
  ok('見本に編集の道具は出さない', r.道具なし, r);
  ok('見本は開閉しない印が付いている', r.畳めない印, r);
  ok('🔴 見本の中は押せない', r.指定 === 'none', r);
  ok('外側の枠は押せる', r.枠 !== 'none', r);
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

/* ================= ⑤ 全部を順に開く（115通り・エラー0） ================= */
console.log('\n── 🔴 ⑤全部を順に開く（' + 通り + '通り） ──');
{
  for (const k of KEYS) { await p.evaluate((x) => mydPalToggle(x), k); await p.waitForTimeout(90); }
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const cells = [...document.querySelectorAll('#myd-pal .md-pv')];
    return {
      描いた: cells.filter(c => c.querySelector('.md-pv-stage .md-box')).length,
      空: cells.filter(c => !c.querySelector('.md-pv-stage .md-box')).map(c => c.getAttribute('data-k') + '/' + c.getAttribute('data-s')),
      表示エラー: [...document.querySelectorAll('#myd-pal .md-empty')].filter(e => /表示エラー/.test(e.textContent)).length,
      アイコン残り: [...document.querySelectorAll('#myd-pal [data-ic]')].filter(e => !e.getAttribute('data-icd')).length,
      開いている: document.querySelectorAll('#myd-pal .md-pvsec.on').length
    };
  });
  ok('🔴 全部描けた（' + r.描いた + '/' + 通り + '）', r.描いた === 通り, r.空.slice(0, 6));
  ok('🔴 描けなかったBOXが1つも無い', r.表示エラー === 0, r);
  ok('🔴 JSエラーが1つも出ていない', errs.length === 0, errs.slice(0, 3));
  ok('アイコンが流し込まれている（塗り残しゼロ）', r.アイコン残り === 0, r);
  ok('🔴 最後まで、開いているのは1つだけ', r.開いている <= 1, r);
}

/* ================= ⑥ 押すと、その大きさで追加される ================= */
console.log('\n── 🔴 ⑥押すと、その大きさで追加される ──');
{
  const 前 = await p.evaluate(() => (state.settings.myDash.presets[state.settings.myDash.active].layout || []).length);
  const sz = EL[一].sizes[EL[一].sizes.length - 1];
  await p.evaluate((a) => { mydPalToggle(a.k); document.querySelector('#md-pv-' + a.k + ' .md-pv[data-s="' + a.s + '"]').click(); }, { k: 一, s: sz });
  await p.waitForTimeout(300);
  const 後 = await p.evaluate(() => { const l = state.settings.myDash.presets[state.settings.myDash.active].layout || []; return { 数: l.length, 最後: l[l.length - 1] }; });
  ok('1つ増えた', 後.数 === 前 + 1, { 前, 後 });
  ok('🔴 押したBOXが入った', 後.最後 && 後.最後.e === 一, { 一, 後 });
  ok('🔴 押した大きさで入った', 後.最後 && 後.最後.s === sz, { sz, 後 });

  const 人 = KEYS.find(k => EL[k].person);
  if (人) {
    const sz2 = EL[人].sizes[0];
    await p.evaluate((a) => { mydPalToggle(a.k); document.querySelector('#md-pv-' + a.k + ' .md-pv[data-s="' + a.s + '"]').click(); }, { k: 人, s: sz2 });
    await p.waitForTimeout(250);
    const l2 = await p.evaluate(() => { const l = state.settings.myDash.presets[state.settings.myDash.active].layout; return l[l.length - 1]; });
    ok('個人BOXも追加できる', l2 && l2.e === 人, l2);
    ok('個人BOXは「誰の」が入る', l2 && !!l2.p, l2);
  }
  /* 「誰の」の選びなおしは、行を開かずに触れること（押しても開かない） */
  const 人2 = KEYS.find(k => EL[k].person);
  if (人2) {
    await p.evaluate((k) => { const s = document.getElementById('md-pv-' + k); if (s.classList.contains('on')) mydPalToggle(k); }, 人2);
    await p.waitForTimeout(200);
    await p.evaluate((k) => document.getElementById('md-pers-' + k).click(), 人2);
    await p.waitForTimeout(200);
    const 開いた = await p.evaluate((k) => document.getElementById('md-pv-' + k).classList.contains('on'), 人2);
    ok('🔴 「誰の」を押しても行は開かない', !開いた, 開いた);
  }
}

/* ================= ⑦ 閉じる／本体は今までどおり ================= */
console.log('\n── ⑦閉じる／ダッシュボード本体は今までどおり ──');
{
  await p.evaluate(() => mydClosePalette());
  await p.waitForTimeout(200);
  ok('閉じられる', await p.evaluate(() => !document.getElementById('myd-pal').classList.contains('show')));
  await p.evaluate(() => renderMyDash());
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => ({
    BOX: document.querySelectorAll('#mydash-flow .md-box').length,
    道具: document.querySelectorAll('#mydash-flow .md-tools').length,
    見本なし: document.querySelectorAll('#mydash-flow .md-pv').length === 0
  }));
  ok('本体にBOXが描かれている', r.BOX > 0, r);
  ok('本体には編集の道具がある（見本と違う）', r.道具 > 0, r);
  ok('🔴 本体に見本が混ざっていない', r.見本なし, r);
  ok('🔴 最後までJSエラー0', errs.length === 0, errs.slice(0, 3));
}

console.log('\n────────────────────────────');
console.log(fail === 0 ? `  ✅ 全部そろっています（${pass}件）` : `  ❌ ${fail}件 赤／${pass}件 緑`);
if (errs.length) console.log('  JSエラー:', errs.slice(0, 5));
await b.close();
process.exit(fail === 0 ? 0 : 1);
