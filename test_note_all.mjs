/* PitFlow v1.142.0 ── 付箋の「まとめて表示」（全アプリ共通部品 coreflow-note-all.js）のテスト
   -------------------------------------------------------------------
   ◎見張っているもの（ゆうた指定 2026-08-19）
     🗣「新規付箋の横にボタン。押すと **MHS・PitFlow・CarFlow 全アプリの付箋が集合して一斉表示**。
     　　**返信やチェックなどはこの状態でできて**、もう一度押すか、ビューを切り替えたらデフォルトに戻る。
     　　ボタンは新規より目立たない形がいい」
     ① 練習用（クラウドに繋がっていない）ではボタンを出さない
     ② 押すと CarFlow(boardNotes) と MHS(mhsNotes) の付箋も並ぶ／出どころの札が付く
     ③ よその付箋にも **返信** と **チェック（済・回覧の確認）** ができて、**そのアプリの入れ物へ書く**
     ④ 🔴 よその付箋は **編集・消去・並び替えができない**（⋮ にも出さない／関数を直接呼んでも止まる）
     ⑤ もう一度押す／ビューを移ると**元に戻る**
     ⑥ 🔴 よその付箋を **PitFlow のデータ（state.boardNotes）に混ぜない**
   ◎作り
     Firestore は使わない。`window.fb` を**にせもの**に差し替えて、
     決めた付箋を返す onSnapshot と、書き込みを記録する set を用意している。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8962      ← 別ウィンドウ
     node test_note_all.mjs                                                   */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8962;
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
await p.waitForFunction('window.state && window.CFNoteAll && window.renderBoardNotes', null, { timeout: 20000 });
await p.waitForTimeout(500);

/* 自分の付箋2枚（PitFlow）を置く */
async function base(){
  await p.evaluate(() => {
    state.staff = [ { id:'s1', name:'甲', realName:'甲', aliases:['甲'], front:true },
                    { id:'s2', name:'乙', realName:'乙', aliases:['乙'], front:true } ];
    try { localStorage.setItem('pitflow_bn_me', 's1'); } catch(e){}
    state.boardNotes = [
      { id:'p1', title:'ピットの付箋', body:'', color:'yellow', noteType:'execute',
        memberUids:['s1'], doneByUids:[], authorUid:'s1', status:'open', order:1, replies:[] }
    ];
    window.PIT_BN_TARGET = 'board-notes-area';
    showView('dashboard');
    renderBoardNotes();
  });
  await p.waitForTimeout(300);
}

console.log('\n───── ① 練習用ではボタンを出さない ─────');
await base();
ok('クラウドに繋がっていないので「まとめて表示」は出ない',
   await p.evaluate(() => !document.querySelector('.cfa-btn')));
ok('available() が false', await p.evaluate(() => CFNoteAll.available() === false));

/* ---- ここから：fb をにせものに差し替えて本番モードのふりをする ---- */
await p.evaluate(() => {
  window.__writes = [];
  const DATA = {
    boardNotes: [ { id:'c1', title:'カーの付箋', body:'車のほう', color:'blue', noteType:'execute',
                    memberUids:['s1'], doneByUids:[], authorUid:'s2', status:'open', order:1, replies:[] } ],
    mhsNotes:   [ { id:'m1', title:'MHSの付箋', body:'回覧です', color:'green', noteType:'circulate',
                    memberUids:['s1','s2'], doneByUids:[], authorUid:'s2', status:'open', order:1, replies:[] } ]
  };
  const mkCol = name => ({
    onSnapshot(cb){
      const arr = (DATA[name] || []).map(o => JSON.parse(JSON.stringify(o)));
      setTimeout(() => cb({ forEach(f){ arr.forEach(o => f({ id:o.id, data:() => o })); } }), 5);
      return () => { window.__unsub = (window.__unsub || 0) + 1; };
    },
    doc(id){ return { set(body, opt){ window.__writes.push({ col:name, id, body, opt }); return Promise.resolve(); } }; }
  });
  window.fb = window.fb || {};
  window.fb.db = { collection(){ return mkCol('x'); } };
  window.fb.serverTimestamp = () => 'TS';
  window.fb.company = () => ({ collection: n => mkCol(n) });
  window.PitDB = window.PitDB || {};
  window.PitDB.mode = 'cloud';
  window.PitDB._loaded = true;
  window.__pitSaves = 0;
  const orig = window.PitDB.save;
  window.PitDB.save = function(){ window.__pitSaves++; if (typeof orig === 'function') return orig.apply(this, arguments); };
  renderBoardNotes();
});
await p.waitForTimeout(300);

console.log('\n───── ② 押すと3アプリぶんが並ぶ ─────');
ok('本番モードのふりをするとボタンが出る', await p.evaluate(() => !!document.querySelector('.cfa-btn')));
ok('ボタンは「＋ 付箋を追加」より控えめ（枠だけ・塗りつぶさない）',
   await p.evaluate(() => {
     const el = document.querySelector('.cfa-btn');
     const st = getComputedStyle(el);
     return /rgba\(0, 0, 0, 0\)|transparent/.test(st.backgroundColor);
   }));
ok('ボタンの文言は「まとめて表示」',
   (await p.evaluate(() => document.querySelector('.cfa-btn').textContent.trim())) === 'まとめて表示');

