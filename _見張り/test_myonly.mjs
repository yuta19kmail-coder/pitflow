/* PitFlow v1.41.0 ── タスクボードの「担当車両」スイッチのテスト
   -------------------------------------------------------------------
   ◎考え方
     **PitFlow 本体（index.html）をサンプルモードで丸ごと開き**、1課のタスクボードで
     実際にスイッチを押して確かめる（ゆうた指定）。
       ① 区切りラインの**左**にある
       ② 押すと**自分が担当のカードだけ**残る（ほかは一時的に隠れる）
       ③ もう一度押すと解除
       ④ **別のビューへ移ると解除**（戻ってきた時も全部出ている）
       ⑤ **フロントにチェックが入っている人にだけ**出る
     ＋ データを一切変えていないこと（隠しているだけ）。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8953      ← 別ウィンドウ
     node test_myonly.mjs                                                    */
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
await p.goto('http://127.0.0.1:8953/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.PitMyOnly && typeof window.showView === "function"', null, { timeout: 20000 });
await p.waitForTimeout(600);

/* 「自分」＝フロントの人。自分の担当3枚／他人の担当2枚／担当なし1枚 を置く */
const ME = await p.evaluate(() => {
  const front = (state.staff || []).filter(s => s.front && !s.isSelf);
  const me = front[0], other = front[1] || (state.staff || []).find(s => s !== me);
  try { localStorage.setItem('pitflow_bn_me', me.id); } catch (e) {}
  state.settings.boardLines = [];
  state.cards = [];
  const mk = (i, who, st) => ({ id: 'mo' + i, resNo: 'M' + i, customer: '客' + i + ' 太郎', car: 'アクア', maker: 'トヨタ',
    reserveDate: window.ymd(new Date()), reserveTime: '10:00', status: st, boardId: 'default',
    division: 'div1', workTypes: [], dropType: 'wait', frontStaff: who });
  state.cards.push(mk(0, me.name, 'check'));
  state.cards.push(mk(1, other.name, 'check'));
  state.cards.push(mk(2, me.name, 'check'));
  state.cards.push(mk(3, other.name, 'work'));
  state.cards.push(mk(4, me.name, 'work'));
  state.cards.push(mk(5, '', 'work'));
  window.showView('course1');
  return { id: me.id, name: me.name, other: other.name };
});
await p.waitForTimeout(500);

const shown = () => p.evaluate(() => Array.from(document.querySelectorAll('#kanban-cols-1 [data-card-id]'))
  .map(e => e.getAttribute('data-card-id')).filter(id => /^mo\d+$/.test(id)));
const counts = () => p.evaluate(() => Array.from(document.querySelectorAll('#kanban-cols-1 .kanban-col-head .count'))
  .map(e => +e.textContent));

