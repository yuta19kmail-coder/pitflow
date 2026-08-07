/* PitFlow v1.70.0 ── 時間順の並びを1本にそろえた（ゆうた確定）
   -------------------------------------------------------------------
   ◎決めごと（ゆうたの言葉）
     ・通常の時間順 → そのまま
     ・9:00〜10:00 → **後ろの時間**での時間順
     ・AM／PM → それぞれの時間の最後につく（AM なら 12時台のさいごから）
     ・朝一・お昼など → 枠に幅があるので、同じく**後ろの時間**で合わせる
     ・終日系 → **PM のさらに後ろ**
     ・時間未定系 → **いちばん最後**

   ◎言い方を1本にすると
     **「いちばん遅くなり得る時刻」で並べる。** 同じ終わりなら**幅の広い方が後ろ**。
     枠（◯時台）も同じ物差しで決める＝**AM の車は 12時の枠**に出る。

   ◎使い方（PitFlow のフォルダで）
     python3 -m http.server 8996      ← 別ウィンドウ
     node test_time_order.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8996;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitTimeMin && window.pitReturnSortMin', null, { timeout: 20000 });
await p.waitForTimeout(500);

console.log('\n── ① 並びの値（いちばん遅くなり得る時刻） ──');
{
  const L = ['09:00','09:15','09:30','朝一','09:45','10:00','09:00-10:00','12:30','12:59','AM','13:00','お昼','16:00','18:30','夕方','PM','決まり次第','レッカー','鍵ポスト','勝手に取る','未定','','9時以降'];
  const order = await p.evaluate(list =>
    list.map(v => [v, pitTimeMin(v)]).sort((a, b) => a[1] - b[1]).map(x => x[0]), L);
  const want = ['09:00','09:15','09:30','朝一','09:45','10:00','09:00-10:00','12:30','12:59','AM','13:00','お昼','16:00','18:30','夕方','PM','決まり次第','レッカー','鍵ポスト','勝手に取る','未定','','9時以降'];
  ok('🔴 ゆうたの決めた順にぴったり並ぶ', JSON.stringify(order) === JSON.stringify(want), order);

  const v = await p.evaluate(() => ({
    朝一: pitTimeMin('朝一'), AM: pitTimeMin('AM'), お昼: pitTimeMin('お昼'),
    夕方: pitTimeMin('夕方'), PM: pitTimeMin('PM'),
    範囲: pitTimeMin('09:00-10:00'), 実10: pitTimeMin('10:00'),
    空: pitTimeMin(''), 未定: pitTimeMin('未定'), 読めない: pitTimeMin('9時以降')
  }));
  ok('朝一は 9:30（9:45 より前）', v.朝一 > 570 - 1 && v.朝一 < 585, v);
  ok('🔴 AM は 12時台のいちばん最後（12:59 より後・13:00 より前）', v.AM > 779 && v.AM < 780, v);
  ok('お昼は 13:00 の直後', v.お昼 > 780 && v.お昼 < 781, v);
  ok('🔴 夕方と PM は同じ 19:00 で、幅の広い PM が後ろ', v.夕方 > 1140 && v.PM > v.夕方, v);
  ok('範囲は後ろの時刻（同じ 10:00 の車より後ろ）', v.範囲 > v.実10 && v.範囲 < 601, v);
  ok('空・読めない文字は「未定」より後ろ', v.空 > v.未定 && v.読めない > v.未定, v);
  ok('端数は1分をまたがない（AM も13:00を越えない）', Math.floor(v.AM) === 779, v);
}

console.log('\n── ② 枠（◯時台）も同じ物差し ──');
{
  const h = await p.evaluate(() => ({
    朝一: pitTimeHour('朝一', 9, 18), AM: pitTimeHour('AM', 9, 18), お昼: pitTimeHour('お昼', 9, 18),
    夕方: pitTimeHour('夕方', 9, 18), PM: pitTimeHour('PM', 9, 18),
    範囲: pitTimeHour('09:00-10:00', 9, 18),
    朝8: pitTimeHour('08:00', 9, 18), 夜7: pitTimeHour('19:30', 9, 18),
    未定: pitTimeHour('未定', 9, 18), 空: pitTimeHour('', 9, 18)
  }));
  ok('🔴 AM は 12時の枠（v1.69.0 までは9時の枠）', h.AM === '12', h);
  ok('朝一は 9時の枠', h.朝一 === '09', h);
  ok('お昼は 13時の枠', h.お昼 === '13', h);
  ok('🔴 夕方・PM は 18時の枠（19時は端に寄る）', h.夕方 === '18' && h.PM === '18', h);
  ok('範囲は後ろの 10時の枠', h.範囲 === '10', h);
  ok('8:00 は 9時の枠／19:30 は 18時の枠に寄る', h.朝8 === '09' && h.夜7 === '18', h);
  ok('未定・空は枠に入らない（時刻未定へ）', h.未定 === null && h.空 === null, h);
}

console.log('\n── ③ 返車の並び（終日は PM の後ろ・時刻未定より前） ──');
{
  const r = await p.evaluate(() => {
    const mk = o => Object.assign({ id:'x', status:'work', boardId:'default' }, o);
    const T = window.ymd(new Date());
    return {
      時刻あり: pitReturnSortMin(mk({ returnStage:'returnWait', returnDate:T, returnTime:'11:00' })),
      PM:      pitReturnSortMin(mk({ returnStage:'returnWait', returnDate:T, returnTime:'PM' })),
      終日:    pitReturnSortMin(mk({ status:'reserved', dropType:'wait', reserveDate:T })),
      時刻未定: pitReturnSortMin(mk({ returnStage:'returnWait', returnDate:T, returnTime:'' })),
      決まり次第: pitReturnSortMin(mk({ returnStage:'returnWait', returnDate:T, returnTime:'決まり次第' }))
    };
  });
  ok('🔴 終日は PM より後ろ', r.終日 > r.PM, r);
  ok('🔴 終日は「決まり次第」より前', r.終日 < r.決まり次第, r);
  ok('🔴 時刻未定はいちばん最後', r.時刻未定 > r.決まり次第 && r.時刻未定 > r.終日, r);
  ok('時刻ありがいちばん前', r.時刻あり < r.PM, r);
}

console.log('\n── ④ 予約カレンダー（日）＝枠の中も時間順・AM は12時の枠 ──');
{
  await p.evaluate(() => {
    const T = window.ymd(new Date());
    state.cards = [];
    const mk = (id, t) => ({ id: id, resNo: id, customer: '客' + id, car: 'アクア', maker: 'トヨタ',
      reserveDate: T, reserveTime: t, status: 'reserved', boardId: 'default',
      division: 'div1', workTypes: [], dropType: 'wait' });
    /* わざと逆順・混ぜて入れる */
    state.cards.push(mk('T9_45', '09:45'), mk('TAM', 'AM'), mk('T9_05', '09:05'),
                     mk('T12_30', '12:30'), mk('T朝一', '朝一'), mk('T未定', '未定'),
                     mk('T範囲', '09:00-10:00'), mk('T10', '10:00'));
    state.reserveDate = new Date();
    state.reserveRange = 'day';
    window.showView('reserve');
  });
  await p.waitForTimeout(500);
  const day = await p.evaluate(() => Array.from(document.querySelectorAll('#reserve-day-list .reserve-slot')).map(s => ({
    t: (s.querySelector('.reserve-slot-time') || {}).textContent.trim(),
    ids: Array.from(s.querySelectorAll('[data-card-id]')).map(e => e.getAttribute('data-card-id'))
  })).filter(x => x.ids.length));
  const at = t => (day.find(x => x.t.indexOf(t) === 0) || {}).ids || [];
  ok('🔴 9時の枠が時間順（09:05 → 09:45 → 朝一…ではなく 09:05 → 朝一 → 09:45）',
     JSON.stringify(at('09:00')) === JSON.stringify(['T9_05', 'T朝一', 'T9_45']), at('09:00'));
  ok('10時の枠は 10:00 → 範囲（09:00-10:00）',
     JSON.stringify(at('10:00')) === JSON.stringify(['T10', 'T範囲']), at('10:00'));
  ok('🔴 12時の枠は 12:30 → AM', JSON.stringify(at('12:00')) === JSON.stringify(['T12_30', 'TAM']), at('12:00'));
  ok('「未定」は時刻未定の枠', JSON.stringify(at('時刻未定')) === JSON.stringify(['T未定']), at('時刻未定'));
  ok('9時の枠に AM はもう居ない', at('09:00').indexOf('TAM') < 0, at('09:00'));
}

