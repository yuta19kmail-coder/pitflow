/* PitFlow ── ⏻ **全アプリ共通の電源ボタン**（本物のブラウザ）
   ===================================================================
   ◎ゆうた指定（2026-08-29）
     🗣「全アプリ右上のログアウトボタンを電源マークに変更、隣のヘルプは消す。
     　　アバター・名前・リアル同期・電源ボタン の並びで。
     　　電源ボタンクリックでプルダウンメニュー：更新／画面を閉じる／ログアウト。
     　　ログアウトはポップアップ確認で本当にログアウト」
     🗣「マスターの俺だけには 全端末の強制更新／全端末全アプリの強制更新 が使えるように。
     　　**今回みたいな時の緊急対応に。**」
     🗣（ヘルプの行き先）→ **「電源のメニューに入れる」を選択**
     🗣（2026-08-29 追加）「特定のアカウント、例えば**Aさんのログイン端末を全部更新する**、はできる？」
     🗣（2026-08-29 直し）「**アカウント選択の部分でスクロールが効かずに閉じちゃう**」
     🗣（2026-08-29 直し）「特定の人間も**全アプリか開いてるこのアプリか**で、全員のタイプと合わせて**計4機能**に」

   ◎この見張りが守るもの
     🔴 ① 右上が [アバター][名前][同期][⏻] になっている（？とログアウトの文字が消えている）
     🔴 ② 押すとメニューが出る＝更新／画面を閉じる／ヘルプ／ログアウト
     🔴 ③ **ふつうの人にはマスターの2つを出さない**
     🔴 ④ **マスターの時だけ**「全員の この画面」「全員の 全アプリ」が出る
     🔴 ⑤ ログアウトは**必ず1回聞く**（いきなり出ていかない）
     🔴 ⑥ 「はい」で**アプリ本来のログアウト**が動く（＝動きを奪えている）
     🔴 ⑦ ヘルプを押すと**アプリ本来のヘルプ**が開く
     🔴 ⑧ 外側クリック・Esc で閉じる
     🔴 ⑨ 「画面を閉じる」が効かない時、**黙らずに案内を出す**
     🔴 ⑩ マスターだけに **4つ**出る＝「誰を（全員／決めた人）」×「何を（この画面／全アプリ）」
     🔴 ⑪ 名簿から選べる／しぼれる／**一覧をスクロールしても閉じない**／もどれる
     🔴 ⑫ 合図に **uid とメールの両方**が入る（名簿のIDが uid とは限らないため）＋ 4通りの当て先
     🔴🔴 ⑬ 受け取る側が、**自分あての合図でだけ**開き直す
     🔴 ⑭ JSエラー0

   ◎使い方
     python3 -m http.server 8979 --directory . &
     PORT=8979 node test_power_menu.mjs
   =================================================================== */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8979;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1400, height: 880 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.CFPower', null, { timeout: 30000 });
await p.waitForFunction('document.getElementById("cf-power")', null, { timeout: 20000 });
await p.waitForTimeout(400);

/* ================= ① 右上の並び ================= */
console.log('\n── 🔴 ①右上が アバター／名前／同期／電源 になっている ──');
{
  const r = await p.evaluate(() => {
    const box = document.getElementById('cf-power');
    const bar = box.parentElement;
    const kids = [...bar.children].map(e => {
      if (e.id === 'cf-power') return '電源';
      if (e.classList.contains('av') || e.id === 'tb-avatar') return 'アバター';
      if (e.classList.contains('tb-username')) return '名前';
      if (e.classList.contains('sync-indicator')) return '同期';
      if (e.classList.contains('help-btn')) return 'ヘルプ';
      return (e.textContent || '').replace(/\s/g, '').slice(0, 8) || e.tagName;
    });
    return {
      並び: kids,
      ヘルプボタンが残っていない: !document.querySelector('.help-btn'),
      ログアウトの文字が残っていない: ![...document.querySelectorAll('button')].some(x => (x.textContent || '').replace(/\s/g,'') === 'ログアウト'),
      電源が1つだけ: document.querySelectorAll('#cf-power').length === 1,
      アイコンがある: !!document.querySelector('#cf-power-btn svg')
    };
  });
  ok('🔴 電源ボタンが置き換わっている', r.電源が1つだけ && r.アイコンがある, r);
  ok('🔴 ヘルプの「？」が消えている', r.ヘルプボタンが残っていない, r);
  ok('🔴 「ログアウト」の文字ボタンが消えている', r.ログアウトの文字が残っていない, r);
  ok('並びが アバター→名前→同期→電源 の順', (() => {
    const i = r.並び;
    const a = i.indexOf('アバター'), n = i.indexOf('名前'), s = i.indexOf('同期'), pw = i.indexOf('電源');
    return a >= 0 && n > a && s > n && pw > s;
  })(), r.並び);
}

