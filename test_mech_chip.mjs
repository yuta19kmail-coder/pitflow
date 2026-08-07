/* PitFlow v1.67.0 ── メカ担当＝チップ式（案B）＋ 配分％をライブ表示
   -------------------------------------------------------------------
   ◎ゆうた指定
     「メカ担当者を入れた時に、最終的な％表示をライブでする」
     「B案で行こう。％の表示はいいけど、金額は最終確定はまだ出てないし、
       金額見るとやっぱり自分の方がちょっと多いかな？とか思っちゃうから％だけにして」
   ◎ここで守っていること
     🔴 カード詳細の配分プレビューに **金額は1円も出さない**（％だけ）
     🔴 返車前でもライブで出る（前は返車済みしか出なかった）
     ・タップ＝1枠追加／もう一度タップ＝×2・×3…（取り分が増える）／✕＝その人を全部外す
     ・配分そのもの（pitMechAlloc）は触っていない＝作業サマリーの金額は今まで通り
   ◎使い方
     python3 -m http.server 8991      ← 別ウィンドウ
     node test_mech_chip.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.openDetail && window.pitMechAllocText && window.pitMechAlloc', null, { timeout: 25000 });
await p.waitForTimeout(700);

/* 点検/整備に出す候補（名簿）を確保してから、車検の車を1台置く */
const names = await p.evaluate(() => {
  const st = (window.state.staff || window.state.members || []);
  return st.slice(0, 4).map(s => s.name || s);
});

const seed = (over) => p.evaluate(o => {
  state.cards = [Object.assign({
    id: 'MC1', resNo: 'R-MC1', customer: 'メカ 太郎', car: 'プリウス', boardId: 'default', division: 'div1',
    workType: 'shaken', workTypes: ['shaken'], status: 'work', dropType: 'drop',
    amountOrder: 100000, inspectors: [], mechanics: []
  }, o || {})];
  openDetail('MC1');
  const t = document.querySelector('.cv-tab[data-p=maint]');
  if (t) cvTab(t);
  return true;
}, over || null);

console.log('\n── 🎛 チップ式（案B）になっているか ──');
{
  await seed();
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => ({
    chips: document.querySelectorAll('#cv-p-maint .cf-mchip').length,
    selects: document.querySelectorAll('#cv-p-maint select').length,
    blocks: document.querySelectorAll('#cv-p-maint .cf-mech-block').length,
    live: !!document.getElementById('cv-mech-live'),
    liveTxt: (document.getElementById('cv-mech-live') || {}).innerText || ''
  }));
  ok('点検・整備の2ブロックが出る', r.blocks === 2, r);
  ok('🔴 名前はチップ（ボタン）で並ぶ', r.chips > 0, r);
  ok('プルダウン（select）は消えている', r.selects === 0, r);
  ok('配分プレビューの枠がある', r.live === true, r);
  ok('誰も選んでいなければ案内文が出る', /担当者を選ぶと/.test(r.liveTxt), r);
}

console.log('\n── ⚡ タップした瞬間に％が出る（ライブ） ──');
{
  await seed();
  await p.waitForTimeout(150);
  const r = await p.evaluate(() => {
    const out = {};
    const chip = document.querySelector('#cv-p-maint .cf-mech-i .cf-mchip');
    out.name = chip.textContent.replace(/[×✕].*$/, '').trim();
    chip.click();
    out.after1 = document.getElementById('cv-mech-live').innerText.replace(/\s+/g, ' ');
    out.on1 = document.querySelectorAll('#cv-p-maint .cf-mech-i .cf-mchip.on').length;
    /* 整備側も1人 */
    const m = document.querySelector('#cv-p-maint .cf-mech-m .cf-mchip');
    out.mname = m.textContent.replace(/[×✕].*$/, '').trim();
    m.click();
    out.after2 = document.getElementById('cv-mech-live').innerText.replace(/\s+/g, ' ');
    out.saved = { i: state.cards[0].inspectors.slice(), m: state.cards[0].mechanics.slice() };
    return out;
  });
  ok('🔴 1タップで即座に配分が出る（再読み込みなし）', /%/.test(r.after1), r.after1);
  ok('押した人が on になる', r.on1 === 1, r);
  ok('点検だけのときは点検者が 100%', /100%/.test(r.after1), r.after1);
  ok('整備を足すと2人ぶん出る', /点検/.test(r.after2) && /整備/.test(r.after2), r.after2);
  ok('カードに保存されている', r.saved.i.length === 1 && r.saved.m.length === 1, r.saved);
}

console.log('\n── 💴 金額はどこにも出さない（ゆうた指定） ──');
{
  const r = await p.evaluate(() => {
    const t = document.getElementById('cv-mech-live').innerText;
    return { txt: t.replace(/\s+/g, ' '),
             yen: /[¥￥]|円|万/.test(t),
             dai: /台/.test(t) };
  });
  ok('🔴 ¥・円・万 のどれも出ていない', r.yen === false, r.txt);
  ok('台数も出していない（％だけ）', r.dai === false, r.txt);
  ok('％は出ている', /%/.test(r.txt), r.txt);
}