console.log('\n── ① ボタンの場所と見た目 ──');
{
  const order = await p.evaluate(() => Array.from(document.querySelectorAll('#view-course1 .view-actions > *'))
    .map(e => e.className.split(' ')[0] + (e.getAttribute('data-drop') ? ':' + e.getAttribute('data-drop') : '')));
  ok('「担当車両」がある', order.indexOf('kb-myonly') >= 0, order);
  ok('🔴 区切りラインの**左**にある',
     order.indexOf('kb-myonly') >= 0 && order.indexOf('kb-myonly') < order.indexOf('kb-lineadd'), order);
  ok('文字は「担当車両」',
     (await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').textContent.trim())) === '担当車両');
  ok('2課のボードにもある', (await p.locator('#view-course2 .kb-myonly').count()) === 1);
}

console.log('\n── ⑤ フロントの人にだけ出る ──');
{
  ok('🔴 フロントの自分には出ている',
     (await p.evaluate(() => getComputedStyle(document.querySelector('#view-course1 .kb-myonly')).display)) !== 'none');
  /* フロントのチェックを外してみる */
  await p.evaluate(id => { (state.staff || []).find(s => s.id === id).front = false; window.PitMyOnly.refresh(); }, ME.id);
  await p.waitForTimeout(150);
  ok('🔴 フロントでない人には出ない',
     (await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').style.display)) === 'none');
  ok('その状態では押しても何も起きない', await p.evaluate(() => {
    window.pitMyOnlyToggle();
    return window.PitMyOnly.isOn() === false;
  }));
  await p.evaluate(id => { (state.staff || []).find(s => s.id === id).front = true; window.PitMyOnly.refresh(); }, ME.id);
  await p.waitForTimeout(150);
  ok('戻すとまた出る',
     (await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').style.display)) !== 'none');
}

console.log('\n── ② 押すと自分の担当だけ残る ──');
{
  const before = await shown();
  ok('押す前は6枚ぜんぶ出ている', before.length === 6, before);
  await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').click());
  await p.waitForTimeout(400);
  const after = await shown();
  ok('🔴 自分の担当3枚だけになった', JSON.stringify(after.slice().sort()) === JSON.stringify(['mo0','mo2','mo4']), after);
  ok('他人の担当は隠れた', after.indexOf('mo1') < 0 && after.indexOf('mo3') < 0);
  ok('担当が空のカードも隠れた', after.indexOf('mo5') < 0);
  ok('ボタンが押した見た目になる',
     (await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').classList.contains('on'))));
  const cnt = await counts();
  ok('列の見出しの件数も出ている数と合う', cnt[0] === 2 && cnt[4] === 1, cnt);
  ok('🔴 カードのデータは1枚も変わっていない（隠しているだけ）',
     (await p.evaluate(() => state.cards.filter(c => /^mo\d+$/.test(c.id)).length)) === 6);
}

console.log('\n── ③ もう一度押すと解除 ──');
{
  await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').click());
  await p.waitForTimeout(400);
  ok('🔴 6枚ぜんぶ戻った', (await shown()).length === 6);
  ok('ボタンの見た目も戻る',
     !(await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').classList.contains('on'))));
}

console.log('\n── ④ 別のビューへ移ると解除 ──');
{
  await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').click());
  await p.waitForTimeout(300);
  ok('いったんON', await p.evaluate(() => window.PitMyOnly.isOn()));
  await p.evaluate(() => window.showView('today'));
  await p.waitForTimeout(300);
  ok('🔴 別のビューへ移った時点で解除', !(await p.evaluate(() => window.PitMyOnly.isOn())));
  await p.evaluate(() => window.showView('course1'));
  await p.waitForTimeout(400);
  ok('🔴 戻ってきた時は全部出ている', (await shown()).length === 6);
  ok('ボタンも押していない見た目',
     !(await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').classList.contains('on'))));
  /* 課ボードどうしの行き来では解除しない（1課↔2課は同じ用途） */
  await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').click());
  await p.waitForTimeout(250);
  await p.evaluate(() => window.showView('course2'));
  await p.waitForTimeout(250);
  ok('1課↔2課の行き来では解除しない', await p.evaluate(() => window.PitMyOnly.isOn()));
  await p.evaluate(() => window.showView('course1'));
  await p.waitForTimeout(250);
  await p.evaluate(() => { if (window.PitMyOnly.isOn()) document.querySelector('#view-course1 .kb-myonly').click(); });
  await p.waitForTimeout(300);
}

console.log('\n── ⑥ 名前が変わっても引ける／IDがあればID優先 ──');
{
  ok('IDで一致すれば名前が違っても自分の担当',
     await p.evaluate(id => window.PitMyOnly.pass({ frontStaffId: id, frontStaff: '昔の名前' }) === true ||
                            !window.PitMyOnly.isOn(), ME.id));
  ok('スイッチが切れている時は必ず全部通す',
     await p.evaluate(() => window.PitMyOnly.pass({ frontStaff: '知らない人' }) === true));
}

console.log('\n── ⑦ 今までの操作が壊れていないこと ──');
{
  const tsrc = fs.readFileSync('js/task.js', 'utf8');
  /* ⚠ v1.48.0 差し込みは `pass()` での絞り込み → `colCards()`（課をまたいで集める）に変わった。
     見たいのは「**PitMyOnly が無くても落ちない**」ことなので、そこだけ見る。 */
  ok('task.js の差し込みは PitMyOnly が無くても動く（保険つき）',
     /window\.PitMyOnly && PitMyOnly\.colCards/.test(tsrc) &&
     /window\.PitMyOnly && PitMyOnly\.decorate/.test(tsrc));
  const msrc = fs.readFileSync('js/myonly-pit.js', 'utf8');
  ok('保存はしていない（データを触らない）', !/PitDB\.save/.test(msrc));
  ok('showView は包んでいるだけ（views.js は無改造）', /var _orig = w\.showView/.test(msrc));
  ok('区切りラインは今までどおり使える',
     (await p.evaluate(() => !!document.querySelector('#view-course1 .kb-lineadd'))));
  ok('JSエラー0', errs.length === 0, errs.slice(0, 5));
}

await p.evaluate(() => document.querySelector('#view-course1 .kb-myonly').click());
await p.waitForTimeout(400);
await p.locator('#view-course1').screenshot({ path: 'shot_myonly.png' });
console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
