/* PitFlow v1.115.0 ── 車検予定の「入庫待ちの予約」の帯に、もう帰った車を出さない
   -------------------------------------------------------------------
   ◎ゆうた（2026-08-18）「車検スケジュール 未入庫の予定が動いてないような？？」

   ◎何が起きていたか
     車検予定の上に出る帯（旧・未入庫の予約）は「まだ入庫していない車」を並べる場所。
     ところが「入庫済みか」の1本だけで見ていたので、**返車済み（もう帰った車）も
     『まだ来ていない側』に落ちていた**。帰った車は入庫日が必ず過去なので、
     帯の「〜◯/◯まで」の網に必ず引っかかる＝何ヶ月も前に終わった車が並びっぱなし。
     本番相当の中身で **75台中51台が返車済み**。いつ見ても同じ顔ぶれ＝動いていないように見える。

   ◎直した決めごと（この見張りが守るもの）
     🔴 いま車がどこにいるかを **3つ**に分ける
        ・まだ来ていない（予約中）  → 帯に出す
        ・いま店にいる              → 予定が無ければ「未設定」
        ・もう帰った・廃車          → **どこにも出さない**
     🔴 ただし **完了・再検・決定の数は帰った車も数える**（起きた事実だから）
     🔴 済・再検の印は今までどおり決定バンドに出る（pit-share.js の物差しは触っていない）
     🔴 呼び名を「未入庫の予約」→「入庫待ちの予約」に変更
        （v1.101.0 から「未入庫」は**来なかった車**を指す言葉になったため、混ざるのを防ぐ）

   ◎使い方
     python3 -m http.server 8973      ← 別ウィンドウ
     node test_shaken_unsched.mjs                                        */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8973;
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
await p.waitForFunction('window.state && window.renderShaken && window.pitShakenOnDate && window.pitCardActive', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(1000);

/* ===== ① 作り物の車を8台だけ置いて見る（他は全部どける＝数えやすくする） ===== */
const r1 = await p.evaluate(() => {
  const iso = (d) => { const t = new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate() + d);
    const q = n => (n < 10 ? '0' : '') + n; return t.getFullYear() + '-' + q(t.getMonth()+1) + '-' + q(t.getDate()); };
  const mk = (o) => Object.assign({
    id: o.id, boardId: 'default', workTypes: ['shaken'], customer: o.id + '子',
    car: 'テスト車', plate: '', inspSchedule: { mode:'manual', slots:{}, cutBefore:'', history:[] }
  }, o);
  window._TEST_TODAY = iso(0);
  state.cards = [
    /* もう帰った車（予定の記録なし）＝いちばんの犯人。半年前に入庫して返している */
    mk({ id:'T-gone',      status:'returned', reserveDate: iso(-180), returnDate: iso(-178) }),
    /* もう帰った車で、車検は「済」＝完了に数えたい／帯には出さない */
    mk({ id:'T-gone-done', status:'returned', reserveDate: iso(-30), returnDate: iso(-28),
         inspSchedule:{ mode:'manual', slots:{}, history:[], result:'done', resultDate: iso(-29), resultSlot:'am' } }),
    /* もう帰った車で、再検の記録つき＝再検に数えたい／帯には出さない */
    mk({ id:'T-gone-re',   status:'returned', reserveDate: iso(-20), returnDate: iso(-18),
         inspSchedule:{ mode:'manual', slots:{}, history:[{date: iso(-19), slot:'pm', result:'recheck'}] } }),
    /* 廃車＝どこにも出さない */
    mk({ id:'T-scrap',     status:'scrap',    reserveDate: iso(-40) }),
    /* これから来る予約＝帯に出す */
    mk({ id:'T-wait',      status:'reserved', reserveDate: iso(2) }),
    /* 入庫日が今日の予約＝帯に出す */
    mk({ id:'T-wait2',     status:'reserved', reserveDate: iso(0) }),
    /* いま店にいる（入庫中）で予定なし＝「未設定」に出す。帯には出さない */
    mk({ id:'T-here',      status:'check',    reserveDate: iso(-1) }),
    /* 未入庫＝来なかった車（v1.101.0 の箱）。今までどおり車検予定には出さない */
    mk({ id:'T-noshow',    status:'cancelled', noShow:true, reserveDate: iso(-3) })
  ];
  window._shakenBase = null;                 // 今週に戻す
  showView('shakencal');
  const host = document.getElementById('shakencal-body');
  const chips = Array.from(host.querySelectorAll('.shk-uchip')).map(e => e.getAttribute('data-card-id'));
  const gantt = Array.from(host.querySelectorAll('.shk-gcar')).map(e => e.getAttribute('data-card-id'));
  return { chips, gantt, sum: (host.querySelector('.shk-sum')||{}).textContent || '',
           band: (host.querySelector('.shk-un')||{}).textContent || '' };
});

