/* PitFlow v1.110.0 ── エラー番号（PF-0412）の見張り
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-17）
     🗣「全てのエラー系のメッセージに固有のエラー番号を付けたい。
     　　もう俺以外もバンバン使ってるから、エラーコードあった方が話しやすいでしょ？」

   ◎ここで見張ること
     🔴 番号が**重複していない**（同じ番号が2つの意味を持たない＝台帳が嘘にならない）
     🔴 コードの中で使っている番号が、**全部 台帳に載っている**
     🔴 台帳に載っているのに**どこからも使われていない**番号が無い（消し忘れ・打ち間違い）
     🔴 番号の形が `PF-` ＋4桁でそろっている
     🔴 実物で：トーストの末尾に番号の札が出て、**押すとコピーできる**
     🔴 実物で：窓（注意・確認）の中にも番号が出る
     🔴 成功のお知らせには番号を付けていない

   ◎おまけ
     走らせると **`PitFlow_エラー番号一覧.html`（一覧表）を作り直す**。
     ＝台帳（errcode-pit.js）とズレようがない。手で書かないこと。

   ◎使い方
     python3 -m http.server 8998      ← 別ウィンドウ
     PORT=8998 node test_errcode.mjs                                     */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8998;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

/* ================= ① ソースだけで分かること ================= */
console.log('\n── 📒 台帳とコードが合っているか ──');

const reg = fs.readFileSync('js/errcode-pit.js', 'utf8');
const ledger = [...reg.matchAll(/\['(PF-\d{4})','([^']*)','([^']*)','([^']*)','([^']*)'\]/g)]
  .map(m => ({ code: m[1], area: m[2], what: m[3], where: m[4], how: m[5] }));
ok('台帳が読める（' + ledger.length + '件）', ledger.length > 30, ledger.length);

const dup = ledger.map(r => r.code).filter((c, i, a) => a.indexOf(c) !== i);
ok('🔴 番号が重複していない', dup.length === 0, dup);

const badForm = ledger.map(r => r.code).filter(c => !/^PF-\d{4}$/.test(c));
ok('🔴 番号の形が PF-＋4桁でそろっている', badForm.length === 0, badForm);

/* コードの中で実際に使われている番号 */
const files = fs.readdirSync('js').filter(f => f.endsWith('.js') && f !== 'errcode-pit.js' && f !== 'coreflow-errcode.js');
const used = new Map();
/* ⚠ 説明書き（コメント）の中の例を数えない。落としてから探す。 */
const noComment = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
files.forEach(f => {
  const s = noComment(fs.readFileSync('js/' + f, 'utf8'));
  [...s.matchAll(/'(PF-\d{4})'/g)].forEach(m => {
    if (!used.has(m[1])) used.set(m[1], []);
    used.get(m[1]).push(f);
  });
});
const known = new Set(ledger.map(r => r.code));
const missing = [...used.keys()].filter(c => !known.has(c));
ok('🔴 使っている番号は全部 台帳にある', missing.length === 0, missing);

const unused = [...known].filter(c => !used.has(c));
ok('🔴 台帳にあるのに使われていない番号が無い', unused.length === 0, unused);

/* 同じ番号を2か所から出していないか（＝意味がぼやける） */
const twice = [...used.entries()].filter(([, fs2]) => fs2.length > 1).map(([c, fs2]) => c + ':' + fs2.join(','));
ok('同じ番号を2か所から出していない', twice.length === 0, twice);

/* 成功のお知らせに番号を付けていないか（抜き取り） */
const okWords = ['保存しました', '登録しました', '入れました', '完了にしました', '반'];
let leaked = [];
files.forEach(f => {
  const s = noComment(fs.readFileSync('js/' + f, 'utf8'));
  const re = /(pitToast|showToast)\s*\(\s*'([^']{2,60})'\s*,\s*'(PF-\d{4})'/g;
  let m;
  while ((m = re.exec(s))) {
    if (/(保存しました|登録しました|完了にしました|入れました)$/.test(m[2])) leaked.push(f + ':' + m[2]);
  }
});
ok('成功のお知らせに番号を付けていない', leaked.length === 0, leaked);

/* ================= ② 実物で動くか ================= */
console.log('\n── 🖥 実物（デモ版）で ──');
const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
await p.context().grantPermissions(['clipboard-read', 'clipboard-write']);
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.CFErr && window.pitToast && window.pitAlert', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

ok('🔴 台帳が共通部品に登録できている', await p.evaluate(() => CFErr.all().length) === ledger.length);
ok('番号から中身を引ける', await p.evaluate(() => { const i = CFErr.info('PF-4002'); return !!(i && i.what && i.where && i.how); }));
ok('知らない番号は null', await p.evaluate(() => CFErr.info('PF-9999') === null));

/* トースト */
await p.evaluate(() => pitToast('やめました', 'PF-4002'));
await p.waitForTimeout(300);
const t = await p.evaluate(() => {
  const el = document.getElementById('pit-toast');
  const c = el && el.querySelector('.cf-ec');
  return { text: el ? el.textContent : '', chip: c ? c.textContent : null, pe: c ? getComputedStyle(c).pointerEvents : null,
           col: el ? getComputedStyle(el).flexDirection : null, align: c ? getComputedStyle(c).alignSelf : null };
});
ok('🔴 トーストに error：番号 が出る（B案）', t.chip === 'error：PF-4002', t);
  ok('🔴 番号は2行目・右端（B案）', t.col === 'column' && t.align === 'flex-end', t);
ok('🔴 番号だけは押せる（トースト本体は素通り）', t.pe === 'auto', t.pe);

