/* PitFlow v1.73.0 ── 表紙の「金額の並び」「返車日の並び」を あとから直す
   -------------------------------------------------------------------
   ◎ゆうた依頼
     「予定返車日と概算金額の編集欄を作成。現状フローが進むと、入力した金額&時間系が
       編集できない。表紙の金額&時間フロー部分の右端に編集ボタンを新設、そこからいじれるように」
   ◎決めごと（ゆうた確定・モックで選択）
     ・編集ボタンは **金額と返車日にひとつずつ**（案1＝押すとすぐ下に入力欄が開く）
     ・直せるのは **通った段階だけ**（作業前に確定金額・確定返車日を入れられない＝v1.66.0を守る）
     ・**概算 金額と概算 預かり日数も直せる**（概算 返車日は日数から自動で動く）
   ◎ここで見張ること
     🔴 同じ欄が画面に2つ出ない（写しを作らない）
     🔴 予定（B）を直しても確定（C）に手が伸びない＝返車カレンダーに勝手に出ない
     🔴 直したらフローに残る（売上の月が動くため）
   ◎使い方
     python3 -m http.server 8999      ← 別ウィンドウ
     node test_cover_edit.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8999;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.openDetail && window.cvChainEdit && window.pitReturnA', null, { timeout: 25000 });
await p.waitForTimeout(700);

const BASE = {
  id: 'CE', resNo: 'R-CE', customer: '編集 太郎', car: 'プリウス', boardId: 'default', division: 'div1',
  workType: 'shaken', workTypes: ['shaken'], status: 'work', dropType: 'drop', reserveDate: '2026-08-05',
  estHoldDays: 5, estAmount: 94500, amountQuote: 102000, amountOrder: 98000, amountFinal: null,
  returnDatePlan: '2026-08-12', returnDate: '', returnDateFinal: null, log: []
};
const seed = (over) => p.evaluate(o => {
  state.cards = [Object.assign({}, o.base, o.over || {})];
  openDetail('CE');
  return true;
}, { base: BASE, over: over || null });

/* 開け閉めは「押すたびに切り替わる」ので、テストからは**望む状態にする**形で呼ぶ
   （同じカードを開き直しても状態が残るため、素朴に押すと裏返る） */
const setBox = (which, want) => p.evaluate(o => {
  const id = o.which === 'money' ? 'cv-ebox-money' : 'cv-ebox-date';
  const isOpen = !!document.getElementById(id);
  if (isOpen !== o.want) cvChainEdit(o.which);
  return true;
}, { which, want });
const openBox = (which) => setBox(which, true);
const closeBox = (which) => setBox(which, false);
const cardOf = () => p.evaluate(() => state.cards[0]);
const flowTexts = () => p.evaluate(() => (state.cards[0].log || []).map(x => x.label || x.text || ''));

console.log('\n── 🔘 まず、編集ボタンが並びの右端に1つずつ出る ──');
{
  await seed(); await p.waitForTimeout(250);
  ok('編集ボタンが2つ（金額と返車日）', await p.locator('.cv-chedit').count() === 2, await p.locator('.cv-chedit').count());
  ok('金額の並びの中にある', await p.evaluate(() => {
    const l = document.querySelectorAll('.cv-chainline')[0];
    return !!(l && l.querySelector('.cv-amchain') && l.querySelector('#cv-chedit-money'));
  }));
  ok('返車日の並びの中にある', await p.evaluate(() => {
    const l = document.querySelectorAll('.cv-chainline')[1];
    return !!(l && l.querySelector('.cv-dchain') && l.querySelector('#cv-chedit-date'));
  }));
  ok('押すまでは何も開いていない', await p.locator('#cv-ebox-money, #cv-ebox-date').count() === 0);
}

