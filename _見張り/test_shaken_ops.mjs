/* PitFlow v1.118.0 ── 車検予定の表：予定は「押す」だけ／決定は「ドラッグ」だけ
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-18）
     「表の中で **ドラッグの挙動は候補日を増やすのはなし。あくまで予定側の枠をクリックするのみ**。
       逆に **決定車両への移動はドラッグのみ、予定部分をクリックで飛ばないように**。
       またドラッグ時には **既存のルール通りのカーソール表示** にする」

   ◎決めごと
     🔴🔴 **v2.54.0（2026-09-02 ゆうた指定）で「押したら行ける枠」は廃止した。**
        🗣「予定一覧で候補日の修正が出来ないようにする。ただし、車種×日の１セルに対してクリックする事で
        　　暫定予定として上の決定カードのような形のものを下にも設置できるようにする」
        ＝ **マスを押す＝暫定予定（仮押さえ）を置く。** 行ける枠の入れ替えは**予約詳細の窓だけ**。
        ⚠ 暫定そのものの決めごとは `test_shaken_tent.mjs`（node だけで走る）にある。ここは**表の操作**だけ見る。
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
  shkPaintMove: typeof window.shkPaintMove, shkSlot: typeof window.shkSlot, shkTent: typeof window.shkTent,
  onmousedown: !!document.querySelector('#shakencal-body [onmousedown]'),
  onmouseenter: !!document.querySelector('#shakencal-body [onmouseenter]'),
  paintable: !!document.querySelector('#shakencal-body .paintable')
}));
console.log('\n■ 古い作りを消したか');
ok('押したら決定（shkFix）を廃止した',            gone.shkFix === 'undefined', gone.shkFix);
ok('範囲ドラッグで塗る作りを廃止した',            gone.shkPaintStart === 'undefined' && gone.shkPaintMove === 'undefined', gone);
ok('表に onmousedown / onmouseenter が残っていない', !gone.onmousedown && !gone.onmouseenter, gone);
ok('塗り用のマス（paintable）が残っていない',     !gone.paintable);
ok('🔴 v2.54.0 押して行ける枠を付け外しする窓口は廃止（shkSlot）', gone.shkSlot === 'undefined', gone.shkSlot);
ok('🅿 v2.54.0 マスを押す窓口は暫定予定（shkTent）',              gone.shkTent === 'function', gone.shkTent);

/* ===== ② 空きマスを押す＝🅿 暫定予定（仮押さえ）が置かれる（v2.54.0）===== */
const cell1 = await p.evaluate(() => {
  const el = document.querySelector('#shakencal-body .shk-gcar .shk-gsc.slotcell');
  return { title: el.getAttribute('title') };
});
await p.click('#shakencal-body .shk-gcar .shk-gsc.slotcell');
await p.waitForTimeout(200);
const s1 = await slots();
const t1 = await p.evaluate(() => { const s = state.cards[0].inspSchedule||{}; return { tent: s.tent||'', slot: s.tentSlot||'',
  card: document.querySelectorAll('#shakencal-body .shk-gcar .shk-chip.shk-tent').length }; });
console.log('\n■ 🅿 マスを押す＝暫定予定（仮押さえ）');
ok('マスの吹き出しが「押すと〜暫定予定〜」',      /押すと/.test(cell1.title) && /暫定/.test(cell1.title), cell1.title);
ok('吹き出しの日付に曜日が入っている',            /\(\S\)/.test(cell1.title), cell1.title);
ok('🅿 押すと暫定が1つ入る',                      t1.tent !== '', t1);
ok('🅿 下に決定カードと同じ形のカードが出る',     t1.card === 1, t1);
ok('🔴 「行ける枠」は1つも増えない（この表からは触れない）', Object.keys(s1).length === 0, s1);
ok('🔴 暫定は決定ではない（決定バンドは空のまま）',
   (await p.evaluate(() => document.querySelectorAll('#shakencal-body .shk-decell .shk-chip').length)) === 0);