await p.click('#pit-toast .cf-ec');
await p.waitForTimeout(300);
ok('🔴 押すと番号をコピーする', await p.evaluate(() => navigator.clipboard.readText()) === 'PF-4002');
ok('「コピーしました」と出る', await p.evaluate(() => {
  const h = document.getElementById('cf-ec-hint'); return !!(h && h.classList.contains('show') && /PF-4002/.test(h.textContent)); }));

/* 番号なしのトーストには札を出さない */
await p.evaluate(() => { document.getElementById('pit-toast').classList.remove('show'); pitToast('保存しました'); });
await p.waitForTimeout(250);
ok('番号を渡さない時は札を出さない', await p.evaluate(() => !document.querySelector('#pit-toast .cf-ec')));

/* 窓（注意） */
await p.evaluate(() => { pitAlert('保存できません。足りない項目があります', { code: 'PF-1002', detail: 'テスト' }); });
await p.waitForTimeout(350);
const d = await p.evaluate(() => {
  const c = document.querySelector('#uid-card .cf-ec');
  return { open: !!document.getElementById('uid-ov').classList.contains('open'), chip: c ? c.textContent : null,
           inRow: !!(c && c.parentElement && c.parentElement.classList.contains('uid-b')),
           first: !!(c && c.parentElement && c.parentElement.firstElementChild === c),
           leftOfBtn: (function(){ const b = document.querySelector('#uid-card .uid-b button');
             return !!(c && b && c.getBoundingClientRect().right < b.getBoundingClientRect().left); })() };
});
ok('🔴 窓のボタン行に error：番号 が出る（A案）', d.open && d.chip === 'error：PF-1002', d);
ok('🔴 窓の番号はボタン行の左端（A案）', d.inRow && d.first && d.leftOfBtn, d);
await p.click('#uid-card .cf-ec');
await p.waitForTimeout(300);
ok('窓の番号も押すとコピーできる', await p.evaluate(() => navigator.clipboard.readText()) === 'PF-1002');
await p.evaluate(() => UI.close());
await p.waitForTimeout(200);

/* 番号を渡さない窓は、今までどおり何も出さない */
await p.evaluate(() => { pitAlert('ふつうのお知らせ'); });
await p.waitForTimeout(300);
ok('番号なしの窓は今までどおり', await p.evaluate(() => !document.querySelector('#uid-card .cf-ec')));
await p.evaluate(() => UI.close());

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));
await b.close();

/* ================= ③ 一覧表を作り直す ================= */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const areas = [...new Set(ledger.map(r => r.area))];
const rows = areas.map(a => {
  const list = ledger.filter(r => r.area === a);
  return '<h2>' + esc(a) + ' <small>' + list.length + '件</small></h2>\n<table><thead><tr>'
    + '<th class="c">番号</th><th>何が起きたか</th><th>どこで出るか</th><th>どうすればいいか</th></tr></thead><tbody>'
    + list.map(r => '<tr><td class="c">' + esc(r.code) + '</td><td>' + esc(r.what) + '</td><td class="w">'
      + esc(r.where) + '</td><td class="h">' + esc(r.how) + '</td></tr>').join('\n')
    + '</tbody></table>';
}).join('\n');
const html = `<!doctype html><html lang="ja"><meta charset="utf-8">
<title>PitFlow エラー番号一覧</title>
<style>
 body{font-family:"Yu Gothic","Hiragino Kaku Gothic ProN",system-ui,sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:28px 22px 60px;line-height:1.7}
 h1{font-size:22px;margin:0 0 6px} .lead{color:#9aa7b4;font-size:13px;margin:0 0 22px;max-width:760px}
 .lead b{color:#e6edf3}
 h2{font-size:15px;margin:26px 0 8px;padding-left:9px;border-left:4px solid #1db97a}
 h2 small{color:#6e7b8a;font-weight:400;font-size:11.5px;margin-left:6px}
 table{border-collapse:collapse;width:100%;max-width:1100px;font-size:13px}
 th,td{border:1px solid #263041;padding:7px 10px;text-align:left;vertical-align:top}
 th{background:#161b22;color:#9aa7b4;font-size:11.5px;font-weight:700}
 td.c{font-family:Consolas,Menlo,monospace;font-weight:700;color:#f0b429;white-space:nowrap}
 td.w{color:#9aa7b4;font-size:12px} td.h{color:#7ee2b8;font-size:12px}
 tr:nth-child(even) td{background:#11161d}
 .note{margin-top:30px;padding:14px 16px;border:1px solid #3d2f12;background:#1c160a;border-radius:10px;font-size:12.5px;color:#e8d5a8;max-width:1100px}
</style>
<h1>PitFlow エラー番号一覧</h1>
<p class="lead">画面に <b>PF-0412</b> のような番号が出たら、この表で意味が分かります。
番号は<b>押すとコピー</b>できるので、そのままチャットに貼って伝えてください。<br>
番号は <b>先頭1桁が分野</b>（0=全体／1=予約／2=タスクボード／3=代車／4=完TEL・返車／5=売上／6=顧客／7=車検／8=表紙／9=設定）。</p>
${rows}
<div class="note">🔴 <b>この表は手で書きません。</b> <code>js/errcode-pit.js</code> の台帳から <code>test_errcode.mjs</code> が作り直します。
番号は<b>一度出したら二度と変えず、使い回しません</b>（要らなくなっても欠番のまま残します）。</div>
</html>`;
fs.writeFileSync('../PitFlow_エラー番号一覧.html', html);
console.log('\n📄 一覧表を作り直しました：PitFlow_エラー番号一覧.html（' + ledger.length + '件）');

console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
