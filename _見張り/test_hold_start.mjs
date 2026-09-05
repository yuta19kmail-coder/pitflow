/* PitFlow v2.74.0 ── 🅿 預かりの起算は「実際に入庫した日」
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-09-05）
     🗣「預かりの日数のカウントが**預かり日起算**になっていて、**実際に入庫したかを見ていない**。
     　　そのため未入庫も預かり中としてカウント（日数自体が）されている。これは違うから、
     　　**入庫済み（タスクボードに入った時点）から預かり日数としてカウント**するようにしたい」
     🗣「予約の段階から預かりって表記始まってない？」

   ◎この試験が見張るもの
     ① 物差しは1本＝`pitInShop` / `pitHoldFrom`（views.js）
     ② 起点は**実入庫日**。予定より遅れて入った車の日数が水増しされない
     ③ `actualInAt` が無い昔のカードは**入庫日で数える**（落とさない）
     ④ まだ入庫していないカードは**日数を出さない**（ホバーは「未入庫」と言い切る）
     ⑤ ダッシュボードの「預かり中◯台」に**未入庫が混ざらない**
     ⑥ 🔴 ただし**明日から先の見込みには、今までどおり予約も数える**（最短入庫日が嘘になるため）
     ⑦ マイダッシュの「預かり中」「長期預かり」／整備ダッシュの長期アラートも同じ起点
     ⑧ 各画面が `reserveDate` を直接見ていない（物差しを借りている）
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8941      ← 別ウィンドウ
     node _見張り/test_hold_start.mjs                                       */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8941;
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
await p.waitForFunction('window.state && window.pitHoldFrom && window.pitInShop && window.dashOccupancy', null, { timeout: 25000 });
await p.waitForTimeout(900);

const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); const q = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); };

console.log('\n── ① 物差しは1本（pitInShop / pitHoldFrom） ──');
{
  const r = await p.evaluate(() => ({
    /* 入庫の記録がある＝入庫済み */
    inWithMark:  pitInShop({ status:'reserved', actualInAt:'2026-09-01' }),
    /* 印が無くてもボードの列にいる＝昔のカード。落とさない */
    inOldCard:   pitInShop({ status:'work' }),
    inReturned:  pitInShop({ status:'returned' }),
    /* まだ来ていない */
    notReserved: pitInShop({ status:'reserved' }),
    notNoShow:   pitInShop({ status:'cancelled', noShow:true }),
    notScrap:    pitInShop({ status:'scrap' }),
    notNull:     pitInShop(null)
  }));
  ok('🔴 入庫の記録があれば入庫済み', r.inWithMark === true, r);
  ok('🔴 印が無い昔のカードも、ボードの列にいれば入庫済み', r.inOldCard === true, r);
  ok('返車済みも「入庫した実績はある」', r.inReturned === true, r);
  ok('🔴 予約のまま＝入庫していない', r.notReserved === false, r);
  ok('🔴 未入庫（来なかった）＝入庫していない', r.notNoShow === false, r);
  ok('廃車・乗替＝数えない', r.notScrap === false, r);
  ok('カードが無くても落ちない', r.notNull === false, r);
}

console.log('\n── ②③④ 起点＝実際に入庫した日 ──');
{
  const r = await p.evaluate(() => ({
    /* 予定 9/1・実際は 9/3 に入った → 起点は 9/3 */
    late:  pitHoldFrom({ status:'work', reserveDate:'2026-09-01', actualInAt:'2026-09-03' }),
    /* 予定より早く入った時も、実際に入った日 */
    early: pitHoldFrom({ status:'work', reserveDate:'2026-09-05', actualInAt:'2026-09-02' }),
    /* 印が無い昔のカード＝入庫日で数える（落とさない） */
    old:   pitHoldFrom({ status:'work', reserveDate:'2026-09-01' }),
    /* まだ入庫していない＝起点を出さない */
    yet:   pitHoldFrom({ status:'reserved', reserveDate:'2026-09-01' }),
    none:  pitHoldFrom({ status:'work' })
  }));
  ok('🔴🔴 遅れて入った車は**実際に入った日**が起点（水増ししない）', r.late === '2026-09-03', r);
  ok('早く入った車も実際に入った日', r.early === '2026-09-02', r);
  ok('🔴 印が無い昔のカードは入庫日で数える', r.old === '2026-09-01', r);
  ok('🔴🔴 まだ入庫していなければ**起点を出さない**（日数を出さない）', r.yet === null, r);
  ok('日付が何も無ければ null', r.none === null, r);
}

