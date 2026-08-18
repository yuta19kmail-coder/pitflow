/* PitFlow v1.118.0 ── 車検予定の表：予定は「押す」だけ／決定は「ドラッグ」だけ
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-18）
     「表の中で **ドラッグの挙動は候補日を増やすのはなし。あくまで予定側の枠をクリックするのみ**。
       逆に **決定車両への移動はドラッグのみ、予定部分をクリックで飛ばないように**。
       またドラッグ時には **既存のルール通りのカーソール表示** にする」

   ◎決めごと
     🔴 空いているマスを押す → その枠が「行ける枠」に入る／もう一度押す → 外れる
     🔴 帯（候補）を押しても **決定しない**（押し間違いで陸運局の日が変わらないようにする）
     🔴 決定は **帯を上の「決定」へドラッグ** した時だけ
     🔴 カーソルは **指さし（pointer）1本**（2026-08-16 の全アプリ共通の決めごと）。
        `grab` / `grabbing` / `cell` のような特殊カーソルは使わない
     🔴 範囲ドラッグで塗る作り（shkPaint…）と、押したら決定（shkFix）は **廃止**

   ◎使い方
     python3 -m http.server 8975      ← 別ウィンドウ
     node test_shaken_ops.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8975;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.renderShaken && window.showView', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(1000);

/* 車を1台だけ置く＝マスの場所が読みやすい */
await p.evaluate(() => {
  state.cards = [{
    id:'OPS1', boardId:'default', status:'check', workTypes:['shaken'],
    customer:'操作', car:'テスト車', plate:'',
    inspSchedule:{ mode:'manual', slots:{}, cutBefore:'', history:[] }
  }];
  window._shakenBase = null;
  showView('shakencal');
});

const slots = () => p.evaluate(() => JSON.parse(JSON.stringify((state.cards[0].inspSchedule||{}).slots || {})));
const decided = () => p.evaluate(() => { const s = state.cards[0].inspSchedule||{}; return { decided: s.decided||'', slot: s.decidedSlot||'' }; });

/* ===== ① 古い作りが残っていないこと ===== */
const gone = await p.evaluate(() => ({
  shkFix: typeof window.shkFix, shkPaintStart: typeof window.shkPaintStart,
  shkPaintMove: typeof window.shkPaintMove, shkSlot: typeof window.shkSlot,
  onmousedown: !!document.querySelector('#shakencal-body [onmousedown]'),
  onmouseenter: !!document.querySelector('#shakencal-body [onmouseenter]'),
  paintable: !!document.querySelector('#shakencal-body .paintable')
}));
console.log('\n■ 古い作りを消したか');
ok('押したら決定（shkFix）を廃止した',            gone.shkFix === 'undefined', gone.shkFix);
ok('範囲ドラッグで塗る作りを廃止した',            gone.shkPaintStart === 'undefined' && gone.shkPaintMove === 'undefined', gone);
ok('表に onmousedown / onmouseenter が残っていない', !gone.onmousedown && !gone.onmouseenter, gone);
ok('塗り用のマス（paintable）が残っていない',     !gone.paintable);
ok('押して付け外しする窓口がある（shkSlot）',     gone.shkSlot === 'function', gone.shkSlot);

/* ===== ② 空きマスを押す＝「行ける枠」に入る ===== */
const cell1 = await p.evaluate(() => {
  const el = document.querySelector('#shakencal-body .shk-gcar .shk-gsc.slotcell');
  const m = /押すと (\d+\/\d+)\(.\) (午前|午後)/.exec(el.getAttribute('title') || '');
  return { title: el.getAttribute('title'), md: m ? m[1] : '', ap: m ? m[2] : '' };
});
await p.click('#shakencal-body .shk-gcar .shk-gsc.slotcell');
await p.waitForTimeout(150);
const s1 = await slots();
console.log('\n■ 予定（候補）＝押すだけ');
ok('空きマスを押すと「行ける枠」が1つ入る',       Object.keys(s1).length === 1 && Object.values(s1)[0].length === 1, s1);
ok('マスの吹き出しが「押すと〜に入れる」',        /押すと .*（?午前|午後/.test(cell1.title) || /押すと/.test(cell1.title), cell1.title);
ok('吹き出しの日付に曜日が入っている',            /\(\S\)/.test(cell1.title), cell1.title);

