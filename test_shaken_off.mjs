/* PitFlow v1.165.0 ── 車検の「行けない日」＝土日祝（陸運局休）と自社定休（MHS）
   ===================================================================
   ◎ゆうた指定（2026-08-21）
     「**車検履歴カレンダーに定休日（MHS）と土日の斜線表示**」
     ・分け方 …「**分ける**」＝土日祝（陸運局休）と自社定休を見分けられるように
     ・文字 ……「**自社の休みの時だけ出す**」（土日祝は見れば分かるので斜線だけ）

   ◎ここで見張ること
     🔴 「行けない日」の見分けは **pit-share.js の `pitShakenDayOff` 1本**
        ＝ 画面ごとに曜日を数えない／`PitCal` を呼び直さない
        ⚠ 直す前は card-view.js（車検の日を選ぶカレンダー）と shaken.js（車検予定）に
           **同じ判定が2つ**あり、同じ土曜を片方は「陸運局休」・片方は「休」と言っていた
     🔴 順番＝**祝日 → 日 → 土 → 自社定休**（重なった時にどちらを言うかが揺れない）
     🔴 履歴カレンダーの休みのマスに**斜線の印**が付く（土日祝と自社定休で別の印）
     🔴 理由の字は**自社の休みの時だけ**（土日祝には出さない）

   ◎使い方
     python3 -m http.server 8993      ← 別ウィンドウ
     node test_shaken_off.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8993;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitShakenDayOff && window.renderShakenLog', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

/* 休みの元は2つ（祝日の表・MHSの定休日カレンダー）。にせ物に差し替えて確かめる。
   ⚠ 本物は通信で届くので、届いていない日に走らせても同じ答えになるようにする。 */
await p.evaluate(() => {
  window.__keepH = window.Holidays;
  window.__keepC = window.PitCal;
  window.Holidays = { is: s => s === '2026-09-21', name: s => (s === '2026-09-21' ? '敬老の日' : null) };
  window.PitCal = {
    isClosed: s => ['2026-09-02', '2026-09-16', '2026-09-23'].indexOf(s) >= 0,
    label: s => (s === '2026-09-16' ? 'お盆休み' : (s === '2026-09-23' ? '' : '定休'))
  };
});

const off = iso => p.evaluate(s => pitShakenDayOff(s), iso);

console.log('\n── ① 土日＝陸運局が休み ──');
{
  const sat = await off('2026-09-05');   /* 土 */
  const sun = await off('2026-09-06');   /* 日 */
  ok('🔴 土曜は行けない日', sat.off === true && sat.kind === 'sat', sat);
  ok('🔴 日曜は行けない日', sun.off === true && sun.kind === 'sun', sun);
  ok('🔴 言葉は「陸運局休」（自社が休みなのではない）', sat.label === '陸運局休' && sun.label === '陸運局休', [sat.label, sun.label]);
  ok('狭い枠では「休」', sat.short === '休', sat.short);
}

console.log('\n── ② 祝日も陸運局が休み（名前も分かる） ──');
{
  const h = await off('2026-09-21');
  ok('🔴 祝日は行けない日', h.off === true && h.kind === 'holiday', h);
  ok('言葉は「祝・休」', h.label === '祝・休', h.label);
  ok('祝日の名前も分かる', h.holiName === '敬老の日', h.holiName);
}

console.log('\n── ③ 自社の定休（MHSの定休日カレンダー） ──');
{
  const w = await off('2026-09-02');     /* 水・定休 */
  ok('🔴 自社の定休も行けない日', w.off === true && w.kind === 'shop', w);
  ok('🔴 陸運局休とは別ものだと分かる', w.kind !== 'sat' && w.kind !== 'sun' && w.label !== '陸運局休', w);
  ok('狭い枠では「定休」', w.short === '定休', w.short);
}
{
  const o = await off('2026-09-16');     /* 水・お盆休み（MHSに理由が入っている） */
  ok('🔴 MHS に入っている理由がそのまま出る', o.label === 'お盆休み' && o.short === 'お盆休み', o);
}
{
  const n = await off('2026-09-23');     /* 水・理由なし */
  ok('理由が無ければ「自社定休」', n.label === '自社定休' && n.short === '定休', n);
}

console.log('\n── ④ ふつうの営業日／おかしな値 ──');
{
  const ok1 = await off('2026-09-03');   /* 木 */
  ok('ふつうの日は休みではない', ok1.off === false && ok1.kind === '', ok1);
  const e1 = await off('');
  const e2 = await off('ぐちゃぐちゃ');
  ok('空でも落ちない', e1.off === false, e1);
  ok('読めない日付でも落ちない', e2.off === false, e2);
}

console.log('\n── ⑤ 重なった時にどちらを言うかが決まっている ──');
{
  /* 祝日かつ自社定休（例：水曜の祝日）→ 祝日が勝つ＝陸運局が休みの方を先に言う */
  await p.evaluate(() => {
    window.Holidays = { is: s => s === '2026-09-09', name: () => '重なりの日' };
    window.PitCal = { isClosed: s => s === '2026-09-09', label: () => '臨時休業' };
  });
  const x = await off('2026-09-09');
  ok('🔴 祝日と自社定休が重なったら「祝・休」', x.kind === 'holiday' && x.label === '祝・休', x);
  /* 土曜かつ自社定休 → 土曜（陸運局休）が勝つ */
  await p.evaluate(() => {
    window.Holidays = { is: () => false, name: () => null };
    window.PitCal = { isClosed: s => s === '2026-09-05', label: () => '臨時休業' };
  });
  const y = await off('2026-09-05');
  ok('🔴 土曜と自社定休が重なったら「陸運局休」', y.kind === 'sat' && y.label === '陸運局休', y);
}

