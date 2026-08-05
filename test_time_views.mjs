/* PitFlow v1.34.0 ── 時間まわりの総点検（本物のアプリを丸ごと動かす）
   -------------------------------------------------------------------
   ◎考え方
     試験台ではなく **PitFlow 本体（index.html）をそのまま開き**、サンプルモードで
     カードを流し込んで、予約の日／週、返車の日／週、当日ビューを実際に描かせる。
     🔴 見るのは「**消えていないか**」＝入れたカードが、どの画面にも必ず出ること。
        ショートカット（朝一・AM・決まり次第…）だけでなく、
        受付時間の外（08:00 / 19:30）のカードも対象。
     ⚠ ここが落ちる時は「時間で枠に振り分けている所」が共通の物差し（pitTimeHour）を
        通していない。views 側で独自に startsWith('09') 等をやると必ず落ちる。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8950      ← 別ウィンドウ
     node test_time_views.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

/* サンプルモードで入る（本番の鍵は要らない） */
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:8950/index.html?demo=1');
await p.waitForFunction('window.state && Array.isArray(window.state.cards) && typeof window.showView === "function"', null, { timeout: 20000 });
await p.waitForTimeout(600);

/* ---- 試したい時間の一覧（ショートカット＋受付時間の外＋空） ---- */
const TIMES = ['09:00','09:30','12:30','16:00','08:00','19:30','AM','PM','朝一','お昼','夕方','決まり次第','レッカー','鍵ポスト','未定',''];

/* 同じ日に、上の時間ぶんのカードを1枚ずつ置く */
const DAY = await p.evaluate(times => {
  const d = new Date(); d.setDate(d.getDate() + 3);      /* 未来の日（休みでも表示は出る） */
  const ds = window.ymd(d);
  window.state.cards = times.map((t, i) => ({
    id: 'tt' + i, resNo: 'T' + i, customer: 'テスト' + i + ' 太郎', kana: 'テスト タロウ',
    car: 'アクア', maker: 'トヨタ', tel: '090-0000-0000',
    reserveDate: ds, reserveTime: t,
    returnDate: ds, returnTime: t, returnStage: 'returnWait',
    status: 'reserved', boardId: 'default', division: 'div1',
    workTypes: [], dropType: 'wait'
  }));
  window.state.reserveDate = d;
  window.state.returnDate = d;
  return ds;
}, TIMES);

/* その日を映して、画面に出ているカードIDを集める */
async function idsIn(sel){
  return p.evaluate(s => Array.from(document.querySelectorAll(s))
    .map(e => e.getAttribute('data-card-id')).filter(Boolean), sel);
}
async function show(view, range, key){
  await p.evaluate(([v, r, k]) => {
    if (r) window.state[k] = r;
    window.showView(v);
  }, [view, range, key]);
  await p.waitForTimeout(350);
}

const N = TIMES.length;
const label = i => TIMES[i] === '' ? '（空）' : TIMES[i];
function missing(ids){
  const set = new Set(ids);
  return TIMES.map((t, i) => set.has('tt' + i) ? null : label(i)).filter(Boolean);
}

console.log('\n── ① 予約：日ビュー ──');
await show('reserve', 'day', 'reserveRange');
{
  const ids = await idsIn('#reserve-day-list [data-card-id]');
  const miss = missing(ids);
  ok('16件ぜんぶ出ている（1件も消えていない）', miss.length === 0, { 出ていない: miss, 出た数: ids.length });
  ok('「時刻未定」の枠がある', (await p.locator('#reserve-day-list .reserve-slot-time', { hasText: '時刻未定' }).count()) > 0);
}