await p.click('.cfa-btn');
await p.waitForTimeout(400);
const ids = () => p.evaluate(() => Array.from(document.querySelectorAll('.bn-card')).map(el => el.getAttribute('data-note-id')));
ok('3アプリぶんの付箋が並ぶ', JSON.stringify(await ids()) === JSON.stringify(['p1','c1','m1']), await ids());
ok('自分の付箋が先・よその付箋は後ろ', (await ids())[0] === 'p1');
ok('出どころの札が付く（CarFlow / MHS）',
   await p.evaluate(() => {
     const a = document.querySelector('.bn-card[data-note-id="c1"] .cfa-src');
     const c = document.querySelector('.bn-card[data-note-id="m1"] .cfa-src');
     return !!a && !!c && a.textContent === 'CarFlow' && c.textContent === 'MHS';
   }));
ok('自分の付箋には札が付かない',
   await p.evaluate(() => !document.querySelector('.bn-card[data-note-id="p1"] .cfa-src')));
ok('🔴 よその付箋を PitFlow のデータに混ぜていない',
   await p.evaluate(() => state.boardNotes.length === 1 && state.boardNotes[0].id === 'p1'));
ok('ボタンに件数（+2）が出る',
   await p.evaluate(() => /\+2/.test(document.querySelector('.cfa-btn').textContent)));

console.log('\n───── ③ よその付箋にも返信・チェックができる ─────');
await p.click('.bn-card[data-note-id="c1"] .cfr-open');
await p.waitForTimeout(150);
await p.fill('.bn-card[data-note-id="c1"] .cfr-ta', 'ピットから返信');
await p.click('.bn-card[data-note-id="c1"] .cfr-send');
await p.waitForTimeout(400);
const w1 = await p.evaluate(() => window.__writes.slice());
ok('🔴 CarFlow の付箋への返信は boardNotes に書く',
   w1.length === 1 && w1[0].col === 'boardNotes' && w1[0].id === 'c1' &&
   (w1[0].body.replies || []).length === 1 && w1[0].body.replies[0].text === 'ピットから返信', w1);
ok('merge で書く（よそのアプリの項目を消さない）', w1.length === 1 && w1[0].opt && w1[0].opt.merge === true);
ok('PitDB には保存していない', await p.evaluate(() => window.__pitSaves === 0));

/* 回覧の確認（MHS の付箋） */
await p.evaluate(() => markCirculationSelf('m1'));
await p.waitForTimeout(400);
const w2 = await p.evaluate(() => window.__writes.slice());
const last = w2[w2.length - 1];
ok('🔴 MHS の回覧付箋のチェックは mhsNotes に書く',
   last && last.col === 'mhsNotes' && last.id === 'm1' && (last.body.doneByUids || []).includes('s1'), last);
ok('チェックでも PitDB には保存していない', await p.evaluate(() => window.__pitSaves === 0));

console.log('\n───── ④ よその付箋は編集・消去・並び替えができない ─────');
await p.evaluate(() => openBoardNoteActions('c1'));
await p.waitForTimeout(250);
ok('⋮ に「編集」を出さない',
   await p.evaluate(() => document.getElementById('bn-action-edit').style.display === 'none'));
ok('⋮ に「消去」を出さない',
   await p.evaluate(() => document.getElementById('bn-action-delete').style.display === 'none'));
ok('⋮ の「返信する」は出る',
   await p.evaluate(() => document.getElementById('bn-action-reply').style.display !== 'none'));
await p.evaluate(() => closeBoardNoteActions());
await p.waitForTimeout(150);
ok('🔴 関数を直に呼んでも編集モーダルは開かない',
   await p.evaluate(() => { openBoardNoteModal('c1'); const m = document.getElementById('modal-board-note'); return !m || !m.classList.contains('show'); }));
ok('よその付箋はドラッグできない',
   await p.evaluate(() => document.querySelector('.bn-card[data-note-id="c1"]').getAttribute('draggable') !== 'true'));
ok('自分の付箋はドラッグできる',
   await p.evaluate(() => document.querySelector('.bn-card[data-note-id="p1"]').getAttribute('draggable') === 'true'));

console.log('\n───── ⑤ 元に戻る ─────');
await p.click('.cfa-btn');
await p.waitForTimeout(350);
ok('もう一度押すと自分の付箋だけに戻る', JSON.stringify(await ids()) === JSON.stringify(['p1']), await ids());
ok('購読を離している', await p.evaluate(() => (window.__unsub || 0) >= 2));
await p.click('.cfa-btn');
await p.waitForTimeout(350);
ok('もう一度押すとまた集まる', (await ids()).length === 3);
await p.evaluate(() => showView('today'));
await p.waitForTimeout(300);
await p.evaluate(() => { window.PIT_BN_TARGET = 'board-notes-area'; showView('dashboard'); });
await p.waitForTimeout(400);
ok('🔴 ビューを移ると解除される', await p.evaluate(() => CFNoteAll.isOn() === false));
ok('戻ったあとは自分の付箋だけ', JSON.stringify(await ids()) === JSON.stringify(['p1']), await ids());

console.log('\n───── ⑥ 配線 ─────');
{
  const src = fs.readFileSync('js/board-notes.js', 'utf8');
  ok('書く用の配列（_notes）と読む用（_all）を分けてある', /function _all\(/.test(src) && /function _notes\(/.test(src));
  ok('よその付箋の保存は CFNoteAll.save を通る', /CFNoteAll\.save\(/.test(src));
  ok('ビュー移動で解除している', /CFNoteAll\.off\(true\)/.test(src));
  const shared = fs.readFileSync('js/coreflow-note-all.js', 'utf8');
  ok('入れ物の名前は pitBoardNotes（pitNotes ではない）', /pitflow: 'pitBoardNotes'/.test(shared) && !/'pitNotes'/.test(shared));
}

console.log('\n───── まとめ ─────');
ok('画面のエラーが出ていない', errs.length === 0, errs.slice(0, 5));
console.log('\n  ' + pass + ' OK / ' + fail + ' NG\n');
await b.close();
process.exit(fail ? 1 : 0);
