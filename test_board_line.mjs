/* PitFlow v1.39.0 ── タスクボードの「区切りライン」のテスト
   -------------------------------------------------------------------
   ◎考え方
     **PitFlow 本体（index.html）をサンプルモードで丸ごと開き**、1課のタスクボードで
     実際にドラッグ＆ドロップして確かめる（ゆうた指定の6つ）。
       ① 完TEL済の**左**に「区切りライン」の引き出し口がある
       ② カードとカードのあいだへドラッグ＝そこに入る
       ③ 入ったラインはドラッグで移動できる
       ④ 別の工程（列）へも移せる
       ⑤ 枠の外へ出すと消える
       ⑥ カードの右クリック →「この下にラインを入れる」でも入る
     ＋ 保存先（全員で共有＝state.settings.boardLines）と、カードが居なくなった時に消えないこと。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8952      ← 別ウィンドウ
     node test_board_line.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:8952/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && typeof window.showView === "function" && window.PitBoardLine', null, { timeout: 20000 });
await p.waitForTimeout(600);

/* 1課の「点検待ち」に3枚、「作業待ち」に2枚だけ置いて、盤面を読みやすくする */
await p.evaluate(() => {
  state.settings.boardLines = [];
  state.cards = [];
  const mk = (i, st) => ({ id: 'bc' + i, resNo: 'B' + i, customer: '客' + i + ' 太郎', car: 'アクア', maker: 'トヨタ',
    reserveDate: window.ymd(new Date()), reserveTime: '10:00', status: st, boardId: 'default',
    division: 'div1', workTypes: [], dropType: 'wait' });
  [0,1,2].forEach(i => state.cards.push(mk(i, 'check')));
  [3,4].forEach(i => state.cards.push(mk(i, 'work')));
  window.showView('course1');
});
await p.waitForTimeout(400);

const COL = st => '#kanban-cols-1 .kanban-col-body[data-drop-val="' + st + '"]';
const linesOf = () => p.evaluate(() => (state.settings.boardLines || []).map(l => ({ b: l.boardId, s: l.status, a: l.after, t: l.label })));
/* 列の中身（カードIDと line の並び）を上から読む */
const seqOf = st => p.evaluate(sel => Array.from(document.querySelector(sel).children).map(el =>
  el.getAttribute('data-card-id') ? ('card:' + el.getAttribute('data-card-id'))
  : (el.getAttribute('data-lineid') ? 'LINE' : null)).filter(Boolean), COL(st));

/* HTML5 のドラッグを手で起こす（Playwright の dragTo は dataTransfer を持たない場面がある） */
async function hdrag(fromSel, toSel, toY){
  await p.evaluate(([fs2, ts, y]) => {
    const src = document.querySelector(fs2);
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const tgt = ts ? document.querySelector(ts) : document.body;
    const r = tgt.getBoundingClientRect();
    const cy = (y == null) ? (r.top + r.height / 2) : y;
    const opt = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: cy };
    tgt.dispatchEvent(new DragEvent('dragover', opt));
    tgt.dispatchEvent(new DragEvent('drop', opt));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, [fromSel, toSel, toY]);
  await p.waitForTimeout(300);
}
/* n枚目のカードの「下」に落とす（＝そのカードのまん中より下を狙う） */
async function yUnderCard(st, n){
  return p.evaluate(([sel, i]) => {
    const cards = Array.from(document.querySelector(sel).querySelectorAll('[data-card-id]'));
    const r = cards[i].getBoundingClientRect();
    return r.top + r.height - 2;
  }, [COL(st), n]);
}

