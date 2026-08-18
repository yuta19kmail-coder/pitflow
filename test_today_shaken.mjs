/* PitFlow v1.130.0 ── 当日ビューの「車検」枠
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-18）
     「車検予定の **車検・客名・車種・ナンバーの下4桁・車検担当者・陸運局・R** の情報を
       **当日ビューや MHS の当日**に表示できるように修正。
       現状車検枠で『車検』だけだが、**ゆくゆくは名変とかも入るようにしたい**ため**頭に車検を付けて**ほしい」

   ◎決めごと
     🔴 出す順は **車検（種類）→ AM/PM → 印 → 客名 → 車種 → ナンバー下4桁 → 担当 → 陸運局 → R**
     🔴 頭の「車検」は**1行ごとの種類**（枠の名前ではない）。ゆくゆく名変なども入る
     🔴 どの車を出すか・並び・中身は **pit-share.js の物差し1本**（`pitShakenOnDate`）
     🔴 担当は通称＆苗字／陸運局は地名だけ（狭い枠だから。v1.127.0・v1.129.0）
     🔴 決まっていないものは「未定 ◯・◯」を1つにまとめて出す（済んだ車には出さない）
     🔴 0台の日も**枠は出す**（黙って消えると壊れているのか予定が無いのか分からない）
     ⚠ MHS の当日と**同じ順・同じ中身**にすること（あちらも同じ物差しを借りている）

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

/* ===== ① ナンバーの下4桁の物差し ===== */
const plate = await p.evaluate(() => ({
  ふつう:   pitPlate4({ plate:'野田 500 あ 12-34' }),
  ハイフン無し: pitPlate4({ plate:'習志野 330 ね 0078' }),
  空:       pitPlate4({ plate:'' }),
  無し:     pitPlate4({})
}));
console.log('\n■ ナンバーの下4桁');
ok('「野田 500 あ 12-34」→ 1234',                plate.ふつう === '1234', plate);
ok('先頭が0でも落とさない（0078）',              plate.ハイフン無し === '0078', plate);
ok('ナンバーが無ければ空',                        plate.空 === '' && plate.無し === '', plate);

/* ===== ② 当日ビューに車検の枠が出る ===== */
const view = await p.evaluate(async () => {
  const t = new Date(); t.setHours(0,0,0,0); const q = n => (n<10?'0':'')+n;
  const iso = t.getFullYear()+'-'+q(t.getMonth()+1)+'-'+q(t.getDate());
  const mk = (id,n,car,pl,o) => ({ id, boardId:'default', status:'check', workTypes:['shaken'],
    customer:n, car, plate:pl, coverCall:{done:false,at:'',staff:''},
    inspSchedule: Object.assign({ mode:'manual', slots:{}, cutBefore:'', history:[], decided:iso, decidedSlot:'am' }, o||{}) });
  state.cards = [
    mk('T1','田中','ハスラー','野田 500 あ 12-34',
       { resultStaff:'山田', office:'sample_rik_noda', officeName:'野田自動車検査登録事務所', round:2 }),
    mk('T2','佐藤','ゴルフ','習志野 330 ね 0078', { decidedSlot:'pm' }),   /* 何も決まっていない */
    mk('T3','鈴木','N-BOX','品川 580 く 3333',
       { resultStaff:'鈴木', office:'sample_rik_chiba', officeName:'千葉運輸支局', round:4,
         result:'done', resultDate:iso, resultSlot:'am' })
  ];
  window._todayOffset = 0; showView('today');
  await new Promise(r => setTimeout(r, 400));
  const box = document.querySelector('.today-shk');
  const rows = box ? Array.from(box.querySelectorAll('.tshk-row')) : [];
  const parts = (el, cls) => (el.querySelector('.'+cls)||{}).textContent || '';
  return {
    ある: !!box,
    見出し: box ? (box.querySelector('.today-col-head')||{}).textContent.replace(/\s+/g,' ').trim() : '',
    件数: rows.length,
    行: rows.map(e => ({
      kind: parts(e,'tshk-kind'), ap: parts(e,'tshk-ap'), mk: parts(e,'tshk-mk'),
      nm: parts(e,'tshk-nm'), car: parts(e,'tshk-car'), pl: parts(e,'tshk-pl'),
      st: parts(e,'tshk-st'), of: parts(e,'tshk-of'), rd: parts(e,'tshk-rd'), tbd: parts(e,'tshk-tbd'),
      全文: e.textContent.replace(/\s+/g,'')
    })),
    /* 入庫・返車の下にあるか */
    列の下: (() => { const cols = document.querySelector('.today-cols');
      return !!(cols && box && (cols.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING)); })()
  };
});
console.log('\n■ 当日ビューの車検枠');
ok('車検の枠が出る',                              view.ある, view);
ok('🔴 入庫・返車の下にある',                      view.列の下, view);
ok('見出しに台数と AM/PM の内訳',                 /車検 3/.test(view.見出し) && /AM 2/.test(view.見出し) && /PM 1/.test(view.見出し), view.見出し);
ok('3台とも出る',                                 view.件数 === 3, view.件数);