/* ================= ② メニューの中身 ================= */
console.log('\n── 🔴 ②メニューの中身 ──');
{
  await p.click('#cf-power-btn');
  await p.waitForTimeout(250);
  const r = await p.evaluate(() => ({
    出ている: document.getElementById('cf-power').classList.contains('on'),
    項目: [...document.querySelectorAll('#cf-power-menu [data-do]')].map(e => ({ do: e.getAttribute('data-do'), 文: (e.textContent || '').trim().split('\n')[0] })),
    マスター欄: !!document.querySelector('#cf-power-menu .cf-power-head')
  }));
  ok('押すとメニューが出る', r.出ている, r);
  ok('🔴 更新がある', r.項目.some(x => x.do === 'reload'), r.項目);
  ok('🔴 画面を閉じるがある', r.項目.some(x => x.do === 'close'), r.項目);
  ok('🔴 ヘルプがある（？の代わり）', r.項目.some(x => x.do === 'help'), r.項目);
  ok('🔴 ログアウトがある', r.項目.some(x => x.do === 'logout'), r.項目);
  ok('🔴🔴 ふつうの人にマスターの欄は出さない', !r.マスター欄 && !r.項目.some(x => /^fr-/.test(x.do)), r.項目);
  ok('ログアウトは赤で出す', await p.evaluate(() => !!document.querySelector('#cf-power-menu [data-do=logout].danger')));
}

/* ================= ②-2 メニューが何にも隠されない ================= */
console.log('\n── 🔴🔴 ②-2 メニューが下の画面に隠されない ──');
{
  const r = await p.evaluate(() => {
    CFPower.open(true);
    const m = document.getElementById('cf-power-menu');
    const items = [...m.querySelectorAll('[data-do]')];
    /* 1つずつ、その行の真ん中に「実際に何が見えているか」を聞く */
    const 隠れ = items.filter(e => {
      const r = e.getBoundingClientRect();
      const top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return !(top && (top === e || e.contains(top) || m.contains(top)));
    }).map(e => e.getAttribute('data-do'));
    return { body直下: m.parentElement === document.body, 置き方: getComputedStyle(m).position, 隠れ, 行数: items.length };
  });
  /* 🔴 実話：はじめメニューをトップバーの中に置いていたら、PitFlow の検索バーが
     **ヘルプの行の上に乗って、1行だけ見えなくなった**（z-index を上げても直らない。
     親が作る「重なりの箱」から出られないため）。だから body の直下に置く。 */
  ok('🔴🔴 メニューは body の直下にある（アプリの重なり順に巻き込まれない）', r.body直下, r);
  ok('🔴 画面ぜんたいに対して置いている（fixed）', r.置き方 === 'fixed', r);
  ok('🔴🔴 どの行も、何かの下に隠れていない', r.隠れ.length === 0, r);
  await p.evaluate(() => CFPower.open(false));
}

/* ================= ③ 閉じ方 ================= */
console.log('\n── ③外側クリック・Esc で閉じる ──');
{
  await p.click('body', { position: { x: 400, y: 600 } });
  await p.waitForTimeout(200);
  ok('外側を押すと閉じる', await p.evaluate(() => !document.getElementById('cf-power').classList.contains('on')));
  await p.click('#cf-power-btn'); await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok('Esc で閉じる', await p.evaluate(() => !document.getElementById('cf-power').classList.contains('on')));
}