/* 入った枠は帯（shk-bar）になる */
const barTitle = await p.evaluate(() => (document.querySelector('#shakencal-body .shk-bar')||{}).title || '');
ok('入れた枠が帯になって出る',                    barTitle !== '', barTitle);
ok('帯の吹き出しが「押すと外す／ドラッグで決定」', /押すと/.test(barTitle) && /ドラッグ/.test(barTitle) && /決定/.test(barTitle), barTitle);

/* ===== ③ 帯を押しても決定しない（今回の本丸） ===== */
await p.click('#shakencal-body .shk-bar');
await p.waitForTimeout(200);
const d1 = await decided();
const s2 = await slots();
console.log('\n■ 帯を押しても決定に飛ばない');
ok('🔴 押しただけでは決定にならない',             d1.decided === '', d1);
ok('押すとその枠が外れる（付け外しのトグル）',    Object.keys(s2).length === 0, s2);
ok('決定バンドにチップが出ていない',              (await p.evaluate(() => document.querySelectorAll('#shakencal-body .shk-decell .shk-chip').length)) === 0);

/* ===== ④ 決定はドラッグした時だけ ===== */
const dragged = await p.evaluate(async () => {
  /* もう一度1枠入れてから、その帯を「決定」の枠へドラッグする */
  const cell = document.querySelector('#shakencal-body .shk-gcar .shk-gsc.slotcell');
  cell.click();
  await new Promise(r => setTimeout(r, 120));
  const bar = document.querySelector('#shakencal-body .shk-bar');
  const iso = bar.getAttribute('data-iso'), slot = bar.getAttribute('data-slot');
  const cellTo = document.querySelector('#shakencal-body .shk-decell[data-iso="' + iso + '"][data-slot="' + slot + '"]');
  const r1 = bar.getBoundingClientRect(), r2 = cellTo.getBoundingClientRect();
  const at = (t, x, y) => document.dispatchEvent(new PointerEvent(t, { clientX:x, clientY:y, bubbles:true, pointerType:'mouse', button:0 }));
  /* ⚠ pointerdown だけは掴む要素の上で起こす（実際の操作と同じ） */
  bar.dispatchEvent(new PointerEvent('pointerdown', { clientX:r1.x+4, clientY:r1.y+4, bubbles:true, pointerType:'mouse', button:0 }));
  at('pointermove', r1.x + 40, r1.y + 4);
  at('pointermove', r2.x + r2.width/2, r2.y + r2.height/2);
  at('pointerup',   r2.x + r2.width/2, r2.y + r2.height/2);
  await new Promise(r => setTimeout(r, 250));
  const s = state.cards[0].inspSchedule || {};
  return { want: iso + '|' + slot, decided: s.decided || '', slot: s.decidedSlot || '',
           chips: document.querySelectorAll('#shakencal-body .shk-decell .shk-chip').length };
});
console.log('\n■ 決定はドラッグだけ');
ok('決定枠へドラッグすると決定になる',            dragged.decided + '|' + dragged.slot === dragged.want, dragged);
ok('決定バンドにチップが1枚出る',                 dragged.chips === 1, dragged.chips);

