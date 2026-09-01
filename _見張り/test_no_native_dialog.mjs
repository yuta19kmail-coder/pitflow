/* PitFlow v1.75.0 ── ブラウザ純正の alert / confirm / prompt が残っていないか
   -------------------------------------------------------------------
   ◎ゆうた指定＝「（定休日のを直したついでに）**今なおしちゃって**」
     全アプリの決めごと（2026-07-28）＝ブラウザ標準の alert・confirm・prompt はやめる。
     PitFlow には 45か所ほど残っていたので、この版で **pitAlert / pitAsk / pitAskText** に入れ替えた。
   ◎この試験がやること
     🔴 **コードを機械で読んで、純正が残っていないことを見張る。**
        画面をひとつずつ触る試験だと、触っていない画面の取り残しに気づけない。
     ＋ よく使う17の操作を実際に動かして、アプリ内の窓が出る／純正が出ないことを見る。
   ⚠ 「保険」として残してよいのは、**アプリ内ダイアログが無い環境用の分岐の中だけ**。
      下の許可リストで管理する。**増やす時は必ず理由を書くこと。**
   ◎使い方
     python3 -m http.server 8984      ← 別ウィンドウ
     node test_no_native_dialog.mjs                                     */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8984;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

/* ===================================================================
   ① コードを機械で読む（触っていない画面の取り残しは、これでしか見つからない）
   =================================================================== */
console.log('\n── 🔍 js フォルダを機械で読む ──');

const ALLOW = [
  { file: 'ui-dialog.js',    why: 'アプリ内ダイアログ本体（そもそも純正を使っていない）' },
  { file: 'ask-pit.js',      why: '入口。UI が無い環境のための保険をここに集めてある' },
  { file: 'launcher.js',     why: '全アプリ共通部品（_shared から配られるコピー）。直すなら _shared 側' },
  { file: 'approval-pit.js', why: 'UI が無い時の保険（if (UI) … else の else 側）' },
  { file: 'card-detail.js',  why: 'UI が無い時の保険（_pitAskBlankSave ほか）' },
  { file: 'customers.js',    why: 'UI が無い時の保険（顧客の確認）' },
  { file: 'return-popup.js', why: 'UI が無い時の保険' },
  { file: 'rules.js',        why: 'UI が無い時の保険（pitIntakeGuard）' }
];
const allowFiles = new Set(ALLOW.map(a => a.file));

