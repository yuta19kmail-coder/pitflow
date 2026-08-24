/* PitFlow v2.4.0 ── 🖨 元の売上チェックリストPDFに、気になる所を刷り込む
   ===================================================================
   ◎ここで見張ること（2026-08-24 ゆうた指定）
     🗣「これって直にPDFに記載を入れて 元の形のまま再印刷するようにはできる？」
     🔴🔴 **元のPDFの中身は1文字も書き換えない。** 上に重ねるだけ。
     🔴🔴 **紙に行があるものが先。** 「いつものが無い」は紙に行が無いので後ろにまとめる。
        ⚠ ここを確度順に混ぜると、1ページ目が「この行は紙にありません」だらけになる（実際なった）。
     🔴 **紙に落とす数は絞る**（低まで全部刷ると紙が真っ赤で読めない）。
        ただし **帯が1本も引かれない**ことがないよう、紙に行があるもので埋める。
     🔴 **「初めて見る品名」を紙のいちばん上にしない**（数字では何も言えないもの）。
     🔴 **日本語は絵にして貼る**（字の形＝フォントを積まないため）。
     🔴 **道具はネットから取りに行かない**（アプリと一緒に配る）。

   ◎使い方
     python3 -m http.server 8982      ← 別ウィンドウ
     node test_quarter_print.mjs                                        */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8982;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); }
                               else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch(cp ? { executablePath: cp } : {});
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.pitQPrintPlan && window.pitCostLookAll && window.PIT_COST_BOOK',
                        null, { timeout: 25000 });

/* 下ごしらえ＝紙の場所を持った伝票を、自分で作る（実物のPDFは要らない）。
   ⚠ 枠と頁が入っている行だけが「紙にある」＝帯を引ける。 */
function slip(no, rows){
  return { 売上日:'2026-07-02', 伝票:no, ナンバー:'船橋 300 あ 1111', 顧客名:'あ 一郎',
           車種:'ミニ', 金額:100000, 明細: rows };
}
const 枠 = (y) => ({ x1:y, y1:0, x2:y+7, y2:842, 右x:y+3, 右y:820 });

console.log('\n── ① 紙の場所が分かっている行にだけ、帯を引く ──');
{
  const r = await p.evaluate(([SL, BOX]) => {
    window._insp = window._insp || {};
    window._insp.q = { from:'2026-07-01', to:'2026-07-07', gi:0, groups:null,
                       元のPDF:new Uint8Array([1,2,3]), soft: SL };
    window._insp.ai = { 見立て:null };
    const P = pitQPrintPlan();
    return { 帯: P.marks.length, 一覧: P.list.length,
             帯の頁: P.marks.map(m => m.頁),
             紙あり: P.list.map(x => x.紙あり),
             名: P.list.map(x => x.名), 種: P.list.map(x => x.種) };
  }, [[slip('0001', [
        { 種:'作業', 名:'エンジン・オイル交換', 金額:3000, 原価:0 },
        /* うちのふだんは 45〜60%。90% は外れる＝紙にある */
        { 種:'部品', 名:'オイルフィルター', 数量:1, 単価:4000, 金額:4000, 原価:3600,
          頁:5, 枠:{ x1:300, y1:0, x2:307, y2:842, 右x:303, 右y:820 } },
        /* 覚えに無い品名＝紙にある */
        { 種:'部品', 名:'ぜんぜん知らない部品', 数量:1, 単価:5000, 金額:5000, 原価:100,
          頁:5, 枠:{ x1:320, y1:0, x2:327, y2:842, 右x:323, 右y:820 } }
      ])], null]);
  ok('🖨 紙に行があるものは、帯を引く（2件）', r.帯 === 2, r);
  ok('🔴 帯にはページ番号が入っている', r.帯の頁.every(x => x === 5), r.帯の頁);
  ok('🔴🔴 「いつものが無い」（紙に行が無い）は、一覧には出るが帯は引かない',
     r.一覧 > r.帯 && r.紙あり.filter(x => !x).length === (r.一覧 - r.帯), r);
  ok('🔴🔴 紙に行があるものが**先**（1ページ目が「紙にありません」だらけにならない）',
     r.紙あり.slice(0, r.帯).every(x => x === true)
     && r.紙あり.slice(r.帯).every(x => x === false), r.紙あり);
  ok('🔴 「初めて見る品名」は、紙のいちばん上にしない（数字では何も言えないもの）',
     r.種[0] !== '初めて', r.種);
}

console.log('\n── ② 元のPDFが手元にないと刷れない ──');
{
  const r = await p.evaluate(() => {
    const keep = window._insp.q.元のPDF;
    window._insp.q.元のPDF = null;
    const a = pitQPrintCan();
    window._insp.q.元のPDF = keep;
    const b2 = pitQPrintCan();
    return { なし: a, あり: b2 };
  });
  ok('🔴 元のPDFが無ければ刷らない（黙って空を出さない）',
     r.なし.ok === false && /入れ直/.test(r.なし.why), r.なし);
  ok('🔴 その理由を言う', !!r.なし.why, r.なし);
  ok('🖨 そろっていれば刷れる（何件刷るかも言う）',
     r.あり.ok === true && r.あり.n > 0, r.あり);
}