/* もう一度同じマス（＝暫定カード）を押すと外れる */
await p.click('#shakencal-body .shk-gcar .shk-chip.shk-tent');
await p.waitForTimeout(150);
await p.evaluate(() => { const b=document.querySelector('#shk-pop .shk-pbtn'); if(b) b.click(); });
await p.waitForTimeout(200);
ok('🅿 暫定カードを押す→「この暫定を外す」で外れる',
   (await p.evaluate(() => (state.cards[0].inspSchedule||{}).tent || '')) === '', await p.evaluate(() => (state.cards[0].inspSchedule||{}).tent));

/* ===== ③ 帯（行ける枠）は見るだけ（v2.54.0）===== */
await p.evaluate(async () => {
  /* 行ける枠は予約詳細で入れるもの。ここでは中身を直接置いて「表からは触れない」ことだけ見る */
  const d = document.querySelector('#shakencal-body .shk-gcar .shk-gsc.slotcell').closest('.shk-gcar');
  const cells = [...d.querySelectorAll('.shk-gsc')];
  const iso = new Date().toISOString().slice(0,10);
  state.cards[0].inspSchedule.slots = {}; state.cards[0].inspSchedule.tent = '';
  /* 表に出ている最初のマスの日付を使う（休みの日を避けるため、画面から拾う） */
  const first = cells.find(c => c.getAttribute('onclick'));
  const m = /shkTent\('[^']+','([^']+)','([^']+)'\)/.exec(first.getAttribute('onclick')||'');
  state.cards[0].inspSchedule.slots[m ? m[1] : iso] = [m ? m[2] : 'am'];
  renderShaken();
});
await p.waitForTimeout(150);
const barTitle = await p.evaluate(() => (document.querySelector('#shakencal-body .shk-gsc.slotcell .shk-bar')||{}).parentElement.title || '');
ok('帯のマスの吹き出しに「入れ替えは予約詳細から」と書いてある', /予約詳細/.test(barTitle), barTitle);
ok('🔴 帯そのものには吹き出しも押す口も無い',
   (await p.evaluate(() => { const b=document.querySelector('#shakencal-body .shk-bar'); return !!(b && (b.getAttribute('onclick')||b.getAttribute('title'))); })) === false);
await p.click('#shakencal-body .shk-gsc.slotcell .shk-bar');
await p.waitForTimeout(200);
const d1 = await decided();
const s2 = await slots();
console.log('\n■ 帯を押しても決定にも「枠外し」にもならない');
ok('🔴 押しただけでは決定にならない',             d1.decided === '', d1);
ok('🔴 押しても行ける枠は外れない（見るだけ）',   Object.keys(s2).length === 1, s2);
ok('🅿 帯のマスを押すと暫定が置かれる',
   (await p.evaluate(() => (state.cards[0].inspSchedule||{}).tent || '')) !== '');
ok('決定バンドにチップが出ていない',              (await p.evaluate(() => document.querySelectorAll('#shakencal-body .shk-decell .shk-chip').length)) === 0);

