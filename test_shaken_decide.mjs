/* PitFlow v1.119.0 ── 決定したら「回送の担当・陸運局・R」を入れられる
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-18）
     「決定車両になった時点で 担当者と どこ陸運局か 何Rか を入力できるように。R はラウンドで1〜4。
       陸運局の情報は**コアメンバーズの場所から陸運支局バッジが付いているもの**を引っ張ってくる。
       そしてそれらの情報を**決定した車両カードの下などに拡張で**付けたい」
     追記「担当者というのは**実際に車検に行く、回送の担当者**ね」

   ◎確認した決めごと
     🔴 入力のタイミング＝**決めた瞬間に窓**（日を動かしただけの時は出さない）。あとから直せる
     🔴 担当は今までの「陸運局へ行った人」と**同じ欄**
        ＝MHSの当日ビューと前日LINEの画像にも**前もって**名前が出る
     🔴 陸運局とRは**空でも決定できる**。空なら決定チップに「未定」の印を出す
     🔴 陸運局の一覧は CoreMembers の場所マスターの「陸運局」カテゴリだけ。PitFlowでは作れない

   ◎使い方
     python3 -m http.server 8977      ← 別ウィンドウ
     node test_shaken_decide.mjs                                        */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8977;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.renderShaken && window.pitRikuunList && window.pitShakenOffice', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(1000);

const seed = async () => p.evaluate(async () => {
  state.cards = [{ id:'D1', boardId:'default', status:'check', workTypes:['shaken'],
    customer:'決定', car:'テスト車', plate:'', inspSchedule:{ mode:'manual', slots:{}, cutBefore:'', history:[] } }];
  window._shakenBase = null; showView('shakencal'); shkClosePop();
  document.querySelector('#shakencal-body .shk-gcar .shk-gsc.slotcell').click();
  await new Promise(r => setTimeout(r, 150));
});
/* 帯を「決定」へドラッグする（v1.118.0＝決定はドラッグだけ） */
const dragToDecide = async () => p.evaluate(async () => {
  const bar = document.querySelector('#shakencal-body .shk-bar');
  const iso = bar.getAttribute('data-iso'), slot = bar.getAttribute('data-slot');
  const to = document.querySelector('#shakencal-body .shk-decell[data-iso="'+iso+'"][data-slot="'+slot+'"]');
  const r1 = bar.getBoundingClientRect(), r2 = to.getBoundingClientRect();
  const at=(t,x,y)=>document.dispatchEvent(new PointerEvent(t,{clientX:x,clientY:y,bubbles:true,pointerType:'mouse',button:0}));
  bar.dispatchEvent(new PointerEvent('pointerdown',{clientX:r1.x+4,clientY:r1.y+4,bubbles:true,pointerType:'mouse',button:0}));
  at('pointermove', r1.x+40, r1.y+4);
  at('pointermove', r2.x+r2.width/2, r2.y+r2.height/2);
  at('pointerup',   r2.x+r2.width/2, r2.y+r2.height/2);
  await new Promise(r => setTimeout(r, 400));
  return iso + '|' + slot;
});

/* ===== ① 陸運局の一覧は CoreMembers の「陸運局」バッジだけ ===== */
const rk = await p.evaluate(() => {
  const before = pitRikuunList().map(o => o.name);
  /* CoreMembers の中身を模す＝陸運局・部品商・無効の陸運局・カテゴリ名を作り直した陸運支局 */
  window.__setLocs && __setLocs();
  return { list: before, count: before.length };
});
console.log('\n■ 陸運局の一覧（CoreMembers の場所マスターから）');
ok('陸運局が1件以上ある',                         rk.count >= 1, rk);
ok('引いてくる窓口がある（PitFlowでは作れない）',
   await p.evaluate(() => typeof window.pitRikuunList === 'function' && typeof window.pitLocName === 'function'));
const filt = await p.evaluate(() => {
  /* 部品商・無効の場所は混ざらないこと。＝判定そのものを見る */
  const f = window.pitIsRikuunLoc;
  return {
    陸運局: f({ category:'rikuun', active:true }),
    部品商: f({ category:'parts',  active:true }),
    無効な陸運局: f({ category:'rikuun', active:false }),
    カテゴリ無し: f({ category:'other', active:true })
  };
});
ok('陸運局のバッジは拾う',                        filt.陸運局 === true, filt);
ok('部品商は拾わない',                            filt.部品商 === false, filt);
ok('「有効」が外れている場所は拾わない',          filt.無効な陸運局 === false, filt);
ok('関係ないカテゴリは拾わない',                  filt.カテゴリ無し === false, filt);