console.log('\n── ① 引き出し口の場所 ──');
{
  const order = await p.evaluate(() => Array.from(document.querySelectorAll('#view-course1 .view-actions > *'))
    .map(e => e.className.split(' ')[0] + (e.getAttribute('data-drop') ? ':' + e.getAttribute('data-drop') : '')));
  ok('「区切りライン」がある', order.some(x => x.indexOf('kb-lineadd') === 0), order);
  ok('🔴 完TEL済の**左**にある',
     order.indexOf('kb-lineadd') >= 0 && order.indexOf('kb-lineadd') < order.indexOf('kb-droparea:callDone'), order);
  ok('2課のボードにもある', (await p.locator('#view-course2 .kb-lineadd').count()) === 1);
  ok('ドラッグできる', (await p.evaluate(() => document.querySelector('#view-course1 .kb-lineadd').getAttribute('draggable'))) === 'true');
  const look = await p.evaluate(() => {
    const el = document.querySelector('#view-course1 .kb-lineadd');
    const cs = getComputedStyle(el);
    return { text: el.textContent.trim(), style: cs.borderTopStyle, gap: parseFloat(cs.marginRight),
             kids: el.children.length };
  });
  ok('🔴 文字は「区切りライン」だけ', look.text === '区切りライン', look.text);
  ok('🔴 実線のボタン（点線ではない）', look.style === 'solid', look.style);
  ok('🔴 アイコンも「ここからドラッグ」も無い', look.kids === 0, look.kids);
  /* ⚠ v1.47.0 数字の決め打ち（margin-right >= 20）をやめた＝ボタンを小さくすると落ちるため。
     見たいのは「**隣のボタンより明らかに離れている**」なので、**実際の隙間を測って比べる**。 */
  const gaps = await p.evaluate(() => {
    const b = document.querySelector('#view-course1 .kb-lineadd');
    const d = document.querySelectorAll('#view-course1 .kb-droparea');
    if (!b || d.length < 2) return null;
    const rb = b.getBoundingClientRect();
    const r0 = d[0].getBoundingClientRect(), r1 = d[1].getBoundingClientRect();
    return { toDrop: Math.round(r0.left - rb.right), normal: Math.round(r1.left - r0.right) };
  });
  ok('🔴 完TEL済とのあいだが、ふつうの間隔より明らかに広い',
     !!gaps && gaps.toDrop >= gaps.normal * 2, gaps);
}

console.log('\n── ② カードとカードのあいだへドラッグ＝入る ──');
{
  await hdrag('#view-course1 .kb-lineadd', COL('check'), await yUnderCard('check', 0));
  const L = await linesOf();
  ok('1本入った', L.length === 1, L);
  ok('🔴 1枚目のカードの下に入った', L[0] && L[0].a === 'bc0', L[0]);
  ok('列と課も覚えている', L[0] && L[0].s === 'check' && L[0].b === 'default', L[0]);
  const seq = await seqOf('check');
  ok('画面でも1枚目と2枚目のあいだにある', JSON.stringify(seq) === JSON.stringify(['card:bc0','LINE','card:bc1','card:bc2']), seq);
  ok('全員で共有される所に入っている（設定と同じ場所）',
     (await p.evaluate(() => Array.isArray(state.settings.boardLines))));
}

console.log('\n── ③ 入ったラインをドラッグで移動 ──');
{
  await hdrag(COL('check') + ' [data-lineid]', COL('check'), await yUnderCard('check', 2));
  const seq = await seqOf('check');
  ok('🔴 3枚目の下へ動いた', JSON.stringify(seq) === JSON.stringify(['card:bc0','card:bc1','card:bc2','LINE']), seq);
  ok('本数は増えていない（コピーではなく移動）', (await linesOf()).length === 1);
}

console.log('\n── ④ 別の工程へ移す ──');
{
  await hdrag(COL('check') + ' [data-lineid]', COL('work'), await yUnderCard('work', 0));
  const L = await linesOf();
  ok('🔴 作業待ちの列へ移った', L[0] && L[0].s === 'work', L);
  ok('もとの列からは消えた', JSON.stringify(await seqOf('check')) === JSON.stringify(['card:bc0','card:bc1','card:bc2']));
  const seq = await seqOf('work');
  ok('移った先で正しい位置に入る', JSON.stringify(seq) === JSON.stringify(['card:bc3','LINE','card:bc4']), seq);
}

console.log('\n── ⑤ 枠の外へ出すと消える ──');
{
  await hdrag(COL('work') + ' [data-lineid]', '#view-course1 .view-header', null);
  ok('🔴 消えた', (await linesOf()).length === 0);
  ok('画面からも消えた', (await p.locator(COL('work') + ' [data-lineid]').count()) === 0);
}

console.log('\n── ⑥ カードの右クリック →「この下にラインを入れる」 ──');
{
  const has = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'bc1');
    const it = window.PitBoardLine.ctxItem(c);
    return it && it.label;
  });
  ok('メニューの項目がある', has === 'この下にラインを入れる', has);
  await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'bc1');
    window.PitBoardLine.ctxItem(c).run();
  });
  await p.waitForTimeout(300);
  const seq = await seqOf('check');
  ok('🔴 そのカードの下に入った', JSON.stringify(seq) === JSON.stringify(['card:bc0','card:bc1','LINE','card:bc2']), seq);
}

