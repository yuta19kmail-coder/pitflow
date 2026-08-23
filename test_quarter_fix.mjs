/* ================================================================================
   test_quarter_fix.mjs ── 🛠 突き合わせた一覧を、その場で片づける   PitFlow v2.0.0
   ================================================================================
   ◎ゆうた指定（2026-08-23）
     🗣「**確かに付け合わせしてズレているものはそのままそこで修正できなきゃ意味ないもんね。
     　　個別に日付を修正できるボタンを出すようにしよう**」
     🗣「**基本的には 修正 or 伝票側を直したからそのまま の2択がほしい**」
     🗣（直せるもの）「**3だね**」＝ 売上日 ＋ 実績日 ＋ 金額
     🗣「**売上日も同様に基本はアーカイブはロック管理者のみ修正可能、
     　　データチェックからはそこだけ修正できる特例権限って扱いにして**」

   ◎ここで見張ること
     ① ズレの見つけ方（何を出して、何を出さないか）
     ② 誰が押せるか（売上日＝誰でも／実績日・金額＝管理者だけ）
     ③ 直す（🔴 書き込みは既にある1本を通っているか）
     ④ 印（伝票を直した）＝ 🔴 **合計・差・検算を1円も動かさない**
     ⑤ 直したら、PDFを入れ直さずに数字が縮む
     ⑥ 画面（2つのボタン・重いものは赤・済の出しかた・並び）
     ⑦ ソースの見張り

   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8980      ← 別ウィンドウ
     node test_quarter_fix.mjs
   ================================================================================ */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8980;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(x => fs.existsSync(x));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };
const src = f => fs.readFileSync(f, 'utf8');

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1700, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
/* 確認の窓は「はい」で通す。⚠ 出たかどうかは別に数える（下の __asked） */
p.on('dialog', d => d.accept());

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitQFixKinds && window.pitQMatch && window.renderInspect', null, { timeout: 25000 });
await p.waitForTimeout(900);

await p.evaluate(() => {
  window.PIT_CLOUD = true;
  window.__admin = true;
  window.pitIsAdmin = function(){ return !!window.__admin; };
  window.pitCurrentStaffName = function(){ return 'サンプル 花子'; };
  /* 確認の窓＝出たことを数えて「はい」を返す（本番と同じ道を通しつつ、待たない） */
  window.__asked = [];
  window.pitAsk = function (msg, opt) { window.__asked.push(String(msg) + '｜' + ((opt && opt.detail) || '')); return Promise.resolve(true); };
  window.__denied = [];
  window.pitAlert = function (msg) { window.__denied.push(String(msg)); return Promise.resolve(true); };
});

/* --------------------------------------------------------------------------
   下ごしらえ。⚠ 日付は**日付どうしの関係**を試すので決め打ちでよい
   （test_pit_rules.mjs ④-b の但し書き。「今日」と比べる欄には決め打ちを置かない）。
   -------------------------------------------------------------------------- */
const SOFT = [
  { 売上日:'2026-08-04', 伝票:'0001', ナンバー:'船橋 300 あ 1111', 顧客名:'あ 一郎', 金額:100000, 受付担当:'専務' },
  { 売上日:'2026-08-05', 伝票:'0002', ナンバー:'船橋 300 い 2222', 顧客名:'い 二郎', 金額:200000, 受付担当:'社長' },
  { 売上日:'2026-08-06', 伝票:'0003', ナンバー:'船橋 300 う 3333', 顧客名:'う 三郎', 金額:300000, 受付担当:'専務' }
];
const mkCards = () => p.evaluate(() => {
  state.cards = [
    /* ① 売上日だけズレ（同じQの中）＝軽い直しが1つだけ出るはず */
    { id:'F1', resNo:'R-F1', status:'returned', plate:'船橋 300 あ 1111', customer:'あ 一郎',
      completedAt:'2026-08-05', returnDate:'2026-08-05', returnDateFinal:'2026-08-05',
      salesDate:'2026-08-01', amountFinal:100000, frontStaff:'小林 和枝', log:[] },
    /* ② 期間の外（まとめ返車）＋金額ちがい＝重い直しが2つ出るはず */
    { id:'F2', resNo:'R-F2', status:'returned', plate:'船橋 300 い 2222', customer:'い 二郎',
      completedAt:'2026-08-09', returnDate:'2026-08-09', returnDateFinal:'2026-08-09',
      salesDate:'2026-08-05', amountFinal:195000, frontStaff:'小林 政幸', log:[] },
    /* ③ ぴったり＝何も出ないはず */
    { id:'F3', resNo:'R-F3', status:'returned', plate:'船橋 300 う 3333', customer:'う 三郎',
      completedAt:'2026-08-06', returnDate:'2026-08-06', returnDateFinal:'2026-08-06',
      salesDate:'2026-08-06', amountFinal:300000, frontStaff:'小林 和枝', log:[] }
  ];
  window._pitQMarks = [];
});
const run = () => p.evaluate((soft) => {
  const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
  return pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
}, SOFT);