/* ================= ④ マスターの時だけ出る ================= */
console.log('\n── 🔴🔴 ④マスターの時だけ、強制更新が出る ──');
{
  const r = await p.evaluate(() => {
    window.fb = window.fb || {};
    window.fb.currentUser = { uid: window.CFPower.MASTER_UID, displayName: 'マスター' };
    CFPower.open(false); CFPower.open(true);
    return {
      マスター判定: CFPower.isMaster(),
      項目: [...document.querySelectorAll('#cf-power-menu [data-do]')].map(e => e.getAttribute('data-do')),
      見出し: (document.querySelector('#cf-power-menu .cf-power-head') || {}).textContent || ''
    };
  });
  ok('🔴 マスターだと分かる', r.マスター判定, r);
  ok('🔴🔴 全員の この画面 が出る', r.項目.indexOf('fr-app') >= 0, r.項目);
  ok('🔴🔴 全員の 全アプリ が出る', r.項目.indexOf('fr-all') >= 0, r.項目);
  ok('「マスターのみ」の見出しが付く', /マスター/.test(r.見出し), r.見出し);

  /* 戻す＝ふつうの人 */
  const r2 = await p.evaluate(() => {
    window.fb.currentUser = { uid: 'dareka' };
    CFPower.open(false); CFPower.open(true);
    return [...document.querySelectorAll('#cf-power-menu [data-do]')].map(e => e.getAttribute('data-do'));
  });
  ok('🔴 ふつうの人に戻すと、また消える', !r2.some(x => /^fr-/.test(x)), r2);
  await p.evaluate(() => CFPower.open(false));
}

/* ================= ⑤ ログアウトは必ず1回聞く ================= */
console.log('\n── 🔴 ⑤ログアウトは必ず1回聞く ──');
{
  const r = await p.evaluate(async () => {
    let 呼ばれた = 0;
    window.CFPower._handlers.logout = () => { 呼ばれた++; };
    CFPower.open(true);
    document.querySelector('#cf-power-menu [data-do=logout]').click();
    await new Promise(r => setTimeout(r, 350));
    const 窓 = !!(document.querySelector('.ui-dlg, .uidlg, [class*=dialog], [data-yes]')) || !!(window.UI && UI.isOpen && UI.isOpen());
    return { 窓が出た: 窓, いきなり呼ばれていない: 呼ばれた === 0 };
  });
  ok('🔴🔴 いきなりログアウトしない', r.いきなり呼ばれていない, r);
  ok('🔴 確認の窓が出る', r.窓が出た, r);

  /* 「はい」を押したらアプリ本来のログアウトが動く */
  const r2 = await p.evaluate(async () => {
    let 呼ばれた = 0;
    window.CFPower._handlers.logout = () => { 呼ばれた++; };
    /* 出ている窓の「はい」を押す（アプリの窓でも、部品の予備の窓でも拾う） */
    const cands = [...document.querySelectorAll('button')].filter(b => /ログアウト|はい|OK/.test((b.textContent || '').trim()));
    const yes = cands[cands.length - 1];
    if (yes) yes.click();
    await new Promise(r => setTimeout(r, 400));
    return { 呼ばれた };
  });
  ok('🔴🔴 「はい」でアプリ本来のログアウトが動く（動きを奪えている）', r2.呼ばれた === 1, r2);
}

/* ================= ⑥ ヘルプが生きている ================= */
console.log('\n── 🔴 ⑥ヘルプはアプリ本来のものが開く ──');
{
  const r = await p.evaluate(async () => {
    let 開いた = 0;
    const 元 = window.showView;
    window.showView = function (v) { if (v === 'help') 開いた++; return 元 && 元.apply(this, arguments); };
    CFPower.open(true);
    const h = document.querySelector('#cf-power-menu [data-do=help]');
    if (h) h.click();
    await new Promise(r => setTimeout(r, 300));
    window.showView = 元;
    return { 開いた, 項目があった: !!h };
  });
  ok('ヘルプの項目がある', r.項目があった, r);
  ok('🔴 押すとアプリ本来のヘルプが開く', r.開いた === 1, r);
}

/* ================= ⑦ 画面を閉じるが効かない時、黙らない ================= */
console.log('\n── 🔴 ⑦「画面を閉じる」が効かない時、黙らずに案内を出す ──');
{
  const r = await p.evaluate(async () => {
    CFPower._close();
    await new Promise(r => setTimeout(r, 700));
    const n = document.getElementById('cf-power-note');
    return { 案内が出た: !!n, 文: n ? n.textContent : '' };
  });
  ok('🔴🔴 閉じられなかったら案内を出す', r.案内が出た, r);
  ok('Alt+F4 の言い方が入っている', /Alt\+F4/.test(r.文), r.文);
}