const dir = path.join(process.cwd(), 'js');
const rx = /(^|[^.\w$])(window\.)?(alert|confirm|prompt)\s*\(/;
const found = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))){
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;   /* 注記は数えない */
    if (!rx.test(ln)) return;
    found.push({ file: f, line: i + 1, text: t.slice(0, 90) });
  });
}
const bad = found.filter(x => !allowFiles.has(x.file));
ok('🔴 許可した所いがいに、純正の alert / confirm / prompt が1つも無い', bad.length === 0, bad.slice(0, 8));
ok('入口（ask-pit.js）が居る', fs.existsSync(path.join(dir, 'ask-pit.js')));
ok('index.html が入口を読み込んでいる', /js\/ask-pit\.js/.test(fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')));
console.log('    （許可の内訳）');
ALLOW.forEach(a => console.log('      ・' + a.file + ' … ' + a.why));

/* ===================================================================
   ② 実際に動かす
   =================================================================== */
const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
const native = [];
p.on('dialog', async d => { native.push(d.message()); await d.dismiss().catch(() => {}); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.pitAsk && window.pitAlert && window.pitAskText', null, { timeout: 25000 });
await p.waitForTimeout(700);

console.log('\n── 🧰 入口の3つ ──');
{
  ok('pitAsk がある（はい／いいえ）', await p.evaluate(() => typeof pitAsk === 'function'));
  ok('pitAlert がある（知らせるだけ）', await p.evaluate(() => typeof pitAlert === 'function'));
  ok('pitAskText がある（文字を入れてもらう）', await p.evaluate(() => typeof pitAskText === 'function'));
  /* ⚠ pitAsk は Promise を返す。**返り値をそのまま返すと、答えるまで evaluate が返ってこない**（固まる）。
     だから `{ }` で受けて、返さない。 */
  await p.evaluate(() => { pitAsk('テストです'); });
  await p.waitForTimeout(300);
  ok('pitAsk を呼ぶとアプリ内の窓が出る', await p.locator('#uid-ok:visible').count() === 1);
  ok('🔴 ブラウザ純正は出ない', native.length === 0, native);
  await p.click('#uid-no'); await p.waitForTimeout(200);
}

console.log('\n── 🖱 実際の操作（よく使うものを一通り） ──');
const cases = [
  ['付箋を消す',            () => { state.boardNotes = [{ id:'n1', title:'テスト付箋', replies:[] }]; deleteBoardNoteFromCard('n1'); }],
  ['代車の返却を確定',      () => { state.loanerAssigns = [{ id:'a1', loanerId:'l1', fromDate:'2026-08-01', toDate:'2026-08-20' }]; loReturnConfirm('a1'); }],
  ['代車をキャンセル',      () => { state.loanerAssigns = [{ id:'a1', loanerId:'l1', fromDate:'2026-08-01', toDate:'2026-08-20' }]; loCancelLoaner('a1'); }],
  /* v2.5.0：作業タイプの削除は廃止（設定から触れない＝正は state.js の PIT_WORK_TYPES） */
  ['外注先を消す',          () => { state.settings.outsourcePartners = ['A社']; pitOsDel(0); }],
  ['設定を初期値に戻す',    () => { pitSettingsReset(); }],
  ['顧客の控えを全部消す',  () => { clearCustomers(); }],
  ['入庫予約をキャンセル',  () => { state.cards = [{ id:'c1', status:'reserved', customer:'x', log:[] }]; pitTodayCancel('c1', false); }],
  ['返車予定をキャンセル',  () => { state.cards = [{ id:'c1', status:'workDone', returnStage:'returnWait', returnDate:'2026-08-20', customer:'x', log:[] }]; pitTodayCancel('c1', true); }],
  ['入庫日を入れる（文字）', () => { state.cards = [{ id:'c1', status:'reserved', intakeTbd:true, customer:'x', log:[] }]; pitUndSetIntake('c1'); }],
  ['完TELの返車日（文字）',  () => { state.cards = [{ id:'c1', status:'workDone', customer:'x', log:[] }]; pitUndComplete('c1'); }],
  ['症状を消す',            () => { WorkContent.wcDelSym(0); }],
  ['部位を足す（文字）',    () => { WorkContent.wcAddPart(); }],
  ['プリセットを消す',      () => { state.settings.myDash = { presets:[{ name:'A', layout:[] }, { name:'B', layout:[] }], active:0 }; mydDeletePreset(1); }],
  ['PIT配置図のサンプル',   () => { PitFloorEditor.loadSample(); }],
  ['ルールを反映',          () => { if (window.pitRuleEditStart) pitRuleEditStart(); if (window.pitRuleOk) pitRuleOk(); }],
  ['サンプルに戻す',        () => { PitDB.resetSample(); }]
];
for (const [name, fn] of cases){
  const before = native.length;
  await p.evaluate(fn);
  await p.waitForTimeout(320);
  const vis = await p.locator('#uid-ok:visible').count();
  ok(name + '：アプリ内の窓が出て、純正は出ない', vis === 1 && native.length === before,
     { 窓: vis, 純正: native.slice(before) });
  if (vis) { await p.click('#uid-no').catch(() => {}); await p.waitForTimeout(220); }
}

console.log('\n── 🧭 まわり ──');
{
  await p.evaluate(() => { state.cards = []; });
  for (const v of ['course1', 'today', 'return', 'reserve', 'loanercal', 'settings', 'rules']){
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(140);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  ok('🔴 最後まで純正のダイアログは1回も出ていない', native.length === 0, native);
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v1.75.0 以降', vn[0] > 1 || (vn[0] === 1 && vn[1] >= 75), ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
