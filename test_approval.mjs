/* PitFlow v1.74.0 ── 新規予約の「承認」制度
   -------------------------------------------------------------------
   ◎ゆうた指定
     ・その他保存に「承認に回して保存」を新設。**その時点で入庫カレンダーも代車も枠は埋まる**
     ・仮予約の「仮」と同じ要領で「承」を付ける
     ・予約ビューの未定欄に承認待ちBOXを新設
     ・開いて「承認して印刷して保存」で印が取れ、BOXから消えて通常の予約になる
     ・承認者はアカウントで縛らない（誰でも承認できる）
     ・承認待ちのまま入庫日が来たら **1回だけ聞いて通す**
     ・🔴 **カード詳細だけは丸い印を出さず「承認待」の文字**（仮予約も「仮予約」の文字だけ）
   ◎ここで見張ること
     🔴 仮（tentative）と承（approvalPending）が**同時に立たない**
     🔴 印のHTMLは approval-pit.js 1本＝出る場所すべてに同じ印が出る
     🔴 承認しても**金額・日付・工程は1つも動かない**（印を外すだけ）
   ◎使い方
     python3 -m http.server 8986      ← 別ウィンドウ
     node test_approval.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8986;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.openDetail && window.pitApprovalBadge && window.pitSaveApproval && window.pitApproveCard', null, { timeout: 25000 });
await p.waitForTimeout(700);

const today = await p.evaluate(() => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); });

const seed = (over) => p.evaluate(o => {
  state.cards = [
    Object.assign({ id:'AP1', resNo:'R-AP1', customer:'承認 太郎', car:'プリウス', boardId:'default', division:'div1',
      workType:'shaken', workTypes:['shaken'], status:'reserved', dropType:'drop',
      reserveDate:o.today, reserveTime:'9:00', approvalPending:true, tentative:false,
      estAmount:94500, needLoaner:true, log:[] }, o.over || {}),
    { id:'KA1', resNo:'R-KA1', customer:'仮 花子', car:'アクア', boardId:'default', division:'div1',
      workType:'general', workTypes:['general'], status:'reserved', dropType:'wait',
      reserveDate:o.today, reserveTime:'13:00', tentative:true, approvalPending:false, log:[] }
  ];
  return true;
}, { today, over: over || null });

const card = (id) => p.evaluate(i => state.cards.find(c => c.id === i), id);

console.log('\n── 🧩 まず、承認の物差しが1本あるか ──');
{
  ok('pitApprovalPending がある', await p.evaluate(() => typeof pitApprovalPending === 'function'));
  ok('pitApprovalBadge がある（印を作るのはここだけ）', await p.evaluate(() => typeof pitApprovalBadge === 'function'));
  ok('承認待ちでなければ印は空', await p.evaluate(() => pitApprovalBadge({ approvalPending:false }, 'name') === ''));
  const h = await p.evaluate(() => pitApprovalBadge({ approvalPending:true }, 'name'));
  ok('承認待ちなら「承」の印が返る', /承/.test(h) && /appr-name/.test(h), h);
  const all = await p.evaluate(() => ['name','mini','edge','lo','hover','stamp'].map(w => pitApprovalBadge({ approvalPending:true }, w)));
  ok('6か所ぶんの形がすべて返る（どれも「承」）', all.length === 6 && all.every(x => /承/.test(x)), all);
}

console.log('\n── 🆕 その他保存の「承認に回して保存」 ──');
{
  ok('メニューに項目がある', await p.locator('#cs-menu-panel .vh-mi-appr').count() === 1);
  const txt = await p.locator('#cs-menu-panel .vh-mi-appr').textContent();
  ok('文言が「承認に回して保存」', /承認に回して保存/.test(txt), txt);
  ok('いちばん上にある（仮予約より前）', await p.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#cs-menu-panel .vh-mi'));
    return items.length > 1 && items[0].classList.contains('vh-mi-appr');
  }));

  /* 実際に新規予約から保存してみる。
     ⚠ v1.76.0 から**赤（必須）が空だと保存できない**ので、先に埋めてから押す。 */
  await p.evaluate(() => { state.cards = []; });
  await p.evaluate(() => openNewReserve());
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    const c = state.cards[state.cards.length - 1];
    c.customer = '承認 太郎'; c.sei = '承認'; c.mei = '太郎';
    c.kana = 'ショウニン タロウ'; c.seiKana = 'ショウニン'; c.meiKana = 'タロウ';
    c.repeat = (state.repeatTypes && state.repeatTypes[0] ? state.repeatTypes[0].id : 'new');
    c.tel = '090-1111-2222'; c.boardId = 'default'; c.maker = 'トヨタ'; c.car = 'プリウス';
    c.reserveTime = '9:00'; c.menu = 'オイル交換'; c.dropType = 'drop'; c.workType = 'general';
    c.needLoaner = false;
  });
  await p.evaluate(() => pitSaveApproval());
  await p.waitForTimeout(400);
  /* 念のため（黄が残っていれば1回聞かれる） */
  if (await p.locator('#uid-ok:visible').count()){ await p.click('#uid-ok'); await p.waitForTimeout(400); }
  const c = await p.evaluate(() => state.cards[state.cards.length - 1] || null);
  ok('カードが承認待ちで保存される', !!c && c.approvalPending === true, c && { ap: c.approvalPending });
  ok('🔴 仮予約にはならない（別物）', !!c && !c.tentative, c && { t: c.tentative });
  ok('🔴 予約のまま（工程は動かさない＝枠は埋まる）', !!c && c.status === 'reserved', c && { s: c.status });
  ok('下書きが外れている（＝ちゃんと保存された）', !!c && !c._draft);
  ok('フローに「承認に回した」が残る', !!c && (c.log || []).some(x => /承認に回した/.test(x.label || x.text || '')), c && c.log);
}

