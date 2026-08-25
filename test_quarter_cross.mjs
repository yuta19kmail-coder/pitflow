/* PitFlow v2.8.0 ── Qをまたいだ車を、二度言わない
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-08-25）
     🗣「今PitFlowとフロントマンのそれぞれにデータがないが量産される。
     　　多分Qまたぎの車両を紐づけられてないんだと思う。
     　　例 Q1 フロントマンになし／Q2 PitFlowになし → セットの車では？」
   ◎なにが起きていたか（手元で組んで再現した）
     伝票 8/10（Q2）・カードの実績 8/5（Q1）の車を 8/1〜8/15 のPDFで見ると
       Q2 … 伝票と結ばれる（期間の外）  ← 正しい
       Q1 … **PitFlowだけ**に出る       ← 嘘。伝票はちゃんと在る（隣のQに）
     `pitQMatch` は**1組ぶんしか知らない**ので、隣の組で結ばれたことが見えていなかった。
     月まるごとのPDF（4組）だと、Qの境目の車が全部これをやる＝**量産**。
   ◎この試験がやること
     🔴 ① Qをまたいだ車が、両方のQで「無い車」に化けないこと
     🔴 ② **金額は1円も動かないこと**（内訳・検算が v2.8.0 の前と同じ）
     🔴 ③ 窓は2つ（見える45日／結ぶ14日）。**結ぶ側は緩んでいない**こと
           ＝ 46日離れた別の入庫と勝手に結ばないこと
     🔴 ④ 画面が赤ではなく黄で出すこと／残り件数から外すこと
     🔴 ⑤ 残す側（quarter-store.js）と戻す側（quarter.js）に新しい項目が通っていること
   ◎使い方
     node /tmp/srv.js（別ウィンドウ・8991番）
     node test_quarter_cross.mjs                                       */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

/* ================= ① コードを機械で読む ================= */
console.log('\n── 🔍 窓が2つに分かれているか ──');
{
  const dir   = path.join(process.cwd(), 'js');
  const match = fs.readFileSync(path.join(dir, 'quarter-match.js'), 'utf8');
  const store = fs.readFileSync(path.join(dir, 'quarter-store.js'), 'utf8');
  const view  = fs.readFileSync(path.join(dir, 'quarter.js'), 'utf8');
  ok('見える窓は45日（pitQCollect の既定）', /opt\.pad\s*==\s*null\s*\?\s*45/.test(match));
  ok('🔴 結ぶ窓は14日のまま（pitQMatch の既定）', /結ぶ幅\s*==\s*null\s*\?\s*14/.test(match));
  ok('組をまたいで見る1本がある', /w\.pitQCrossLink\s*=/.test(match));
  ok('🔴 画面が自分で判定していない（名札を読むだけ）',
     !/別のQ\s*=\s*['"]/.test(view.replace(/var\s+別Q\s*=[^;]*;/g, '')));
  ok('画面が組をまたぐ1本を呼んでいる', /pitQCrossLink\(/.test(view));
  ok('残す側に 別のQ がある', /別のQ:\s*s\(r\.別のQ\)/.test(store));
  ok('残す側に カード別Q がある', /カード別Q:\s*s\(r\.カード別Q\)/.test(store));
  ok('戻す側でも 別のQ を読む', /別のQ:\s*r\.別のQ/.test(view));
  ok('戻す側でも カード別Q を読む', /カード別Q:\s*r\.カード別Q/.test(view));
  ok('🔴 残り件数から「別のQ」を外している', /PitFlowだけ[^\n]*filter[^\n]*!x\.別のQ/.test(view));
}

/* ================= ② 物差しを実際に動かす ================= */
const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text().slice(0, 200)); });
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.pitQMatch && window.pitQCrossLink && window.pitQSplit', null, { timeout: 25000 });
await p.waitForTimeout(600);

/* 材料を入れて、組ごとに数えて、組をまたいで見る。
   ⚠ state.cards を**入れ替えて**使うので、最後に元へ戻す。 */
