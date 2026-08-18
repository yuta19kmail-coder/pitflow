/* PitFlow v1.97.0 ── 当日返車の関門と、作業完了の担当者チェック
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-15）
     ①「当日返車の場合、タスクボードを介さないで返車の一覧に表示される。これはOK。
        ただし、その場合、クリックして**返車済みの表示をグレーアウト**してほしい。
        この部分だけ、入庫の方から通常どおり入庫中に回して売上確定金額などを入れて、
        **完TEL済みor完TEL依頼にドラッグした時点で、確定売上のポップアップとは別にもう一個ポップアップ**して
        『通常の完TEL済みにしますか？ 実績化しますか？』を表示。
        ・通常 → 今までどおり。返車予定日で表示。日付が変われば返車カレンダーがズレて当日からも消える。
                 予定そのままなら当日に出ていて、クリック→**返車済みが有効化され**てアーカイブ化。
        ・実績化 → 返車済みとし、当日ビューから自動で消え、実績に反映してアーカイブ化。」
     ②「タスクボードで**作業完了に入れた時点**で、点検実施者・整備実施者がそれぞれ一人も入ってない場合は
        **入力しろよって注意を促すポップアップ**を表示するように。」
       追加指定：「そのポップアップで**担当者を入れられる**ようにしたい。**チェックはメインと同じ**。
                 **動くバーの表示もほしい**」

   ◎ここで見張ること
     🔴 完TEL前の待ち・当日返しは「返車済みにする」が押せない（理由も出る）
     🔴 押せないだけでなく、**中身も動かない**（ボタンを消しただけにしない）
     🔴 預かりの車・完TELを通った車は今までどおり押せる
     🔴 1枚目の「通常／実績化」は**待ち・当日返しでまだ完TEL前の車だけ**に出る
     🔴 実績化＝返車済み・実績日・確定売上が固まる。当日ビューの「返車済みにする」と**同じ形**
     🔴 通常＝今までどおり。そのあと当日ビューの「返車済みにする」が**押せるようになる**
     🔴 作業完了へ入れた時、担当者がどちらも空なら注意が出る。片方でも入っていれば出ない
     🔴 その注意の中のチップは**カード詳細の整備タブとまったく同じ部品**（配分バーも動く）
     🔴 「このまま進める」で止まらない

   ◎使い方
     python3 -m http.server 8996      ← 別ウィンドウ
     node test_done_flow.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8996;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.PitMechPick && window.PitMechGuard && window.PitReturnPopup && window.pitTodayTap',
                        null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(900);

/* 試験用のカードを1枚だけ置く。日付は「今日からのずれ」で指定（いつ走らせても同じ結果に） */
const put = card => p.evaluate(c => {
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const at = n => { const d = new Date(t); d.setDate(d.getDate() + n); return ymd(d); };
  const full = Object.assign({
    id: 'cDF', customer: 'テスト 太郎', kana: 'テスト タロウ', tel: '090-0000-0000',
    boardId: 'default', division: 'div1', workType: 'general', repeat: 'new',
    inspectors: [], mechanics: []
  }, c);
  ['reserveDate', 'returnDate', 'completedAt'].forEach(k => { if (typeof full[k] === 'number') full[k] = at(full[k]); });
  state.cards = [full];
  state.loanerAssigns = [];
  return full.id;
}, card);

const readCard = () => p.evaluate(() => {
  const c = state.cards.find(x => x.id === 'cDF') || {};
  return { status: c.status, returnStage: c.returnStage || '', returnDate: c.returnDate || '',
           completedAt: c.completedAt || '', amountFinal: c.amountFinal,
           insp: (c.inspectors || []).slice(), mech: (c.mechanics || []).slice() };
});

/* 当日ビューのアクションシートを開いて、いちばん上のボタンの状態を読む */
const sheet = () => p.evaluate(() => {
  pitTodayTap('cDF', true);
  const b = document.querySelector('#today-action .ta-btn.primary');
  if (!b) return { none: true };
  return { off: b.classList.contains('is-off'), disabled: !!b.disabled,
           label: (b.querySelector('b') || {}).textContent || '',
           why: (b.querySelector('.ta-why') || {}).textContent || '' };
});
const sheetClose = () => p.evaluate(() => pitTodayActionClose());

