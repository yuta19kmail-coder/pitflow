/* PitFlow v1.69.0 ── 「担当車両」を押した時の 区切りライン と「◯課分」のバー
   -------------------------------------------------------------------
   ◎ゆうた指定
     「タスクボードの区切りラインだが、担当車両をクリックした際にバー自体の位置の同期、
       位置固定でバーの前後の両端から無くす　逆の課から増やす時はそれぞれの一番下に
       バーを付けて（タイトルに〇課分）その下にカードを付ける」

   ◎見張ること
     ① 「担当車両」を押しても、区切りラインは**同じ場所に残る**
        （前は、線の相手のカードが隠れると**列のいちばん下へ落ちて**いた）
     ② 隠れたカードは**線の上と下から消えるだけ**＝線の前後の顔ぶれは変わらない
     ③ よその課から来たカードは、列の**いちばん下**に「◯課分」のバーを1本はさんで、その下
     ④ 「◯課分」のバーは**見た目だけ**＝掴めない・保存しない
     ⑤ もう一度押して戻すと、線もカードも元どおり
     ⑥ 区切りラインの保存データ（boardLines）は**1バイトも変わらない**

   ◎使い方（PitFlow のフォルダで）
     python3 -m http.server 8995      ← 別ウィンドウ
     node test_line_myonly.mjs                                              */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8995;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.PitMyOnly && window.PitBoardLine && typeof window.showView === "function"', null, { timeout: 20000 });
await p.waitForTimeout(600);

/* 点検待ちの列に、1課のカードを5枚。うち自分の担当は L0 / L2 / L4。
   区切りラインは **L1 の下**（＝自分のカードのあいだ）に1本。
   2課には自分の担当を2枚（担当車両ONで集まってくる側）。 */
const ME = await p.evaluate(() => {
  const front = (state.staff || []).filter(s => s.front && !s.isSelf);
  const me = front[0], other = front[1] || (state.staff || []).find(s => s !== me);
  try { localStorage.setItem('pitflow_bn_me', me.id); } catch (e) {}
  state.cards = [];
  state.settings.boardLines = [];
  const mk = (id, who, boardId) => ({
    id: id, resNo: id, customer: '客' + id, car: 'アクア', maker: 'トヨタ',
    reserveDate: window.ymd(new Date()), reserveTime: '10:00', status: 'check',
    boardId: boardId, division: 'div1', workTypes: [], dropType: 'wait', frontStaff: who
  });
  ['L0', 'L1', 'L2', 'L3', 'L4'].forEach((id, i) => {
    state.cards.push(mk(id, (i % 2 === 0) ? me.name : other.name, 'default'));
  });
  state.cards.push(mk('X0', me.name, 'import'));
  state.cards.push(mk('X1', me.name, 'import'));
  state.settings.boardLines = [{ id: 'blTEST', boardId: 'default', status: 'check', after: 'L1', label: 'ここまで' }];
  window.showView('course1');
  return { id: me.id, name: me.name, other: other.name };
});
await p.waitForTimeout(500);

/* 点検待ちの列の中身を、上から順に並べて返す（カード＝id／線＝LINE:名前／課バー＝BAR:名前） */
const col = () => p.evaluate(() => {
  const body = document.querySelector('#kanban-cols-1 .kanban-col-body[data-drop-val="check"]');
  if (!body) return [];
  return Array.from(body.children).map(el => {
    if (el.hasAttribute('data-card-id')) return el.getAttribute('data-card-id');
    if (el.classList.contains('kb-line-xb')) return 'BAR:' + (el.querySelector('.kb-line-t') || {}).textContent;
    if (el.hasAttribute('data-lineid')) return 'LINE:' + ((el.querySelector('.kb-line-t') || {}).textContent || '');
    return '';
  }).filter(Boolean);
});
const saved = () => p.evaluate(() => JSON.stringify(state.settings.boardLines));
const before = await saved();

console.log('\n── 準備：担当車両OFF（今までどおり） ──');
{
  const c = await col();
  ok('1課の5枚が並び、L1 の下に線がある',
     JSON.stringify(c) === JSON.stringify(['L0', 'L1', 'LINE:ここまで', 'L2', 'L3', 'L4']), c);
  ok('よその課のカードは出ていない', c.indexOf('X0') < 0, c);
  ok('「◯課分」のバーも出ていない', c.every(x => !/^BAR:/.test(x)), c);
}

console.log('\n── ① 担当車両ON：線は同じ場所に残る ──');
await p.evaluate(() => window.pitMyOnlyToggle());
await p.waitForTimeout(400);
let onCol = await col();
{
  ok('🔴 線が列のいちばん下へ落ちていない', onCol[onCol.length - 1] !== 'LINE:ここまで', onCol);
  ok('🔴 線より上は L0、下は L2 のまま（前後の顔ぶれが変わらない）',
     onCol.indexOf('L0') < onCol.indexOf('LINE:ここまで') && onCol.indexOf('LINE:ここまで') < onCol.indexOf('L2'), onCol);
  ok('隠れたカード（L1・L3）は消えている',
     onCol.indexOf('L1') < 0 && onCol.indexOf('L3') < 0, onCol);
  ok('線の名前はそのまま', onCol.indexOf('LINE:ここまで') >= 0, onCol);
}