const run = (cards, term, soft) => p.evaluate(([cs, tm, sf]) => {
  const keep = window.state.cards;
  window.state.cards = cs;
  try {
    const sp = window.pitQSplit(tm, sf);
    const groups = sp.組.map(g => ({
      label: g.label, from: g.from, to: g.to,
      res: window.pitQMatch(g.伝票, window.pitQCollect({ from: g.from, to: g.to }).明細, { from: g.from, to: g.to })
    }));
    window.pitQCrossLink(groups);
    return groups.map(g => ({
      label: g.label, from: g.from, to: g.to,
      結び: g.res.結びついた.map(x => x.soft.伝票 + '→' + x.pit.生.id + '/' + x.結び方 + (x.期間の外 ? '/期間の外' : '')),
      soft: g.res.整備ソフトだけ.map(x => ({ 伝票: x.soft.伝票, カード: !!x.カード, 別Q: x.カード別Q || '' })),
      pit:  g.res.PitFlowだけ.map(x => ({ id: x.生.id, 別Q: x.別のQ || '', 確定: !!x.別のQ確定 })),
      内訳: g.res.内訳, 検算: g.res.検算,
      残り: window.pitQNokori ? window.pitQNokori(g.res) : -1,
      /* 「残り」に効いているのが**結びついた行だけ**か（＝別のQは効いていないか）を見るため */
      非OK結び: g.res.結びついた.filter(x => x.組 !== 'ok').length
    }));
  } finally { window.state.cards = keep; }
}, [cards, term, soft]);

const mk = (id, ret, sale, plate, cust, car, amt) => ({
  id, resNo: 'R' + id, status: 'returned', completedAt: ret, returnDateFinal: ret,
  salesDate: sale, plate, customer: cust, car, amountFinal: amt, frontStaff: '蓮沼'
});

console.log('\n── 🔗 ①同じPDFの中でQをまたぐ（ゆうたの例そのもの） ──');
{
  const g = await run(
    [mk('A', '2026-08-05', '2026-08-10', '習志野500あ1111', 'Ａさん', 'ノア', 100000),
     mk('B', '2026-08-10', '2026-08-07', '習志野500い2222', 'Ｂさん', 'フィット', 200000),
     mk('C', '2026-08-03', '2026-08-03', '習志野500う3333', 'Ｃさん', 'ハスラー', 300000)],
    { from: '2026-08-01', to: '2026-08-15' },
    [{ 売上日:'2026-08-10', 伝票:'D-A', ナンバー:'習志野 500 あ 11-11', 顧客名:'Ａさん', 車種:'ノア',    金額:100000, 受付担当:'蓮沼' },
     { 売上日:'2026-08-07', 伝票:'D-B', ナンバー:'習志野 500 い 22-22', 顧客名:'Ｂさん', 車種:'フィット', 金額:200000, 受付担当:'蓮沼' },
     { 売上日:'2026-08-03', 伝票:'D-C', ナンバー:'習志野 500 う 33-33', 顧客名:'Ｃさん', 車種:'ハスラー', 金額:300000, 受付担当:'蓮沼' }]);

  ok('2つの組に割れる', g.length === 2, g.map(x => x.label));
  const q1 = g[0], q2 = g[1];
  ok('Q1：伝票が無い車は出ていない（整備ソフトだけ 0件）', q1.soft.length === 0, q1.soft);
  ok('Q2：伝票が無い車は出ていない（整備ソフトだけ 0件）', q2.soft.length === 0, q2.soft);
  ok('🔴 Q1：Aは「伝票は別のQ」と言えている', q1.pit.length === 1 && /第2クォーター/.test(q1.pit[0].別Q), q1.pit);
  ok('🔴 Q2：Bは「伝票は別のQ」と言えている', q2.pit.length === 1 && /第1クォーター/.test(q2.pit[0].別Q), q2.pit);
  ok('　どの伝票かまで言っている（D-A）', /D-A/.test(q1.pit[0].別Q), q1.pit[0].別Q);
  ok('　どの伝票かまで言っている（D-B）', /D-B/.test(q2.pit[0].別Q), q2.pit[0].別Q);
  ok('🔴 実際に結ばれた証拠つき（別のQ確定）', q1.pit[0].確定 === true && q2.pit[0].確定 === true);
  /* 🔴 Qまたぎの車は「伝票が在るほうのQ」で**1回だけ**残りに数える。
     ＝ 残り ＝ 結びついた行のうち OK でないものだけ。「別のQ」は1件も足さない。
     ⚠ 0件になるのが正解ではない（Q1 は D-B の期間の外、Q2 は D-A の期間の外が1件ずつ在る）。
        **同じ車を2つのQで2回追いかけない**のが正解。 */
  ok('🔴 残りに「別のQ」を足していない（Q1）', q1.残り === q1.非OK結び, { 残り:q1.残り, 非OK結び:q1.非OK結び });
  ok('🔴 残りに「別のQ」を足していない（Q2）', q2.残り === q2.非OK結び, { 残り:q2.残り, 非OK結び:q2.非OK結び });
  ok('🔴 金額は動いていない（Q1 検算が合う）', q1.検算.合う === true, q1.検算);
  ok('🔴 金額は動いていない（Q2 検算が合う）', q2.検算.合う === true, q2.検算);
  ok('　内訳もそのまま（Q1 PitFlowだけ −100,000）', q1.内訳.PitFlowだけ.金額 === -100000, q1.内訳);
  ok('　内訳もそのまま（Q2 PitFlowだけ −200,000）', q2.内訳.PitFlowだけ.金額 === -200000, q2.内訳);
}