/* ===== ② 決めた瞬間に窓が開く ===== */
await seed();
const want = await dragToDecide();
const popup = await p.evaluate(() => {
  const box = document.querySelector('#shk-pop.show');
  return {
    open: !!box,
    title: box ? (box.querySelector('.pdp-head span')||{}).textContent : '',
    staff: !!document.getElementById('shk-staff'),
    office: !!document.getElementById('shk-office'),
    round: !!document.getElementById('shk-round'),
    roundOpts: Array.from(document.querySelectorAll('#shk-round option')).map(o => o.textContent),
    officeOpts: Array.from(document.querySelectorAll('#shk-office option')).map(o => o.textContent),
    staffLabel: Array.from(document.querySelectorAll('.shk-plabel')).map(e => e.textContent),
    完了ボタン: !!Array.from(document.querySelectorAll('.shk-pbtn')).find(b => /完了/.test(b.textContent)),
    あとで: !!Array.from(document.querySelectorAll('.shk-pbtn')).find(b => /あとで/.test(b.textContent))
  };
});
console.log('\n■ 決めた瞬間に窓が開く');
ok('決定したら窓が開く',                          popup.open, popup);
ok('担当・陸運局・R の3つが並ぶ',                 popup.staff && popup.office && popup.round, popup);
ok('担当の見出しが「回送＝実際に車検に行く人」',   popup.staffLabel.some(t => /回送/.test(t) && /行く/.test(t)), popup.staffLabel);
ok('R は 1R〜4R の4つ＋（未定）',                 JSON.stringify(popup.roundOpts) === JSON.stringify(['（未定）','1R','2R','3R','4R']), popup.roundOpts);
ok('陸運局に（未定）が選べる',                    popup.officeOpts[0] === '（未定）', popup.officeOpts);
ok('🔴 決めた直後の窓に「完了」ボタンは出さない', popup.完了ボタン === false, popup);
ok('「あとで入れる」で閉じられる',                popup.あとで === true, popup);

/* ===== ③ 保存すると決定チップの下に出る ===== */
const saved = await p.evaluate(async () => {
  const off = document.querySelector('#shk-office option:nth-child(2)').value;
  const offName = document.querySelector('#shk-office option:nth-child(2)').textContent;
  const st = document.querySelector('#shk-staff option:nth-child(2)').value;
  document.getElementById('shk-staff').value = st;
  document.getElementById('shk-office').value = off;
  document.getElementById('shk-round').value = '3';
  shkSaveFields('D1');
  await new Promise(r => setTimeout(r, 300));
  const s = state.cards[0].inspSchedule;
  const chip = document.querySelector('#shakencal-body .shk-chip[data-card-id="D1"]');
  return { 入れた: { staff: st, office: off, offName },
           保存: { staff: s.resultStaff, office: s.office, officeName: s.officeName, round: s.round },
           拡張: chip ? Array.from(chip.querySelectorAll('.shk-meta .shk-mt')).map(e => e.textContent) : null,
           窓が閉じた: !document.querySelector('#shk-pop.show'),
           フロー: (state.cards[0].log || []).map(f => f.label || '').join(' / ') };
});
console.log('\n■ 保存すると決定チップの下に出る');
ok('担当が保存される（＝陸運局へ行った人と同じ欄）', saved.保存.staff === saved.入れた.staff, saved);
ok('陸運局が id で保存される',                    saved.保存.office === saved.入れた.office, saved);
ok('陸運局の名前も控えとして残す',                saved.保存.officeName === saved.入れた.offName, saved);
ok('R が数字で保存される',                        saved.保存.round === 3, saved);
ok('窓が閉じる',                                  saved.窓が閉じた, saved);
ok('決定チップの下に3つとも出る',
   saved.拡張 && saved.拡張.length === 3 && saved.拡張.includes(saved.入れた.staff)
   && saved.拡張.includes(saved.入れた.offName) && saved.拡張.includes('3R'), saved.拡張);
ok('フローに1行残る',                             /回送/.test(saved.フロー) && /3R/.test(saved.フロー), saved.フロー);

/* ===== ④ MHS・LINE と同じ物差しから引ける ===== */
const share = await p.evaluate(() => {
  const s = state.cards[0].inspSchedule;
  const rows = pitShakenOnDate(state.cards, s.decided);
  const r = rows[0] || {};
  return { staff: r.staff, office: r.office, round: r.round,
           byFn: { staff: pitShakenStaff(state.cards[0]), office: pitShakenOffice(state.cards[0]), round: pitShakenRound(state.cards[0]) } };
});
console.log('\n■ 物差しは1本（MHS・前日LINEの画像も同じ答えになる）');
ok('その日の車検予定に担当が乗る',                !!share.staff, share);
ok('その日の車検予定に陸運局が乗る',              !!share.office, share);
ok('その日の車検予定にRが乗る',                   share.round === 3, share);
ok('直接引いても同じ答え',                        share.staff === share.byFn.staff && share.office === share.byFn.office, share);

