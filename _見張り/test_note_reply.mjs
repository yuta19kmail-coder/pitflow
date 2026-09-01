/* PitFlow v1.141.0 ── 付箋の「返信」（全アプリ共通部品 coreflow-note-reply.js）のテスト
   -------------------------------------------------------------------
   ◎見張っているもの（ゆうた指定 2026-08-18）
     🗣「通常の付箋で返信が入れられるように。**回覧でも返信を入れられるように**したい。
     　　またこれはピット、MHS、CarFlow 全部の付箋に実装して」
     ① 通常（実行）の付箋にも **回覧の付箋にも**、カードの中に「返信を書く…」が出る
     ② 押すと入力欄が開き、書いて送ると付箋に残る（誰が・いつ・何を）
     ③ 🔴 回覧の「✓ 自分が確認」とは**別もの**＝確認していなくても返信できる／確認ボタンは消えない
     ④ 自分の返信だけ × が出て、確認してから消える
     ⑤ 書いている間だけカードのドラッグが切れる（切らないと文字が選べない）
     ⑥ ⋮ の「返信する」も回覧で出る
     ⑦ 配線（共通部品を通っていること・アプリ側で組み立て直していないこと）
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8961      ← 別ウィンドウ
     node test_note_reply.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8961;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.CFNoteReply && window.renderBoardNotes', null, { timeout: 20000 });
await p.waitForTimeout(500);

/* 付箋を2枚だけ置く（通常1枚・回覧1枚）。「自分」は甲。 */
async function setup(){
  await p.evaluate(() => {
    state.staff = [ { id:'s1', name:'甲', realName:'甲', aliases:['甲'], front:true },
                    { id:'s2', name:'乙', realName:'乙', aliases:['乙'], front:true } ];
    try { localStorage.setItem('pitflow_bn_me', 's1'); } catch(e){}
    state.boardNotes = [
      { id:'n1', title:'ふつうの付箋', body:'本文', color:'yellow', noteType:'execute',
        memberUids:['s1','s2'], doneByUids:[], authorUid:'s2', status:'open', order:1, replies:[] },
      { id:'n2', title:'回覧の付箋', body:'まわします', color:'blue', noteType:'circulate',
        memberUids:['s1','s2'], doneByUids:[], authorUid:'s2', status:'open', order:2, replies:[] }
    ];
    window.PIT_BN_TARGET = 'board-notes-area';
    showView('dashboard');
    renderBoardNotes();
  });
  await p.waitForTimeout(400);
}
const CARD = id => `.bn-card[data-note-id="${id}"]`;
const notes = () => p.evaluate(() => state.boardNotes.map(n => ({ id:n.id, r:(n.replies||[]).map(x => ({ uid:x.uid, text:x.text, hasAt: typeof x.at === 'number' })) })));

console.log('\n───── ① 返信欄が出る（通常も回覧も）─────');
await setup();
ok('通常の付箋に「返信を書く…」が出る',
   await p.evaluate(s => !!document.querySelector(s + ' .cfr-open'), CARD('n1')));
ok('🔴 回覧の付箋にも「返信を書く…」が出る',
   await p.evaluate(s => !!document.querySelector(s + ' .cfr-open'), CARD('n2')));
ok('🔴 回覧の「✓ 自分が確認」は消えていない',
   await p.evaluate(s => /自分が確認/.test((document.querySelector(s) || {}).textContent || ''), CARD('n2')));

console.log('\n───── ② 書いて送る ─────');
for (const [id, label] of [['n1','通常'], ['n2','回覧']]) {
  await p.click(`${CARD(id)} .cfr-open`);
  await p.waitForTimeout(150);
  ok(label + 'の入力欄が開く', await p.evaluate(s => !!document.querySelector(s + ' .cfr.is-open'), CARD(id)));
  ok(label + 'は開いている間カードのドラッグが切れる',
     await p.evaluate(s => document.querySelector(s).getAttribute('draggable') === 'false', CARD(id)));
  await p.fill(`${CARD(id)} .cfr-ta`, label + 'に返信します');
  await p.click(`${CARD(id)} .cfr-send`);
  await p.waitForTimeout(300);
}
const n = await notes();
ok('通常の付箋に返信が1件残った', n[0].r.length === 1 && n[0].r[0].text === '通常に返信します', n[0]);
ok('🔴 回覧の付箋にも返信が1件残った', n[1].r.length === 1 && n[1].r[0].text === '回覧に返信します', n[1]);
ok('誰が書いたか（自分＝s1）が残る', n[0].r[0].uid === 's1' && n[1].r[0].uid === 's1');
ok('いつ書いたかが残る', n[0].r[0].hasAt && n[1].r[0].hasAt);
ok('送ったあと入力欄は閉じている',
   await p.evaluate(s => !document.querySelector(s + ' .cfr.is-open'), CARD('n1')));
