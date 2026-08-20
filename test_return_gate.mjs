/* PitFlow v1.132.0 ── 返車系への入口は「完TELのドラッグ」だけ
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-18）
     「タスクボード上にある時に**確定金額や返車確定日を入れても自動で返車に移動しない**ようにしてほしい。
       **返車系へは全て完TEL依頼か完TEL済みのドラッグを通っていく**ように」
     （きっかけ＝誤操作で1台が「返車日未定」に入り、タスクボードから消えた）

   ◎決めごと
     🔴 **昇格してよいのは、すでに返車系にいる車だけ**（`returnStage` が付いている車）。
     　　盤面の車は日付を持てるが**盤面に残す**。その日付は完TELを通ったとき確定返車日として使われる。
     🔴 **確定金額は返車と無関係**（前から returnStage を触っていない）。ここも見張る。
     🔴 完TEL待ち（callWait）の車に日付や時間を入れたら**返車待ちへ上がる**（v1.71.0）。ここは残す。
     🔴 **待ち・当日返し**の車は今までどおり（ゆうた 2026-08-18 確認「いまのまま残す」）
     　　＝完TEL前でも入庫日に返車カレンダーへ出る／返る日を過ぎたら「返車日未定」に出る。
     　　⚠ ただし**データは書き換えない**（returnStage は付かない＝盤面から消えない）。

   ◎使い方
     python3 -m http.server 8985      ← 別ウィンドウ
     node test_return_gate.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8985;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitReturnSetDateTime && window.pitReturnPlace', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(900);

/* テスト用のカードを撒く共通処理 */
const seed = async () => await p.evaluate(() => {
  const t = new Date(); t.setHours(0,0,0,0);
  const q = n => (n<10?'0':'')+n;
  const iso = d => d.getFullYear()+'-'+q(d.getMonth()+1)+'-'+q(d.getDate());
  const add = n => { const d = new Date(t); d.setDate(d.getDate()+n); return iso(d); };
  window._T = { today: iso(t), tomo: add(1), yest: add(-1) };
  const mk = (id, o) => Object.assign({
    id, boardId:'default', status:'work', workTypes:['seibi'], customer:'テスト'+id, car:'テスト車',
    reserveDate: add(-2), dropType:'keep', returnStage:'', returnDate:'', returnTime:'',
    coverCall:{done:false,at:'',staff:''}
  }, o);
  state.cards = [
    mk('B1'),                                                        /* 盤面・作業待ち（預かり） */
    mk('B2', { status:'workDone' }),                                 /* 盤面・作業完了済（預かり） */
    mk('C1', { returnStage:'callWait', status:'workDone' }),         /* 完TEL待ち */
    mk('D1', { returnStage:'returnWait', status:'workDone' }),       /* 返車日未定 */
    mk('W1', { dropType:'wait', reserveDate: window._T.today }),     /* 待ち（当日返し）・今日入庫 */
    mk('W2', { dropType:'wait', reserveDate: window._T.yest })       /* 待ち・返る日を過ぎてまだ手元 */
  ];
  return window._T;
});
const T = await seed();
const card = async id => await p.evaluate(i => {
  const c = state.cards.find(x => x.id === i);
  return c ? { returnStage:c.returnStage, returnDate:c.returnDate, returnTime:c.returnTime,
               status:c.status, 行き先: pitReturnPlace(c), 一覧日: pitReturnListDate(c, window._T.today) } : null;
}, id);

/* ===== ① 盤面の車に確定返車日を入れても、盤面に残る ===== */
console.log('\n■ 🔴 盤面の車に確定返車日を入れる');
const b1 = await p.evaluate(() => { const c = state.cards.find(x=>x.id==='B1');
  pitReturnSetDateTime(c, window._T.tomo, undefined); return null; });
const B1 = await card('B1');
ok('🔴 返車へ上がらない（returnStage は空のまま）', !B1.returnStage, B1);
ok('🔴 返車系のどこにも出ない（行き先＝なし）',      B1.行き先 === null, B1);
ok('🔴 返車の一覧にも日を持たない',                  B1.一覧日 === '', B1);
ok('入れた日付そのものは残る（無駄にならない）',      B1.returnDate === T.tomo, B1);

