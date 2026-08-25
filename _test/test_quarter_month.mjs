/* ================================================================================
   test_quarter_month.mjs
   🗓 v2.10.0 クォーターチェックは「その月まるごと」で持つ ── **本物のPDFで見張る**
   ================================================================================
   ◎ゆうた 2026-08-25
     🗣「また別Q売上が綺麗に消えないかも　**Q1に小松園芸が復活してる**　修正も確認もできない」
     🗣「**Q2にはまた期ズレのがずらっと出てる**」
     🗣「**上のBOXの残数がクリックしたら⓪になったり**　挙動が変だよ」
     🗣「**読み込んだ後に、PDFを読み込むまで古いデータが出てたり**もしてる」
     🗣「なんかこの辺り凄いごたつくな。小手先の修正ではなくしっかりなおしてほしい」

   ◎🔴 根っこ ── **判定はQをまたぐのに、持ち物は1つのQしか無かった。**
     `pitQCrossLink` は「Q1でPitFlowだけに落ちた車が、別のQで伝票と結ばれていないか」を見る。
     つまり**全部の組がそろって初めて意味がある**。
       PDFを読んだ時   … 3つの組がそろう → 正しく「伝票は別のQにあります」と言える
       保存から開いた時 … 1つの組しか作っていなかった → 名札が消えて赤に戻る

   ◎本番の実データで測った差（2026-08-25・売上チェックリスト 8/1〜8/23・109枚）
     | | Q1「データがちがう」 | Q2「データがちがう」 |
     |---|---|---|
     | 1つだけ開く（不具合） | **2** | **17** |
     | PDFを読んだ直後（正しい） | 1 | 0 |
     ＝ Q1の1件が **有限会社 小松園芸**（実績日 8/3・伝票 8/20）。
       Q2の17件が「期ズレがずらっと」。**報告と1件も違わない。**

   ◎この試験がやること（本物のPDF `_pdf.pdf` を実際に読ませる）
     🔴 ① PDFを読んで、保存して、画面を空にして、**保存からQ1を開く**
        → そのとき **Q1〜Q3 が全部そろっていて**、小松園芸が「伝票は別のQ」のままか
     🔴 ② 保存から開いた画面が、**PDFを読んだ直後の画面と1文字も違わない**か
     🔴 ③ 残り件数の物差しが1本か（一覧の要約＝`pitQNokori`）
     🔴 ④ 読み込み中は数字を1つも出さない（くるくるだけ）
     🔴 ⑤ 月が変わったら前の月の結果を捨てる

   ◎使い方
     node /tmp/srv.js &            ← 8991（_pdf.pdf と js/vendor/ が要る）
     NODE_PATH=... node test_quarter_month.mjs
   ================================================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8991;
const PDF  = process.env.QPDF || '/tmp/uriage.pdf';
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); }
                          else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
/* 🔴 自分のコメントに正規表現が当たる事故を何度もやっているので、必ず先に外す */
const bare = f => fs.readFileSync(path.join(process.cwd(), f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

console.log('\n── 🔍 決めごとがコードに入っているか ──');
{
  const view = bare('js/quarter.js');
  const store = bare('js/quarter-store.js');
  const insp = bare('js/inspect.js');
  ok('🗓 月ぶんをそろえる口がある（buildMonth）', /function buildMonth\(U, ym, opt\)/.test(view));
  ok('🔴 crossLink は「そろえてから1回」だけ',
     (view.match(/pitQCrossLink\(/g) || []).length === 2, (view.match(/pitQCrossLink\([^)]*\)/g) || []));
  ok('🔴 PDFを読んだあとも月ぶんをそろえる', /buildMonth\(U, monthOf\(U/.test(view));
  ok('🔴 保存から借りた組は保存し直さない', /g\.出どころ !== '保存' && g\.全部/.test(view));
  ok('🔴 残り件数の物差しは pitQNokori 1本（一覧の要約も）', /直す件数: \(w\.pitQNokori \? w\.pitQNokori\(res\)/.test(store));
  ok('⏳ 読み込み中は数字を出さない（くるくるだけ）', /if \(U\.busy\)\{\s*return h \+ '<div class="q-load">/.test(view.replace(/\n\s*/g,'')));
  ok('🔴 月が変わったら結果を捨てる口がある', /w\.pitQClearForMonth = function/.test(view));
  ok('🔴 月バーがその口を呼んでいる', /window\.pitQClearForMonth\(UI\.ym\)/.test(insp));
  ok('⚠ 在りもしない期間を何度も読みに行かない', /月に無い/.test(view));
}

if (!fs.existsSync(PDF)) {
  console.log('\n⚠ 本物のPDF (' + PDF + ') が無いので、動かす試験は飛ばします。');
  console.log('\n' + (fail ? '⚠ ' : '🎉 ') + pass + ' OK / ' + fail + ' NG');
  process.exit(fail ? 1 : 0);
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1200 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text().slice(0, 200)); });
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.pitQPdfRead && window.pitQSaveRuns', null, { timeout: 25000 });
await p.waitForTimeout(600);

/* にせのクラウド＋描き先＋ファイル入力 */
await p.evaluate(() => {
  const DB = (window.__db = { docs: {}, writes: [], reads: [] });
  window.PIT_CLOUD = true;
  window.fb = { company(){ return { collection(){ return { doc(id){ return {
    get(){ DB.reads.push(id); return Promise.resolve({ exists: DB.docs[id] != null, data(){ return DB.docs[id]; } }); },
    set(v){ DB.writes.push(id); DB.docs[id] = JSON.parse(JSON.stringify(v)); return Promise.resolve(); },
    delete(){ delete DB.docs[id]; return Promise.resolve(); } }; } }; } }; } };
  window._insp = window._insp || {}; window._insp.q = window._insp.q || {};
  window._insp.q.ym = '2026-08'; window._insp.q.marks = []; window._pitQMarks = [];
  document.body.insertAdjacentHTML('beforeend',
    '<div id="qhost"></div><input id="qfile" type="file" onchange="pitQPickFile(this)">');
  window.renderInspect = function(){ const h = document.getElementById('qhost'); if (h) h.innerHTML = window.pitQuarterHtml(); };
});

/* ================================================================
   本物のPDFから、本番と同じ形のカードを作る
   🔴 **小松園芸だけ 実績日を Q1 にする**（本番＝実績日 8/3・伝票 8/20）
   🔴 Q1・Q3 の伝票のうち何台かは 実績日を Q2 にする
      ＝「Q2に期ズレがずらっと」を作る（本番は17台）
   ================================================================ */
console.log('\n── 📄 本物のPDFを読む ──');
const setup = await p.evaluate(async () => {
  const res = await fetch('/_pdf.pdf'); const buf = await res.arrayBuffer();
  const out = await window.pitQPdfRead(new File([buf], 'a.pdf', { type:'application/pdf' }), () => {});
  const slips = out.伝票;
  let ずらし = 0;
  window.state.cards = slips.map(function (x, i) {
    let 実績 = x.売上日;
    if (/小松園芸/.test(x.顧客名)) 実績 = '2026-08-03';                 /* 本番と同じ（伝票Q3・実績Q1） */
    else if ((x.売上日 <= '2026-08-07' || x.売上日 >= '2026-08-16') && ずらし < 17) {
      実績 = '2026-08-12'; ずらし++;                                    /* 実績だけQ2へ＝期ズレ */
    }
    return { id:'rc-' + i, resNo:'R' + i, status:'returned',
      plate:x.ナンバー, customer:x.顧客名, car:x.車種,
      completedAt:実績, returnDate:実績, returnDateFinal:実績, reserveDate:実績,
      salesDate:x.売上日, amountFinal:x.比べる金額, frontStaff:x.受付担当 };
  });
  return { 枚数: slips.length, 期間: out.期間, 検算: out.検証.総合計が合う,
           総合計: out.検証.総合計, ずらした: ずらし,
           小松: slips.filter(x => /小松園芸/.test(x.顧客名)).map(x => x.売上日 + '/' + x.比べる金額) };
});
ok('🔴 本物のPDFが自己検証を通る（枚数も総合計も合う）', setup.検算 === true, setup);
ok('109枚・14,621,800円', setup.枚数 === 109 && setup.総合計 === 14621800, setup);
ok('期間は 8/1〜8/23', setup.期間.from === '2026-08-01' && setup.期間.to === '2026-08-23', setup.期間);
ok('小松園芸の伝票は 8/20・82,470円（Q3）', setup.小松[0] === '2026-08-20/82470', setup.小松);
ok('期ズレを17台つくった（本番と同じ数）', setup.ずらした === 17, setup.ずらした);

await p.setInputFiles('#qfile', PDF);
await p.waitForFunction('window._insp.q.res && !window._insp.q.busy', null, { timeout: 60000 });
await p.waitForTimeout(400);

const 直後 = await p.evaluate(() => {
  const U = window._insp.q;
  function 箱(g){
    const R = g.res, G = R.グループ;
    const S = R.整備ソフトだけ || [], P = R.PitFlowだけ || [];
    const 知 = P.filter(x => x.別のQ確定).length;
    return { Q:g.no, 出:g.出どころ, 枚:g.soft.length,
             データ:G.データ.length + S.length + P.length - 知,
             OK:G.OK.length + 知, 残:window.pitQNokori(R) };
  }
  U.gi = 0; window.pitQPickGroup(0);
  const h1 = window.pitQuarterHtml();
  return { 組: U.groups.map(箱),
           一覧: ((window.__db.docs.qruns || {}).一覧 || []).map(x => ({ id:x.id, 直す:x.直す件数 })).sort((a,b)=>a.id<b.id?-1:1),
           小松: U.groups.map(g => ({ Q:g.no,
             P:(g.res.PitFlowだけ || []).filter(x => /小松園芸/.test(x.顧客名)).map(x => !!x.別のQ確定) })),
           Q1画面: h1 };
});
console.log('\n── 🪞 PDFを読んだ直後 ──');
ok('組が3つできた（Q1〜Q3）', 直後.組.length === 3, 直後.組);
ok('どれもPDFから来た組', 直後.組.every(g => g.出 === 'PDF'), 直後.組);
ok('🔴 小松園芸は Q1 で「伝票は別のQ（確定）」', 直後.小松[0].P[0] === true, 直後.小松);
ok('🔴 一覧の「直す件数」＝画面の「残」と同じ（物差しが1本）',
   直後.一覧.every(function (x, i) {
     const g = 直後.組.filter(g => ('qrun-' + g.Q) && true);
     return true;
   }) && JSON.stringify(直後.一覧.map(x => x.直す)) === JSON.stringify(直後.組.map(g => g.残)),
   { 一覧: 直後.一覧.map(x => x.直す), 画面: 直後.組.map(g => g.残) });

/* ================================================================
   画面を空にして、保存から Q1 を開く（＝ゆうたのリロード相当）
   ================================================================ */
console.log('\n── 🗄 画面を空にして、保存から Q1 を開く ──');
const 戻し = await p.evaluate(async () => {
  const U = window._insp.q;
  window.pitQClearForMonth('2026-08');
  U.list = await window.pitQLoadList();
  const 空 = window.pitQuarterHtml();
  window.pitQOpenPlan('2026-08-01', '2026-08-07');
  const 途中 = window.pitQuarterHtml();          /* 読んでいる最中 */
  await new Promise(r => setTimeout(r, 1500));
  window.pitQPickGroup(0);
  const h2 = window.pitQuarterHtml();
  function 箱(g){
    const R = g.res, G = R.グループ;
    const S = R.整備ソフトだけ || [], P = R.PitFlowだけ || [];
    const 知 = P.filter(x => x.別のQ確定).length;
    return { Q:g.no, 出:g.出どころ, 枚:g.soft.length,
             データ:G.データ.length + S.length + P.length - 知,
             OK:G.OK.length + 知, 残:window.pitQNokori(R) };
  }
  return { 空に数字がない: !/q-nums/.test(空),
           途中はくるくる: /q-load/.test(途中) && !/q-nums/.test(途中),
           組: U.groups.map(箱),
           小松: U.groups.map(g => ({ Q:g.no,
             P:(g.res.PitFlowだけ || []).filter(x => /小松園芸/.test(x.顧客名))
                 .map(x => ({ 確定: !!x.別のQ確定, 文: String(x.別のQ || '') })) })),
           Q1画面: h2 };
});
ok('🔴 空にしたら数字が1つも出ない', 戻し.空に数字がない === true);
ok('🔴 読んでいる最中は「くるくる」だけ（古い数字を出さない）', 戻し.途中はくるくる === true);
ok('🔴🔴 開いたQだけでなく、**その月の3つとも**そろっている', 戻し.組.length === 3, 戻し.組);
ok('どれも保存から来た組', 戻し.組.every(g => g.出 === '保存'), 戻し.組);
ok('🔴🔴 小松園芸が Q1 で赤に戻らない（別のQ・確定のまま）',
   戻し.小松[0].P[0] && 戻し.小松[0].P[0].確定 === true, 戻し.小松);
ok('　どのQに在るかを、そのまま言う', /第3クォーター/.test((戻し.小松[0].P[0] || {}).文 || ''), 戻し.小松[0].P);

console.log('\n── 🔢 箱の中身が PDF を読んだ直後と同じか ──');
{
  const A = 直後.組, B = 戻し.組;
  A.forEach(function (a, i) {
    const bb = B[i] || {};
    ok('Q' + a.Q + '「データがちがう」が増えていない（' + a.データ + '件のまま）',
       bb.データ === a.データ, { 直後:a, 戻し:bb });
    ok('Q' + a.Q + '「OK」が減っていない（' + a.OK + '件のまま）',
       bb.OK === a.OK, { 直後:a, 戻し:bb });
    ok('Q' + a.Q + '「残」が同じ（' + a.残 + '件）', bb.残 === a.残, { 直後:a, 戻し:bb });
  });
}

console.log('\n── 🪞 画面そのものが同じか ──');
{
  /* ⚠ 外してから比べるのは2か所だけ。**どちらも「ちがって当たり前」で、画面にもそう書いてある。**
       ・q-saved … どこから来た画面かの断り書き
       ・q-wr    … 書き込みの帯。保存から開いた画面には**伝票の中身が無い**ので、
                   来店履歴にぶら下げるぶんは書けない（帯にその理由を書いている＝下で見張る） */
  const cut = h => { const i = h.indexOf('<div class="q-nums'); return i < 0 ? h : h.slice(i)
      .replace(/<div class="q-saved">[\s\S]*?<\/div>\s*/g, '')
      .replace(/<div class="q-wr[\s\S]*?<\/div>\s*(?=<div class="q-gr">)/, ''); };
  const a = cut(直後.Q1画面), b2 = cut(戻し.Q1画面);
  let d = 0; while (d < a.length && d < b2.length && a[d] === b2[d]) d++;
  ok('🔴🔴 PDFを読んだ直後と、保存から開いたQ1が**1文字も違わない**',
     a === b2, a === b2 ? '' : { 位置:d, 直後:a.slice(Math.max(0,d-90), d+120), 戻し:b2.slice(Math.max(0,d-90), d+120) });
  ok('🔴 ちがう所（書き込みの帯）は、ちがう理由を画面に書いている',
     /伝票の中身は残していない/.test(戻し.Q1画面) && !/伝票の中身は残していない/.test(直後.Q1画面));
}

console.log('\n── 🗓 別のQへ移っても崩れない ──');
const Q2 = await p.evaluate(async () => {
  const U = window._insp.q;
  window.__db.reads = [];                 /* ここから先だけ数える */
  window.pitQOpenPlan('2026-08-08', '2026-08-15');
  await new Promise(r => setTimeout(r, 900));
  const R = U.res, G = R.グループ;
  const P = R.PitFlowだけ || [], S = R.整備ソフトだけ || [];
  const 知 = P.filter(x => x.別のQ確定).length;
  return { from:U.from, to:U.to, 組数:U.groups.length,
           データ: G.データ.length + S.length + P.length - 知,
           PitFlowだけ: P.length, 別Q確定: 知, 残: window.pitQNokori(R),
           読んだ書類: window.__db.reads.filter(k => /^qrun-/.test(k)).length };
});
ok('Q2 に移れた', Q2.from === '2026-08-08', Q2);
ok('🔴🔴 Q2 の「データがちがう」に期ズレがずらっと出ない',
   Q2.データ === 直後.組[1].データ, { 戻し:Q2.データ, 正しい:直後.組[1].データ });
ok('🔴 17台ぶんが「別のQ（確定）」として OK 側にいる', Q2.別Q確定 === Q2.PitFlowだけ && Q2.PitFlowだけ >= 17,
   { PitFlowだけ:Q2.PitFlowだけ, 別Q確定:Q2.別Q確定 });
ok('⚠ 同じ月を見ている間、書類を何度も読みに行かない（1つの月で4件まで）',
   Q2.読んだ書類 <= 5, Q2.読んだ書類);

/* ================================================================
   ✍ 書き込みは「Qごと」（ゆうた 2026-08-25）
   ================================================================ */
console.log('\n── ✍ 書き込みは Q ごと ──');
const 書き = await p.evaluate(async () => {
  const U = window._insp.q;
  /* PDFを読み直して、3つの組がそろった状態に戻す */
  window.pitQClearForMonth('2026-08');
  U.list = await window.pitQLoadList();
  window.pitQOpenPlan('2026-08-01', '2026-08-07');
  await new Promise(r => setTimeout(r, 1500));
  /* 押す前の確認の文言を横取りする（本当に押さずに中身だけ見る） */
  let det = null;
  const askOrig = window.pitAsk;
  window.pitAsk = function (title, opt) { det = (opt && opt.detail) || ''; return Promise.resolve(true); };
  const 帯 = g => { window.pitQPickGroup(g); return window.pitQWritePanel(U.res, U); };
  const 前 = [0,1,2].map(帯);
  window.pitQPickGroup(0);
  window.pitQWriteGo();
  await new Promise(r => setTimeout(r, 400));
  const 後 = [0,1,2].map(帯);
  window.pitAsk = askOrig;
  window.pitQPickGroup(0);
  return {
    確認の文: Array.isArray(det) ? det : [String(det || '')],
    前: 前.map(h => /書き込みました/.test(h) ? '済' : (/書き込む<\/button>/.test(h) ? '書ける' : (h ? 'その他' : '出ない'))),
    後: 後.map(h => /書き込みました/.test(h) ? '済' : (/書き込む<\/button>/.test(h) ? '書ける' : (h ? 'その他' : '出ない'))),
    印の場所: U.groups.map(g => !!g.書き込んだ),
    Uに印がない: !U.書き込んだ
  };
});
ok('🔴 確認の文は1行だけ（作業内容の履歴と車体番号）',
   書き.確認の文.length === 1 && /作業内容の履歴と車体番号を書き込みます/.test(書き.確認の文[0]), 書き.確認の文);
ok('🔴 「原価」「全員に見えます」の文言を出さない',
   !/原価|全員に見え/.test(書き.確認の文.join('')), 書き.確認の文);
ok('押す前は3つのQとも書ける', JSON.stringify(書き.前) === '["書ける","書ける","書ける"]', 書き.前);
ok('🔴🔴 Q1に書いても、Q2・Q3は**まだ書ける**（Qごと）',
   書き.後[0] === '済' && 書き.後[1] === '書ける' && 書き.後[2] === '書ける', 書き.後);
ok('🔴 済んだ印は「その組」に付く', JSON.stringify(書き.印の場所) === '[true,false,false]', 書き.印の場所);
ok('🔴 画面（U）には印を置かない', 書き.Uに印がない === true);

console.log('\n── ⏳ 読み込み中は Q1〜Q4 の箱にも古い数字を出さない ──');
const 箱 = await p.evaluate(async () => {
  const U = window._insp.q;
  const 前 = window.pitQuarterHtml();
  U.busy = '残してある結果を読んでいます…';
  const 中 = window.pitQuarterHtml();
  U.busy = '';
  return {
    前に数字がある: /q-pq-d">このPDF|に実施/.test(前),
    中は読み込み中だけ: /q-pq is-load/.test(中)
      && !/このPDF \d+枚/.test(中) && !/残 <b>/.test(中) && !/に実施/.test(中),
    押せない: (中.match(/q-pq is-load" disabled/g) || []).length >= 4
  };
});
ok('（くらべる元）ふだんは箱に数字が出ている', 箱.前に数字がある === true);
ok('🔴🔴 読み込み中は箱に数字を1つも出さない', 箱.中は読み込み中だけ === true, 箱);
ok('🔴 読み込み中は箱を押せない', 箱.押せない === true, 箱);

console.log('\n── 🗓 月を変えたら前の月を捨てる ──');
const 月 = await p.evaluate(() => {
  window.pitQClearForMonth('2026-07');
  const h = window.pitQuarterHtml();
  const U = window._insp.q;
  return { 数字がない: !/q-nums/.test(h), res: U.res, 組: U.groups, pdf: U.pdf };
});
ok('🔴 前の月の数字が残らない', 月.数字がない === true && !月.res && !月.組, 月);
ok('🔴 前の月のPDFも残らない', !月.pdf, 月.pdf);

console.log('\n── 🧭 まわり ──');
{
  ok('エラーなし', errs.length === 0, errs.slice(0, 3));
  const ver = await p.evaluate(() => (document.querySelector('meta[name=app-version]') || {}).content || '');
  /* 🔴 版くらべは**数で**。文字のままだと '2.10.0' < '2.9.6' になって落ちる
     （2026-08-25 に踏んだ。2.9 の次が 2.10 になった瞬間、見張りが全部赤くなった）。 */
  const vn = (String(ver).match(/\d+/g) || []).map(Number);
  const need = '2.10.2'.split('.').map(Number);
  const ge = (a, b) => (a[0]||0) !== (b[0]||0) ? (a[0]||0) > (b[0]||0)
                     : (a[1]||0) !== (b[1]||0) ? (a[1]||0) > (b[1]||0)
                     : (a[2]||0) >= (b[2]||0);
  ok('版が v2.10.2 以降', ge(vn, need), ver);
}

await b.close();
console.log('\n' + (fail ? '⚠ ' : '🎉 ') + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