console.log('\n■ 1行の中身（車検・客名・車種・下4桁・担当・陸運局・R）');
const r1 = view.行[0] || {};
ok('🔴 頭に「車検」が付く',                        r1.kind === '車検', r1);
ok('AM/PM が出る',                                r1.ap === 'AM', r1);
ok('客名（様つき）',                               /田中様/.test(r1.nm), r1);
ok('車種',                                        r1.car === 'ハスラー', r1);
ok('🔴 ナンバーの下4桁',                           r1.pl === '1234', r1);
ok('🔴 車検担当者（通称＆苗字）',                  r1.st === '山田', r1);
ok('🔴 陸運局（地名だけ）',                        r1.of === '野田', r1);
ok('🔴 R（ラウンド）',                             r1.rd === '2R', r1);
ok('決まっていれば「未定」は出さない',            r1.tbd === '', r1);

console.log('\n■ 決まっていないもの／済んだもの');
const r2 = view.行.find(x => /佐藤/.test(x.nm)) || {};
const r3 = view.行.find(x => /鈴木/.test(x.nm)) || {};
ok('何も決まっていない車は「未定 回送・陸運局・R」', /未定/.test(r2.tbd) && /回送/.test(r2.tbd) && /陸運局/.test(r2.tbd) && /R/.test(r2.tbd), r2);
ok('その車にも頭の「車検」とナンバーは出る',       r2.kind === '車検' && r2.pl === '0078', r2);
ok('済んだ車には「済」の印が出る',                 r3.mk === '済', r3);
ok('🔴 済んだ車に「未定」は出さない',              r3.tbd === '', r3);
ok('済んだ車の陸運局も地名だけ',                   r3.of === '千葉', r3);

/* ===== ③ 物差しが配る中身と画面が一致する（MHS も同じものを見る） ===== */
const same = await p.evaluate(() => {
  const t = new Date(); t.setHours(0,0,0,0); const q = n => (n<10?'0':'')+n;
  const iso = t.getFullYear()+'-'+q(t.getMonth()+1)+'-'+q(t.getDate());
  const rows = pitShakenOnDate(state.cards, iso) || [];
  return rows.map(r => ({ kind:r.kind, name:r.name, car:r.car, plate4:r.plate4, staff:r.staff, office:r.office, round:r.round }));
});
console.log('\n■ 物差しが配る中身（MHS の当日も同じものを見る）');
ok('物差しが「車検」の種類を配る',                same.every(r => r.kind === '車検'), same);
ok('物差しがナンバー下4桁を配る',                 same.some(r => r.plate4 === '1234'), same);
ok('物差しが担当・陸運局・R を配る',              same.some(r => r.staff === '山田' && r.office === '野田' && r.round === 2), same);

/* ===== ④ 0台の日も枠は出す ===== */
const empty = await p.evaluate(async () => {
  state.cards = [];
  renderToday();
  await new Promise(r => setTimeout(r, 300));
  const box = document.querySelector('.today-shk');
  return { ある: !!box, 中身: box ? box.textContent.replace(/\s+/g,' ').trim() : '' };
});
console.log('\n■ 0台の日');
ok('🔴 0台でも枠は出す',                          empty.ある, empty);
ok('「車検予定なし」と出す',                      /車検予定なし/.test(empty.中身), empty);

console.log('\n■ JSエラー');
ok('画面のエラーなし', errs.length === 0, errs.slice(0, 3));

console.log('\n────────────  ' + pass + ' OK / ' + fail + ' NG  ────────────');
await b.close();
process.exit(fail ? 1 : 0);
