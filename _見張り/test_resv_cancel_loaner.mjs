/* PitFlow v1.154.0 ── 予約をキャンセルしたら、代車の予定も一緒に外れる
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-08-20）
     「**予約をキャンセルした場合に代車の予定が同時にキャンセルにならない**」

   ◎なにが起きていたか
     予約をキャンセルしても代車カレンダーの予定だけが残り続け、
     **来ない車のために代車が押さえられたまま**になっていた。
     カードは箱から消えているので**誰も気づけないし、外す道もほぼ無い**。

   ◎決めごと
     🔴 外す口は **loaner.js の `pitLoanerReleaseForCard` 1本**。通るのは**人が決めた時と、もう戻らない時だけ**
        ①予約キャンセル（人が押した）②カードの消去
        ③未入庫の一覧の「代車予定クリア」（人が押した）④30日たって自動アーカイブされる時
     🔴🔴 **未入庫に入る時点では外さない**（v1.155.0・ゆうた確定）
        🗣「2・3 は勘違いしてくるってパターンが結構あるから、未入庫に入る時点では残しておいて」
        ＝ 来なかったように見えても、あとから連絡が来てそのまま入庫することがよくある
     🔴 **返却済みの貸出は不可侵**（2026-08-19 の決めごと L1）＝1文字も触らない
     🔴 カード側の代車の設定も空にする＝手で押す「代車キャンセル」と**同じ答え**にする
     🔴 押す前に**何が消えるかを言う**（窓に代車名と期間を出す）

   ◎使い方
     python3 -m http.server 8995      ← 別ウィンドウ
     node test_resv_cancel_loaner.mjs                                   */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8995;
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
await p.waitForFunction('window.state && window.pitLoanerReleaseForCard && window.pitLoanerPlanOf', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(900);

/* 撒くもの
     代車 L1 … 貸せる代車1台
     R1 … 予約・代車あり（まだ貸していない）        → キャンセルで外れる
     R2 … 予約・代車あり（すでに返却済み）          → 🔴 何があっても触らない
     R3 … 予約・代車なし                            → 何も起きない
     R4 … 予約・代車あり（入庫日が過ぎている）      → 自動の未入庫で外れる                */
const seed = async () => await p.evaluate(() => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const q = n => (n < 10 ? '0' : '') + n;
  const iso = d => d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate());
  const add = n => { const d = new Date(t); d.setDate(d.getDate() + n); return iso(d); };
  window._T = { today: iso(t), tomo: add(1), yest: add(-1) };
  state.loaners = [{ id: 'L1', name: '代車5', number: 5, model: 'タント', retired: false }];
  const mk = (id, o) => Object.assign({
    id, resNo: 'R-' + id, boardId: 'default', division: 'div1', status: 'reserved',
    workType: 'general', workTypes: ['general'], customer: 'キャンセル' + id, car: 'テスト車',
    reserveDate: window._T.today, reserveTime: '09:00', dropType: 'drop',
    needLoaner: false, loanerId: '', loanerFrom: '', loanerTo: '', loanerFixed: false, log: []
  }, o);
  state.cards = [
    mk('R1', { needLoaner: true, loanerId: 'L1', loanerFrom: window._T.today, loanerTo: window._T.tomo }),
    mk('R2', { needLoaner: true, loanerId: 'L1', loanerFrom: window._T.yest, loanerTo: window._T.today, loanerReturned: true }),
    mk('R3', {}),
    mk('R4', { needLoaner: true, loanerId: 'L1', loanerFrom: window._T.yest, loanerTo: window._T.tomo, reserveDate: window._T.yest })
  ];
  state.loanerAssigns = [
    { id: 'A1', cardId: 'R1', loanerId: 'L1', fromDate: window._T.today, toDate: window._T.tomo, returned: false },
    { id: 'A2', cardId: 'R2', loanerId: 'L1', fromDate: window._T.yest,  toDate: window._T.today, returned: true, returnedAt: window._T.today },
    { id: 'A4', cardId: 'R4', loanerId: 'L1', fromDate: window._T.yest,  toDate: window._T.tomo, returned: false }
  ];
  return window._T;
});
const T = await seed();
const look = async id => await p.evaluate(i => {
  const c = state.cards.find(x => x.id === i) || null;
  const as = (state.loanerAssigns || []).filter(x => x.cardId === i);
  return { ある: !!c, status: c && c.status, needLoaner: c && c.needLoaner, loanerId: c && c.loanerId,
           貸出: as.length, 返却済み: as.filter(x => x.returned).length };
}, id);