/* ================= ⑧ 強制更新は、押しただけでは飛ばさない ================= */
console.log('\n── 🔴 ⑧強制更新も1回聞く ──');
{
  const r = await p.evaluate(async () => {
    let 書いた = 0;
    window.fb = window.fb || {};
    window.fb.currentUser = { uid: window.CFPower.MASTER_UID, displayName: 'マスター' };
    window.fb.currentCompanyId = 'test';
    window.fb.db = { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ set: (o) => { 書いた++; window.__書いた = o; return Promise.resolve(); } }) }) }) }) };
    CFPower._force('all');
    await new Promise(r => setTimeout(r, 300));
    return { いきなり書いていない: 書いた === 0 };
  });
  ok('🔴🔴 押しただけでは合図を書かない（1回聞く）', r.いきなり書いていない, r);

  const r2 = await p.evaluate(async () => {
    const cands = [...document.querySelectorAll('button')].filter(b => /更新する|はい|OK/.test((b.textContent || '').trim()));
    const yes = cands[cands.length - 1];
    if (yes) yes.click();
    await new Promise(r => setTimeout(r, 400));
    return { 書いた: window.__書いた || null };
  });
  ok('🔴 「はい」で合図を1枚書く', !!r2.書いた, r2);
  ok('🔴 全アプリの合図になっている（app=all）', r2.書いた && r2.書いた.app === 'all', r2.書いた);
  ok('いつ出したかが入っている', !!(r2.書いた && r2.書いた.at), r2.書いた);
}

/* ================= ⑩ 決めた人の端末だけ更新（マスターだけ） ================= */
console.log('\n── 🔴🔴 ⑩マスターだけに4つ（誰を × 何を） ──');
{
  const r = await p.evaluate(() => {
    window.fb = window.fb || {};
    window.fb.currentUser = { uid: 'dareka', email: 'x@y.jp' };
    CFPower.open(false); CFPower.open(true);
    return [...document.querySelectorAll('#cf-power-menu [data-do]')].map(e => e.getAttribute('data-do'));
  });
  ok('🔴🔴 ふつうの人には1つも出さない', !r.some(x => /^fr-/.test(x)), r);

  const r2 = await p.evaluate(() => {
    window.fb.currentUser = { uid: window.CFPower.MASTER_UID, displayName: 'マスター', email: 'yuta@kobamo.jp' };
    CFPower.open(false); CFPower.open(true);
    return [...document.querySelectorAll('#cf-power-menu [data-do]')].map(e => e.getAttribute('data-do'));
  });
  /* 🔴 「誰を（全員／決めた人）」×「何を（この画面／全アプリ）」＝ 2×2 の4つがそろっていること */
  for (const [k, 名] of [['fr-app', '全員の この画面'], ['fr-all', '全員の 全アプリ'],
                          ['fr-one-app', '決めた人の この画面'], ['fr-one-all', '決めた人の 全アプリ']]) {
    ok('🔴🔴 ' + 名 + ' が出る', r2.indexOf(k) >= 0, r2);
  }
  ok('🔴 4つちょうど（増えても減ってもいない）', r2.filter(x => /^fr-/.test(x)).length === 4, r2);
}

