/* PitFlow v1.35.0 ── 新規予約の代車カレンダー（列選択・行選択・自動入力・追従・並べ替え）のテスト
   -------------------------------------------------------------------
   ◎考え方
     **PitFlow 本体（index.html）をサンプルモードで丸ごと開き**、新規予約カードを実際に出して
     代車カレンダーをクリック／入力して確かめる。見るのは6つ（ゆうた指定）。
       ① 車種の見出しを押す → その列が青い点線で囲まれ、使用代車に入る
       ② 使用代車を選ぶ → 同じ列が囲まれる
       ③ 日付を押す → その日の行が囲まれる
       ④ 入庫日が入った状態で「代車必要」→ 貸出から に入庫日が入る
       ⑤ 貸出の日付を打つと、緑のマスがその場で追従する
       ⑥ 代車条件を押すと、合う代車が先頭に並び替わる
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8951      ← 別ウィンドウ
     node test_loaner_cal.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:8951/index.html?demo=1');
await p.waitForFunction('window.state && typeof window.openCardForm === "function" || typeof window.pitNewCard === "function" || typeof window.showView === "function"', null, { timeout: 20000 });
await p.waitForTimeout(700);

/* 🔴 貸出の予定を**決め打ち**にする。
   ⚠ サンプルの貸出はランダムに作られるので、そのままだと
      「たまたま選んだ列が全部ふさがっていて緑が付かない」で落ちることがある（不具合ではない）。
      並べて回した時だけ落ちる、を防ぐためにここで固定する。 */
await p.evaluate(() => {
  const ls = (state.loaners || []).filter(l => !l.emergency);
  const t = new Date(); t.setHours(0,0,0,0);
  const at = n => { const d = new Date(t); d.setDate(d.getDate() + n); return window.ymd(d); };
  /* 先頭2台だけ、今日から3日間ふさぐ。ほかは全部空き。 */
  state.loanerAssigns = [
    { id:'fa1', loanerId: ls[0].id, fromDate: at(0), toDate: at(2), cardId:'' },
    { id:'fa2', loanerId: ls[1].id, fromDate: at(0), toDate: at(2), cardId:'' }
  ];
});

/* 新規予約カードを1枚作って開く（本体の関数をそのまま使う） */
const CID = await p.evaluate(() => {
  const d = new Date(); d.setDate(d.getDate() + 2);
  const ds = window.ymd(d);
  const c = {
    id: 'lgtest1', resNo: 'LG1', customer: '代車 太郎', kana: 'ダイシャ タロウ',
    car: 'アクア', maker: 'トヨタ', tel: '090-0000-0000',
    reserveDate: ds, reserveTime: '10:00', status: 'reserved',
    boardId: 'default', division: 'div1', workTypes: [], dropType: 'drop',
    needLoaner: false, loanerConditions: []
  };
  state.cards.push(c);
  window.openCard(c.id, 'page');
  return c.id;
});
await p.waitForTimeout(500);
const card = () => p.evaluate(id => state.cards.find(x => x.id === id), CID);

/* 代車の欄を出す＝「必要」を押す（＝④の確認も兼ねる） */
console.log('\n── ④ 入庫日が入っている状態で「代車必要」を押す ──');
{
  const before = await card();
  ok('押す前は貸出から が空', !before.loanerFrom, before.loanerFrom);
  await p.evaluate(() => {
    const g = document.querySelector('.cf-toggle[data-key="needLoaner"]');
    g.querySelector('.cf-tg[data-val="1"]').click();
  });
  await p.waitForTimeout(500);
  const c2 = await card();
  ok('代車が「必要」になった', c2.needLoaner === true);
  ok('🔴 貸出から に入庫日が自動で入った', c2.loanerFrom === c2.reserveDate, [c2.loanerFrom, c2.reserveDate]);
  ok('代車カレンダーが出ている', (await p.locator('#cfs-lg-card').count()) > 0);
}

console.log('\n── ① 車種の見出しを押す → 列が囲まれる＋使用代車に入る ──');
/* ⚠ 上で決め打ちにした「ふさがっている2台」を避けて3台目を選ぶ */
const LOID = await p.evaluate(() => document.querySelectorAll('#cfs-lg-card th.cfs-lg-thpick')[2].getAttribute('data-loid'));
{
  await p.evaluate(id => {
    document.querySelector('#cfs-lg-card th[data-loid="' + id + '"]').click();
  }, LOID);
  await p.waitForTimeout(250);
  const c2 = await card();
  ok('🔴 使用代車に入った', c2.loanerId === LOID, [c2.loanerId, LOID]);
  ok('使用代車のセレクトにも反映', (await p.evaluate(() => document.querySelector('select[data-key="loanerId"]').value)) === LOID);
  const sel = await p.evaluate(id => ({
    th: !!document.querySelector('#cfs-lg-card th[data-loid="' + id + '"]').classList.contains('cfs-lg-colsel'),
    n:  document.querySelectorAll('#cfs-lg-card .cfs-lg-colsel').length,
    other: document.querySelectorAll('#cfs-lg-card .cfs-lg-colsel:not([data-lgcol="' + id + '"])').length
  }), LOID);
  ok('🔴 見出しが囲まれている', sel.th);
  ok('列のマスもまとめて囲まれている', sel.n > 5, sel.n);
  ok('ほかの列は囲まれていない', sel.other === 0, sel.other);
  const dashed = await p.evaluate(id => {
    const el = document.querySelector('#cfs-lg-card td[data-lgcol="' + id + '"]');
    const cs = getComputedStyle(el);
    return { style: cs.borderLeftStyle, color: cs.borderLeftColor };
  }, LOID);
  ok('青い点線で囲われている', dashed.style === 'dashed' && /55,\s*138,\s*221/.test(dashed.color), dashed);
}