/* ===== ① 見るだけ（窓に出す文字） ===== */
console.log('\n■ 何が消えるかを先に言える');
const plan = await p.evaluate(() => ({
  R1: pitLoanerPlanOf('R1'), R2: pitLoanerPlanOf('R2'), R3: pitLoanerPlanOf('R3')
}));
ok('代車の予定がある車は件数と名前が出る', plan.R1.n === 1 && /タント/.test(plan.R1.text), plan.R1);
ok('期間も出る', /\d+\/\d+/.test(plan.R1.text), plan.R1);
ok('🔴 返却済みだけの車は「外すもの無し」', plan.R2.n === 0, plan.R2);
ok('代車なしの車も0件', plan.R3.n === 0, plan.R3);
ok('🔴 見るだけで何も変えない', (await look('R1')).貸出 === 1);

/* ===== ①-2 押す前に「何が消えるか」を窓に出す（実物の画面で） ===== */
console.log('\n■ 🔴 押す前に何が消えるかを言う');
await seed();
const win = await p.evaluate(async () => {
  openDetail('R1'); await new Promise(r => setTimeout(r, 700));
  cvAskCancelResv(); await new Promise(r => setTimeout(r, 700));
  const box = document.querySelector('.modal-backdrop.show, #pit-ask, .ui-dlg');
  const t = (box ? box.innerText : '') + '\n' + document.body.innerText;
  /* 開いた窓は閉じる（✕ を押した扱い＝何も変わらないこと自体もあとで見る） */
  document.querySelectorAll('.modal-backdrop.show').forEach(x => x.classList.remove('show'));
  if (window.closeDetail) closeDetail();
  return t;
});
ok('🔴 窓に「代車の予定も一緒にキャンセル」と書いてある', /代車の予定も一緒にキャンセル/.test(win), win.slice(0, 300));
ok('🔴 代車の名前と期間も書いてある', /タント（?5|タント/.test(win));
ok('🔴 「戻しても代車は戻りません」と言っている', /戻しても代車は戻りません/.test(win));
ok('🔴 ✕ で閉じただけなら何も変わらない', (await look('R1')).貸出 === 1);

/* ===== ② 予約キャンセル（人が押した） ===== */
console.log('\n■ 🔴 予約キャンセル（人が押した）');
await seed();
const c1 = await p.evaluate(async () => {
  openDetail('R1'); await new Promise(r => setTimeout(r, 400));
  cvCancelResv('日程変更');
  await new Promise(r => setTimeout(r, 400));
  const c = state.cards.find(x => x.id === 'R1');
  return { status: c.status, cancelled: c.cancelled, needLoaner: c.needLoaner, loanerId: c.loanerId,
           貸出: (state.loanerAssigns || []).filter(x => x.cardId === 'R1').length,
           フロー: (c.log || []).map(x => x.label || x.text || '').join(' / ') };
});
ok('予約キャンセルになる', c1.status === 'cancelled' && c1.cancelled === true, c1);
ok('🔴 代車の予定が外れる', c1.貸出 === 0, c1);
ok('🔴 カードの代車の設定も空になる', c1.needLoaner === false && !c1.loanerId, c1);
ok('🔴 フローに残る（あとから追える）', /代車の予定も一緒にキャンセル/.test(c1.フロー), c1.フロー);

/* ===== ③🔴 返却済みは不可侵 ===== */
console.log('\n■ 🔴🔴 返却済みの貸出は何があっても消さない');
await seed();
const c2 = await p.evaluate(async () => {
  openDetail('R2'); await new Promise(r => setTimeout(r, 400));
  cvCancelResv('やめた');
  await new Promise(r => setTimeout(r, 400));
  const c = state.cards.find(x => x.id === 'R2');
  const as = (state.loanerAssigns || []).filter(x => x.cardId === 'R2');
  return { status: c.status, needLoaner: c.needLoaner, loanerId: c.loanerId,
           貸出: as.length, 返却済み: as.filter(x => x.returned).length };
});
ok('予約はキャンセルになる', c2.status === 'cancelled', c2);
ok('🔴 返却済みの貸出は残る', c2.貸出 === 1 && c2.返却済み === 1, c2);
ok('🔴 カードの代車の設定も残す（貸した記録なので消さない）', c2.needLoaner === true && c2.loanerId === 'L1', c2);

/* ===== ④🔴 未入庫（来店なし）では代車を外さない（v1.155.0・ゆうた確定） =====
   🗣「**2・3 は勘違いしてくるってパターンが結構あるから、未入庫に入る時点では残しておいて**」 */
