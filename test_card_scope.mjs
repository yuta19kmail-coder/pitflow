/* PitFlow v1.44.0 ── 入庫カードの入力が「別のカード」に入ってしまう不具合のテスト
   -------------------------------------------------------------------
   ◎起きていたこと（ゆうた報告・2026-08-04）
     一度保存した予約カードの依頼事項、とくに「**車検満了日：**」を入れると、
     **その前後の予約カードの方に文字が入る**。
   ◎正体
     入庫カードのフォームは置き場所が **2つ** ある。
       ・全画面（新規予約・編集）   … #md-body
       ・ポップアップ（詳細→編集） … #md-body-modal
     前に開いた方が**画面の裏に残ったまま**になるので、**同じ id・同じ data-key の欄が2つ**できる。
     症状ホイールのチップは入力欄を `document.querySelector` で**画面全体から**探していたので、
     **先に見つかる＝前に開いたカードの欄**に文字を入れていた。
   ◎直し（二段構え）
     ① 描く直前に**使わない方の入れ物を空にする**（card-detail.js `_cardClearOtherBody`）。
     ② それでも取り違えないよう、探し物は**いま開いているフォームの中だけ**に限定
        （work-content.js の hostEl/q/qa/byId・customers.js の顧客呼び出し）。
     ③ ポップアップを閉じて全画面に戻る時は**描き直す**（空のページにしない）。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8956      ← 別ウィンドウ
     node test_card_scope.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:8956/index.html?demo=1');
await p.waitForFunction('window.state && typeof window.openCard === "function"', null, { timeout: 20000 });
await p.waitForTimeout(700);

/* 前後に並ぶ予約カードを3枚（真ん中をいじって、前と後ろが汚れないことを見る） */
await p.evaluate(() => {
  const mk = i => ({ id: 'sc' + i, resNo: 'S' + i, customer: '客' + i + ' 太郎', car: 'アクア', maker: 'トヨタ',
    tel: '090-0000-000' + i, reserveDate: window.ymd(new Date()), reserveTime: '1' + i + ':00',
    status: 'reserved', boardId: 'default', division: 'div1', workTypes: [], dropType: 'wait', menu: '' });
  state.cards.push(mk(1)); state.cards.push(mk(2)); state.cards.push(mk(3));
});
const menuOf = id => p.evaluate(x => (state.cards.find(c => c.id === x) || {}).menu, id);
const allMenus = () => p.evaluate(() => ['sc1','sc2','sc3'].map(i => (state.cards.find(c => c.id === i) || {}).menu));

console.log('\n── ① 入れ物はいつも1つだけ ──');
{
  await p.evaluate(() => window.openCard('sc1', 'page'));      /* まず1枚目を全画面で開く */
  await p.waitForTimeout(450);
  ok('全画面で内容欄は1つ', (await p.evaluate(() => document.querySelectorAll('textarea.cf-input[data-key="menu"]').length)) === 1);

  await p.evaluate(() => window.openCard('sc2'));              /* 続けて2枚目をポップアップで開く */
  await p.waitForTimeout(450);
  await p.evaluate(() => window.openCardEditForm('sc2'));      /* → 予約を編集 */
  await p.waitForTimeout(450);
  ok('🔴 ポップアップを開いても内容欄は1つのまま',
     (await p.evaluate(() => document.querySelectorAll('textarea.cf-input[data-key="menu"]').length)) === 1,
     await p.evaluate(() => document.querySelectorAll('textarea.cf-input[data-key="menu"]').length));
  ok('🔴 症状ホイールも1つだけ', (await p.evaluate(() => document.querySelectorAll('[id="wc-c1"]').length)) === 1);
  ok('🔴 顧客呼び出しの箱も1つだけ', (await p.evaluate(() => document.querySelectorAll('[id="cf-recall-list"]').length)) === 1);
  ok('🔴 探して出てくるのは「いま開いているカード」の欄',
     (await p.evaluate(() => {
        const ta = document.querySelector('textarea.cf-input[data-key="menu"]');
        return !!(ta && ta.closest('#md-body-modal'));
     })));
}

console.log('\n── ② 「車検満了日：」を押しても前後のカードに入らない ──');
{
  const before = await allMenus();
  const r = await p.evaluate(() => {
    const host = document.getElementById('md-body-modal');
    const btn = Array.from(host.querySelectorAll('.wc-chip')).find(x => x.textContent.trim() === '車検満了日：');
    if (!btn) return 'ない';
    btn.click(); return 'ok';
  });
  ok('チップが見つかる', r === 'ok', r);
  await p.waitForTimeout(400);
  const after = await allMenus();
  ok('🔴 いま開いている2枚目に入る', after[1] === '車検満了日：', after);
  ok('🔴 1枚前（sc1）は汚れていない', after[0] === before[0], { before: before[0], after: after[0] });
  ok('🔴 1枚後（sc3）も汚れていない', after[2] === before[2], { before: before[2], after: after[2] });
}