console.log('\n── ③ よその課は「◯課分」のバーの下にまとまる ──');
{
  ok('🔴 並びは 自分の課 → 2課分のバー → よその課',
     JSON.stringify(onCol) === JSON.stringify(['L0', 'LINE:ここまで', 'L2', 'L4', 'BAR:2課分', 'X0', 'X1']), onCol);
  ok('バーは1本だけ', onCol.filter(x => /^BAR:/.test(x)).length === 1, onCol);
  ok('バーの下のカードには「輸入」の印が付いている',
     (await p.evaluate(() => {
       const els = Array.from(document.querySelectorAll('#kanban-cols-1 [data-card-id="X0"]'));
       return els.length === 1 && els[0].getAttribute('data-xboard');
     })) === '輸入');
  ok('列の見出しの件数も出ている数と合う（5枚）',
     (await p.evaluate(() => +document.querySelector('#kanban-cols-1 .kanban-col .kanban-col-head .count').textContent)) === 5);
}

console.log('\n── ④ 「◯課分」のバーは見た目だけ ──');
{
  const r = await p.evaluate(() => {
    const bar = document.querySelector('#kanban-cols-1 .kb-line-xb');
    return { has: !!bar, lineid: bar && bar.hasAttribute('data-lineid'),
             drag: bar && bar.getAttribute('draggable'),
             cursor: bar && getComputedStyle(bar).cursor };
  });
  ok('バーは掴めない（区切りラインとは別物）', r.has === true && r.lineid === false && !r.drag, r);
  ok('カーソルも「掴めそう」に見せていない', r.cursor !== 'grab', r);
  ok('🔴 保存データには入っていない（線は1本のまま）',
     (await p.evaluate(() => state.settings.boardLines.length)) === 1);
}

console.log('\n── ⑥ データを触っていない ──');
{
  ok('🔴 区切りラインの保存データが1バイトも変わっていない', (await saved()) === before, await saved());
  ok('カードの課（boardId）も変わっていない',
     (await p.evaluate(() => state.cards.filter(c => c.boardId === 'import').map(c => c.id).join(','))) === 'X0,X1');
}

console.log('\n── ⑤ もう一度押すと元どおり ──');
await p.evaluate(() => window.pitMyOnlyToggle());
await p.waitForTimeout(400);
{
  const c = await col();
  ok('線もカードも元の並びに戻る',
     JSON.stringify(c) === JSON.stringify(['L0', 'L1', 'LINE:ここまで', 'L2', 'L3', 'L4']), c);
  ok('「◯課分」のバーは消えている', c.every(x => !/^BAR:/.test(x)), c);
}

console.log('\n── 線が列の先頭・末尾にある時 ──');
{
  await p.evaluate(() => {
    state.settings.boardLines = [
      { id: 'blTOP', boardId: 'default', status: 'check', after: '__top', label: '朝' },
      { id: 'blEND', boardId: 'default', status: 'check', after: 'L4',    label: '夜' }
    ];
    window._rerenderActiveBoard();
  });
  await p.waitForTimeout(300);
  ok('OFF：先頭と末尾に付く',
     JSON.stringify(await col()) === JSON.stringify(['LINE:朝', 'L0', 'L1', 'L2', 'L3', 'L4', 'LINE:夜']), await col());
  await p.evaluate(() => window.pitMyOnlyToggle());
  await p.waitForTimeout(400);
  ok('🔴 ON：先頭の線は先頭のまま／末尾の線は自分の課の最後（＝2課分のバーより上）',
     JSON.stringify(await col()) === JSON.stringify(['LINE:朝', 'L0', 'L2', 'L4', 'LINE:夜', 'BAR:2課分', 'X0', 'X1']), await col());
  await p.evaluate(() => window.pitMyOnlyToggle());
  await p.waitForTimeout(300);
}

console.log('\n── 相手のカードが居なくなった線は、黙って消さない ──');
{
  await p.evaluate(() => {
    state.settings.boardLines = [{ id: 'blLOST', boardId: 'default', status: 'check', after: 'いない', label: '迷子' }];
    window._rerenderActiveBoard();
  });
  await p.waitForTimeout(300);
  const c = await col();
  ok('列の末尾に寄せて残る（今までどおり）', c[c.length - 1] === 'LINE:迷子', c);
}

console.log('\n── 2課の盤から押した時 ──');
{
  await p.evaluate(() => {
    state.settings.boardLines = [{ id: 'bl2', boardId: 'import', status: 'check', after: 'X0', label: '輸入の区切り' }];
    window.showView('course2');
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => window.pitMyOnlyToggle());
  await p.waitForTimeout(400);
  const c2 = await p.evaluate(() => {
    const body = document.querySelector('#kanban-cols-2 .kanban-col-body[data-drop-val="check"]');
    return Array.from(body.children).map(el => {
      if (el.hasAttribute('data-card-id')) return el.getAttribute('data-card-id');
      if (el.classList.contains('kb-line-xb')) return 'BAR:' + (el.querySelector('.kb-line-t') || {}).textContent;
      if (el.hasAttribute('data-lineid')) return 'LINE:' + ((el.querySelector('.kb-line-t') || {}).textContent || '');
      return '';
    }).filter(Boolean);
  });
  ok('🔴 2課で押すと、バーの名前は「1課分」',
     JSON.stringify(c2) === JSON.stringify(['X0', 'LINE:輸入の区切り', 'X1', 'BAR:1課分', 'L0', 'L2', 'L4']), c2);
  ok('1課の区切りラインは2課の盤には出てこない', c2.indexOf('LINE:ここまで') < 0, c2);
  await p.evaluate(() => window.pitMyOnlyToggle());
  await p.waitForTimeout(200);
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  for (const v of ['course1', 'course2', 'today', 'return', 'task']) {
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(150);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.69.0 以降', vn[0] > 1 || (vn[0] === 1 && vn[1] >= 69), ver);
}

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