console.log('\n── ④ カードのホバー＝未入庫は「未入庫」と言い切る ──');
const hoverOf = async (card) => {
  await p.evaluate((x) => {
    state.cards = [Object.assign({
      id:'cH', resNo:'R-H', customer:'預かり 太郎', kana:'アズカリタロウ', tel:'090-2222-3333',
      car:'アクア', plate:'野田 500 あ 3-3', boardId:'default', division:'div1',
      workType:'shaken', workTypes:['shaken'], dropType:'drop', repeat:'repeat',
      log:[], maint:{}, office:{}, coverCall:{done:false,at:'',staff:''}
    }, x)];
    showView('course1');
  }, card);
  await p.waitForTimeout(550);
  /* ⚠ 同じ id のカードを続けて見る時は、いったん閉じないと前の中身が残る
     （card-hover.js は「同じカード上の移動は無視」するため）。 */
  await p.evaluate(() => { document.dispatchEvent(new Event('scroll', { bubbles: true })); });
  await p.waitForTimeout(200);
  /* ホバーは本物のマウス操作で出す（中身は #pit-hovercard に入る） */
  await p.evaluate(() => {
    const el = document.querySelector('.pit-card.pcm[data-card-id="cH"]');
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mouseover', { clientX:r.x+8, clientY:r.y+8, bubbles:true }));
    el.dispatchEvent(new MouseEvent('mousemove', { clientX:r.x+8, clientY:r.y+8, bubbles:true }));
  });
  await p.waitForTimeout(350);
  return p.evaluate(() => {
    const el = document.querySelector('#pit-hovercard');
    const box = el ? el.querySelector('.s-hold') : null;
    return { num: box ? (box.querySelector('.ph-stat-num') || {}).textContent.replace(/\s/g,'') : null,
             sub: box ? (box.querySelector('.ph-stat-sub') || {}).textContent.replace(/\s/g,'') : null,
             has: !!box };
  });
};
{
  const late = await hoverOf({ status:'work', reserveDate: iso(-6), actualInAt: iso(-2) });
  ok('🔴🔴 遅れて入った車は「3日目」（予定からの7日目にしない）', late.num === '3日目', late);
  ok('起点も実入庫日で出る', (late.sub||'').indexOf('〜') >= 0, late);

  const old = await hoverOf({ status:'work', reserveDate: iso(-2) });
  ok('🔴 印が無い昔のカードは今までどおり（3日目）', old.num === '3日目', old);

  const same = await hoverOf({ status:'work', reserveDate: iso(0), actualInAt: iso(0) });
  ok('今日入った車は1日目', same.num === '1日目', same);

  /* 🔴 まだ入庫していないカード（未入庫の箱に落ちたもの）は「未入庫」と言い切る。
     ⚠ ボードには出ないので、ここは出す言葉そのものを見る（数え損ねと区別が付くこと）。 */
  const src = fs.readFileSync('js/card-hover.js', 'utf8');
  ok('🔴 起点が無い時は「—日目」ではなく **未入庫** と出す', /'未入庫'/.test(src), '');
  ok('その時は「入庫予定 ◯/◯」を添える（いつ来る予定かは残す）', /入庫予定 /.test(src), '');
}

console.log('\n── ⑤⑥ ダッシュボードの台数（今日は実際・先は見込み） ──');
{
  const r = await p.evaluate((d) => {
    const mk = (o) => Object.assign({
      id:o.id, resNo:'R-'+o.id, customer:'テ ス ト', kana:'テスト', tel:'090-0000-0000',
      car:'アクア', plate:'野田 500 あ 1-1', boardId:'default', division:'div1',
      workType:'general', dropType:'drop', repeat:'repeat', estHoldDays:5,
      log:[], maint:{}, office:{}
    }, o);
    state.cards = [
      mk({ id:'h1', status:'work',     reserveDate:d.m6, actualInAt:d.m2 }),  /* 遅れて入った＝いる */
      mk({ id:'h2', status:'work',     reserveDate:d.m2 }),                   /* 昔のカード＝いる */
      mk({ id:'h3', status:'reserved', reserveDate:d.m3 }),                   /* 予定を過ぎて来ていない */
      mk({ id:'h4', status:'reserved', reserveDate:d.p2 }),                   /* これから来る予約 */
      mk({ id:'h5', status:'cancelled', noShow:true, reserveDate:d.m3 })      /* 未入庫の箱に落ちたもの */
    ];
    const on = (ds) => state.cards.filter(function(c){ return window._dashOn ? _dashOn(c, ds) : false; }).map(function(c){ return c.id; });
    return { today: dashOccupancy(d.t), todayIds: on(d.t),
             fut: dashOccupancy(d.p2), futIds: on(d.p2),
             team: window._dashHeldOnTeam ? _dashHeldOnTeam('default', d.t) : null };
  }, { t: iso(0), m6: iso(-6), m3: iso(-3), m2: iso(-2), p2: iso(2) });
  ok('🔴🔴 今日の「預かり中」は**実際にある車だけ**（2台）', r.today === 2, r);
  ok('🔴 来ていない予約は数えない', r.todayIds.indexOf('h3') < 0, r.todayIds);
  ok('🔴 未入庫の箱に落ちたものも数えない', r.todayIds.indexOf('h5') < 0, r.todayIds);
  ok('遅れて入った車も、昔のカードも数える', r.todayIds.indexOf('h1') >= 0 && r.todayIds.indexOf('h2') >= 0, r.todayIds);
  ok('🔴🔴 **先の見込みには、これから来る予約も入る**（最短入庫日が嘘にならない）',
     r.futIds.indexOf('h4') >= 0, r.futIds);
  ok('チーム別も同じ数え方（_dashOn 1本）', r.team === 2, r);
}