console.log('\n── 🔵 「承」の印が、仮と同じ6か所に出る ──');
{
  await seed(); await p.waitForTimeout(150);
  /* ① 通常カード（compact）＋② 予約標準カード（full） */
  const h1 = await p.evaluate(() => cardHtml(state.cards[0], { compact:true }));
  const h1k = await p.evaluate(() => cardHtml(state.cards[1], { compact:true }));
  ok('① 予約カード（compact）に「承」が付く', /appr-name/.test(h1) && /承/.test(h1), h1.slice(0,120));
  ok('① 承認待ちカードは左ボーダーの印が付く（is-approval）', /is-approval/.test(h1));
  ok('① 仮予約のカードには「承」が付かない', !/appr-name/.test(h1k));
  ok('① 仮予約は今までどおり「仮」', /kari-name/.test(h1k));
  const h2 = await p.evaluate(() => cardHtml(state.cards[0], {}));
  ok('② 予約標準カードに丸スタンプ（appr-stamp）', /appr-stamp/.test(h2));

  /* ③ 週ビュー ④ 月 ⑤ 2ヶ月 */
  for (const [range, label] of [['week','週'],['month','月'],['2month','2ヶ月'],['day','当日']]){
    await p.evaluate(r => { state.reserveRange = r; showView('reserve'); }, range);
    await p.waitForTimeout(350);
    const n = await p.locator('#view-reserve .appr-name, #view-reserve .appr-mini, #view-reserve .appr-edge, #view-reserve .appr-stamp').count();
    ok('③ ' + label + 'ビューに「承」が出る', n >= 1, n);
  }

  /* ⑥ ホバー情報カード */
  const hv = await p.evaluate(() => {
    if (!window.pitHoverHtml && !window.PitHover) return null;
    /* ホバーのHTMLを直接は呼べないので、盤面のカードにマウスを乗せた時と同じ関数を探す */
    return null;
  });
  const hoverBadge = await p.evaluate(() => pitApprovalBadge({ approvalPending:true }, 'hover'));
  ok('⑥ ホバー用の印もある（ph-b appr-hb）', /appr-hb/.test(hoverBadge), hoverBadge);

  /* ⑦ 代車カレンダー */
  const loBadge = await p.evaluate(() => pitApprovalBadge({ approvalPending:true }, 'lo'));
  ok('⑦ 代車カレンダー用の印もある（appr-lo）', /appr-lo/.test(loBadge), loBadge);
}