console.log('\n── 🔗 ②PDFが片方のQしか無い（別の回に走らせる） ──');
{
  /* カードの実績は 7/20（7月Q3）、伝票は 8/10（8月Q2）＝21日ちがい */
  const cards = [mk('A', '2026-07-20', '2026-08-10', '習志野500あ1111', 'Ａさん', 'ノア', 100000)];
  const aug = await run(cards, { from: '2026-08-08', to: '2026-08-15' },
    [{ 売上日:'2026-08-10', 伝票:'D-A', ナンバー:'習志野 500 あ 11-11', 顧客名:'Ａさん', 車種:'ノア', 金額:100000, 受付担当:'蓮沼' }]);
  ok('8月Q2：21日離れていても結べた（売上日どうしが同じ）', aug[0].結び.length === 1 && /期間の外/.test(aug[0].結び[0]), aug[0].結び);
  ok('　「PitFlowに実績が無い」は出ない', aug[0].soft.length === 0, aug[0].soft);
  ok('　検算が合う', aug[0].検算.合う === true, aug[0].検算);

  const jul = await run(cards, { from: '2026-07-16', to: '2026-07-23' }, []);
  ok('🔴 7月Q3：カードは「売上日が別のQ」と言えている',
     jul[0].pit.length === 1 && /第2クォーター/.test(jul[0].pit[0].別Q), jul[0].pit);
  ok('　残り件数から外れている', jul[0].残り === jul[0].非OK結び, { 残り:jul[0].残り, 非OK結び:jul[0].非OK結び });
  ok('　検算が合う', jul[0].検算.合う === true, jul[0].検算);
}

console.log('\n── 🚧 ③結ぶ側は緩んでいない（いちばん大事な守り） ──');
{
  /* 6月の入庫しか無いのに、8月の伝票が来た（46日ちがい・金額もちがう） */
  const g = await run([mk('X1', '2026-06-25', '', '習志野500あ1111', 'Ａさん', 'ノア', 30000)],
    { from: '2026-08-08', to: '2026-08-15' },
    [{ 売上日:'2026-08-10', 伝票:'D-Z', ナンバー:'習志野 500 あ 11-11', 顧客名:'Ａさん', 車種:'ノア', 金額:100000, 受付担当:'蓮沼' }]);
  ok('🔴 46日離れた別の入庫と結んでいない', g[0].結び.length === 0, g[0].結び);
  ok('　「整備ソフトだけ」に残る（お金は逃がさない）', g[0].soft.length === 1, g[0].soft);
  ok('　金額がちがうことを言っている', /伝票とちがう金額/.test(g[0].soft[0].別Q), g[0].soft[0].別Q);
  ok('　検算が合う', g[0].検算.合う === true, g[0].検算);

  /* 同じ車が1か月半おきに2回入庫。8月の伝票は8月のカードと結ぶこと */
  const h = await run(
    [mk('X1', '2026-06-25', '',           '習志野500あ1111', 'Ａさん', 'ノア',  30000),
     mk('X2', '2026-08-10', '2026-08-10', '習志野500あ1111', 'Ａさん', 'ノア', 100000)],
    { from: '2026-08-08', to: '2026-08-15' },
    [{ 売上日:'2026-08-10', 伝票:'D-X2', ナンバー:'習志野 500 あ 11-11', 顧客名:'Ａさん', 車種:'ノア', 金額:100000, 受付担当:'蓮沼' }]);
  ok('🔴 2回入庫している車＝新しいほうと結ぶ', /→X2/.test(h[0].結び[0] || ''), h[0].結び);
  ok('　古いほう（6月）は出てこない', h[0].pit.length === 0 && h[0].soft.length === 0, { pit:h[0].pit, soft:h[0].soft });
  ok('　検算が合う', h[0].検算.合う === true, h[0].検算);
}