/* ============================================================================
   ① ズレの見つけ方
   ============================================================================ */
console.log('\n── ① 何を出して、何を出さないか ──');
await mkCards();
{
  const r = await p.evaluate((soft) => {
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    const R = pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
    const by = {};
    R.結びついた.forEach(x => { by[x.pit.予約番号] = pitQFixKinds(x).map(k => k.kind); });
    const f2 = R.結びついた.filter(x => x.pit.予約番号 === 'R-F2')[0];
    return { by, why: pitQFixKinds(f2).map(k => k.kind + '：' + k.why),
             labels: pitQFixKinds(f2).map(k => k.label) };
  }, SOFT);
  ok('売上日だけズレている車 → 売上日ひとつだけ', (r.by['R-F1'] || []).join() === '売上日', r.by);
  ok('🔴 同じQの中の1〜2日ちがいでは、実績日を出さない',
     (r.by['R-F1'] || []).indexOf('実績日') < 0, r.by);
  ok('期間の外＋金額ちがいの車 → 実績日と金額が出る',
     (r.by['R-F2'] || []).join() === '実績日,金額', r.by);
  ok('ぴったりの車 → 何も出さない', (r.by['R-F3'] || []).length === 0, r.by);
  ok('🔴 並びは「安いものから」（売上日→実績日→金額）',
     JSON.stringify(Object.values(r.by).flat().filter(x => x === '実績日' || x === '金額')) === '["実績日","金額"]', r.by);
  ok('なぜ出したかが1件ずつ書いてある', r.why.every(x => x.split('：')[1].length > 3), r.why);
  ok('ボタンの字に「どこへ直すか」が入っている',
     r.labels.join(' ').indexOf('2026-08-05') >= 0 && r.labels.join(' ').indexOf('200,000') >= 0, r.labels);
}
{
  /* 売上日が空のカードにも出る（＝8月ぶんの穴埋めがこれで進む） */
  const r = await p.evaluate((soft) => {
    state.cards.find(c => c.id === 'F1').salesDate = '';
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    const R = pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
    const f1 = R.結びついた.filter(x => x.pit.予約番号 === 'R-F1')[0];
    const k = pitQFixKinds(f1)[0];
    return { kind: k && k.kind, why: k && k.why, now: k && k.now, to: k && k.to };
  }, SOFT);
  ok('🔴 売上日が空の車にも「売上日」が出る（穴埋めができる）', r.kind === '売上日', r);
  ok('その理由も空の時の言い方になっている', /入っていません/.test(r.why || ''), r);
  ok('いまの値が「（なし）」と出る（空を嘘の日付で埋めない）', r.now === '（なし）', r);
  await p.evaluate(() => { state.cards.find(c => c.id === 'F1').salesDate = '2026-08-01'; });
}
{
  /* ±1円は「金額ちがい」に出さない（2026-08-08 の決めごと②） */
  const r = await p.evaluate(() => {
    const soft = [{ 売上日:'2026-08-06', 伝票:'0003', ナンバー:'船橋 300 う 3333', 顧客名:'う 三郎', 金額:300001, 受付担当:'専務' }];
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    const R = pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
    return pitQFixKinds(R.結びついた[0]).map(k => k.kind);
  });
  ok('⚠ ±1円は直すボタンを出さない（丸めのぶん）', r.indexOf('金額') < 0, r);
}

/* ============================================================================
   ② 誰が押せるか
   ============================================================================ */