/* ================= ⑪ 名簿から選ぶ ================= */
console.log('\n── 🔴 ⑪名簿から選べる／しぼれる／スクロールしても閉じない／もどれる ──');
{
  const r = await p.evaluate(async () => {
    /* 🔴 一覧をはみ出させて、本当にスクロールが要る状態にする（20人） */
    const 名 = ['田中 太郎', '鈴木 花子', '佐藤 次郎'];
    const list = [
      { id: 'u_a', uid: 'u_a', name: '田中 太郎', email: 'A.Tanaka@Example.com', dept: '整備' },
      { id: 'invite_9', name: '鈴木 花子', email: 'suzuki@example.com', dept: 'フロント' },
      { id: 'u_c', uid: 'u_c', name: '佐藤 次郎', email: 'sato@example.com' }
    ];
    for (let i = 0; i < 17; i++) list.push({ id: 'u_x' + i, uid: 'u_x' + i, name: '社員' + i, email: 'x' + i + '@example.com' });
    CFPower._setMembers(list);
    CFPower.open(true);
    document.querySelector('#cf-power-menu [data-do=fr-one-all]').click();
    await new Promise(r => setTimeout(r, 250));
    return {
      まだ開いている: document.getElementById('cf-power').classList.contains('on'),
      人数: document.querySelectorAll('#cf-power-menu [data-uid]').length,
      しぼる欄: !!document.getElementById('cf-power-find'),
      もどる: !!document.querySelector('#cf-power-menu [data-do=pick-back]'),
      見出し: (document.querySelector('#cf-power-menu .cf-power-head') || {}).textContent || ''
    };
  });
  ok('🔴 押しても閉じずに、名簿の一覧に変わる', r.まだ開いている && r.人数 === 20, r);
  ok('しぼる欄がある', r.しぼる欄, r);
  ok('もどるがある', r.もどる, r);
  ok('🔴 何を更新するかが見出しに出ている（全アプリ）', /全アプリ/.test(r.見出し), r.見出し);

  /* 🔴🔴 実話（2026-08-29）：一覧を指で送ろうとしただけでメニューが閉じ、下のほうの人を選べなかった。
     画面ぜんたいのスクロール見張りが、**一覧の中のスクロールまで拾って**いたのが原因。 */
  const rs = await p.evaluate(async () => {
    const box = document.querySelector('#cf-power-menu .cf-power-list');
    const はみ出している = box.scrollHeight > box.clientHeight + 4;
    box.scrollTop = 60;
    box.dispatchEvent(new Event('scroll', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    return {
      はみ出している,
      開いたまま: document.getElementById('cf-power').classList.contains('on'),
      送れた: box.scrollTop > 0,
      一覧が残っている: document.querySelectorAll('#cf-power-menu [data-uid]').length === 20
    };
  });
  ok('前提：一覧がはみ出していてスクロールが要る', rs.はみ出している, rs);
  ok('🔴🔴 一覧をスクロールしても閉じない', rs.開いたまま && rs.一覧が残っている, rs);
  ok('🔴 ちゃんと送れている', rs.送れた, rs);

  /* 画面そのもののスクロールでは、今までどおり閉じること（閉じなくなったら浮きっぱなしになる） */
  const rs2 = await p.evaluate(async () => {
    window.dispatchEvent(new Event('scroll'));
    await new Promise(r => setTimeout(r, 200));
    return document.getElementById('cf-power').classList.contains('on');
  });
  ok('🔴 画面そのものが動いた時は、今までどおり閉じる', rs2 === false, rs2);
  await p.evaluate(async () => {
    CFPower.open(true);
    document.querySelector('#cf-power-menu [data-do=fr-one-all]').click();
    await new Promise(r => setTimeout(r, 250));
  });

  const r2 = await p.evaluate(async () => {
    const f = document.getElementById('cf-power-find');
    f.value = '鈴木'; f.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 150));
    return [...document.querySelectorAll('#cf-power-menu [data-uid]')].map(e => e.getAttribute('data-uid'));
  });
  ok('🔴 名前でしぼれる', r2.length === 1 && r2[0] === 'invite_9', r2);

  /* しぼっている最中に外側の閉じるに食われないこと（入力欄を押しただけで閉じたら使えない） */
  const r3 = await p.evaluate(async () => {
    document.getElementById('cf-power-find').click();
    await new Promise(r => setTimeout(r, 150));
    return document.getElementById('cf-power').classList.contains('on');
  });
  ok('🔴 しぼる欄を押しても閉じない', r3);

  const r4 = await p.evaluate(async () => {
    document.querySelector('#cf-power-menu [data-do=pick-back]').click();
    await new Promise(r => setTimeout(r, 200));
    return {
      開いている: document.getElementById('cf-power').classList.contains('on'),
      項目: [...document.querySelectorAll('#cf-power-menu [data-do]')].map(e => e.getAttribute('data-do'))
    };
  });
  ok('🔴 もどるで元のメニューに戻る', r4.開いている && r4.項目.indexOf('fr-app') >= 0, r4);

  /* 「この画面だけ」で開いた時は、見出しもそちらになること */
  const r5 = await p.evaluate(async () => {
    document.querySelector('#cf-power-menu [data-do=fr-one-app]').click();
    await new Promise(r => setTimeout(r, 250));
    return (document.querySelector('#cf-power-menu .cf-power-head') || {}).textContent || '';
  });
  ok('🔴 「この画面」で開くと見出しもそうなる', /この画面/.test(r5), r5);
  await p.evaluate(() => CFPower.open(false));
}