console.log('\n── 📶 直せるのは「通った段階」だけ（ゆうた指定） ──');
{
  const want = { check: ['est','quote'], estim: ['est','quote'], contact: ['est','quote','order'],
                 parts: ['est','quote','order','final'], work: ['est','quote','order','final'],
                 workDone: ['est','quote','order','final'] };
  for (const st of Object.keys(want)){
    await seed({ status: st }); await p.waitForTimeout(120);
    await openBox('money'); await p.waitForTimeout(150);
    const got = await p.evaluate(() => Array.from(document.querySelectorAll('#cv-ebox-money input[id^=cv-amt-]')).map(e => e.id.replace('cv-amt-','')));
    ok('「' + st + '」で開く金額の欄＝' + want[st].join('・'), JSON.stringify(got) === JSON.stringify(want[st]), got);
  }
  /* 先の段階が混ざっていない＝これが「作業前に確定金額を入れられる」を防いでいる */
  await seed({ status: 'check' }); await p.waitForTimeout(120);
  await openBox('money'); await p.waitForTimeout(150);
  ok('🔴 点検待ちでは確定金額の欄を出さない', await p.locator('#cv-amt-final').count() === 0);
}

console.log('\n── 👯 同じ欄が画面に2つ出ない（写しを作らない） ──');
{
  await seed(); await p.waitForTimeout(150);
  await closeBox('money'); await p.waitForTimeout(150);
  ok('開く前は「／直接入力」の行がある（今までどおり）', (await p.locator('.cv-frt', { hasText: '／直接入力' }).count()) === 1);
  await openBox('money'); await p.waitForTimeout(200);
  ok('🔴 開いている間は「／直接入力」を出さない', (await p.locator('.cv-frt', { hasText: '／直接入力' }).count()) === 0);
  ok('金額の入力欄は1種類につき1つだけ', await p.evaluate(() => {
    const ids = Array.from(document.querySelectorAll('input[id^=cv-amt-]')).map(e => e.id);
    return ids.length === new Set(ids).size;
  }));
  await closeBox('money'); await p.waitForTimeout(200);
  ok('閉じると「／直接入力」が戻る', (await p.locator('.cv-frt', { hasText: '／直接入力' }).count()) === 1);
}

console.log('\n── 💰 金額を直す（過ぎた段階の見積もりを直せる＝これが本題） ──');
{
  await seed(); await p.waitForTimeout(150);
  await openBox('money'); await p.waitForTimeout(200);
  await p.fill('#cv-amt-quote', '111111'); await p.waitForTimeout(150);
  ok('打つと「変更しますか？」が出る', await p.evaluate(() => document.getElementById('cv-amtconfirm-quote').classList.contains('show')));
  ok('税込のヒントが出る', /122,222/.test(await p.locator('#cv-tax-quote').textContent()), await p.locator('#cv-tax-quote').textContent());
  await p.click('#cv-amtconfirm-quote .cv-ok'); await p.waitForTimeout(250);
  const c = await cardOf();
  ok('カードに保存される', c.amountQuote === 111111, c.amountQuote);
  ok('上の並びにその場で反映される', (await p.locator('#cv-chv-quote').textContent()) === '¥111,111');
  ok('🔴 フローに記録が残る', (await flowTexts()).some(t => /見積もり金額を ¥102,000 → ¥111,111/.test(t)), await flowTexts());
  ok('ほかの金額は動いていない', c.estAmount === 94500 && c.amountOrder === 98000 && c.amountFinal == null, c);

  /* 概算も直せる（ゆうた指定） */
  await p.fill('#cv-amt-est', '80000'); await p.waitForTimeout(120);
  await p.click('#cv-amtconfirm-est .cv-ok'); await p.waitForTimeout(250);
  ok('概算 金額も直せる', (await cardOf()).estAmount === 80000, (await cardOf()).estAmount);

  /* 取消は書かない */
  await p.fill('#cv-amt-order', '1'); await p.waitForTimeout(120);
  await p.click('#cv-amtconfirm-order .cv-ng'); await p.waitForTimeout(200);
  ok('取消を押したら保存しない', (await cardOf()).amountOrder === 98000, (await cardOf()).amountOrder);
}

