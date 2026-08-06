/* PitFlow v1.59.0 ── 日数の数え方（「◯日目」と「預かり日数」を分ける）
   -------------------------------------------------------------------
   ◎ゆうた指定
     「**基本的には入れた日を1日目と定めていい。ただし当日返車だと預かり日数としては0日と
       カウントしたい（朝預かって夕方返せば、実質 日をまたいで使わないというカウントになるため）**」
   ◎考え方＝**ズレではなく、別々の2つの数字を同じ「日数」と呼んでいた。**
     ホテルの「3泊4日」と同じ。**日目 ＝ 泊数 ＋ 1**。
       ・◯日目（pitDayNo / pitDayNoMs）… 序数。**入れた日が1日目**
       ・預かり日数（pitHoldDays）      … 泊数。**日をまたいだ数**。当日返しは 0
   ◎ゆうたの選択
     ・当日返しの表示は「**当日返し**」（0日とは書かない）
     ・**代車は今までどおり「使った日数」**（両端含む）＝わざと数え方が違う
     ・「◯日目」は**カレンダー基準に統一**
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8982      ← 別ウィンドウ
     node test_hold_days.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8982;
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
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1`);
await p.waitForFunction('window.state && window.pitHoldDays && window.pitDayNo && window.pitDayNoMs', null, { timeout: 25000 });
await p.waitForTimeout(800);

const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); const q = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); };

console.log('\n── 🛏 預かり日数＝泊数（日をまたいだ数）。当日返しは 0 ──');
{
  const r = await p.evaluate(() => ({
    same:  pitHoldDays('2026-08-06', '2026-08-06'),
    one:   pitHoldDays('2026-08-06', '2026-08-07'),
    five:  pitHoldDays('2026-08-01', '2026-08-06'),
    month: pitHoldDays('2026-07-30', '2026-08-02'),
    none:  pitHoldDays('2026-08-06', ''),
    bad:   pitHoldDays('へんな文字', '2026-08-06')
  }));
  ok('🔴 当日返し＝0日', r.same === 0, r);
  ok('翌日返し＝1日', r.one === 1, r);
  ok('8/1入庫→8/6返車＝5日', r.five === 5, r);
  ok('月をまたいでも数えられる（7/30→8/2＝3日）', r.month === 3, r);
  ok('片方が空なら null（勝手に0にしない）', r.none === null, r);
  ok('おかしな文字でも落ちない', r.bad === null, r);

  const t = await p.evaluate(() => ({
    same: pitHoldDaysText('2026-08-06', '2026-08-06'),
    one:  pitHoldDaysText('2026-08-06', '2026-08-07'),
    five: pitHoldDaysText('2026-08-01', '2026-08-06'),
    none: pitHoldDaysText('', '2026-08-06')
  }));
  ok('🔴 0日は「当日返し」と出す（0日とは書かない）', t.same === '当日返し', t);
  ok('1日以上は「◯日」', t.one === '1日' && t.five === '5日', t);
  ok('分からない時は null', t.none === null, t);
}

console.log('\n── 📅 ◯日目＝入れた日が1日目（カレンダー基準） ──');
{
  const r = await p.evaluate(([today, yst, ago5, tmr]) => ({
    today: pitDayNo(today), yst: pitDayNo(yst), ago5: pitDayNo(ago5), future: pitDayNo(tmr), none: pitDayNo('')
  }), [iso(0), iso(-1), iso(-5), iso(1)]);
  ok('🔴 今日入れたら1日目', r.today === 1, r);
  ok('昨日入れたら2日目', r.yst === 2, r);
  ok('5日前なら6日目', r.ago5 === 6, r);
  ok('未来の日付は0日目以下（まだ入っていない）', r.future === 0, r);
  ok('空なら null', r.none === null, r);

  /* 🔴 時刻を見ない＝夕方入庫でも翌日は2日目（v1.58.0 までの「経過24時間」をやめた） */
  const ms = await p.evaluate(() => {
    const D = 86400000;
    const now = new Date();
    const todayLate = new Date(now); todayLate.setHours(23, 30, 0, 0);
    const ystLate   = new Date(now); ystLate.setDate(ystLate.getDate() - 1); ystLate.setHours(23, 30, 0, 0);
    const ystEarly  = new Date(now); ystEarly.setDate(ystEarly.getDate() - 1); ystEarly.setHours(0, 10, 0, 0);
    return {
      todayLate: pitDayNoMs(todayLate.getTime()),
      ystLate:   pitDayNoMs(ystLate.getTime()),
      ystEarly:  pitDayNoMs(ystEarly.getTime()),
      ago5:      pitDayNoMs(Date.now() - 5 * D),
      none:      pitDayNoMs(null)
    };
  });
  ok('今日の23:30に入れても1日目', ms.todayLate === 1, ms);
  ok('🔴 昨日の23:30に入れたら2日目（24時間経っていなくても）', ms.ystLate === 2, ms);
  ok('昨日の0:10でも2日目（同じ日は同じ数字）', ms.ystEarly === 2, ms);
  ok('5日前は6日目', ms.ago5 === 6, ms);
  ok('null なら null', ms.none === null, ms);
}

console.log('\n── 🚗 代車は今までどおり「使った日数」（わざと数え方が違う） ──');
{
  const src = fs.readFileSync('js/card-hover.js', 'utf8');
  ok('代車は _periodDays（両端含む）のまま', /var ld = _periodDays\(lStart, lEnd\)/.test(src));
  ok('その理由がコードに書いてある', /代車は\*\*今までどおり「使った日数」/.test(src));
  ok('🔴 預かりは _periodDays を使っていない', !/var hd = _periodDays/.test(src));
  ok('預かりは pitHoldDays を通している', /pitHoldDaysText\(hStart, retF\)/.test(src) || /pitHoldDays\(hStart, retF\)/.test(src));
}