/* ================= ⑫ 合図の中身（uid とメールの両方） ================= */
console.log('\n── 🔴🔴 ⑫合図には uid とメールの両方を書く＋当て先は4通り ──');
{
  const r = await p.evaluate(async () => {
    window.__書いた = null;
    let 書いた = 0;
    window.fb.currentCompanyId = 'test';
    window.fb.db = { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ set: (o) => { 書いた++; window.__書いた = o; return Promise.resolve(); } }) }) }) }) };
    CFPower.open(true);
    document.querySelector('#cf-power-menu [data-do=fr-one-all]').click();
    await new Promise(r => setTimeout(r, 200));
    document.querySelector('#cf-power-menu [data-uid=u_a]').click();
    await new Promise(r => setTimeout(r, 300));
    return { いきなり書いていない: 書いた === 0, 窓: [...document.querySelectorAll('button')].some(b => /更新する/.test(b.textContent || '')) };
  });
  ok('🔴🔴 押しただけでは合図を書かない（1回聞く）', r.いきなり書いていない, r);
  ok('🔴 誰あてか分かる窓が出る', r.窓, r);

  const r2 = await p.evaluate(async () => {
    const cands = [...document.querySelectorAll('button')].filter(b => /更新する|はい|OK/.test((b.textContent || '').trim()));
    const yes = cands[cands.length - 1];
    if (yes) yes.click();
    await new Promise(r => setTimeout(r, 400));
    return window.__書いた;
  });
  ok('🔴 「はい」で合図を1枚書く', !!r2, r2);
  ok('🔴🔴 uid が入っている', r2 && r2.uid === 'u_a', r2);
  ok('🔴🔴 メールが入っている（小文字にそろえて）', r2 && r2.email === 'a.tanaka@example.com', r2);
  ok('🔴 その人の全アプリあて（app=all）', r2 && r2.app === 'all', r2);
  ok('誰あてか名前も残す', r2 && r2.name === '田中 太郎', r2);

  /* 🔴 4通りめ＝「決めた人の、この画面だけ」。当て先が **このアプリの名前** になること。 */
  const r2b = await p.evaluate(async () => {
    window.__書いた = null;
    CFPower.open(true);
    document.querySelector('#cf-power-menu [data-do=fr-one-app]').click();
    await new Promise(r => setTimeout(r, 200));
    document.querySelector('#cf-power-menu [data-uid=u_a]').click();
    await new Promise(r => setTimeout(r, 300));
    const cands = [...document.querySelectorAll('button')].filter(b => /更新する|はい|OK/.test((b.textContent || '').trim()));
    const yes = cands[cands.length - 1]; if (yes) yes.click();
    await new Promise(r => setTimeout(r, 400));
    return { 書いた: window.__書いた, key: (document.querySelector('meta[name=app-key]') || {}).content || '' };
  });
  ok('🔴🔴 「決めた人の この画面」は、このアプリあてになる', r2b.書いた && r2b.書いた.app === r2b.key && !!r2b.key, r2b);
  ok('🔴 その時も uid とメールは入っている', r2b.書いた && r2b.書いた.uid === 'u_a' && r2b.書いた.email === 'a.tanaka@example.com', r2b.書いた);

  /* 🔴 招待から入った人＝書類のIDが uid ではない。それでもメールで当てられること。 */
  const r3 = await p.evaluate(async () => {
    window.__書いた = null;
    CFPower.open(true);
    document.querySelector('#cf-power-menu [data-do=fr-one-all]').click();
    await new Promise(r => setTimeout(r, 200));
    document.querySelector('#cf-power-menu [data-uid=invite_9]').click();
    await new Promise(r => setTimeout(r, 300));
    const cands = [...document.querySelectorAll('button')].filter(b => /更新する|はい|OK/.test((b.textContent || '').trim()));
    const yes = cands[cands.length - 1]; if (yes) yes.click();
    await new Promise(r => setTimeout(r, 400));
    return window.__書いた;
  });
  ok('🔴🔴 名簿のIDが uid でない人でも、メールで当てられる', r3 && r3.email === 'suzuki@example.com', r3);
}