console.log('\n── 📅 概算 預かり日数を直すと、概算 返車日（A）が一緒に動く ──');
{
  await seed(); await p.waitForTimeout(150);
  await openBox('date'); await p.waitForTimeout(200);
  ok('開くのは「概算 預かり日数」と「予定 返車日」の2つ', await p.locator('#cv-ebox-date .cv-fixrow').count() === 2);
  const a0 = await p.evaluate(() => pitReturnA(state.cards[0]));
  ok('直す前の概算 返車日＝入庫日＋5日', a0 === '2026-08-10', a0);
  await p.fill('#cv-esthold', '9');
  await p.evaluate(() => document.getElementById('cv-esthold').dispatchEvent(new Event('change', { bubbles: true })));
  await p.waitForTimeout(300);
  const c = await cardOf();
  ok('日数が保存される', c.estHoldDays === 9, c.estHoldDays);
  const a1 = await p.evaluate(() => pitReturnA(state.cards[0]));
  ok('🔴 概算 返車日が一緒に動く（＝写しを持っていない）', a1 === '2026-08-14', a1);
  ok('並びの「概算」もその日付になる', /8\/14/.test(await p.locator('.cv-dchain .cv-aseg').first().innerText()), await p.locator('.cv-dchain .cv-aseg').first().innerText());
  ok('フローに残る', (await flowTexts()).some(t => /概算 預かり日数を 5日 → 9日/.test(t)), await flowTexts());
  ok('返車日そのものには手を出していない', !c.returnDate && !c.returnDateFinal, c);
}