console.log('\n■ 🔴🔴 未入庫に入る時点では代車を残す（当日ビューの「キャンセル（来店なし）」）');
await seed();
const c3 = await p.evaluate(async () => {
  /* 窓は自動でOKを返す（聞き方そのものは別の試験で見ている） */
  const org = window.pitAsk;
  window.pitAsk = function () { return Promise.resolve(true); };
  pitTodayCancel('R1', false);
  await new Promise(r => setTimeout(r, 500));
  window.pitAsk = org;
  const c = state.cards.find(x => x.id === 'R1');
  return { status: c.status, noShow: c.noShow, needLoaner: c.needLoaner, loanerId: c.loanerId,
           貸出: (state.loanerAssigns || []).filter(x => x.cardId === 'R1').length,
           フロー: (c.log || []).map(x => x.label || x.text || '').join(' / ') };
});
ok('未入庫になる', c3.status === 'cancelled' && c3.noShow === true, c3);
ok('🔴 代車の予定は残る（あとから連絡が来ることがあるため）', c3.貸出 === 1, c3);
ok('🔴 カードの代車の設定も残る', c3.needLoaner === true && c3.loanerId === 'L1', c3);
ok('🔴 何が残っているかフローに書く', /代車の予定はそのまま/.test(c3.フロー), c3.フロー);

/* ===== ⑤🔴 入庫日を過ぎた自動の未入庫も、代車は残す ===== */
console.log('\n■ 🔴🔴 入庫日を過ぎた自動の未入庫でも代車を残す');
await seed();
const c4 = await p.evaluate(async () => {
  const n = pitAutoOverdue();
  await new Promise(r => setTimeout(r, 300));
  const c = state.cards.find(x => x.id === 'R4');
  return { 動いた: n > 0, status: c.status, noShow: c.noShow, needLoaner: c.needLoaner,
           貸出: (state.loanerAssigns || []).filter(x => x.cardId === 'R4').length,
           フロー: (c.log || []).map(x => x.label || x.text || '').join(' / ') };
});
ok('自動で未入庫へ移る', c4.動いた && c4.status === 'cancelled' && c4.noShow === true, c4);
ok('🔴 代車の予定は残る', c4.貸出 === 1 && c4.needLoaner === true, c4);
ok('🔴 何が残っているかフローに書く', /代車の予定はそのまま/.test(c4.フロー), c4.フロー);

/* ===== ④-2 未入庫の一覧に「代車予定クリア」が出る（人が決める） ===== */
console.log('\n■ 🔴 未入庫の一覧＝人が決めて外す');
await seed();
const und = await p.evaluate(async () => {
  /* R1 を未入庫にする（代車つき）／R3 は代車なしで未入庫に */
  ['R1', 'R3'].forEach(id => { const c = state.cards.find(x => x.id === id);
    c.status = 'cancelled'; c.noShow = true; c.cancelledAt = window._T.today; c.archived = false; });
  showView('reserve'); state.reserveRange = 'tbd'; renderReserve();
  await new Promise(r => setTimeout(r, 700));
  const item = id => { const el = document.querySelector('#reserve-tbd [data-card-id="' + id + '"]');
    return el ? (el.closest('.rtbd-item') || {}).innerHTML || '' : ''; };
  return { 代車あり: item('R1'), 代車なし: item('R3') };
});
ok('🔴 代車ありの車に「代車予定クリア」が出る', /代車予定クリア/.test(und.代車あり), und.代車あり.slice(0, 300));
ok('🔴 「予約に戻す」と半分ずつ並ぶ', /rtbd-acts/.test(und.代車あり) && (und.代車あり.match(/rtbd-act half/g) || []).length === 2, und.代車あり.slice(0, 300));
ok('🔴 何の代車がいつまで押さえられているかを出す', /代車の予定あり/.test(und.代車あり) && /タント/.test(und.代車あり), und.代車あり.slice(0, 300));
ok('代車なしの車は今までどおり「予約に戻す」だけ',
   /予約に戻す/.test(und.代車なし) && !/代車予定クリア/.test(und.代車なし), und.代車なし.slice(0, 200));

