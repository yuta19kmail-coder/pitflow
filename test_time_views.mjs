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
await p.goto('http://127.0.0.1:8950/index.html?demo=1&nonews=1');
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
  /* 🔴 v1.70.0 枠は「いちばん遅くなり得る時刻」で決まる（ゆうた確定） */
  ok('朝一 は 9時の行',     at('朝一') === '09:00', at('朝一'));
  /* 🔴 v1.105.0（ゆうた変更）AM の終わりを 11:59 にしたので **11時の行**（12時台に被せない） */
  ok('🔴 AM は 11時の行',   at('AM') === '11:00', at('AM'));
  ok('PM は 18時の行',      at('PM') === '18:00', at('PM'));
  ok('お昼 は 13時の行',    at('お昼') === '13:00', at('お昼'));
  ok('夕方 は 18時の行',    at('夕方') === '18:00', at('夕方'));
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

/* 🔴 v1.166.0（ゆうた報告「当日ビューの『決まり次第』が見切れる（MHSも）」）
   時間の列は 62px 固定。5文字の言葉は 15px だと 76px 必要で、
   **担当バッジの下に潜って右が隠れていた**。**長い言葉は2段に折って全部見せる。**
   ⚠ 折るかどうかも切り方も pit-share.js の `pitTimeParts` 1本（表に書いた切り方だけ）。 */
console.log('\n── ⑤ 当日ビュー：長い言葉は2段（見切れない） ──');
{
  const cells = await p.evaluate(() => {
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const t = ymd(new Date());
    const mk = (id, tm) => ({ id, customer: '時間 太郎', kana: 'ジカン', car: 'ノート', boardId: 'default',
      workType: 'general', dropType: 'drop', status: 'reserved', reserveDate: t, reserveTime: tm,
      division: 'div1', frontStaff: '蓮沼 一郎', log: [] });
    state.cards = [mk('w1','決まり次第'), mk('w2','勝手に取る'), mk('w3','レッカー'),
                   mk('w4','鍵ポスト'), mk('w5','09:00'), mk('w6','09:00-10:00'), mk('w7','未定')];
    window._todayOffset = 0; showView('today'); renderToday();
    return Array.from(document.querySelectorAll('#view-today-body .today-row')).map(r => {
      const e = r.querySelector('.tr-time');
      return { txt: e.textContent.trim(), cls: e.className,
               lines: Array.from(e.querySelectorAll('.tt-l')).map(x => x.textContent),
               sep: e.querySelectorAll('.tt-sep').length,
               over: e.scrollWidth > e.clientWidth + 1,
               tall: e.scrollHeight > Math.floor(r.getBoundingClientRect().height) };
    });
  });
  const by = t => cells.find(c => c.txt.replace(/\s/g,'') === t.replace(/\s/g,''));
  ok('🔴 どの時間の書き方でも横にはみ出していない（右が隠れない）',
     cells.every(c => !c.over), cells.filter(c => c.over));
  ok('🔴 行の高さからもはみ出していない', cells.every(c => !c.tall), cells.filter(c => c.tall));
  {
    const c = by('決まり次第');
    ok('🔴 「決まり次第」は2段（決まり／次第）',
       !!c && JSON.stringify(c.lines) === JSON.stringify(['決まり','次第']), c);
    ok('🔴 is-word2 が付く（時間帯の is-range とは別もの）',
       !!c && /is-word2/.test(c.cls) && !/is-range/.test(c.cls), c && c.cls);
    ok('🔴 2つ目の言葉を小さい灰色にしていない（tt-sep は付けない）', !!c && c.sep === 0, c && c.sep);
  }
  {
    const c = by('勝手に取る');
    ok('🔴 「勝手に取る」も2段（勝手に／取る）',
       !!c && JSON.stringify(c.lines) === JSON.stringify(['勝手に','取る']), c);
  }
  {
    /* 表に切り方を書いていない言葉は**切らない**（今までどおり） */
    const a = by('レッカー'), b2 = by('鍵ポスト'), u = by('未定');
    ok('🔴 表に切り方が無い言葉は折らない（レッカー・鍵ポスト・未定）',
       [a,b2,u].every(c => c && !/is-word2|is-range/.test(c.cls)), [a,b2,u].map(c => c && c.cls));
  }
  {
    const c = by('09:00〜10:00');
    ok('時間帯は今までどおり3段（〜は小さい灰色のまま）',
       !!c && /is-range/.test(c.cls) && c.lines.length === 3 && c.sep === 1, c);
    const one = by('09:00');
    ok('ふつうの時刻は1行のまま', !!one && !/is-word2|is-range/.test(one.cls), one && one.cls);
  }
  /* 🧭 切り方を画面に書いていないか（表が本物） */
  const src = await p.evaluate(async () => {
    const strip = x => x.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const g = async u => strip(await (await fetch(u + '?t=' + Date.now())).text());
    return { td: await g('js/today.js'), sp: await g('js/pit-share.js') };
  });
  ok('🔴 切り方（決まり／次第）を当日ビューに書いていない', !/'決まり'|'次第'/.test(src.td), '');
  ok('🔴 切り方は pit-share.js の表にある', /lines:\s*\['決まり',\s*'次第'\]/.test(src.sp), '');
}

console.log('\n── ⑥ 画面のエラー ──');
ok('JSエラー0', errs.length === 0, errs.slice(0, 5));

await p.screenshot({ path: 'shot_time_views.png', fullPage: false });
console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