console.log('\n── ③ 値を打ち足しても同じ（入力もいまのカードへ） ──');
{
  await p.evaluate(() => {
    const ta = document.querySelector('#md-body-modal textarea.cf-input[data-key="menu"]');
    ta.value = '車検満了日：R8.11.30';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(350);
  const m = await allMenus();
  ok('🔴 2枚目にだけ入る', m[1] === '車検満了日：R8.11.30', m);
  ok('前後は空のまま', m[0] === '' && m[2] === '', m);
}

console.log('\n── ④ ほかのチップ（トグル）も取り違えない ──');
{
  await p.evaluate(() => {
    const host = document.getElementById('md-body-modal');
    const btn = Array.from(host.querySelectorAll('.wc-chip')).find(x => x.textContent.trim() === '点検');
    if (btn) btn.click();
  });
  await p.waitForTimeout(350);
  const m = await allMenus();
  ok('2枚目に足される', m[1].indexOf('点検') >= 0, m[1]);
  ok('🔴 前後は空のまま', m[0] === '' && m[2] === '', m);
  /* もう一度押すと消える＝トグルもいまのカードを見ている */
  await p.evaluate(() => {
    const host = document.getElementById('md-body-modal');
    const btn = Array.from(host.querySelectorAll('.wc-chip')).find(x => x.textContent.trim() === '点検');
    if (btn) btn.click();
  });
  await p.waitForTimeout(350);
  ok('もう一度押すと消える', (await menuOf('sc2')).indexOf('点検') < 0, await menuOf('sc2'));
}

console.log('\n── ⑤ 顧客呼び出しの候補も、いまのフォームに出る ──');
{
  await p.evaluate(() => {
    const inp = document.querySelector('#md-body-modal #cf-recall-input');
    if (inp){ inp.value = 'あ'; if (window.custSuggest) custSuggest('あ'); }
  });
  await p.waitForTimeout(300);
  ok('候補の箱はポップアップ側にある',
     (await p.evaluate(() => !!document.querySelector('#md-body-modal #cf-recall-list'))));
  ok('全画面側に候補が出ていない（そもそも空）',
     (await p.evaluate(() => { const e = document.getElementById('md-body'); return !e || e.innerHTML === ''; })));
}

console.log('\n── ⑥ ポップアップを閉じても全画面が真っ白にならない ──');
{
  await p.evaluate(() => { state.currentView = 'card'; });
  await p.evaluate(() => window.closeDetail());
  await p.waitForTimeout(500);
  ok('🔴 全画面カードが描き直されている',
     (await p.evaluate(() => document.querySelectorAll('#md-body textarea.cf-input[data-key="menu"]').length)) === 1);
  ok('🔴 戻ってきたのは元の1枚目', (await p.evaluate(() => {
     const ta = document.querySelector('#md-body textarea.cf-input[data-key="menu"]');
     return ta ? ta.value : null;
  })) === '', await menuOf('sc1'));
  ok('ここでも内容欄は1つだけ', (await p.evaluate(() => document.querySelectorAll('textarea.cf-input[data-key="menu"]').length)) === 1);
  /* この状態でチップを押しても、当然1枚目に入る */
  await p.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('#md-body .wc-chip')).find(x => x.textContent.trim() === '車検満了日：');
    if (btn) btn.click();
  });
  await p.waitForTimeout(350);
  const m = await allMenus();
  ok('🔴 1枚目に入る（2枚目は増えない）', m[0] === '車検満了日：' && m[1] === '車検満了日：R8.11.30', m);
}

console.log('\n── ⑦ 二度と落ちないように（配線チェック） ──');
{
  const cd = fs.readFileSync('js/card-detail.js', 'utf8');
  ok('🔴 使わない入れ物を空にする仕掛けがある', /function _cardClearOtherBody\(keepId\)/.test(cd));
  ok('描く直前に呼んでいる', /_cardClearOtherBody\(_cardBodyId \|\| 'md-body'\)/.test(cd));
  ok('閉じた後に全画面を描き直す', /openCard\(_pageCardId, 'page'\)/.test(cd));
  const wc = fs.readFileSync('js/work-content.js', 'utf8');
  ok('🔴 症状ホイールは入れ物の中から探している', /function hostEl\(\)/.test(wc));
  ok('内容欄も入れ物の中から', /function _menuTA\(\)\{ return q\('textarea/.test(wc));
  ok('画面全体から探す書き方が残っていない（設定画面のぶんを除く）',
     (wc.match(/document\.(querySelector|getElementById)\(/g) || []).length <= 3,
     (wc.match(/document\.(querySelector|getElementById)\(/g) || []).length);
  const cu = fs.readFileSync('js/customers.js', 'utf8');
  ok('顧客呼び出しも入れ物の中から', /_host\.querySelector\('#cf-recall-list'\)/.test(cu));
  const idx = fs.readFileSync('index.html', 'utf8');
  /* ⚠ 版は上がっていくので数字は固定しない（決め打ちだと毎回のリリースで落ちる）。
     「ログイン画面の版・トップバーの版・meta app-version の3つがそろっているか」だけ見る。 */
  const _mVer = (idx.match(/<div class="login-ver">v([\d.]+)<\/div>/) || [])[1] || '';
  const _tVer = (idx.match(/<span class="ver">v([\d.]+)<\/span>/) || [])[1] || '';
  const _aVer = (idx.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('画面の版2か所と app-version がそろっている', !!_mVer && _mVer === _tVer && _mVer === _aVer, [_mVer, _tVer, _aVer]);
  ok('JSエラー0', errs.length === 0, errs.slice(0, 5));
}

console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
