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
           band: (host.querySelector('.shk-wait')||{}).textContent || '' };
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
ok('「未入庫」の字を使っていない',                !/未入庫/.test(r1.band), r1.band.slice(0,60));

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

/* ===== ⑤ v1.116.0 3つの箱（今週／来週／再来週）・入庫日順・曜日・バッジ・置き場所 ===== */
const r5 = await p.evaluate(() => {
  const t = new Date(); t.setHours(0,0,0,0);
  const q = n => (n < 10 ? '0' : '') + n;
  const ymd = d => d.getFullYear() + '-' + q(d.getMonth()+1) + '-' + q(d.getDate());
  const at = n => { const d = new Date(t); d.setDate(d.getDate() + n); return ymd(d); };
  /* 今週の金曜／来週の金曜／再来週の金曜（土曜はじまり・金曜おわり） */
  const f1d = new Date(t); f1d.setDate(f1d.getDate() + ((5 - t.getDay() + 7) % 7));
  const f1 = ymd(f1d);
  const plus = (base, n) => { const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
  const f2 = plus(f1, 7), f3 = plus(f2, 7);
  const mk = (o) => Object.assign({
    id: o.id, boardId:'default', status:'reserved', workTypes:['shaken'], customer:o.id,
    car:'テスト車', plate:'', inspSchedule:{ mode:'manual', slots:{}, cutBefore:'', history:[] }
  }, o);
  state.cards = [
    /* 入庫日が過ぎている車。⚠ 本予約は自動で「未入庫」に落ちてしまうので、
       ここに残るのは**仮予約・承認待ち**だけ（v1.101.0 の決めごと）。それを再現する。 */
    mk({ id:'G0-past',  reserveDate: plus(f1, -30), tentative:true }),  // 過ぎている → 今週の箱
    mk({ id:'G0-fri',   reserveDate: f1 }),                             // 今週の金曜ちょうど → 今週
    mk({ id:'G0-tbd',   reserveDate: '', intakeTbd:true }),             // 入庫日未定 → 今週のいちばん後ろ
    mk({ id:'G1-sat',   reserveDate: plus(f1, 1), drive:['leftHand'] }),// 来週の初日（土）→ 来週・左バッジ
    mk({ id:'G1-mid',   reserveDate: plus(f1, 3), drive:['mt'] }),      // 来週・MTバッジ
    mk({ id:'G1-fri',   reserveDate: f2 }),                             // 来週の金曜ちょうど → 来週
    mk({ id:'G2-sat',   reserveDate: plus(f2, 1), drive:['leftHand','mt'], workTypes:['shaken','12pt'] }),
    mk({ id:'G2-fri',   reserveDate: f3 }),                             // 再来週の金曜ちょうど → 再来週
    mk({ id:'G3-far',   reserveDate: plus(f3, 1) })                     // それより先 → 出さない
  ];
  window._shakenBase = null;
  showView('shakencal');
  const host = document.getElementById('shakencal-body');
  const grp = {};
  ['w0','w1','w2'].forEach(k => {
    const box = host.querySelector('.shk-wg[data-wg="' + k + '"]');
    grp[k] = {
      exists: !!box,
      title: box ? (box.querySelector('.shk-wgh b')||{}).textContent : '',
      range: box ? (box.querySelector('.shk-wgr')||{}).textContent : '',
      count: box ? (box.querySelector('.shk-wgn')||{}).textContent : '',
      ids: box ? Array.from(box.querySelectorAll('.shk-uchip')).map(e => e.getAttribute('data-card-id')) : [],
      text: box ? box.textContent : ''
    };
  });
  /* 置き場所＝メインの表が先、そのあとに3つの箱 */
  const kids = Array.from(host.children).map(e => e.className.split(' ')[0]);
  const chipOf = id => host.querySelector('.shk-uchip[data-card-id="' + id + '"]');
  const badges = id => Array.from(chipOf(id).querySelectorAll('.shk-ca')).map(e => e.textContent);
  /* v1.121.0 車両注意は他のカードと同じ黄色（塗りアンバー）で出す＝クラスと実際の色を見る */
  const cauOf = id => Array.from(chipOf(id).querySelectorAll('.shk-ca.cau')).map(e => ({
    t: e.textContent, bg: getComputedStyle(e).backgroundColor, fg: getComputedStyle(e).color }));
  return { grp, kids, f1, f2, f3,
           dateText: (chipOf('G1-sat').querySelector('.shk-ures')||{}).textContent,
           tbdText: (chipOf('G0-tbd').querySelector('.shk-ures')||{}).textContent,
           b左: badges('G1-sat'), bMT: badges('G1-mid'), b全部: badges('G2-sat'), bなし: badges('G0-fri'),
           cau左: cauOf('G1-sat'), cau全部: cauOf('G2-sat'), cauなし: cauOf('G0-fri'),
           far: !!chipOf('G3-far') };
});

console.log('\n■ 3つの箱に分かれるか（土曜はじまり・金曜おわり）');
ok('今週入庫分の箱がある',                        r5.grp.w0.exists && r5.grp.w0.title === '今週入庫分', r5.grp.w0.title);
ok('来週入庫分の箱がある',                        r5.grp.w1.exists && r5.grp.w1.title === '来週入庫分', r5.grp.w1.title);
ok('再来週入庫分の箱がある',                      r5.grp.w2.exists && r5.grp.w2.title === '再来週入庫分', r5.grp.w2.title);
ok('今週＝過ぎたぶん・金曜ちょうど・未定の3台',   JSON.stringify(r5.grp.w0.ids) === JSON.stringify(['G0-past','G0-fri','G0-tbd']), r5.grp.w0.ids);
ok('来週＝土曜から翌金曜までの3台',               JSON.stringify(r5.grp.w1.ids) === JSON.stringify(['G1-sat','G1-mid','G1-fri']), r5.grp.w1.ids);
ok('再来週＝その次の土曜〜金曜の2台',             JSON.stringify(r5.grp.w2.ids) === JSON.stringify(['G2-sat','G2-fri']), r5.grp.w2.ids);
ok('再来週より先の予約は出さない',                r5.far === false);
ok('入庫日未定は今週の箱のいちばん後ろ',          r5.grp.w0.ids[r5.grp.w0.ids.length-1] === 'G0-tbd', r5.grp.w0.ids);
ok('台数が見出しに出る（来週3台）',               r5.grp.w1.count === '3台', r5.grp.w1.count);

console.log('\n■ 並び順＝入庫日順');
ok('今週の箱が入庫日順',                          JSON.stringify(r5.grp.w0.ids) === JSON.stringify(['G0-past','G0-fri','G0-tbd']), r5.grp.w0.ids);
ok('来週の箱が入庫日順',                          JSON.stringify(r5.grp.w1.ids) === JSON.stringify(['G1-sat','G1-mid','G1-fri']), r5.grp.w1.ids);

console.log('\n■ 置き場所＝上からメインの表、今週、来週');
ok('メインの表が3つの箱より先にある',             r5.kids.indexOf('shk-scroll') < r5.kids.indexOf('shk-wait') && r5.kids.indexOf('shk-wait') >= 0, r5.kids);
ok('3つの箱は表の下（最後）',                     r5.kids[r5.kids.length-1] === 'shk-wait', r5.kids);

console.log('\n■ 曜日つきの日付');
ok('入庫日が「◯/◯(曜)」の形',                    /^\d+\/\d+\([日月火水木金土]\)$/.test(r5.dateText), r5.dateText);
ok('🔴「入」の字は付けない（ゆうた指定）',        !/入/.test(r5.dateText), r5.dateText);
ok('来週の初日は必ず(土)',                        /\(土\)$/.test(r5.dateText), r5.dateText);
ok('見出しの期間にも曜日が入る',                  /\([日月火水木金土]\)/.test(r5.grp.w1.range), r5.grp.w1.range);
ok('入庫日未定はその旨を出す',                    r5.tbdText === '入庫日未定', r5.tbdText);

console.log('\n■ 左・M/T などの車両注意バッジ（v1.121.0＝他のカードと同じ言い方と黄色）');
ok('左ハンドルの車に「左」が出る',                JSON.stringify(r5.b左) === JSON.stringify(['左']), r5.b左);
ok('M/Tの車に「M/T」が出る（他のカードと同じ書き方）', JSON.stringify(r5.bMT) === JSON.stringify(['M/T']), r5.bMT);
ok('🔴 左とM/Tが両方なら「左M/T」に合体する',      JSON.stringify(r5.b全部) === JSON.stringify(['左M/T','12点']), r5.b全部);
ok('何も無い車にはバッジを出さない',              r5.bなし.length === 0, r5.bなし);
ok('🔴 車両注意は塗りアンバー（#f59e0b）',         r5.cau左.length === 1 && r5.cau左[0].bg === 'rgb(245, 158, 11)', r5.cau左);
ok('🔴 字は濃い色（#1c1300）＝耳の注意タブと同じ', r5.cau左[0] && r5.cau左[0].fg === 'rgb(28, 19, 0)', r5.cau左);
ok('合体した「左M/T」も同じ黄色',                 r5.cau全部.length === 1 && r5.cau全部[0].t === '左M/T' && r5.cau全部[0].bg === 'rgb(245, 158, 11)', r5.cau全部);
ok('12点は車両注意ではないので黄色にしない',      r5.cau全部.every(x => x.t !== '12点'), r5.cau全部);
ok('注意が無い車には黄色のバッジを出さない',      r5.cauなし.length === 0, r5.cauなし);

console.log('\n■ JSエラー');
ok('画面のエラーなし', errs.length === 0, errs.slice(0, 3));

console.log('\n────────────  ' + pass + ' OK / ' + fail + ' NG  ────────────');
await b.close();
process.exit(fail ? 1 : 0);