console.log('\n── ② 予約：週ビュー（今回の指摘そのもの） ──');
await show('reserve', 'week', 'reserveRange');
{
  const ids = await idsIn('#reserve-week [data-card-id]');
  const miss = missing(ids);
  ok('16件ぜんぶ出ている（1件も消えていない）', miss.length === 0, { 出ていない: miss, 出た数: ids.length });
  ok('「時刻未定」の行がある', (await p.locator('#reserve-week .rwk-tbd-h').count()) > 0);
  /* どの行に入ったか＝行の見出しとカードの並びで確かめる */
  const rows = await p.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('#reserve-week .reserve-week-cell'));
    const out = []; let cur = null;
    cells.forEach(c => {
      if (c.classList.contains('reserve-week-time')) { cur = { h: c.textContent.trim(), ids: [] }; out.push(cur); }
      else if (cur) Array.from(c.querySelectorAll('[data-card-id]')).forEach(e => cur.ids.push(e.getAttribute('data-card-id')));
    });
    return out.filter(r => r.ids.length);
  });
  const rowOf = id => (rows.find(r => r.ids.indexOf(id) >= 0) || {}).h;
  const at = t => rowOf('tt' + TIMES.indexOf(t));
  ok('朝一 は 9時の行',     at('朝一') === '09:00', at('朝一'));
  ok('AM は 9時の行',       at('AM') === '09:00', at('AM'));
  ok('PM は 13時の行',      at('PM') === '13:00', at('PM'));
  ok('お昼 は 12時の行',    at('お昼') === '12:00', at('お昼'));
  ok('夕方 は 16時の行',    at('夕方') === '16:00', at('夕方'));
  ok('08:00 は 9時の行へ寄る（消えない）',  at('08:00') === '09:00', at('08:00'));
  ok('19:30 は 18時の行へ寄る（消えない）', at('19:30') === '18:00', at('19:30'));
  ok('決まり次第 は 時刻未定の行', at('決まり次第') === '時刻未定', at('決まり次第'));
  ok('未定 は 時刻未定の行',       at('未定') === '時刻未定', at('未定'));
  ok('空 も 時刻未定の行（消えない）', at('') === '時刻未定', at(''));
  /* 行と違う時刻のカードには小さく時刻が出る */
  const chips = await p.evaluate(() => Array.from(document.querySelectorAll('#reserve-week .rwk-t')).map(e => e.textContent));
  ok('行とぴったり同じでない時刻には印が出る', chips.indexOf('朝一') >= 0 && chips.indexOf('09:30') >= 0, chips);
  ok('行とぴったり同じ（09:00）には印を出さない',
     (await p.evaluate(() => Array.from(document.querySelectorAll('#reserve-week .rwk-card'))
        .filter(e => e.querySelector('.rwk-t') && e.querySelector('.rwk-t').textContent === '09:00').length)) === 0);
}

console.log('\n── ③ 返車：日ビュー／週ビュー ──');
await show('return', 'day', 'returnRange');
{
  const ids = await idsIn('#return-day-list [data-card-id]');
  ok('日ビュー：16件ぜんぶ出ている', missing(ids).length === 0, { 出ていない: missing(ids) });
}
await show('return', 'week', 'returnRange');
{
  const ids = await idsIn('#return-week [data-card-id]');
  ok('週ビュー：16件ぜんぶ出ている', missing(ids).length === 0, { 出ていない: missing(ids) });
  ok('週ビューに「時刻未定」の行がある', (await p.locator('#return-week .rwk-tbd-h').count()) > 0);
}

console.log('\n── ④ 当日ビュー（休憩バーで区切る所） ──');
await p.evaluate(() => {
  window._todayOffset = 0;
  const t = window.ymd(new Date());
  window.state.cards.forEach(c => { c.reserveDate = t; c.returnDate = t; });
});
await show('today', null, null);
{
  /* ⚠ 当日ビューの行には data-card-id が無く、id は onclick の中にある。
     ⚠ 入庫と返車は左右で行数をそろえて組むので、**列ごとに**見る。 */
  const cols = await p.evaluate(() => Array.from(document.querySelectorAll('.today-cols .today-col'))
    .map(col => Array.from(col.querySelectorAll('.today-col-body .today-row'))
      .map(r => { const m = /pitTodayTap\('([^']+)'/.exec(r.getAttribute('onclick') || ''); return m ? m[1] : null; })
      .filter(Boolean)));
  const idx = id => +id.slice(2);
  const mins = await p.evaluate(ts => ts.map(t => window.pitTimeMin(t)), TIMES);
  ['入庫', '返車'].forEach((name, ci) => {
    const seen = (cols[ci] || []).filter(id => /^tt\d+$/.test(id));
    const miss = TIMES.map((t, i) => seen.indexOf('tt' + i) >= 0 ? null : label(i)).filter(Boolean);
    ok(name + 'の列に16件ぜんぶ出ている（1件も消えていない）', miss.length === 0,
       { 出ていない: miss, 出た数: seen.length });
    let bad = null;
    for (let i = 1; i < seen.length; i++){
      if (mins[idx(seen[i])] < mins[idx(seen[i-1])]) { bad = [label(idx(seen[i-1])), label(idx(seen[i]))]; break; }
    }
    ok(name + '：時刻の若い順→不明系→空 の順に並んでいる', bad === null,
       { 逆転: bad, 並び: seen.map(id => label(idx(id))) });
  });
}

console.log('\n── ⑤ 画面のエラー ──');
ok('JSエラー0', errs.length === 0, errs.slice(0, 5));

await p.screenshot({ path: 'shot_time_views.png', fullPage: false });
console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