console.log('\n── 🔒 ① 完TEL前の当日返車は「返車済みにする」が押せない ──');
{
  await put({ status: 'reserved', dropType: 'wait', reserveDate: 0, returnDate: 0 });
  const s = await sheet();
  ok('🔴 グレーアウトしている', s.off === true && s.disabled === true, s);
  ok('🔴 なぜ押せないかが書いてある', /完TEL/.test(s.why), s.why);
  await sheetClose();

  /* 直接呼んでも動かない＝ボタンを消しただけにしない */
  await p.evaluate(() => pitTodayReturn('cDF'));
  await p.waitForTimeout(200);
  const c = await readCard();
  ok('🔴 直接呼んでも実績にならない', c.status === 'reserved' && !c.completedAt, c);
}
{
  /* 「当」も同じ */
  await put({ status: 'check', dropType: 'sameDay', reserveDate: 0, returnDate: 0 });
  const s = await sheet(); await sheetClose();
  ok('当日返し（当）も押せない', s.off === true, s);
}

console.log('\n── 🔓 完TELを通った車は今までどおり押せる ──');
{
  await put({ status: 'workDone', returnStage: 'returnWait', dropType: 'wait',
              reserveDate: 0, returnDate: 0, returnTime: '16:00' });
  const s = await sheet();
  ok('🔴 完TEL済なら押せる', s.off === false && s.disabled === false, s);
  ok('理由書きは出ない', s.why === '', s.why);
  /* 🔴 v1.137.0 押すと**先に確認の窓**が出る（実績＝アーカイブに入るので）。窓を通してから固まる。 */
  await p.evaluate(() => pitTodayReturn('cDF'));
  await p.waitForTimeout(200);
  const askTxt = await p.evaluate(() => {
    const ov = document.getElementById('uid-ov');
    return (ov && ov.classList.contains('open')) ? (document.getElementById('uid-card') || {}).textContent || '' : '';
  });
  ok('🔴 押したらまず確認の窓が出る', /実績（確定売上）に固めますか/.test(askTxt), askTxt.slice(0, 80));
  ok('🔴 窓に確定売上の金額が出る', /確定売上\s*¥/.test(askTxt), askTxt.slice(0, 120));
  ok('🔴 アーカイブで管理者だけが戻せることを言う', /アーカイブ/.test(askTxt) && /管理者だけ/.test(askTxt), '');
  ok('🔴 窓が出ただけでは、まだ固まっていない',
     await p.evaluate(() => state.cards.find(x => x.id === 'cDF').status) !== 'returned', '');
  await p.evaluate(() => document.getElementById('uid-ok').click());
  await p.waitForTimeout(250);
  const c = await readCard();
  ok('🔴 押したら実績（返車済み）になる', c.status === 'returned' && !!c.completedAt, c);
  ok('確定売上が固まる', c.amountFinal != null && c.amountFinal !== '', c);
}
{
  /* 預かりの車＝もともと完TELを通ってしか一覧に出ない。今までどおり押せる */
  await put({ status: 'workDone', returnStage: 'returnWait', dropType: 'drop',
              reserveDate: -2, returnDate: 0, returnTime: '15:00' });
  const s = await sheet(); await sheetClose();
  ok('預かりの車は今までどおり押せる', s.off === false, s);
}

console.log('\n── 📄 ② 1枚目「通常／実績化」の出し分け ──');
const openDrop = (mode) => p.evaluate(m => {
  /* 盤面の完TEL済／完TEL依頼エリアへ落としたのと同じ道 */
  applyCardDrop('cDF', m === 'done' ? 'callDone' : 'callReq', '');
}, mode);
const kindShown = () => p.evaluate(() => {
  const bd = document.getElementById('rk-backdrop');
  return !!bd && bd.classList.contains('show');
});
const amtShown = () => p.evaluate(() => {
  const bd = document.getElementById('rp-backdrop');
  return !!bd && bd.classList.contains('show');
});
{
  await put({ status: 'work', dropType: 'wait', reserveDate: 0, returnDate: 0 });
  await openDrop('done'); await p.waitForTimeout(250);
  ok('🔴 待ち・当日返し＝1枚目が出る', await kindShown() === true);
  ok('金額の画面はまだ出ていない', await amtShown() === false);
  const txt = await p.evaluate(() => document.getElementById('rk-backdrop').textContent);
  ok('「通常」と「実績化」の2つが出ている', /通常の完TEL済みにする/.test(txt) && /実績化する/.test(txt), txt.slice(0, 120));
  ok('モックで消した文言が入っていない', !/よく使う|もう渡した/.test(txt), txt.slice(0, 200));
  await p.evaluate(() => PitReturnPopup.kind(null));   /* やめる */
  await p.waitForTimeout(200);
  const c = await readCard();
  ok('🔴 やめたら何も書き込まれない', c.status === 'work' && !c.returnStage, c);
}
{
  await put({ status: 'work', dropType: 'drop', reserveDate: -3, returnDate: 3 });
  await openDrop('done'); await p.waitForTimeout(300);
  ok('🔴 預かりの車には1枚目を出さない（今までどおり）', await kindShown() === false);
  ok('いきなり金額の画面が出る', await amtShown() === true);
  await p.evaluate(() => PitReturnPopup.close(false));
  await p.waitForTimeout(150);
}
{
  await put({ status: 'workDone', returnStage: 'callWait', dropType: 'wait', reserveDate: 0 });
  await openDrop('done'); await p.waitForTimeout(300);
  ok('もう完TELを通った車には出さない（2回目は今までどおり）', await kindShown() === false);
  await p.evaluate(() => PitReturnPopup.close(false));
  await p.waitForTimeout(150);
}