/* 時間だけ入れた場合も上がらない（v1.71.0 の道が盤面に効かないこと） */
await p.evaluate(() => pitReturnSetDateTime(state.cards.find(x=>x.id==='B2'), undefined, '15:00'));
const B2t = await card('B2');
ok('🔴 時間だけ入れても上がらない',                  !B2t.returnStage && B2t.行き先 === null, B2t);

/* ===== ② 確定金額を入れても盤面に残る ===== */
console.log('\n■ 🔴 盤面の車に確定金額を入れる');
const B2 = await p.evaluate(() => {
  const c = state.cards.find(x=>x.id==='B2'); c.amountFinal = 88000;
  return { returnStage:c.returnStage, 行き先: pitReturnPlace(c), 金額:c.amountFinal };
});
ok('🔴 返車へ上がらない',                            !B2.returnStage && B2.行き先 === null, B2);
ok('金額は入る',                                     B2.金額 === 88000, B2);

/* ===== ③ 完TELを通った車は今までどおり動く ===== */
console.log('\n■ 完TELを通った車（ここは壊さない）');
await p.evaluate(() => pitReturnSetDateTime(state.cards.find(x=>x.id==='C1'), window._T.tomo, '10:00'));
const C1 = await card('C1');
ok('完TEL待ち＋日時 → 返車待ちへ上がる（v1.71.0）',  C1.returnStage === 'returnWait', C1);
ok('日も時間もそろえば返車カレンダーへ',              C1.行き先 === 'calendar', C1);
await p.evaluate(() => pitReturnSetDateTime(state.cards.find(x=>x.id==='D1'), window._T.tomo, undefined));
const D1 = await card('D1');
ok('返車日未定に日を入れると時間未定へ',              D1.returnStage === 'returnWait' && D1.行き先 === 'timeTbd', D1);

/* ===== ④ 入口＝完TELのドラッグ ===== */
console.log('\n■ 🔴 入口は完TEL依頼／完TEL済のドラッグだけ');
await seed();
const req = await p.evaluate(async () => {
  showView('task'); await new Promise(r=>setTimeout(r,300));
  const 枠がある = !!document.querySelector('[data-drop="callReq"]') && !!document.querySelector('[data-drop="callDone"]');
  /* 完TEL依頼の枠へドロップ＝dnd.js が通る道をそのまま呼ぶ */
  applyCardDrop('B1', 'callReq', '');
  await new Promise(r=>setTimeout(r,350));
  const 窓 = !!document.getElementById('rp-ok');
  if (document.getElementById('rp-ok')) PitReturnPopup.close(true);   /* 「返車へ」を押す */
  await new Promise(r=>setTimeout(r,350));
  const c = state.cards.find(x=>x.id==='B1');
  return { 枠がある, 窓, returnStage:c.returnStage, 行き先: pitReturnPlace(c) };
});
ok('完TEL依頼・完TEL済のドロップ枠がある',           req.枠がある, req);
ok('ドロップすると窓が開く',                         req.窓, req);
ok('🔴 窓でOKして初めて完TEL待ちへ入る',             req.returnStage === 'callWait' && req.行き先 === 'callWait', req);

await seed();
const done = await p.evaluate(async () => {
  showView('task'); await new Promise(r=>setTimeout(r,300));
  applyCardDrop('B2', 'callDone', '');
  await new Promise(r=>setTimeout(r,350));
  const d = document.getElementById('rp-date'); if (d){ d.value = window._T.tomo; PitReturnPopup.onDate(); }
  if (document.getElementById('rp-ok')) PitReturnPopup.close(true);
  await new Promise(r=>setTimeout(r,400));
  const c = state.cards.find(x=>x.id==='B2');
  return { returnStage:c.returnStage, returnDate:c.returnDate, 行き先: pitReturnPlace(c), 完TEL:c.coverCall&&c.coverCall.done };
});
ok('🔴 完TEL済のドラッグで返車待ちへ入る',           done.returnStage === 'returnWait', done);
ok('完TELの印も付く',                                done.完TEL === true, done);
ok('入れた日付が確定返車日になる',                   done.returnDate === T.tomo, done);