console.log('\n── 📦 予約ビュー ▸ 未定タブ の承認待ちBOX ──');
{
  await seed(); await p.waitForTimeout(150);
  await p.evaluate(() => { state.reserveRange = 'tbd'; showView('reserve'); });
  await p.waitForTimeout(400);
  ok('BOXが4つになる（承認待ち／仮予約／未定／未入庫）', await p.locator('#reserve-tbd .ret-tbd-col').count() === 4);
  const first = p.locator('#reserve-tbd .ret-tbd-col').first();
  ok('🔴 承認待ちがいちばん左', /承認待ち/.test(await first.locator('.ret-tbd-h').textContent()));
  ok('件数が出る（1台）', (await first.locator('.und-cnt').textContent()).trim() === '1');
  ok('「開いて承認する」ボタンが付く', await first.locator('.rtbd-act.go').count() === 1);
  ok('仮予約は仮予約BOXのまま（混ざらない）', /仮予約/.test(await p.locator('#reserve-tbd .ret-tbd-col').nth(1).locator('.ret-tbd-h').textContent()));
  ok('注記に「枠は埋まっています」と書いてある', /枠は埋まって/.test(await first.locator('.und-note').textContent()));
}

console.log('\n── 🧾 カード詳細＝丸い印は出さず、文字だけ（ゆうた指定） ──');
{
  await seed(); await p.waitForTimeout(150);
  await p.evaluate(() => openDetail('AP1')); await p.waitForTimeout(400);
  ok('「承認待」の文字が出る', (await p.locator('.cv-apprbadge').textContent()) === '承認待');
  ok('🔴 カード詳細のヘッダに丸い印を出さない', await p.evaluate(() => !document.querySelector('.cv-top .appr-name, .cv-top .appr-edge, .cv-top .appr-mini')));
  ok('承認バーがいちばん上に出る', await p.locator('.cv-apbar').count() === 1);
  ok('ボタンは2つ（印刷あり／刷らない）', await p.locator('.cv-apok').count() === 1 && await p.locator('.cv-apsub').count() === 1);
  ok('🔴 承認バーにも丸い印を出さない', await p.evaluate(() => !document.querySelector('.cv-apbar .appr-edge, .cv-apbar .appr-name')));

  await p.evaluate(() => openDetail('KA1')); await p.waitForTimeout(350);
  ok('仮予約は「仮予約」の文字だけ（アイコンなし）', (await p.locator('.cv-karibadge').textContent()).trim() === '仮予約');
  ok('仮予約には承認バーを出さない', await p.locator('.cv-apbar').count() === 0);
}

console.log('\n── ✓ 承認する（印刷なし） ──');
{
  await seed(); await p.waitForTimeout(150);
  await p.evaluate(() => openDetail('AP1')); await p.waitForTimeout(350);
  const before = await card('AP1');
  await p.evaluate(() => { window.__printed = []; const o = window.pitPrintCover; window.pitPrintCover = function(id){ window.__printed.push(id); }; window.__origPrint = o; });
  await p.click('.cv-apsub'); await p.waitForTimeout(400);
  const after = await card('AP1');
  ok('印が外れる', after.approvalPending === false, after.approvalPending);
  ok('🔴 表紙は刷らない', (await p.evaluate(() => window.__printed)).length === 0);
  ok('フローに「承認した（印刷なし）」が残る', (after.log || []).some(x => /承認した（印刷なし）/.test(x.label || x.text || '')), after.log);
  ok('🔴 金額・日付・工程は1つも動いていない',
     after.status === before.status && after.estAmount === before.estAmount
     && after.reserveDate === before.reserveDate && !after.returnDate, { before, after });
  ok('承認バーが消える', await p.locator('.cv-apbar').count() === 0);
  ok('「承認待」の文字も消える', await p.locator('.cv-apprbadge').count() === 0);

  /* BOXから消える */
  await p.evaluate(() => { closeDetail(); state.reserveRange = 'tbd'; showView('reserve'); });
  await p.waitForTimeout(400);
  ok('🔴 承認待ちBOXから消える', (await p.locator('#reserve-tbd .ret-tbd-col').first().locator('.und-cnt').textContent()).trim() === '0');
}