/* ================= ⑬ 受け取る側：自分あての時だけ開き直す ================= */
console.log('\n── 🔴🔴🔴 ⑬自分あての合図でだけ開き直す ──');
{
  const 仕込み = await p.evaluate(() => {
    window.__reloads = 0;
    CFPower._setReload(() => { window.__reloads++; });
    window.fb.currentUser = { uid: 'u_a', email: 'A.Tanaka@Example.com' };
    window.fb.currentCompanyId = 'test';
    window.__cb = null;
    window.fb.db = { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({
      onSnapshot: (f) => { window.__cb = f; return () => {}; } }) }) }) }) };
    CFPower._watch();
    return !!window.__cb;
  });
  ok('見張りを張れた', 仕込み);

  /* ⚠ 本物は「1回の読み込みで読み直すのは1回まで」。試験では毎回そこを戻してから流す。
     （「1回まで」そのものは、下の ⑬-2 で別に確かめる） */
  const 流す = async (v) => p.evaluate(async (v) => {
    window.CFPower._busyReset();
    window.__cb({ exists: true, data: () => v });
    await new Promise(r => setTimeout(r, 1800));
    return window.__reloads;
  }, v);

  const n0 = await 流す({ at: 't1', app: 'all' });
  ok('🔴 開いた瞬間の値では開き直さない', n0 === 0, n0);

  const n1 = await 流す({ at: 't2', app: 'all', uid: 'u_b', email: 'b@example.com' });
  ok('🔴🔴 よその人あての合図では開き直さない', n1 === 0, n1);

  const n2 = await 流す({ at: 't3', app: 'all', uid: 'u_a', email: '' });
  ok('🔴🔴 自分あて（uid 一致）なら開き直す', n2 === 1, n2);

  const n3 = await 流す({ at: 't4', app: 'all', uid: '', email: 'a.tanaka@example.com' });
  ok('🔴🔴 自分あて（メール一致・大文字小文字は問わない）なら開き直す', n3 === 2, n3);

  const n4 = await 流す({ at: 't5', app: 'all' });
  ok('🔴 誰あてでもない（全員あて）なら開き直す', n4 === 3, n4);

  const n5 = await 流す({ at: 't6', app: 'mhs', uid: 'u_a' });
  ok('🔴 自分あてでも、よそのアプリの合図なら開き直さない', n5 === 3, n5);

  const n6 = await 流す({ at: 't6', app: 'all', uid: 'u_a' });
  ok('🔴 同じ時刻の合図を二度は拾わない', n6 === 3, n6);
}

/* ========== ⑬-2 1回の読み込みで、読み直すのは1回まで ========== */
/* 🔴 PitFlow が自前で持っていた守り（force-reload-pit.js の③）を、畳む時にこちらへ持ってきた。
   合図が続けて来ても暴れないこと。 */
console.log('\n── 🔴🔴 ⑬-2 1回の読み込みで、読み直すのは1回まで ──');
{
  const r = await p.evaluate(async () => {
    window.CFPower._busyReset();
    window.__reloads = 0;
    window.__cb({ exists: true, data: () => ({ at: 'w1', app: 'all' }) });
    await new Promise(r => setTimeout(r, 1800));
    const 一回目 = window.__reloads;
    window.__cb({ exists: true, data: () => ({ at: 'w2', app: 'all' }) });
    window.__cb({ exists: true, data: () => ({ at: 'w3', app: 'all' }) });
    await new Promise(r => setTimeout(r, 1800));
    return { 一回目, 最後: window.__reloads };
  });
  ok('🔴 1回目はちゃんと読み直す', r.一回目 === 1, r);
  ok('🔴🔴 続けて合図が来ても、二度は読み直さない', r.最後 === 1, r);
}

/* ========== ⑬-3 打ち込み中は待つ（最大60秒） ========== */
/* 🔴 これも PitFlow の守り（④）。**打ち込みの最中に画面を飛ばさない。**
   ⚠ そして「黙って待たない」＝待っていることを画面に出す（何も起きないように見えるのが一番こわい）。 */
console.log('\n── 🔴🔴 ⑬-3 打ち込み中は待つ（黙らずに待つ） ──');
{
  const r = await p.evaluate(async () => {
    window.CFPower._busyReset();
    window.__reloads = 0;
    const inp = document.createElement('input');
    inp.id = '__testtype'; inp.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(inp); inp.focus();
    window.__cb({ exists: true, data: () => ({ at: 'k1', app: 'all' }) });
    await new Promise(r => setTimeout(r, 1900));
    const n = document.getElementById('cf-power-note');
    return { 打ち込み中は飛ばない: window.__reloads === 0, 案内: n ? n.textContent : '' };
  });
  ok('🔴🔴 打ち込み中は画面を飛ばさない', r.打ち込み中は飛ばない, r);
  ok('🔴 黙って待たずに、待っていることを出す', /手が空いたら/.test(r.案内), r.案内);

  const r2 = await p.evaluate(async () => {
    document.getElementById('__testtype').blur();
    document.getElementById('__testtype').remove();
    await new Promise(r => setTimeout(r, 4200));   /* 2秒ごとに見に来る＋1.5秒待って読み直す */
    return window.__reloads;
  });
  ok('🔴🔴 手が空いたら、ちゃんと読み直す', r2 === 1, r2);
  await p.evaluate(() => { CFPower._setReload(null); CFPower._busyReset(); });
}