console.log('\n── 🤝 予定 返車日（B）を直しても、確定（C）には手が伸びない ──');
{
  await seed(); await p.waitForTimeout(150);
  await openBox('date'); await p.waitForTimeout(200);
  await p.evaluate(() => { const e = document.getElementById('cv-retplan'); e.value = '2026-08-20'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(300);
  const c = await cardOf();
  ok('予定（B）が保存される', c.returnDatePlan === '2026-08-20', c.returnDatePlan);
  ok('🔴 確定（C）は空のまま', !c.returnDate && !c.returnDateFinal, c);
  ok('🔴 完TEL済にもしない（returnStage が付かない）', !c.returnStage, c.returnStage);
  const listed = await p.evaluate(() => pitReturnListDate(state.cards[0]));
  ok('🔴 返車の一覧にはまだ出ない（約束であって確定ではない）', listed === '', listed);
  ok('売上を数える日は予定（B）になる', await p.evaluate(() => pitSalesCountDate(state.cards[0])) === '2026-08-20');
  ok('フローに残る', (await flowTexts()).some(t => /予定 返車日（お客様への約束）を 2026-08-12 → 2026-08-20/.test(t)), await flowTexts());
}

console.log('\n── 🔒 確定 返車日・返車時間は「作業完了」に入ってから（v1.66.0 を壊していない） ──');
{
  for (const st of ['check', 'estim', 'contact', 'parts', 'work']){
    await seed({ status: st }); await p.waitForTimeout(120);
    await openBox('date'); await p.waitForTimeout(150);
    const has = await p.evaluate(() => !!document.getElementById('cv-retdate'));
    ok('「' + st + '」では確定 返車日の欄を出さない', has === false, has);
    ok('「' + st + '」では「作業完了に入ってから」と断っている', /作業完了/.test(await p.locator('#cv-ebox-date .cv-ebnote').last().textContent()));
  }
  await seed({ status: 'workDone' }); await p.waitForTimeout(120);
  await openBox('date'); await p.waitForTimeout(150);
  ok('「workDone」では確定 返車日の欄が出る', await p.evaluate(() => !!document.getElementById('cv-retdate')));
  ok('🔴 確定の欄は編集ブロックの中に写していない（下の専用欄が1つだけ持つ）',
     await p.evaluate(() => !document.querySelector('#cv-ebox-date #cv-retdate') && !!document.getElementById('cv-retdate')));
}

console.log('\n── 🏁 実績（返車済み）カード ──');
{
  await seed({ status: 'returned', amountFinal: 120000, returnDate: '2026-08-12', returnDateFinal: '2026-08-12', completedAt: '2026-08-12', returnStage: 'returned' });
  await p.waitForTimeout(200);
  await openBox('money'); await p.waitForTimeout(200);
  const got = await p.evaluate(() => Array.from(document.querySelectorAll('#cv-ebox-money input[id^=cv-amt-]')).map(e => e.id.replace('cv-amt-','')));
  ok('🔴 確定金額は編集ブロックに出さない（下のロック行が持っているため）', JSON.stringify(got) === JSON.stringify(['est','quote','order']), got);
  ok('下の「確定売上金額」のロック行は今までどおり残っている', await p.locator('#cv-finlock').count() === 1);
  ok('確定金額の入力欄は画面に1つだけ', await p.evaluate(() => document.querySelectorAll('#cv-amt-final').length <= 1));
  await p.fill('#cv-amt-quote', '99999'); await p.waitForTimeout(120);
  await p.click('#cv-amtconfirm-quote .cv-ok'); await p.waitForTimeout(250);
  ok('実績カードでも見積もり金額は直せる', (await cardOf()).amountQuote === 99999);
  ok('確定金額・実績カウント日は動いていない', (await cardOf()).amountFinal === 120000 && (await cardOf()).completedAt === '2026-08-12', await cardOf());
}

console.log('\n── 🚪 別のカードを開いたら閉じている（開閉は保存しない） ──');
{
  await seed(); await p.waitForTimeout(150);
  await openBox('money'); await openBox('date'); await p.waitForTimeout(200);
  ok('2つとも開いた', await p.locator('#cv-ebox-money').count() === 1 && await p.locator('#cv-ebox-date').count() === 1);
  await p.evaluate(() => {
    state.cards.push(Object.assign({}, state.cards[0], { id: 'CE2', resNo: 'R-CE2', customer: '別 花子', log: [] }));
    openDetail('CE2');
  });
  await p.waitForTimeout(250);
  ok('別のカードは閉じた状態で開く', await p.locator('#cv-ebox-money, #cv-ebox-date').count() === 0);
  await p.evaluate(() => openDetail('CE'));
  await p.waitForTimeout(250);
  ok('戻ってきても閉じている（開閉は保存していない）', await p.locator('#cv-ebox-money, #cv-ebox-date').count() === 0);
}

console.log('\n── 💾 保存する項目を増やしていない ──');
{
  await seed(); await p.waitForTimeout(150);
  const before = await p.evaluate(() => Object.keys(state.cards[0]).sort().join(','));
  await openBox('money'); await p.waitForTimeout(150);
  await p.fill('#cv-amt-est', '70000'); await p.waitForTimeout(100);
  await p.click('#cv-amtconfirm-est .cv-ok'); await p.waitForTimeout(200);
  await closeBox('money'); await openBox('date'); await p.waitForTimeout(200);
  await p.fill('#cv-esthold', '3');
  await p.evaluate(() => document.getElementById('cv-esthold').dispatchEvent(new Event('change', { bubbles: true })));
  await p.waitForTimeout(250);
  await openBox('date'); await p.waitForTimeout(150);
  await p.evaluate(() => { const e = document.getElementById('cv-retplan'); e.value = '2026-08-25'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(250);
  const after = await p.evaluate(() => Object.keys(state.cards[0]).sort().join(','));
  ok('🔴 カードの項目が1つも増えていない', before === after, { before, after });
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  await p.evaluate(() => { state.cards = []; });
  for (const v of ['course1', 'today', 'return', 'sales', 'mydash', 'reserve']){
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(120);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.73.0 以降', vn[0] > 1 || (vn[0] === 1 && vn[1] >= 73), ver);
  ok('お知らせに v1.73.0 の1件が入っている', await p.evaluate(() => (window.PIT_NEWS || []).some(n => n.version === '1.73.0')));
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
