/* PitFlow v2.182.0 ── 返車の日付・時間が動いたら、必ずフローに残る／並び順だけの「編集」を出さない
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-10-13 D75134）
     「返車確定日に16日が入っていて、当日ビューから返車済みにしたのに実績に入らず、
       返車カレンダーの16日に入っていた。確定日を手動で直したら実績化された。ただしログにも残ってない」
     「フローに 編集：車検の日取り {"mode":"manual",... → ... と変な文字列が出る。車検じゃないのに」

   ◎正体
     ① 返車の記録は「行き先が変わった時だけ」だった＝カレンダーの中で 13日 → 16日 は1行も残らない
     ② 実績カードの確定返車日は「実績カウント日が変わった時だけ」書いていた
     ③ 差分が入れ子を JSON の字で見くらべていた＝項目の並び順だけで「変わった」になる

   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8997      ← 別ウィンドウ
     node test_return_log.mjs                                           */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const PORT = process.env.PORT || 8997;
const cp = chromePath();
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitReturnSetDateTime && window.pitReturnCommit && window.pitCardDiff', null, { timeout: 20000 });
await p.waitForTimeout(600);

console.log('\n── ① 返車カレンダーの中で 13日 → 16日（行き先は同じ） ──');
{
  const r = await p.evaluate(() => {
    const c = { id:'L1', status:'workDone', boardId:'default', dropType:'drop', reserveDate:'2027-01-08',
                returnStage:'returnWait', returnDate:'2027-01-13', returnDateFinal:'2027-01-13', returnTime:'17:00', log:[] };
    const res = pitReturnSetDateTime(c, '2027-01-16', undefined);
    pitReturnCommit(c, res, { silent: true });
    return { moved: res.moved, log: c.log.map(l => l.label) };
  });
  ok('行き先は変わっていない（カレンダーのまま）', r.moved === false, r);
  ok('それでもフローに1行残る', r.log.length === 1, r.log);
  ok('「13 17:00 → 16 17:00」と読める', /2027-01-13 17:00 → 2027-01-16 17:00/.test(r.log[0] || ''), r.log);
}

console.log('\n── ② 時間だけ変える ──');
{
  const r = await p.evaluate(() => {
    const c = { id:'L2', status:'workDone', boardId:'default', dropType:'drop', reserveDate:'2027-01-08',
                returnStage:'returnWait', returnDate:'2027-01-13', returnDateFinal:'2027-01-13', returnTime:'17:00', log:[] };
    pitReturnCommit(c, pitReturnSetDateTime(c, undefined, '15:00'), { silent: true });
    return c.log.map(l => l.label);
  });
  ok('時間だけでも残る', r.length === 1 && /17:00 → 2027-01-13 15:00/.test(r[0]), r);
}

console.log('\n── ③ 何も変えない（同じ日・同じ時間を入れ直す） ──');
{
  const r = await p.evaluate(() => {
    const c = { id:'L3', status:'workDone', boardId:'default', dropType:'drop', reserveDate:'2027-01-08',
                returnStage:'returnWait', returnDate:'2027-01-13', returnDateFinal:'2027-01-13', returnTime:'17:00', log:[] };
    pitReturnCommit(c, pitReturnSetDateTime(c, '2027-01-13', '17:00'), { silent: true });
    return c.log.length;
  });
  ok('何も変わっていなければ書かない', r === 0, r);
}

console.log('\n── ④ 完TEL待ちから日付を入れた＝完TELの1行だけ（2行にしない） ──');
{
  const r = await p.evaluate(() => {
    const c = { id:'L4', status:'workDone', boardId:'default', dropType:'drop', reserveDate:'2026-10-08',
                returnStage:'callWait', returnDate:'', returnTime:'', log:[] };
    pitReturnCommit(c, pitReturnSetDateTime(c, '2026-10-16', '10:00'), { silent: true });
    return c.log.map(l => l.label);
  });
  ok('1行だけ（完TEL済の行）', r.length === 1 && /完TEL済/.test(r[0]), r);
}

console.log('\n── ⑤ 並び順だけ違う「車検の日取り」「連絡先」＝編集に出さない ──');
{
  const r = await p.evaluate(() => {
    const a = { id:'D1', inspSchedule:{ mode:'manual', slots:{}, cutBefore:'' },
                contacts:[{ name:'代表', tel:'047', kind:'tel' }, { tel:'090', name:'担当' }] };
    const b = { id:'D1', inspSchedule:{ slots:{}, cutBefore:'', mode:'manual' },
                contacts:[{ kind:'tel', tel:'047', name:'代表' }, { name:'担当', tel:'090' }] };
    return pitCardDiff(a, b).map(pitCardDiffText);
  });
  ok('何も出ない', r.length === 0, r);
}

