/* PitFlow v2.160.0〜 ── カード詳細から作る「リンク付き付箋」
   ===================================================================
   ◎ゆうた報告・指定（2026-10-07）
     🗣「共通部品にした時にカード詳細から作れるカードへのリンク付き付箋の機能がバグってる」（v2.160.0）
     🗣「メンバーとタイトルも入れられるように。普通の付箋とおなじ感じで入力できるようにして」（v2.161.0）
   ◎ここで見張ること
     🔴 カード詳細の付箋ボタン＝ふつうの付箋と同じ編集画面（タイトル・本文・メンバー）が開き、上に「この車にリンク」
     🔴 保存すると、付箋ボードに「🔗 予約番号 ・ お客様 車種」が出る／押すとそのカードが開く
     🔴 タイトル・メンバー・作った人・作った時刻が入る
     🔴 ボードの「＋」から作るふつうの付箋にはリンクが付かない（キャンセルした後も）

   ◎使い方
     python3 -m http.server 8995      ← 別ウィンドウ
     node _見張り/test_note_cardlink.mjs                                */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const PORT = process.env.PORT || 8995;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: chromePath() });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.openDetail && window.cvToggleFusen && window.pitNewNoteForCard && window.CFNoteBoard', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(900);

const R = await p.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const c = state.cards.find(x => x && x.resNo && x.status !== 'returned' && !x.archived);
  const before = state.boardNotes.length;
  openDetail(c.id); await wait(600);
  cvToggleFusen({ stopPropagation() {} }); await wait(300);
  const ov = document.getElementById('cfnb-editor');
  const hasEditor = !!(ov && ov.classList.contains('open') && document.getElementById('cfnb-ed-title') && document.getElementById('cfnb-ed-text'));
  const linkLine = ((document.getElementById('pit-ed-link') || {}).textContent || '').trim();
  document.getElementById('cfnb-ed-title').value = '見張り：部品入荷';
  document.getElementById('cfnb-ed-text').value = '入ったら連絡';
  const pick = document.querySelector('#cfnb-ed-body .bn-member-pick'); if (pick) pick.click(); await wait(150);
  const linkAfterPick = !!document.getElementById('pit-ed-link');
  await CFNoteBoard._saveEditor(); await wait(400);
  const n = state.boardNotes[state.boardNotes.length - 1];
  if (window.closeDetail) closeDetail();
  showView('dashboard'); await wait(700);
  const el = document.querySelector('[data-note-id="' + n.id + '"]');
  const chip = el && el.querySelector('.bn-link');
  const chipText = chip ? chip.textContent.trim() : '';
  if (chip) { chip.click(); await wait(600); }
  const openedResNo = (window._cvCurrentId || '') ;
  const opened = !!document.querySelector('.cv-delpop') && (document.body.innerHTML.indexOf(c.resNo) >= 0);
  if (window.closeDetail) closeDetail();
  /* ふつうの「＋」：一度カードから開いてキャンセル → ボードの＋で作る＝リンクは付かない */
  openDetail(c.id); await wait(400); cvToggleFusen({ stopPropagation() {} }); await wait(200);
  CFNoteBoard._close('cfnb-editor'); if (window.closeDetail) closeDetail(); await wait(200);
  openBoardNoteModal(null); await wait(200);
  document.getElementById('cfnb-ed-title').value = '見張り：ふつうの付箋';
  await CFNoteBoard._saveEditor(); await wait(300);
  const plain = state.boardNotes[state.boardNotes.length - 1];
  const out = { resNo: c.resNo, cardId: c.id, added: state.boardNotes.length - before, hasEditor, linkLine, linkAfterPick, chipText, opened,
    n: { title: n.title, body: n.body, members: n.memberUids, author: n.authorUid, createdAt: !!n.createdAt, linkCardId: n.linkCardId },
    plain: { title: plain.title, link: plain.linkCardId || plain.linkResNo || '' }, me: window.pitBnMe && pitBnMe() };
  state.boardNotes = state.boardNotes.filter(x => x.id !== n.id && x.id !== plain.id);
  return out;
});
ok('🔴 付箋ボタンで、ふつうの付箋と同じ編集画面（タイトル・本文）が開く', R.hasEditor, R);
ok('🔴 編集画面の上に「この車にリンク：予約番号…」', R.linkLine.indexOf(R.resNo) >= 0, R.linkLine);
ok('メンバーを選んでも「この車にリンク」は消えない', R.linkAfterPick);
ok('🔴 タイトル・本文・メンバーが入る', R.n.title === '見張り：部品入荷' && R.n.body === '入ったら連絡' && Array.isArray(R.n.members) && R.n.members.length >= 1, R.n);
ok('🔴 付箋ボードに「🔗 予約番号 ・ お客様 車種」が出る', R.chipText.indexOf(R.resNo) === 0, R.chipText);
ok('🔴 押すとそのカードが開く', R.opened, R.opened);
ok('カードの番号（linkCardId）・作った人・作った時刻', R.n.linkCardId === R.cardId && !!R.n.author && R.n.author === R.me && R.n.createdAt, R.n);
ok('🔴 キャンセルした後にボードの＋で作るふつうの付箋にはリンクが付かない', R.plain.title === '見張り：ふつうの付箋' && !R.plain.link, R.plain);
ok('ページエラーなし', errs.length === 0, errs.slice(0, 3));
await b.close();
console.log(`\n${pass} ✅ / ${fail} ❌`);
process.exit(fail ? 1 : 0);
