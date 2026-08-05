/* PitFlow v1.48.0 ── 「担当車両」が1課・2課をまたいで集める のテスト
   -------------------------------------------------------------------
   ◎ゆうた指定
     「**担当車両のボタンをクリックしたときって、1課2課のボードを横断して、
       押した方のボードに、じゃない方のボードの自分の担当も同じ位置に表示するって出来ないかな？**」
   ◎できること
     ・ON＝**1課・2課の両方から自分の担当を集めて**、**同じ工程の列**に並べる
       （列のIDは1課も2課も同じ＝点検待ち/見積り中/連絡中/パーツ待ち/作業待ち/…）。
     ・よその課から来たカードには **「1課」「2課」の印**（左の色帯も国産＝緑／輸入＝桃のまま）。
     ・OFF＝今までどおり「そのボードのカードだけ」。
   ◎ここが大事
     🔴 **データは1バイトも変えない**＝集めても `boardId` はそのまま。
        だから別の課のカードを掴んで動かしても、**工程が変わるだけで課は変わらない**。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8960      ← 別ウィンドウ
     node test_myonly_cross.mjs                                              */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1700, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:8960/index.html?demo=1');
await p.waitForFunction('window.state && window.PitMyOnly && typeof window.showView === "function"', null, { timeout: 20000 });
await p.waitForTimeout(800);

/* 盤を作り直す。
   ・自分（フロントの人）の担当 … 1課の点検待ち2枚／2課の点検待ち1枚／2課の連絡中1枚
   ・他人の担当              … 1課の点検待ち1枚／2課の点検待ち1枚 */
const ME = await p.evaluate(() => {
  const front = (state.staff || []).filter(s => s.front);
  const me = front[0], other = front[1] || (state.staff || []).find(s => s !== me);
  try { localStorage.setItem('pitflow_bn_me', me.id); } catch (e) {}
  state.settings.boardLines = [];
  state.cards = [];
  const mk = (id, who, board, st) => ({ id: id, resNo: id.toUpperCase(), customer: '客' + id + ' 太郎',
    car: 'アクア', maker: 'トヨタ', reserveDate: window.ymd(new Date()), reserveTime: '10:00',
    status: st, boardId: board, division: (board === 'import' ? 'div2' : 'div1'),
    workTypes: [], dropType: 'wait', frontStaff: who.name, frontStaffId: who.id });
  state.cards.push(mk('a1', me,    'default', 'check'));
  state.cards.push(mk('a2', me,    'default', 'check'));
  state.cards.push(mk('b1', me,    'import',  'check'));
  state.cards.push(mk('b2', me,    'import',  'contact'));
  state.cards.push(mk('x1', other, 'default', 'check'));
  state.cards.push(mk('x2', other, 'import',  'check'));
  window.showView('course1');
  return { id: me.id, name: me.name, other: other.name };
});
await p.waitForTimeout(600);
await p.evaluate(() => { if (window.PitMyOnly) PitMyOnly.refresh(); });
await p.waitForTimeout(300);

/* 指定したボードの、指定した列に出ているカードID */
const inCol = (view, colName) => p.evaluate(a => {
  const cols = Array.from(document.querySelectorAll('#' + a.host + ' .kanban-col'));
  const col = cols.find(c => (c.querySelector('.kanban-col-head') || {}).textContent.indexOf(a.col) >= 0);
  if (!col) return null;
  return Array.from(col.querySelectorAll('[data-card-id]')).map(e => e.getAttribute('data-card-id'));
}, { host: view === 'course1' ? 'kanban-cols-1' : 'kanban-cols-2', col: colName });
const countOf = (view, colName) => p.evaluate(a => {
  const cols = Array.from(document.querySelectorAll('#' + a.host + ' .kanban-col'));
  const col = cols.find(c => (c.querySelector('.kanban-col-head') || {}).textContent.indexOf(a.col) >= 0);
  const n = col && col.querySelector('.kanban-col-head .count');
  return n ? +n.textContent : null;
}, { host: view === 'course1' ? 'kanban-cols-1' : 'kanban-cols-2', col: colName });
const sorted = a => (a || []).slice().sort();

