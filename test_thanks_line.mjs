/* ============================================================
   test_thanks_line.mjs
   ダッシュボードの「お礼LINE 送信リスト」を見張る。

   きっかけ：ゆうた 2026-08-28
     「ダッシュボードのカスタムBOXの中に **今日のお礼LINE送信リスト** を作成して欲しい。
       完TEL関門時にLINEありになっている人で、今日返車した人の一覧。
       特に難しいカウント式みたいのは要らなくて、**チェックボックスで送ったか送ってないか**
       確認できるぐらいでOK」
     （日をまたいだら）「**未送は残す**」／「**日づけで切り替えができるか**」

   いまの決めごと（v2.18.0）：
     ・誰が対象か＝`pitThanksNeeded`（pit-share.js）1本
       　お礼LINE「要」× LINEが繋がっている × 社内車両・売上なしでない
     ・送った印＝`thanksLineSent`（要／不要の `noThanksLine` とは**別物**）
     ・書き込みは `pitThanksSetSent` 1本（フローに1行残す・対象外には書けない）
     ・その日より前の**未送は3日分だけ下に残す**（夜中に送り忘れが黙って消えない）
     ・日付は ◀ ▶ で切り替え（見ている日は保存しない）

   使い方：
     python3 -m http.server 8968 --directory . &
     PORT=8968 node test_thanks_line.mjs
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const cp   = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = process.env.PORT || 8968;
let OK = 0, NG = 0;
function ok(name, cond, extra){
  if (cond) { OK++; console.log('  ✅ ' + name); }
  else { NG++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

console.log('\n── 🧭 物差しは1本か ──');
{
  const ps = fs.readFileSync(path.join(process.cwd(), 'js', 'pit-share.js'), 'utf8');
  const md = fs.readFileSync(path.join(process.cwd(), 'js', 'mydash.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('pit-share.js が対象の物差しを出している', /w\.pitThanksNeeded\s*=/.test(ps));
  ok('pit-share.js が書き込みの1本を出している', /w\.pitThanksSetSent\s*=/.test(ps));
  ok('🔴 ダッシュボードが「要／不要」を直に見ていない（物差しを通す）', !/noThanksLine/.test(md), '');
  ok('🔴 ダッシュボードが LINEの状態を直に見ていない', !/lineStatus/.test(md), '');
  ok('🔴 ダッシュボードが送った印を直に書いていない', !/thanksLineSent\s*=/.test(md), '');
  ok('🔴 「その日に返した車」の数え方が1本（mdReturnedOn）',
     /function mdReturnedOn/.test(md) && (md.match(/status === 'returned' && \(c\.completedAt ===/g) || []).length === 1);
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.renderMyDash && window.pitThanksNeeded', null, { timeout: 25000 });
await p.waitForTimeout(600);

/* 土台。⚠ ナンバーは顧客台帳に無いものにする＝カードの写し（lineStatus）で見る道を通す */
const T = await p.evaluate(() => {
  const ymdL = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const t = new Date(); t.setHours(0,0,0,0);
  const y = new Date(t); y.setDate(y.getDate() - 1);
  const tStr = ymdL(t), yStr = ymdL(y);
  const mk = (id, date, name, o) => Object.assign({
    id: id, resNo: 'X-' + id, status: 'returned', completedAt: date, reserveDate: date, returnDate: date,
    boardId: 'default', customer: name, car: 'テスト車', plate: 'TEST 999 あ 99-0' + id.slice(-1),
    workType: 'general', amountFinal: 10000, lineStatus: 'ok', noThanksLine: false
  }, o || {});
  state.cards = (state.cards || []).filter(c => String(c.id).indexOf('TX-') !== 0);
  state.cards.push(mk('TX-1', tStr, 'あさひ 一郎'));                                   /* 対象 */
  state.cards.push(mk('TX-2', tStr, 'いずみ 二郎', { noThanksLine: true }));            /* 不要 */
  state.cards.push(mk('TX-3', tStr, 'うえだ 三郎', { lineStatus: '' }));                /* 未案内 */
  state.cards.push(mk('TX-4', tStr, 'えの 四郎',   { lineStatus: 'ng' }));              /* お断り */
  state.cards.push(mk('TX-5', tStr, 'おかだ 五郎', { noSale: true }));                  /* 売上なし */
  state.cards.push(mk('TX-6', tStr, 'かわい 六郎', { status: 'workDone', completedAt: '' })); /* まだ返していない */
  state.cards.push(mk('TX-7', yStr, 'きくち 七郎'));                                    /* 昨日・未送 */
  state.cards.push(mk('TX-8', yStr, 'くらた 八郎', { thanksLineSent: true, thanksLineSentAt: '8/27 10:00' })); /* 昨日・送信済 */
  /* BOXを1枚だけ置いた画面にする（保存はしない＝画面の中だけ） */
  const m = state.settings.myDash;
  window.__mdBak = JSON.stringify(m || null);
  state.settings.myDash = { v: 2, active: 0, presets: [{ name: '試験', layout: [{ e: 'thanksLine', s: 'l' }] }] };
  showView('mydash'); renderMyDash();
  return { tStr, yStr };
});
await p.waitForTimeout(400);

