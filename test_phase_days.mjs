/* PitFlow v1.58.0 ── フローの記録を「本当に動いた実データ」として扱う
   -------------------------------------------------------------------
   ◎ゆうた指定
     「**各フローの編集は実際のデータとして扱ってほしい。
       例えば見積もり中に入れた日を変えたら、見積もりフェーズのカウント日数自体を改めてほしい**」
   ◎正体
     「いまの工程に入った時刻」は `card.phaseAt`（工程を動かした瞬間に書いた**写し**）だけを見ていた。
     フローの日時を直しても写しは変わらないので、**「◯日目」が動かなかった**。
   ◎これから
     🔴 **フローの記録が先・写しは予備**（flow-pit.js の `pitPhaseStartMs` に一本化）。
     ⚠ 直した時は写し（phaseAt）も書き直して揃える。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8981      ← 別ウィンドウ
     node test_phase_days.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8981;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.PitFlowLog && window.pitPhaseStartMs', null, { timeout: 25000 });
await p.waitForTimeout(800);

/* 5日前に見積もり中へ入ったカードを1枚（写しの phaseAt もその時のもの） */
const setup = async () => p.evaluate(() => {
  const D = 86400000;
  const now = Date.now();
  state.cards = state.cards.filter(x => x.id !== 'PH1');
  state.cards.push({
    id: 'PH1', resNo: 'R-PH1', status: 'estim', customer: '工程 太郎', car: 'アクア',
    boardId: 'default', division: 'div1', workType: 'shaken',
    reserveDate: '2026-08-01',
    phaseAt: now - 5 * D,
    log: [
      { type: 'phase', from: 'check', to: 'estim', at: now - 5 * D, atTxt: '', by: '社長' }
    ]
  });
  return { now: now };
});

const dayNoOf = () => p.evaluate(() => {
  const c = state.cards.find(x => x.id === 'PH1');
  const ms = pitPhaseStartMs(c);
  return { ms: ms, dayNo: (ms != null) ? (Math.floor((Date.now() - ms) / 86400000) + 1) : null, phaseAt: c.phaseAt };
});

console.log('\n── 📅 いまの工程に入った時刻は「フローの記録」から取る ──');
{
  await setup();
  const a = await dayNoOf();
  ok('入る前の状態＝5日前なので「6日目」', a.dayNo === 6, a);

  /* 🔴 本題：フローの日時を「いま」に直すと、日数が改まる
     ⚠ 「◯日目」は**経過24時間**で数える（外注・予約ビューの元からの決めごと）ので、
        試験も**同じ時刻で N日前**を作る＝時刻のズレで1日ぶれないようにする。 */
  const after = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'PH1');
    const pad = n => (n < 10 ? '0' : '') + n;
    const toLocal = ms => { const d = new Date(ms);
      return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes()); };
    PitFlowLog.setAt('PH1', 0, toLocal(Date.now()));
    const ms = pitPhaseStartMs(c);
    return { dayNo: (ms != null) ? (Math.floor((Date.now() - ms) / 86400000) + 1) : null,
             logAt: c.log[0].at, phaseAt: c.phaseAt, atTxt: c.log[0].atTxt };
  });
  ok('🔴 フローの日時を「いま」に直すと「1日目」になる', after.dayNo === 1, after);
  ok('🔴 写し（phaseAt）も記録に合わせて書き直される', after.phaseAt === after.logAt, after);
  ok('画面に出す時刻の文字も揃う', !!after.atTxt, after);

  /* 過去に戻すと、また日数が伸びる */
  const back = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'PH1');
    const pad = n => (n < 10 ? '0' : '') + n;
    const toLocal = ms => { const d = new Date(ms);
      return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes()); };
    PitFlowLog.setAt('PH1', 0, toLocal(Date.now() - 9 * 86400000));
    const ms = pitPhaseStartMs(c);
    return { dayNo: (ms != null) ? (Math.floor((Date.now() - ms) / 86400000) + 1) : null, phaseAt: c.phaseAt, logAt: c.log[0].at };
  });
  ok('🔴 9日前に直すと「10日目」になる', back.dayNo === 10, back);
  ok('写しも一緒に動く', back.phaseAt === back.logAt, back);
}

console.log('\n── どの記録を起点にするか（いまの工程に入った最後の1件） ──');
{
  const r = await p.evaluate(() => {
    const D = 86400000, now = Date.now();
    const c = state.cards.find(x => x.id === 'PH1');
    c.status = 'estim';
    c.log = [
      { type: 'phase', from: 'reserved', to: 'check', at: now - 20 * D },
      { type: 'phase', from: 'check',    to: 'estim', at: now - 10 * D },
      { type: 'phase', from: 'estim',    to: 'work',  at: now -  8 * D },
      { type: 'phase', from: 'work',     to: 'estim', at: now -  3 * D },   /* ← 戻ってきた。これが起点 */
      { label: '部品を発注した', at: now - 1 * D, manual: true }
    ];
    const ms = pitPhaseStartMs(c);
    return { dayNo: Math.floor((Date.now() - ms) / 86400000) + 1 };
  });
  ok('🔴 一度出て戻ってきたら、戻ってきた方が起点（4日目）', r.dayNo === 4, r);

  const other = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'PH1');
    c.status = 'work';                       /* いまは作業中＝to==='work' の記録を見る */
    const ms = pitPhaseStartMs(c);
    return { dayNo: Math.floor((Date.now() - ms) / 86400000) + 1 };
  });
  ok('工程が変われば、その工程の記録を見る（9日目）', other.dayNo === 9, other);

  /* 手で足した記録は起点にしない */
  const manual = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'PH1');
    c.status = 'estim';
    const before = pitPhaseStartMs(c);
    c.log.push({ label: '見積りを連絡', at: Date.now(), manual: true });
    return { same: pitPhaseStartMs(c) === before };
  });
  ok('手で足した記録は起点にしない', manual.same === true, manual);
}