console.log('\n── 🟢 「通常」を選ぶ＝今までどおり。そのあと返車済みが押せる ──');
{
  await put({ status: 'work', dropType: 'wait', reserveDate: 0, returnDate: 0 });
  await openDrop('done'); await p.waitForTimeout(250);
  await p.evaluate(() => PitReturnPopup.kind(0));      /* 通常 */
  await p.waitForTimeout(250);
  ok('金額の画面へ進む', await amtShown() === true);
  const f = await p.evaluate(() => ({
    date: document.getElementById('rp-date-field').style.display,
    time: document.getElementById('rp-time-field').style.display,
    okLb: document.getElementById('rp-ok').textContent
  }));
  ok('🔴 通常＝返車予定日の欄が出る', f.date !== 'none', f);
  ok('ボタンは「返車予定に入れる」', f.okLb === '返車予定に入れる', f);

  /* 予定そのまま（今日）で入れる */
  await p.evaluate(() => {
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    document.getElementById('rp-amt').value = '38,500';
    document.getElementById('rp-date').value = ymd(new Date());
    PitReturnPopup.close(true);
  });
  await p.waitForTimeout(400);
  const c = await readCard();
  ok('🔴 実績にはならない（返車待ち）', c.status === 'workDone' && c.returnStage === 'returnWait', c);
  ok('確定金額が入る', c.amountFinal === 38500, c);
  const s = await sheet();
  ok('🔴 ここで「返車済みにする」が押せるようになる', s.off === false, s);
  await sheetClose();
}