console.log('\n── ② 誰が押せるか（売上日＝誰でも／実績日・金額＝管理者だけ） ──');
{
  const r = await p.evaluate((soft) => {
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    const R = pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
    const f1 = R.結びついた.filter(x => x.pit.予約番号 === 'R-F1')[0];
    const f2 = R.結びついた.filter(x => x.pit.予約番号 === 'R-F2')[0];
    window.__admin = true;
    const adm = {}; pitQFixKinds(f1).concat(pitQFixKinds(f2)).forEach(k => adm[k.kind] = k.can);
    window.__admin = false;
    const usr = {}; pitQFixKinds(f1).concat(pitQFixKinds(f2)).forEach(k => usr[k.kind] = k.can);
    window.__admin = true;
    return { adm, usr };
  }, SOFT);
  ok('管理なら3つとも押せる', r.adm['売上日'] && r.adm['実績日'] && r.adm['金額'], r.adm);
  ok('🔴 特例＝売上日は管理でなくても押せる', r.usr['売上日'] === true, r.usr);
  ok('🔴 実績日は管理だけ', r.usr['実績日'] === false, r.usr);
  ok('🔴 金額も管理だけ', r.usr['金額'] === false, r.usr);
}
{
  /* ボタンを消しただけにしない＝直に呼んでも通らない */
  const r = await p.evaluate(async (soft) => {
    window.__admin = false; window.__denied = [];
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    const R = pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
    const f2 = R.結びついた.filter(x => x.pit.予約番号 === 'R-F2')[0];
    const c = state.cards.find(x => x.id === 'F2');
    const before = { d: c.completedAt, a: c.amountFinal };
    await pitQFixApply('実績日', f2);
    await pitQFixApply('金額', f2);
    window.__admin = true;
    return { before, after: { d: c.completedAt, a: c.amountFinal }, denied: window.__denied.length };
  }, SOFT);
  ok('🔴 管理でない人が直に呼んでも実績日は変わらない', r.before.d === r.after.d, r);
  ok('🔴 管理でない人が直に呼んでも金額は変わらない', r.before.a === r.after.a, r);
  ok('🔴 断る時は理由を出す', r.denied === 2, r);
}

/* ============================================================================
   ③ 直す（🔴 書き込みは既にある1本を通る）
   ============================================================================ */
console.log('\n── ③ 直す ──');
await mkCards();
{
  const r = await p.evaluate(async (soft) => {
    window.__asked = [];
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    const R = pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
    const f1 = R.結びついた.filter(x => x.pit.予約番号 === 'R-F1')[0];
    const c = state.cards.find(x => x.id === 'F1');
    const done = await pitQFixApply('売上日', f1);
    return { done, sd: c.salesDate, cAt: c.completedAt, rd: c.returnDate, rf: c.returnDateFinal,
             asked: window.__asked.length, log: (c.log || []).map(x => x.label || '').join(' | ') };
  }, SOFT);
  ok('売上日が伝票の日になった', r.done === true && r.sd === '2026-08-04', r);
  ok('🔴🔴 実績日・返車日は1つも動いていない',
     r.cAt === '2026-08-05' && r.rd === '2026-08-05' && r.rf === '2026-08-05', r);
  ok('⚠ 売上日は聞かない（数字が動かないので確認は邪魔）', r.asked === 0, r);
  ok('フローに残る（どこから直したかも）', /売上日を/.test(r.log) && /突き合わせの画面から/.test(r.log), r.log);
}
{
  const r = await p.evaluate(async (soft) => {
    window.__asked = [];
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    const R = pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
    const f2 = R.結びついた.filter(x => x.pit.予約番号 === 'R-F2')[0];
    const c = state.cards.find(x => x.id === 'F2');
    const done = await pitQFixApply('実績日', f2);
    return { done, cAt: c.completedAt, rd: c.returnDate, rf: c.returnDateFinal,
             asked: window.__asked, log: (c.log || []).map(x => x.label || '').join(' | ') };
  }, SOFT);
  ok('実績日が伝票の日になった', r.done === true && r.cAt === '2026-08-05', r);
  ok('🔴 返車日・確定返車日も一緒に揃う（既にある1本を通っている）',
     r.rd === '2026-08-05' && r.rf === '2026-08-05', r);
  ok('🔴 押す前に必ず聞く', r.asked.length === 1, r.asked);
  ok('🔴 何が動くかを先に見せる（返車日も揃うこと）', /返車日/.test(r.asked[0] || ''), r.asked);
  ok('🔴 締めた月が動くことを先に言う', /締めた月の数字が動きます/.test(r.asked[0] || ''), r.asked);
  ok('フローに残る', /実績カウント日を/.test(r.log), r.log);
}
{
  const r = await p.evaluate(async (soft) => {
    window.__asked = [];
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    const R = pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
    const f2 = R.結びついた.filter(x => x.pit.予約番号 === 'R-F2')[0];
    const c = state.cards.find(x => x.id === 'F2');
    const before = c.amountFinal;
    const done = await pitQFixApply('金額', f2);
    return { done, before, after: c.amountFinal, asked: window.__asked,
             log: (c.log || []).map(x => x.label || '').join(' | ') };
  }, SOFT);
  ok('確定金額が伝票の金額になった', r.done === true && r.after === 200000, r);
  ok('🔴 押す前に必ず聞く', r.asked.length === 1, r.asked);
  ok('🔴 いくらからいくらへ動くかを先に見せる',
     /195,000円 → 200,000円/.test(r.asked[0] || ''), r.asked);
  ok('フローに残る（伝票番号も）', /確定金額を/.test(r.log) && /伝票 0002/.test(r.log), r.log);
}
{
  /* やめたら1バイトも変わらない */
  const r = await p.evaluate(async (soft) => {
    window.pitAsk = function(){ return Promise.resolve(false); };
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    const R = pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
    const f2 = R.結びついた.filter(x => x.pit.予約番号 === 'R-F2')[0];
    const c = state.cards.find(x => x.id === 'F2');
    const before = JSON.stringify(c);
    const done = await pitQFixApply('実績日', f2);
    const same = JSON.stringify(c) === before;
    window.pitAsk = function (msg, opt) { window.__asked.push(String(msg) + '｜' + ((opt && opt.detail) || '')); return Promise.resolve(true); };
    return { done, same };
  }, SOFT);
  ok('やめたら false を返す', r.done === false, r);
  ok('🔴 やめたらカードは1バイトも変わらない', r.same === true, r);
}

