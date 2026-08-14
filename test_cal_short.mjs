/* PitFlow v1.90.0 ── 休み と 短縮営業 が、どのカレンダーでも分かる
   -------------------------------------------------------------------
   ◎ゆうた指示（2026-08-13）
     「営業日短縮or休み時の 当日／予約／返車 の各カレンダー・空きカレンダーのホバー表示・
       新規予約時のカレンダー表示 に表示する」
     モック確認のあと：「①帯でいいが**入庫返車は関係ないからぶち抜き1本**にしてほしい／
                        ②〜④OK／**週ビューだけ短縮系は塗りはなしで表示文だけ**」

   ◎直す前の状態（ここが穴だった）
     ・当日ビュー（Todayボード）＝ **PitCal を一切見ていない**。休みも短縮も何も出ない
     ・空きカレンダー／新規予約の右パネル＝ **「休みか、そうでないか」の2択**しか見ておらず、
       午前休みの日が「朝9時から普通に開いている日」と全く同じ「○ 3/5」で出ていた
     ・予約・返車＝札は出ていたが **短縮が灰色**＝赤い「定休」の隣で読み飛ばされる

   ◎ここで見張ること
     🔴 色の物差しが PitCal.tone 1本（休み=closed／短縮=short／特別営業=open）
     🔴 当日ビュー＝ヘッダの札＋**2列ぶちぬきの帯が1本だけ**（入庫側・返車側に分かれていない）
     🔴 予約・返車＝短縮の札が **オレンジ（.cal-chip.short）**
     🔴 **週ビューは札だけ＝マスを塗らない**／月ビューは塗る
     🔴 空きカレンダー＝短縮の日に ◐ と、ホバーに「受付 13:00〜17:00」
     🔴 台数（3/5）と ○△満 の判定には**さわっていない**

   ◎使い方
     python3 -m http.server 8987      ← 別ウィンドウ
     node test_cal_short.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8987;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.PitCal && window.renderToday', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(700);

/* にせの営業日カレンダーを流し込む（MHSが配ってくる形そのまま）。
   当日＝午前休み／翌日＝休業／翌々日＝早締め／その次＝特別営業 にして、4色ぜんぶ見る。 */
const days = await p.evaluate(() => {
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const at = n => { const d = new Date(t); d.setDate(d.getDate() + n); return ymd(d); };
  const d0 = at(0), d1 = at(1), d2 = at(2), d3 = at(3), d4 = at(4);
  const cal = {
    ver: 1, from: at(-40), to: at(300), biz: { s: '09:00', e: '17:00' }, dow: [],
    days: {}
  };
  cal.days[d0] = { h: 'am', l: '棚卸し' };      // 午前休み
  cal.days[d1] = { c: 1, l: 'お盆休み' };        // 休業
  cal.days[d2] = { h: 'end', e: '15:00' };       // 早締め
  cal.days[d3] = { o: 1, l: '特別営業' };        // 特別営業
  window.__PitCalTest(cal);
  return { d0, d1, d2, d3, d4 };
}).catch(() => null);

/* テスト用の差し込み口が無ければ、内部を直接差し替える */
if (!days) { console.log('  （差し込み口が無いので中止）'); await b.close(); process.exit(1); }

console.log('\n── 🎨 色の物差しが PitCal.tone 1本 ──');
{
  const t = await p.evaluate(d => ({
    am:   PitCal.tone(d.d0), closed: PitCal.tone(d.d1),
    end:  PitCal.tone(d.d2), open:   PitCal.tone(d.d3), normal: PitCal.tone(d.d4)
  }), days);
  ok('午前休み → short', t.am === 'short', t);
  ok('休業日 → closed', t.closed === 'closed', t);
  ok('早締め → short', t.end === 'short', t);
  ok('特別営業 → open', t.open === 'open', t);
  ok('ふつうの日 → 空', t.normal === '', t);
  const h = await p.evaluate(d => ({ am: PitCal.hoursText(d.d0), end: PitCal.hoursText(d.d2), cl: PitCal.hoursText(d.d1) }), days);
  ok('🔴 午前休みの受付は 13:00〜17:00', h.am === '13:00〜17:00', h);
  ok('🔴 早締めの受付は 09:00〜15:00', h.end === '09:00〜15:00', h);
  ok('休業日は受付時間を出さない', h.cl === '', h);
}