console.log('\n── 🟠 「実績化」を選ぶ＝その場で返車済み・実績へ ──');
{
  await put({ status: 'work', dropType: 'wait', reserveDate: 0, returnDate: 0, amountOrder: 24000 });
  await openDrop('done'); await p.waitForTimeout(250);
  await p.evaluate(() => PitReturnPopup.kind(1));      /* 実績化 */
  await p.waitForTimeout(250);
  const f = await p.evaluate(() => ({
    date: document.getElementById('rp-date-field').style.display,
    time: document.getElementById('rp-time-field').style.display,
    title: document.getElementById('rp-title').textContent,
    okLb: document.getElementById('rp-ok').textContent
  }));
  ok('🔴 実績化＝返車予定日の欄は出さない', f.date === 'none' && f.time === 'none', f);
  ok('見出しとボタンが実績化の言い方になる', /実績化/.test(f.title) && f.okLb === '実績に固める', f);

  await p.evaluate(() => { document.getElementById('rp-amt').value = ''; PitReturnPopup.close(true); });
  await p.waitForTimeout(400);
  const c = await readCard();
  const today = await p.evaluate(() => { const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
  ok('🔴 返車済みになる', c.status === 'returned', c);
  ok('🔴 実績に乗る日は今日', c.completedAt === today, { c, today });
  ok('🔴 金額が空でも確定売上が固まる（受注額を拾う）', c.amountFinal === 24000, c);

  /* 当日ビューから消えている＝返車の一覧に出ない */
  const inList = await p.evaluate(() => {
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const c = state.cards.find(x => x.id === 'cDF');
    return window.pitReturnListDate ? pitReturnListDate(c) === ymd(new Date()) : null;
  });
  ok('🔴 当日ビューの返車一覧から消える', inList === false, inList);
}
{
  /* 完TEL依頼のほうでも実績化を選べる */
  await put({ status: 'work', dropType: 'sameDay', reserveDate: 0 });
  await openDrop('req'); await p.waitForTimeout(250);
  ok('完TEL依頼でも1枚目が出る', await kindShown() === true);
  const t2 = await p.evaluate(() => document.getElementById('rk-normal').textContent);
  ok('言い方が「通常の完TEL依頼にする」に変わる', t2 === '通常の完TEL依頼にする', t2);
  await p.evaluate(() => PitReturnPopup.kind(1));
  await p.waitForTimeout(200);
  await p.evaluate(() => { document.getElementById('rp-amt').value = '9,900'; PitReturnPopup.close(true); });
  await p.waitForTimeout(350);
  const c = await readCard();
  ok('🔴 完TEL依頼＋実績化でも返車済みになる', c.status === 'returned' && c.amountFinal === 9900, c);
}

console.log('\n── 🔧 ③ 作業完了：担当者が空なら注意する ──');
const mgShown = () => p.evaluate(() => {
  const bd = document.getElementById('mg-backdrop');
  return !!bd && bd.classList.contains('show');
});
{
  await put({ status: 'work', dropType: 'drop', reserveDate: -1, inspectors: [], mechanics: [] });
  await p.evaluate(() => applyCardDrop('cDF', 'status', 'workDone'));
  await p.waitForTimeout(350);
  ok('🔴 担当者が空なら注意が出る', await mgShown() === true);
  const c1 = await readCard();
  ok('🔴 まだ動いていない（答えるまで待つ）', c1.status === 'work', c1);

  /* 中身＝カード詳細の整備タブとまったく同じ部品か */
  const inside = await p.evaluate(() => {
    const box = document.getElementById('mg-pick');
    return {
      blocks: box.querySelectorAll('.cf-mech-block').length,
      insp:   !!box.querySelector('.cf-mech-i'),
      mech:   !!box.querySelector('.cf-mech-m'),
      chips:  box.querySelectorAll('.cf-mchip').length,
      live:   !!document.getElementById('mg-mech-live')
    };
  });
  ok('🔴 点検・整備の2ブロックが出る', inside.blocks === 2 && inside.insp && inside.mech, inside);
  ok('🔴 メインと同じチップ（cf-mchip）が並ぶ', inside.chips > 0, inside);
  ok('🔴 配分バーの置き場がある', inside.live === true, inside);

  /* チップを押す＝その場で入る・バーが動く */
  const after = await p.evaluate(() => {
    const chip = document.querySelector('#mg-pick .cf-mech-m .cf-mchip');
    const name = chip.textContent.replace(/[×✕]\d*/g, '').trim();
    chip.click();
    return { name: name,
             mech: (state.cards.find(x => x.id === 'cDF').mechanics || []).slice(),
             on: !!document.querySelector('#mg-pick .cf-mech-m .cf-mchip.on'),
             bar: !!document.querySelector('#mg-mech-live .mech-split') };
  });
  await p.waitForTimeout(200);
  ok('🔴 その場で担当者が入る', after.mech.length === 1 && after.mech[0] === after.name, after);
  ok('押したチップが光る', after.on === true, after);
  ok('🔴 動くバーが出る', after.bar === true, after);
  const okLb = await p.evaluate(() => document.getElementById('mg-ok').textContent);
  ok('ボタンの文言が「入れて作業完了へ」に変わる', okLb === '入れて作業完了へ', okLb);

  await p.evaluate(() => PitMechGuard.close(1));
  await p.waitForTimeout(300);
  const c2 = await readCard();
  ok('🔴 OKで作業完了へ進む', c2.status === 'workDone', c2);
  ok('入れた担当者が残る', c2.mech.length === 1, c2);
}
{
  /* 「このまま進める」＝止めない */
  await put({ status: 'work', dropType: 'drop', reserveDate: -1, inspectors: [], mechanics: [] });
  await p.evaluate(() => applyCardDrop('cDF', 'status', 'workDone'));
  await p.waitForTimeout(300);
  await p.evaluate(() => PitMechGuard.close(1));
  await p.waitForTimeout(300);
  const c = await readCard();
  ok('🔴 空のままでも進める（止めない）', c.status === 'workDone' && c.mech.length === 0, c);
}
{
  /* やめた時は動かない */
  await put({ status: 'work', dropType: 'drop', reserveDate: -1, inspectors: [], mechanics: [] });
  await p.evaluate(() => applyCardDrop('cDF', 'status', 'workDone'));
  await p.waitForTimeout(300);
  await p.evaluate(() => PitMechGuard.close(0));
  await p.waitForTimeout(250);
  const c = await readCard();
  ok('やめたらカードは動かない', c.status === 'work', c);
}
{
  /* 片方でも入っていれば出さない */
  await put({ status: 'work', dropType: 'drop', reserveDate: -1, inspectors: [], mechanics: ['蓮沼'] });
  await p.evaluate(() => applyCardDrop('cDF', 'status', 'workDone'));
  await p.waitForTimeout(300);
  ok('🔴 整備担当だけでも出さない', await mgShown() === false);
  const c = await readCard();
  ok('そのまま作業完了へ進む', c.status === 'workDone', c);
}
{
  await put({ status: 'work', dropType: 'drop', reserveDate: -1, inspectors: ['蓮沼'], mechanics: [] });
  await p.evaluate(() => applyCardDrop('cDF', 'status', 'workDone'));
  await p.waitForTimeout(300);
  ok('🔴 点検担当だけでも出さない', await mgShown() === false);
}
{
  /* 作業完了以外の列では出さない */
  await put({ status: 'check', dropType: 'drop', reserveDate: -1, inspectors: [], mechanics: [] });
  await p.evaluate(() => applyCardDrop('cDF', 'status', 'parts'));
  await p.waitForTimeout(350);
  ok('作業完了以外へ動かした時は出さない', await mgShown() === false);
  await p.evaluate(() => { if (window.PitPhasePopup) PitPhasePopup.close(false); });
  await p.waitForTimeout(150);
}
{
  /* ◀▶ボタンで動かした時も同じように出る（道が1本になっているか） */
  await put({ status: 'work', dropType: 'drop', reserveDate: -1, inspectors: [], mechanics: [] });
  await p.evaluate(() => { state.currentBoardId = 'default'; advanceCard('cDF', 1); });
  await p.waitForTimeout(350);
  ok('🔴 ◀▶ボタンでも同じ注意が出る', await mgShown() === true);
  await p.evaluate(() => PitMechGuard.close(0));
  await p.waitForTimeout(150);
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  /* カード詳細の整備タブが、同じ部品で描けているか */
  await put({ status: 'work', dropType: 'drop', reserveDate: -1, inspectors: [], mechanics: [] });
  const cv = await p.evaluate(() => {
    const host = document.getElementById('md-body-modal') || (function () {
      const d = document.createElement('div'); d.id = 'md-body-modal'; document.body.appendChild(d); return d; })();
    renderCardView(state.cards[0], 'md-body-modal');
    const t = document.querySelector('#md-body-modal .cv-tab[data-tab="maint"]') ||
              Array.from(document.querySelectorAll('#md-body-modal .cv-tab')).find(x => /整備/.test(x.textContent));
    if (t) t.click();
    const pane = document.getElementById('cv-p-maint');
    return { blocks: pane ? pane.querySelectorAll('.cf-mech-block').length : -1,
             chips:  pane ? pane.querySelectorAll('.cf-mchip').length : -1,
             live:   !!document.getElementById('cv-mech-live') };
  });
  ok('🔴 カード詳細の整備タブも今までどおり出る', cv.blocks === 2 && cv.chips > 0 && cv.live, cv);
  const tap = await p.evaluate(() => {
    const chip = document.querySelector('#cv-p-maint .cf-mech-i .cf-mchip');
    chip.click();
    return (state.cards[0].inspectors || []).length;
  });
  ok('整備タブのチップも今までどおり効く', tap === 1, tap);
}
{
  const src = fs.readFileSync('js/card-view.js', 'utf8');
  ok('🔴 担当者チップの作りがカード詳細に書き写されていない',
     !/cf-mech-chips/.test(src) && /PitMechPick\.blockHtml/.test(src), '');
  const pp = fs.readFileSync('js/phase-popup.js', 'utf8');
  ok('🔴 作業完了の見張りは phase-popup の1本から', /PitMechGuard\.needed\(card, to\)/.test(pp), '');
  const rp = fs.readFileSync('js/return-popup.js', 'utf8');
  ok('🔴 実績化の書き込みは apply の1か所', (rp.match(/c\.status = 'returned';/g) || []).length === 1,
     (rp.match(/c\.status = 'returned';/g) || []).length);
}
{
  for (const v of ['dashboard', 'task', 'today', 'reserve', 'return', 'result', 'loaner']) {
    await p.evaluate(x => showView(x), v);
    await p.waitForTimeout(220);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