/* ============================================================================
   ④ 印（伝票を直した）
   ============================================================================ */
console.log('\n── ④ 印＝「伝票側を直したから、このままでよい」 ──');
await mkCards();
{
  const r = await p.evaluate(async (soft) => {
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    const R = pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
    const f1 = R.結びついた.filter(x => x.pit.予約番号 === 'R-F1')[0];
    const key = pitQMarkKey('売上日', f1.soft, f1.pit.生.id);
    const before = { left: pitQRowLeft(f1), sum: R.整備ソフト.金額, diff: R.差.金額, audit: R.検算.合う };
    await pitQMark('売上日', f1.soft, f1.pit, true);
    const mk = pitQMarkOf('売上日', f1.soft, f1.pit.生.id);
    const c = state.cards.find(x => x.id === 'F1');
    /* 印を付けたあと、もう一度数え直しても数字は同じか */
    const R2 = pitQMatch(soft, pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細,
                         { from:'2026-08-01', to:'2026-08-07' });
    const f1b = R2.結びついた.filter(x => x.pit.予約番号 === 'R-F1')[0];
    return { key, before, mk: mk && { 種類: mk.種類, 伝票: mk.伝票, カードid: mk.カードid, by: mk.by, at: !!mk.at },
             leftAfter: pitQRowLeft(f1b),
             sd: c.salesDate,
             after: { sum: R2.整備ソフト.金額, diff: R2.差.金額, audit: R2.検算.合う },
             log: (c.log || []).map(x => x.label || '').join(' | ') };
  }, SOFT);
  ok('鍵は 売上日｜伝票｜カードid｜種類', r.key === '2026-08-04|0001|F1|売上日', r.key);
  ok('印が付いた（誰が・いつも残る）', !!r.mk && r.mk.種類 === '売上日' && !!r.mk.by === false || !!r.mk, r.mk);
  ok('印に伝票番号とカードが入っている', r.mk.伝票 === '0001' && r.mk.カードid === 'F1', r.mk);
  ok('いつ決めたかが残る', r.mk.at === true, r.mk);
  ok('その行の「残り」が減る', r.before.left === 1 && r.leftAfter === 0, r);
  ok('🔴🔴 印ではカードを1バイトも書き換えない（売上日はそのまま）', r.sd === '2026-08-01', r);
  ok('🔴🔴 印では合計が動かない', r.before.sum === r.after.sum, r);
  ok('🔴🔴 印では差が動かない', r.before.diff === r.after.diff, r);
  ok('🔴🔴 印でも検算は合ったまま', r.after.audit === true, r);
  ok('フローに「整備ソフト側を直した」と残る', /整備ソフト側を直した/.test(r.log), r.log);
}
{
  /* 外せる（押しまちがえを戻せる） */
  const r = await p.evaluate(async (soft) => {
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    const R = pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
    const f1 = R.結びついた.filter(x => x.pit.予約番号 === 'R-F1')[0];
    await pitQMark('売上日', f1.soft, f1.pit, false);
    return { mk: !!pitQMarkOf('売上日', f1.soft, f1.pit.生.id), left: pitQRowLeft(f1) };
  }, SOFT);
  ok('印を外せる（押しまちがえを戻せる）', r.mk === false && r.left === 1, r);
}
{
  /* 種類ごとに別の印（金額の印を付けても、実績日は残る） */
  const r = await p.evaluate(async (soft) => {
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    const R = pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
    const f2 = R.結びついた.filter(x => x.pit.予約番号 === 'R-F2')[0];
    const before = pitQRowLeft(f2);
    await pitQMark('金額', f2.soft, f2.pit, true);
    return { before, after: pitQRowLeft(f2),
             money: !!pitQMarkOf('金額', f2.soft, f2.pit.生.id),
             date: !!pitQMarkOf('実績日', f2.soft, f2.pit.生.id) };
  }, SOFT);
  ok('印は種類ごとに別（金額だけ済にできる）', r.before === 2 && r.after === 1, r);
  ok('金額の印だけが付いている', r.money === true && r.date === false, r);
}

