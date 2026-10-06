/* PitFlow v2.158.0 ── クォーターチェック：お客様の名前をフロントマン（伝票）にそろえる
   ===================================================================
   ◎ゆうた指定（2026-10-07）
     🗣「Q-482582 名前が違って、フロントマンの名前に揃えるっていう選択肢がほしい」
   ◎ここで見張ること
     🔴 名前がちがう行（客名）に「フロントマンの名前（〇〇）にそろえる」が出る
     🔴 種類は「客名」1つのまま（残りの数え方が二重にならない）＝「このままでよい」と同じ行
     🔴 押すとカードのお客様名が伝票の名前になる／控え（名簿）も同じ間違った名前なら一緒に直る
     🔴 控えが別の名前（名簿で決めた名前）なら控えは触らない（ゆうた確認 2026-10-07）
     🔴 そろえたあとは、その行の「客名」が消える

   ◎使い方
     python3 -m http.server 8995      ← 別ウィンドウ
     node _見張り/test_quarter_custname.mjs                              */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const PORT = process.env.PORT || 8995;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: chromePath() });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitQFixApply && window.pitQKeepKinds', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(600);

const R = await p.evaluate(async () => {
  window.pitAsk = function () { return Promise.resolve(true); };   /* 聞かれたら「はい」 */
  state.customers = state.customers || [];
  state.customers.push({ id: 'TCU1', name: '山田太郎', kana: 'ヤマダタロウ', vehicles: [] });
  state.customers.push({ id: 'TCU2', name: '山田花子', kana: 'ヤマダハナコ', vehicles: [] });
  const c1 = { id: 'TQC1', customer: '山田太郎', customerId: 'TCU1', status: 'returned', log: [] };
  const c2 = { id: 'TQC2', customer: '山田太郎', customerId: 'TCU2', status: 'returned', log: [] };
  state.cards.push(c1, c2);
  const pair = c => ({ soft: { 顧客名: '山田 太朗', 伝票: '0999', 売上日: '', 金額: 0, i: 0 }, pit: { 顧客名: c.customer, 生: c, 売上日: '', 確定金額: 0 }, 客名一致: false, 担当一致: true });
  const p1 = pair(c1);
  const keep = pitQKeepKinds(p1).filter(k => k.kind === '客名');
  const fix = pitQFixKinds(p1).filter(k => k.kind === '客名');
  const before = pitQRowTotal(p1);
  const done1 = await pitQFixApply('客名', p1);
  const done2 = await pitQFixApply('客名', pair(c2));
  const out = {
    keep: keep.map(k => [k.label, k.go && k.go.label]), fixDup: fix.length, total: before,
    done: [done1, done2],
    c1: c1.customer, cu1: state.customers.find(x => x.id === 'TCU1').name,
    c2: c2.customer, cu2: state.customers.find(x => x.id === 'TCU2').name,
    log: (c1.log || []).map(l => l.label || l.text || '').join(' / ')
  };
  state.cards = state.cards.filter(c => !/^TQC/.test(c.id));
  state.customers = state.customers.filter(c => !/^TCU/.test(c.id));
  return out;
});
ok('🔴 客名の行に「フロントマンにそろえる」と「このままでよい」が同じ行で出る（字は短く＝折り返さない・v2.159.0）',
   R.keep.length === 1 && R.keep[0][1] === 'フロントマンにそろえる' && R.keep[0][0] === 'このままでよい', R.keep);
ok('🔴 種類は「客名」1つだけ（直す側に2つ目を作らない＝残りが二重にならない）', R.fixDup === 0 && R.total >= 1, [R.fixDup, R.total]);
ok('押すとカードのお客様名が伝票の名前になる', R.done[0] === true && R.c1 === '山田 太朗', R);
ok('🔴 控えも同じ間違った名前だった＝一緒に直る', R.cu1 === '山田 太朗', R.cu1);
ok('🔴 控えが別の名前（山田花子）なら控えは触らない', R.c2 === '山田 太朗' && R.cu2 === '山田花子', [R.c2, R.cu2]);
ok('ページエラーなし', errs.length === 0, errs.slice(0, 3));
await b.close();
console.log(`\n${pass} ✅ / ${fail} ❌`);
process.exit(fail ? 1 : 0);