console.log('\n── ⑦ 名前は最初は無い／ダブルクリックで入れる（v1.37.0） ──');
{
  ok('🔴 入れたばかりの線に名前は付いていない',
     (await p.evaluate(sel => document.querySelectorAll(sel + ' .kb-line-t').length, COL('check'))) === 0);
  ok('線そのものは出ている', (await p.locator(COL('check') + ' [data-lineid]').count()) === 1);
  ok('🔴 ✕ ボタンは無い（消すのは枠の外へドラッグだけ）',
     (await p.evaluate(() => document.querySelectorAll('.kb-line-x').length)) === 0);
  /* ダブルクリックで名前を入れる（UI.prompt を差し替えて自動で答える） */
  await p.evaluate(() => { window.UI = window.UI || {}; window.UI.prompt = () => Promise.resolve('今日はここまで'); });
  await p.evaluate(sel => document.querySelector(sel + ' [data-lineid]')
    .dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })), COL('check'));
  await p.waitForTimeout(350);
  ok('🔴 ダブルクリックで名前が入る',
     (await p.evaluate(sel => { const e = document.querySelector(sel + ' .kb-line-t'); return e ? e.textContent : ''; }, COL('check'))) === '今日はここまで');
  /* 空にすると線だけに戻る */
  await p.evaluate(() => { window.UI.prompt = () => Promise.resolve(''); });
  await p.evaluate(sel => document.querySelector(sel + ' [data-lineid]')
    .dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })), COL('check'));
  await p.waitForTimeout(350);
  ok('空にすると線だけに戻る',
     (await p.evaluate(sel => document.querySelectorAll(sel + ' .kb-line-t').length, COL('check'))) === 0);
  await p.evaluate(() => { window.UI.prompt = () => Promise.resolve('今日はここまで'); });
  await p.evaluate(sel => document.querySelector(sel + ' [data-lineid]')
    .dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })), COL('check'));
  await p.waitForTimeout(350);
  /* ⑧ 用にもう1本 */
  await p.evaluate(() => { window.PitBoardLine.put('default', 'work', 'bc3', ''); window._rerenderActiveBoard(); });
  await p.waitForTimeout(200);
}

console.log('\n── ⑦-2 ドラッグ中はゴーストが先に動く（v1.37.0） ──');
{
  const g = await p.evaluate(sel => {
    const src = document.querySelector('#view-course1 .kb-lineadd');
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const body = document.querySelector(sel);
    const cards = Array.from(body.querySelectorAll('[data-card-id]'));
    const r = cards[1].getBoundingClientRect();
    body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: r.left + 10, clientY: r.top + r.height - 2 }));
    const kids = Array.from(body.children);
    const gi = kids.findIndex(e => e.classList.contains('kb-line-ghost'));
    const ci = kids.indexOf(cards[1]);
    const out = { gi: gi, ci: ci, n: document.querySelectorAll('.kb-line-ghost').length,
                  lines: (state.settings.boardLines || []).length };
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return out;
  }, COL('check'));
  ok('🔴 ゴーストが出ている', g.n === 1, g);
  ok('🔴 狙った位置（2枚目の下）に先に出る', g.gi === g.ci + 1, g);
  ok('離すまでデータは増えない', g.lines === 2, g.lines);
  await p.waitForTimeout(150);
  ok('離したらゴーストは消える', (await p.evaluate(() => document.querySelectorAll('.kb-line-ghost').length)) === 0);
}

console.log('\n── ⑧ カードが居なくなっても消えない（黙って消さない） ──');
{
  await p.evaluate(() => {
    /* 区切りの相手（bc3）を別の工程へ動かす */
    state.cards.find(x => x.id === 'bc3').status = 'estim';
    window._rerenderActiveBoard();
  });
  await p.waitForTimeout(250);
  ok('ラインは残っている（列の末尾へ寄る）',
     (await p.locator(COL('work') + ' [data-lineid]').count()) === 1);
  ok('データからも消えていない', (await linesOf()).length === 2);
}