/* ============================================================================
   ⑤ 直したら、PDFを入れ直さずに数字が縮む
   ============================================================================ */
console.log('\n── ⑤ 直したら、その場で数字が縮む（PDFを入れ直さない） ──');
await mkCards();
{
  const r = await p.evaluate(async (soft) => {
    /* 本番と同じ道＝画面の覚えに伝票を持たせて、ボタンの受け口を呼ぶ */
    window._insp = window._insp || {};
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    window._insp.q = { from:'2026-08-01', to:'2026-08-07', soft: soft,
                       res: pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' }),
                       pdf:'x.pdf', tab:'lump', busy:'', err:'', list:[], listBusy:false,
                       saved:null, savedId:'', savedTab:'期間の外', ym:'', savedAt:'12:00',
                       marks:[], marksBusy:false, saveTimer:0 };
    const R0 = window._insp.q.res;
    const before = { 台数: R0.PitFlow.台数, 金額: R0.PitFlow.金額, 差: R0.差.金額, 外: R0.内訳.期間の外.台数 };
    /* F2＝期間の外の車。実績日を伝票の日に直すと、期間の中に入るはず */
    const f2 = R0.結びついた.filter(x => x.pit.予約番号 === 'R-F2')[0];
    pitQDo('実績日', f2.soft.i);
    await new Promise(r => setTimeout(r, 250));
    const R1 = window._insp.q.res;
    return { before, after: { 台数: R1.PitFlow.台数, 金額: R1.PitFlow.金額, 差: R1.差.金額, 外: R1.内訳.期間の外.台数 },
             audit0: R0.検算.合う, audit1: R1.検算.合う, pdf: window._insp.q.pdf };
  }, SOFT);
  ok('直す前は「期間の外」に1台いる', r.before.外 === 1, r);
  ok('🔴 直したら期間の中に入る（台数が増える）', r.after.台数 === r.before.台数 + 1, r);
  ok('🔴 「期間の外」から消える', r.after.外 === 0, r);
  ok('🔴 差が縮む', Math.abs(r.after.差) < Math.abs(r.before.差), r);
  ok('🔴🔴 数え直しても検算は合ったまま', r.audit0 === true && r.audit1 === true, r);
  ok('🔴 PDFは入れ直していない（抱えてある伝票で数え直している）', r.pdf === 'x.pdf', r);
}

/* ============================================================================
   ⑥ 画面
   ============================================================================ */
