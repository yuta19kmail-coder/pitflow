/* PitFlow v1.181.0 ── 🧾 クォーターチェック（②売上チェックリスト突合／③AIチェック）
   ===================================================================
   ◎ここで見張ること
     🔴🔴 **本物のデータで、手作業の答えとぴったり同じ数字になること。**
        材料＝`資料/突合サンプル/`（2026-08-01〜08-07・整備ソフト67枚／PitFlow 135台）
        答え＝2026-08-08 に手で回した時の数字（引き継ぎメモに全部書いてある）
     🔴 **合計が合うまで数字を出さない**＝検算が合うこと・読み取りが自己検証に落ちたら
        画面に数字を1つも出さないこと
     🔴 ならし（ナンバー・名前・担当の名寄せ）と、日付の3段階
     🔴 判定を画面（quarter.js）に書き写していないこと

   ◎日付について（横断の見張り ④ の決めごと）
     ⚠ この試験は**過ぎた日付の実データ**を読む（2026-08）。
        「今日から何日」では書けないので、**材料の中の日付**をそのまま使う。
        画面の側（いまのクォーター）は today 依存なので、そこは日付を見張らない。

   ◎使い方
     python3 -m http.server 8998      ← 別ウィンドウ
     node test_quarter.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8998;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

/* 🔴 材料は `資料/突合サンプル/`。**GitHub には上げていない**（お名前とナンバーが入っているため
   `.gitignore` で `資料/` を外している）。無い所で走らせた時は、**黙って緑にせず**そう言って止まる。 */