/* ===== ⑤ 待ち・当日返しは今までどおり（ゆうた「いまのまま残す」） ===== */
console.log('\n■ 待ち・当日返し（今までどおり）');
const W1 = await card('W1'), W2 = await card('W2');
ok('🔴 待・当は完TEL前でも当日の返車一覧に出る',      W1.一覧日 === T.today, W1);
ok('🔴 でも盤面から消えない（returnStage は空）',     !W1.returnStage, W1);
ok('🔴 返る日を過ぎた待・当は「返車日未定」に出る',   W2.行き先 === 'dateTbd', W2);
ok('🔴 それでも盤面から消えない',                     !W2.returnStage, W2);

/* ===== ⑥ 実物の画面：予約詳細で確定返車日を入れても盤面に残る ===== */
console.log('\n■ 🔴 実物の画面でやってみる（関数を呼ぶだけにしない）');
await seed();
const real = await p.evaluate(async () => {
  showView('task');
  await new Promise(r => setTimeout(r, 350));
  const 前 = !!document.querySelector('#view-task [data-card-id="B2"]');
  openDetail('B2');
  await new Promise(r => setTimeout(r, 450));
  const el = document.getElementById('cv-retdate');
  if (!el) return { 前, 欄がある:false };
  el.value = window._T.tomo;
  el.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 350));
  if (window.closeDetail) closeDetail();
  showView('task');
  await new Promise(r => setTimeout(r, 400));
  const c = state.cards.find(x=>x.id==='B2');
  const 後 = !!document.querySelector('#view-task [data-card-id="B2"]');
  /* ⚠ 入れた日は「明日」なので、返車カレンダーも明日に合わせて見る（今日のままだと当然出ない） */
  showView('return');
  await new Promise(r => setTimeout(r, 250));
  state.returnRange = 'day';
  state.returnDate = new Date(window._T.tomo + 'T00:00:00');
  renderReturn();
  await new Promise(r => setTimeout(r, 400));
  const el2 = document.querySelector('#view-return [data-card-id="B2"]');
  return { 前, 欄がある:true, 後, 返車に出る: !!el2,
           未完: !!(el2 && el2.classList.contains('is-retpend')),
           つかめない: !!(el2 && el2.getAttribute('draggable') === 'false'),
           returnStage:c.returnStage, returnDate:c.returnDate };
});
ok('もともとタスクボードに出ている',                 real.前, real);
ok('確定返車日の欄が出ている',                       real.欄がある, real);
ok('🔴 日付を入れてもタスクボードに残る',            real.後, real);
/* 🔄 v1.149.0（ゆうた指定 2026-08-19）ここは**わざと変えた**。
   v1.132.0〜v1.148.0 は「返車ビューに出てこない」だった。
   いまは **「未完」としてグレーで出る**（見えるだけ・つかめない）。
   ⚠ 変わっていないのは **盤面から消えないこと／returnStage が空のまま**＝関門そのもの。 */
ok('🔴 返車ビューに「未完」として出る（v1.149.0）',  real.返車に出る && real.未完, real);
ok('🔴 でもつかめない（見えるだけ）',                real.つかめない, real);
ok('🔴 returnStage は空のまま',                      !real.returnStage, real);
ok('日付は保存されている',                           real.returnDate === T.tomo, real);

/* ===================================================================
   ↩ v1.137.0（ゆうた確定・2026-08-18）完TELを通った車の ⋮ ＝3択
   -------------------------------------------------------------------
   🗣「予約に戻すはなしで。盤面もタスクボードの名称で。
      なのでタスクボードに戻す と売上なしアーカイブ、消去 の3択で」
   ◎なぜ
     入る道はドラッグ1つなのに、出る道が「予約まで全部戻す」しかなかった。
     押すと工程・完TEL・返車の予定・確定売上・実績日・PIT枠がまとめて消える＝重すぎる。
   =================================================================== */
