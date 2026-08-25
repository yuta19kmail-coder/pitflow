/* ================================================================================
   test_quarter_replay.mjs  ── 🧾 v2.9.8 クォーターチェックの「残す／開き直す」の見張り
   ================================================================================
   ◎ゆうた 2026-08-25
     🗣「リロードした後の挙動がやっぱりへん　Q1が抜けたりする」
     🗣「素直に直近のPDF自体を保持する形だとデータ的に大変かな？」
     🗣「チェックしたあとクリックすると消えちゃうのが何をやったかわからなくなるかも
        だからチェック済みみたいな枠をその下に作って、クリックで修正した一覧を開きたい」
     🗣「またさっきのあけぼのさんはまだグレーアウトでボタンもなく存在する状態」

   ◎3つの根っこ
     ① **一覧の上書き合戦** … 1枚のPDFが Q1〜Q3 に分かれると `saveRun` が3本同時に走り、
        それぞれが一覧（`qruns`）を「読む→足す→書く」するので**最後の1本しか残らない**。
        書類（`qrun-*`）は3つとも無事だったので、**壊れていたのは索引だけ**だった。
     ② **画面が2つの顔を持っていた** … 走らせた直後は生の結果、開き直すと「直す行だけの写し」。
        写しには判定の材料が入っていないので、押せるボタンが出ない（あけぼのさんの行）。
     ③ **やったことが残らない** … 直すと行が消えるので、何をしたのか画面から分からない。

   ◎直し方（v2.9.8）
     ① 書類は並列でよい。**一覧に触るのは最後に1回**（`pitQSaveRuns`）＋
        既に落ちたぶんは書類から索引を作り直す（`pitQRepairList`）
     ② **読んだ伝票の行を残す**（1行296バイト実測）。開き直したら**もう一度突き合わせる**
     ③ 直した記録も印と同じ場所（`qmarks`）に残し、**チェック済み**の枠に出す

   ◎使い方
     node /tmp/srv.js &            ← 8991
     NODE_PATH=... node test_quarter_replay.mjs
   ================================================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); }
                          else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
/* 🔴 自分のコメントに正規表現が当たる事故を何度もやっているので、必ず先に外す */
const bare = f => fs.readFileSync(path.join(process.cwd(), f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* ================= ① コードを機械で読む ================= */
console.log('\n── 🔍 決めごとがコードに入っているか ──');
{
  const store = bare('js/quarter-store.js');
  const view  = bare('js/quarter.js');
  const fix   = bare('js/quarter-fix.js');

  ok('🔴 一覧はまとめて1回だけ書く口がある（pitQSaveRuns）', /w\.pitQSaveRuns\s*=/.test(store));
  ok('🔴 一覧に足す関数が配列を受ける', /function pushList\(ds\)/.test(store) && /Array\.isArray\(ds\)/.test(store));
  ok('🔴 まとめて残す時は各自が一覧に書かない（_listOff）', /_listOff/.test(store));
  ok('🩹 索引を書類から作り直す口がある（pitQRepairList）', /w\.pitQRepairList\s*=/.test(store));
  ok('🧾 伝票の行を残す形がある（slimSoft）', /function slimSoft\(/.test(store));
  ok('🧾 伝票の行に上限がある（CAP_SOFT）', /CAP_SOFT\s*=\s*\d+/.test(store));
  ok('🔴 明細は持たない（重いので）', /明細:\s*\[\]/.test(store));
  ok('🔴 伝票を切ったら「持っていない」と言う（半分残さない）',
     /伝票を残せなかった/.test(store) && /_v:\s*\(伝票OK\s*\?\s*3\s*:\s*2\)/.test(store));

  ok('🔴 画面がまとめて残す口を使っている', /pitQSaveRuns\(items\)/.test(view));
  ok('🔴 開き直しで伝票からもう一度突き合わせる', /r\.伝票/.test(view) && /w\.pitQMatch\(伝票, pit/.test(view));
  ok('🔴 開き直しで新しい判定を作っていない（pitQCollect と pitQMatch だけ）',
     /w\.pitQCollect\(\{ from: from, to: to \}\)/.test(view));
  ok('🔴 一覧に無くても書類があれば開く', !/var has = \(U\.list \|\| \[\]\)\.some/.test(view));
  ok('✅ チェック済みの枠がある（doneBox）', /function doneBox\(/.test(view));
  ok('✅ チェック済みは qmarks 1か所だけを読む',
     /function doneRows\(U\)\{?[\s\S]{0,200}w\._pitQMarks/.test(view));

  ok('✅ 直した記録を残す口がある（pitQDid）', /w\.pitQDid\s*=/.test(fix));
  ok('✅ 直した記録の鍵は印とぶつからない（DID|）', /'DID\|'/.test(fix));
  const didCalls = (fix.match(/\n\s*did\('/g) || []).length;
  ok('✅ 直せる4つ（売上日・実績日・担当・金額）すべてで記録している', didCalls === 4, didCalls);
}

/* ================= ② 実際に動かす ================= */
const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1200 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text().slice(0, 200)); });
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.pitQuarterHtml && window.pitQMatch && window.pitQSaveRuns', null, { timeout: 25000 });
await p.waitForTimeout(600);

/* ---- にせのクラウド（Firestore のかわり）。書いた回数まで数える ---- */
await p.evaluate(() => {
  const DB = (window.__db = { docs: {}, writes: [], reads: [] });
  window.PIT_CLOUD = true;
  window.fb = {
    company(){
      return { collection(){ return { doc(id){ return {
        get(){ DB.reads.push(id);
               return Promise.resolve({ exists: DB.docs[id] != null, data(){ return DB.docs[id]; } }); },
        set(v){ DB.writes.push(id); DB.docs[id] = JSON.parse(JSON.stringify(v)); return Promise.resolve(); },
        delete(){ delete DB.docs[id]; return Promise.resolve(); }
      }; } }; } };
    }
  };
});

/* ---- にせの伝票とカード（3つのQにまたがる1枚のPDF） ---- */
const setup = await p.evaluate(() => {
  const CARS = [
    { q:1, d:'2026-08-03', plate:'習志野 500 あ 11-11', name:'井上 健',   car:'ノア',     amt:120000, den:'D-101' },
    { q:1, d:'2026-08-05', plate:'習志野 500 あ 22-22', name:'大野 里美', car:'フィット', amt: 88000, den:'D-102' },
    { q:2, d:'2026-08-10', plate:'習志野 300 か 33-33', name:'木村 亮',   car:'ハスラー', amt: 55000, den:'D-201' },
    { q:3, d:'2026-08-18', plate:'習志野 500 さ 44-44', name:'あけぼの',  car:'プリウス', amt: 66000, den:'D-301' }
  ];
  window.state.cards = CARS.map((x, i) => ({
    id: 'qc-' + i, resNo: 'R-' + i, status: 'returned',
    plate: x.plate, customer: x.name, car: x.car,
    completedAt: x.d, returnDate: x.d, returnDateFinal: x.d, reserveDate: x.d,
    salesDate: x.d, amountFinal: x.amt, frontStaff: '椎名'
  }));
  /* 🔴 1件だけ金額をズラす＝「直すもの」が1件出る（押せるボタンが要る行） */
  window.state.cards[0].amountFinal = 100000;
  window.__soft = CARS.map((x, i) => ({
    売上日: x.d, 伝票: x.den, ナンバー: x.plate, 顧客名: x.name, 車種: x.car,
    金額: x.amt, 受付担当: '椎名', 車台: 'VIN-' + i,
    明細: [{ 種:'作業', 名:'点検', 金額:x.amt, 原価:1000 }],
    法定: [], 原価: 1000, 消費税: Math.round(x.amt * 0.1), 伝票計: x.amt + Math.round(x.amt * 0.1),
    明細が合う: true, 明細合計: x.amt
  }));
  const sp = window.pitQSplit({ from:'2026-08-01', to:'2026-08-31' }, window.__soft);
  return { 組: (sp.組 || []).map(g => ({ no:g.no, from:g.from, to:g.to, 枚:g.伝票.length, 全部:g.全部 })) };
});
console.log('\n── 🗓 1枚のPDFが3つのQに分かれる ──');
ok('組が3つ以上できた', setup.組.length >= 3, setup.組);
ok('どれも「まるごと」の組', setup.組.every(g => g.全部), setup.組);
ok('🔴 まだ伝票が1枚も無いQ（Q4）も組としては出てくる', setup.組.some(g => g.枚 === 0), setup.組);

/* ---- 走らせて残す ---- */
console.log('\n── 🗄 まとめて残す（Q1が消えない） ──');
const saved = await p.evaluate(async () => {
  const U = (window._insp = window._insp || {}); U.q = U.q || {};
  const sp = window.pitQSplit({ from:'2026-08-01', to:'2026-08-31' }, window.__soft);
  const groups = sp.組.map(g => {
    const pit = window.pitQCollect({ from:g.from, to:g.to }).明細;
    return { no:g.no, label:g.label, from:g.from, to:g.to, 全部:g.全部,
             soft:g.伝票, res: window.pitQMatch(g.伝票, pit, { from:g.from, to:g.to }) };
  });
  if (window.pitQCrossLink) window.pitQCrossLink(groups);
  const items = groups.map(g => ({ res:g.res, opt:{ pdf:'テスト.pdf', soft:g.soft } }));
  const ds = await window.pitQSaveRuns(items);
  const DB = window.__db;
  return {
    残した: ds.map(d => d && (d.id || d.エラー)),
    書類: Object.keys(DB.docs).filter(k => /^qrun-/.test(k)).sort(),
    一覧: ((DB.docs.qruns || {}).一覧 || []).map(x => x.id).sort(),
    qrunsを書いた回数: DB.writes.filter(k => k === 'qruns').length,
    伝票の枚数: Object.keys(DB.docs).filter(k => /^qrun-/.test(k))
      .map(k => (DB.docs[k].伝票 || []).length),
    版: Object.keys(DB.docs).filter(k => /^qrun-/.test(k)).map(k => DB.docs[k]._v),
    枚数ゼロを残していない: Object.keys(DB.docs).filter(k => /^qrun-/.test(k))
      .every(k => (DB.docs[k].伝票 || []).length > 0),
    明細を持っていない: Object.keys(DB.docs).filter(k => /^qrun-/.test(k))
      .every(k => (DB.docs[k].伝票 || []).every(r => (r.明細 || []).length === 0)),
    ひと組の大きさ: Object.keys(DB.docs).filter(k => /^qrun-/.test(k))
      .map(k => new Blob([JSON.stringify(DB.docs[k].伝票 || [])]).size)
  };
});
ok('🔴 0枚のQは残さない（走らせてもいないのに「済」にしない）',
   saved.書類.length === setup.組.filter(g => g.枚 > 0).length && saved.枚数ゼロを残していない, saved);
ok('🔴 一覧にも全部のっている（Q1が消えない）',
   saved.一覧.length === saved.書類.length && saved.一覧.join() === saved.書類.join(), saved);
ok('🔴 一覧に書いたのは1回だけ（上書き合戦にならない）', saved.qrunsを書いた回数 === 1, saved.qrunsを書いた回数);
ok('🧾 伝票の行が残っている', saved.伝票の枚数.reduce((a, b) => a + b, 0) === 4, saved.伝票の枚数);
ok('🧾 版の印が 3（伝票あり）', saved.版.every(v => v === 3), saved.版);
ok('🔴 明細は持っていない（重いので）', saved.明細を持っていない === true);

/* ---- 索引が壊れていても、書類から戻る ---- */
console.log('\n── 🩹 一覧から1つ消してみる（本番で起きたこと） ──');
const repaired = await p.evaluate(async () => {
  const DB = window.__db;
  const all = (DB.docs.qruns.一覧 || []).slice();
  const 消した = all[all.length - 1].id;
  DB.docs.qruns = { 一覧: all.slice(0, -1) };
  const list = await window.pitQLoadList();
  const plans = window.pitQMonthPlan('2026-08', list);
  const fixed = await window.pitQRepairList(plans, list);
  return { 消した: 消した, 読んだあと: list.map(x => x.id).sort(),
           直したあと: (fixed || []).map(x => x.id).sort(),
           一覧: ((DB.docs.qruns || {}).一覧 || []).map(x => x.id).sort(),
           作り直した印: (fixed || []).filter(x => x.索引を作り直した).map(x => x.id) };
});
ok('わざと1つ消せた', repaired.読んだあと.length === saved.書類.length - 1, repaired);
ok('🔴 書類から見つけて戻す', repaired.直したあと.join() === saved.書類.join(), repaired);
ok('🔴 クラウドの一覧も直る', repaired.一覧.join() === saved.書類.join(), repaired.一覧);
ok('🔴 作り直したものだと分かる印が付く', repaired.作り直した印.length === 1, repaired.作り直した印);

/* ---- 走らせた直後と、開き直したあとが同じ顔か ---- */
console.log('\n── 🪞 走らせた直後 と 開き直したあと（顔がひとつ） ──');
const faces = await p.evaluate(async () => {
  const U = window._insp.q;
  const g1 = window.pitQSplit({ from:'2026-08-01', to:'2026-08-31' }, window.__soft).組[0];
  const pit = window.pitQCollect({ from:g1.from, to:g1.to }).明細;
  /* Ａ＝走らせた直後 */
  U.res = window.pitQMatch(g1.伝票, pit, { from:g1.from, to:g1.to });
  U.soft = g1.伝票; U.from = g1.from; U.to = g1.to; U.pdf = 'テスト.pdf';
  U.groups = [{ no:1, label:'', from:g1.from, to:g1.to, 全部:true, soft:g1.伝票, res:U.res }];
  U.gi = 0; U.tab = 'money'; U.saved = null; U.再生 = null; U.list = [];
  const A = window.pitQuarterHtml();
  /* Ｂ＝開き直したあと（残してある伝票から組み直す） */
  U.res = null; U.soft = null; U.groups = null; U.pdf = null; U.saved = null; U.再生 = null;
  window.pitQOpenPlan(g1.from, g1.to);
  await new Promise(r => setTimeout(r, 400));
  window._insp.q.tab = 'money';
  const B = window.pitQuarterHtml();
  /* ⚠ くらべるのは**結果の場所から下**（`q-nums` 以降）。
     いちばん上の箱（PDFを選ぶ・期間の1行）は、PDFが手元にあるかどうかで変わって当たり前。
     ここが同じなら「走らせた直後と、開き直したあとの**顔がひとつ**」と言える。 */
  const cut = h => h.slice(h.indexOf('<div class="q-nums'))
                    .replace(/<div class="q-saved">[\s\S]*?<\/div>\s*/g, '');
  return { A: cut(A), B: cut(B), 同じ: cut(A) === cut(B),
           再生: !!window._insp.q.再生, 伝票の枚数: (window._insp.q.soft || []).length,
           期間の1行を出さない: !/q-term/.test(B) };
});
ok('🔴🔴 走らせた直後と、開き直したあとが**1文字も違わない**', faces.同じ === true,
   faces.同じ ? '' : { A: faces.A.slice(0, 300), B: faces.B.slice(0, 300) });
ok('🧾 開き直しで伝票が戻っている', faces.伝票の枚数 === 2, faces.伝票の枚数);
ok('🔴 どこから来た画面かを言う（残してある伝票で組み直した）', faces.再生 === true);
ok('🔴 「このPDFは…」の1行は出さない（PDFを読んだ画面と取りちがえないため）',
   faces.期間の1行を出さない === true);
ok('🔴 開き直したあとも**押せるボタン**が出る（あけぼのさんの行き止まりが消える）',
   /pitQDo\(/.test(faces.B) && /pitQMk\(/.test(faces.B));
ok('🔴 「もう一度PDFを読ませて」の言い訳が出ない', !/もう一度PDFを読ませて/.test(faces.B));
ok('🔴 OK の行も残っている（合っていた行が消えない）', /q-grb[\s\S]*?OK/.test(faces.B));

/* ---- 開き直した画面で「出来ないこと」を黙らない ---- */
console.log('\n── 🤐 出来ないことを黙らない ──');
const honest = await p.evaluate(() => {
  const U = window._insp.q;
  /* 残りを0にして、書き込みの帯を出す */
  const R = U.res;
  return {
    伝票の中身が空: (U.soft || []).every(x => (x.明細 || []).length === 0),
    車台は残っている: (U.soft || []).every(x => !!x.車台),
    帯: (window.pitQWritePanel ? window.pitQWritePanel(R, U) : '')
  };
});
ok('🧾 明細は持っていない（重いので）', honest.伝票の中身が空 === true);
ok('🧾 車体番号は持っている（車の情報には書ける）', honest.車台は残っている === true);
ok('🔴 書き込みの帯が「伝票の中身は残していない」と断る',
   honest.帯 === '' || /伝票の中身は残していない/.test(honest.帯), honest.帯.slice(0, 200));

/* ---- チェック済みの枠 ---- */
console.log('\n── ✅ チェック済み ──');
const done = await p.evaluate(async () => {
  const U = window._insp.q;
  const before = window.pitQuarterHtml();
  const p0 = (U.res.結びついた || []).filter(x => window.pitQFixKinds(x).length)[0];
  const 番号 = window.pitQRowNo(p0);
  await window.pitQDid('金額', p0, '確定金額を 100,000円 → 120,000円 にした');
  await window.pitQMark('売上日', p0.soft, p0.pit, true);
  const after = window.pitQuarterHtml();
  return {
    前に出ていない: !/q-done/.test(before),
    出る: /class="q-done"/.test(after),
    直したが出る: after.includes('確定金額を 100,000円 → 120,000円 にした'),
    このままでよいが出る: /q-done-r kept/.test(after),
    お客様が出る: after.includes(p0.soft.顧客名),
    番号: 番号,
    畳んである: /<details class="q-done">/.test(after) && !/<details class="q-done" open>/.test(after),
    数字が動いていない:
      (before.match(/<div class="q-sum">[\s\S]*?<\/div><\/div>/) || [''])[0]
      === (after.match(/<div class="q-sum">[\s\S]*?<\/div><\/div>/) || [''])[0],
    印の数: (window._pitQMarks || []).length
  };
});
ok('何もしていない時は出ない（0件をシンプルに）', done.前に出ていない === true);
ok('🔴 直したら「チェック済み」が出る', done.出る === true);
ok('🔴 何を直したかが書いてある', done.直したが出る === true);
ok('🔴 「このままでよい」も同じ枠に並ぶ', done.このままでよいが出る === true);
ok('誰の車かが分かる', done.お客様が出る === true);
ok('🔴 ふだんは畳んである（押すと開く）', done.畳んである === true);
ok('🔴🔴 チェック済みが増えても、合計・差の数字は1ミリも動かない', done.数字が動いていない === true);

/* ---- 上書き・消去でチェックごと消える（ゆうた指定） ---- */
console.log('\n── 🧹 上書き／消去 ──');
const wipe = await p.evaluate(async () => {
  const DB = window.__db;
  const id = Object.keys(DB.docs).filter(k => /^qrun-/.test(k)).sort()[0];
  const 前 = (DB.docs[id].伝票 || []).length;
  /* もう一度おなじ期間を残す＝上書き（積み上がらない） */
  const g1 = window.pitQSplit({ from:'2026-08-01', to:'2026-08-31' }, window.__soft).組[0];
  const pit = window.pitQCollect({ from:g1.from, to:g1.to }).明細;
  await window.pitQSaveRuns([{ res: window.pitQMatch(g1.伝票, pit, { from:g1.from, to:g1.to }),
                               opt:{ pdf:'テスト2.pdf', soft:g1.伝票.slice(0, 1) } }]);
  const 上書き後 = (DB.docs[id].伝票 || []).length;
  const 書類の数 = Object.keys(DB.docs).filter(k => /^qrun-/.test(k)).length;
  await window.pitQDeleteRun(g1.from, g1.to);
  return { 前: 前, 上書き後: 上書き後, 書類の数: 書類の数,
           消えた: DB.docs[id] == null,
           一覧から消えた: !((DB.docs.qruns || {}).一覧 || []).some(x => x.id === id) };
});
ok('🔴 同じ期間をもう一度やると、伝票ごと置きかわる（積み上がらない）',
   wipe.前 === 2 && wipe.上書き後 === 1, wipe);
ok('🔴 書類の数は増えない', wipe.書類の数 === saved.書類.length, wipe.書類の数);
ok('🔴 消すと伝票ごと消える', wipe.消えた === true);
ok('🔴 一覧からも消える', wipe.一覧から消えた === true);

/* ---- 大きさ ---- */
console.log('\n── 📏 大きさ（本番実測 296バイト／行） ──');
{
  const 枚 = saved.伝票の枚数.reduce((a, b) => a + b, 0);
  const per = Math.round(saved.ひと組の大きさ.reduce((a, b) => a + b, 0) / 枚);
  ok('1行が 500バイト未満（明細を持たない形）', per < 500, per + 'B');
  console.log('     （この試験のにせデータで ' + per + 'B／行。本番実測は 296B／行'
            + '＝109枚で約32KB・1500枚で約444KB。Firestore の上限1MBに収まる）');
}

console.log('\n── 🧭 まわり ──');
{
  ok('エラーなし', errs.length === 0, errs.slice(0, 3));
  const ver = await p.evaluate(() => (document.querySelector('meta[name=app-version]') || {}).content || '');
  ok('版が v2.9.8 以降', ver >= '2.9.8', ver);
}

await b.close();
console.log('\n' + (fail ? '⚠ ' : '🎉 ') + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
