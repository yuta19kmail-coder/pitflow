/* PitFlow v1.71.0 ── 完TEL待ちから、日付と時間を入れたら返車カレンダーへ移る
   -------------------------------------------------------------------
   ◎ゆうた報告
     「完TEL待ちから、話が決まって日付と時間をいれても
       そっち（返車のメインカレンダー）に行かないバグがある」

   ◎正体（2つ）
     ① **完TEL待ちの車は、盤面で入れた「お客様への約束の日」をすでに持っていることがある。**
        その車に**時間だけ**入れても、returnStage が callWait のまま残っていた。
        （「完TEL済とみなす」のが**日付を入れた時だけ**だったため。
          日付欄は変えていないので change が飛ばず、いつまでも完TEL待ちの箱から出られない）
     ② **ドラッグだけ、返車の日時を直接書き込んでいた**（dnd.js）。
        唯一の入口（pitReturnSetDateTime）を通っていないので returnStage が付け替わらず、
        日付も時間も入っているのに「まだ電話していない」箱に残った。

   ◎直し
     ・**返車の日か時間を人が入れた＝完TELは済んでいる**（空にした時は上げない）
     ・返車のドラッグ（時刻／日／日＋時刻）も唯一の入口を通す

   ◎使い方（PitFlow のフォルダで）
     python3 -m http.server 8997      ← 別ウィンドウ
     node test_callwait_move.mjs                                        */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8997;
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
await p.waitForFunction('window.state && window.pitReturnPlace && window.applyCardDrop', null, { timeout: 20000 });
await p.waitForTimeout(600);

console.log('\n── ① 🔴 完TEL待ち＋約束の日あり → 時間だけ入れる ──');
{
  const r = await p.evaluate(() => {
    const T = window.ymd(new Date());
    /* 盤面で「お客様への約束の日」を入れてから完TEL依頼した車＝完TEL待ちだが日付を持っている */
    const c = { id:'A1', status:'workDone', boardId:'default', dropType:'drop', reserveDate:T,
                returnStage:'callWait', returnDate:T, returnTime:'' };
    const before = pitReturnPlace(c);
    pitReturnSetDateTime(c, undefined, '11:00');
    return { before, after: pitReturnPlace(c), stage: c.returnStage, listDate: pitReturnListDate(c) };
  });
  ok('入れる前は完TEL待ち', r.before === 'callWait', r);
  ok('🔴 時間を入れたら返車カレンダーへ移る（v1.70.0 までは完TEL待ちのままだった）', r.after === 'calendar', r);
  ok('返車カレンダーのその日に出る', !!r.listDate, r);
}

console.log('\n── ② 日付・時間の入れ方（順番・受付タイプを変えても同じ） ──');
{
  const rows = await p.evaluate(() => {
    const T = window.ymd(new Date());
    const out = [];
    const base = drop => ({ id:'x', status:'workDone', boardId:'default', dropType:drop,
      reserveDate:T, returnStage:'callWait', returnDate:'', returnTime:'' });
    ['drop','wait','sameDay'].forEach(d => {
      [['日→時', [[T, undefined], [undefined, '11:00']]],
       ['時→日', [[undefined, '11:00'], [T, undefined]]],
       ['同時',   [[T, '11:00']]]].forEach(([nm, steps]) => {
        const c = base(d);
        steps.forEach(s => pitReturnSetDateTime(c, s[0], s[1]));
        out.push({ d, nm, place: pitReturnPlace(c) });
      });
    });
    return out;
  });
  ok('🔴 どの受付タイプ・どの順番でも返車カレンダーへ行く',
     rows.every(r => r.place === 'calendar'), rows.filter(r => r.place !== 'calendar'));
}

console.log('\n── ③ 片方だけの時（完TEL済には上がるが、まだカレンダーには出さない） ──');
{
  const r = await p.evaluate(() => {
    const T = window.ymd(new Date());
    const mk = () => ({ id:'x', status:'workDone', boardId:'default', dropType:'drop',
      reserveDate:T, returnStage:'callWait', returnDate:'', returnTime:'' });
    const a = mk(); pitReturnSetDateTime(a, T, undefined);
    const b = mk(); pitReturnSetDateTime(b, undefined, '11:00');
    const c = mk(); pitReturnSetDateTime(c, undefined, '未定');
    return { 日だけ: pitReturnPlace(a), 時だけ: pitReturnPlace(b), 未定: pitReturnPlace(c) };
  });
  ok('日付だけ → 返車時間未定', r.日だけ === 'timeTbd', r);
  ok('時間だけ → 返車日未定（完TEL待ちには残さない）', r.時だけ === 'dateTbd', r);
  ok('時間に「未定」を選んだ時も完TEL待ちには残さない', r.未定 === 'dateTbd', r);
}

console.log('\n── ④ 空にした時は完TEL待ちのまま（取り消しを壊さない） ──');
{
  const r = await p.evaluate(() => {
    const T = window.ymd(new Date());
    const c = { id:'x', status:'workDone', boardId:'default', dropType:'drop', reserveDate:T,
                returnStage:'callWait', returnDate:'', returnTime:'' };
    pitReturnSetDateTime(c, '', '');
    return { place: pitReturnPlace(c), stage: c.returnStage };
  });
  ok('🔴 空を書いても完TEL待ちのまま', r.place === 'callWait' && r.stage === 'callWait', r);
}