console.log('\n── ① OFFのあいだは今までどおり（そのボードのカードだけ） ──');
{
  ok('1課の点検待ち＝1課のカードだけ', JSON.stringify(sorted(await inCol('course1', '点検待ち'))) === JSON.stringify(['a1','a2','x1']),
     await inCol('course1', '点検待ち'));
  ok('2課のカードは1課に出ていない', !(await inCol('course1', '点検待ち')).some(id => /^b/.test(id)));
  ok('別の課の印は付いていない', (await p.evaluate(() => document.querySelectorAll('#kanban-cols-1 .kb-xboard').length)) === 0);
}

console.log('\n── ② 🔴 ONにすると、2課の自分の担当も1課の盤に出る ──');
{
  await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').click());
  await p.waitForTimeout(600);
  const chk = await inCol('course1', '点検待ち');
  ok('🔴 1課の点検待ちに、2課の自分の担当（b1）も並んだ',
     JSON.stringify(sorted(chk)) === JSON.stringify(['a1','a2','b1']), chk);
  ok('🔴 他人の担当は1課・2課とも消えた', !chk.some(id => /^x/.test(id)), chk);
  const con = await inCol('course1', '連絡中');
  ok('🔴 「同じ位置」＝2課の連絡中のカードは、1課の盤でも連絡中に入る',
     JSON.stringify(con) === JSON.stringify(['b2']), con);
  ok('列の見出しの件数も出ている数と合う', (await countOf('course1', '点検待ち')) === 3, await countOf('course1', '点検待ち'));
}

console.log('\n── ③ よその課から来たカードには印が付く ──');
{
  const marks = await p.evaluate(() => Array.from(document.querySelectorAll('#kanban-cols-1 .kb-xboard'))
    .map(e => ({ id: e.getAttribute('data-card-id'), tag: e.getAttribute('data-xboard') })));
  ok('🔴 2課から来た2枚に印が付いている', marks.length === 2, marks);
  ok('印の文字は「2課」', marks.every(m => m.tag === '2課'), marks);
  ok('印が付いているのは b1 / b2 だけ', JSON.stringify(sorted(marks.map(m => m.id))) === JSON.stringify(['b1','b2']), marks);
  ok('1課のカードには印が付かない',
     (await p.evaluate(() => !document.querySelector('#kanban-cols-1 [data-card-id="a1"]').classList.contains('kb-xboard'))));
  ok('印は実際に画面に見えている（CSSで文字を出している）',
     (await p.evaluate(() => {
        const el = document.querySelector('#kanban-cols-1 .kb-xboard');
        const cs = getComputedStyle(el, '::after');
        return cs.content.indexOf('2課') >= 0 || cs.content === 'attr(data-xboard)';
     })));
}

console.log('\n── ④ 🔴 データは1バイトも変えていない ──');
{
  const boards = await p.evaluate(() => state.cards.map(c => c.id + ':' + c.boardId).join(','));
  ok('🔴 カードの所属（boardId）はそのまま',
     boards === 'a1:default,a2:default,b1:import,b2:import,x1:default,x2:import', boards);
  ok('カードの数も変わっていない', (await p.evaluate(() => state.cards.length)) === 6);
  const msrc = fs.readFileSync('js/myonly-pit.js', 'utf8');
  ok('保存していない（PitDB.save を呼んでいない）', !/PitDB\.save/.test(msrc));
}

console.log('\n── ⑤ 2課の盤で押しても同じ（対称） ──');
{
  await p.evaluate(() => { if (window.PitMyOnly.isOn()) document.querySelector('#view-course1 .kb-myonly').click(); });
  await p.waitForTimeout(400);
  await p.evaluate(() => window.showView('course2'));
  await p.waitForTimeout(500);
  await p.evaluate(() => { if (window.PitMyOnly) PitMyOnly.refresh(); });
  await p.waitForTimeout(200);
  ok('2課の点検待ち＝OFFなら2課のカードだけ',
     JSON.stringify(sorted(await inCol('course2', '点検待ち'))) === JSON.stringify(['b1','x2']), await inCol('course2', '点検待ち'));
  await p.evaluate(() => document.querySelector('#view-course2 .kb-myonly').click());
  await p.waitForTimeout(600);
  const chk2 = await inCol('course2', '点検待ち');
  ok('🔴 ONにすると1課の自分の担当も2課の盤に出る',
     JSON.stringify(sorted(chk2)) === JSON.stringify(['a1','a2','b1']), chk2);
  const marks2 = await p.evaluate(() => Array.from(document.querySelectorAll('#kanban-cols-2 .kb-xboard'))
    .map(e => e.getAttribute('data-xboard')));
  ok('🔴 こちらの印は「1課」', marks2.length === 2 && marks2.every(t => t === '1課'), marks2);
}

