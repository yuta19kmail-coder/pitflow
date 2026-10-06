/* PitFlow v2.155.0 ── クォーターチェック：担当の名寄せで別人に化けない
   ===================================================================
   ◎ゆうた報告（2026-10-07）
     🗣「Q-816429 がフロント違うで、なぜか関係ないチーフにすると書いてある」
   ◎正体
     名寄せ表（quarter-match.js STAFF_ALIAS）の「末尾が一致したらその人」が**下の名前にも効いていた**。
     「椎名祐太」は末尾が「祐太」＝**チーフ（小林裕太）に化けた**。
   ◎ここで見張ること
     🔴 椎名祐太はチーフにならない（スペースあり・なし・請求先名つきでも椎名祐太）
     🔴 今までどおり：専務・社長・チーフ・裕太・祐太はその人／「Agency株式会社箱﨑康起」は箱崎康起
     🔴 データチェックの「担当」の直し先がチーフにならない（quarter-fix の fixKinds）

   ◎使い方
     python3 -m http.server 8995      ← 別ウィンドウ
     node _見張り/test_qstaff_alias.mjs                                 */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const PORT = process.env.PORT || 8995;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: chromePath() });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitQStaffName', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(600);

const R = await p.evaluate(() => {
  const keep = state.staff;
  state.staff = [{ id: 's1', name: '椎名 祐太' }, { id: 's2', name: '小林 裕太' }, { id: 's3', name: '箱崎 康起' }, { id: 's4', name: '専務' }];
  const N = pitQStaffName;
  const out = {
    shiina: [N('椎名 祐太'), N('椎名祐太'), N('Agency株式会社椎名祐太')],
    old: [N('専務'), N('社長'), N('チーフ'), N('裕太'), N('祐太'), N('小林 裕太'), N('Agency株式会社箱﨑康起'), N('〇〇株式会社チーフ')],
  };
  /* データチェックの直し先 */
  if (window.pitQFixKinds) {
    const k = pitQFixKinds({ soft: { 受付担当: '椎名祐太', 売上日: '', 金額: 1000 }, pit: { フロント担当: '箱崎 康起', 売上日: '', 確定金額: 1000 }, 担当一致: false });
    out.fix = (k.find(x => x.kind === '担当') || {}).to;
  }
  state.staff = keep;
  return out;
});
ok('🔴 椎名祐太はチーフにならない（スペースあり・なし・請求先名つき）', R.shiina.every(x => x === '椎名祐太'), R.shiina);
ok('今までどおり：専務・社長・チーフ・裕太・祐太・小林裕太',
   JSON.stringify(R.old.slice(0, 6)) === JSON.stringify(['小林和枝', '小林政幸', '小林裕太', '小林裕太', '小林裕太', '小林裕太']), R.old);
ok('今までどおり：請求先名つき「Agency株式会社箱﨑康起」＝箱崎康起', R.old[6] === '箱崎康起', R.old[6]);
ok('役職の末尾（〇〇株式会社チーフ）＝小林裕太', R.old[7] === '小林裕太', R.old[7]);
if (R.fix !== undefined) ok('🔴 データチェックの直し先＝椎名 祐太（チーフではない）', R.fix === '椎名 祐太', R.fix);
ok('ページエラーなし', errs.length === 0, errs.slice(0, 3));
await b.close();
console.log(`\n${pass} ✅ / ${fail} ❌`);
process.exit(fail ? 1 : 0);