/* ===== ⑤ 空なら「未定」の印（ゆうた確定） ===== */
const tbd = await p.evaluate(async () => {
  const s = state.cards[0].inspSchedule;
  s.resultStaff = ''; s.office = ''; s.officeName = ''; s.round = 0;
  renderShaken();
  const chip = document.querySelector('#shakencal-body .shk-chip[data-card-id="D1"]');
  const marks = Array.from(chip.querySelectorAll('.shk-meta .shk-mt.tbd')).map(e => e.textContent);
  /* 済にすると「未定」は出さない（終わった話なので） */
  s.result = 'done'; s.resultDate = s.decided; s.resultSlot = s.decidedSlot;
  renderShaken();
  const chip2 = document.querySelector('#shakencal-body .shk-chip[data-card-id="D1"]');
  const done = chip2 ? chip2.querySelectorAll('.shk-meta .shk-mt.tbd').length : -1;
  s.result = ''; s.resultDate = ''; renderShaken();
  return { marks, doneTbd: done };
});
console.log('\n■ 空なら「未定」の印');
/* 🔴 v1.123.0 未定は**1枚にまとめる**（3枚並べるとチップが縦に伸びて、下の行が画面外へ押し出される） */
ok('未定の印は1枚にまとめる',                     tbd.marks.length === 1, tbd.marks);
ok('足りないものが名指しで出る（R・回送・陸運局）', tbd.marks[0] === '未定 R・回送・陸運局', tbd.marks);
ok('🔴 済んだ車には「未定」を出さない',           tbd.doneTbd === 0, tbd);

/* ===== ⑥ 日を動かしただけの時は窓を出さない／中身は消えない ===== */
const moved = await p.evaluate(async () => {
  const s = state.cards[0].inspSchedule;
  s.resultStaff = '山田'; s.office = 'X'; s.officeName = 'テスト陸運局'; s.round = 2;
  renderShaken(); shkClosePop();
  const chip = document.querySelector('#shakencal-body .shk-chip[data-card-id="D1"]');
  /* すでに決定している車を、別の空いている決定枠へドラッグする */
  const cells = Array.from(document.querySelectorAll('#shakencal-body .shk-decell[data-iso]'));
  const to = cells.find(c => c.getAttribute('data-iso') !== s.decided || c.getAttribute('data-slot') !== s.decidedSlot);
  const r1 = chip.getBoundingClientRect(), r2 = to.getBoundingClientRect();
  const at=(t,x,y)=>document.dispatchEvent(new PointerEvent(t,{clientX:x,clientY:y,bubbles:true,pointerType:'mouse',button:0}));
  chip.dispatchEvent(new PointerEvent('pointerdown',{clientX:r1.x+4,clientY:r1.y+4,bubbles:true,pointerType:'mouse',button:0}));
  at('pointermove', r1.x+40, r1.y+4);
  at('pointermove', r2.x+r2.width/2, r2.y+r2.height/2);
  at('pointerup',   r2.x+r2.width/2, r2.y+r2.height/2);
  await new Promise(r => setTimeout(r, 400));
  const s2 = state.cards[0].inspSchedule;
  return { 窓: !!document.querySelector('#shk-pop.show'),
           staff: s2.resultStaff, office: s2.office, officeName: s2.officeName, round: s2.round,
           動いた: s2.decided + '|' + s2.decidedSlot };
});
console.log('\n■ 日を動かしただけの時');
ok('🔴 窓は出さない（毎回聞かれない）',           moved.窓 === false, moved);
ok('担当・陸運局・R は消えずに持ち回る',          moved.staff === '山田' && moved.officeName === 'テスト陸運局' && moved.round === 2, moved);

/* ===== ⑦ あとから決定チップを押して直せる ===== */
const later = await p.evaluate(async () => {
  const chip = document.querySelector('#shakencal-body .shk-chip[data-card-id="D1"]');
  chip.click();
  await new Promise(r => setTimeout(r, 200));
  const has = { staff: !!document.getElementById('shk-staff'), office: !!document.getElementById('shk-office'), round: !!document.getElementById('shk-round') };
  const btns = Array.from(document.querySelectorAll('.shk-pbtn')).map(b => b.textContent);
  document.getElementById('shk-round').value = '4';
  shkSaveFields('D1');
  await new Promise(r => setTimeout(r, 250));
  return { has, btns, round: state.cards[0].inspSchedule.round };
});
console.log('\n■ あとから直せる');
ok('チップを押したメニューにも3つが並ぶ',         later.has.staff && later.has.office && later.has.round, later.has);
ok('そのメニューには完了・再検も今までどおりある', later.btns.some(t=>/完了/.test(t)) && later.btns.some(t=>/再検/.test(t)), later.btns);
ok('直した R が保存される',                       later.round === 4, later);

console.log('\n■ JSエラー');
ok('画面のエラーなし', errs.length === 0, errs.slice(0, 3));

console.log('\n────────────  ' + pass + ' OK / ' + fail + ' NG  ────────────');
await b.close();
process.exit(fail ? 1 : 0);