console.log('\n── 📅 当日ビュー（Todayボード）＝いちばん抜けていたところ ──');
{
  await p.evaluate(() => { window._todayOffset = 0; showView('today'); });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const w = document.getElementById('view-today-body');
    const bars = [].slice.call(w.querySelectorAll('.today-calbar'));
    const cols = w.querySelector('.today-cols');
    return {
      note: (w.querySelector('.cal-note') || {}).className || '',
      noteTxt: (w.querySelector('.cal-note') || {}).textContent || '',
      barN: bars.length,
      barCls: bars.map(x => x.className),
      barTxt: bars.map(x => x.textContent.replace(/\s+/g, ' ').trim()),
      /* 帯が2列の外（today-cols より前）に1本だけ置かれているか */
      barOutside: bars.every(x => !x.closest('.today-col')),
      barBefore: !!(cols && bars[0] && (bars[0].compareDocumentPosition(cols) & Node.DOCUMENT_POSITION_FOLLOWING)),
      colsCls: cols ? cols.className : ''
    };
  });
  ok('🔴 帯が出る', r.barN >= 1, r);
  ok('🔴 帯は「1本だけ」（入庫・返車で分かれていない）', r.barN === 1, r);
  ok('🔴 帯は2列の外に置かれている（ぶちぬき）', r.barOutside === true, r);
  ok('🔴 帯は2列より前にある', r.barBefore === true, r);
  ok('午前休みなのでオレンジ', /short/.test(r.barCls[0] || ''), r.barCls);
  ok('🔴 何時から受けられるかが書いてある', /13:00/.test(r.barTxt[0] || ''), r.barTxt);
  ok('日付の横にも札が出る', /cal-note/.test(r.note) && /short/.test(r.note), r);
  ok('札に「午前休み」と出る', /午前休み/.test(r.noteTxt), r.noteTxt);
  ok('ふつうの日は列に色を敷かない', !/is-closed/.test(r.colsCls), r.colsCls);
}
{
  await p.evaluate(() => { todayShift(1); });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const w = document.getElementById('view-today-body');
    const bars = [].slice.call(w.querySelectorAll('.today-calbar'));
    return { n: bars.length, cls: (bars[0] || {}).className || '',
             txt: (bars[0] || {}).textContent || '',
             cols: (w.querySelector('.today-cols') || {}).className || '',
             rows: w.querySelectorAll('.today-row').length };
  });
  ok('🔴 休業日も帯は1本だけ', r.n === 1, r);
  ok('休業日は赤', /closed/.test(r.cls), r.cls);
  ok('「本日は休業日です」と出る', /休業日/.test(r.txt), r.txt);
  ok('休業日は列にうっすら色を敷く', /is-closed/.test(r.cols), r.cols);
  await p.evaluate(() => { todayShift(0); });
  await p.waitForTimeout(300);
}