console.log('\n── ⑥ 動かしても課は変わらない（工程だけ変わる） ──');
{
  /* dnd.js は status しか触らないので、ここでは同じ道すじ（applyCardDrop 相当）を呼んで確かめる */
  const before = await p.evaluate(() => state.cards.find(c => c.id === 'a1').boardId);
  await p.evaluate(() => { const c = state.cards.find(x => x.id === 'a1'); if (window.logPhaseMove) logPhaseMove(c, c.status, 'work'); c.status = 'work'; });
  await p.evaluate(() => window.showView('course2'));
  await p.waitForTimeout(500);
  ok('🔴 工程を動かしても boardId は変わらない',
     (await p.evaluate(() => state.cards.find(c => c.id === 'a1').boardId)) === before, before);
  ok('動かした先の列に出る', (await inCol('course2', '作業待ち')).indexOf('a1') >= 0, await inCol('course2', '作業待ち'));
  ok('印は「1課」のまま（元の課を示している）',
     (await p.evaluate(() => { const e = document.querySelector('#kanban-cols-2 [data-card-id="a1"]'); return e && e.getAttribute('data-xboard'); })) === '1課');
}

console.log('\n── ⑦ 解除すると元どおり ──');
{
  await p.evaluate(() => document.querySelector('#view-course2 .kb-myonly').click());
  await p.waitForTimeout(600);
  ok('🔴 他人のカードも戻る', (await inCol('course2', '点検待ち')).indexOf('x2') >= 0, await inCol('course2', '点検待ち'));
  ok('🔴 1課のカードは2課の盤から消える', !(await inCol('course2', '点検待ち')).some(id => /^a/.test(id)));
  ok('印も消える', (await p.evaluate(() => document.querySelectorAll('#kanban-cols-2 .kb-xboard').length)) === 0);
  await p.evaluate(() => window.showView('today'));
  await p.waitForTimeout(300);
  ok('別のビューへ移ると解除されるのは今までどおり', !(await p.evaluate(() => window.PitMyOnly.isOn())));
}

console.log('\n── ⑧ 二度と崩れないように（配線チェック） ──');
{
  const t = fs.readFileSync('js/task.js', 'utf8');
  ok('task.js は列のカードを PitMyOnly.colCards に任せている', /PitMyOnly\.colCards\(board, col\)/.test(t));
  ok('PitMyOnly が無くても動く（保険つき）', /window\.PitMyOnly && PitMyOnly\.colCards/.test(t));
  ok('カードの印付けも1か所を通している', /PitMyOnly\.decorate\(c, board, cardHtml\(c, o\)\)/.test(t));
  const m = fs.readFileSync('js/myonly-pit.js', 'utf8');
  ok('集める相手は state.boards にある盤だけ', /function courseBoardIds\(\)/.test(m));
  ok('印はHTMLを組み立て直さず class を足すだけ', /replace\('<div class="pit-card pcm'/.test(m));
  const css = fs.readFileSync('css/polish.css', 'utf8');
  ok('印の文字は CSS が data-xboard から出している', /content:attr\(data-xboard\)/.test(css));
  const idx = fs.readFileSync('index.html', 'utf8');
  const _mVer = (idx.match(/<div class="login-ver">v([\d.]+)<\/div>/) || [])[1] || '';
  const _tVer = (idx.match(/<span class="ver">v([\d.]+)<\/span>/) || [])[1] || '';
  const _aVer = (idx.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('画面の版2か所と app-version がそろっている', !!_mVer && _mVer === _tVer && _mVer === _aVer, [_mVer, _tVer, _aVer]);
  ok('JSエラー0', errs.length === 0, errs.slice(0, 5));
}

console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