console.log('\n── ⛲ 点検ぶん／作業ぶんの帯 ──');
{
  const r = await p.evaluate(() => {
    const el = document.getElementById('cv-mech-live');
    return { bar: el.querySelectorAll('.mech-split').length,
             lb: (el.querySelector('.mech-split-lb') || {}).innerText || '' };
  });
  ok('帯が1本出る', r.bar === 1, r);
  ok('「点検ぶん ○%／作業ぶん ○%」の見出しが付く', /点検ぶん/.test(r.lb) && /作業ぶん/.test(r.lb), r.lb);
  /* 車検10万・点検料1.5万 → 点検15% / 作業85% */
  ok('車検10万なら 点検15% / 作業85%', /点検ぶん 15%/.test(r.lb) && /作業ぶん 85%/.test(r.lb), r.lb);
}

console.log('\n── ×2・×3（同じ人をもう一度タップ＝取り分が増える） ──');
{
  await seed();
  await p.waitForTimeout(150);
  const r = await p.evaluate(() => {
    const chips = document.querySelectorAll('#cv-p-maint .cf-mech-m .cf-mchip');
    const a = chips[0], bnm = chips[1].textContent.replace(/[×✕].*$/, '').trim();
    a.click();                                             // A ×1
    document.querySelectorAll('#cv-p-maint .cf-mech-m .cf-mchip')[1].click();  // B ×1
    const half = document.getElementById('cv-mech-live').innerText.replace(/\s+/g, ' ');
    /* A をもう一度 → A ×2 */
    document.querySelectorAll('#cv-p-maint .cf-mech-m .cf-mchip')[0].click();
    const two = document.getElementById('cv-mech-live').innerText.replace(/\s+/g, ' ');
    const badge = !!document.querySelector('#cv-p-maint .cf-mech-m .cf-mchip .cf-mchip-x');
    return { half, two, badge, arr: state.cards[0].mechanics.slice(), bnm };
  });
  ok('2人なら 50% / 50%', (r.half.match(/50%/g) || []).length === 2, r.half);
  ok('🔴 もう一度タップで ×2 になる', r.arr.length === 3, r.arr);
  ok('チップに ×2 の印が出る', r.badge === true, r);
  ok('取り分が 67% / 33% に変わる', /67%/.test(r.two) && /33%/.test(r.two), r.two);
}

console.log('\n── ✕ で外す（×2 でも1回で消える） ──');
{
  const r = await p.evaluate(() => {
    const x = document.querySelector('#cv-p-maint .cf-mech-m .cf-mchip .cf-mchip-off');
    x.click();
    return { arr: state.cards[0].mechanics.slice(),
             txt: document.getElementById('cv-mech-live').innerText.replace(/\s+/g, ' ') };
  });
  ok('その人の枠が全部消える（×2でも1回）', r.arr.length === 1, r.arr);
  ok('残った1人が 100%', /100%/.test(r.txt), r.txt);
}

console.log('\n── 🧯 片方が居ないとき（点検料の行き先） ──');
{
  /* 整備だけ＝点検料ぶんも整備者へ → その人が 100% */
  await seed();
  await p.waitForTimeout(150);
  const only = await p.evaluate(() => {
    document.querySelector('#cv-p-maint .cf-mech-m .cf-mchip').click();
    return document.getElementById('cv-mech-live').innerText.replace(/\s+/g, ' ');
  });
  ok('整備だけなら 100%', /100%/.test(only) && !/¥|円/.test(only), only);

  /* 点検だけ＝全部が点検者へ */
  await seed();
  await p.waitForTimeout(150);
  const oi = await p.evaluate(() => {
    document.querySelector('#cv-p-maint .cf-mech-i .cf-mchip').click();
    return document.getElementById('cv-mech-live').innerText.replace(/\s+/g, ' ');
  });
  ok('点検だけなら 100%', /100%/.test(oi), oi);
}

console.log('\n── 🕒 返車前でもライブで出る（前は返車済みだけだった） ──');
{
  for (const st of ['check', 'estim', 'contact', 'parts', 'work', 'workDone', 'returned']) {
    await seed({ status: st });
    await p.waitForTimeout(120);
    const r = await p.evaluate(() => {
      document.querySelector('#cv-p-maint .cf-mech-m .cf-mchip').click();
      return document.getElementById('cv-mech-live').innerText.replace(/\s+/g, ' ');
    });
    ok('「' + st + '」でも配分％が出る', /%/.test(r), r);
  }
}

console.log('\n── 🧾 管理側（作業サマリー）は今まで通り金額を見せる ──');
{
  const r = await p.evaluate(() => {
    const y = new Date().getFullYear(), m = String(new Date().getMonth() + 1).padStart(2, '0'), d = String(new Date().getDate()).padStart(2, '0');
    state.cards = [{ id: 'MC9', resNo: 'R-MC9', customer: 'x', car: 'y', boardId: 'default', division: 'div1',
      workType: 'shaken', workTypes: ['shaken'], status: 'returned', dropType: 'drop',
      amountFinal: 100000, completedAt: y + '-' + m + '-' + d,
      inspectors: ['A'], mechanics: ['B'] }];
    try { showView('worksum'); } catch (e) {}
    const el = document.getElementById('view-worksum-body');
    return el ? el.innerText.replace(/\s+/g, ' ').slice(0, 600) : '(なし)';
  });
  await p.waitForTimeout(250);
  ok('作業サマリーには金額（万/円）が残っている', /万|円/.test(r), r.slice(0, 200));
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  await p.evaluate(() => { state.cards = []; });
  for (const v of ['course1', 'today', 'return', 'sales', 'mydash', 'worksum']) {
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(120);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.67.0 以降', vn[0] > 1 || (vn[0] === 1 && vn[1] >= 67), ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
