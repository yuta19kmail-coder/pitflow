/* PitFlow v1.42.0（v1.43.0 で置き場所が変わったので追従）── フロー（進捗ログ）のアイコンが文字で出てしまう不具合のテスト
   -------------------------------------------------------------------
   ◎考え方
     **PitFlow 本体（index.html）をサンプルモードで丸ごと開き**、入庫カードのフローを実際に描く。
     🔴 見るのは「**<i data-ic=… という文字が画面に出ていないこと**」。
        ・アクションのチップ（よくあるアクション）
        ・タイムライン（すでに保存されている古い記録も含む）
        ・予約詳細（ポップアップ）のフロー
     ⚠ この不具合は「保存データや見出しに HTML を書くと esc() を通って文字で出る」型。
        CoreTemplate v1.15.1 と同じ落とし穴なので、ここで見張る。
     ⚠ v1.43.0 で置き場所が変わった。**チップ（用件を足す）は「カード詳細」のフロー欄**、
        **編集画面のフローは「記録を直す」**。ここでは両方まとめて「タグの文字が出ていない」を見る。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8954      ← 別ウィンドウ
     node test_flow_icons.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:8954/index.html?demo=1');
await p.waitForFunction('window.state && typeof window.openCard === "function"', null, { timeout: 20000 });
await p.waitForTimeout(600);

/* 🔴 古い作りで保存された記録（タグの文字が入っている）を1件仕込む＝直しが効いているか見る */
const CID = await p.evaluate(() => {
  const c = {
    id: 'flowtest1', resNo: 'F1', customer: 'フロー 太郎', car: 'アクア', maker: 'トヨタ',
    tel: '090-0000-0000', reserveDate: window.ymd(new Date()), reserveTime: '10:00',
    status: 'check', boardId: 'default', division: 'div1', workTypes: [], dropType: 'wait',
    log: [
      { label: '<i data-ic=phone data-ics=16></i> こちらから電話 → 留守（折り返し待ち）',
        text:  '<i data-ic=phone data-ics=16></i> こちらから電話 → 留守（折り返し待ち）',
        at: Date.now() - 86400000, staff: '椎名', by: '椎名', manual: true },
      { label: '点検待ち へ', text: '点検待ち へ', at: Date.now() - 3600000, staff: '' }
    ]
  };
  state.cards.push(c);
  return c.id;
});

console.log('\n── ⓪ 予約詳細（ポップアップ・読むだけの画面）のフロー ──');
{
  await p.evaluate(id => window.openCard(id), CID);           /* mode 省略＝ポップアップ */
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    const t = Array.from(document.querySelectorAll('#modal-detail .cv-tab')).find(e => /フロー/.test(e.textContent));
    if (t) t.click();
  });
  await p.waitForTimeout(300);
  const t = await p.evaluate(() => { const e = document.getElementById('cv-p-flow'); return e ? e.textContent : ''; });
  ok('フローの面が出ている', t.length > 0, t.slice(0, 40));
  ok('🔴 「data-ic」の文字が出ていない', t.indexOf('data-ic') < 0, t.slice(0, 120));
  ok('古い記録の言葉は残っている', t.indexOf('こちらから電話 → 留守') >= 0, t.slice(0, 120));
  ok('🔴 古い記録もアイコンとして描かれている',
     (await p.evaluate(() => {
        const el = Array.from(document.querySelectorAll('#cv-p-flow .cv-ft')).find(e => e.textContent.indexOf('こちらから電話') >= 0);
        return el ? el.querySelectorAll('svg').length : 0;
     })) >= 1);
}

console.log('\n── ① アクションのチップ（v1.43.0 で詳細に引っ越した） ──');
{
  const chips = await p.evaluate(() => Array.from(document.querySelectorAll('#cv-p-flow .pf-flowchip')).map(e => e.textContent.trim()));
  ok('チップが8つ出ている', chips.length === 8, chips.length);
  ok('🔴 「data-ic」の文字が出ていない', chips.every(t => t.indexOf('data-ic') < 0), chips.filter(t => t.indexOf('data-ic') >= 0));
  ok('🔴 「<i」の文字も出ていない', chips.every(t => t.indexOf('<i') < 0), chips.filter(t => t.indexOf('<i') >= 0));
  ok('言葉はちゃんと出ている', chips.some(t => t.indexOf('こちらから電話 → 留守') >= 0), chips.slice(0, 3));
  const svgs = await p.evaluate(() => Array.from(document.querySelectorAll('#cv-p-flow .pf-flowchip')).map(e => e.querySelectorAll('svg').length));
  ok('🔴 チップに線画アイコンが入っている', svgs.length === 8 && svgs.every(n => n >= 1), svgs);
  ok('分からないアイコンの点線枠（ic-miss）が出ていない',
     (await p.evaluate(() => document.querySelectorAll('#cv-p-flow .pf-flowchip .ic-miss').length)) === 0);
}

