/* PitFlow v2.160.0 ── カード詳細から作る「リンク付き付箋」
   ===================================================================
   ◎ゆうた報告（2026-10-07）
     🗣「共通部品にした時にカード詳細から作れるカードへのリンク付き付箋の機能がバグってる」
   ◎正体
     ・付箋に linkResNo / linkLabel を書いているのに、共通部品はそれを描かない＝どの車か出ず、カードも開けない
     ・作った人が空（無くなった window.bnMe を読んでいた）／作った時刻が無い／知らせ（window.toast）が出ない
   ◎ここで見張ること
     🔴 カード詳細の「付箋を発行」で、付箋ボードに「🔗 予約番号 ・ お客様 車種」が出る
     🔴 押すとそのカードが開く（カード番号 linkCardId で引く）
     🔴 作った人＝自分・作った時刻が入る

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
await p.waitForFunction('window.state && window.openDetail && window.cvFusenIssue && window.pitOpenNoteLink', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(900);

const R = await p.evaluate(async () => {
  const c = state.cards.find(x => x && x.resNo && x.status !== 'returned' && !x.archived);
  openDetail(c.id); await new Promise(r => setTimeout(r, 600));
  cvToggleFusen({ stopPropagation() {} });
  document.getElementById('cv-fpbody').value = '見張り付箋：部品入荷で連絡';
  cvFusenIssue();
  const n = state.boardNotes[state.boardNotes.length - 1];
  if (window.closeDetail) closeDetail();
  showView('dashboard'); await new Promise(r => setTimeout(r, 700));
  const el = document.querySelector('[data-note-id="' + n.id + '"]');
  const chip = el && el.querySelector('.bn-link');
  const chipText = chip ? chip.textContent.trim() : '';
  if (chip) { chip.click(); await new Promise(r => setTimeout(r, 600)); }
  const openedLabel = ((document.querySelector('.cv-fplink') || {}).textContent || '').trim();
  if (window.closeDetail) closeDetail();
  const out = { resNo: c.resNo, cardId: c.id, n: { author: n.authorUid, createdAt: !!n.createdAt, linkCardId: n.linkCardId }, chipText, openedLabel, me: window.pitBnMe && pitBnMe() };
  state.boardNotes = state.boardNotes.filter(x => x.id !== n.id);
  return out;
});
ok('🔴 付箋ボードに「🔗 予約番号 ・ お客様 車種」が出る', R.chipText.indexOf(R.resNo) === 0, R.chipText);
ok('🔴 押すとそのカードが開く', R.openedLabel.indexOf(R.resNo) === 0, R.openedLabel);
ok('カードの番号（linkCardId）も持つ', R.n.linkCardId === R.cardId, R.n);
ok('🔴 作った人＝自分（空にならない）', !!R.n.author && R.n.author === R.me, R.n);
ok('作った時刻が入る', R.n.createdAt, R.n);
ok('ページエラーなし', errs.length === 0, errs.slice(0, 3));
await b.close();
console.log(`\n${pass} ✅ / ${fail} ❌`);
process.exit(fail ? 1 : 0);