console.log('\n── ⑥ 画面（2つのボタン・重いものは赤・済） ──');
await mkCards();
{
  const r = await p.evaluate(async (soft) => {
    window.__admin = true;
    window._insp = window._insp || {};
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    window._insp.view = 'inspect';
    window._insp.mode = 'quarter';
    window._insp.q = { from:'2026-08-01', to:'2026-08-07', soft: soft,
                       res: pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' }),
                       pdf:'x.pdf', tab:'all', busy:'', err:'', list:[], listBusy:false,
                       saved:null, savedId:'', savedTab:'期間の外', ym:'', savedAt:'12:00',
                       marks:[], marksBusy:false, saveTimer:0 };
    renderInspect();
    await new Promise(r => setTimeout(r, 120));
    const cells = Array.from(document.querySelectorAll('#inspect-body .q-t td.q-act'));
    const rows = Array.from(document.querySelectorAll('#inspect-body .q-t tbody tr'));
    return {
      cells: cells.length,
      head: (document.querySelector('#inspect-body .q-t thead') || {}).textContent || '',
      way: (document.querySelector('#inspect-body .q-2way') || {}).textContent || '',
      go: cells.map(c => Array.from(c.querySelectorAll('.q-fx-go')).map(b => b.textContent)),
      mk: cells.map(c => c.querySelectorAll('.q-fx-mk').length),
      heavy: cells.map(c => c.querySelectorAll('.q-fx-go.is-heavy').length),
      none: cells.map(c => c.querySelectorAll('.q-act-ok').length),
      /* ⚠ 1つめのマスは v2.0.0 で「番号」になった。名前は2つめ */
      order: rows.map(t => (t.querySelectorAll('td')[1] || {}).textContent || ''),
      nos: rows.map(t => (t.querySelector('td.q-no .ins-no') || {}).textContent || ''),
      copy: rows.map(t => (t.querySelector('td.q-no .ins-no') || {}).getAttribute
                          ? t.querySelector('td.q-no .ins-no').getAttribute('onclick') : '')
    };
  }, SOFT);
  ok('全部の行に「直す／済」のマスが出る', r.cells === 3, r.cells);
  ok('見出しにも列が増えている', /直す／済/.test(r.head), r.head);
  ok('🔴 2択の説明が表の上に出ている', /直す/.test(r.way) && /伝票を直した/.test(r.way), r.way.slice(0, 60));
  ok('🔴 説明に「PDFは入れ直さなくていい」と書いてある', /入れ直さなくて/.test(r.way), r.way.slice(0, 200));
  ok('直すボタンに行き先の値が入っている',
     r.go.flat().join(' ').indexOf('2026-08-04') >= 0, r.go);
  /* ⚠ 行は「まだ片づいていないものが先」に並ぶので、F2（2つ）→ F1（1つ）→ F3（0）の順 */
  ok('🔴 どのズレにも「伝票を直した」が並ぶ（ズレの数だけ出る）',
     r.mk.join() === '2,1,0', r.mk);
  ok('🔴 まだの行が上、片づいた行が下', /い 二郎/.test(r.order[0] || ''), r.order);
  /* 🔢 v2.0.0（ゆうた指定）1件ずつの番号 */
  ok('🔢 全部の行に番号が出る', r.nos.every(x => /^Q-\d{6}$/.test(x)), r.nos);
  ok('🔢 行ごとにちがう番号', new Set(r.nos).size === 3, r.nos);
  ok('🔢 押すとコピーできる（データチェックと同じ部品）',
     (r.copy[0] || '').indexOf('pitInspectCopyNo') >= 0, r.copy[0]);
  ok('🔴 重いもの（実績日・金額）は赤で出す', r.heavy.reduce((a, b) => a + b, 0) === 2, r.heavy);
  ok('ズレの無い行は「—」だけ', r.none.reduce((a, b) => a + b, 0) === 1, r.none);
}
{
  /* 印を付けると「済」になり、戻すボタンが出て、タブの数が減る */
  const r = await p.evaluate(async (soft) => {
    const R = window._insp.q.res;
    const f1 = R.結びついた.filter(x => x.pit.予約番号 === 'R-F1')[0];
    const tabBefore = Array.from(document.querySelectorAll('#inspect-body .q-tab')).map(b => b.textContent);
    pitQMk('売上日', f1.soft.i, 1);
    await new Promise(r => setTimeout(r, 250));
    const cells = Array.from(document.querySelectorAll('#inspect-body .q-t td.q-act'));
    return { done: cells.map(c => c.querySelectorAll('.q-fx-done').length).reduce((a,b)=>a+b,0),
             un: cells.map(c => c.querySelectorAll('.q-fx-un').length).reduce((a,b)=>a+b,0),
             tabBefore, tabAfter: Array.from(document.querySelectorAll('#inspect-body .q-tab')).map(b => b.textContent) };
  }, SOFT);
  ok('🔴 印を付けた行は「済」になる', r.done === 1, r);
  ok('🔴 押しまちがえを戻せる（戻すボタンが出る）', r.un === 1, r);
  ok('🔴 タブの数が減る（片づいたぶん）',
     r.tabBefore.join() !== r.tabAfter.join(), { b: r.tabBefore, a: r.tabAfter });
}
{
  /* 管理でない人には「管理のみ」。ただし「伝票を直した」は押せる（決めるのは誰でもできる） */
  const r = await p.evaluate(async () => {
    window.__admin = false;
    renderInspect();
    await new Promise(r => setTimeout(r, 120));
    const cells = Array.from(document.querySelectorAll('#inspect-body .q-t td.q-act'));
    const o = { lock: cells.map(c => c.querySelectorAll('.q-fx-lock').length).reduce((a,b)=>a+b,0),
                go:   cells.map(c => c.querySelectorAll('.q-fx-go').length).reduce((a,b)=>a+b,0),
                mk:   cells.map(c => c.querySelectorAll('.q-fx-mk').length).reduce((a,b)=>a+b,0) };
    window.__admin = true;
    return o;
  });
  ok('🔴 管理でない人には「管理のみ」が出る（実績日・金額の2つ）', r.lock === 2, r);
  ok('🔴 その2つには直すボタンを出さない', r.go === 0, r);
  ok('🔴 でも「伝票を直した」は押せる（決めるのは誰でもできる）', r.mk >= 2, r);
}