console.log('\n── 🗓 予約カレンダー（当日／週／月） ──');
{
  await p.evaluate(d => { showView('reserve'); state.reserveDate = new Date(d.d0 + 'T00:00:00'); state.reserveRange = 'day'; renderReserve(); }, days);
  await p.waitForTimeout(400);
  const dayNote = await p.evaluate(() => {
    const e = document.querySelector('#view-reserve .cal-note');
    return e ? { cls: e.className, txt: e.textContent } : null;
  });
  ok('当日タブ：札がオレンジ', !!dayNote && /short/.test(dayNote.cls), dayNote);
  ok('当日タブ：受付時間が短縮ぶんになっている',
     await p.evaluate(() => /13:00/.test(document.getElementById('reserve-day-list').textContent)), '');

  /* 週ビュー＝札だけ・塗らない */
  await p.evaluate(() => { state.reserveRange = 'week'; renderReserve(); });
  await p.waitForTimeout(400);
  const wk = await p.evaluate(d => {
    const w = document.getElementById('reserve-week');
    const heads = [].slice.call(w.querySelectorAll('.reserve-week-head'));
    const short = heads.find(h => /午前休み|締/.test(h.textContent));
    const closed = heads.find(h => /お盆休み/.test(h.textContent));
    return {
      shortChip: short ? (short.querySelector('.cal-chip') || {}).className || '' : 'なし',
      shortHead: short ? short.className : 'なし',
      closedHead: closed ? closed.className : 'なし'
    };
  }, days);
  ok('週ビュー：短縮の札がオレンジ', /short/.test(wk.shortChip), wk);
  ok('🔴 週ビュー：短縮の日はマスを塗らない（ゆうた指定）',
     !/calshort/.test(wk.shortHead) && !/\bclosed\b/.test(wk.shortHead), wk);
  ok('週ビュー：休みは今までどおり塗る', /closed/.test(wk.closedHead), wk);

  /* 月ビュー＝縦の一覧（rml）。⚠ グリッドではない（2ヶ月ビューがグリッド）。 */
  await p.evaluate(() => { state.reserveRange = 'month'; renderReserve(); });
  await p.waitForTimeout(500);
  const mo = await p.evaluate(() => {
    const rows = [].slice.call(document.querySelectorAll('#reserve-month .rml-row'));
    const short = rows.find(r => /午前休み/.test(r.textContent));
    const closed = rows.find(r => /お盆休み/.test(r.textContent));
    return {
      shortRow: short ? short.className : 'なし',
      shortTag: short ? (short.querySelector('.rml-cal') || {}).className || '' : 'なし',
      closedRow: closed ? closed.className : 'なし',
      closedTag: closed ? (closed.querySelector('.rml-cal') || {}).className || '' : 'なし'
    };
  });
  ok('🔴 月ビュー：短縮の日は行をうっすら塗る', /calshort/.test(mo.shortRow), mo);
  ok('🔴 月ビュー：短縮の札がオレンジ（灰色固定をやめた）', /\bshort\b/.test(mo.shortTag), mo);
  ok('月ビュー：休みは赤のまま', /closed/.test(mo.closedRow) && /closed/.test(mo.closedTag), mo);

  /* 2ヶ月ビュー＝グリッド。こちらも塗る */
  await p.evaluate(() => { state.reserveRange = '2month'; renderReserve(); });
  await p.waitForTimeout(500);
  const m2 = await p.evaluate(() => {
    const cells = [].slice.call(document.querySelectorAll('#reserve-2month .reserve-month-cell'));
    const short = cells.find(c => /午前休み/.test(c.textContent));
    return short ? { cell: short.className, chip: (short.querySelector('.cal-chip') || {}).className || '' } : null;
  });
  ok('🔴 2ヶ月ビュー：短縮の日はマスを塗る', !!m2 && /calshort/.test(m2.cell), m2);
  ok('2ヶ月ビュー：札もオレンジ', !!m2 && /short/.test(m2.chip), m2);
}

console.log('\n── 🚗 返車カレンダー（予約と同じ見た目にそろっているか） ──');
{
  await p.evaluate(d => { showView('return'); state.returnDate = new Date(d.d0 + 'T00:00:00'); state.returnRange = 'day'; renderReturn(); }, days);
  await p.waitForTimeout(400);
  const n = await p.evaluate(() => {
    const e = document.querySelector('#view-return .cal-note');
    return e ? { cls: e.className, txt: e.textContent } : null;
  });
  ok('当日タブ：札がオレンジ', !!n && /short/.test(n.cls), n);

  await p.evaluate(() => { state.returnRange = 'week'; renderReturn(); });
  await p.waitForTimeout(400);
  const wk = await p.evaluate(() => {
    const heads = [].slice.call(document.querySelectorAll('#return-week .reserve-week-head'));
    const short = heads.find(h => /午前休み|締/.test(h.textContent));
    return short ? { chip: (short.querySelector('.cal-chip') || {}).className || '', head: short.className } : null;
  });
  ok('週ビュー：札がオレンジ', !!wk && /short/.test(wk.chip), wk);
  ok('🔴 週ビュー：短縮でマスを塗らない', !!wk && !/calshort/.test(wk.head), wk);

  await p.evaluate(() => { state.returnRange = 'month'; renderReturn(); });
  await p.waitForTimeout(500);
  const mo = await p.evaluate(() => {
    const rows = [].slice.call(document.querySelectorAll('#return-month .rml-row'));
    const short = rows.find(r => /午前休み/.test(r.textContent));
    return short ? { row: short.className, tag: (short.querySelector('.rml-cal') || {}).className || '' } : null;
  });
  ok('🔴 月ビュー：短縮の日は行をうっすら塗る', !!mo && /calshort/.test(mo.row), mo);
  ok('月ビュー：札がオレンジ', !!mo && /\bshort\b/.test(mo.tag), mo);
}