console.log('\n── ⑤ 待ち・当日返しで**まだ盤面にいる**車は、日付を入れても完TEL済にしない（v1.65.0の決めごと） ──');
{
  const r = await p.evaluate(() => {
    const T = window.ymd(new Date());
    const c = { id:'x', status:'work', boardId:'default', dropType:'wait', reserveDate:T,
                returnDate:'', returnTime:'' };                       /* returnStage 無し＝まだ盤面 */
    pitReturnSetDateTime(c, T, '11:00');
    return { stage: c.returnStage || '(なし)', place: pitReturnPlace(c), listDate: pitReturnListDate(c) };
  });
  ok('🔴 盤面から消えない（returnStage は付けない）', r.stage === '(なし)', r);
  ok('返車の一覧にはその日で出る（待・当の決めごと）', !!r.listDate, r);
}

console.log('\n── ⑥ 🔴 ドラッグでも同じ（唯一の入口を通す） ──');
{
  const r = await p.evaluate(() => {
    const T = window.ymd(new Date());
    const mk = id => ({ id, resNo:id, customer:'客'+id, car:'アクア', status:'workDone',
      boardId:'default', dropType:'drop', reserveDate:T, returnStage:'callWait', returnDate:'', returnTime:'' });
    state.cards = [mk('D1'), mk('D2'), mk('D3'), mk('D4')];
    state.returnDate = new Date(); state.currentView = 'return';
    applyCardDrop('D1', 'returnTime', '11:00');          /* 返車カレンダーの 11時の枠へ */
    applyCardDrop('D2', 'returnDateTime', T + '|11:00'); /* 週ビューの枠へ */
    applyCardDrop('D3', 'returnDate', T);                /* 月ビューの日へ */
    applyCardDrop('D4', 'returnTime', '');               /* 時刻未定の枠へ */
    const at = id => { const c = state.cards.find(x => x.id === id);
      return { place: pitReturnPlace(c), stage: c.returnStage, date: c.returnDate, time: c.returnTime }; };
    return { D1: at('D1'), D2: at('D2'), D3: at('D3'), D4: at('D4') };
  });
  ok('🔴 時間の枠へ落とす → 返車カレンダー', r.D1.place === 'calendar', r.D1);
  ok('🔴 週ビューの枠（日＋時刻）へ落とす → 返車カレンダー', r.D2.place === 'calendar', r.D2);
  ok('🔴 月ビューの日へ落とす → 完TEL済（返車時間未定）', r.D3.place === 'timeTbd', r.D3);
  ok('🔴 時刻未定の枠へ落とす → 完TEL済（返車時間未定）', r.D4.place === 'timeTbd', r.D4);
  ok('どれも完TEL待ちに残らない', ['D1','D2','D3','D4'].every(k => r[k].place !== 'callWait'), r);
}

console.log('\n── ⑦ 画面から入れた時（完TEL待ちのカードにマウスを乗せて入力） ──');
{
  const T = await p.evaluate(() => {
    const T = window.ymd(new Date());
    state.cards = [{ id:'H1', resNo:'H1', customer:'ホバー 太郎', car:'アクア', maker:'トヨタ',
      status:'workDone', boardId:'default', division:'div1', workTypes:[], dropType:'drop',
      reserveDate:T, returnStage:'callWait', returnDate:T, returnTime:'', amountFinal:50000 }];
    state.returnRange = 'tbd';
    window.showView('return');
    return T;
  });
  await p.waitForTimeout(500);
  ok('完TEL待ちの列に出ている',
     await p.evaluate(() => !!document.querySelector('#return-tbd [data-card-id="H1"]')));
  await p.hover('#return-tbd [data-card-id="H1"]');
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const t = document.querySelector('.ph-rt .cf-time-main') || document.querySelector('.ph-rt-time');
    if (!t) return { no: true };
    t.value = '11:00'; t.dispatchEvent(new Event('change', { bubbles: true }));
    const c = state.cards[0];
    return { place: pitReturnPlace(c), time: c.returnTime, listDate: pitReturnListDate(c) };
  });
  ok('返車時間の入力欄が出ている', !r.no, r);
  ok('🔴 時間を入れただけで返車カレンダーへ移る', r.place === 'calendar', r);
  await p.evaluate(() => { state.returnRange = 'day'; state.returnDate = new Date(); window.showView('return'); });
  await p.waitForTimeout(400);
  ok('🔴 返車のメインカレンダーに出ている',
     await p.evaluate(() => !!document.querySelector('#return-day-list [data-card-id="H1"]')));
  ok('完TEL待ちの列からは消えている', await p.evaluate(() => {
    state.returnRange = 'tbd'; window.showView('return');
    const cols = document.querySelectorAll('#return-tbd .ret-tbd-col');
    return !(cols[0] && cols[0].querySelector('[data-card-id="H1"]'));
  }));
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  for (const v of ['course1', 'today', 'reserve', 'return', 'sales']) {
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(150);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.71.0 以降', vn[0] > 1 || (vn[0] === 1 && vn[1] >= 71), ver);
}

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