/* ===== ⑤ カーソルは指さし1本（2026-08-16 の全アプリ共通の決めごと） ===== */
const cur = await p.evaluate(async () => {
  /* ⚠ 1台目は決定したのでガントから抜けている。掴めるもの3種を揃えるため、もう1台足す */
  state.cards.push({ id:'OPS2', boardId:'default', status:'check', workTypes:['shaken'],
    customer:'操作2', car:'テスト車2', plate:'',
    inspSchedule:{ mode:'manual', slots:{}, cutBefore:'', history:[] } });
  renderShaken();
  document.querySelector('#shakencal-body .shk-gcar[data-card-id="OPS2"] .shk-gsc.slotcell').click();
  await new Promise(r => setTimeout(r, 150));
  const g = el => el ? getComputedStyle(el).cursor : '(なし)';
  return {
    マス:   g(document.querySelector('#shakencal-body .shk-gsc.slotcell')),
    帯:     g(document.querySelector('#shakencal-body .shk-bar')),
    チップ: g(document.querySelector('#shakencal-body .shk-chip'))
  };
});
/* ⚠ 説明の文章にも grab の字が出るので、コメントを外してから見る */
const css = (await (await fetch(`http://127.0.0.1:${PORT}/css/shaken.css`)).text()).replace(/\/\*[\s\S]*?\*\//g, '');
console.log('\n■ カーソル（既存のルール＝指さし1本）');
ok('「行ける枠」のマスが指さし',                  cur.マス === 'pointer', cur);
ok('候補の帯が指さし',                            cur.帯 === 'pointer', cur);
ok('決定チップが指さし',                          cur.チップ === 'pointer', cur);
ok('🔴 パーの手（grab/grabbing）を使っていない',  !/cursor\s*:\s*grab/.test(css));
ok('🔴 cell など特殊カーソルを使っていない',      !/cursor\s*:\s*(cell|crosshair|move)\b/.test(css));

/* ===== ⑥ v1.123.0 決定チップは**必ず1行**（縦に伸びると下の行が画面外へ押し出される） ===== */
const meta = await p.evaluate(async () => {
  const mk = (id) => ({ id, boardId:'default', status:'check', workTypes:['shaken'], customer:id, car:'車',
    plate:'', coverCall:{done:false,at:'',staff:''}, inspSchedule:{ mode:'manual', slots:{}, cutBefore:'', history:[] } });
  state.cards = [...Array(6)].map((_, i) => mk('H' + i));
  window._shakenBase = null; showView('shakencal'); shkClosePop();
  await new Promise(r => setTimeout(r, 250));
  const iso = document.querySelector('.shk-decell[data-iso]').getAttribute('data-iso');
  /* 1台目＝全部未定／2台目＝長い陸運局名つき */
  state.cards[0].inspSchedule.decided = iso; state.cards[0].inspSchedule.decidedSlot = 'am';
  Object.assign(state.cards[1].inspSchedule, { decided: iso, decidedSlot:'am',
    resultStaff:'山田', office:'sample_rik_noda', officeName:'野田自動車検査登録事務所', round:2 });
  renderShaken();
  await new Promise(r => setTimeout(r, 200));
  const rows = (id) => {
    const m = document.querySelector('.shk-chip[data-card-id="'+id+'"] .shk-meta');
    if (!m) return null;
    const ys = new Set(Array.from(m.children).map(e => Math.round(e.getBoundingClientRect().top)));
    return { 段数: ys.size, 高さ: Math.round(m.getBoundingClientRect().height),
             中身: Array.from(m.children).map(e => e.textContent),
             チップ高: Math.round(document.querySelector('.shk-chip[data-card-id="'+id+'"]').getBoundingClientRect().height) };
  };
  return { 未定: rows('H0'), 入り: rows('H1') };
});
console.log('\n■ 決定チップは1行に収まるか（v1.123.0）');
ok('🔴 全部未定でも1段に収まる',                  meta.未定 && meta.未定.段数 === 1, meta.未定);
ok('未定は1枚にまとめる（3枚並べない）',          meta.未定 && meta.未定.中身.length === 1 && /^未定 /.test(meta.未定.中身[0]), meta.未定);
ok('🔴 中身が入っていても1段',                    meta.入り && meta.入り.段数 === 1, meta.入り);
ok('長い陸運局名でもチップが太らない（60px以下）', meta.入り && meta.入り.チップ高 <= 60, meta.入り);
ok('R・担当・陸運局の順で出る',                   meta.入り && /^2R$/.test(meta.入り.中身[0]) && meta.入り.中身[1] === '山田', meta.入り);

/* ===== ⑦ 6台あっても、いちばん下の行が画面の中に残る（今回の不具合そのもの） ===== */
const fit = await p.evaluate(async () => {
  const iso = document.querySelector('.shk-decell[data-iso]').getAttribute('data-iso');
  state.cards.forEach(c => { c.inspSchedule.decided = iso; c.inspSchedule.decidedSlot = 'am'; });
  /* 1台だけ候補に戻して、ガントに行を作る */
  const last = state.cards[state.cards.length - 1];
  last.inspSchedule.decided = ''; last.inspSchedule.decidedSlot = '';
  last.inspSchedule.slots = {}; last.inspSchedule.slots[iso] = ['am'];
  renderShaken();
  await new Promise(r => setTimeout(r, 200));
  const bar = document.querySelector('.shk-gcar[data-card-id="'+last.id+'"] .shk-bar');
  const r = bar.getBoundingClientRect();
  return { y: Math.round(r.y), 画面の高さ: window.innerHeight, 見えている: r.y > 0 && r.bottom < window.innerHeight };
});
console.log('\n■ 台数が増えても下の行が画面に残るか');
ok('🔴 5台決定していても、残りの行が画面の中にある', fit.見えている, fit);

/* ===== ⑧ ドラッグ中に端まで来たら自動でスクロールする ===== */
const auto = await p.evaluate(async () => {
  const mk = (id) => ({ id, boardId:'default', status:'check', workTypes:['shaken'], customer:id, car:'車',
    plate:'', coverCall:{done:false,at:'',staff:''}, inspSchedule:{ mode:'manual', slots:{}, cutBefore:'', history:[] } });
  state.cards = [...Array(14)].map((_, i) => mk('S' + i));
  window._shakenBase = null; showView('shakencal'); shkClosePop();
  await new Promise(r => setTimeout(r, 250));
  const iso = document.querySelector('.shk-decell[data-iso]').getAttribute('data-iso');
  state.cards.forEach(c => { c.inspSchedule.slots = {}; c.inspSchedule.slots[iso] = ['am']; });
  renderShaken();
  await new Promise(r => setTimeout(r, 250));
  const sc = document.querySelector('.view.active');
  sc.scrollTop = sc.scrollHeight;                       /* いちばん下まで送る */
  await new Promise(r => setTimeout(r, 150));
  const before = Math.round(sc.scrollTop);
  const bar = document.querySelector('.shk-gcar[data-card-id="S13"] .shk-bar');
  const rb = bar.getBoundingClientRect();
  const at = (t, x, y) => document.dispatchEvent(new PointerEvent(t, { clientX:x, clientY:y, bubbles:true, pointerType:'mouse', button:0 }));
  bar.dispatchEvent(new PointerEvent('pointerdown', { clientX:rb.x+4, clientY:rb.y+4, bubbles:true, pointerType:'mouse', button:0 }));
  at('pointermove', rb.x + 40, rb.y + 4);
  at('pointermove', rb.x + 40, 20);                      /* 画面のいちばん上へ持っていく */
  await new Promise(r => setTimeout(r, 500));            /* 自動スクロールが走る */
  const during = Math.round(sc.scrollTop);
  at('pointerup', rb.x + 40, 20);
  await new Promise(r => setTimeout(r, 400));
  const afterUp = Math.round(sc.scrollTop);
  await new Promise(r => setTimeout(r, 400));
  const afterUp2 = Math.round(sc.scrollTop);
  return { before, during, afterUp, afterUp2 };
});
console.log('\n■ ドラッグ中の自動スクロール（v1.123.0）');
ok('🔴 上の端まで運ぶと自分でスクロールする',      auto.during < auto.before, auto);
ok('🔴 指を離したらスクロールが止まる',            auto.afterUp === auto.afterUp2, auto);

console.log('\n■ JSエラー');
ok('画面のエラーなし', errs.length === 0, errs.slice(0, 3));

console.log('\n────────────  ' + pass + ' OK / ' + fail + ' NG  ────────────');
await b.close();
process.exit(fail ? 1 : 0);