ok('送ったあとカードのドラッグが戻っている',
   await p.evaluate(s => document.querySelector(s).getAttribute('draggable') === 'true', CARD('n1')));
ok('返信に時刻が出ている',
   await p.evaluate(s => /^\d+\/\d+ \d\d:\d\d$/.test(((document.querySelector(s + ' .cfr-time') || {}).textContent || '').trim()), CARD('n1')));
ok('🔴 回覧の確認（doneByUids）は返信では動かない',
   await p.evaluate(() => (state.boardNotes.find(x => x.id === 'n2').doneByUids || []).length === 0));

console.log('\n───── ③ 空では送れない ─────');
await p.click(`${CARD('n1')} .cfr-open`);
await p.waitForTimeout(120);
await p.click(`${CARD('n1')} .cfr-send`);
await p.waitForTimeout(250);
ok('空のまま送っても増えない', (await notes())[0].r.length === 1);
await p.click(`${CARD('n1')} .cfr-cancel`);
await p.waitForTimeout(200);
ok('「やめる」で閉じる', await p.evaluate(s => !document.querySelector(s + ' .cfr.is-open'), CARD('n1')));

console.log('\n───── ④ 消せるのは自分の返信だけ ─────');
await p.evaluate(() => {
  state.boardNotes.find(x => x.id === 'n1').replies.push({ id:'r-other', uid:'s2', text:'よその人の返信', at: 1 });
  renderBoardNotes();
});
await p.waitForTimeout(300);
ok('自分の返信には × が出る', await p.evaluate(s => !!document.querySelector(s + ' .cfr-del'), CARD('n1')));
ok('返信は2件出ている', await p.evaluate(s => document.querySelectorAll(s + ' .cfr-item').length === 2, CARD('n1')));
ok('🔴 よその人の返信には × が出ない（×は1つだけ）',
   await p.evaluate(s => document.querySelectorAll(s + ' .cfr-del').length === 1, CARD('n1')));
/* 消す＝アプリ内ダイアログ（pitAsk）で聞いてから */
await p.click(`${CARD('n1')} .cfr-del`);
await p.waitForTimeout(300);
ok('消す前にアプリ内ダイアログで聞く（標準の confirm を使わない）',
   await p.evaluate(() => !!document.querySelector('.uidlg, .ui-dialog, [class*="uid-"]')) ||
   await p.evaluate(() => document.body.innerText.includes('この返信を消しますか')));
await p.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const b = btns.find(x => (x.textContent || '').trim() === '消す');
  if (b) b.click();
});
await p.waitForTimeout(400);
const n2 = await notes();
ok('自分の返信が消えた', n2[0].r.length === 1 && n2[0].r[0].uid === 's2', n2[0]);

console.log('\n───── ⑤ ⋮ からの返信も回覧で出る ─────');
await p.evaluate(() => openBoardNoteActions('n2'));
await p.waitForTimeout(250);
ok('🔴 回覧でも ⋮ に「返信する」が出る',
   await p.evaluate(() => { const e = document.getElementById('bn-action-reply'); return !!e && e.style.display !== 'none'; }));
await p.evaluate(() => closeBoardNoteActions());

console.log('\n───── ⑥ 配線（共通部品を通っていること）─────');
{
  const src = fs.readFileSync('js/board-notes.js', 'utf8');
  ok('返信の描画は CFNoteReply.html 1本', /CFNoteReply\.html\(/.test(src) && (src.match(/CFNoteReply\.html\(/g) || []).length === 1);
  ok('差し込み（setup）も1か所', (src.match(/CFNoteReply\.setup\(/g) || []).length === 1);
  ok('🔴 回覧を弾く古い条件が残っていない', !/noteType === 'circulate'\) return ''/.test(src));
  const shared = fs.readFileSync('js/coreflow-note-reply.js', 'utf8');
  ok('共通部品は「本体は _shared」と書いてある', /_shared/.test(shared));
  ok('共通部品はアプリの名前を持っていない（差し込みで受け取る）',
     !/PitDB|state\.boardNotes|dbBoardNotes|mhsNotes/.test(shared));
  const html = fs.readFileSync('index.html', 'utf8');
  ok('js を board-notes.js より前で読んでいる',
     html.indexOf('js/coreflow-note-reply.js') < html.indexOf('js/board-notes.js'));
  ok('css も読んでいる', /css\/coreflow-note-reply\.css/.test(html));
}

console.log('\n───── まとめ ─────');
ok('画面のエラーが出ていない', errs.length === 0, errs.slice(0, 5));
console.log('\n  ' + pass + ' OK / ' + fail + ' NG\n');
await b.close();
process.exit(fail ? 1 : 0);