console.log('\n■ ⋮ 完TELを通った車は3択（v1.137.0）');
{
  const put = over => p.evaluate(o => {
    const ymd = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    state.cards = [Object.assign({
      id:'RG1', resNo:'R-RG1', customer:'関門 太郎', car:'ノート', boardId:'default', division:'div1',
      workType:'general', dropType:'drop', status:'workDone', reserveDate: ymd(new Date()),
      returnStage:'returnWait', returnDate: ymd(new Date()), returnTime:'16:00',
      amountFinal: 55000, bayId:null, log:[]
    }, o || {})];
    openDetail('RG1');
    const m = document.getElementById('cv-optmenu');
    return m ? m.innerHTML : '';
  }, over);
  const closeIt = () => p.evaluate(() => { if (window.closeDetail) closeDetail(); });

  const m = await put();
  ok('🔴 「タスクボードに戻す」が出る', /タスクボードに戻す/.test(m), m);
  ok('🔴 「入庫を取り消して予約に戻す」は出さない', !/予約に戻す/.test(m), m);
  ok('「売上なしでアーカイブする」は出る', /売上なしでアーカイブする/.test(m), '');
  ok('「消去する」は出る', /消去する/.test(m), '');
  ok('🔴 ちょうど3択', (m.match(/<button/g) || []).length === 3, (m.match(/<button/g) || []).length);
  await closeIt();

  /* まだタスクボードにいる車は、今までどおり「入庫を取り消して予約に戻す」 */
  const m2 = await put({ returnStage: null, returnDate: '', returnTime: '' });
  ok('タスクボードの車は「入庫を取り消して予約に戻す」のまま', /入庫を取り消して予約に戻す/.test(m2), m2);
  ok('タスクボードの車に「タスクボードに戻す」は出さない', !/タスクボードに戻す/.test(m2), '');
  await closeIt();

  /* 実際に戻す＝returnStage だけ消える */
  await put();
  const r = await p.evaluate(() => {
    window.cvBackToBoard();
    const c = state.cards.find(x => x.id === 'RG1');
    return { rs: c.returnStage, st: c.status, date: c.returnDate, time: c.returnTime,
             amt: c.amountFinal, tier: window.pitSalesTier ? pitSalesTier(c) : null,
             place: window.pitReturnPlace ? pitReturnPlace(c) : null,
             flow: (c.log || []).map(x => x.label || x.text || '').join(' / ') };
  });
  ok('🔴 完TELの印だけ消える', !r.rs, r);
  ok('🔴 工程は「作業完了済」のまま（タスクボードへ戻る）', r.st === 'workDone', r);
  ok('🔴 返車の予定日・時間は残す（入れ直しにさせない）', r.date && r.time === '16:00', r);
  ok('🔴 確定金額も残す', r.amt === 55000, r);
  ok('🔴 売上の区分は動かない（どちらも「確定」）', r.tier === 'confirmed', r);
  /* ⚠ v1.149.0 …「完TEL待ち／返車日未定／返車カレンダー」という**返車系の箱からは外れる**（place=null）。
     　 ただし確定返車日を持ったまま作業完了に戻るので、**カレンダーには「未完」でグレーに出る**。
     　 ＝箱に入っているか（place）と、一覧に出るか（pitReturnListDate）は別もの。混ぜない。 */
  ok('🔴 返車系の箱からは外れる（未完としてカレンダーには出る）', r.place === null, r);
  ok('フローに残る', /完TELを取り消して/.test(r.flow), r.flow);
  await closeIt();

  /* 完TELを通っていない車では、呼んでも何もしない */
  await put({ returnStage: null });
  const r2 = await p.evaluate(() => {
    const before = JSON.stringify(state.cards[0]);
    window.cvBackToBoard();
    return before === JSON.stringify(state.cards[0]);
  });
  ok('🔴 完TELを通っていない車では何もしない', r2 === true, '');
  await closeIt();

  /* returnStage を消す道が増えすぎていないか（いまは2本＝予約に戻す／タスクボードに戻す） */
  const cv = fs.readFileSync('js/card-view.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  /* ⚠ `c.returnStage = ''` は「空なら空にそろえる」正規化なので数えない。消しているのは null のほう。 */
  const n = (cv.match(/returnStage\s*=\s*null/g) || []).length;
  ok('🔴 returnStage を消す道は2本だけ（予約に戻す／タスクボードに戻す）', n === 2, n);
  const rs = fs.readFileSync('js/return-slot.js', 'utf8');
  ok('🔴 「返車済みの取り消し」という無い機能の記述が残っていない', !/「返車済みの取り消し」で完TEL待ちに戻せなくなる/.test(rs), '');
}

console.log('\n■ JSエラー');
ok('画面のエラーなし', errs.length === 0, errs.slice(0, 3));

console.log('\n────────────  ' + pass + ' OK / ' + fail + ' NG  ────────────');
await b.close();
process.exit(fail ? 1 : 0);
