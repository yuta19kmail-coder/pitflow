/* PitFlow v2.115.0 ── 予約詳細を開いたままデータが届いても、編集フォームに化けない
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-09-14）
     「予約詳細から編集で保存して、予約詳細に戻って、放っておく。
       恐らくデータ受信のタイミングで予約詳細カードの表示がバグる。
       予約詳細編集画面？かなが変な拡大表示で出ちゃう」

   ◎正体
     MHS の予定・定休日カレンダーが届くと `pitCardRepaint` が呼ばれ、
     開いているカードを**いつも編集フォームで**描いていた＝予約詳細の枠の中に編集フォームが出た。

   ◎この試験が見張るもの
     🔴 予約詳細（見る画面）を開いている時に届いても、予約詳細のまま
     🔴 「予約を編集」している時は、今までどおり編集フォームを描き直す（中身は消えない）
     🔴 編集を「保存する」で抜けて予約詳細に戻ったあと届いても、予約詳細のまま
     🔴 全画面の新規予約は、今までどおり描き直す

   ◎使い方
     python -m http.server 8994      ← 別ウィンドウ
     node _見張り/test_card_repaint_view.mjs                              */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const PORT = process.env.PORT || 8994;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: chromePath() });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.openDetail && window.pitCardRepaint && window.openCardEditForm && window.pitCardEditSave', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(900);

const id = await p.evaluate(() => {
  const c = (state.cards || []).find(x => x && x.status === 'check' && !x._draft) || (state.cards || []).find(x => x && !x._draft);
  return c ? c.id : null;
});
ok('試すカードがある', !!id, id);

/* いまモーダルの中身が何か */
const look = async () => await p.evaluate(() => {
  const body = document.getElementById('md-body-modal');
  const box = document.querySelector('#modal-detail .modal-box');
  return {
    詳細: !!(body && body.querySelector('.cv-root')),
    フォーム: !!(body && body.querySelector('.cf-recall')),
    cardview枠: !!(box && box.classList.contains('cardview')),
    編集中: !!(window.pitCardEditing && pitCardEditing())
  };
});
const 届いた = async () => { await p.evaluate(() => pitCardRepaint()); await p.waitForTimeout(200); };

console.log('\n■ ① 予約詳細を開いているだけ');
await p.evaluate(i => openDetail(i), id);
await p.waitForTimeout(500);
let s = await look();
ok('予約詳細が出ている', s.詳細 && !s.フォーム, s);
await 届いた();
s = await look();
ok('🔴 データが届いても予約詳細のまま（編集フォームに化けない）', s.詳細 && !s.フォーム && s.cardview枠, s);

console.log('\n■ ② 予約を編集している時');
await p.evaluate(i => openCardEditForm(i), id);
await p.waitForTimeout(400);
await p.evaluate(() => { const el = document.querySelector('#md-body-modal [data-key="memo"], #md-body-modal textarea'); if (el) el.setAttribute('data-probe', '1'); });
s = await look();
ok('編集フォームが出ている', s.フォーム && s.編集中, s);
await 届いた();
s = await look();
ok('🔴 編集中は今までどおり描き直す（フォームのまま）', s.フォーム && s.編集中 && !s.詳細, s);

console.log('\n■ ③ 「保存する」で予約詳細に戻ったあと');
await p.evaluate(() => pitCardEditSave());
await p.waitForTimeout(500);
s = await look();
ok('予約詳細に戻っている', s.詳細 && !s.フォーム && !s.編集中, s);
await 届いた();
s = await look();
ok('🔴 戻ったあとに届いても予約詳細のまま（今回の報告そのもの）', s.詳細 && !s.フォーム && s.cardview枠, s);

console.log('\n■ ④ 全画面の新規予約');
await p.evaluate(() => { if (window.closeDetail) closeDetail(); });
await p.waitForTimeout(300);
const pg = await p.evaluate(async () => {
  if (!window.openNewReserve) return { skip: true };
  openNewReserve();
  await new Promise(r => setTimeout(r, 400));
  const body = document.getElementById('md-body');
  const before = body ? body.innerHTML.length : 0;
  if (body) body.innerHTML = '';           /* 空にしてから届かせる＝描き直したら中身が戻る */
  pitCardRepaint();
  return { skip: false, before, after: body ? body.innerHTML.length : 0, view: state.currentView };
});
if (pg.skip) ok('（新規予約の入口が無いので飛ばす）', true);
else ok('🔴 全画面の新規予約は今までどおり描き直す', pg.view === 'card' && pg.after > 0, pg);

ok('画面のエラーが無い', errs.length === 0, errs);
console.log('\n' + (fail ? '❌' : '✅') + ' ' + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail ? 1 : 0);