console.log('\n── ① もう一度押すと外れる ──');
{
  await p.evaluate(id => document.querySelector('#cfs-lg-card th[data-loid="' + id + '"]').click(), LOID);
  await p.waitForTimeout(200);
  ok('使用代車が空に戻る', !(await card()).loanerId);
  ok('囲みも消える', (await p.evaluate(() => document.querySelectorAll('#cfs-lg-card .cfs-lg-colsel').length)) === 0);
}

console.log('\n── ② 使用代車を選ぶ → 同じ列が囲まれる ──');
{
  await p.evaluate(id => {
    const sel = document.querySelector('select[data-key="loanerId"]');
    sel.value = id;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, LOID);
  await p.waitForTimeout(300);
  ok('🔴 欄で選んでも列が囲まれる',
     (await p.evaluate(id => !!document.querySelector('#cfs-lg-card th[data-loid="' + id + '"]').classList.contains('cfs-lg-colsel'), LOID)));
}

console.log('\n── ③ 日付を押す → その日の行が囲まれる ──');
{
  const ds = await p.evaluate(() => document.querySelectorAll('#cfs-lg-body td[data-lgrow]')[3].getAttribute('data-lgrow'));
  await p.evaluate(d => document.querySelector('#cfs-lg-body td[data-lgrow="' + d + '"]').click(), ds);
  await p.waitForTimeout(200);
  ok('🔴 その日の行が囲まれる',
     (await p.evaluate(d => !!document.querySelector('#cfs-lg-body tr[data-ds="' + d + '"]').classList.contains('cfs-lg-rowsel'), ds)));
  ok('囲まれている行は1本だけ', (await p.evaluate(() => document.querySelectorAll('#cfs-lg-body tr.cfs-lg-rowsel').length)) === 1);
  await p.evaluate(d => document.querySelector('#cfs-lg-body td[data-lgrow="' + d + '"]').click(), ds);
  await p.waitForTimeout(150);
  ok('もう一度押すと外れる', (await p.evaluate(() => document.querySelectorAll('#cfs-lg-body tr.cfs-lg-rowsel').length)) === 0);
  ok('行を押しても使用代車は変わらない（見やすくするだけ）', (await card()).loanerId === LOID);
}

console.log('\n── ⑤ 貸出の日付を打つと、緑のマスがその場で追従する ──');
{
  /* ⚠ 貸出中のマスには data-lgd が無い（＝選べない）。
     実際に**空いている**代車と、その連続3日を探してから打つ。 */
  const pick = await p.evaluate(() => {
    const free = {};
    document.querySelectorAll('#cfs-lg-body td[data-lgd]').forEach(td => {
      (free[td.dataset.lgl] = free[td.dataset.lgl] || []).push(td.dataset.lgd);
    });
    const nx = ds => { const q = ds.split('-'); const d = new Date(+q[0], +q[1]-1, +q[2]); d.setDate(d.getDate()+1); return window.ymd(d); };
    for (const lid in free){
      const ds = free[lid].slice().sort();
      for (let i = 0; i + 3 < ds.length; i++){
        if (nx(ds[i]) === ds[i+1] && nx(ds[i+1]) === ds[i+2] && nx(ds[i+2]) === ds[i+3])
          return { lid: lid, a: ds[i], b: ds[i+2], c: ds[i+3] };
      }
    }
    return null;
  });
  ok('空いている代車と連続した日が見つかった', !!pick, pick);
  /* その代車を使う。
     ⚠ 見出しクリックは**押すたびに切り替わる**ので、すでに同じ代車が選ばれていると解除になる。
        ここは確実に「その代車にする」＝**欄で選ぶ**（②の道）。 */
  await p.evaluate(id => {
    const sel = document.querySelector('select[data-key="loanerId"]');
    sel.value = id;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, pick.lid);
  await p.waitForTimeout(250);
  ok('その代車が選ばれた', (await card()).loanerId === pick.lid, [(await card()).loanerId, pick.lid]);
  await p.evaluate(([f, t]) => {
    const setv = (k, v) => { const el = document.querySelector('[data-key="' + k + '"]'); el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true })); };
    setv('loanerFrom', f); setv('loanerTo', t);
  }, [pick.a, pick.b]);
  await p.waitForTimeout(300);
  const greens = await p.evaluate(() => Array.from(document.querySelectorAll('#cfs-lg-body td.cfs-lg-pick'))
    .map(e => [e.dataset.lgl, e.dataset.lgd]));
  ok('🔴 打った範囲だけ緑になる（再描画を待たずに）',
     greens.length === 3 && greens.every(g => g[0] === pick.lid) && greens[0][1] === pick.a && greens[2][1] === pick.b,
     { greens, pick });
  /* さらに1日伸ばす＝その場で増える */
  await p.evaluate(t => { const el = document.querySelector('[data-key="loanerTo"]'); el.value = t;
    el.dispatchEvent(new Event('input', { bubbles: true })); }, pick.c);
  await p.waitForTimeout(250);
  ok('伸ばすとその場で増える',
     (await p.evaluate(() => document.querySelectorAll('#cfs-lg-body td.cfs-lg-pick').length)) === 4);
  ok('貸出中のマスは緑にならない',
     (await p.evaluate(() => Array.from(document.querySelectorAll('#cfs-lg-body td.cfs-lg-busy'))
        .every(e => !e.classList.contains('cfs-lg-pick')))));
}

