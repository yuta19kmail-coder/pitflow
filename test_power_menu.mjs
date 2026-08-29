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

   ◎この見張りが守るもの
     🔴 ① 右上が [アバター][名前][同期][⏻] になっている（？とログアウトの文字が消えている）
     🔴 ② 押すとメニューが出る＝更新／画面を閉じる／ヘルプ／ログアウト
     🔴 ③ **ふつうの人にはマスターの2つを出さない**
     🔴 ④ **マスターの時だけ**「このアプリを全端末で更新」「全アプリを全端末で更新」が出る
     🔴 ⑤ ログアウトは**必ず1回聞く**（いきなり出ていかない）
     🔴 ⑥ 「はい」で**アプリ本来のログアウト**が動く（＝動きを奪えている）
     🔴 ⑦ ヘルプを押すと**アプリ本来のヘルプ**が開く
     🔴 ⑧ 外側クリック・Esc で閉じる
     🔴 ⑨ 「画面を閉じる」が効かない時、**黙らずに案内を出す**
     🔴 ⑩ **決めた人の端末だけ更新**がマスターにだけ出る（2026-08-29 追加）
     🔴 ⑪ 名簿から選べる／しぼれる／もどれる
     🔴 ⑫ 合図に **uid とメールの両方**が入る（名簿のIDが uid とは限らないため）
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
  ok('🔴🔴 このアプリを全端末で更新 が出る', r.項目.indexOf('fr-app') >= 0, r.項目);
  ok('🔴🔴 全アプリを全端末で更新 が出る', r.項目.indexOf('fr-all') >= 0, r.項目);
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
console.log('\n── 🔴🔴 ⑩「決めた人の端末だけ更新」はマスターだけ ──');
{
  const r = await p.evaluate(() => {
    window.fb = window.fb || {};
    window.fb.currentUser = { uid: 'dareka', email: 'x@y.jp' };
    CFPower.open(false); CFPower.open(true);
    return [...document.querySelectorAll('#cf-power-menu [data-do]')].map(e => e.getAttribute('data-do'));
  });
  ok('🔴🔴 ふつうの人には出さない', r.indexOf('fr-one') < 0, r);

  const r2 = await p.evaluate(() => {
    window.fb.currentUser = { uid: window.CFPower.MASTER_UID, displayName: 'マスター', email: 'yuta@kobamo.jp' };
    CFPower.open(false); CFPower.open(true);
    return [...document.querySelectorAll('#cf-power-menu [data-do]')].map(e => e.getAttribute('data-do'));
  });
  ok('🔴🔴 マスターには出る', r2.indexOf('fr-one') >= 0, r2);
}

/* ================= ⑪ 名簿から選ぶ ================= */
console.log('\n── 🔴 ⑪名簿から選べる／しぼれる／もどれる ──');
{
  const r = await p.evaluate(async () => {
    CFPower._setMembers([
      { id: 'u_a', uid: 'u_a', name: '田中 太郎', email: 'A.Tanaka@Example.com', dept: '整備' },
      { id: 'invite_9', name: '鈴木 花子', email: 'suzuki@example.com', dept: 'フロント' },
      { id: 'u_c', uid: 'u_c', name: '佐藤 次郎', email: 'sato@example.com' }
    ]);
    CFPower.open(true);
    document.querySelector('#cf-power-menu [data-do=fr-one]').click();
    await new Promise(r => setTimeout(r, 250));
    return {
      まだ開いている: document.getElementById('cf-power').classList.contains('on'),
      人数: document.querySelectorAll('#cf-power-menu [data-uid]').length,
      しぼる欄: !!document.getElementById('cf-power-find'),
      もどる: !!document.querySelector('#cf-power-menu [data-do=pick-back]')
    };
  });
  ok('🔴 押しても閉じずに、名簿の一覧に変わる', r.まだ開いている && r.人数 === 3, r);
  ok('しぼる欄がある', r.しぼる欄, r);
  ok('もどるがある', r.もどる, r);

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
  await p.evaluate(() => CFPower.open(false));
}

/* ================= ⑫ 合図の中身（uid とメールの両方） ================= */
console.log('\n── 🔴🔴 ⑫合図には uid とメールの両方を書く ──');
{
  const r = await p.evaluate(async () => {
    window.__書いた = null;
    let 書いた = 0;
    window.fb.currentCompanyId = 'test';
    window.fb.db = { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ set: (o) => { 書いた++; window.__書いた = o; return Promise.resolve(); } }) }) }) }) };
    CFPower.open(true);
    document.querySelector('#cf-power-menu [data-do=fr-one]').click();
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

  /* 🔴 招待から入った人＝書類のIDが uid ではない。それでもメールで当てられること。 */
  const r3 = await p.evaluate(async () => {
    window.__書いた = null;
    CFPower.open(true);
    document.querySelector('#cf-power-menu [data-do=fr-one]').click();
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

  const 流す = async (v) => p.evaluate(async (v) => {
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

  await p.evaluate(() => CFPower._setReload(null));
}

/* ================= ⑭ JSエラー ================= */
console.log('\n── ⑭JSエラー ──');
ok('🔴 最後までJSエラー0', errs.length === 0, errs.slice(0, 3));

console.log('\n────────────────────────────');
console.log(fail === 0 ? `  ✅ 全部そろっています（${pass}件）` : `  ❌ ${fail}件 赤／${pass}件 緑`);
if (errs.length) console.log('  JSエラー:', errs.slice(0, 5));
await b.close();
process.exit(fail === 0 ? 0 : 1);