console.log('\n── 🃏 ④画面が赤ではなく黄で出す ──');
{
  const html = await p.evaluate(() => {
    const U = (window._insp = window._insp || {}); U.q = U.q || {};
    const saved = {
      _v: 2, 期間: { from: '2026-08-01', to: '2026-08-07' },
      走らせた日時: '2026-08-08T09:30:00.000Z', 走らせた人: 'ゆうた', PDF: '売上チェックリスト.pdf',
      整備ソフト: { 枚数:1, 金額:100000 }, PitFlow: { 台数:1, 金額:100000 },
      差: { 台数:0, 金額:0 },
      内訳: { 整備ソフトだけ:{台数:0,金額:0}, PitFlowだけ:{台数:1,金額:-100000},
              期間の外:{台数:0,金額:0}, 金額ちがい:{台数:0,金額:0} },
      検算: { 合う:true }, まとめ返車: [],
      直すもの: {
        期間の外: [], 月またぎ: [], Qまたぎ: [], 売上日ちがい: [], 担当ちがい: [], 金額ちがい: [],
        整備ソフトだけ: [],
        PitFlowだけ: [{ 数える日:'2026-08-05', 予約番号:'R-2401', ナンバー:'習志野 500 あ 11-11',
                        お客様:'Ａさん', 金額:100000, フロント:'蓮沼', カードid:'card-A',
                        車種:'ノア', 車体番号:'ZRR80-1234567',
                        別のQ:'伝票は 8月 第2クォーター（2026-08-10・D-A）にあります' }]
      }
    };
    /* 🗂 v2.8.6 残した結果も4つの箱。片方にしか無い車は「データがちがう」の中 */
    Object.assign(U.q, { res:null, pdf:null, saved, savedId:'qrun', tab:'data', savedTab:'PitFlowだけ', list:[], groups:[] });
    return window.pitQuarterHtml();
  });
  ok('🔴 黄で出る（gone-y）', /gone-y/.test(html));
  ok('🔴 赤では出ない', !/class="q-c gone[ "]/.test(html), (html.match(/class="q-c gone[^"]*"/g) || []).slice(0, 3));
  ok('見出しが「伝票は別のQにあります」', html.includes('伝票は別のQにあります'));
  ok('どのQのどの伝票かが出る', html.includes('第2クォーター') && html.includes('D-A'));
  ok('「PDF に伝票が載っていません」は出さない', !html.includes('PDF に伝票が載っていません'));
  ok('青い印が付く（q-c-g cross）', /q-c-g cross/.test(html));
}

console.log('\n── 🔔 v2.8.3 直す先が無いQまたぎは「お知らせ」（扱いはOK） ──');
/* 🗣「結局直しようがないような？？？」→「そのケースは あくまでお知らせで、扱いはOKにしてほしい」
   🗣「ダメなのは月またぎ」（2026-08-08 の3段階をそのまま守る）
   実データ（8/1〜8/23・109枚）では、期間の外18件のうち16件がこれだった。 */
{
  const 判定 = (o) => p.evaluate((x) => {
    const pair = {
      期間の外: x.期間の外, 同じ車: x.同じ車, 金額一致: x.金額一致,
      日付: { kind: x.日付kind }, 売上日差: { kind: x.売上日差kind }
    };
    return { 正常: window.pitQCrossOnly(pair), 組: window.pitQGroupOf(Object.assign({
      soft: { 金額: 100000, 車種: 'ノア', 車体番号: 'V1' },
      pit:  { 確定金額: 100000, 車種: 'ノア', 車体番号: 'V1' },
      担当一致: true
    }, pair)) };
  }, o);

  const 素 = { 期間の外:true, 同じ車:true, 金額一致:true, 日付kind:'crossQ', 売上日差kind:'same' };
  let r = await 判定(素);
  ok('🔴 4つ揃えばお知らせ＝OK扱い', r.正常 === true && r.組 === 'ok', r);

  r = await 判定(Object.assign({}, 素, { 日付kind: 'crossMonth' }));
  ok('🔴🔴 月をまたいだら**絶対に**お知らせにしない（2026-08-08 の決めごと）',
     r.正常 === false && r.組 === 'date', r);

  r = await 判定(Object.assign({}, 素, { 金額一致: false }));
  ok('金額が合っていなければお知らせにしない', r.正常 === false, r);

  r = await 判定(Object.assign({}, 素, { 同じ車: false }));
  ok('別の車かもならお知らせにしない', r.正常 === false, r);

  r = await 判定(Object.assign({}, 素, { 売上日差kind: 'none' }));
  ok('🔴 カードに売上日が無ければお知らせにしない（確かめようが無い）', r.正常 === false, r);

  r = await 判定(Object.assign({}, 素, { 売上日差kind: 'diff' }));
  ok('売上日どうしがズレていればお知らせにしない', r.正常 === false, r);

  r = await 判定(Object.assign({}, 素, { 期間の外: false }));
  ok('そもそも期間の中ならお知らせではない', r.正常 === false, r);

  /* 画面：OK の箱を 0円と決め打ちしていないこと（＝4つを足すと差になる、が崩れない） */
  const view = fs.readFileSync(path.join(process.cwd(), 'js', 'quarter.js'), 'utf8');
  ok('🔴 OKの箱の金額を 0 と決め打ちしていない', /id:'ok'[\s\S]{0,400}eff\(G\.OK\)/.test(view));
  ok('🔴 画面が自分で判定していない（印を読むだけ）', /p\.正常なQまたぎ/.test(view) && !/kind\s*===\s*'crossMonth'/.test(view));
  ok('カードに「直すところはありません」を出す', /直すところはありません/.test(view));

  /* 🔔🔔 v2.8.4（ゆうた「1回目のときと変わる症状」）
     v2.8.3 は**走らせた直後**だけ直して、**残す側**が知らないままだった＝
     閉じて開くと「期間の外 16件」に戻る。v2.7.0 と同じ落とし穴を分け方の側でやっていた。 */
  const store = fs.readFileSync(path.join(process.cwd(), 'js', 'quarter-store.js'), 'utf8');
  ok('🔴 残す側も「直す先が無いQまたぎ」を直すものから外す',
     /期間の外[\s\S]{0,80}!p\.正常なQまたぎ/.test(store));
  ok('🔴 Qまたぎタブからも外す', /Qまたぎ:\s*cut\([\s\S]{0,90}!p\.正常なQまたぎ/.test(store));
  ok('🔴 黙って消さない（台数と金額を残す）', /お知らせ:\s*\(function/.test(store));
  ok('残す側と戻す側の両方に印がある',
     /正常なQまたぎ:\s*!!p\.正常なQまたぎ/.test(store) && /正常なQまたぎ:\s*!!r\.正常なQまたぎ/.test(view));
}

console.log('\n── 🗄 残した結果でも、走らせた直後と同じ顔になる ──');
{
  const mk = (お知らせ) => ({
    _v: 2, 期間: { from:'2026-08-01', to:'2026-08-07' },
    走らせた日時:'2026-08-25T09:30:00.000Z', 走らせた人:'ゆうた', PDF:'売上チェックリスト.pdf',
    整備ソフト:{枚数:67,金額:8155215}, PitFlow:{台数:53,金額:5431738}, 差:{台数:14,金額:2723477},
    内訳:{ 整備ソフトだけ:{台数:1,金額:43300}, PitFlowだけ:{台数:3,金額:-509270},
           期間の外:{台数:16,金額:3189447}, 金額ちがい:{台数:0,金額:0} },
    検算:{合う:true}, まとめ返車:[],
    お知らせ: お知らせ,
    直すもの:{ 期間の外:[], 金額ちがい:[], 月またぎ:[], Qまたぎ:[], 売上日ちがい:[], 担当ちがい:[],
      整備ソフトだけ:[], PitFlowだけ:[] }
  });
  const draw = (saved, tab) => p.evaluate(([sv, tb]) => {
    const U = (window._insp = window._insp || {}); U.q = U.q || {};
    Object.assign(U.q, { res:null, pdf:null, saved:sv, savedId:'qrun', tab:tb, savedTab:'期間の外', list:[], groups:[] });
    return window.pitQuarterHtml();
  }, [saved, tab]);

  const h = await draw(mk({ 台数:16, 金額:3189447 }), 'date');
  ok('🔴 16台がどこへ行ったかを1行で言う', /このうち[\s\S]{0,40}16台<\/b>/.test(h), (h.match(/このうち[^（]{0,60}/) || [])[0]);
  ok('🔴 「直すところはありません」と書いてある', h.includes('直すところはありません'));
  /* 🗂 v2.8.6 昔の「期間の外」タブは無くなった。4つの箱の「日付がちがう」が0件であることを見る */
  ok('🔴 「日付がちがう」は0件になっている',
     /日付がちがう<\/span><span class="q-grb-n">0</.test(h), (h.match(/日付がちがう<\/span><span class="q-grb-n">\d+</) || [])[0]);
  ok('　内訳の金額は今までどおり出る（お金は動かしていない）', h.includes('3,189,447'));

  const h2 = await draw(mk({ 台数:0, 金額:0 }), '期間の外');
  ok('お知らせ0件のときは、その1行を出さない', !/このうち/.test(h2));

  const old = mk({ 台数:16, 金額:3189447 }); delete old.お知らせ;
  const h3 = await draw(old, '期間の外');
  ok('🔴 v2.8.4 より前に残した結果では出さない（無い物を作らない）', !/このうち/.test(h3));
}

console.log('\n── 🔘 v2.8.5 直すボタンは「全部のカード」に出る ──');
/* 🗣「売上日を変えるボタンとかが一番上にしか出ないで、クリックすると次のが上がって押せるようになる」
   ◎正体 …… `rows.map(card)` と裸で書いていた。`Array.map` は2つ目に**添え字**を渡すので、
     `card(p, saved)` の `saved` に 0,1,2… が入り、**1枚目以外が「残した結果」として描かれ**、
     直すボタンが丸ごと消えていた。v2.7.0 で2つ目の引数を足した時に生まれたもの。 */
{
  const view = fs.readFileSync(path.join(process.cwd(), 'js', 'quarter.js'), 'utf8');
  /* ⚠ このファイル自身の注意書きにも `.map(card)` の字が出るので、**コメントを外してから**見る
     （v2.6.0 の試験で同じ罠を踏んでいる）。 */
  const 素 = view.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  ok('🔴 `.map(card)` と裸で書いていない（添え字が saved に入る）', !/\.map\(card\)/.test(素));
  ok('　包む関数を通している', /\.map\(one\)/.test(view) && /function one\(p\)\{?\s*return card\(p\)/.test(view));

  const r = await p.evaluate(() => {
    const mk = (i) => ({ id:'C'+i, resNo:'R'+i, status:'returned',
      completedAt:'2026-08-0'+i, returnDateFinal:'2026-08-0'+i, salesDate:'',   /* 売上日なし＝直す対象 */
      plate:'習志野500あ111'+i, customer:'客'+i, car:'ノア', amountFinal:100000+i, frontStaff:'蓮沼' });
    const keep = window.state.cards;
    window.state.cards = [1,2,3,4,5].map(mk);
    const soft = [1,2,3,4,5].map(i => ({ 売上日:'2026-08-0'+i, 伝票:'D-'+i,
      ナンバー:'習志野 500 あ 11-1'+i, 顧客名:'客'+i, 車種:'ノア', 金額:100000+i, 受付担当:'蓮沼' }));
    const res = window.pitQMatch(soft, window.pitQCollect({from:'2026-08-01',to:'2026-08-07'}).明細,
      { from:'2026-08-01', to:'2026-08-07' });
    const U = (window._insp = window._insp || {}); U.q = U.q || {};
    Object.assign(U.q, { res, saved:null, savedId:'', pdf:{}, soft,
      from:'2026-08-01', to:'2026-08-07', tab:'date', groups:[], list:[] });
    window.state.cards = keep;
    const html = window.pitQuarterHtml();
    const d = document.createElement('div'); d.innerHTML = html;
    return { 行:res.グループ.日付.length, カード:d.querySelectorAll('.q-cards > .q-c').length,
      直すボタン:(html.match(/pitQDo\('売上日'/g)||[]).length,
      伝票を直した:(html.match(/pitQMk\('売上日'/g)||[]).length,
      カードを開く:(html.match(/もう一度PDFを読ませて/g)||[]).length };
  });
  ok('5行が5枚のカードで出る', r.行 === 5 && r.カード === 5, r);
  ok('🔴 5枚**全部**に直すボタンが出る（1枚目だけではない）', r.直すボタン === 5, r);
  ok('🔴 5枚全部に「伝票を直した」が出る', r.伝票を直した === 5, r);
  ok('🔴 走らせた直後に「もう一度PDFを読ませて」を出さない', r.カードを開く === 0, r);
}

console.log('\n── 🧾 v2.9.1 返車が先・伝票があと（QP-415514） ──');
/* 🗣「板金に近いが、返車が先で伝票があとのパターン。今後は無くすようにするが
   　　実際リアルパターンとして少数ある。**これはQまたぎと同じような扱いにしてほしい**」
   実データ：V48797 有限会社 小松園芸／キャンター／82,470円
   　　　　　PitFlow の実績日 8/03（Q1）／伝票 8/20（Q3）・0685 */
{
  const 判定 = (o) => p.evaluate((x) => {
    const pair = { 期間の外:true, 同じ車:x.同じ車 !== false, 金額一致:x.金額一致 !== false,
      日付:{ kind:x.日付kind }, 売上日差:{ kind:x.売上日差kind },
      pit:{ 数える日:x.実績日, 売上日:x.カード売上日 || '', 保険:false },
      soft:{ 売上日:x.伝票日 } };
    return { 正常: window.pitQCrossOnly(pair), 言い方: window.pitQCrossWhy(pair) };
  }, o);

  const 素 = { 実績日:'2026-08-03', 伝票日:'2026-08-20', カード売上日:'',
               日付kind:'crossQ', 売上日差kind:'none' };
  let r = await 判定(素);
  ok('🔴 返車が先・伝票があと＝お知らせ扱い', r.正常 === true, r);
  ok('　言い方が専用になる', /返したあとに伝票/.test(r.言い方), r.言い方);
  ok('　両方の日を出す', /2026-08-03/.test(r.言い方) && /2026-08-20/.test(r.言い方), r.言い方);

  r = await 判定(Object.assign({}, 素, { 実績日:'2026-08-20', 伝票日:'2026-08-03' }));
  ok('🔴 逆（伝票が先・返車があと）は拾わない', r.正常 === false, r);

  r = await 判定(Object.assign({}, 素, { 日付kind:'crossMonth' }));
  ok('🔴🔴 月をまたいだら**やはりNG**（2026-08-08 の決めごと）', r.正常 === false, r);

  r = await 判定(Object.assign({}, 素, { 金額一致:false }));
  ok('金額が合っていなければNG', r.正常 === false, r);
  r = await 判定(Object.assign({}, 素, { 同じ車:false }));
  ok('別の車かもならNG', r.正常 === false, r);

  /* 🔴 カードに売上日が**入っている**なら、そちらは確かめられるので厳しく見る */
  r = await 判定(Object.assign({}, 素, { カード売上日:'2026-08-11' }));
  ok('🔴 カードの売上日が伝票とちがえばNG（確かめられるので）', r.正常 === false, r);
  r = await 判定(Object.assign({}, 素, { カード売上日:'2026-08-20' }));
  ok('　カードの売上日が伝票と同じならOK', r.正常 === true, r);
}

console.log('\n── 🗂 別のQで結ばれた車は「データがちがう」ではなく OK に置く ──');
{
  const h = await p.evaluate(() => {
    const R = {
      グループ:{ データ:[], 金額:[], 日付:[], OK:[] },
      整備ソフトだけ:[],
      PitFlowだけ:[
        { 顧客名:'有限会社 小松園芸', ナンバー:'松戸 800 さ 453', 車種:'キャンター',
          数える日:'2026-08-03', 確定金額:82470, 予約番号:'V48797', フロント担当:'蓮沼',
          生:{ id:'card-v' }, 別のQ:'伝票は 8月 第3クォーター（2026-08-20・0685）にあります', 別のQ確定:true },
        { 顧客名:'木村 亮', ナンバー:'習志野 300 か 77-77', 車種:'ハスラー',
          数える日:'2026-08-06', 確定金額:88000, 予約番号:'R-2411', フロント担当:'蓮沼',
          生:{ id:'card-k' }, 別のQ:'', 別のQ確定:false }
      ],
      内訳:{ 整備ソフトだけ:{台数:0,金額:0}, PitFlowだけ:{台数:2,金額:-170470},
             期間の外:{台数:0,金額:0}, 金額ちがい:{台数:0,金額:0} },
      検算:{ 合う:true }, 差:{ 台数:-2, 金額:-170470 },
      整備ソフト:{ 枚数:0, 金額:0 }, PitFlow:{ 台数:2, 金額:170470 }
    };
    const U=(window._insp=window._insp||{}); U.q=U.q||{};
    Object.assign(U.q,{ res:R, saved:null, savedId:'', pdf:{}, soft:[], from:'2026-08-01', to:'2026-08-07',
      tab:'data', groups:[], list:[] });
    const data = window.pitQuarterHtml();
    U.q.tab='ok';
    const okh = window.pitQuarterHtml();
    return { data, okh };
  });
  ok('🔴 「データがちがう」は1件だけ（別のQ確定は外れる）',
     /データがちがう<\/span><span class="q-grb-n">1</.test(h.data),
     (h.data.match(/データがちがう<\/span><span class="q-grb-n">\d+</) || [])[0]);
  ok('🔴 OK が1件になる（別のQ確定が入る）',
     /OK<\/span><span class="q-grb-n">1</.test(h.data),
     (h.data.match(/OK<\/span><span class="q-grb-n">\d+</) || [])[0]);
  ok('🔴 データの一覧に小松園芸を出さない', !h.data.includes('小松園芸') || h.data.indexOf('小松園芸') > h.data.indexOf('q-body'), '');
  ok('🔴 OKの一覧に小松園芸が出る', h.okh.includes('小松園芸'));
  ok('　もう1台（別のQでない）はデータ側に残る', h.data.includes('木村 亮'));
}

console.log('\n── 🚗 v2.9.2 ナンバーと客名が合っていれば、車種のゆれは見ない（Q-932548） ──');
/* 🗣「ナンバーと客名がしっかり適合してたら**車種表示の揺れは気にしないでほしい**。
   　　逆に**ナンバーが読めないとかだったら要注意**ではある」
   実データ：伝票0676／石合仁之／名古屋 376 る 703／ＷＲＸ vs インプレッサ／車体番号は片方だけ */
{
  const 見る = (o) => p.evaluate((x) => {
    const pair = {
      soft:{ ナンバー:x.伝票ナンバー, 顧客名:x.伝票客, 車種:x.伝票車種, 車体番号:x.伝票VIN||'' },
      pit: { ナンバー:x.カードナンバー, 顧客名:x.カード客, 車種:x.カード車種, 車体番号:x.カードVIN||'' }
    };
    const id = window.pitQSameCar(pair);
    pair.同一性 = id;
    pair.同じ車 = (id !== 'vinNG' && id !== 'carNG');
    pair.期間の外 = false; pair.金額一致 = true; pair.担当一致 = true;
    pair.差 = 0; pair.soft.金額 = 100000; pair.pit.確定金額 = 100000;
    pair.pit.売上日 = x.カード売上日 || ''; pair.soft.売上日 = x.伝票売上日 || '2026-08-03';
    pair.pit.数える日 = '2026-08-03';
    return { 同一性: id, 組: window.pitQGroupOf(pair) };
  }, o);

  const 実物 = { 伝票ナンバー:'名古屋 376 る 703', カードナンバー:'名古屋 376 る 703',
                 伝票客:'石合仁之', カード客:'石合 仁之',
                 伝票車種:'ＷＲＸ', カード車種:'インプレッサ', 伝票VIN:'GRF-008345', カードVIN:'' };
  let r = await 見る(実物);
  ok('🔴 ナンバー＋客名が一致＝同じ車（車種は見ない）', r.同一性 === 'plateOK', r);
  ok('🔴 「データがちがう」に入らない', r.組 !== 'data', r);

  /* 🔴 車体番号がそろっていれば、それが今までどおり答え */
  r = await 見る(Object.assign({}, 実物, { カードVIN:'GRF-008345' }));
  ok('車体番号がそろえば、それが答え（一致）', r.同一性 === 'vinOK', r);
  r = await 見る(Object.assign({}, 実物, { カードVIN:'ZZZ-000001' }));
  ok('🔴 車体番号がちがえば、やはり別の車かも', r.同一性 === 'vinNG' && r.組 === 'data', r);

  /* 🔴 名前が合っていなければ、車種で見る（今までどおり） */
  r = await 見る(Object.assign({}, 実物, { カード客:'まったく別の人' }));
  ok('🔴 客名が合わなければ車種で見る（＝別の車かも）', r.同一性 === 'carNG' && r.組 === 'data', r);

  /* 🔴 ナンバーが合っていなければ、車種で見る */
  r = await 見る(Object.assign({}, 実物, { カードナンバー:'習志野 500 あ 11-11' }));
  ok('🔴 ナンバーが合わなければ車種で見る', r.同一性 === 'carNG', r);

  /* 🟡 ナンバーが読めない＝要注意（実データ Q-945725／あけぼの自動車／仮登録車両） */
  r = await 見る({ 伝票ナンバー:'仮登録車両', カードナンバー:'', 伝票客:'あけぼの自動車',
                   カード客:'あけぼの自動車', 伝票車種:'', カード車種:'' });
  ok('🔴 ナンバーが読めない＝要注意（plateNG）', r.同一性 === 'plateNG', r);
  ok('🔴 「データがちがう」に入れて人に見てもらう', r.組 === 'data', r);

  /* 画面の言葉 */
  const view = fs.readFileSync(path.join(process.cwd(), 'js', 'quarter.js'), 'utf8');
  ok('画面に「ナンバーと お客様が一致」が出る', /plateOK[\s\S]{0,120}ナンバーと お客様が一致/.test(view));
  ok('画面に「ナンバーが読めません」が出る', /plateNG[\s\S]{0,140}ナンバーが読めません/.test(view));
  ok('🔴 plateNG を赤枠（別の車かも）にしていない',
     !/plateNG[\s\S]{0,80}q-c-g bad/.test(view));
}

console.log('\n── 🧭 まわり ──');
{
  await p.evaluate(() => { try { showView('inspect'); } catch (e) {} });
  await p.waitForTimeout(500);
  ok('エラーなし', errs.length === 0, errs.slice(0, 4));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v2.8.0 以降', vn[0] > 2 || (vn[0] === 2 && vn[1] >= 8), ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail === 0 ? 0 : 1);
