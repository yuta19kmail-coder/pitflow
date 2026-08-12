/* PitFlow v1.80.0 ── 代車の「空いているか」の物差し1本（loaner-free.js）のテスト
   -------------------------------------------------------------------
   ◎ここで守りたいこと（2026-08-12 の棚卸しで見つかった穴）
     🔴 ① **引退した代車を「空き」に数えない**
     🔴 ② **代車自身の車検・点検（車両管理の予定）でも塞がる**
     🔴 ③ **緊急車両を最短入庫日に混ぜない**
     🔴 ④ **ぶつかりの決まりは1つ**（当日かぶり＝返却日＝次の開始日 は OK）
     ①②③ はどれも「代車ありで入庫できる日が**実際より早く出る**」＝
     **お客様に約束したのに代車が無い**、につながる筋。いちばん重い。
     🔴 ⑤ 二重貸しが**画面で分かる**（前は主役の1枚しか描かず気づけなかった）
     🔴 ⑥ 未確定の下書きを**失わない・勝手に確定させない**

   ◎考え方
     本体をサンプルモードで丸ごと開き、**本物の関数**を呼んで確かめる。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8977      ← 別ウィンドウ
     node test_loaner_free.mjs                                             */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.goto('http://127.0.0.1:8977/index.html?demo=1&nonews=1');
await p.waitForTimeout(1000);
await p.evaluate(() => { const g = document.getElementById('pl-google'); if (g) g.click(); });
await p.waitForFunction(() => document.body.classList.contains('pit-authed'), null, { timeout: 20000 });
await p.waitForTimeout(1400);

/* 試験用のまっさらな土台を作る（代車3台・貸出なし・予定なし） */
const reset = () => p.evaluate(() => {
  window.__bak = window.__bak || {
    loaners: JSON.parse(JSON.stringify(state.loaners)),
    assigns: JSON.parse(JSON.stringify(state.loanerAssigns || [])),
    events : JSON.parse(JSON.stringify(state.fleetEvents || []))
  };
  state.loaners = [
    { id:'T1', name:'代車1', model:'テストA', number:1, category:'kei' },
    { id:'T2', name:'代車2', model:'テストB', number:2, category:'kei' },
    { id:'T3', name:'代車3', model:'テストC', number:3, category:'kei' }
  ];
  state.loanerAssigns = [];
  state.fleetEvents = [];
});

console.log('\n── ① 🔴 引退した代車を「空き」に数えない ──');
{
  await reset();
  ok('ふつうは空いている', await p.evaluate(() => pitLoanerFreeRun('2030-01-10', 3)) === true);
  ok('🔴 全部引退させたら空きなし',
     await p.evaluate(() => { state.loaners.forEach(l => l.retired = true); return pitLoanerFreeRun('2030-01-10', 3); }) === false);
  ok('🔴 1台だけ残せば、その1台で空く',
     await p.evaluate(() => { state.loaners[1].retired = false; return pitLoanerFreeRun('2030-01-10', 3); }) === true);
  ok('引退した代車は「貸せる一覧」に出てこない',
     await p.evaluate(() => pitLoanerUsableList().map(l => l.id).join(',')) === 'T2');
  ok('pitLoanerUsable も同じ答え',
     await p.evaluate(() => [pitLoanerUsable(state.loaners[0]), pitLoanerUsable(state.loaners[1])].join(',')) === 'false,true');
}

console.log('\n── ② 🔴 代車自身の車検・点検でも塞がる ──');
{
  await reset();
  await p.evaluate(() => {
    state.fleetEvents = state.loaners.map(l => ({ id:'e'+l.id, vehicleId:l.id, type:'shakenIn',
      label:'車検入庫', fromDate:'2030-01-05', toDate:'2030-01-15' }));
  });
  ok('🔴 全部が車検入庫中なら空きなし', await p.evaluate(() => pitLoanerFreeRun('2030-01-10', 1)) === false);
  ok('車検の外の日なら空いている',      await p.evaluate(() => pitLoanerFreeRun('2030-01-20', 3)) === true);
  ok('🔴 車検の期間にまたがると空かない', await p.evaluate(() => pitLoanerFreeRun('2030-01-14', 3)) === false);
  ok('ふさがっている理由が「代車自身の予定」と分かる',
     await p.evaluate(() => { const w = pitLoanerBusyWhy(state.loaners[0], '2030-01-10'); return w && w.kind; }) === 'event');
  ok('1台だけ予定を外せば、その1台で空く',
     await p.evaluate(() => { state.fleetEvents = state.fleetEvents.filter(e => e.vehicleId !== 'T3'); return pitLoanerFreeRun('2030-01-10', 3); }) === true);
}