console.log('\n── ② チップを押して記録する＝保存される文字にタグが混ざらない ──');
{
  await p.evaluate(() => document.querySelectorAll('#cv-p-flow .pf-flowchip')[3].click());   /* 来店・相談 */
  await p.waitForTimeout(500);
  const added = await p.evaluate(id => {
    const l = state.cards.find(c => c.id === id).log;
    return l[l.length - 1].label;
  }, CID);
  ok('🔴 保存された文字は言葉だけ', added === '来店・相談', added);
  ok('タグが入っていない', added.indexOf('data-ic') < 0 && added.indexOf('<i') < 0, added);
  ok('画面にもちゃんと出る',
     (await p.evaluate(() => document.getElementById('cv-p-flow').textContent)).indexOf('来店・相談') >= 0);
}

/* ここから「編集」＝入庫カードの編集フォームのフロータブ */
await p.evaluate(id => window.openCardEditForm(id), CID);
await p.waitForTimeout(500);
await p.evaluate(() => { if (window.switchCardTab) switchCardTab('flow'); });
await p.waitForTimeout(400);

const bodyText = () => p.evaluate(() => {
  const e = document.getElementById('md-body-modal');
  return e ? e.textContent : '';
});

console.log('\n── ③ 編集画面のフロー＝記録を直す表（v1.43.0） ──');
{
  const rows = await p.evaluate(() => document.querySelectorAll('.pf-ferow').length);
  ok('編集の表が出ている', rows >= 2, rows);
  const ttl = await p.evaluate(() => Array.from(document.querySelectorAll('.pf-fettl')).map(e => e.textContent.trim()));
  ok('🔴 見出しに「data-ic」の文字が出ていない', ttl.every(t => t.indexOf('data-ic') < 0), ttl);
  const vals = await p.evaluate(() => Array.from(document.querySelectorAll('.pf-fettlin')).map(e => e.value));
  ok('🔴 直す入力欄にもタグが出ていない（古い記録の分も外して出す）',
     vals.every(v => v.indexOf('data-ic') < 0 && v.indexOf('<i') < 0), vals);
  ok('古い記録の言葉は残っている', vals.some(v => v.indexOf('こちらから電話 → 留守') >= 0), vals);
  ok('🔴 データそのものは書き換えていない',
     (await p.evaluate(id => state.cards.find(c => c.id === id).log[0].label.indexOf('<i data-ic=phone') === 0, CID)));
}

console.log('\n── ④ 画面のどこにも「data-ic」の文字が出ていない ──');
{
  const t = await bodyText();
  ok('🔴 入庫カードの編集画面ぜんぶ', t.indexOf('data-ic') < 0);
  ok('「<i」の文字も無い', t.indexOf('<i ') < 0);
}

console.log('\n── ⑤ ほかのタブに切り替えても文字化けしない ──');
{
  for (const tab of ['basic', 'maint', 'office']){
    await p.evaluate(t => switchCardTab(t), tab);
    await p.waitForTimeout(200);
    const t = await bodyText();
    ok(tab + ' タブに「data-ic」の文字が出ていない', t.indexOf('data-ic') < 0);
  }
}

console.log('\n── ⑥ 二度と同じ落とし穴に落ちないように（配線チェック） ──');
{
  /* ⚠ v1.43.0 で一覧は js/flow-pit.js へ引っ越した。「QUICK = [ … ]」の**中だけ**を見る。 */
  const fp = fs.readFileSync('js/flow-pit.js', 'utf8');
  ok('🔴 よくあるアクションに HTML を書いていない', !/var QUICK = \[[^\]]*<i data-ic/.test(fp));
  ok('印はアイコン名（ic）で持っている', /\{ ic: 'phone',\s*label:/.test(fp));
  ok('保存するのは言葉だけ（add に渡すのは q.label）', /add\(cardId, q\.label, ns\)/.test(fp));
  ok('直す入力欄はタグを外して出す', /function plainText\(e\)/.test(fp));
  const src = fs.readFileSync('js/card-tabs.js', 'utf8');
  ok('タイムラインは icoText を通している', /window\.icoText \? icoText\(title\)/.test(src));
  ok('編集側に一覧を二重に持っていない', !/const FLOW_QUICK = \[/.test(src));
  const cv = fs.readFileSync('js/card-view.js', 'utf8');
  ok('予約詳細のフローも icoText を通している', /window\.icoText \? icoText\(e\.text \|\| e\.label/.test(cv));
  const idx = fs.readFileSync('index.html', 'utf8');
  /* ⚠ 版は上がっていくので数字は固定しない（決め打ちだと毎回のリリースで落ちる）。
     「ログイン画面の版・トップバーの版・meta app-version の3つがそろっているか」だけ見る。 */
  const _mVer = (idx.match(/<div class="login-ver">v([\d.]+)<\/div>/) || [])[1] || '';
  const _tVer = (idx.match(/<span class="ver">v([\d.]+)<\/span>/) || [])[1] || '';
  const _aVer = (idx.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('画面の版2か所と app-version がそろっている', !!_mVer && _mVer === _tVer && _mVer === _aVer, [_mVer, _tVer, _aVer]);
  ok('JSエラー0', errs.length === 0, errs.slice(0, 5));
}

await p.evaluate(() => switchCardTab('flow'));
await p.waitForTimeout(300);
await p.locator('#modal-detail').screenshot({ path: 'shot_flow_icons.png' });
console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