console.log('\n── ③ 刷るものが無い時は、刷らない ──');
{
  const r = await p.evaluate(() => {
    const keep = window._insp.q.soft;
    window._insp.q.soft = [{ 売上日:'2026-07-02', 伝票:'0002', 顧客名:'あ 一郎', 車種:'ミニ',
                             金額:1000, 明細:[{ 種:'作業', 名:'なにか', 金額:1000, 原価:0 }] }];
    const a = pitQPrintCan();
    window._insp.q.soft = keep;
    return a;
  });
  ok('🔴 刷るものが0件なら、そう言って止まる', r.ok === false, r);
}

console.log('\n── ④ AIの見立てが入っていれば、そちらの確度で並べる ──');
{
  const r = await p.evaluate(() => {
    const before = pitQPrintPlan().list.map(x => x.確度);
    /* オイルフィルターの行（伝票0001の1行目）を「高」に上げる */
    window._insp.ai.見立て = { '0001#1': { 確度:'高', なぜ:'社外品に替えた可能性があります' } };
    const P = pitQPrintPlan();
    window._insp.ai.見立て = null;
    return { 前: before, 後: P.list.map(x => x.確度), 頭: P.list[0], なぜ: P.list[0].なぜ };
  });
  ok('🤖 AIが「高」と言った行が、いちばん上に来る', r.後[0] === '高', r.後.slice(0, 3));
  ok('🤖 AIのひとことも、紙の一覧に載る', /社外品/.test(r.なぜ), r.なぜ);
  ok('🔴 AIを走らせていなくても並ぶ（お金をかけずに刷れる）', r.前.length > 0, r.前.length);
}

console.log('\n── ⑤🧭 ソースの見張り ──');
{
  const pr = fs.readFileSync('js/quarter-print.js', 'utf8');
  const pf = fs.readFileSync('js/quarter-pdf.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const live = strip(pr);

  ok('🔴🔴 書き込む道具はネットから取りに行かない（アプリと一緒に配る）',
     /js\/vendor\/pdf-lib/.test(live) && !/https?:\/\//.test(live.replace(/pdf-lib/g, '')), '');
  ok('🔴 その道具が本当に置いてある',
     fs.existsSync('js/vendor/pdf-lib.esm.min.js')
     && fs.statSync('js/vendor/pdf-lib.esm.min.js').size > 100000, '');
  ok('🔴 使い道の分かる置き手紙がある（何を・どこから・なぜ）',
     /pdf-lib/.test(fs.readFileSync('js/vendor/_これは何.md', 'utf8')), '');
  ok('🔴 ゆずりうけの文（ライセンス）も置いてある', fs.existsSync('js/vendor/LICENSE-pdf-lib.txt'), '');
  ok('🔴 道具は**押した時に初めて**読み込む（ふだんの画面を重くしない）',
     /import\(abs\(LIB_URL\)\)/.test(live) && !/<script[^>]*pdf-lib/.test(html), '');

  ok('🔴🔴 日本語は**絵にして貼る**（字の形を積まない＝アプリを数MB太らせない）',
     /toDataURL\('image\/png'\)/.test(live) && /embedPng/.test(live), '');
  ok('🔴 日本語のフォントを積んでいない（vendor にも、読み込む先にも無い）',
     !/\.ttf|\.otf|\.woff/.test(live)
     && !/embedFont\(\s*(?!L\.StandardFonts)/.test(live)
     && !fs.readdirSync('js/vendor').some(f => /\.(ttf|otf|woff2?)$/i.test(f)), '');
  ok('🔴 数字はPDFがもともと持っている字で書く', /StandardFonts\.Helvetica/.test(live), '');

  ok('🔴🔴 元のPDFの中身は書き換えない（ページを消す・入れかえる道具を呼んでいない）',
     !/removePage|insertPage|setMediaBox|removeLeaf/.test(live), '');
  ok('🔴🔴 紙のどこにあるかは、読んだ時に測ったものを使う（回転の計算を書き直さない）',
     /convertToPdfPoint/.test(pf) && !/convertToPdfPoint/.test(live)
     && !/Math\.(sin|cos)/.test(live), '');
  ok('🔴 その測り（枠・右の余白）を、読んだ時に持たせている',
     /枠: box/.test(pf) && /右x: rr\[0\]/.test(pf), '');
  ok('🔴 元のPDFそのものも取ってある（刷り直しに要る）',
     /元のPDF = _bytes/.test(pf), '');
  ok('🔴 紙に落とす数を絞ったことを、一覧に書いている（黙って捨てない）',
     /全体/.test(live) && /全 /.test(pr), '');
}

ok('🔴 画面がつまずいていない（赤いエラーが1つも出ていない）', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log('\n🎉 ' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