console.log('\n── ③ 🔴 緊急車両は最短入庫日に混ぜない ──');
{
  await reset();
  ok('🔴 緊急車両しか無ければ「代車あり」にならない',
     await p.evaluate(() => { state.loaners.forEach(l => l.emergency = true); return pitLoanerFreeRun('2030-01-10', 3); }) === false);
  ok('わざと数えたい時だけ数えられる（withEmergency）',
     await p.evaluate(() => pitLoanerFreeRun('2030-01-10', 3, { withEmergency: true })) === true);
  ok('緊急車両は「貸せる一覧」に出てこない',
     await p.evaluate(() => pitLoanerUsableList().length) === 0);
}

console.log('\n── ④ 🔴 ぶつかりの決まりは1つ（当日かぶりはOK） ──');
{
  ok('🔴 返却日＝次の貸出開始日は「ぶつかり」にしない',
     await p.evaluate(() => pitLoanerOverlap('2026-08-10','2026-08-14','2026-08-14','2026-08-20')) === false);
  ok('本当に重なっていれば「ぶつかり」',
     await p.evaluate(() => pitLoanerOverlap('2026-08-10','2026-08-14','2026-08-13','2026-08-20')) === true);
  ok('丸ごと中に入っていても「ぶつかり」',
     await p.evaluate(() => pitLoanerOverlap('2026-08-10','2026-08-20','2026-08-12','2026-08-13')) === true);
  ok('離れていれば「ぶつかり」ではない',
     await p.evaluate(() => pitLoanerOverlap('2026-08-10','2026-08-14','2026-08-16','2026-08-20')) === false);
  /* 🔴 入口が違っても答えが同じか＝以前はここが食い違っていた */
  await reset();
  await p.evaluate(() => { state.loanerAssigns = [
    { id:'a1', loanerId:'T1', cardId:null, fromDate:'2026-08-10', toDate:'2026-08-14', manual:true } ]; });
  ok('🔴 貸出フォームから見ても、当日かぶりは怒られない',
     await p.evaluate(() => pitLoanerConflicts('T1', '2026-08-14', '2026-08-20').length) === 0);
  ok('本当に重なる時はちゃんと出る',
     await p.evaluate(() => pitLoanerConflicts('T1', '2026-08-13', '2026-08-20').length) === 1);
  ok('自分自身は数えない',
     await p.evaluate(() => pitLoanerConflicts('T1', '2026-08-10', '2026-08-14', { ignoreAssignId:'a1' }).length) === 0);
}

console.log('\n── ②-2 貸出でも塞がる（当たり前だが物差しが同じか） ──');
{
  await reset();
  await p.evaluate(() => { state.loanerAssigns = state.loaners.map(l => (
    { id:'a'+l.id, loanerId:l.id, cardId:null, fromDate:'2030-01-05', toDate:'2030-01-15', manual:true })); });
  ok('全部貸出中なら空きなし', await p.evaluate(() => pitLoanerFreeRun('2030-01-10', 1)) === false);
  ok('🔴 返却日の当日も「埋まり」',   await p.evaluate(() => pitLoanerBusyOn(state.loaners[0], '2030-01-15')) === true);
  ok('返却日の翌日は「空き」',        await p.evaluate(() => pitLoanerBusyOn(state.loaners[0], '2030-01-16')) === false);
  ok('ふさがっている理由が「貸出」と分かる',
     await p.evaluate(() => { const w = pitLoanerBusyWhy(state.loaners[0], '2030-01-10'); return w && w.kind; }) === 'assign');
  ok('その日空いている代車の一覧が取れる',
     await p.evaluate(() => pitLoanerFreeOn('2030-01-16').length) === 3);
}

