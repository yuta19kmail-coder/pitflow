/* PitFlow v1.147.0 ── 代車の「条件メモ」が予約詳細に出るか
   -------------------------------------------------------------------
   ◎見張っているもの
     🔴 予約詳細の代車の欄に**条件メモが出ていなかった**（読む所と書く所の名前が違っていた）。
        入力欄が書くのは「条件メモ」＝ loanerOther。予約詳細だけ別の名前を読んでいた。
     ① 条件メモを入れると**予約詳細に出る**
     ② ほかの画面（ホバー・表紙印刷・代車カレンダー）と**同じものを読んでいる**
     ③ 空なら何も出ない
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8966      ← 別ウィンドウ
     node test_loaner_memo.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8966;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.openDetail', null, { timeout: 20000 });
await p.waitForTimeout(500);

const MEMO = 'ETC付きでお願いします';
async function setup(memo){
  await p.evaluate((m) => {
    const D = n => { const d = new Date(); d.setDate(d.getDate() + n); return window.ymd(d); };
    state.loaners = [{ id:'L1', name:'代車1', number:1, model:'ハスラー' }];
    state.cards = [{ id:'k1', customer:'田中 太郎', car:'ノート', status:'check', boardId:'default', division:'div1',
      reserveDate: D(-1), needLoaner:true, loanerId:'L1', loanerFrom: D(-1), loanerTo: D(4),
      loanerOther: m, workTypes:[] }];
    state.loanerAssigns = [{ id:'a1', cardId:'k1', loanerId:'L1', fromDate:D(-1), toDate:D(4) }];
    showView('dashboard');
    openDetail('k1');
  }, memo);
  await p.waitForTimeout(600);
}
const detailText = () => p.evaluate(() => {
  const m = document.querySelector('#modal-card-view, .cv-wrap, .cv-modal, [id*="card-view"]');
  return (m ? m.innerText : document.body.innerText);
});

console.log('\n───── ① 予約詳細に出る ─────');
await setup(MEMO);
const t = await detailText();
ok('🔴 条件メモが予約詳細に出る', t.includes(MEMO), t.slice(0, 300));
ok('代車の欄の中に出ている',
   await p.evaluate(m => { const el = document.querySelector('.cv-loxmemo'); return !!el && el.textContent.includes(m); }, MEMO));

console.log('\n───── ② ほかの画面と同じものを読んでいる ─────');
{
  const cv = fs.readFileSync('js/card-view.js', 'utf8');
  ok('🔴 予約詳細が loanerOther を読んでいる', /c\.loanerOther/.test(cv));
  const cd = fs.readFileSync('js/card-detail.js', 'utf8');
  ok('入力欄が書いているのも loanerOther', /'loanerOther'/.test(cd));
  const ch = fs.readFileSync('js/card-hover.js', 'utf8');
  ok('ホバーも同じ', /loanerOther/.test(ch));
  const lo = fs.readFileSync('js/loaner.js', 'utf8');
  ok('代車カレンダーも同じ', /loanerOther/.test(lo));
  const cp2 = fs.readFileSync('js/cover-print.js', 'utf8');
  ok('表紙印刷も同じ', /loanerOther/.test(cp2));
}

console.log('\n───── ③ 空なら何も出ない ─────');
await p.evaluate(() => { const m = document.querySelector('.cv-close, [onclick*="closeDetail"]'); if (m) m.click(); });
await p.waitForTimeout(300);
await setup('');
ok('空の時はメモの枠を出さない', await p.evaluate(() => !document.querySelector('.cv-loxmemo')));

console.log('\n───── まとめ ─────');
ok('画面のエラーが出ていない', errs.length === 0, errs.slice(0, 5));
console.log('\n  ' + pass + ' OK / ' + fail + ' NG\n');
await b.close();
process.exit(fail ? 1 : 0);