console.log('\n── 🔎 空きカレンダー（＝新規予約の右パネル・同じ部品） ──');
{
  await p.evaluate(() => { showView('availcal'); });
  await p.waitForTimeout(900);
  const r = await p.evaluate(d => {
    const cell = q => document.querySelector('.cfs-day[data-ds="' + q + '"]');
    const pick = q => { const e = cell(q); return e ? { cls: e.className, tip: e.getAttribute('title') || '',
                        mk: !!e.querySelector('.cfs-mk-short'), num: (e.querySelector('span:not(.cfs-mk-short)') || {}).textContent || '' } : null; };
    return { am: pick(d.d0), cl: pick(d.d1), end: pick(d.d2), normal: pick(d.d4),
             hint: (document.querySelector('.cfs-hint') || {}).textContent || '' };
  }, days);
  ok('🔴 午前休みの日に ◐ が出る', !!r.am && r.am.mk === true, r.am);
  ok('🔴 早締めの日にも ◐ が出る', !!r.end && r.end.mk === true, r.end);
  ok('ふつうの日には ◐ を出さない', !!r.normal && r.normal.mk === false, r.normal);
  ok('休業日には ◐ を出さない（休みは「休」で分かる）', !!r.cl && r.cl.mk === false, r.cl);
  ok('短縮の日に印のクラスが付く', !!r.am && /cfs-short/.test(r.am.cls), r.am);

  ok('🔴 ホバーに「午前休み」が出る', !!r.am && /午前休み/.test(r.am.tip), r.am && r.am.tip);
  ok('🔴 ホバーに受付時間（13:00〜17:00）が出る', !!r.am && /13:00〜17:00/.test(r.am.tip), r.am && r.am.tip);
  ok('🔴 早締めのホバーは 09:00〜15:00', !!r.end && /09:00〜15:00/.test(r.end.tip), r.end && r.end.tip);
  ok('休業日のホバーは「開いていません」', !!r.cl && /開いていません/.test(r.cl.tip), r.cl && r.cl.tip);
  ok('ふつうの日のホバーにも営業時間が出る', !!r.normal && /09:00〜17:00/.test(r.normal.tip), r.normal && r.normal.tip);
  ok('ホバーに空き台数が残っている', !!r.normal && /空き .+ 台/.test(r.normal.tip), r.normal && r.normal.tip);
  ok('凡例に ◐ の説明がある', /◐/.test(r.hint), r.hint);

  /* 🔴 台数と ○△満 は変えていない */
  ok('🔴 短縮の日でも台数表示は今までどおり（枠を減らしていない）',
     !!r.am && /^\d+\/\d+$/.test(r.am.num.trim()), r.am && r.am.num);
  ok('🔴 短縮の日は「休」扱いにしていない', !!r.am && !/\bclosed\b/.test(r.am.cls), r.am && r.am.cls);
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  for (const v of ['dashboard', 'reserve', 'return', 'today', 'availcal', 'mydash']) {
    await p.evaluate(x => showView(x), v);
    await p.waitForTimeout(220);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  const html = fs.readFileSync('index.html', 'utf8');
  const m = /<meta name="app-version" content="([\d.]+)">/.exec(html);
  const num = v => v.split('.').reduce((a, n) => a * 1000 + (+n || 0), 0);
  ok('版が v1.90.0 以降', !!m && num(m[1]) >= num('1.90.0'), m && m[1]);
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