console.log('\n── ⑦ マイダッシュ・整備ダッシュも同じ起点 ──');
{
  const r = await p.evaluate((d) => {
    const mk = (o) => Object.assign({
      id:o.id, resNo:'R-'+o.id, customer:'テ ス ト', kana:'テスト', tel:'090-0000-0000',
      car:'アクア', plate:'野田 500 あ 1-1', boardId:'default', division:'div1',
      workType:'general', dropType:'drop', repeat:'repeat', log:[], maint:{}, office:{}
    }, o);
    state.settings = state.settings || {}; state.settings.longHoldDays = 7;
    state.cards = [
      mk({ id:'g1', status:'work', reserveDate:d.m20, actualInAt:d.m2 }),   /* 予定は20日前・実際は2日前＝長くない */
      mk({ id:'g2', status:'work', reserveDate:d.m20 })                     /* 昔のカード＝本当に20日いる */
    ];
    /* 整備ダッシュはマイダッシュに統合されたので、置き場だけ用意して描かせる */
    if (!document.getElementById('view-maintdash-body')){
      const d2 = document.createElement('div'); d2.id = 'view-maintdash-body'; document.body.appendChild(d2);
    }
    if (window.renderMaintDash) renderMaintDash();
    const rows = Array.from(document.querySelectorAll('.md-alert-row'));
    return {
      rows: rows.length,
      days: rows.map(function(e){ return (e.querySelector('.md-alert-days b') || {}).textContent; }),
      ids:  rows.map(function(e){ return (e.getAttribute('onclick') || '').replace(/[^g\d]/g, ''); }),
      from1: pitHoldFrom(state.cards[0]), from2: pitHoldFrom(state.cards[1])
    };
  }, { m20: iso(-20), m2: iso(-2) });
  ok('🔴 遅れて入った車の起点は実入庫日', r.from1 === iso(-2), r);
  ok('昔のカードは入庫日のまま', r.from2 === iso(-20), r);
  ok('🔴🔴 長期預かりに並ぶのは**本当に長くいる車だけ**（1台）', r.rows === 1, r);
  ok('🔴 その1台は昔のカードのほう（20日）', r.days[0] === '20', r);
  ok('🔴 予定が古いだけで実際は2日前に入った車は並ばない', (r.ids[0] || '').indexOf('g1') < 0, r);
}

console.log('\n── ⑧ 各画面が reserveDate を直接見ていない ──');
{
  const vw = fs.readFileSync('js/views.js', 'utf8');
  const ch = fs.readFileSync('js/card-hover.js', 'utf8');
  const md = fs.readFileSync('js/mydash.js', 'utf8');
  const mdd = fs.readFileSync('js/maintdash.js', 'utf8');
  const db = fs.readFileSync('js/dashboard.js', 'utf8');
  const mp = fs.readFileSync('js/maint-pit.js', 'utf8');
  ok('🔴 物差しは views.js の1本（pitInShop / pitHoldFrom）',
     /function pitInShop/.test(vw) && /function pitHoldFrom/.test(vw), '');
  ok('🔴 カードのホバーは物差しを借りている', /pitHoldFrom\(c\)/.test(ch), '');
  ok('🔴 マイダッシュは日数を1か所（holdDaysOf）から出している',
     /function holdDaysOf/.test(md) && !/daysAgo\(c\.reserveDate\)/.test(md), '');
  ok('🔴 整備ダッシュの長期アラートも借りている', /pitHoldFrom\(c\)/.test(mdd), '');
  ok('🔴 ダッシュボードの数え方は _dashOn 1本',
     /function _dashOn/.test(db) && !/c\.reserveDate > dStr/.test(db), '');
  ok('🔴 車両カレンダーのグレーも借りている', /pitHoldFrom\(c\)/.test(mp), '');
  const ix = fs.readFileSync('index.html', 'utf8');
  const ver = (ix.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('版が3か所そろっている',
     !!ver && ix.indexOf('<span class="ver">v' + ver + '</span>') >= 0
           && ix.indexOf('<div class="login-ver">v' + ver + '</div>') >= 0, ver);
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

console.log('\n' + (fail ? '⚠ ' : '🎉 ') + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail ? 1 : 0);