console.log('\n── 記録が無い古いカード・空のカードでも落ちない ──');
{
  const r = await p.evaluate(() => {
    const D = 86400000;
    const old1 = { id: 'o1', status: 'estim', phaseAt: Date.now() - 2 * D, log: [] };
    const old2 = { id: 'o2', status: 'estim', reserveDate: '2026-08-01', log: [] };
    const old3 = { id: 'o3', status: 'estim' };
    return {
      keep:  Math.floor((Date.now() - pitPhaseStartMs(old1)) / D) + 1,
      resv:  pitPhaseStartMs(old2) != null,
      none:  pitPhaseStartMs(old3),
      nul:   pitPhaseStartMs(null)
    };
  });
  ok('記録が無ければ写し（phaseAt）を使う（3日目）', r.keep === 3, r);
  ok('写しも無ければ入庫日を使う', r.resv === true, r);
  ok('どれも無ければ null（落ちない）', r.none === null && r.nul === null, r);
}

console.log('\n── 記録を消した時も起点が改まる ──');
{
  const r = await p.evaluate(() => {
    const D = 86400000, now = Date.now();
    state.cards = state.cards.filter(x => x.id !== 'PH2');
    state.cards.push({ id: 'PH2', resNo: 'R-PH2', status: 'estim', customer: '消す 次郎', log: [
      { type: 'phase', from: 'check', to: 'estim', at: now - 12 * D },
      { type: 'phase', from: 'estim', to: 'work',  at: now -  6 * D },
      { type: 'phase', from: 'work',  to: 'estim', at: now -  2 * D }
    ], phaseAt: now - 2 * D });
    const before = Math.floor((Date.now() - pitPhaseStartMs(state.cards.find(x=>x.id==='PH2'))) / D) + 1;
    PitFlowLog.del('PH2', 2);            /* 最後の「作業中→見積もり中」を消す */
    const c = state.cards.find(x => x.id === 'PH2');
    return { before: before, after: Math.floor((Date.now() - pitPhaseStartMs(c)) / D) + 1, phaseAt: c.phaseAt };
  });
  ok('消す前は3日目', r.before === 3, r);
  ok('🔴 消したら1つ前の記録が起点になる（13日目）', r.after === 13, r);
  ok('写しも書き直される', typeof r.phaseAt === 'number', r);
}

console.log('\n── ソースの見張り（写しを直接見ている所が残っていないか） ──');
{
  const files = ['js/card-view.js', 'js/card-hover.js', 'js/outsource.js', 'js/reserve.js'];
  files.forEach(function(f){
    const src = fs.readFileSync(f, 'utf8');
    ok(f + ' が共通の起点（pitPhaseStartMs）を通している', /pitPhaseStartMs\(/.test(src), f);
    /* 「Date.now() - c.phaseAt」のような、写しを直接使った計算が残っていないこと */
    ok(f + ' に写しの直接計算が残っていない', !/Date\.now\(\)\s*-\s*c\.phaseAt/.test(src), f);
  });
  const fp = fs.readFileSync('js/flow-pit.js', 'utf8');
  ok('起点の作り方は flow-pit.js の1か所だけ', /function phaseStartMs/.test(fp) && /w\.pitPhaseStartMs = phaseStartMs/.test(fp));
  ok('日時を直したら写しを揃えている', /setAt[\s\S]{0,600}syncPhaseAt\(c\)/.test(fp));
  ok('記録を消したら写しを揃えている', /function del[\s\S]{0,400}syncPhaseAt\(c\)/.test(fp));
  ok('直したら背後の一覧も描き直している', /function refreshViews/.test(fp));

  const ix = fs.readFileSync('index.html', 'utf8');
  const vs = [(ix.match(/app-version" content="([\d.]+)"/) || [])[1],
              (ix.match(/login-ver">v([\d.]+)</) || [])[1],
              (ix.match(/class="ver">v([\d.]+)</) || [])[1]];
  ok('版が3か所そろっている', vs.every(Boolean) && new Set(vs).size === 1, vs);
  /* 🔴 版は上がる一方なので、決め打ちで書かない（毎回テストが古くなるため）。
     **この節を書いた時の版（1.58.0）より下がっていないこと**だけを見る。 */
  const _num = v => String(v||'').split('.').map(Number);
  const _ge = (a, b) => { const x=_num(a), y=_num(b);
    for (let i=0;i<3;i++){ if ((x[i]||0) !== (y[i]||0)) return (x[i]||0) > (y[i]||0); } return true; };
  ok('版が v1.58.0 より下がっていない', _ge(vs[0], '1.58.0'), vs);
  ok('直した5本にキャッシュ番号が付いている',
     /flow-pit\.js\?v=\d+/.test(ix) && /card-view\.js\?v=\d+/.test(ix) && /card-hover\.js\?v=\d+/.test(ix)
     && /outsource\.js\?v=\d+/.test(ix) && /reserve\.js\?v=\d+/.test(ix));
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