/* ========== ⑬-4 会社IDの置き場がバラバラでも死なない ========== */
/* 🔴🔴 2026-08-29 に見つけた穴：`fb.currentCompanyId` を入れているアプリと、
   `const COMPANY_ID = …` を script の中で宣言しているだけのアプリがある（const は window に乗らない）。
   後者（CoreMembers・MHS・CoreTemplate）では、そのままだと強制更新が**黙って死ぬ**。 */
console.log('\n── 🔴🔴 ⑬-4 会社IDが fb に入っていない画面でも、合図は出せる ──');
{
  const r = await p.evaluate(async () => {
    window.__書いた = null;
    window.fb.currentUser = { uid: window.CFPower.MASTER_UID, displayName: 'マスター' };
    window.fb.currentCompanyId = null;          /* ← MHS・CoreMembers・CoreTemplate と同じ状態 */
    window.fb.db = { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({
      set: (o) => { window.__書いた = o; return Promise.resolve(); } }) }) }) }) };
    CFPower.force('app');
    await new Promise(r => setTimeout(r, 300));
    const cands = [...document.querySelectorAll('button')].filter(b => /更新する|はい|OK/.test((b.textContent || '').trim()));
    const yes = cands[cands.length - 1]; if (yes) yes.click();
    await new Promise(r => setTimeout(r, 400));
    const n = document.getElementById('cf-power-note');
    return { 書いた: window.__書いた, 案内: n ? n.textContent : '' };
  });
  ok('🔴🔴 会社IDが fb に無くても、合図をちゃんと書く', !!r.書いた, r);
  ok('🔴 「繋がっていません」で黙って終わらない', !/繋がっていない/.test(r.案内), r.案内);
  ok('🔴 外から呼べる入口（CFPower.force）が生きている', !!r.書いた && r.書いた.app === 'pitflow', r.書いた);
}

/* ========== ⑬-5 PitFlow の自前の強制更新は畳んだ（二重に持たない） ========== */
console.log('\n── 🔴 ⑬-5 自前の強制更新は畳んで、共通の1本にした ──');
{
  const ix = fs.readFileSync('index.html', 'utf8');
  ok('🔴 force-reload-pit.js を読み込んでいない', !/force-reload-pit\.js/.test(ix));
  ok('🔴 本体のファイルが残っていない', !fs.existsSync('js/force-reload-pit.js'));
  const st = fs.readFileSync('js/settings.js', 'utf8');
  ok('🔴 設定ページのボタンは共通の入口を呼ぶ', /CFPower\.force\(/.test(st), '');
  ok('🔴 設定ページに自前の呼び出しが残っていない', !/pitForceReload/.test(st));
  const db = fs.readFileSync('js/db-pit.js', 'utf8');
  ok('🔴 db-pit.js からも配線が消えている', !/pitForceReload/.test(db));
  const r = await p.evaluate(() => ({
    自前が残っていない: !window.pitForceReloadCheck && !window.pitForceReloadFire,
    共通の入口がある: !!(window.CFPower && typeof window.CFPower.force === 'function')
  }));
  ok('🔴🔴 画面の中にも自前の仕掛けが残っていない', r.自前が残っていない, r);
  ok('🔴 共通の入口がある', r.共通の入口がある, r);
}

/* ================= ⑭ JSエラー ================= */
console.log('\n── ⑭JSエラー ──');
ok('🔴 最後までJSエラー0', errs.length === 0, errs.slice(0, 3));

console.log('\n────────────────────────────');
console.log(fail === 0 ? `  ✅ 全部そろっています（${pass}件）` : `  ❌ ${fail}件 赤／${pass}件 緑`);
if (errs.length) console.log('  JSエラー:', errs.slice(0, 5));
await b.close();
process.exit(fail === 0 ? 0 : 1);
