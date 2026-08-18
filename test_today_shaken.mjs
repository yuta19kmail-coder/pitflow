/* PitFlow v1.131.0 ── 当日ビューと「車検」の関係
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-18・あとから訂正）
     「ごめん　**ピットの当日は車検はないか**」
     → v1.130.0 でいったん当日ビューに入れた車検の枠は **取り消した**。
        車検は **車検予定の画面**と、工場の **MHS の当日**で見る。

   ◎この試験が見張るもの
     🔴 **当日ビューに車検の枠を出さない**（うっかり足し直さないための見張り）
     🔴 でも **物差し（pit-share.js）の kind・plate4 は残す**
        ＝ MHS の当日がこれを借りている。消すと工場の画面が黙って古い形に落ちる
     🔴 `pitPlate4` は **文字列のまま**（0078 を 78 にしない）／**無ければ空**（作らない）
     🔴 頭の「車検」は **1行ごとの種類**。ゆくゆく名変なども入るので `PIT_SHAKEN_KIND` 1か所で決める

   ◎使い方
     python3 -m http.server 8983      ← 別ウィンドウ
     node test_today_shaken.mjs                                         */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8983;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.renderToday && window.pitShakenOnDate && window.pitPlate4', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(900);

/* ===== ① ナンバーの下4桁の物差し（MHS が借りている） ===== */
const plate = await p.evaluate(() => ({
  ふつう:       pitPlate4({ plate: '野田 500 あ 12-34' }),
  ハイフン無し: pitPlate4({ plate: '習志野 330 ね 0078' }),
  全角:         pitPlate4({ plate: '野田 ５００ あ １２３４' }),
  空:           pitPlate4({ plate: '' }),
  無し:         pitPlate4({}),
  型:           typeof pitPlate4({ plate: '習志野 330 ね 0078' })
}));
console.log('\n■ ナンバーの下4桁（pitPlate4）');
ok('「野田 500 あ 12-34」→ 1234',          plate.ふつう === '1234', plate);
ok('🔴 先頭が0でも落とさない（0078）',      plate.ハイフン無し === '0078', plate);
ok('🔴 文字列のまま（数にしない）',          plate.型 === 'string', plate);
ok('全角の数字でも読める',                   plate.全角 === '1234', plate);
ok('🔴 ナンバーが無ければ空（作らない）',    plate.空 === '' && plate.無し === '', plate);

/* ===== ② 物差しが「種類」と「下4桁」を配る ===== */
const share = await p.evaluate(() => {
  const t = new Date(); t.setHours(0,0,0,0); const q = n => (n<10?'0':'')+n;
  const iso = t.getFullYear()+'-'+q(t.getMonth()+1)+'-'+q(t.getDate());
  const mk = (id,n,car,pl,o) => ({ id, boardId:'default', status:'check', workTypes:['shaken'],
    customer:n, car, plate:pl, coverCall:{done:false,at:'',staff:''},
    inspSchedule: Object.assign({ mode:'manual', slots:{}, cutBefore:'', history:[], decided:iso, decidedSlot:'am' }, o||{}) });
  state.cards = [
    mk('T1','田中','ハスラー','野田 500 あ 12-34',
       { resultStaff:'山田', office:'sample_rik_noda', officeName:'野田自動車検査登録事務所', round:2 }),
    mk('T2','佐藤','ゴルフ','習志野 330 ね 0078', { decidedSlot:'pm' }),
    mk('T3','鈴木','N-BOX','品川 580 く 3333',
       { resultStaff:'鈴木', office:'sample_rik_chiba', officeName:'千葉運輸支局', round:4,
         result:'done', resultDate:iso, resultSlot:'am' })
  ];
  const rows = pitShakenOnDate(state.cards, iso) || [];
  return { 種類の元: window.PIT_SHAKEN_KIND,
           行: rows.map(r => ({ kind:r.kind, name:r.name, car:r.car, plate4:r.plate4,
                                staff:r.staff, office:r.office, round:r.round, done:r.done })) };
});
console.log('\n■ 物差しが配る中身（MHS の当日はこれを借りて描く）');
ok('🔴 種類は PIT_SHAKEN_KIND の1か所で決まる',  share.種類の元 === '車検', share.種類の元);
ok('🔴 どの行にも種類が付く',                     share.行.length === 3 && share.行.every(r => r.kind === '車検'), share.行);
ok('🔴 ナンバー下4桁を配る',                      share.行.some(r => r.plate4 === '1234') && share.行.some(r => r.plate4 === '0078'), share.行);
ok('🔴 担当は通称＆苗字／陸運局は地名だけ',       share.行.some(r => r.staff === '山田' && r.office === '野田' && r.round === 2), share.行);
ok('決まっていないものは空で配る（作らない）',    !(share.行.find(r => r.name === '佐藤')||{}).staff, share.行);
ok('済んだ車は done で配る',                      (share.行.find(r => r.name === '鈴木')||{}).done === true, share.行);

/* ===== ③ 🔴 当日ビューには車検を出さない ===== */
const today = await p.evaluate(async () => {
  window._todayOffset = 0; showView('today');
  await new Promise(r => setTimeout(r, 400));
  const wrap = document.querySelector('#view-today') || document.body;
  return {
    枠がない:     !document.querySelector('.today-shk'),
    行がない:     !document.querySelector('.tshk-row'),
    字がない:     !/車検予定なし/.test(wrap.textContent || ''),
    入庫返車ある: !!document.querySelector('.today-cols')
  };
});
console.log('\n■ 当日ビュー（車検は出さない）');
ok('🔴 車検の枠を出さない',            today.枠がない, today);
ok('🔴 車検の行を出さない',            today.行がない, today);
ok('🔴「車検予定なし」も出さない',      today.字がない, today);
ok('入庫・返車の2列はいままで通り',    today.入庫返車ある, today);

console.log('\n■ JSエラー');
ok('画面のエラーなし', errs.length === 0, errs.slice(0, 3));

console.log('\n────────────  ' + pass + ' OK / ' + fail + ' NG  ────────────');
await b.close();
process.exit(fail ? 1 : 0);