/* ===== ④ 決定はドラッグした時だけ ===== */
const dragged = await p.evaluate(async () => {
  /* ⚠ v2.54.0 押しても枠は増えない。**枠は中身に直接置いて**から、その帯を「決定」へドラッグする */
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
  /* ⚠ v2.54.0 押しても枠は増えない＝帯を出すには中身に置く */
  const c2 = document.querySelector('#shakencal-body .shk-gcar[data-card-id="OPS2"] .shk-gsc.slotcell');
  const m2 = /shkTent\('[^']+','([^']+)','([^']+)'\)/.exec(c2.getAttribute('onclick')||'');
  if (m2) { state.cards[1].inspSchedule.slots[m2[1]] = [m2[2]]; renderShaken(); }
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

/* ===== ⑨ v1.124.0 決定の行が画面の外にあっても、掴めば出てきて光る
       （ゆうた「つまめるけど 決定の所がアクティブにならない感じ」） ===== */
const reach = await p.evaluate(async () => {
  const mk = (id) => ({ id, boardId:'default', status:'check', workTypes:['shaken'], customer:id, car:'車',
    plate:'', coverCall:{done:false,at:'',staff:''}, inspSchedule:{ mode:'manual', slots:{}, cutBefore:'', history:[] } });
  state.cards = [...Array(10)].map((_, i) => mk('R' + i));
  window._shakenBase = null; showView('shakencal'); shkClosePop();
  await new Promise(r => setTimeout(r, 250));
  const iso = document.querySelector('.shk-decell[data-iso]').getAttribute('data-iso');
  state.cards.forEach(c => { c.inspSchedule.slots = {}; c.inspSchedule.slots[iso] = ['am']; });
  renderShaken();
  await new Promise(r => setTimeout(r, 250));
  const sc = document.querySelector('.view.active');
  sc.scrollTop = sc.scrollHeight;                       /* 下まで送る＝決定の行は画面の上に隠れる */
  await new Promise(r => setTimeout(r, 150));
  const cell = () => document.querySelector('.shk-decell[data-iso="'+iso+'"][data-slot="am"]').getBoundingClientRect();
  const 掴む前 = Math.round(cell().top);
  const bar = document.querySelector('.shk-gcar[data-card-id="R9"] .shk-bar');
  const rb = bar.getBoundingClientRect();
  const at = (t, x, y) => document.dispatchEvent(new PointerEvent(t, { clientX:x, clientY:y, bubbles:true, pointerType:'mouse', button:0 }));
  bar.dispatchEvent(new PointerEvent('pointerdown', { clientX:rb.x+6, clientY:rb.y+6, bubbles:true, pointerType:'mouse', button:0 }));
  at('pointermove', rb.x + 40, rb.y + 6);               /* 掴んだ（動かし始めた） */
  await new Promise(r => setTimeout(r, 120));
  const 掴んだ後 = Math.round(cell().top);
  const scTop = Math.round(sc.getBoundingClientRect().top);
  /* そのまま決定の枠の真ん中へ運ぶ */
  const rc = cell();
  at('pointermove', rb.x + 40, rc.top + rc.height/2);
  await new Promise(r => setTimeout(r, 120));
  const 光った = !!document.querySelector('.shk-decell.drop');
  at('pointerup', rb.x + 40, rc.top + rc.height/2);
  await new Promise(r => setTimeout(r, 350));
  if (document.querySelector('#shk-pop.show')) shkClosePop();
  return { 掴む前, 掴んだ後, scTop, 光った, 決まった: !!state.cards.find(c => c.id === 'R9').inspSchedule.decided,
           端からの距離: 掴んだ後 - scTop };
});
console.log('\n■ 決定の行が画面の外でも届くか（v1.124.0）');
ok('掴む前は決定の行が画面の上に隠れている',      reach.掴む前 < reach.scTop, reach);
ok('🔴 掴んだ瞬間に決定の行が画面に出てくる',     reach.掴んだ後 > reach.scTop, reach);
ok('🔴 端の帯（40px）より下に出す＝自動スクロールに逃げられない',
   reach.端からの距離 >= 50, reach);
ok('🔴 決定の枠が光る',                           reach.光った, reach);
ok('🔴 そのまま離すと決定になる',                 reach.決まった, reach);

/* ===== ⑩ v1.125.0 落とす枠は「その日の午前／午後の箱いっぱい」
       （ゆうた「決定の行く車のカードに乗せないとだめだった」） ===== */
const box = await p.evaluate(async () => {
  const mk = (id) => ({ id, boardId:'default', status:'check', workTypes:['shaken'], customer:id, car:'車',
    plate:'', coverCall:{done:false,at:'',staff:''}, inspSchedule:{ mode:'manual', slots:{}, cutBefore:'', history:[] } });
  state.cards = [...Array(6)].map((_, i) => mk('B' + i));
  window._shakenBase = null; showView('shakencal'); shkClosePop();
  await new Promise(r => setTimeout(r, 250));
  const cells = Array.from(document.querySelectorAll('.shk-decell[data-iso]'));
  const isoA = cells[0].getAttribute('data-iso');
  /* A日の午前に4台入れて行を背高にする。B0だけ候補にして残す */
  for (let i = 1; i < 6; i++){ state.cards[i].inspSchedule.decided = isoA; state.cards[i].inspSchedule.decidedSlot = 'am'; }
  state.cards[0].inspSchedule.slots = {}; state.cards[0].inspSchedule.slots[isoA] = ['am'];
  renderShaken();
  await new Promise(r => setTimeout(r, 250));
  /* 空いている枠（同じ日の午後）を見る＝背の高い行の中で、中身は空 */
  const empty = document.querySelector('.shk-decell[data-iso="'+isoA+'"][data-slot="pm"]');
  const sc = empty.parentElement;                      /* .shk-sc（その日の午後の箱） */
  const re = empty.getBoundingClientRect(), rs = sc.getBoundingClientRect();
  return { 枠の高さ: Math.round(re.height), 箱の高さ: Math.round(rs.height),
           いっぱい: Math.abs(re.height - rs.height) < 2, isoA,
           下のほう: { x: re.x + re.width/2, y: re.bottom - 12 } };
});
console.log('\n■ 落とす枠は箱いっぱいか（v1.125.0）');
ok('🔴 空の枠が、その日の午前／午後の箱いっぱいに広がる', box.いっぱい, box);
ok('背の高い行でも枠が縮まない（100px以上）',      box.枠の高さ >= 100, box);

/* その空き枠の**いちばん下**（カードが無いところ）へ落として決まるか */
const dropLow = await p.evaluate(async ([isoA, x, y]) => {
  const bar = document.querySelector('.shk-gcar[data-card-id="B0"] .shk-bar');
  const rb = bar.getBoundingClientRect();
  const at = (t, cx, cy) => document.dispatchEvent(new PointerEvent(t, { clientX:cx, clientY:cy, bubbles:true, pointerType:'mouse', button:0 }));
  bar.dispatchEvent(new PointerEvent('pointerdown', { clientX:rb.x+6, clientY:rb.y+6, bubbles:true, pointerType:'mouse', button:0 }));
  at('pointermove', rb.x + 40, rb.y + 6);
  await new Promise(r => setTimeout(r, 120));
  /* 掴んだ後に表が動いているので、枠を測り直して「いちばん下」へ */
  const cell = document.querySelector('.shk-decell[data-iso="'+isoA+'"][data-slot="pm"]');
  const rc = cell.getBoundingClientRect();
  at('pointermove', rc.x + rc.width/2, rc.bottom - 12);
  await new Promise(r => setTimeout(r, 120));
  const 光った = !!document.querySelector('.shk-decell.drop');
  const ゴースト浮いてる = (() => { const g = document.querySelector('.shk-ghostchip');
    return g ? getComputedStyle(g).position === 'absolute' : false; })();
  at('pointerup', rc.x + rc.width/2, rc.bottom - 12);
  await new Promise(r => setTimeout(r, 350));
  if (document.querySelector('#shk-pop.show')) shkClosePop();
  const s = state.cards.find(c => c.id === 'B0').inspSchedule;
  return { 光った, ゴースト浮いてる, decided: s.decided || '', slot: s.decidedSlot || '' };
}, [box.isoA, box.下のほう.x, box.下のほう.y]);
ok('🔴 カードの無いところ（枠の下のほう）でも光る', dropLow.光った, dropLow);
ok('🔴 そこで離すと、その日の午後で決まる',        dropLow.decided === box.isoA && dropLow.slot === 'pm', dropLow);
ok('ゴーストは浮かせて表を伸び縮みさせない',       dropLow.ゴースト浮いてる, dropLow);

/* ===== ⑪ v1.125.0 ブラウザ標準のドラッグの受け口は残っていない ===== */
const clean = await p.evaluate(() => ({
  fn: ['shkDragStart','shkDragEnd','shkOver','shkLeave','shkDrop','shkGanttOver','shkGanttLeave','shkGanttDrop']
        .filter(n => typeof window[n] === 'function'),
  attr: document.querySelectorAll('#shakencal-body [ondragover],#shakencal-body [ondrop],#shakencal-body [ondragleave]').length,
  draggable: document.querySelectorAll('#shakencal-body [draggable="true"]').length
}));
console.log('\n■ ドラッグの作りは1本だけ（v1.125.0）');
ok('🔴 ブラウザ標準のドラッグの受け口を全部消した', clean.fn.length === 0, clean.fn);
ok('画面にも ondragover / ondrop が残っていない',  clean.attr === 0, clean);
ok('draggable="true" のものが無い',                clean.draggable === 0, clean);

/* ===== ⑫ v1.126.0 「済」のスタンプが1枚目でも切れない
       （ゆうた「済みマークが決定のラベルの下に来ちゃってる。1台目に設置したカード」） ===== */
const stamp = await p.evaluate(async () => {
  const mk = (id, n) => ({ id, boardId:'default', status:'check', workTypes:['shaken'], customer:n, car:'車',
    plate:'', coverCall:{done:false,at:'',staff:''}, inspSchedule:{ mode:'manual', slots:{}, cutBefore:'', history:[] } });
  state.cards = [mk('S1','いち'), mk('S2','にい')];
  window._shakenBase = null; showView('shakencal'); shkClosePop();
  await new Promise(r => setTimeout(r, 250));
  const iso = document.querySelector('.shk-decell[data-iso]').getAttribute('data-iso');
  state.cards.forEach(c => { const s = c.inspSchedule;
    s.decided = iso; s.decidedSlot = 'am'; s.result = 'done'; s.resultDate = iso; s.resultSlot = 'am'; });
  renderShaken();
  await new Promise(r => setTimeout(r, 250));
  const chip = document.querySelector('.shk-decell .shk-chip.shk-done');
  const sc = chip.closest('.shk-sc'), row = chip.closest('.shk-decrow');
  const rc = chip.getBoundingClientRect(), rs = sc.getBoundingClientRect();
  const after = getComputedStyle(chip, '::after');
  return {
    スタンプが出る: after.content.indexOf('済') >= 0,
    はみ出す量: Math.round(rs.top - (rc.top - 7)),        /* 7px 上へ出る作り */
    マスが切らない: getComputedStyle(sc).overflow === 'visible',
    行が上に重なる: getComputedStyle(row).zIndex === '1' && getComputedStyle(row).position === 'relative',
    にまい目もある: document.querySelectorAll('.shk-decell .shk-chip.shk-done').length === 2
  };
});
console.log('\n■ 「済」のスタンプ（v1.126.0）');
ok('済のスタンプが出る',                          stamp.スタンプが出る, stamp);
ok('1枚目はマスの上にはみ出す（作りどおり）',      stamp.はみ出す量 > 0, stamp);
ok('🔴 決定の行ははみ出しを切らない',              stamp.マスが切らない, stamp);
ok('🔴 決定の行が「決定」の帯より上に重なる',      stamp.行が上に重なる, stamp);
ok('2枚目のスタンプも今までどおり出る',            stamp.にまい目もある, stamp);

/* ===== ⑬ v1.128.0 車検予定のホバーだけ「車検の詳細」を出す ===== */
const hover = await p.evaluate(async () => {
  state.cards = [{ id:'H1', boardId:'default', status:'check', workTypes:['shaken'], customer:'田中', car:'ハスラー',
    plate:'野田 500 あ 12-34', reserveDate:'2026-08-17', coverCall:{done:false,at:'',staff:''},
    inspSchedule:{ mode:'manual', slots:{}, cutBefore:'', history:[],
      decided:'2026-08-18', decidedSlot:'am', resultStaff:'山田',
      office:'sample_rik_noda', officeName:'野田自動車検査登録事務所', round:2 } }];
  window._shakenBase = null; showView('shakencal'); shkClosePop();
  await new Promise(r => setTimeout(r, 400));
  const read = () => {
    const el = document.querySelector('#pit-hovercard');
    const sec = el ? el.querySelector('.ph-sec-shk') : null;
    const stats = el ? el.querySelector('.ph-stats') : null;
    return { ある: !!sec,
      見出し: sec ? (sec.querySelector('.ph-sec-lb')||{}).textContent.trim() : '',
      行: sec ? Array.from(sec.querySelectorAll('.ph-shk')).map(e => e.textContent.replace(/\s+/g,' ').trim()) : [],
      基本情報の下: !!(sec && stats && (stats.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING)) };
  };
  /* ホバーの中身は pitHoverShow（無ければマウス移動で出す）で組み立てられる */
  const chip = document.querySelector('.shk-decell .shk-chip[data-card-id="H1"]');
  const r = chip.getBoundingClientRect();
  chip.dispatchEvent(new MouseEvent('mouseover', { clientX:r.x+8, clientY:r.y+8, bubbles:true }));
  chip.dispatchEvent(new MouseEvent('mousemove', { clientX:r.x+8, clientY:r.y+8, bubbles:true }));
  await new Promise(res => setTimeout(res, 900));
  const 車検予定 = read();
  /* 未定のときは「未定」と出る */
  const s = state.cards[0].inspSchedule; s.resultStaff=''; s.office=''; s.officeName=''; s.round=0;
  /* ⚠ 同じカードに乗せ直しても中身は作り直されない。**一度離れてから**乗せる（人と同じ動き） */
  chip.dispatchEvent(new MouseEvent('mouseout', { bubbles:true, relatedTarget: document.body }));
  document.body.dispatchEvent(new MouseEvent('mousemove', { clientX:5, clientY:5, bubbles:true }));
  await new Promise(res => setTimeout(res, 600));
  renderShaken();
  await new Promise(res => setTimeout(res, 250));
  const chip2 = document.querySelector('.shk-decell .shk-chip[data-card-id="H1"]');
  const r2 = chip2.getBoundingClientRect();
  chip2.dispatchEvent(new MouseEvent('mouseover', { clientX:r2.x+8, clientY:r2.y+8, bubbles:true }));
  chip2.dispatchEvent(new MouseEvent('mousemove', { clientX:r2.x+8, clientY:r2.y+8, bubbles:true }));
  await new Promise(res => setTimeout(res, 900));
  const 未定のとき = read();
  return { 車検予定, 未定のとき };
});
console.log('\n■ 車検予定のホバーの「車検の詳細」（v1.128.0）');
ok('ホバーに「車検の詳細」が出る',                hover.車検予定.ある && hover.車検予定.見出し === '車検の詳細', hover.車検予定);
ok('🔴 基本情報（3つのタイル）の下にある',        hover.車検予定.基本情報の下, hover.車検予定);
ok('担当・陸運局・R の3行',                       hover.車検予定.行.length === 3, hover.車検予定.行);
ok('担当が出る',                                  /担当（回送）山田/.test(hover.車検予定.行[0]||''), hover.車検予定.行);
ok('陸運局が出る',                                /野田自動車検査登録事務所/.test(hover.車検予定.行[1]||''), hover.車検予定.行);
ok('Rが出る',                                     /2R/.test(hover.車検予定.行[2]||''), hover.車検予定.行);
ok('入っていなければ「未定」と出る',              (hover.未定のとき.行||[]).filter(t => /未定/.test(t)).length === 3, hover.未定のとき.行);

console.log('\n■ JSエラー');
ok('画面のエラーなし', errs.length === 0, errs.slice(0, 3));

console.log('\n────────────  ' + pass + ' OK / ' + fail + ' NG  ────────────');
await b.close();
process.exit(fail ? 1 : 0);