const rows = () => p.$$eval('.thx-row', els => els.map(e => ({
  id: (e.getAttribute('onclick') || '').replace(/.*openDetail\('([^']+)'\).*/, '$1'),
  txt: e.textContent.replace(/\s+/g, ' ').trim(),
  on: e.className.indexOf('on') >= 0
})));

console.log('\n── 📋 今日のリスト ──');
{
  const r = await rows();
  const ids = r.map(x => x.id);
  ok('🔴 LINEありで今日返した人だけが出る（TX-1）', ids.indexOf('TX-1') >= 0, ids);
  ok('「不要」の人は出ない', ids.indexOf('TX-2') < 0, ids);
  ok('LINE未案内の人は出ない', ids.indexOf('TX-3') < 0, ids);
  ok('LINEお断りの人は出ない', ids.indexOf('TX-4') < 0, ids);
  ok('売上なしの車は出ない', ids.indexOf('TX-5') < 0, ids);
  ok('まだ返していない車は出ない', ids.indexOf('TX-6') < 0, ids);
  ok('🔴 昨日の未送は「まだ送っていない」に出る（TX-7）', ids.indexOf('TX-7') >= 0, ids);
  ok('昨日でも送信済は出ない（TX-8）', ids.indexOf('TX-8') < 0, ids);
  const backH = await p.$$eval('.thx-back-h', els => els.map(e => e.textContent));
  ok('「まだ送っていない」の見出しに件数が出る', backH.length === 1 && backH[0].indexOf('1件') >= 0, backH);
  const bar = await p.$eval('.thx-bar', e => e.textContent);
  ok('日付の切り替えが出ていて、はじめは今日', bar.indexOf('（今日）') >= 0, bar);
  ok('今日を見ている間は「今日へ」を出さない', (await p.$$('.thx-today')).length === 0);
}