console.log('\n■ 帯（入庫待ちの予約）に誰が並ぶか');
ok('もう帰った車は帯に出ない（今回の本丸）',      !r1.chips.includes('T-gone'), r1.chips);
ok('もう帰った車（済）も帯に出ない',              !r1.chips.includes('T-gone-done'), r1.chips);
ok('もう帰った車（再検）も帯に出ない',            !r1.chips.includes('T-gone-re'), r1.chips);
ok('廃車も帯に出ない',                            !r1.chips.includes('T-scrap'), r1.chips);
ok('未入庫（来なかった車）は帯に出ない',          !r1.chips.includes('T-noshow'), r1.chips);
ok('これから来る予約は帯に出る',                  r1.chips.includes('T-wait'), r1.chips);
ok('入庫日が今日の予約も帯に出る',                r1.chips.includes('T-wait2'), r1.chips);
ok('いま店にいる車は帯に出ない',                  !r1.chips.includes('T-here'), r1.chips);
ok('帯にいるのは予約中の2台だけ',                 r1.chips.length === 2, r1.chips);

console.log('\n■ 呼び名');
ok('帯の見出しが「入庫待ちの予約」',              /入庫待ちの予約/.test(r1.band), r1.band.slice(0,40));
ok('帯の見出しに「未入庫」と書かれていない',      !/未入庫/.test(r1.band), r1.band.slice(0,40));

console.log('\n■ 下の「予定」（ガント）');
ok('いま店にいて予定なしの車は未設定として出る',  r1.gantt.includes('T-here'), r1.gantt);
ok('もう帰った車はガントにも出ない',              !r1.gantt.includes('T-gone'), r1.gantt);

console.log('\n■ 数（帰った車も「起きた事実」は数える）');
ok('完了1（帰った車の済を数えている）',           /完了1/.test(r1.sum), r1.sum);
ok('再検1（帰った車の再検を数えている）',         /再検1/.test(r1.sum), r1.sum);
ok('未設定1（店にいる車だけ）',                   /未設定1/.test(r1.sum), r1.sum);

/* ===== ② 済の印は今までどおりカレンダーに出る（pit-share.js の物差しは触っていない） ===== */
const r2 = await p.evaluate(() => {
  /* ⚠ 休み（土日・祝・定休）の日は枠そのものが出ないので、開いている日を画面から拾う */
  const host = () => document.getElementById('shakencal-body');
  const open = host().querySelector('.shk-decell[data-iso]');
  const day = open.getAttribute('data-iso');
  const c = state.cards.find(x => x.id === 'T-gone-done');
  c.inspSchedule.resultDate = day; c.inspSchedule.resultSlot = 'am';   // 帰った車だが「済」をその日に付け替える
  renderShaken();
  const rows = pitShakenOnDate(state.cards, day);
  return { day, rows: rows.map(x => x.id + ':' + x.mark),
           chipIds: Array.from(host().querySelectorAll('.shk-chip')).map(e => e.getAttribute('data-card-id')) };
});
ok('帰った車でも「済」は決定バンドに出る',        r2.rows.includes('T-gone-done:済'), r2.rows);
ok('その済チップが画面にも描かれている',          r2.chipIds.includes('T-gone-done'), r2.chipIds);

/* ===== ③ 帰った車が「候補（行ける枠）」を持っていても、これからやることには混ぜない ===== */
const r3 = await p.evaluate(() => {
  const iso = (d) => { const t = new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate() + d);
    const q = n => (n < 10 ? '0' : '') + n; return t.getFullYear() + '-' + q(t.getMonth()+1) + '-' + q(t.getDate()); };
  const c = state.cards.find(x => x.id === 'T-gone');
  c.inspSchedule.slots = {}; c.inspSchedule.slots[iso(1)] = ['am'];
  renderShaken();
  const host = document.getElementById('shakencal-body');
  return { gantt: Array.from(host.querySelectorAll('.shk-gcar')).map(e => e.getAttribute('data-card-id')),
           sum: (host.querySelector('.shk-sum')||{}).textContent || '' };
});
ok('帰った車の候補枠はガントに出ない',            !r3.gantt.includes('T-gone'), r3.gantt);
ok('帰った車は候補の数にも入れない（候補0）',     /候補0/.test(r3.sum), r3.sum);

/* ===== ④ 週を送っても帰った車は戻ってこない ===== */
const r4 = await p.evaluate(() => {
  const out = {};
  [0, 7, 14, -7].forEach(function (d) {
    shkShift(d === 0 ? 0 : d);
    const host = document.getElementById('shakencal-body');
    out[d] = Array.from(host.querySelectorAll('.shk-uchip')).map(e => e.getAttribute('data-card-id'));
  });
  shkShift(0);
  return out;
});
ok('週を送っても帰った車は帯に出てこない',
   Object.keys(r4).every(k => !r4[k].includes('T-gone') && !r4[k].includes('T-gone-done')), r4);

console.log('\n■ JSエラー');
ok('画面のエラーなし', errs.length === 0, errs.slice(0, 3));

console.log('\n────────────  ' + pass + ' OK / ' + fail + ' NG  ────────────');
await b.close();
process.exit(fail ? 1 : 0);