console.log('\n── ⑧-2 ボタンをクリック＝使い方の吹き出し（v1.38.0） ──');
{
  await p.evaluate(() => document.querySelector('#view-course1 .kb-lineadd').click());
  await p.waitForTimeout(250);
  ok('🔴 使い方が出る', (await p.locator('.kb-linehelp').count()) === 1);
  const txt = await p.evaluate(() => { const e = document.querySelector('.kb-linehelp'); return e ? e.textContent : ''; });
  /* v1.39.0 簡易表示＝4行。くわしい説明はヘルプ画面（課タスクボード）にある。 */
  ['ドラッグ', '移動', '枠の外へ出すと消える', 'ダブルクリックで名前']
    .forEach(k => ok('「' + k + '」の説明がある', txt.indexOf(k) >= 0));
  ok('🔴 4行の簡易表示', (await p.evaluate(() => document.querySelectorAll('.kb-linehelp-l li').length)) === 4);
  ok('小さい吹き出し（幅300px以下）',
     (await p.evaluate(() => document.querySelector('.kb-linehelp').getBoundingClientRect().width)) <= 300);
  ok('ボタンのすぐ近くに出る', await p.evaluate(() => {
    const b2 = document.querySelector('#view-course1 .kb-lineadd').getBoundingClientRect();
    const h = document.querySelector('.kb-linehelp').getBoundingClientRect();
    return h.top > b2.top - 20 && h.top < b2.bottom + 40 && h.left >= 0;
  }));
  ok('画面の中に収まっている', await p.evaluate(() => {
    const h = document.querySelector('.kb-linehelp').getBoundingClientRect();
    return h.left >= 0 && h.right <= window.innerWidth + 1 && h.top >= 0 && h.bottom <= window.innerHeight + 1;
  }));
  /* もう一度押すと閉じる */
  await p.evaluate(() => document.querySelector('#view-course1 .kb-lineadd').click());
  await p.waitForTimeout(200);
  ok('もう一度押すと閉じる', (await p.locator('.kb-linehelp').count()) === 0);
  /* 外側を押しても閉じる */
  await p.evaluate(() => document.querySelector('#view-course1 .kb-lineadd').click());
  await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('#kanban-cols-1').click());
  await p.waitForTimeout(200);
  ok('外側を押すと閉じる', (await p.locator('.kb-linehelp').count()) === 0);
  /* 🔴 ドラッグの直後にクリックが飛んでも開かない */
  await hdrag('#view-course1 .kb-lineadd', COL('check'), await yUnderCard('check', 0));
  await p.evaluate(() => document.querySelector('#view-course1 .kb-lineadd').click());
  await p.waitForTimeout(200);
  ok('🔴 ドラッグ直後のクリックでは開かない（誤爆しない）', (await p.locator('.kb-linehelp').count()) === 0);
  ok('ドラッグのほうは効いている（線が増えた）', (await linesOf()).length === 3, (await linesOf()).length);
  /* v1.39.0 簡易表示にしたので「くわしいヘルプを開く」ボタンは無い（説明はヘルプ画面に残してある） */
  await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector('#view-course1 .kb-lineadd').click());
  await p.waitForTimeout(250);
  ok('🔴 「くわしいヘルプ」ボタンは無い（簡易表示）', (await p.locator('.kb-linehelp [data-linehelpgo]').count()) === 0);
  ok('ヘルプ画面側の説明は残っている',
     /区切りライン（v1\.37\.0）/.test(fs.readFileSync('js/help-content.js', 'utf8')));
  await p.evaluate(() => document.querySelector('#kanban-cols-1').click());
  await p.waitForTimeout(200);
}

console.log('\n── ⑨ 今までの操作が壊れていないこと ──');
{
  ok('カードのドラッグ用の目印はそのまま',
     (await p.evaluate(sel => document.querySelectorAll(sel + ' [data-card-id][draggable="true"]').length, COL('check'))) === 3);
  const src = fs.readFileSync('js/ctxmenu-pit.js', 'utf8');
  ok('右クリックメニューに1行だけ足している', /PitBoardLine\.ctxItem\(c\)/.test(src));
  const tsrc = fs.readFileSync('js/task.js', 'utf8');
  ok('task.js の差し込みは PitBoardLine が無くても動く（保険つき）',
     (tsrc.match(/window\.PitBoardLine \? PitBoardLine\.renderColumn/g) || []).length === 4);
  ok('JSエラー0', errs.length === 0, errs.slice(0, 5));
}

await p.locator('#kanban-cols-1').screenshot({ path: 'shot_board_line.png' });
console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