console.log('\n── ⑥ 代車条件を押すと並べ替わる ──');
{
  const before = await p.evaluate(() => Array.from(document.querySelectorAll('#cfs-lg-card th.cfs-lg-th'))
    .map(e => e.getAttribute('data-loid')));
  /* 代車の一部に ETC を持たせて、条件で先頭に来るか見る */
  await p.evaluate(() => {
    const ls = (state.loaners || []).filter(l => !l.emergency);
    ls.forEach((l, i) => { l.etc = (i >= ls.length - 3); });   /* 後ろ3台だけ ETC あり */
  });
  await p.evaluate(() => {
    const g = document.querySelector('.cf-chips[data-key="loanerConditions"]');
    const btn = Array.from(g.querySelectorAll('.cf-chip')).find(x => x.dataset.val === 'etc');
    btn.click();
  });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => Array.from(document.querySelectorAll('#cfs-lg-card th.cfs-lg-th'))
    .map(e => e.getAttribute('data-loid')));
  const etcIds = await p.evaluate(() => (state.loaners || []).filter(l => !l.emergency && l.etc).map(l => l.id));
  ok('🔴 並びが変わった', JSON.stringify(before) !== JSON.stringify(after));
  ok('条件に合う代車が先頭に来る', after.slice(0, etcIds.length).every(id => etcIds.indexOf(id) >= 0),
     { 先頭: after.slice(0, 3), ETC: etcIds });
  ok('合わない代車も消えていない（下に残る）', after.length === before.length, [before.length, after.length]);
  ok('条件に合う見出しに印が付く',
     (await p.evaluate(() => document.querySelectorAll('#cfs-lg-card th.cfs-lg-match').length)) === etcIds.length);
  ok('並べ替えたあとも使用代車の囲みが残る',
     (await p.evaluate(() => {
        const lid = state.cards.find(x => x.id === 'lgtest1').loanerId;
        const th = document.querySelector('#cfs-lg-card th[data-loid="' + lid + '"]');
        return !!(th && th.classList.contains('cfs-lg-colsel'));
     })));
  /* Bカメ（camera）＝v1.35.0 で並べ替えの対象に足した分 */
  await p.evaluate(() => {
    const ls = (state.loaners || []).filter(l => !l.emergency);
    ls.forEach((l, i) => { l.etc = false; l.camera = (i >= ls.length - 2); });
    const g = document.querySelector('.cf-chips[data-key="loanerConditions"]');
    Array.from(g.querySelectorAll('.cf-chip')).find(x => x.dataset.val === 'etc').click();      /* ETC を外す */
    Array.from(g.querySelectorAll('.cf-chip')).find(x => x.dataset.val === 'camera').click();   /* Bカメ を付ける */
  });
  await p.waitForTimeout(400);
  const camIds = await p.evaluate(() => (state.loaners || []).filter(l => !l.emergency && l.camera).map(l => l.id));
  const afterCam = await p.evaluate(() => Array.from(document.querySelectorAll('#cfs-lg-card th.cfs-lg-th'))
    .map(e => e.getAttribute('data-loid')));
  ok('🔴 Bカメでも並べ替わる（v1.35.0 で対象に追加）',
     afterCam.slice(0, camIds.length).every(id => camIds.indexOf(id) >= 0), { 先頭: afterCam.slice(0, 2), Bカメ: camIds });
}

console.log('\n── ⑦ 今までの操作が壊れていないこと ──');
{
  ok('空きマスのドラッグ選択はそのまま残っている',
     (await p.evaluate(() => document.querySelectorAll('#cfs-lg-body td[data-lgl][data-lgd]').length)) > 0);
  ok('貸出中のマスは選べないまま',
     (await p.evaluate(() => Array.from(document.querySelectorAll('#cfs-lg-body td.cfs-lg-busy'))
        .every(e => !e.hasAttribute('data-lgd')))));
  ok('JSエラー0', errs.length === 0, errs.slice(0, 5));
}

await p.locator('#cfs-lg-card').screenshot({ path: 'shot_loaner_cal.png' });
console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
