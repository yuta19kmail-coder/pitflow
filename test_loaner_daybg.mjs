/* PitFlow v1.94.0 ── 代車カレンダーの休日表示と、貸出の矢印
   -------------------------------------------------------------------
   ◎ゆうた指示（2026-08-15）
     「代車カレンダーの休日表示を **土曜日青、日曜日赤、祝日赤、自社の休みやそれ＋斜線表示** に。
       またこれは **実際の代車のノードが来ると消えるのが現在の仕様** だが、
       これを **最奥表示してその上に代車のカードや矢印が来る** ようにしてほしい。
       また、代車から延びる矢印の端がこのデザインだった？」
     → 拡大して見せたところ「**もっと▼みたいな形じゃなかった？**」＝塗りつぶしの三角に。

   ◎正体
     ① 休みはセルの**背景**で塗っていた。だから札を出すために
        `.lo-bk.lo-closed{ background:transparent !important }` で**消すしかなかった**。
        ＝貸出が入った日だけ休みの色が消える。
     ② 曜日（土・日）の色は**日付列の文字だけ**で、カレンダーの中は真っ黒だった。
     ③ 茎は1日＝1マスで描いていて、マスごとに角丸＋区切り線が入るので**点線に見えていた**。
        終端は線のV字アイコンを**茎から離して**置いていたので、先が浮いて見えた。

   ◎ここで見張ること
     🔴 敷き紙（.lo-daybg）が**セルのいちばん最初**にある＝札・茎・矢印がその上に乗る
     🔴 貸出が入っている日でも休みの色／斜線が**消えない**
     🔴 土＝青・日＝赤・祝＝赤・自社の休み＝斜線／重なったら**色＋斜線の両方**
     🔴 茎は角丸なしで上下に1pxはみ出す（＝1本の線に見える）
     🔴 終端は**塗りつぶしの三角**（CSSの三角）で、中にアイコンを入れない

   ◎使い方
     python3 -m http.server 8990      ← 別ウィンドウ
     node test_loaner_daybg.mjs                                        */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8990;
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
await p.waitForFunction('window.state && window.PitCal && window.showView', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

/* 休みを仕込む：今日の少し先に「自社の休み」を2日。祝日は Holidays 任せ。 */
const days = await p.evaluate(() => {
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const at = n => { const d = new Date(t); d.setDate(d.getDate() + n); return ymd(d); };
  /* 「自社の休み」を、日曜と平日の両方に1つずつ置く＝色＋斜線の重なりも見る */
  let sunClosed = '', dayClosed = '';
  for (let i = 1; i <= 20; i++) {
    const d = new Date(t); d.setDate(d.getDate() + i);
    if (d.getDay() === 0 && !sunClosed) sunClosed = ymd(d);
    if (d.getDay() !== 0 && d.getDay() !== 6 && !dayClosed) dayClosed = ymd(d);
  }
  const cal = { ver: 1, from: at(-40), to: at(300), biz: { s: '09:00', e: '17:00' }, dow: [], days: {} };
  cal.days[sunClosed] = { c: 1, l: 'お盆休み' };
  cal.days[dayClosed] = { c: 1, l: 'お盆休み' };
  window.__PitCalTest(cal);
  /* 貸出を1本、その「自社の休み（平日）」をまたぐように置く＝札の下でも斜線が残るか見る */
  const lo = (state.loaners && state.loaners[0]) ? state.loaners[0].id : null;
  const from = at(0), to = at(20);
  state.loanerAssigns = [{ id: 'aTEST', loanerId: lo, cardId: '', customer: 'テスト', fromDate: from, toDate: to }];
  showView('loaner');
  return { sunClosed, dayClosed, lo, from, to };
});
await p.waitForTimeout(1600);

/* セルの中身を読む道具 */
const cellOf = (ds, lo) => p.evaluate(a => {
  const sel = a.lo
    ? '.lo-cell[data-lo="' + a.lo + '"][data-ld="' + a.ds + '"]'
    : '.lo-cell.lo-date[data-ld="' + a.ds + '"]';
  const el = document.querySelector(sel);
  if (!el) return null;
  const bg = el.querySelector(':scope > .lo-daybg');
  const cs = bg ? getComputedStyle(bg) : null;
  return {
    cls: el.className,
    hasBg: !!bg,
    /* 敷き紙がセルの「いちばん最初」か＝あとから足す物が上に乗る */
    bgFirst: !!(bg && el.firstElementChild === bg),
    color: cs ? cs.backgroundColor : '',
    image: cs ? cs.backgroundImage : '',
    zIndex: cs ? cs.zIndex : '',
    hasFill: !!el.querySelector('.lo-fill'),
    hasEnd:  !!el.querySelector('.lo-end')
  };
}, { ds, lo });

console.log('\n── 🧱 敷き紙がいちばん奥にある ──');
{
  const c = await cellOf(days.dayClosed, days.lo);
  ok('貸出が入っている休みの日にも敷き紙がある', !!c && c.hasBg === true, c);
  ok('🔴 敷き紙はセルのいちばん最初（＝札・茎・矢印がその上）', !!c && c.bgFirst === true, c);
  ok('敷き紙は z-index 0（前に出てこない）', !!c && c.zIndex === '0', c && c.zIndex);
  ok('その日は茎が通っている（貸出が入っている）', !!c && c.hasFill === true, c);
  ok('🔴 貸出が入っていても斜線が消えていない', !!c && /repeating-linear-gradient/.test(c.image), c && c.image);
}

console.log('\n── 🎨 土＝青／日＝赤／自社の休み＝斜線 ──');
{
  const r = await p.evaluate(a => {
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const pick = dow => {
      for (let i = 1; i <= 14; i++) {
        const d = new Date(t); d.setDate(d.getDate() + i);
        if (d.getDay() === dow && ymd(d) !== a.sunClosed && ymd(d) !== a.dayClosed) return ymd(d);
      }
      return '';
    };
    const get = ds => {
      const el = document.querySelector('.lo-cell[data-lo="' + a.lo + '"][data-ld="' + ds + '"]');
      const bg = el && el.querySelector(':scope > .lo-daybg');
      const cs = bg ? getComputedStyle(bg) : null;
      return { ds: ds, cls: el ? el.className : 'なし', color: cs ? cs.backgroundColor : '', image: cs ? cs.backgroundImage : '' };
    };
    return { sat: get(pick(6)), sun: get(pick(0)), wed: get(pick(3)) };
  }, days);

  const isBlue = s => /^rgba?\((\d+), (\d+), (\d+)/.test(s) && (+RegExp.$3 > +RegExp.$1);
  const isRed  = s => /^rgba?\((\d+), (\d+), (\d+)/.test(s) && (+RegExp.$1 > +RegExp.$3);
  ok('🔴 土曜は青', isBlue(r.sat.color), r.sat);
  ok('🔴 日曜は赤', isRed(r.sun.color), r.sun);
  ok('ふつうの平日は塗らない', /rgba\(0, 0, 0, 0\)|transparent/.test(r.wed.color), r.wed);
  ok('ふつうの平日に斜線は出さない', !/repeating-linear-gradient/.test(r.wed.image), r.wed.image);
}
{
  /* 日曜かつ自社の休み＝色と斜線の両方 */
  const c = await cellOf(days.sunClosed, days.lo);
  ok('🔴 日曜かつ自社の休み＝赤 と 斜線 の両方が出る',
     !!c && /repeating-linear-gradient/.test(c.image) && /^rgba?\((\d+), (\d+), (\d+)/.test(c.color) && (+RegExp.$1 > +RegExp.$3),
     c);
}

console.log('\n── 📅 日付列（左）にも同じ色 ──');
{
  const d = await cellOf(days.dayClosed, null);
  ok('日付列にも敷き紙がある', !!d && d.hasBg === true, d);
  ok('日付列にも斜線が出る', !!d && /repeating-linear-gradient/.test(d.image), d && d.image);
  const txt = await p.evaluate(ds => {
    const el = document.querySelector('.lo-cell.lo-date[data-ld="' + ds + '"] .lo-dtxt');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { z: cs.zIndex, pos: cs.position, txt: el.textContent.replace(/\s+/g, ' ').trim() };
  }, days.dayClosed);
  ok('🔴 日付の文字は敷き紙より上（隠れない）', !!txt && txt.z === '1' && txt.pos === 'relative', txt);
  ok('日付の文字が読める', !!txt && /\d+\/\d+/.test(txt.txt), txt && txt.txt);
}

console.log('\n── ➡ 貸出の矢印（1本の線＋塗りつぶし▼） ──');
{
  const r = await p.evaluate(a => {
    const cell = document.querySelector('.lo-cell[data-lo="' + a.lo + '"][data-ld="' + a.to + '"]');
    const end = cell && cell.querySelector('.lo-end');
    if (!end) return { none: true };
    const cs = getComputedStyle(end, '::after');
    const mid = document.querySelector('.lo-cell.lo-bk:not(.bk-start):not(.bk-end)[data-lo="' + a.lo + '"] .lo-fill');
    const ms = mid ? getComputedStyle(mid) : null;
    return {
      inner: end.innerHTML.trim(),
      triW: cs.borderLeftWidth + '/' + cs.borderRightWidth,
      triTop: cs.borderTopWidth,
      triColor: cs.borderTopColor,
      content: cs.content,
      midRadius: ms ? ms.borderRadius : '',
      midTop: ms ? ms.top : '', midBottom: ms ? ms.bottom : ''
    };
  }, days);
  ok('🔴 終端は塗りつぶしの三角（CSSの三角）', !r.none && r.triTop !== '0px' && r.triW !== '0px/0px', r);
  ok('🔴 中にアイコンを入れていない（線のV字が戻らない）', !r.none && r.inner === '', r.inner);
  ok('三角の色は貸出の色を受け継ぐ', !r.none && /rgb/.test(r.triColor || ''), r.triColor);
  ok('🔴 途中の茎は角丸なし（点線に見えない）', r.midRadius === '0px', r.midRadius);
  ok('🔴 途中の茎は上下に1pxはみ出す（区切り線を跨ぐ）',
     r.midTop === '-1px' && r.midBottom === '-1px', { top: r.midTop, bottom: r.midBottom });
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  ok('矢印はドラッグで掴める（返却日を伸ばせる）',
     await p.evaluate(a => {
       const cell = document.querySelector('.lo-cell[data-lo="' + a.lo + '"][data-ld="' + a.to + '"]');
       const end = cell && cell.querySelector('.lo-end[data-aid]');
       return !!(end && end.getAttribute('draggable') === 'true');
     }, days), '');
  for (const v of ['dashboard', 'reserve', 'return', 'loaner', 'availcal']) {
    await p.evaluate(x => showView(x), v);
    await p.waitForTimeout(250);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  /* ⚠ コメント（/* … *\/）は先に落とす。**戻さないこと**と書いた注意書き自体に
     同じ文字列が入っているので、そのままだと自分の注意書きに引っかかる。 */
  const css = fs.readFileSync('css/polish.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('🔴 「貸出が入ると休みを消す」きまりが復活していない',
     !/\.lo-bk\.lo-closed[^{]*\{[^}]*background:\s*transparent\s*!important/.test(css), '');
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