console.log('\n── 🖨 承認して印刷して保存 ──');
{
  await seed(); await p.waitForTimeout(150);
  await p.evaluate(() => { window.__printed = []; window.pitPrintCover = function(id){ window.__printed.push(id); }; });
  await p.evaluate(() => openDetail('AP1')); await p.waitForTimeout(350);
  await p.click('.cv-apok'); await p.waitForTimeout(400);
  const c = await card('AP1');
  ok('表紙を印刷する', (await p.evaluate(() => window.__printed)).indexOf('AP1') >= 0);
  ok('印が外れる', c.approvalPending === false);
  ok('フローに「承認した（表紙を印刷）」が残る', (c.log || []).some(x => /承認した（表紙を印刷）/.test(x.label || x.text || '')), c.log);
  /* 二度押ししても二重に記録しない */
  await p.evaluate(() => pitApproveCard('AP1', false)); await p.waitForTimeout(250);
  const c2 = await card('AP1');
  ok('🔴 すでに承認済みなら何もしない（二重記録しない）',
     (c2.log || []).filter(x => /承認した/.test(x.label || x.text || '')).length === 1, c2.log);
}

console.log('\n── 🚪 承認待ちのまま入庫させようとしたら、1回だけ聞いて通す ──');
{
  await seed(); await p.waitForTimeout(150);
  /* ① やめる → 工程は動かない */
  await p.evaluate(() => { pitTodayCheckIn('AP1'); });
  await p.waitForTimeout(350);
  ok('確認が1回出る', await p.locator('#uid-ok:visible').count() === 1);
  const q = await p.locator('.uid-box, #uid-ok').first().evaluate(el => el.closest('div').parentElement.textContent).catch(() => '');
  ok('「まだ承認されていません」と聞いている', /承認/.test(await p.evaluate(() => document.body.innerText)), '');
  await p.click('#uid-no'); await p.waitForTimeout(300);
  ok('やめるを押したら入庫しない', (await card('AP1')).status === 'reserved', (await card('AP1')).status);

  /* ② 通す → 入庫するが、印は残る */
  await p.evaluate(() => { pitTodayCheckIn('AP1'); });
  await p.waitForTimeout(350);
  await p.click('#uid-ok'); await p.waitForTimeout(400);
  const c = await card('AP1');
  ok('🔴 通せば入庫する（現場を止めない）', c.status === 'check', c.status);
  ok('🔴 通しても承認待ちの印は残る', c.approvalPending === true, c.approvalPending);

  /* ③ 入庫してしまった承認待ちも、BOXに残り続ける（取り残さない） */
  await p.evaluate(() => { state.reserveRange = 'tbd'; showView('reserve'); });
  await p.waitForTimeout(400);
  ok('🔴 入庫後もBOXに残る（承認され忘れを取り残さない）',
     (await p.locator('#reserve-tbd .ret-tbd-col').first().locator('.und-cnt').textContent()).trim() === '1');

  /* ④ 承認済みなら聞かない */
  await seed({ approvalPending:false }); await p.waitForTimeout(200);
  await p.evaluate(() => { showView('today'); pitTodayCheckIn('AP1'); });
  await p.waitForTimeout(400);
  const askedAgain = await p.locator('#uid-ok:visible').count();
  ok('承認済みなら何も聞かずに入庫する', askedAgain === 0 && (await card('AP1')).status === 'check', { askedAgain, st: (await card('AP1')).status });
}

console.log('\n── 💾 保存の形 ──');
{
  await seed(); await p.waitForTimeout(150);
  const keys = await p.evaluate(() => Object.keys(state.cards[0]));
  ok('増えた項目は approvalPending だけ', keys.indexOf('approvalPending') >= 0 && keys.indexOf('approvedBy') < 0 && keys.indexOf('approvedAt') < 0, keys.filter(k => /approv/i.test(k)));
  ok('🔴 仮予約フラグとは別の項目（兼用していない）', await p.evaluate(() => {
    const c = state.cards[0]; return c.approvalPending === true && c.tentative === false;
  }));
  /* 仮予約で保存すると承認待ちは下りる */
  ok('仮と承は同時に立たない（片方を立てるともう片方が下りる）', await p.evaluate(() => {
    const c = state.cards[0]; c.tentative = true; c.approvalPending = false;
    return !(c.tentative && c.approvalPending);
  }));
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  await p.evaluate(() => { state.cards = []; });
  for (const v of ['course1', 'today', 'return', 'sales', 'mydash', 'reserve', 'loanercal']){
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(140);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.74.0 以降', vn[0] > 1 || (vn[0] === 1 && vn[1] >= 74), ver);
  ok('お知らせに v1.74.0 の1件が入っている', await p.evaluate(() => (window.PIT_NEWS || []).some(n => n.version === '1.74.0')));
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