const F1 = '資料/突合サンプル/整備ソフト_2026-08-01_08-07.json';
const F2 = '資料/突合サンプル/PitFlow_2026-08-01_08-07.json';
if (!fs.existsSync(F1) || !fs.existsSync(F2)) {
  console.log('\n⏸ 見張り用の本物データがこの箱にありません（' + F1 + '）。');
  console.log('　 ゆうたのPCの D:\\Claude\\アプリ開発\\PitFlow\\pitflow\\資料\\突合サンプル\\ にあります。');
  console.log('　 ＝ この試験は走らせていません（**緑でも赤でもない**）。');
  process.exit(2);
}
const SOFT = JSON.parse(fs.readFileSync(F1, 'utf8'));
const PIT  = JSON.parse(fs.readFileSync(F2, 'utf8'));

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction("window.state && window.pitQMatch && window.pitQPdfParse && window.pitQuarterHtml && window.pitAiHtml && window.pitQSaveRun", null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(600);

console.log('\n── ① ならし（同じものを同じと見る） ──');
{
  const r = await p.evaluate(() => ({
    plate: [ pitQNormPlate('江東 300 せ 8134') === pitQNormPlate('江東300せ8134'),
             pitQNormPlate('千葉 31Y み 1000') === pitQNormPlate('千葉31Yみ1000'),
             pitQNormPlate('野田 500 あ 12-34') === pitQNormPlate('野田500あ1234') ],
    name:  [ pitQNormName('箱﨑 康起') === pitQNormName('箱崎康起'),
             pitQNormName('(有)ユウキオート箱﨑') === pitQNormName('有限会社ユウキオート箱崎'),
             pitQNormName('渡邊大輝') === pitQNormName('渡辺大輝') ],
    staff: [ pitQStaffName('専務') === '小林和枝', pitQStaffName('社長') === '小林政幸',
             pitQStaffName('チーフ') === '小林裕太', pitQStaffName('裕太') === pitQStaffName('小林裕太'),
             pitQStaffName('Agency株式会社箱﨑康起') === '箱崎康起',
             pitQStaffName('椎名 祐太') === pitQStaffName('椎名祐太') ]
  }));
  ok('🔴 ナンバーは空白・ハイフン・全角ちがいを同じと見る', r.plate.every(Boolean), r.plate);
  ok('🔴 お名前は異体字（﨑・邉）と法人の書き方を寄せる', r.name.every(Boolean), r.name);
  ok('🔴 担当は名寄せ表で寄せる（専務・社長・チーフ・請求先名つき）', r.staff.every(Boolean), r.staff);
}

console.log('\n── ② 日付の3段階（ゆうた確定） ──');
{
  const r = await p.evaluate(() => ({
    same:  pitQDateGap('2026-08-01','2026-08-01').kind,
    inQ:   pitQDateGap('2026-08-01','2026-08-02').kind,     /* 1-7 の中 */
    crossQ:pitQDateGap('2026-08-07','2026-08-08').kind,     /* 1-7 → 8-15 */
    crossM:pitQDateGap('2026-07-31','2026-08-01').kind,     /* 月またぎ */
    label: pitQDateGap('2026-08-07','2026-08-08').label
  }));
  ok('同じ日は「同じ」', r.same === 'same', r);
  ok('🔴 同じクォーターの中は出さない（sameQ）', r.inQ === 'sameQ', r);
  ok('🔴 クォーターをまたぐ（crossQ）', r.crossQ === 'crossQ', r);
  ok('🔴 月をまたぐ（crossMonth）＝Qまたぎより先に見る', r.crossM === 'crossMonth', r);
  ok('人が読む言葉で返す', /Qまたぎ/.test(r.label) && /\+1日/.test(r.label), r.label);
}

console.log('\n── ③🔴🔴 本物のデータ（2026-08-01〜08-07）で、手作業の答えと同じになる ──');
const R = await p.evaluate(([soft, pit]) => {
  const r = pitQMatch(soft.伝票, pit.明細, { from:'2026-08-01', to:'2026-08-07' });
  return {
    soft: r.整備ソフト, pit: r.PitFlow, diff: r.差, uch: r.内訳, kensan: r.検算,
    tied: r.結びついた.length, amtNg: r.金額ちがい.length,
    crossQ: r.Qまたぎ.length, crossM: r.月またぎ.length,
    onlySoft: r.整備ソフトだけ.length, onlyPit: r.PitFlowだけ.length,
    staffNg: r.担当ちがい.length,
    lump: r.まとめ返車,
    card: r.整備ソフトだけ.filter(x => x.カード).length,
    amtRows: r.金額ちがい.map(x => ({ n: x.soft.顧客名, d: x.差 }))
  };
}, [SOFT, PIT]);

ok('🔴 整備ソフト＝67枚 / 8,155,215円', R.soft.枚数 === 67 && R.soft.金額 === 8155215, R.soft);
ok('🔴 PitFlow（期間内の実績）＝47台 / 4,917,280円', R.pit.台数 === 47 && R.pit.金額 === 4917280, R.pit);
ok('🔴 差＝+20台 / +3,237,935円', R.diff.台数 === 20 && R.diff.金額 === 3237935, R.diff);
ok('🔴 結びついた＝55件', R.tied === 55, R.tied);
ok('🔴 整備ソフトだけ＝12台 / +1,972,014円', R.onlySoft === 12 && R.uch.整備ソフトだけ.金額 === 1972014, R.uch.整備ソフトだけ);
/* 🔴 ここだけ 2026-08-08 の手作業と**わざと1件ちがう**（10 → 9）。
   あの時のレポートは「仮登録車両あけぼの自動車」（ナンバー空）を、
   **お客様名が「シガ」のカード**（W87869）と結んでいた。＝ 別の車を結んだ**間違い**。
   いまの物差しは「見当たらない」と正直に言う。
   ⚠ お金には1円も影響しない（どちらにしても「整備ソフトだけ」の12台に入る）。
      これは「カードが有るかもしれない」という**お知らせだけ**の欄。
   🔴 **手作業の答えを再現するために、物差しを間違いに合わせない。** */
ok('🔴 うち9台は「PitFlow にカードは有る」（まだ返車済みにしていないだけ）', R.card === 9, R.card);
ok('🔴 見当たらない3台＝ユウキオート箱﨑・成田脩人・仮登録車両あけぼの自動車', R.onlySoft - R.card === 3, R.onlySoft - R.card);
ok('🔴 PitFlowだけ＝2台 / −426,800円', R.onlyPit === 2 && R.uch.PitFlowだけ.金額 === -426800, R.uch.PitFlowだけ);
ok('🔴 期間の外＝10台 / +1,675,057円', R.uch.期間の外.台数 === 10 && R.uch.期間の外.金額 === 1675057, R.uch.期間の外);
ok('🔴 金額そのもののちがい＝+17,664円（±1円のぶんも足す）', R.uch.金額ちがい.金額 === 17664, R.uch.金額ちがい);
ok('🔴🔴 検算が合う（取りこぼしが無い）', R.kensan.合う === true && R.kensan.ずれ === 0, R.kensan);
ok('🔴 金額ちがい（±1円を超えるもの）＝2件', R.amtNg === 2, R.amtRows);
ok('　その2件＝松本治 +18,330／小谷初惠 −668',
   R.amtRows.some(x => /松本/.test(x.n) && x.d === 18330) && R.amtRows.some(x => /小谷初/.test(x.n) && x.d === -668), R.amtRows);
ok('🔴 Qまたぎ＝10件', R.crossQ === 10, R.crossQ);
ok('🔴 月またぎ＝0件', R.crossM === 0, R.crossM);
ok('🔴 担当の要対応＝0件（名寄せが効いている）', R.staffNg === 0, R.staffNg);

console.log('\n── ④🔴 「まとめて返車済みにした日」を自分で見つける ──');
ok('🔴🔴 2026-08-08 に10台・1,675,057円が固まっていると言う',
   R.lump.length === 1 && R.lump[0].日 === '2026-08-08' && R.lump[0].台数 === 10 && R.lump[0].金額 === 1675057, R.lump);

console.log('\n── ⑤ 窓を広げないと「無い車」に化ける（v1 と v2 のちがい） ──');
{
  /* 🔴 2026-08-08 の教訓＝期間ぴったりで切ると、日付がズレている車が丸ごと消えて
     「整備ソフトにだけ有る」に化ける（22件に見えていた）。 */
  const r = await p.evaluate(([soft, pit]) => {
    const narrow = pit.明細.filter(x => x.対象期間内);            /* v1＝ぴったり */
    const a = pitQMatch(soft.伝票, narrow,   { from:'2026-08-01', to:'2026-08-07' });
    const b = pitQMatch(soft.伝票, pit.明細, { from:'2026-08-01', to:'2026-08-07' });
    return { narrow: a.整備ソフトだけ.length, wide: b.整備ソフトだけ.length,
             narrowQ: a.Qまたぎ.length, wideQ: b.Qまたぎ.length };
  }, [SOFT, PIT]);
  ok('🔴 ぴったりで切ると「無い車」が増える', r.narrow > r.wide, r);
  ok('🔴🔴 ぴったりで切るとQまたぎが1件も見えない（本命が消える）', r.narrowQ === 0 && r.wideQ === 10, r);
}

console.log('\n── ⑥ PDF の読み取り（自己検証が生命線） ──');
{
  /* ⚠ 本物のPDFはここに置いていない（個人情報）。**行に直したあと**の組み立てを見張る。 */
  /* ⚠ 行の形は**実物のとおり**にしてある（2026-08-23 に本物のPDFで確かめた）。
     🔴 締めの行は**2つの書き方**がある＝
        ① `伝票計 588,654 作業計/原価計 …`（札が一緒の行）
        ② `957,022 作業計/原価計 …` ＋ 次の行に `伝票計` だけ（札がずれる）
        だから**札の字ではなく、`作業計/原価計` の並び**で締めを見分けている。 */
  const lines = [
    '対象期間：令和 8年 8月 1日 ～ 令和 8年 8月 7日',            /* ⚠ これで伝票が始まってはいけない */
    '作成日付： 令和 8年 8月 7日 19時35分 ページ： 1',            /* ⚠ 同上 */
    '令和 8年 8月 1日 江東 300 せ 8134 個人 16787 藤井 義博 椎名 祐太',
    '078 GH2-026746 ＊＊＊',
    'インプレッサ 16787 藤井 義博',
    '整備',
    '1 自賠責保険 非課税 17,650',
    '2 重量税 非課税 34,200',
    '3 印紙代 非課税 2,600',
    '一般消費税 48,564',
    '伝票計 588,654 作業計/原価計 326,514 10,500 部品計/原価計 262,140 178,255',   /* ①札が一緒 */
    '令和 8年 8月 2日 なにわ 33 ふ 2510 個人 12345 原田 大介 椎名 祐太',
    '0266 JZS147-0098315 ＊＊＊',
    'アリスト 12345 原田 大介',
    '整備',
    '一般消費税 29,082',
    '319,902 作業計/原価計 158,182 1,000 部品計/原価計 161,720 110,107',            /* ②札がずれる */
    '伝票計',
    '組織計 908,556 合計枚数 2枚 作業計/原価計 1 1 部品計/原価計 1 1',
    '908,556 合計枚数 2枚 作業計/原価計 1 1 部品計/原価計 1 1',
    '総合計'
  ].map(x => ({ text: x }));
  const r = await p.evaluate((ls) => {
    const g = pitQPdfParse(ls);
    return { ok: g.ok, n: g.伝票.length, a: g.伝票[0], b: g.伝票[1], 合計: g.合計, 検証: g.検証 };
  }, lines);
  ok('🔴 2枚として読める（ページの繰り返しで伝票が始まらない）', r.n === 2, r.n);
  ok('🔴 売上日を西暦に直す（令和8年8月1日 → 2026-08-01）', r.a && r.a.売上日 === '2026-08-01', r.a);
  ok('🔴 ナンバーを拾う', r.a && /江東.*300.*せ.*8134/.test(r.a.ナンバー), r.a && r.a.ナンバー);
  ok('🔴 伝票番号を拾う（078 / 0266）', r.a && r.a.伝票 === '078' && r.b && r.b.伝票 === '0266', [r.a && r.a.伝票, r.b && r.b.伝票]);
  ok('🔴🔴 比べる金額＝伝票計 − 消費税 − 非課税（588,654−48,564−54,450＝485,640）',
     r.a && r.a.比べる金額 === 485640, r.a);
  ok('🔴🔴 札がずれた書き方でも締められる（319,902−29,082＝290,820）',
     r.b && r.b.比べる金額 === 290820, r.b);
  ok('🔴🔴 総合計と枚数が合ったので ok', r.ok === true, r.検証);
}
{
  /* 🔴🔴 合わなければ ok を返さない＝画面は数字を出さない */
  const r = await p.evaluate(() => {
    const ls = [
      '令和 8年 8月 1日 江東 300 せ 8134 個人 1 藤井 義博 椎名 祐太',
      '078 X ＊＊＊', 'インプレッサ', '整備',
      '一般消費税 1,000',
      '伝票計 11,000 作業計/原価計 1 1 部品計/原価計 1 1',
      '総合計 99,999 合計枚数 5枚 作業計/原価計 1 1 部品計/原価計 1 1'
    ].map(x => ({ text: x }));
    const g = pitQPdfParse(ls);
    return { ok: g.ok, why: g.検証.言い分, tot: g.検証.総合計が合う, sh: g.検証.枚数が合う };
  });
  ok('🔴🔴 総合計が合わなければ ok にしない', r.ok === false && r.tot === false, r);
  ok('🔴 枚数が合わないことも言う', r.sh === false, r);
  ok('🔴 何が合わなかったかを言葉で返す（黙らない）', (r.why || []).length >= 2, r.why);
}

console.log('\n── ⑥-2🔴🔴 本物のPDFを、頭からおしりまで通す ──');
{
  /* 🔴 材料＝整備ソフトが実際に出した売上チェックリスト（59ページ・67枚）。
     ⚠ 個人情報が入っているので `資料/`（git にも本番にも出ない）に置いてある。
     ここが緑なら、**ゆうたが画面でやることと同じことが最後まで通っている**。 */
  const PDF = '資料/突合サンプル/売上チェックリスト_2026-08-01_08-07.pdf';
  if (!fs.existsSync(PDF)) {
    console.log('  ⏸ 本物のPDFがこの箱にありません（' + PDF + '）＝この節は走らせていません');
  } else {
    const r = await p.evaluate(async ([url, pit]) => {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const f = new File([buf], '売上チェックリスト.pdf', { type: 'application/pdf' });
      let pages = 0;
      const g = await pitQPdfRead(f, (i, n) => { pages = n; });
      const soft = g.伝票.map(x => ({ 売上日:x.売上日, 伝票:x.伝票, ナンバー:x.ナンバー, 顧客名:x.顧客名,
                                      車種:x.車種, 金額:x.比べる金額, 受付担当:x.受付担当 }));
      const m = pitQMatch(soft, pit.明細, { from:'2026-08-01', to:'2026-08-07' });
      return {
        ok: g.ok, pages, 検証: g.検証, 合計: g.合計,
        blank: {
          plate: g.伝票.filter(x => !x.ナンバー).length,
          name:  g.伝票.filter(x => !x.顧客名).length,
          staff: g.伝票.filter(x => !x.受付担当).length,
          no:    g.伝票.filter(x => !x.伝票).length
        },
        ex: g.伝票.filter(x => ['071','078','0266'].indexOf(x.伝票) >= 0)
                  .map(x => ({ 伝票:x.伝票, 車種:x.車種, 額:x.比べる金額 })),
        差: m.差, 内訳: m.内訳, 検算: m.検算,
        tied: m.結びついた.length, lump: m.まとめ返車, crossQ: m.Qまたぎ.length, staffNg: m.担当ちがい.length
      };
    }, [PDF, PIT]);

    ok('🔴 59ページ読める（道具はアプリと一緒に配っている＝ネットに出ない）', r.pages === 59, r.pages);
    ok('🔴🔴 自分の答え合わせに通る（総合計 9,828,090・合計枚数 67枚）',
       r.ok === true && r.検証.総合計 === 9828090 && r.検証.合計枚数 === 67, r.検証);
    ok('🔴🔴 PitFlow と比べる合計＝8,155,215円（伝票計−消費税−非課税）',
       r.合計.比べる金額 === 8155215 && r.合計.消費税 === 815515 && r.合計.非課税 === 857360, r.合計);
    ok('🔴 ナンバー・お客様・受付担当・伝票番号が、67枚とも1つも空でない',
       r.blank.plate === 0 && r.blank.name === 0 && r.blank.staff === 0 && r.blank.no === 0, r.blank);
    ok('🔴 仕様の3例と同じ額（071 ミニ 870,020／078 インプレッサ 485,640／0266 アリスト 290,820）',
       r.ex.length === 3
       && r.ex.every(x => (x.伝票 === '071'  && x.額 === 870020 && x.車種 === 'ミニ')
                       || (x.伝票 === '078'  && x.額 === 485640 && x.車種 === 'インプレッサ')
                       || (x.伝票 === '0266' && x.額 === 290820 && x.車種 === 'アリスト')), r.ex);
    ok('🔴🔴 本物のPDFから突き合わせても、手作業の答えと同じ（+20台 +3,237,935円）',
       r.差.台数 === 20 && r.差.金額 === 3237935, r.差);
    ok('🔴🔴 内訳も同じ（12 / 2 / 10 / 金額ちがい）',
       r.内訳.整備ソフトだけ.台数 === 12 && r.内訳.PitFlowだけ.台数 === 2
       && r.内訳.期間の外.台数 === 10 && r.内訳.金額ちがい.金額 === 17664, r.内訳);
    ok('🔴🔴 検算が合う', r.検算.合う === true && r.検算.ずれ === 0, r.検算);
    ok('🔴 結びついた 55件／Qまたぎ 10件／担当ちがい 0件',
       r.tied === 55 && r.crossQ === 10 && r.staffNg === 0, { t:r.tied, q:r.crossQ, s:r.staffNg });
    ok('🔴 まとめて返車済みにした日（2026-08-08・10台）も同じ',
       r.lump.length === 1 && r.lump[0].日 === '2026-08-08' && r.lump[0].台数 === 10, r.lump);
  }
}

console.log('\n── ⑦ 画面（並べるだけ・判定を書き写していない） ──');
{
  const r = await p.evaluate(([soft, pit]) => {
    window._insp = window._insp || {};
    window._insp.mode = 'quarter';
    window._insp.q = { from:'2026-08-01', to:'2026-08-07', res:null, pdf:'テスト.pdf', tab:'lump', busy:'', err:'' };
    /* 読み取りに失敗した時＝数字を1つも出さない */
    window._insp.q.err = 'テスト：総合計が合いません';
    renderInspect();
    const body = document.getElementById('inspect-body');
    const ngTxt = body.textContent || '';
    const hasNum = /8,155,215|3,237,935/.test(ngTxt);
    /* 成功した時 */
    window._insp.q.err = '';
    window._insp.q.res = pitQMatch(soft.伝票, pit.明細, { from:'2026-08-01', to:'2026-08-07' });
    renderInspect();
    const t2 = body.textContent || '';
    return {
      ngShown: /読み取りに失敗/.test(ngTxt), ngNoNumber: !hasNum,
      sum: /8,155,215/.test(t2) && /4,917,280/.test(t2),
      audit: /ぴったり合いました/.test(t2),
      lump: /まとめて返車済みにした日/.test(t2) && /10台/.test(t2),
      tabs: body.querySelectorAll('.q-tab').length,
      rows: body.querySelectorAll('.q-t tbody tr').length,
      ai: /AI に渡すもの/.test(t2)
    };
  }, [SOFT, PIT]);
  ok('🔴🔴 読み取りに失敗した時は、そう言う', r.ngShown === true, r);
  ok('🔴🔴 その時、数字を1つも出さない', r.ngNoNumber === true, r);
  ok('🔴 合計が画面に出る', r.sum === true, r);
  ok('🔴 検算の結果が画面に出る', r.audit === true, r);
  ok('🔴 まとめて返車済みにした日が先頭に出る', r.lump === true, r);
  ok('タブが7つ出る', r.tabs === 7, r.tabs);
  ok('一覧に行が出る（期間の外＝10件）', r.rows === 10, r.rows);
  ok('🤖 ③AIチェックの「渡すもの」も出る', r.ai === true, r);
}

console.log('\n── ⑦-2📥 ドラッグでPDFを入れられる（ゆうた指定 v1.184.0） ──');
{
  const r = await p.evaluate(() => {
    window._insp.q = { from:'2026-08-01', to:'2026-08-07', res:null, pdf:null, tab:'lump',
                       busy:'', err:'', list:[], listBusy:false, saved:null, savedId:'', savedTab:'期間の外', ym:'', savedAt:'' };
    renderInspect();
    const body = document.getElementById('inspect-body');
    const zone = document.getElementById('q-drop');
    const out = { zone: !!zone,
      over: (zone && zone.getAttribute('ondragover')) || '',
      drop: (zone && zone.getAttribute('ondrop')) || '',
      say: /ドラッグ/.test(body.textContent || ''),
      file: !!body.querySelector('.q-file input[type=file]') };
    /* 光る／消える */
    pitQDrag({ preventDefault(){} }, 1); out.lit = zone.classList.contains('over');
    pitQDrag({ preventDefault(){} }, 0); out.off = !zone.classList.contains('over');
    /* PDF でないものを落とした時＝黙らずに言う */
    pitQDrop({ preventDefault(){}, dataTransfer: { files: [ { name:'めも.txt', type:'text/plain' } ] } });
    out.ngErr = window._insp.q.err;
    return out;
  });
  ok('🔴 落とす枠がある', r.zone === true, r);
  ok('🔴 ドラッグを受け取る配線がある', /pitQDrag/.test(r.over) && /pitQDrop/.test(r.drop), r);
  ok('🔴 押して選ぶ道も残っている（ドラッグが苦手な人のため）', r.file === true, r);
  ok('画面に「ドラッグしても入る」と書いてある', r.say === true, r);
  ok('持ってきている間は枠が光る', r.lit === true && r.off === true, r);
  ok('🔴 PDF でないものを落としたら、黙らずにそう言う',
     /PDF ではありません/.test(r.ngErr || ''), r.ngErr);
}

console.log('\n── ⑦-3🗄 突き合わせた結果が残る（ゆうた指定 v1.184.0） ──');
{
  /* 🔴 本物の Firestore は触れないので、**書き込み口だけ差し替えて**中身を見る。
     ⚠ 差し替えるのは `fb.company()` の1つだけ＝本物の道をそのまま通す。 */
  const r = await p.evaluate(([soft, pit]) => {
    const wrote = {};
    const keepFb = window.fb, keepCloud = window.PIT_CLOUD;
    window.PIT_CLOUD = true;
    window.fb = { company: () => ({
      collection: () => ({
        doc: (id) => ({
          set: (v) => { wrote[id] = v; return Promise.resolve(); },
          get: () => Promise.resolve({ exists: !!wrote[id], data: () => wrote[id] })
        })
      })
    }) };
    const res = pitQMatch(soft.伝票, pit.明細, { from:'2026-08-01', to:'2026-08-07' });
    return pitQSaveRun(res, { pdf: 'テスト.pdf' }).then(d => {
      const id = pitQRunId('2026-08-01', '2026-08-07');
      const body = wrote[id] || null;
      const list = (wrote['qruns'] || {}).一覧 || [];
      /* もう一度＝上書き（積み上がらない） */
      return pitQSaveRun(res, { pdf: 'テスト2.pdf' }).then(() => {
        const list2 = (wrote['qruns'] || {}).一覧 || [];
        /* 検算が合っていない結果は残さない */
        const bad = JSON.parse(JSON.stringify({ 期間:res.期間, 検算:{ 合う:false } }));
        return pitQSaveRun(bad, {}).then(() => 'saved', () => 'refused').then(refused => {
          const plan = pitQMonthPlan('2026-08', list2);
          window.fb = keepFb; window.PIT_CLOUD = keepCloud;
          return {
            id, d, keys: Object.keys(wrote).sort(),
            body, listN: list.length, list2N: list2.length,
            pdf2: (list2[0] || {}).pdf, refused,
            planN: plan.length, planQ1: plan[0], planQ2: plan[1]
          };
        });
      });
    });
  }, [SOFT, PIT]);

  ok('🔴 名前は期間そのもの（qrun-開始_終了）', r.id === 'qrun-2026-08-01_2026-08-07', r.id);
  ok('🔴 置き場所は pitSettings の中（新しい入れ物を作っていない＝ルール無改修）',
     r.keys.join() === 'qrun-2026-08-01_2026-08-07,qruns', r.keys);
  ok('🔴 合計・差・内訳・検算が残る',
     r.body && r.body.差.金額 === 3237935 && r.body.検算.合う === true
     && r.body.内訳.期間の外.台数 === 10, r.body && r.body.差);
  ok('🔴 まとめて返車済みにした日も残る',
     r.body && r.body.まとめ返車.length === 1 && r.body.まとめ返車[0].台数 === 10, r.body && r.body.まとめ返車);
  ok('🔴 残すのは「これから直すもの」だけ（合っていた行は残さない）',
     r.body && r.body.直すもの && r.body.直すもの.整備ソフトだけ.length === 12
     && r.body.直すもの.期間の外.length === 10 && !('結びついた' in r.body), Object.keys((r.body||{}).直すもの||{}));
  ok('いつ・誰が・どのPDFで走らせたかが残る',
     r.body && !!r.body.走らせた日時 && ('走らせた人' in r.body) && r.body.PDF === 'テスト.pdf', r.body && r.body.PDF);
  ok('🔴🔴 同じ期間をもう一度やっても積み上がらない（上書き）',
     r.listN === 1 && r.list2N === 1 && r.pdf2 === 'テスト2.pdf', { a:r.listN, b:r.list2N, pdf:r.pdf2 });
  ok('🔴🔴 検算が合っていない結果は残さない', r.refused === 'refused', r.refused);
  ok('🔴 月の Q1〜Q4 が並ぶ', r.planN === 4, r.planN);
  ok('🔴 Q1 は 1〜7日／Q2 は 8〜15日（区切りは売上の物差しを借りている）',
     r.planQ1 && r.planQ1.from === '2026-08-01' && r.planQ1.to === '2026-08-07'
     && r.planQ2 && r.planQ2.from === '2026-08-08' && r.planQ2.to === '2026-08-15', [r.planQ1, r.planQ2]);
  ok('🔴 済んだQには結果が付いてくる（済み／まだが分かる）',
     r.planQ1 && r.planQ1.run && r.planQ1.run.差金額 === 3237935 && r.planQ2 && r.planQ2.run === null, r.planQ1 && r.planQ1.run);
}

console.log('\n── ⑦-4 一番右のマスが半行ズレない（ゆうた報告 v1.184.0） ──');
{
  const r = await p.evaluate(([soft, pit]) => {
    window._insp.q = { from:'2026-08-01', to:'2026-08-07',
      res: pitQMatch(soft.伝票, pit.明細, { from:'2026-08-01', to:'2026-08-07' }),
      pdf:'x.pdf', tab:'lump', busy:'', err:'', list:[], listBusy:false,
      saved:null, savedId:'', savedTab:'期間の外', ym:'', savedAt:'12:00' };
    renderInspect();
    const tr = document.querySelector('#inspect-body .q-t tbody tr');
    const tds = Array.prototype.slice.call(tr.querySelectorAll('td'));
    const last = tds[tds.length - 1];
    const first = tds[0];
    return {
      disp: getComputedStyle(last).display,
      /* 同じ行のマスなら、上の位置がそろう */
      dy: Math.abs(last.getBoundingClientRect().top - first.getBoundingClientRect().top),
      cls: last.className,
      blockTd: Array.prototype.some.call(document.querySelectorAll('#inspect-body .q-t td'),
                                         e => getComputedStyle(e).display !== 'table-cell')
    };
  }, [SOFT, PIT]);
  ok('🔴🔴 一番右のマスが表のマスのまま（block になっていない）', r.disp === 'table-cell', r);
  ok('🔴 同じ行のマスと、上の位置がそろっている（半行ズレない）', r.dy < 1.5, r);
  ok('🔴 表のマスに block を付けている所が1つも無い', r.blockTd === false, r);
  ok('小さい字にするクラスは別に立てた（q-how）', /q-how/.test(r.cls), r.cls);
}

console.log('\n── ⑧🤖 AIチェック（鍵は画面に置かない・管理だけ） ──');
{
  const r = await p.evaluate(() => {
    const before = window.PIT_CLOUD;
    window.PIT_CLOUD = true;
    window.__adm = false;
    window.pitCanEditFinal = function(){ return !!window.__adm; };
    window._insp.ai = { busy:'', err:'', out:'', at:'', usage:null };
    let h1 = pitAiHtml();
    window.__adm = true;
    let h2 = pitAiHtml();
    window.PIT_CLOUD = before;
    return { noAdmin: /管理/.test(h1) && !/AIチェックを走らせる<\/button>/.test(h1),
             admin: /AIチェックを走らせる/.test(h2),
             cost: /お金がかかります|数円/.test(h2),
             mat: /AI に渡すもの/.test(h2) && /母数/.test(h2) && /前回のぶん/.test(h2),
             noTel: !/電話番号・住所は送りません/.test(h2) === false };
  });
  ok('🔴 管理でない人にはボタンを出さない', r.noAdmin === true, r);
  ok('🔴 管理の人にはボタンが出る', r.admin === true, r);
  ok('🔴 お金がかかることを画面に書いてある', r.cost === true, r);
  ok('🔴🔴 「足りない3つ」（母数・車の中身・前回）を渡すと画面に出す', r.mat === true, r);
  ok('🔴 電話番号・住所は送らないと書いてある', r.noTel === true, r);
}

console.log('\n── ⑨🧭 ソースの見張り ──');
{
  const qm = fs.readFileSync('js/quarter-match.js', 'utf8');
  const qv = fs.readFileSync('js/quarter.js', 'utf8');
  const qp = fs.readFileSync('js/quarter-pdf.js', 'utf8');
  const ai = fs.readFileSync('js/ai-check.js', 'utf8');
  const fn = fs.readFileSync('functions/index.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  const live = (t) => t.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  ok('🔴🔴 画面が突き合わせの判定を書き写していない',
     !/±1|Math\.abs\([^)]*金額[^)]*\)\s*<=\s*1|dd<=7/.test(live(qv)), '');
  ok('🔴 クォーターの区切りは sales.js の1本を借りている（書き写していない）',
     /pitQuarterOf/.test(qm) && !/<=\s*7\s*\?\s*0/.test(qm), '');
  ok('🔴 金額の直し方は「伝票計 − 消費税 − 非課税」（消費税×10 をしていない）',
     /伝票計\s*-\s*cur\.消費税\s*-\s*cur\.非課税/.test(qp) && !/\*\s*10\b/.test(live(qp)), '');
  ok('🔴🔴 PDFを読む道具は、ネットから取りに行かず**アプリと一緒に配る**',
     /js\/vendor\/pdf\.min\.mjs/.test(qp) && !/https?:\/\/(cdnjs|unpkg|cdn\.jsdelivr)/.test(qp), '');
  ok('🔴 その道具が本当に置いてある', fs.existsSync('js/vendor/pdf.min.mjs') && fs.existsSync('js/vendor/pdf.worker.min.mjs'), '');
  ok('🔴 道具は**PDFを選んだ時に初めて**読み込む（ふだんの画面を重くしない）',
     !/vendor\/pdf/.test(fs.readFileSync('index.html', 'utf8')), '');
  ok('🔴🔴 紙に見えているとおりの位置で行に直している（この帳票は横向き）',
     /Util\.transform\(vp\.transform/.test(qp), '');
  ok('🔴 どこからどこまでが顧客名かは「列の位置」で決めている（字面で割らない）',
     /function colsOf/.test(qp) && /受付担当者/.test(qp), '');
  ok('🔴 集める窓は期間より広い（既定14日）', /opt\.pad\s*==\s*null\s*\?\s*14/.test(qm), '');
  ok('🔴 検算を必ず返す（合う／実際の差／内訳の合計／ずれ）',
     /検算:\s*\{\s*合う/.test(qm), '');
  ok('🔴🔴 鍵（APIキー）を画面のどこにも書いていない',
     !/sk-ant|ANTHROPIC_API_KEY/.test(ai) && !/sk-ant/.test(html), '');
  ok('🔴 鍵はサーバーの金庫から出す（Secret）', /defineSecret\("ANTHROPIC_API_KEY"\)/.test(fn), '');
  ok('🔴🔴 サーバー側でも「管理だけ」を止めている（ボタンを消すだけにしない）',
     /設定権限（管理）のある人だけです/.test(fn) && /permission-denied/.test(fn), '');
  ok('🔴 サーバー側でも送る量に上限をかけている', /400000/.test(fn), '');
  ok('🔴 AIに聞く窓口を読み込んでいる', /firebase-functions-compat/.test(html), '');
  ok('🔴 断りにエラー番号が付いている（PF-0023）', /PF-0023/.test(ai), '');
  ok('🔴 その番号が台帳にある', /PF-0023/.test(fs.readFileSync('js/errcode-pit.js', 'utf8')), '');
  ok('🔴 見張り用の本物データは本番に配られない（資料/ は ignore）',
     /"資料\/\*\*"/.test(fs.readFileSync('firebase.json', 'utf8')), '');
  ok('🔴 サーバーの中身も本番に配られない（functions/ は ignore）',
     /"functions\/\*\*"/.test(fs.readFileSync('firebase.json', 'utf8')), '');
}

ok('🔴 画面がつまずいていない（赤いエラーが1つも出ていない）', errs.length === 0, errs.slice(0, 3));
{
  const html = fs.readFileSync('index.html', 'utf8');
  const meta = (html.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  const login = (html.match(/class="login-ver">v([\d.]+)</) || [])[1] || '';
  const ver = (html.match(/class="ver">v([\d.]+)</) || [])[1] || '';
  ok('🔴 版が3か所そろっている', !!meta && meta === login && meta === ver, { meta, login, ver });
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