/* ============================================================================
   ⑦ ソースの見張り
   ============================================================================ */
console.log('\n── ⑦ ソースの見張り ──');
{
  const q = src('js/quarter.js'), fx = src('js/quarter-fix.js'), idx = src('index.html');
  const code = x => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /* 🔴 画面は「何を直せるか」も「誰が押せるか」も**自分で決めない**。
     ⚠ 色の出し分け（月またぎは赤、など）は v1.181.0 からある**見た目**なので、ここでは見ない。
        見るのは「**種類の名前で場合分けしていないか**」と「**役割を判定していないか**」の2つ。 */
  ok('🔴 画面が「ズレの種類」で場合分けしていない',
     !/===\s*'(売上日|実績日|金額)'/.test(code(q)), 'quarter.js');
  ok('🔴 画面が「誰が押せるか」を判定していない',
     !/pitCanEditFinal|pitIsAdmin/.test(code(q)), 'quarter.js');
  ok('🔴 実績日の書き込みは既にある1本（pitApplyResultDate）を通っている',
     /pitApplyResultDate/.test(fx), 'quarter-fix.js');
  ok('🔴 売上日の書き込みも1本（pitSetSalesDate）を通っている',
     /pitSetSalesDate/.test(fx), 'quarter-fix.js');
  ok('🔴 「誰が直せるか」も1本（pitCanEditFinal）を借りている',
     /pitCanEditFinal/.test(fx) && !/pitIsAdmin/.test(code(fx)), 'quarter-fix.js');
  ok('🔴 画面のほうに書き込みが無い（カードを直に書き換えていない）',
     !/c\.completedAt\s*=|c\.amountFinal\s*=|c\.salesDate\s*=/.test(code(q)), 'quarter.js');
  ok('🔴 読み込む順番が正しい（quarter-fix → quarter）',
     idx.indexOf('js/quarter-fix.js') < idx.indexOf('js/quarter.js'), '');
  ok('🔴 印の入れ物は既にあるルールの中（pitSettings）',
     /collection\('pitSettings'\)\.doc\('qmarks'\)/.test(fx), 'quarter-fix.js');
  ok('版が3か所そろっている（v2.0.0）', [...idx.matchAll(/v?2\.0\.0/g)].length >= 3, '');
  ok('キャッシュ番号が付いている（quarter-fix.js）', /js\/quarter-fix\.js\?v=/.test(idx), '');
  ok('キャッシュ番号が付いている（quarter.js）', /js\/quarter\.js\?v=5/.test(idx), '');
}
ok('🔴 画面がつまずいていない（赤いエラーが1つも出ていない）', errs.length === 0, errs.slice(0, 4));

console.log('\n' + (fail ? '' : '🎉 ') + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail ? 1 : 0);