console.log('\n── ⑤ 返車カレンダー（日）＝終日が時刻未定より上 ──');
{
  await p.evaluate(() => {
    const T = window.ymd(new Date());
    state.cards = [];
    const mk = (id, o) => Object.assign({ id: id, resNo: id, customer: '客' + id, car: 'アクア', maker: 'トヨタ',
      status: 'work', boardId: 'default', division: 'div1', workTypes: [], reserveDate: T }, o);
    state.cards.push(
      mk('R時刻未定', { returnStage: 'returnWait', returnDate: T, returnTime: '', dropType: 'drop' }),
      mk('R終日',    { status: 'reserved', dropType: 'wait', reserveDate: T }),
      mk('RPM',      { returnStage: 'returnWait', returnDate: T, returnTime: 'PM', dropType: 'drop' }),
      mk('R11',      { returnStage: 'returnWait', returnDate: T, returnTime: '11:00', dropType: 'drop' })
    );
    state.returnDate = new Date();
    state.returnRange = 'day';
    window.showView('return');
  });
  await p.waitForTimeout(500);
  const rows = await p.evaluate(() => Array.from(document.querySelectorAll('#return-day-list .reserve-slot'))
    .map(s => ({ t: (s.querySelector('.reserve-slot-time') || {}).textContent.trim(),
                 ids: Array.from(s.querySelectorAll('[data-card-id]')).map(e => e.getAttribute('data-card-id')) }))
    .filter(x => x.ids.length));
  const seq = rows.map(r => r.t.replace(/\s+/g, '') + ':' + r.ids.join(','));
  ok('🔴 上から 11:00 → PM(18時枠) → 終日 → 時刻未定',
     JSON.stringify(seq) === JSON.stringify(['11:00〜:R11', '18:00〜:RPM', '終日待ち・当日返し:R終日', '時刻未定:R時刻未定']), seq);
}