console.log('\n── ☑ チェック（送った・送っていない） ──');
{
  await p.$$eval('.thx-row', els => {
    const r = els.find(e => (e.getAttribute('onclick') || '').indexOf('TX-1') >= 0);
    r.querySelector('.thx-cb').click();
  });
  await p.waitForTimeout(300);
  const c = await p.evaluate(() => {
    const x = state.cards.find(v => v.id === 'TX-1');
    return { sent: !!x.thanksLineSent, at: x.thanksLineSentAt || '', no: !!x.noThanksLine,
             log: (x.log || []).map(l => l.label).join('|') };
  });
  ok('🔴 押すと「送った」印が付く', c.sent === true, c);
  ok('いつ押したかが残る', /\d+\/\d+ \d\d:\d\d/.test(c.at), c);
  ok('🔴 フローに1行残る', c.log.indexOf('お礼LINEを送った') >= 0, c.log);
  ok('🔴 「要／不要」は1文字も変わらない（別物）', c.no === false, c);
  const r = await rows();
  ok('画面のチェックが入る', (r.find(x => x.id === 'TX-1') || {}).on === true, r);
  const head = await p.$eval('.md-lnum', e => e.textContent);
  ok('見出しの「まだ送っていない」が減る', head.indexOf('0') === 0, head);

  /* もう一度押すと外れる */
  await p.$$eval('.thx-row', els => {
    const r = els.find(e => (e.getAttribute('onclick') || '').indexOf('TX-1') >= 0);
    r.querySelector('.thx-cb').click();
  });
  await p.waitForTimeout(300);
  const c2 = await p.evaluate(() => {
    const x = state.cards.find(v => v.id === 'TX-1');
    return { sent: !!x.thanksLineSent, at: x.thanksLineSentAt || '', log: (x.log || []).map(l => l.label).join('|') };
  });
  ok('もう一度押すと外れる', c2.sent === false && c2.at === '', c2);
  ok('外したことも残る', c2.log.indexOf('お礼LINEの「送った」を外した') >= 0, c2.log);
}

console.log('\n── 🚫 対象外には書けない（画面から消すだけにしない） ──');
{
  const r = await p.evaluate(() => {
    const res = {};
    ['TX-2','TX-3','TX-4','TX-5'].forEach(id => {
      const c = state.cards.find(v => v.id === id);
      res[id] = { ret: pitThanksSetSent(c, true), sent: !!c.thanksLineSent };
    });
    return res;
  });
  ok('🔴 対象外の人は、直に呼んでも印が付かない',
     Object.keys(r).every(k => r[k].ret === false && r[k].sent === false), r);
}

console.log('\n── 🗓 日づけの切り替え ──');
{
  await p.evaluate(() => window.mydThanksDay(-1));
  await p.waitForTimeout(300);
  const bar = await p.$eval('.thx-bar', e => e.textContent);
  ok('◀ で前の日へ動く', bar.indexOf('（今日）') < 0, bar);
  ok('今日でない時だけ「今日へ」が出る', (await p.$$('.thx-today')).length === 1);
  const ids = (await rows()).map(x => x.id);
  ok('🔴 その日に返した人が上に出る（昨日＝TX-7）', ids.indexOf('TX-7') >= 0, ids);
  await p.evaluate(() => window.mydThanksDay(0));
  await p.waitForTimeout(300);
  ok('「今日へ」で戻る', (await p.$eval('.thx-bar', e => e.textContent)).indexOf('（今日）') >= 0);
  ok('見ている日は保存しない（設定に書いていない）',
     (await p.evaluate(() => JSON.stringify(state.settings.myDash))).indexOf('thxDay') < 0);
}

console.log('\n── 📤 返車BOXの数え方を変えていない ──');
{
  const n = await p.evaluate((tStr) => {
    return state.cards.filter(c => !(window.pitCardNoSale && pitCardNoSale(c)) && c.status === 'returned'
      && (c.completedAt === tStr || c.returnDate === tStr)).length;
  }, T.tStr);
  const shown = await p.evaluate(() => {
    state.settings.myDash.presets[0].layout = [{ e: 'returnout', s: 'l', v: 'both' }];
    renderMyDash();
    const el = document.querySelector('.md-kpi .md-sub');
    return el ? el.textContent : '';
  });
  await p.waitForTimeout(200);
  ok('返車BOXの「返車済」が今までどおり数えられている', shown.indexOf('返車済 ' + n + '台') >= 0, { shown, n });
}

console.log('\n── 🧯 JSエラー ──');
ok('JSエラーが1つも出ていない', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log('\n===== ' + OK + ' OK / ' + NG + ' NG =====');
process.exit(NG ? 1 : 0);