console.log('\n── ⑥ 本当に変わった時は今までどおり出る ──');
{
  const r = await p.evaluate(() => {
    const a = { id:'D2', inspSchedule:{ mode:'manual', decided:'' }, contacts:[{ name:'代表', tel:'047' }] };
    const b = { id:'D2', inspSchedule:{ decided:'2026-10-20', mode:'manual' }, contacts:[{ name:'代表', tel:'048' }] };
    return pitCardDiff(a, b).map(pitCardDiffText);
  });
  ok('車検の日取り・行く日 が1行', r.some(t => /^車検の日取り・行く日 （空） → 2026-10-20$/.test(t)), r);
  ok('連絡先は「1件 → 1件（中身を変更）」', r.some(t => /^連絡先 1件 → 1件（中身を変更）$/.test(t)), r);
  ok('{…} の字が出ない', !r.some(t => /[{}]/.test(t)), r);
}

console.log('\n── ⑦ 実績カード：確定返車日 16 → 13（実績カウント日はもともと13） ──');
{
  const r = await p.evaluate(async () => {
    const c = { id:'R1', status:'returned', boardId:'import', dropType:'drop', reserveDate:'2026-10-08',
                returnStage:'returnWait', returnDate:'2026-10-16', returnDateFinal:'2026-10-16', returnTime:'17:00',
                completedAt:'2026-10-13', amountFinal:74000, customer:'テスト', car:'スマートフォーツー', log:[] };
    state.cards.push(c);
    openCard('R1');
    await new Promise(r => setTimeout(r, 300));
    cvSetReturn('2026-10-13');
    return { log: c.log.map(l => l.label), ret: c.returnDateFinal, done: c.completedAt };
  });
  ok('確定返車日は13日になった', r.ret === '2026-10-13' && r.done === '2026-10-13', r);
  ok('フローに「16 → 13」が残る', r.log.some(t => /2026-10-16 → 2026-10-13/.test(t)), r.log);
}

console.log('\n── ⑧ v2.183.0 予約カレンダーのドラッグ（週の日時）＝入庫の予定が残る ──');
{
  const r = await p.evaluate(() => {
    const c = { id:'I1', status:'reserved', boardId:'default', dropType:'drop', reserveDate:'2026-10-20', reserveTime:'10:00', log:[] };
    state.cards.push(c);
    window.pitIntakeGuard = null;   /* 休みの日の確認窓を出さない（試験用） */
    applyCardDrop('I1', 'reserveDateTime', '2026-10-21|13:00');
    return c.log.map(l => l.label);
  });
  ok('「入庫の予定を 2026-10-20 10:00 → 2026-10-21 13:00 に変更」', r.some(t => /入庫の予定を 2026-10-20 10:00 → 2026-10-21 13:00 に変更/.test(t)), r);
}

console.log('\n── ⑨ 状態のドラッグなど、入庫の日時が動かない時は書かない ──');
{
  const r = await p.evaluate(() => {
    const c = { id:'I2', status:'check', boardId:'default', dropType:'drop', reserveDate:'2026-10-20', reserveTime:'10:00', log:[] };
    state.cards.push(c);
    applyCardDrop('I2', 'bay', 'b1');
    return c.log.filter(l => /入庫の予定/.test(l.label || '')).length;
  });
  ok('入庫の予定の行は出ない', r === 0, r);
}

console.log('\n── ⑩ 代車の返却を確定＝フローに残る ──');
{
  const r = await p.evaluate(async () => {
    const c = { id:'K1', status:'returned', boardId:'default', reserveDate:'2026-10-08', loanerId:'L1', loanerFrom:'2026-10-08', loanerTo:'2026-10-16', log:[] };
    state.cards.push(c);
    state.loanerAssigns = state.loanerAssigns || [];
    state.loanerAssigns.push({ id:'A9', cardId:'K1', loanerId:'L1', fromDate:'2026-10-08', toDate:'2026-10-16' });
    document.body.insertAdjacentHTML('beforeend', '<input type="date" id="lo-ret-date" value="2026-10-13">');
    const keep = window.pitAsk; window.pitAsk = () => Promise.resolve(true);
    loReturnConfirm('A9');
    await new Promise(r => setTimeout(r, 50));
    window.pitAsk = keep;
    return { log: c.log.map(l => l.label), to: c.loanerTo };
  });
  ok('返却日と縮めた返却予定が残る', r.log.some(t => /代車の返却を確定した　返却日 2026-10-13／返却予定 2026-10-16 → 2026-10-13/.test(t)), r);
}

console.log('\n── ⑪ 共通の入口：同じ値なら書かない ──');
{
  const r = await p.evaluate(() => {
    const c = { id:'X1', log:[] };
    const a = pitLogDateChange(c, '売上日', '2026-10-12', '2026-10-12');
    const b = pitLogDateChange(c, '売上日', '', '2026-10-12');
    return { a, b, log: c.log.map(l => l.label) };
  });
  ok('同じ＝書かない／違う＝書く', r.a === false && r.b === true && r.log[0] === '売上日を 未定 → 2026-10-12 に変更', r);
}

ok('画面のエラーなし', errs.length === 0, errs);
console.log(`\n${pass} 通過 / ${fail} 失敗`);
await b.close();
process.exit(fail ? 1 : 0);