console.log('\n── ⑥ 車検履歴カレンダーに斜線が出る ──');
{
  const r = await p.evaluate(() => {
    /* 2026年9月を出す。祝日＝9/21、自社定休＝9/2（定休）・9/16（お盆休み） */
    window.Holidays = { is: s => s === '2026-09-21', name: () => '敬老の日' };
    window.PitCal = { isClosed: s => ['2026-09-02', '2026-09-16'].indexOf(s) >= 0,
                      label: s => (s === '2026-09-16' ? 'お盆休み' : '定休') };
    window._shakenLogM = new Date(2026, 8, 1);
    window._sklQuery = '';
    showView('shakenlog');
    renderShakenLog();
    const days = Array.from(document.querySelectorAll('#shakenlog-body .skl-day'));
    const grab = () => days.map(e => ({
      riku: e.classList.contains('skl-off-riku'),
      shop: e.classList.contains('skl-off-shop'),
      tag: (e.querySelector('.skl-offtag') || {}).textContent || '',
      holi: !!e.querySelector('.skl-d.holi'),
      title: e.getAttribute('title') || '',
      d: (e.querySelector('.skl-d') || {}).textContent || ''
    }));
    const all = grab();
    return {
      cells: all.length,
      riku: all.filter(x => x.riku).length,
      shop: all.filter(x => x.shop).length,
      tags: all.filter(x => x.tag).map(x => x.d + ':' + x.tag),
      rikuHasTag: all.filter(x => x.riku && x.tag).length,
      holiDays: all.filter(x => x.holi).map(x => x.d),
      titles: all.filter(x => x.riku || x.shop).map(x => x.title).filter((v, i, a) => a.indexOf(v) === i)
    };
  });
  ok('カレンダーが出ている（42マス）', r.cells === 42, r.cells);
  ok('🔴 土日祝のマスに薄い斜線の印が付く', r.riku >= 12, r.riku);
  ok('🔴 自社定休のマスに濃い斜線の印が付く', r.shop >= 2, r.shop);
  ok('🔴 理由の字は自社の休みだけ（土日祝には出さない）', r.rikuHasTag === 0, r);
  ok('🔴 MHS の理由がマスに出る（お盆休み）', r.tags.some(t => /お盆休み/.test(t)), r.tags);
  ok('ふつうの定休は「定休」と出る', r.tags.some(t => /定休/.test(t)), r.tags);
  ok('マウスを乗せた時の説明が付く', r.titles.some(t => /陸運局休/.test(t)) && r.titles.some(t => /お盆休み|定休/.test(t)), r.titles);
  ok('祝日は名前も説明に出る', r.titles.some(t => /敬老の日/.test(t)), r.titles);
  /* 🔴 平日なのに斜線＝理由の字を出さない決めなので、**日付の色**で分かるようにしてある */
  ok('🔴 祝日の日付は赤（日曜と同じ）＝平日の斜線の理由が色で分かる',
     r.holiDays.length === 1 && r.holiDays[0] === '21', r.holiDays);
}

console.log('\n── 🧭 物差しを1本に保てているか ──');
{
  const src = await p.evaluate(async () => {
    const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const g = async u => strip(await (await fetch(u + '?t=' + Date.now())).text());
    return { sl: await g('js/shaken-log.js'), sh: await g('js/shaken.js'),
             cv: await g('js/card-view.js'), sp: await g('js/pit-share.js') };
  });
  ok('🔴 1本（pitShakenDayOff）が pit-share.js に居る', /w\.pitShakenDayOff\s*=/.test(src.sp));
  ok('🔴 履歴カレンダーが1本に聞いている', /pitShakenDayOff/.test(src.sl), '');
  ok('🔴 車検予定が1本に聞いている', /pitShakenDayOff/.test(src.sh), '');
  ok('🔴 車検の日を選ぶカレンダーも1本に聞いている', /pitShakenDayOff/.test(src.cv), '');
  /* 「土日は休み」を画面が自分で数えていないか（dow===0/6 の書き方） */
  const selfCount = s => /(getDay\(\)\s*===?\s*[06])|(w\s*===?\s*0\s*\|\|\s*w\s*===?\s*6)/.test(s);
  ok('🔴 履歴カレンダーが曜日を自分で数えて休みにしていない', !selfCount(src.sl), '');
  ok('🔴 車検予定が曜日を自分で数えて休みにしていない', !selfCount(src.sh), '');
  ok('🔴 「陸運局休」の言葉を pit-share.js 以外で綴っていない',
     !/'陸運局休'|"陸運局休"/.test(src.sl) && !/'陸運局休'|"陸運局休"/.test(src.sh) && !/'陸運局休'|"陸運局休"/.test(src.cv), '');
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  await p.evaluate(() => { window.Holidays = window.__keepH; window.PitCal = window.__keepC; });
  await p.evaluate(() => { if (window.pitSampleData) pitSampleData(); });
  await p.waitForTimeout(400);
  for (const v of ['shakenlog', 'shakencal', 'dashboard', 'today', 'reserve', 'return']) {
    await p.evaluate(x => showView(x), v);
    await p.waitForTimeout(250);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