console.log('\n── ⑥ 文字くらべをやめた（空き状況・車販） ──');
{
  const src = fs.readFileSync('js/avail.js', 'utf8') + fs.readFileSync('js/car-sales.js', 'utf8');
  ok('🔴 時刻の localeCompare がもう無い', !/reserveTime[^\n]*localeCompare|returnTime[^\n]*localeCompare/.test(src));
  ok('pitTimeMin を使っている', /pitTimeMin/.test(src));
}

console.log('\n── ⑦ 入庫時刻の代用をやめた（返車の週・月／当日ビューの休憩） ──');
{
  const r = fs.readFileSync('js/return.js', 'utf8'), t = fs.readFileSync('js/today.js', 'utf8');
  ok('🔴 返車の週・月が入庫時刻で代用していない',
     !/pitTimeMin\(a\.returnTime \|\| a\.reserveTime\)/.test(r) && /pitReturnSortMin\(a\)/.test(r));
  ok('🔴 当日ビューの休憩の区切りも同じ物差し',
     !/_todMin\(c\.returnTime \|\| c\.reserveTime\)/.test(t) && /pitReturnSortMin\(c\)/.test(t));
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  for (const v of ['course1', 'today', 'reserve', 'return', 'sales', 'mydash', 'loaner']) {
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(150);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.70.0 以降', vn[0] > 1 || (vn[0] === 1 && vn[1] >= 70), ver);
}

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
