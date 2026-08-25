/* PitFlow v2.9.0 ── 🛡 保険＝入金日で実績に乗せる
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-25）
     🗣「保険が付いたものはリアル業務として**返車と入金が大きくずれる**。
     　　作業→返車→請求書作成→売上 になる。自社の計算方法だと
     　　**一番最後の売上日を実質的な返車日**と見て、そこで数字計上している。そのまま再現」
     🗣 流れ：保険バッジ → 自動で売掛チェック → タスクボード → 完TEL関門 → 返車ビュー
     　　　　→ 返車完了 → **実績に乗らない・入金待ち** → **入金日を入れた日で実績**
     　　　　（本当の返車日は情報として残す）
     🗣「各データチェックやPDFチェックでもこのフローはOKとする」
     🗣「保険の時だけ」＝**手で売掛を付けただけの車は今までどおり返車日で実績**

   ◎この試験がやること（**お金が動く変更なので、まず「勝手に計上されない」ことを見る**）
     🔴 ① 返車しただけでは、どの月にも数えない（🔴 返車日に落ちないこと＝いちばん危ない所）
     🔴 ② 入金日を入れた**その日**で数える
     🔴 ③ 入金日を消したら実績から外れる
     🔴 ④ **本当の返車日は消えない**（実績日を直しても上書きしない）
     🔴 ⑤ 保険が付いたら売掛チェックが自動で入る
     🔴 ⑥ **保険でない車は1台も挙動が変わらない**（今までどおり返車日で実績）
     🔴 ⑦ データチェックが「実績の日が空」で赤にしない／実績日を空に戻せる
     🔴 ⑧ 来店履歴には出る（返車日で）
     🔴 ⑨ PDF突合でこの流れをOKにする（月またぎでも保険はお知らせ扱い）
   ◎使い方
     node /tmp/srv.js（別ウィンドウ・8991番）
     node test_insurance.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

console.log('\n── 🔍 コードを機械で読む ──');
{
  const dir = path.join(process.cwd(), 'js');
  const rd  = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const sc = rd('sales-count.js'), ins = rd('insurance-pit.js');
  const idx = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  /* 🔴 いちばん危ない所：保険が `|| returnDateFinal || returnDate` に落ちていないこと */
  ok('🔴 保険は returnDate に落ちない（数える日は入金日だけ）',
     /pitCardInsurance\(c\)\)\s*\{[\s\S]{0,200}pitInsResultDate\(c\)/.test(sc));
  /* ⚠ コメントを外してから見る（注意書きにも workSpecials の字が出る）。
     ⚠ 見るのは **'insurance' という綴り**。inspect-rules.js の `employee`（社員）は別の話なので触らない。 */
  const 素 = (f) => rd(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  ok('🔴 物差しは insurance-pit.js の1本（他所で insurance と書いていない）',
     ['sales-count.js','return-popup.js','today.js','inspect-rules.js','customers.js',
      'quarter-match.js','card-view.js','inspect-fix.js','undetermined.js','card-detail.js']
       .every(f => !/['"]insurance['"]/.test(素(f))),
     ['sales-count.js','return-popup.js','today.js','inspect-rules.js','customers.js',
      'quarter-match.js','card-view.js','inspect-fix.js','undetermined.js','card-detail.js']
       .filter(f => /['"]insurance['"]/.test(素(f))));
  ok('🔴 sales-count より先に読み込む',
     idx.indexOf('insurance-pit.js') > 0 && idx.indexOf('insurance-pit.js') < idx.indexOf('js/sales-count.js'));
  ok('返車完了の2か所が同じ1本を通る',
     /pitInsOnReturn\(c, rd\)/.test(rd('return-popup.js')) && /pitInsOnReturn\(c, t\)/.test(rd('today.js')));
  ok('🔴 保険は実績日を直しても返車日を上書きしない',
     /pitCardInsurance\(c\)\)\s*\{[\s\S]{0,220}return;/.test(rd('card-view.js')));
  ok('売掛チェックを計上の根拠にしていない', !/paymentSeparate/.test(ins.replace(/\/\*[\s\S]*?\*\//g, '').split('function onBadge')[0]));
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.pitCardInsurance && window.pitSalesCountDate', null, { timeout: 25000 });
await p.waitForTimeout(500);

/* 1台を作って、返車 → 入金 と進めながら「数える日」を見る。
   ⚠ state.cards には入れない（本物のデータを汚さない）。物差しに直接渡す。 */
const step = (opt) => p.evaluate((o) => {
  const c = {
    id: 'T1', resNo: 'R1', status: 'work', plate: '習志野 500 あ 11-11', customer: 'テスト',
    car: 'ノア', amountFinal: 300000, frontStaff: '蓮沼',
    reserveDate: '2026-08-01', returnDate: '', returnDateFinal: '', completedAt: '',
    workType: 'bp', workSpecials: o.保険 ? ['insurance'] : [],
    paymentSeparate: !!o.売掛, paymentDate: o.入金日 || null
  };
  if (o.保険) window.pitInsOnBadge(c);
  const out = { 付けた直後の売掛: !!c.paymentSeparate };
  if (o.返車日) {
    /* 当日ビューの「返車済みにする」と同じ道 */
    c.status = 'returned';
    c.returnDate = o.返車日; c.returnDateFinal = o.返車日;
    if (!(window.pitInsOnReturn && window.pitInsOnReturn(c, o.返車日))) c.completedAt = o.返車日;
  }
  if (o.あとで入金日) window.pitInsSetPaid(c, o.あとで入金日);
  if (o.入金日を消す) window.pitInsSetPaid(c, '');
  if (o.実績日を直す) window.pitApplyResultDate(c, o.実績日を直す);
  return Object.assign(out, {
    実績日: c.completedAt || '', 返車日: c.returnDate || '', 確定返車日: c.returnDateFinal || '',
    入金日: c.paymentDate || '', 売掛: !!c.paymentSeparate,
    数える日: window.pitSalesCountDate(c),
    区分: window.pitSalesTier(c),
    '8月に数えるか': window.pitSalesInRange(c, '2026-08-01', '2026-08-31', '2026-08-25'),
    '10月に数えるか': window.pitSalesInRange(c, '2026-10-01', '2026-10-31', '2026-10-25'),
    入金待ち: !!window.pitInsPayWait(c),
    来店履歴に出る: !!(window.pitCardIsDone && window.pitCardIsDone(c)),
    ひとこと: window.pitInsNote(c)
  });
}, opt);

console.log('\n── ⑤ 保険を付けたら売掛チェックが入る ──');
{
  const r = await step({ 保険: true });
  ok('🔴 自動で売掛チェックが入る', r.付けた直後の売掛 === true, r);
}

console.log('\n── ① 返車しただけでは、どの月にも数えない ──');
{
  const r = await step({ 保険: true, 返車日: '2026-08-12' });
  ok('🔴🔴 実績日は空のまま（返車日に落ちない）', r.実績日 === '', r);
  ok('🔴🔴 数える日が無い', r.数える日 === '', r);
  ok('🔴 8月に数えない', r['8月に数えるか'] === false, r);
  ok('🔴 10月にも数えない', r['10月に数えるか'] === false, r);
  ok('入金待ちに入る', r.入金待ち === true, r);
  ok('区分は「実績待」', r.区分 === 'actualWait', r);
  ok('🔴 本当の返車日は残る', r.返車日 === '2026-08-12' && r.確定返車日 === '2026-08-12', r);
  ok('🔴 来店履歴には出る', r.来店履歴に出る === true, r);
  ok('ひとことが出る', /入金待ち/.test(r.ひとこと), r.ひとこと);
}

console.log('\n── ② 入金日を入れたその日で数える ──');
{
  const r = await step({ 保険: true, 返車日: '2026-08-12', あとで入金日: '2026-10-05' });
  ok('🔴 実績日＝入金日', r.実績日 === '2026-10-05', r);
  ok('🔴 数える日＝入金日', r.数える日 === '2026-10-05', r);
  ok('🔴 8月には数えない', r['8月に数えるか'] === false, r);
  ok('🔴 10月に数える', r['10月に数えるか'] === true, r);
  ok('区分は「実績」', r.区分 === 'actual', r);
  ok('🔴 本当の返車日は 8/12 のまま', r.返車日 === '2026-08-12' && r.確定返車日 === '2026-08-12', r);
  ok('ひとことに両方の日が出る', /2026-10-05/.test(r.ひとこと) && /2026-08-12/.test(r.ひとこと), r.ひとこと);
}

console.log('\n── ③ 入金日を消したら実績から外れる ──');
{
  const r = await step({ 保険: true, 返車日: '2026-08-12', あとで入金日: '2026-10-05', 入金日を消す: true });
  ok('🔴 実績日が空に戻る', r.実績日 === '', r);
  ok('🔴 どの月にも数えない', r.数える日 === '' && r['10月に数えるか'] === false, r);
  ok('返車日は消えない', r.返車日 === '2026-08-12', r);
}

console.log('\n── ④ 実績日を直しても、本当の返車日を上書きしない ──');
{
  const r = await step({ 保険: true, 返車日: '2026-08-12', あとで入金日: '2026-10-05', 実績日を直す: '2026-10-20' });
  ok('🔴 実績日は直る', r.実績日 === '2026-10-20', r);
  ok('🔴 入金日も一緒に動く（保険の実績日＝入金日なので）', r.入金日 === '2026-10-20', r);
  ok('🔴🔴 返車日は 8/12 のまま（上書きしない）', r.返車日 === '2026-08-12' && r.確定返車日 === '2026-08-12', r);
}

console.log('\n── ⑥ 保険でない車は1台も挙動が変わらない ──');
{
  const r = await step({ 保険: false, 返車日: '2026-08-12' });
  ok('🔴 今までどおり返車日で実績', r.実績日 === '2026-08-12' && r.数える日 === '2026-08-12', r);
  ok('🔴 8月に数える', r['8月に数えるか'] === true, r);
  ok('区分は「実績」', r.区分 === 'actual', r);

  /* 🔴 ゆうた「保険の時だけ」＝手で売掛を付けただけの車は今までどおり */
  const r2 = await step({ 保険: false, 売掛: true, 返車日: '2026-08-12' });
  ok('🔴🔴 手で売掛にしただけの車は、今までどおり返車日で実績', r2.実績日 === '2026-08-12', r2);
  ok('　8月に数える', r2['8月に数えるか'] === true, r2);
  const r3 = await step({ 保険: false, 売掛: true, 返車日: '2026-08-12', あとで入金日: '2026-10-05' });
  ok('🔴 入金日を入れても実績日は動かない（メモのまま）', r3.実績日 === '2026-08-12', r3);
}

console.log('\n── ⑦ データチェックがこの形を赤にしない ──');
{
  const r = await p.evaluate(() => {
    const c = { id:'T2', status:'returned', workSpecials:['insurance'], paymentSeparate:true, paymentDate:null,
      returnDate:'2026-08-12', returnDateFinal:'2026-08-12', completedAt:'', reserveDate:'2026-08-01',
      plate:'習志野 500 あ 11-11', customer:'テスト', amountFinal:300000, workType:'bp' };
    const c2 = Object.assign({}, c, { workSpecials: [] });   /* 保険でない＝今までどおり赤 */
    const hit = (card) => {
      const rules = (window.PIT_INSPECT_RULES || window.pitInspectRules || []);
      const list = Array.isArray(rules) ? rules : (rules.rules || []);
      const f04 = list.filter(x => x && x.id === 'F04')[0];
      return f04 ? String(f04.each(card) || '') : '（F04が見つからない）';
    };
    return { 保険: hit(c), 保険でない: hit(c2) };
  });
  ok('🔴 保険は「実績の日が空」で赤にしない', r.保険 === '', r);
  ok('🔴 保険でない車は今までどおり赤で出る', /空/.test(r.保険でない), r);
}

console.log('\n── ⑨ PDF突合でこの流れをOKにする ──');
{
  const r = await p.evaluate(() => {
    const mk = (ins) => ({ 期間の外:true, 同じ車:true, 金額一致:true,
      日付:{ kind:'crossMonth' }, 売上日差:{ kind:'same' }, pit:{ 保険: ins } });
    return { 保険: window.pitQCrossOnly(mk(true)), 保険でない: window.pitQCrossOnly(mk(false)) };
  });
  ok('🔴 保険は月またぎでも「直す先が無い」（お知らせ扱い）', r.保険 === true, r);
  ok('🔴 保険でない車の月またぎは、今までどおりNG', r.保険でない === false, r);

  /* 集める側が印を連れて行くこと */
  const c2 = await p.evaluate(() => {
    const keep = window.state.cards;
    window.state.cards = [{ id:'T3', resNo:'R3', status:'returned', workSpecials:['insurance'],
      paymentSeparate:true, paymentDate:null, plate:'習志野 500 あ 11-11', customer:'テスト',
      car:'ノア', amountFinal:300000, returnDate:'2026-08-12', returnDateFinal:'2026-08-12',
      completedAt:'', reserveDate:'2026-08-01', frontStaff:'蓮沼' }];
    const rows = window.pitQCollect({ from:'2026-08-08', to:'2026-08-15' }).明細;
    window.state.cards = keep;
    return rows.map(x => ({ id:x.id, 保険:x.保険, 入金待ち:x.入金待ち, 数える日:x.数える日, 実績:x.実績 }));
  });
  ok('🔴 集める側が「保険・入金待ち」を連れて行く',
     c2.length === 1 && c2[0].保険 === true && c2[0].入金待ち === true, c2);
  ok('🔴 数える日が空＝金額を結ぶ相手にならない（嘘の一致を作らない）', c2[0] && c2[0].数える日 === '', c2);
}

console.log('\n── 🧭 まわり ──');
{
  for (const v of ['dashboard','today','sales','result','inspect','customers','return']) {
    await p.evaluate((x) => { try { showView(x); } catch (e) {} }, v);
    await p.waitForTimeout(220);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 4));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v2.9.0 以降', vn[0] > 2 || (vn[0] === 2 && vn[1] >= 9), ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail === 0 ? 0 : 1);
