/* PitFlow v2.2.0 ── ✍ 突き合わせが終わったら、車体番号と伝票を書き込む
   ===================================================================
   ◎ここで見張ること（2026-08-24 ゆうた指定）
     🔴🔴 **残りが0になるまで書けない。** ズレたまま書くと、まちがった車に
        まちがった履歴がぶら下がる。ボタンそのものを出さない。
     🔴🔴 **1つの予約に、1つの伝票。訂正されたら古いほうは消して置きかえる。**
        🗣「訂正した場合は古いのは消して、あくまで1予約番号と1伝票番号がくっつくイメージで」
     🔴 **車体番号は上書きしない。** すでに別の番号が入っていたら書かずに知らせる。
     🔴 **法定費用（自賠責・重量税・印紙代）は非課税で売上ではない。** 粗利にも入れない。
     🔴 **明細が伝票の額とぴったり合ったものだけ**持たせる。
     🚗 **同じ車かは車体番号1本**（無ければ車種）。車種の呼び方のちがいは見ない。
     📅 **日付の答えは売上日どうし**。実績日は事実として出すだけ。

   ◎使い方
     python3 -m http.server 8981      ← 別ウィンドウ
     node test_quarter_write.mjs                                        */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8981;
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
await p.waitForFunction('window.state && window.pitQMatch && window.pitQWritePanel && window.pitVehSetVin',
                        null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

/* ===================================================================
   下ごしらえ＝**自分で作った少数のカードだけ**にして数を読めるようにする。
   ⚠ 日付は材料の中のもの（過ぎた日）を使う。今日からの相対では書けない。
   =================================================================== */
async function seed(){
  return await p.evaluate(() => {
    window.__admin = true;
    window.pitCanEditFinal = function(){ return !!window.__admin; };
    window.PIT_CLOUD = false;
    window._pitQMarks = [];
    state.staff = [{ id:'s1', name:'小林 和枝', front:true }];
    /* お客様と車（車体番号はまだ空） */
    state.customers = [{
      id:'cu1', name:'あ 一郎', kana:'ア イチロウ', contacts:[],
      vehicles:[{ id:'v1', plate:'船橋 300 あ 1111', maker:'スバル', car:'インプレッサ', karteNo:'K-1' }],
      updatedAt: Date.now()
    }];
    state.cards = [
      { id:'W1', resNo:'R-W1', status:'returned', plate:'船橋 300 あ 1111', customer:'あ 一郎',
        completedAt:'2026-08-04', returnDate:'2026-08-04', returnDateFinal:'2026-08-04',
        salesDate:'2026-08-04', amountFinal:100000, frontStaff:'小林 和枝',
        maker:'スバル', car:'インプレッサ', log:[] }
    ];
    return true;
  });
}
/* 伝票1枚ぶんの材料（PDF から読んだ形と同じ） */
const SOFT_OK = [{
  売上日:'2026-08-04', 伝票:'0001', ナンバー:'船橋 300 あ 1111', 顧客名:'あ 一郎',
  車種:'インプレッサ', 車台:'GH2-026746', 金額:100000, 受付担当:'小林 和枝',
  明細が合う:true, 原価:40000, 消費税:10000, 伝票計:110000, 法定:[],
  明細:[{ 種:'見出し', 名:'【一般整備】', 区分:'一般' },
        { 種:'作業', 名:'エンジン・オイル交換', 区分:'交換', 数量:1, 単価:0, 金額:60000, 原価:0 },
        { 種:'部品', 名:'エンジンオイル', 区分:'部品', 数量:4, 単価:10000, 金額:40000, 原価:40000 }]
}];

console.log('\n── ① 残りが0になるまで書けない ──');
await seed();
{
  const r = await p.evaluate((soft) => {
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    /* わざと1件ズラす＝残りが0でない状態 */
    const bad = JSON.parse(JSON.stringify(soft)); bad[0].金額 = 111111;
    const R1 = pitQMatch(bad, pit, { from:'2026-08-01', to:'2026-08-07' });
    const R2 = pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
    return { 残り1: pitQNokori(R1), 帯1: pitQWritePanel(R1, {}),
             残り2: pitQNokori(R2), 帯2: pitQWritePanel(R2, {}) };
  }, SOFT_OK);
  ok('🔴🔴 ズレが残っている間は、書き込みの帯そのものを出さない',
     r.残り1 > 0 && r.帯1 === '', { n: r.残り1, h: r.帯1.slice(0, 40) });
  ok('🔴 残りが0になったら「書き込む」が出る',
     r.残り2 === 0 && /書き込む/.test(r.帯2), { n: r.残り2, h: r.帯2.slice(0, 60) });
  ok('🔴 何件書くかを、押す前に言う（車体番号1件／伝票1件）',
     /車体番号 1件/.test(r.帯2) && /伝票 1件/.test(r.帯2), r.帯2.slice(0, 120));
}

console.log('\n── ② 書き込む（車体番号＋伝票） ──');
{
  const r = await p.evaluate((soft) => {
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    const R = pitQMatch(soft, pit, { from:'2026-08-01', to:'2026-08-07' });
    window._insp = window._insp || {}; window._insp.q = { res: R };
    window.pitAsk = function(){ return Promise.resolve(true); };   /* 聞かれたら「はい」 */
    return new Promise(res => {
      pitQWriteGo();
      setTimeout(() => {
        const v = state.customers[0].vehicles[0];
        res({ vin: v.vin, 伝票数: (v.伝票 || []).length, 伝票: (v.伝票 || [])[0] || null,
              書いた: window._insp.q.書き込んだ || '' });
      }, 200);
    });
  }, SOFT_OK);
  ok('🚗 車の情報に車体番号が入った', r.vin === 'GH2-026746', r.vin);
  ok('🧾 来店履歴に伝票が1枚ぶら下がった', r.伝票数 === 1, r.伝票数);
  ok('🔴 1つの予約に1つの伝票（予約番号で結んでいる）',
     r.伝票 && r.伝票.予約番号 === 'R-W1' && r.伝票.伝票番号 === '0001', r.伝票);
  ok('🧾 伝票の中身（見出し・作業・部品）がそのまま入っている',
     r.伝票 && r.伝票.明細.length === 3 && r.伝票.明細[0].種 === '見出し', r.伝票 && r.伝票.明細);
  ok('💰 原価もそのまま入る（うちは原価をオープンにしている）',
     r.伝票 && r.伝票.原価 === 40000, r.伝票 && r.伝票.原価);
  ok('🔴 何件書いたかを、あとで言う', /車体番号 1件/.test(r.書いた) && /伝票 1件/.test(r.書いた), r.書いた);
}

console.log('\n── ③ 訂正されたら、古いほうは消して置きかえる ──');
{
  const r = await p.evaluate((soft) => {
    const fixed = JSON.parse(JSON.stringify(soft));
    fixed[0].金額 = 120000;                       /* 訂正伝票（金額が変わった） */
    fixed[0].明細[2].金額 = 60000; fixed[0].明細[2].原価 = 40000;
    /* カード側も直った、として突き合わせる */
    state.cards[0].amountFinal = 120000;
    const pit = pitQCollect({ from:'2026-08-01', to:'2026-08-07' }).明細;
    const R = pitQMatch(fixed, pit, { from:'2026-08-01', to:'2026-08-07' });
    window._insp.q = { res: R };
    return new Promise(res => {
      pitQWriteGo();
      setTimeout(() => {
        const v = state.customers[0].vehicles[0];
        res({ 数: (v.伝票 || []).length, 金額: (v.伝票 || [])[0] && v.伝票[0].金額 });
      }, 200);
    });
  }, SOFT_OK);
  ok('🔴🔴 伝票は増えない（1予約に1伝票）', r.数 === 1, r.数);
  ok('🔴🔴 中身は新しいほうに置きかわる（古いのは消える）', r.金額 === 120000, r.金額);
}

console.log('\n── ④ 車体番号は上書きしない ──');
{
  const r = await p.evaluate(() => {
    const v = state.customers[0].vehicles[0];
    const a = pitVehSetVin('船橋 300 あ 1111', 'GH2-026746');   /* 同じ番号 */
    const b2 = pitVehSetVin('船橋 300 あ 1111', 'ZZZ-999');      /* 別の番号 */
    const after = v.vin;
    const c = pitVehSetVin('無い 300 か 9999', 'AAA-111');       /* 車がいない */
    return { a, b: b2, after, c };
  });
  ok('🚗 同じ番号なら、そのまま（何もしない）', r.a === 'そのまま', r.a);
  ok('🔴🔴 別の番号が入っていたら**書かずに**「ちがう」と返す', r.b === 'ちがう', r.b);
  ok('🔴 実際に上書きされていない', r.after === 'GH2-026746', r.after);
  ok('🚗 その車がいない時も、黙らずに言う', r.c === '車がない', r.c);
}

console.log('\n── ⑤ 法定費用は売上でも粗利でもない ──');
{
  const r = await p.evaluate(() => {
    const m = { 金額:53235, 原価:3548, 消費税:5323, 伝票計:112608,
                法定:[{名:'自賠責保険',金額:17650},{名:'重量税',金額:34200},{名:'印紙代',金額:2200}],
                明細:[{種:'見出し',名:'【車検整備】',区分:'車検点検'},
                      {種:'作業',名:'法令に基づく車検基本料金',区分:'点検',数量:0,単価:0,金額:53235,原価:3548}] };
    const h = pitQDenTable(m);
    return { hou: /法定費用（非課税）/.test(h), no: /売上にも粗利にも入りません/.test(h),
             sum: /53,235/.test(h) && /49,687/.test(h),
             bill: /112,608/.test(h),
             head: /【車検整備】/.test(h) };
  });
  ok('🧾 法定費用は別の欄に出る', r.hou === true, r);
  ok('🔴🔴 「売上にも粗利にも入りません」と書いてある', r.no === true, r);
  ok('💰 粗利は売上−原価（法定費用は入っていない）', r.sum === true, r);
  ok('🧾 お客様の請求額（税・法定費用こみ）も分かる', r.bill === true, r);
  ok('🧾 【一般整備】のような見出しの行も出る', r.head === true, r);
}

console.log('\n── ⑥🚗 同じ車かは車体番号1本（無ければ車種） ──');
{
  const r = await p.evaluate(() => {
    const mk = (sv, pv, sc, pc) => ({ soft:{ 車体番号:sv, 車種:sc }, pit:{ 車体番号:pv, 車種:pc } });
    return {
      vinOK: pitQSameCar(mk('ABC-1', 'ABC-1', 'ＷＲＸ', 'スバル インプレッサ')),
      vinNG: pitQSameCar(mk('ABC-1', 'XYZ-9', 'ミニ', 'ミニ')),
      carOK: pitQSameCar(mk('', '', 'ＷＲＸ', 'スバル インプレッサＷＲＸ')),
      carNG: pitQSameCar(mk('', '', 'ミニ', 'スバル インプレッサ')),
      none:  pitQSameCar(mk('', '', '', 'ミニ'))
    };
  });
  ok('🔴🔴 車体番号がそろっていれば、車種がちがっても「同じ車」', r.vinOK === 'vinOK', r);
  ok('🔴🔴 車体番号がちがえば「別の車かも」', r.vinNG === 'vinNG', r);
  ok('🚗 番号が無い時は車種で見る（片方が短いだけなら同じ）', r.carOK === 'ok', r);
  ok('🚗 車種がまるでちがえば「別の車かも」', r.carNG === 'carNG', r);
  ok('⚠ 片方が空なら、何も言わない（無いものを間違い扱いしない）', r.none === 'ok', r);
}

console.log('\n── ⑦📅 日付の答えは売上日どうし ──');
{
  const r = await p.evaluate(() => {
    const mk = (sd, pd) => ({ soft:{ 売上日:sd }, pit:{ 売上日:pd } });
    return {
      same:  pitQSalesGap(mk('2026-08-04', '2026-08-04')),
      none:  pitQSalesGap(mk('2026-08-04', '')),
      diff:  pitQSalesGap(mk('2026-08-04', '2026-08-06')),
      month: pitQSalesGap(mk('2026-08-01', '2026-07-31'))
    };
  });
  ok('📅 売上日がそろっていれば OK', r.same.kind === 'same', r.same);
  ok('📅 PitFlow に売上日が無ければ、そう言う（隠さない）',
     r.none.kind === 'none' && /入っていません/.test(r.none.label), r.none);
  ok('📅 ちがえば、何日ちがうかを言う', r.diff.kind === 'diff' && /2日/.test(r.diff.label), r.diff);
  ok('📅 月をまたいだら、そう言う', r.month.kind === 'crossMonth', r.month);
}

console.log('\n── ⑧🗂 1件は1か所にしか出ない（4つを足すと全部になる） ──');
{
  const r = await p.evaluate(() => {
    const mk = (o) => Object.assign({
      soft:{ 金額:100, 車体番号:'A', 車種:'ミニ', 売上日:'2026-08-04' },
      pit:{ 確定金額:100, 車体番号:'A', 車種:'ミニ', 売上日:'2026-08-04' },
      期間の外:false, 担当一致:true
    }, o);
    return {
      ok:    pitQGroupOf(mk({})),
      money: pitQGroupOf(mk({ pit:{ 確定金額:90, 車体番号:'A', 車種:'ミニ', 売上日:'2026-08-04' } })),
      date1: pitQGroupOf(mk({ 期間の外:true })),
      date2: pitQGroupOf(mk({ pit:{ 確定金額:100, 車体番号:'A', 車種:'ミニ', 売上日:'' } })),
      data1: pitQGroupOf(mk({ pit:{ 確定金額:100, 車体番号:'B', 車種:'ミニ', 売上日:'2026-08-04' } })),
      data2: pitQGroupOf(mk({ 担当一致:false }))
    };
  });
  ok('🗂 何も無ければ OK', r.ok === 'ok', r);
  ok('🗂 1円でもちがえば「金額がちがう」', r.money === 'money', r);
  ok('🗂 返車日が期間の外なら「日付がちがう」（お金は動くが、原因は日付）', r.date1 === 'date', r);
  ok('🗂 売上日が入っていなければ「日付がちがう」', r.date2 === 'date', r);
  ok('🗂 車体番号がちがえば「データがちがう」（いちばん重い）', r.data1 === 'data', r);
  ok('🗂 担当だけちがう車は「データがちがう」（お金が動かないので最後）', r.data2 === 'data', r);
}

console.log('\n── ⑨🧭 ソースの見張り ──');
{
  const qw = fs.readFileSync('js/quarter-write.js', 'utf8');
  const qm = fs.readFileSync('js/quarter-match.js', 'utf8');
  const qj = fs.readFileSync('js/quarter.js', 'utf8');
  const cu = fs.readFileSync('js/customers.js', 'utf8');
  const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('🔴🔴 画面（quarter.js）が「同じ車か」を綴り直していない',
     !/車体番号\s*===\s*|同一性\s*=\s*\(/.test(strip(qj).replace(/p\.同一性/g, '')), '');
  ok('🔴 同じ車かの物差しは quarter-match.js の1本', /w\.pitQSameCar\s*=\s*sameCar/.test(qm), '');
  ok('🔴 売上日どうしの物差しも1本', /w\.pitQSalesGap\s*=\s*salesGap/.test(qm), '');
  ok('🔴 4つのグループ分けも1本', /w\.pitQGroupOf\s*=\s*groupOf/.test(qm), '');
  ok('🔴🔴 車体番号の出し入れは customers.js の入口だけ',
     /window\.pitVehSetVin/.test(cu) && !/\.vin\s*=/.test(strip(qw)), '');
  ok('🔴🔴 車体番号は上書きしない（すでに入っていたら「ちがう」を返す）',
     /if\s*\(\s*now\s*\)\s*return\s*'ちがう'\s*;/.test(strip(cu)), '');
  ok('🔴🔴 1予約に1伝票（同じ予約番号のものを消してから入れる）',
     /filter\(function \(x\) \{ return x && t\(x\.予約番号\) !== res; \}\)/.test(qw), '');
  ok('🔴 残りが0でなければ書かない（直に呼んでも止まる）',
     /pitQNokori\(R\) > 0/.test(qw) && /まだ書けません/.test(qw), '');
  ok('🔴 明細が合ったものだけ持たせる', /明細が合う/.test(qw) && /明細が合う/.test(fs.readFileSync('js/quarter-pdf.js', 'utf8')), '');
  ok('🔴 明細が合わなければ、いくらズレたかを残す（黙って捨てない）',
     /明細合計/.test(fs.readFileSync('js/quarter-pdf.js', 'utf8')), '');
  ok('🧾 伝票の表は1本（顧客詳細からも同じものを呼ぶ）',
     /w\.pitQDenTable\s*=\s*denTable/.test(qw) && /pitQDenTable\(den\)/.test(cu), '');
}

ok('🔴 画面がつまずいていない（赤いエラーが1つも出ていない）', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log('\n🎉 ' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