console.log('\n── 実績カードのホバーで「当日返し」と出る ──');
{
  const r = await p.evaluate(([today, ago3]) => {
    const mk = (id, inD, outD) => ({ id: id, resNo: 'R-' + id, status: 'returned', customer: '預かり 太郎', car: 'アクア',
      reserveDate: inD, returnDate: outD, returnDateFinal: outD, completedAt: outD, amountFinal: 50000, needLoaner: false, log: [] });
    state.cards = state.cards.filter(x => x.id !== 'HD1' && x.id !== 'HD2');
    state.cards.push(mk('HD1', today, today));      /* 当日返し */
    state.cards.push(mk('HD2', ago3, today));       /* 3泊 */
    return {
      same: pitHoldDaysText(today, today),
      three: pitHoldDaysText(ago3, today)
    };
  }, [iso(0), iso(-3)]);
  ok('当日入庫・当日返車 → 「当日返し」', r.same === '当日返し', r);
  ok('3日前入庫・今日返車 → 「3日」', r.three === '3日', r);
}

console.log('\n── 🔗 元からある定義とつじつまが合っているか ──');
{
  /* ① 概算 預かり日数の入力欄は元から「当日仕上げは0」＝同じ思想 */
  const cd = fs.readFileSync('js/card-detail.js', 'utf8');
  ok('概算 預かり日数の案内は「当日仕上げは0」のまま', /当日仕上げは0/.test(cd));
  ok('🔴 代車ドラッグからの自動入力も泊数に直した（両端含むをやめた）',
     /pitHoldDays\(drag\.a, drag\.b\)/.test(cd) && !/c\.estHoldDays = Math\.round\(\(db - da\) \/ 86400000\) \+ 1;/.test(cd));

  /* ② ダッシュボードの占有＝入庫日＋預かり日数（泊数なら当日返しはその日だけ） */
  /* ⚠ サンプルに元から預かり中の車が居るので、**自分の1台ぶんの増減**で見る */
  const occ = await p.evaluate(([today, tmr]) => {
    state.cards = state.cards.filter(x => String(x.id).indexOf('OC') !== 0);
    const base = { today: dashOccupancy(today), tmr: dashOccupancy(tmr) };
    state.cards.push({ id: 'OC1', status: 'check', reserveDate: today, estHoldDays: 0, boardId: 'default', log: [] });
    const zero = { today: dashOccupancy(today), tmr: dashOccupancy(tmr) };
    state.cards = state.cards.filter(x => String(x.id).indexOf('OC') !== 0);
    state.cards.push({ id: 'OC2', status: 'check', reserveDate: today, estHoldDays: 1, boardId: 'default', log: [] });
    const one = { today: dashOccupancy(today), tmr: dashOccupancy(tmr) };
    state.cards = state.cards.filter(x => String(x.id).indexOf('OC') !== 0);
    return { base: base, zero: zero, one: one };
  }, [iso(0), iso(1)]);
  ok('🔴 預かり0日の車は、その日だけ駐車場を埋める',
     occ.zero.today === occ.base.today + 1, occ);
  ok('🔴 預かり0日なら翌日は埋めていない',
     occ.zero.tmr === occ.base.tmr, occ);
  ok('預かり1日なら翌日も埋めている（数え方の裏取り）',
     occ.one.today === occ.base.today + 1 && occ.one.tmr === occ.base.tmr + 1, occ);
}

console.log('\n── ソースの見張り（数え方が1か所に集まっているか） ──');
{
  const v = fs.readFileSync('js/views.js', 'utf8');
  ok('数え方は views.js に4つ揃っている',
     /function pitDayNo\(/.test(v) && /function pitDayNoMs\(/.test(v) && /function pitHoldDays\(/.test(v) && /function pitHoldDaysText\(/.test(v));
  ['js/card-view.js', 'js/outsource.js', 'js/reserve.js', 'js/card-hover.js'].forEach(function(f){
    const src = fs.readFileSync(f, 'utf8');
    ok(f + ' が pitDayNo 系を通している', /pitDayNoMs\(|pitDayNo\(/.test(src), f);
  });
  const ho = fs.readFileSync('js/outsource.js', 'utf8');
  const rv = fs.readFileSync('js/reserve.js', 'utf8');
  const cv = fs.readFileSync('js/card-view.js', 'utf8');
  ok('🔴 外注・予約ビュー・カード詳細の「経過24時間」をやめた（カレンダー基準に統一）',
     /pitDayNoMs\(/.test(ho) && /pitDayNoMs\(/.test(rv) && /pitDayNoMs\(/.test(cv));

  const ix = fs.readFileSync('index.html', 'utf8');
  const vs = [(ix.match(/app-version" content="([\d.]+)"/) || [])[1],
              (ix.match(/login-ver">v([\d.]+)</) || [])[1],
              (ix.match(/class="ver">v([\d.]+)</) || [])[1]];
  const _num = x => String(x||'').split('.').map(Number);
  const _ge = (a, bb) => { const x=_num(a), y=_num(bb); for (let i=0;i<3;i++){ if ((x[i]||0)!==(y[i]||0)) return (x[i]||0)>(y[i]||0); } return true; };
  ok('版が3か所そろっている', vs.every(Boolean) && new Set(vs).size === 1, vs);
  ok('版が v1.59.0 より下がっていない', _ge(vs[0], '1.59.0'), vs);
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