console.log('\n── ⑤ 🔴 二重貸しが画面で分かる ──');
{
  await p.evaluate(() => {
    state.loaners = JSON.parse(JSON.stringify(window.__bak.loaners));
    state.loanerAssigns = JSON.parse(JSON.stringify(window.__bak.assigns));
    state.fleetEvents = JSON.parse(JSON.stringify(window.__bak.events));
  });
  await p.evaluate(() => { if (window.showView) showView('loaner'); });
  await p.waitForTimeout(1200);
  const before = await p.evaluate(() => document.querySelectorAll('.lo-dupmark').length);
  const info = await p.evaluate(() => {
    const a = state.loanerAssigns.find(x => x.loanerId && x.fromDate && x.toDate);
    state.loanerAssigns.push({ id:'dupTest', loanerId:a.loanerId, cardId:null, customer:'重なり試験',
      purpose:'試験', fromDate:a.fromDate, toDate:a.toDate, manual:true });
    renderLoaner();
    const days = Math.round((new Date(a.toDate) - new Date(a.fromDate)) / 86400000) + 1;
    return { days: days };
  });
  await p.waitForTimeout(700);
  const after = await p.evaluate(() => document.querySelectorAll('.lo-dupmark').length);
  ok('🔴 二重貸しの日に印が出る', after > before, { before, after, days: info.days });
  ok('印は赤で目立つ（枠も付く）',
     await p.evaluate(() => document.querySelectorAll('.lo-cell.lo-dup').length) > 0);
  ok('印に件数が出る',
     await p.evaluate(() => { const m = document.querySelector('.lo-dupmark'); return m && +m.textContent >= 2; }));
  /* 押すと「何と重なっているか」を教える */
  await p.evaluate(() => { const m = document.querySelector('.lo-dupmark'); if (m) m.click(); });
  await p.waitForTimeout(600);
  const dlg = await p.evaluate(() => { const e = document.getElementById('uid-ov'); return (e && e.classList.contains('open')) ? e.innerText : ''; });
  ok('押すと重なっている相手を教える', /重なっています/.test(dlg), dlg.slice(0, 50));
  ok('🔴 勝手に直さない（どちらを動かすかは人が決める）', /ずらす|替えて/.test(dlg), dlg.slice(0, 120));
  await p.evaluate(() => { const o = document.getElementById('uid-ok'); if (o) o.click(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { state.loanerAssigns = state.loanerAssigns.filter(x => x.id !== 'dupTest'); renderLoaner(); });
  await p.waitForTimeout(500);
}

console.log('\n── ⑥ 🔴 下書きを失わない・勝手に確定させない ──');
{
  /* 下書きを作る（札を1件ずらす） */
  const made = await p.evaluate(() => {
    /* ⚠ このサンプルの貸出は cardId が無いもの（手動貸出）もある。下書きはどちらでも同じに効く。 */
    const a = (state.loanerAssigns || [])[0];
    if (!a) return null;
    loMoveAssignTo(a.id, a.loanerId, '2027-03-01');   /* 未来へ動かす＝下書きに入る */
    return a.id;
  });
  await p.waitForTimeout(600);
  ok('下書きの控えが端末に残る',
     await p.evaluate(() => !!localStorage.getItem('pitflow_loaner_draft_v1')), made);
  ok('下書きバーが出る', await p.evaluate(() => {
    const b = document.getElementById('lo-draft-bar'); return !!b && b.innerHTML.length > 0; }));

  /* 別の画面へ移ろうとすると、聞かれる */
  await p.evaluate(() => showView('dashboard'));
  await p.waitForTimeout(700);
  const leave = await p.evaluate(() => {
    const e = document.getElementById('uid-ov');
    return { open: !!(e && e.classList.contains('open')), text: e ? e.innerText : '', view: state.currentView };
  });
  ok('🔴 未確定のまま黙って離れさせない', leave.open === true, leave);
  ok('何件残っているか伝える', /下書きが\s*\d+\s*件/.test(leave.text.replace(/\n/g, ' ')), leave.text.slice(0, 60));
  ok('🔴 まだ代車カレンダーに居る', leave.view === 'loaner', leave.view);
  ok('「反映する／破棄する」から選べる', /反映する/.test(leave.text) && /破棄する/.test(leave.text), leave.text);

  /* 「破棄する」を選ぶ＝元に戻って移動できる */
  await p.evaluate(() => { const n = document.getElementById('uid-no'); if (n) n.click(); });
  await p.waitForTimeout(900);
  ok('🔴 破棄すると元に戻る',
     await p.evaluate(() => !state.loanerAssigns.some(a => a.fromDate === '2027-03-01')));
  ok('🔴 控えも片付く',
     await p.evaluate(() => !localStorage.getItem('pitflow_loaner_draft_v1')));
  ok('選んだあとはちゃんと移動できる',
     await p.evaluate(() => state.currentView) === 'dashboard', await p.evaluate(() => state.currentView));
}

/* ================================================================
   ⑦ 🔴 車を返したら、代車も返ってきたことにする（v1.81.0・ゆうた指定）
   -------------------------------------------------------------------
   🗣「ほとんどの場合、預かる時に貸し出して、返車するときに戻ってくる。
      代車カレンダー上の返却確定は、**まれなイレギュラー**のために使う」
   ⚠ 以前は「返却確定」を押した時だけ灰色になったので、
      **車を引き渡して代車も戻っているのに、代車カレンダーはずっと貸出中に見えていた。**
   ================================================================ */
console.log('\n── ⑦ 🔴 車を返したら、代車も返ってきたことにする ──');
{
  const ymdN = n => { const d = new Date(); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  const make = () => p.evaluate(days => {
    state.cards = state.cards.filter(c => c.id !== 'RETTEST');
    const used = {}; state.loanerAssigns.forEach(a => used[a.loanerId] = 1);
    const lo = state.loaners.find(l => !l.retired && !l.emergency && !used[l.id])
            || state.loaners.find(l => !l.retired && !l.emergency);
    state.loanerAssigns = state.loanerAssigns.filter(a => a.loanerId !== lo.id);   /* この代車だけを見る */
    state.fleetEvents = state.fleetEvents.filter(e => e.vehicleId !== lo.id);
    state.cards.push({ id:'RETTEST', status:'check', boardId:'default', customer:'返車テスト', kana:'ヘンシャ',
      car:'テストA', tel:'000-0000-0000', reserveDate:days.from, returnDate:days.today, dropType:'drop', workType:'oil',
      needLoaner:true, loanerId:lo.id, loanerFrom:days.from, loanerTo:days.to, log:[] });
    pitSyncLoanerAssigns();
    const a = state.loanerAssigns.find(x => x.cardId === 'RETTEST');
    return { lo: lo.id, returned: !!a.returned, to: a.toDate };
  }, { from: ymdN(-3), today: ymdN(0), to: ymdN(4) });

  let st = await make();
  ok('貸出中はまだ返却済みではない', st.returned === false, st);
  ok('予定どおりの期間で入る', st.to === ymdN(4), st);

  /* 当日ビューの「返車済みにする」と同じ道 */
  await p.evaluate(() => pitTodayReturn('RETTEST'));
  await p.evaluate(() => { showView('loaner'); });
  await p.waitForTimeout(900);
  const after = await p.evaluate(() => {
    const a = state.loanerAssigns.find(x => x.cardId === 'RETTEST');
    const cells = [...document.querySelectorAll('.lo-cell[data-lo="' + a.loanerId + '"]')];
    return { returned: !!a.returned, at: a.returnedAt, to: a.toDate, auto: !!a.autoReturned, was: a.toDateBefore,
             grey: cells.filter(c => c.classList.contains('lo-returned')).map(c => c.dataset.ld),
             busy: cells.filter(c => c.classList.contains('lo-bk')).map(c => c.dataset.ld) };
  });
  ok('🔴 返却済みになる（押さなくても）', after.returned === true, after);
  ok('🔴 返却日＝車を引き渡した日',       after.at === ymdN(0), after);
  ok('🔴 札が灰色になる',                 after.grey.length > 0, after.grey);
  ok('🔴 灰色は貸出の期間ぶん',           after.grey.join(',') === [ymdN(-3),ymdN(-2),ymdN(-1),ymdN(0)].join(','), after.grey);
  ok('🔴 早く返ったぶん枠が空く',         after.busy.join(',') === after.grey.join(','), after.busy);
  ok('元の予定を覚えている（取消で戻すため）', after.was === ymdN(4), after);
  ok('自動で付けた印がある（手で押したものと見分ける）', after.auto === true, after);
  ok('その代車が、返した翌日から空く',
     await p.evaluate(d => { const a = state.loanerAssigns.find(x => x.cardId === 'RETTEST');
       const lo = state.loaners.find(l => l.id === a.loanerId); return !pitLoanerBusyOn(lo, d); }, ymdN(2)) === true);

  /* 🔴 イレギュラー＝手で押した方が必ず勝つ */
  await p.evaluate(() => { const a = state.loanerAssigns.find(x => x.cardId === 'RETTEST'); loUnreturn(a.id); });
  await p.waitForTimeout(400);
  const undone = await p.evaluate(() => {
    const a = state.loanerAssigns.find(x => x.cardId === 'RETTEST');
    return { returned: !!a.returned, to: a.toDate, auto: !!a.autoReturned };
  });
  ok('🔴 返却取消で戻せる',           undone.returned === false, undone);
  ok('🔴 縮めた期間も元に戻る',       undone.to === ymdN(4), undone);
  await p.evaluate(() => pitSyncLoanerAssigns());
  ok('🔴 取り消したら、勝手に返却済みへ戻さない',
     await p.evaluate(() => { const a = state.loanerAssigns.find(x => x.cardId === 'RETTEST'); return !a.returned; }) === true);

  /* 手で先に返却確定していたら、そちらが正 */
  st = await make();
  await p.evaluate(d => { const a = state.loanerAssigns.find(x => x.cardId === 'RETTEST');
    a.returned = true; a.returnedAt = d; a.toDate = d; }, ymdN(-1));
  await p.evaluate(() => pitTodayReturn('RETTEST'));
  await p.evaluate(() => pitSyncLoanerAssigns());
  ok('🔴 先に手で確定した返却日は上書きしない',
     await p.evaluate(() => { const a = state.loanerAssigns.find(x => x.cardId === 'RETTEST'); return a.returnedAt; }) === ymdN(-1));
  ok('🔴 自動の印も付けない（人が押したものが正）',
     await p.evaluate(() => { const a = state.loanerAssigns.find(x => x.cardId === 'RETTEST'); return !a.autoReturned; }) === true);

  await p.evaluate(() => { state.cards = state.cards.filter(c => c.id !== 'RETTEST');
                           state.loanerAssigns = state.loanerAssigns.filter(a => a.cardId !== 'RETTEST'); });
}

/* ================================================================
   ⑧ 🔴 実績（返車済み）のカードが、代車の返却とリンクしているか（v1.82.0）
   -------------------------------------------------------------------
   🗣 ゆうた「そもそも予約というか実績情報が持ってる代車情報とリンクしてる？
      実績になってても代車の返却とリンクしてないよな？」
   ⚠ そのとおりだった。**代車カレンダーは灰色（返却済）なのに、
      カード・ホバー・予約カードの代車バッジは「超過◯日」と赤く出ていた。**
      ＝「返ってきたか」を持っているのは貸出なのに、画面は**カードの日付だけ**を引き算していた。
   🔴 ただし **車は返したのに代車が戻っていない**時は、ちゃんと赤く「超過」と出すこと（知らせるべき事故）。
   ================================================================ */
console.log('\n── ⑧ 🔴 実績のカードと代車の返却がつながっているか ──');
{
  const ymdN = n => { const d = new Date(); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  const mk = (opt) => p.evaluate(o => {
    state.cards = state.cards.filter(c => c.id !== 'LINKTEST');
    state.loanerAssigns = state.loanerAssigns.filter(a => a.cardId !== 'LINKTEST');
    const lo = state.loaners.find(l => !l.retired && !l.emergency);
    state.cards.push({ id:'LINKTEST', status:'returned', boardId:'default', customer:'実績テスト', kana:'ジッセキ',
      car:'テストA', tel:'000-0000-0000', reserveDate:o.from, returnDate:o.ret, returnDateFinal:o.ret, completedAt:o.ret,
      dropType:'drop', workType:'oil', amountFinal:30000,
      needLoaner:true, loanerId:lo.id, loanerFrom:o.from, loanerTo:o.to, log:[],
      loanerReturned: o.stillOut ? false : undefined });
    pitSyncLoanerAssigns();
    const c = state.cards.find(x => x.id === 'LINKTEST');
    const a = state.loanerAssigns.find(x => x.cardId === 'LINKTEST');
    const R = pitLoanerRemainOf(c);
    return { assignReturned: !!(a && a.returned), R: R };
  }, opt);

  /* ふつう＝車を返した＝代車も戻っている */
  let r = await mk({ from: ymdN(-10), ret: ymdN(-5), to: ymdN(-5) });
  ok('実績のカードの貸出が返却済みになっている', r.assignReturned === true, r);
  ok('🔴 「返ってきた」と答える',           r.R.back === true, r.R);
  ok('🔴 残り日数のカウントをやめる',       r.R.rem === null, r.R);
  ok('🔴 色は落ち着いた灰色（back）',       r.R.level === 'back', r.R);
  ok('返した日を持っている',                r.R.at === ymdN(-5), r.R);

  /* 画面に出る文字（カード詳細） */
  await p.evaluate(() => { if (window.openDetail) openDetail('LINKTEST'); });
  await p.waitForTimeout(1000);
  const box = await p.evaluate(() => { const e = document.querySelector('.cv-lo');
    return e ? { t: e.innerText.replace(/\s+/g,' ').trim(), cls: e.className } : null; });
  ok('🔴 カードに「返却済」と出る',      !!box && /返却済/.test(box.t), box);
  ok('🔴 「超過」とは出ない',            !!box && !/超過/.test(box.t), box);
  ok('🔴 赤（dead）ではない',            !!box && !/cv-lev-dead/.test(box.cls), box);
  ok('返した日も出る',                   !!box && /に返却/.test(box.t), box);
  await p.evaluate(() => { if (window.closeDetail) closeDetail(); });
  await p.waitForTimeout(500);

  /* 🔴 イレギュラー＝車は返したのに代車が戻っていない → これは赤く知らせる */
  r = await mk({ from: ymdN(-10), ret: ymdN(-5), to: ymdN(-2), stillOut: true });
  ok('🔴 代車が戻っていない実績は「返却済」にしない', r.R.back === false, r.R);
  ok('🔴 超過として赤く出す（知らせるべき事故）',     r.R.level === 'dead', r.R);
  ok('超過の日数が出る',                              r.R.rem === -2, r.R);

  /* 作りの見張り＝画面で日付を引き算していないか */
  const cv = fs.readFileSync('js/card-view.js', 'utf8');
  const ch = fs.readFileSync('js/card-hover.js', 'utf8');
  const rv = fs.readFileSync('js/reserve.js', 'utf8');
  ok('🔴 カード詳細は物差しに聞いている',      /pitLoanerRemainOf/.test(cv));
  ok('🔴 ホバー情報カードも物差しに聞いている', /pitLoanerRemainOf/.test(ch));
  ok('🔴 予約カードのバッジも物差しに聞いている', /pitLoanerRemainOf/.test(rv));

  await p.evaluate(() => { state.cards = state.cards.filter(c => c.id !== 'LINKTEST');
                           state.loanerAssigns = state.loanerAssigns.filter(a => a.cardId !== 'LINKTEST'); });
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  for (const v of ['loaner', 'dashboard', 'availcal', 'reserve', 'fleet', 'mydash']) {
    await p.evaluate(x => { if (window.showView) showView(x); }, v);
    await p.waitForTimeout(500);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 3));
  const src = fs.readFileSync('js/loaner-free.js', 'utf8');
  ok('🔴 物差しは1本にまとまっている（公開4つ以上）',
     ['pitLoanerUsable','pitLoanerBusyOn','pitLoanerFreeRun','pitLoanerOverlap']
       .every(k => src.indexOf('w.' + k) >= 0));
  const dash = fs.readFileSync('js/dashboard.js', 'utf8');
  ok('🔴 ダッシュボードは自分で数え直していない',
     /pitLoanerFreeRun/.test(dash) && !/a\.fromDate <= ds && a\.toDate >= ds/.test(dash), 'dashboard.js');
  const md = fs.readFileSync('js/mydash.js', 'utf8');
  ok('🔴 マイダッシュも自分で数え直していない',
     /pitLoanerBusyOn/.test(md) && !/a\.fromDate <= ds && a\.toDate >= ds/.test(md), 'mydash.js');
  const lo = fs.readFileSync('js/loaner.js', 'utf8');
  ok('🔴 代車カレンダーの「ぶつかり」も物差しを借りている', /pitLoanerOverlap/.test(lo) && /pitLoanerConflicts/.test(lo));
  ok('🔴 独自の重なり判定（_loOverlaps）は残っていない', !/function _loOverlaps/.test(lo));
}

await b.close();
console.log(`\n===== ${pass} OK / ${fail} NG =====`);
process.exit(fail ? 1 : 0);