/* 押すと確認の窓が出て、OKで外れる */
const clr = await p.evaluate(async () => {
  let asked = null;
  const org = window.pitAsk;
  window.pitAsk = function (msg, opt) { asked = String(msg || '') + '\n' + String((opt && opt.detail) || ''); return Promise.resolve(true); };
  pitUndClearLoaner('R1');
  await new Promise(r => setTimeout(r, 600));
  window.pitAsk = org;
  const c = state.cards.find(x => x.id === 'R1');
  return { 窓: asked || '', 貸出: (state.loanerAssigns || []).filter(x => x.cardId === 'R1').length,
           needLoaner: c.needLoaner, 未入庫のまま: c.status === 'cancelled' };
});
ok('🔴 確認の窓を挟む', /代車の予定を外しますか/.test(clr.窓), clr.窓);
ok('🔴 窓に何が消えるか書いてある', /タント/.test(clr.窓) && /戻しても、?代車は戻りません|代車は戻りません/.test(clr.窓), clr.窓);
ok('🔴 OKで代車の予定が外れる', clr.貸出 === 0 && clr.needLoaner === false, clr);
ok('🔴 カードは未入庫のまま（勝手に動かさない）', clr.未入庫のまま, clr);

/* ===== ④-3 30日たって自動アーカイブされる時に一緒に消える ===== */
console.log('\n■ 🔴 30日たって自動アーカイブされる時に代車も消える');
await seed();
const arc = await p.evaluate(async () => {
  const c = state.cards.find(x => x.id === 'R1');
  const d = new Date(); d.setDate(d.getDate() - 31);
  const q = n => (n < 10 ? '0' : '') + n;
  c.status = 'cancelled'; c.noShow = true; c.archived = false;
  c.cancelledAt = d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate());
  pitAutoArchive();
  await new Promise(r => setTimeout(r, 300));
  const c2 = state.cards.find(x => x.id === 'R1');
  return { archived: c2.archived, 貸出: (state.loanerAssigns || []).filter(x => x.cardId === 'R1').length,
           needLoaner: c2.needLoaner,
           返却済みは残る: (state.loanerAssigns || []).filter(x => x.cardId === 'R2' && x.returned).length };
});
ok('30日たつと自動でアーカイブされる', arc.archived === true, arc);
ok('🔴 その時に代車の予定も消える', arc.貸出 === 0 && arc.needLoaner === false, arc);
ok('🔴 よその返却済みには触らない', arc.返却済みは残る === 1, arc);

/* ===== ⑥ カードの消去 ===== */
console.log('\n■ 🔴 カードを消した時も、持ち主のいない予定を残さない');
await seed();
const c5 = await p.evaluate(async () => {
  openDetail('R1'); await new Promise(r => setTimeout(r, 400));
  cvDeleteCard();
  await new Promise(r => setTimeout(r, 400));
  return { カード: !!state.cards.find(x => x.id === 'R1'),
           貸出: (state.loanerAssigns || []).filter(x => x.cardId === 'R1').length,
           返却済みは残る: (state.loanerAssigns || []).filter(x => x.cardId === 'R2' && x.returned).length };
});
ok('カードが消える', c5.カード === false, c5);
ok('🔴 代車の予定も消える（持ち主のいない予定を残さない）', c5.貸出 === 0, c5);
ok('🔴 よその返却済みには触らない', c5.返却済みは残る === 1, c5);

/* ===== ⑦ 代車のカレンダーからも消えている（実物の画面） ===== */
console.log('\n■ 代車カレンダーからも消えている');
await seed();
const c6 = await p.evaluate(async () => {
  const before = (state.loanerAssigns || []).filter(x => x.cardId === 'R1').length;
  pitLoanerReleaseForCard('R1', '予約キャンセル');
  if (window.PitDB) PitDB.save();
  showView('loaner'); await new Promise(r => setTimeout(r, 700));
  const html = (document.getElementById('view-loaner') || {}).innerHTML || '';
  return { before, after: (state.loanerAssigns || []).filter(x => x.cardId === 'R1').length,
           画面に残っていない: !/data-assign-id="A1"|A1/.test(html.replace(/[\s\S]*?<\/style>/, '')) };
});
ok('外す前は1件あった', c6.before === 1, c6);
ok('🔴 外したら0件', c6.after === 0, c6);

/* ===== ⑧ 代車なしの車では何も起きない ===== */
console.log('\n■ 代車なしの車では何も起きない');
await seed();
const c7 = await p.evaluate(() => {
  const before = JSON.stringify(state.loanerAssigns);
  const r = pitLoanerReleaseForCard('R3', '予約キャンセル');
  return { n: r.n, 変わっていない: before === JSON.stringify(state.loanerAssigns) };
});
ok('0件と返る', c7.n === 0, c7);
ok('🔴 ほかの貸出を巻き込まない', c7.変わっていない, c7);

console.log('\n' + '='.repeat(50));
console.log(`  結果： ${pass} OK / ${fail} NG`);
if (errs.length) { console.log('  ⚠ 画面のエラー:'); errs.slice(0, 8).forEach(e => console.log('    - ' + e)); }
console.log('='.repeat(50));
await b.close();
process.exit(fail ? 1 : 0);
