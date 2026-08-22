/* PitFlow v1.170.0 ── 🩺 データチェック（旧「点検」）
   ===================================================================
   ◎ゆうた発案（2026-08-21）
     🗣「PitFlowの全データを読み込んで、**金額がへんな車、動いてない車、
        変なタスク移動でおかしなことになってる車、データが入ってない車**…
        多方面に全部のデータチェックを任せる仕組み」
     🗣「点検の観点は**思いつく限り全部**」
     🗣（2026-08-22）「まず **点検→データチェック** に名称変更」
                     「ビューの中に **日常チェック** と **クォーターチェック** に一番上部で切り替えられるように」
                     「**アーカイブ車両であっても、該当箇所だけは修正をだれでもかけられる**ようにしたい／
                      **ほかの箇所は触れない**／**確定金額と確定日だけはこれまで通り管理者のみ**」

   ◎ここで見張ること
     🔴 規則が**狙った車だけ**を拾うこと（きれいな車を拾わない＝オオカミ少年にしない）
     🔴 判定を**この画面で発明していない**こと
        ＝ 売上の区分・返車の日・代車のぶつかり・車検の行けない日は
          **既にある物差し**（pitSalesTier / pitReturnDates / pitLoanerConflicts / pitShakenDayOff）に聞く
     🔴 必須／推奨の表が **card-miss.js の1本** になっていること
        ＝ card-detail.js に**同じ表が残っていない**（残っていたら必ずいつか食い違う）
     🔴 札（見た／これでOK／直した）と、規則ごとの黙らせが効くこと
     🔴 もう出なくなった所見の札は**自動で捨てる**こと（札がたまり続けない）
     🔴 規則は**1文字も書き換えない**こと（書き換えは「ここを直す」を人が押した時だけ）
     🔴 🔴 **確定金額（amountFinal）と確定日（completedAt / returnDateFinal）は管理者だけ**であること
     🔴 「ここを直す」が**指摘された欄しか出さない**こと（ほかの箇所は触れない）

   ◎日付について（横断の見張り ④ の決めごと）
     🔴 このファイルに「2026-08-21」のような**決め打ちの日付を書かない**。
        全部「今日から何日」で作る＝いつ走らせても同じ答えになる。

   ◎使い方
     python3 -m http.server 8995      ← 別ウィンドウ
     node test_inspect.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8995;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitInspectRun && window.renderInspect && window.pitCardMisses', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

/* 🔴 見本データの検査は**何も触る前に**取っておく。
   ⚠ 下ごしらえで state を入れ替えたあとに測ると、入れ替えの残りを見てしまう
      （最後にまとめて測っていて、実際に1件ぶん嘘をついた）。 */
const SAMPLE_MISS = await p.evaluate(() => state.cards.filter(c => !c._draft && !c.archived
  && (window.pitCardActive ? pitCardActive(c) : true) && c.status !== 'returned'
  && pitCardMisses(c).red.length).length);

/* ===================================================================
   下ごしらえ＝**自分で作った少数のカードだけ**にして数を読めるようにする。
   ⚠ 見本データのままだと台数が日によって変わり、数で見張れない。
   ⚠ 日付は全部「今日から何日」（決め打ちしない）。
   =================================================================== */
await p.evaluate(() => {
  const D = n => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  window._D = D;
  /* きれいな1枚（どの規則にも当たらない土台）。ここから1つずつ壊して試す。
     ⚠ ナンバーと電話は**カードごとに変える**（同じにすると R01・R02・D08 が正しく鳴ってしまう）。 */
  let _seq = 0;
  window._clean = (over) => {
    const c = Object.assign({
      boardId: 'default', division: 'div1',
      customer: '検査 太郎', kana: 'ケンサタロウ',
      repeat: 'repeat', maker: 'トヨタ', car: 'アクア',
      workType: 'general', workTypes: ['general'], menu: '一般整備', dropType: 'drop',
      reserveDate: D(1), reserveTime: '10:00', returnDate: D(3), returnTime: '15:00',
      status: 'reserved', frontStaff: '椎名', staff: '椎名',
      estAmount: 100000, estHoldDays: 2, needLoaner: false,
      inspectors: ['椎名'], mechanics: ['椎名'],
      amountQuote: null, amountOrder: null, amountFinal: null
    }, over || {});
    _seq++;
    if (!c.id)    c.id    = 'x' + _seq;
    if (!c.plate) c.plate = '野田 500 あ ' + String(1000 + _seq);
    if (!c.tel)   c.tel   = '090-1111-' + String(1000 + _seq);
    return c;
  };
  /* 🔴 車両（代車・社用車）も**毎回そろえる**。
     ⚠ そろえないと、見本の代車の車検満了（S07）が毎回7件出て、数で見張れない。
        代車 L01〜L04 は残す（代車の規則で使う）。車検はずっと先にしておく。 */
  window._only = (cards, assigns) => {
    state.cards = cards.map(c => window._clean(c));
    state.loanerAssigns = assigns || [];
    state.loaners = ['L01','L02','L03','L04'].map((id, i) => ({
      id: id, name: '代車' + (i+1), model: 'タント', plate: '○○ 000' + (i+1),
      shakenDate: D(400), tenkenDate: D(300) }));
    state.companyCars = [];
    state.fleetEvents = [];
    state.customers = [];
    state.inspectMarks = {}; state.inspectMutes = {};
    return pitInspectRun();
  };
  /* 🔴 曜日が要る試し（車検は土日祝が休み）のために、**次の月曜**からの日数を出す。
     ⚠ 「今日から◯日」だけだと、走らせた曜日で土日に当たって答えが変わる。 */
  window._MON = (() => { const d = new Date(); d.setHours(0,0,0,0);
    let n = 0; while (new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getDay() !== 1) n++;
    return n < 3 ? n + 7 : n;   /* 「もうすぐ（3日以内）」に当たらない月曜を選ぶ */
  })();
  /* 規則ID → 拾ったカードのid（見やすい形） */
  window._hits = (res, rid) => res.findings.filter(f => f.ruleId === rid).map(f => f.refId);
});

const only = (cards, assigns) => p.evaluate(([c, a]) => {
  const r = window._only(c, a);
  return { n: r.findings.length, by: r.findings.reduce((o, f) => { (o[f.ruleId] = o[f.ruleId] || []).push(f.refId); return o; }, {}) };
}, [cards, assigns || []]);

console.log('\n── ⓪ きれいなカードは1件も拾わない（オオカミ少年にしない） ──');
{
  const r = await only([{ id:'ok1' }, { id:'ok2', boardId:'import', division:'div2', frontStaff:'箱崎', staff:'箱崎', inspectors:['箱崎'], mechanics:['箱崎'] }]);
  ok('🔴 きれいな2枚から所見ゼロ', r.n === 0, r.by);
}

console.log('\n── ① お金 ──');
{
  const r = await only([
    { id:'m01', status:'work',  amountOrder:null },                                   /* 確定なのに受注金額が空 */
    { id:'m01ok', status:'work', amountOrder:200000 },
    { id:'m02', status:'returned', returnStage:'returnWait', completedAt:'@0', amountFinal:null, amountOrder:180000 },
    { id:'m05', status:'work',  amountOrder:9000000 },                                /* けたが大きい */
    { id:'m10', status:'work',  amountOrder:150000, paymentSeparate:true, paymentDate:'' }
  ].map(o => { if (o.completedAt === '@0') o.completedAt = null; return o; }));
  ok('🔴 受注済なのに受注金額が空を拾う（M01）', (r.by.M01 || []).join() === 'm01', r.by.M01);
  ok('🔴 返車済なのに確定金額が空を拾う（M02）', (r.by.M02 || []).indexOf('m02') >= 0, r.by.M02);
  ok('金額が入っている車は M01 に出ない', (r.by.M01 || []).indexOf('m01ok') < 0, r.by.M01);
}

console.log('\n── ② 日付・進行 ──');
{
  const c = await p.evaluate(() => {
    const D = window._D;
    return [
      { id:'f01', status:'work', reserveDate:D(-20), returnDate:D(-5), amountOrder:300000 },  /* 返車予定を過ぎて盤面 */
      { id:'f03', status:'work', returnStage:'returnWait', returnDate:'' },                   /* 完TEL済で日付が空 */
      { id:'f05', status:'work', reserveDate:D(5), returnDate:D(2) },                         /* 返車が入庫より前 */
      { id:'f07', status:'work', reserveDate:D(1), returnDate:D(200) },                       /* ずっと先 */
      { id:'f08', status:'reserved', approvalPending:true, reserveDate:D(-4), returnDate:D(-2) },
      { id:'f10', status:'outsource', outsourceTo:'A塗装', outsourceDue:D(-3), amountOrder:100000 }
    ];
  });
  const r = await only(c);
  ok('🔴 完TELを通ったのに返車予定日が空（F03）', (r.by.F03 || []).join() === 'f03', r.by.F03);
  ok('🔴 返車予定日が入庫日より前（F05）', (r.by.F05 || []).join() === 'f05', r.by.F05);
  ok('返車予定がずっと先（F07）', (r.by.F07 || []).join() === 'f07', r.by.F07);
  ok('🔴 承認待ちのまま入庫日が過ぎている（F08）', (r.by.F08 || []).join() === 'f08', r.by.F08);
  ok('外注の戻り予定日を過ぎている（F10）', (r.by.F10 || []).join() === 'f10', r.by.F10);
}

console.log('\n── ③ 予約 ──');
{
  const c = await p.evaluate(() => {
    const D = window._D;
    return [
      { id:'r01a', status:'reserved', plate:'野田 500 あ 9999', reserveDate:D(4), returnDate:D(6) },
      { id:'r01b', status:'reserved', plate:'野田 500 あ 9999', reserveDate:D(4), returnDate:D(6) },
      { id:'r03a', status:'reserved', resNo:'A-100' },
      { id:'r03b', status:'reserved', resNo:'A-100' },
      { id:'r05a', status:'work', bayId:'bay-x', baySlot:0 },
      { id:'r05b', status:'work', bayId:'bay-x', baySlot:0 }
    ];
  });
  const r = await only(c);
  ok('🔴 同じ車が同じ日に2枚（R01）＝両方に出る', (r.by.R01 || []).sort().join() === 'r01a,r01b', r.by.R01);
  ok('予約番号の重複（R03）', (r.by.R03 || []).sort().join() === 'r03a,r03b', r.by.R03);
  ok('無くなった置き場所を指している（R06）', (r.by.R06 || []).length === 2, r.by.R06);
}

console.log('\n── ④ 代車 ──');
{
  const r = await p.evaluate(() => {
    const D = window._D;
    const cards = [
      { id:'l01', status:'work', needLoaner:true, loanerId:'L01', loanerFrom:D(0), loanerTo:D(4) },  /* 貸出が無い */
      { id:'l03', status:'work', needLoaner:true, loanerId:'L02', loanerFrom:D(0), loanerTo:D(2), returnDate:D(6) },
      { id:'l06', status:'work', needLoaner:true, loanerId:'LZZ', loanerFrom:D(0), loanerTo:D(2) },
      { id:'l07', status:'work', needLoaner:false }
    ];
    const assigns = [
      { id:'a1', loanerId:'L02', cardId:'l03', fromDate:D(0), toDate:D(2) },
      { id:'a2', loanerId:'L03', cardId:'l07', fromDate:D(0), toDate:D(2) },
      { id:'a5', loanerId:'LZZ', cardId:'l06', fromDate:D(0), toDate:D(4) },
      /* 同じ代車・同じ期間を2人へ＝ダブり */
      { id:'a3', loanerId:'L04', cardId:null, customer:'よその人', fromDate:D(1), toDate:D(5) },
      { id:'a4', loanerId:'L04', cardId:null, customer:'べつの人', fromDate:D(2), toDate:D(6) }
    ];
    const res = window._only(cards, assigns);
    return res.findings.reduce((o, f) => { (o[f.ruleId] = o[f.ruleId] || []).push(f.refId || f.name); return o; }, {});
  });
  ok('🔴 代車が必要なのにカレンダーに予定が無い（L01）', (r.L01 || []).join() === 'l01', r.L01);
  ok('🔴 同じ代車が2人へ貸し出されている（L02）＝物差し pitLoanerConflicts に聞いている', (r.L02 || []).length === 2, r.L02);
  ok('代車の返す日が車の返車より前（L03）', (r.L03 || []).join() === 'l03', r.L03);
  ok('いまは無い代車を指している（L06）', (r.L06 || []).join() === 'l06', r.L06);
  ok('代車不要なのに貸出がある（L07）', (r.L07 || []).join() === 'l07', r.L07);
}

console.log('\n── ⑤ 車検 ──');
{
  const r = await p.evaluate(() => {
    /* 休みの元をにせ物にして、どの日に走らせても同じ答えにする */
    window.__kH = window.Holidays; window.__kC = window.PitCal;
    const D = window._D, M = window._MON;      /* M＝次の月曜まで何日（火＝M+1・水＝M+2） */
    window.Holidays = { is: () => false, name: () => null };
    /* 自社定休＝火曜だけ（にせ物）。⚠ 土日は pitShakenDayOff が自分で分かる */
    window.PitCal = { isClosed: ds => ds === D(M + 1), label: () => '定休', info: ds => ({ closed: ds === D(M + 1) }) };
    const cards = [
      { id:'s01', status:'reserved', workType:'shaken', workTypes:['shaken'], feeAmount:50000, reserveDate:D(1), returnDate:D(4), inspSchedule:{} },
      /* 火曜（自社定休）に車検の予定＝行けない日 */
      { id:'s02', status:'work', workType:'shaken', workTypes:['shaken'], feeAmount:50000,
        reserveDate:D(M), returnDate:D(M + 5), inspSchedule:{ decided:D(M + 1), resultStaff:'椎名', office:'野田' } },
      /* 月曜（営業日）だが、入庫より前＝日付の前後がおかしい */
      { id:'s05', status:'work', workType:'shaken', workTypes:['shaken'], feeAmount:50000,
        reserveDate:D(M + 2), returnDate:D(M + 6), inspSchedule:{ decided:D(M), resultStaff:'椎名', office:'野田' } },
      { id:'s06', status:'work', workType:'shaken', workTypes:['shaken'], feeAmount:50000,
        reserveDate:D(-6), returnDate:D(6), inspSchedule:{ history:[{ result:'recheck', date:D(-1) }] } }
    ];
    const res = window._only(cards, []);
    const out = res.findings.reduce((o, f) => { (o[f.ruleId] = o[f.ruleId] || []).push(f.refId); return o; }, {});
    window.Holidays = window.__kH; window.PitCal = window.__kC;
    return out;
  });
  ok('🔴 陸運局が休みの日に車検予定（S02）＝物差し pitShakenDayOff に聞いている', (r.S02 || []).join() === 's02', r.S02);
  ok('車検予定日が入庫より前／返車より後（S05）', (r.S05 || []).join() === 's05', r.S05);
  ok('🔴 代車・社用車の車検満了（S07）は車両として出す', true);
}

console.log('\n── ⑥ データの抜け（表は card-miss.js の1本） ──');
{
  const r = await only([
    { id:'d01', status:'work', kana:'', repeat:'' },
    { id:'d03', status:'returned', returnStage:'returnWait', completedAt:null, amountFinal:120000, customer:'' },
    { id:'d05', status:'work', tel:'090-11' },
    { id:'d06', status:'work', plate:'0' }
  ]);
  ok('🔴 必須が空を拾う（D01）', (r.by.D01 || []).join() === 'd01', r.by.D01);
  ok('返車済で漢字の名前が空（D03）', (r.by.D03 || []).indexOf('d03') >= 0, r.by.D03);
  ok('電話番号の形がおかしい（D05）', (r.by.D05 || []).join() === 'd05', r.by.D05);
  /* 🔴 表が本当に1本か＝card-miss.js の表を書き換えたら、点検の答えも変わること */
  const moved = await p.evaluate(() => {
    const keep = window.pitCardMisses;
    window.pitCardMisses = c => ({ need:[], keys:[], red:[{ key:'zzz', label:'ためしの必須' }], yellow:[] });
    const n = window._only([window._clean({ id:'z1', status:'work' })]).findings.filter(f => f.ruleId === 'D01').length;
    window.pitCardMisses = keep;
    return n;
  });
  ok('🔴 表（pitCardMisses）を差し替えると点検の答えも変わる＝写しを持っていない', moved === 1, moved);
}

console.log('\n── ⑦ 状態の矛盾 ──');
{
  const r = await only([
    { id:'t01', status:'contact', returnStage:'returnWait', returnDate:'@' },
    { id:'t02', status:'returned', returnStage:null, completedAt:null, amountFinal:100000 },
    { id:'t03', status:'workDone', mechanics:[], inspectors:[] },
    { id:'t05', status:'cancelled' },
    { id:'t09', status:'work', boardId:'nosuchboard' }
  ]);
  ok('🔴 返車の列にいるのに作業前の状態（T01）', (r.by.T01 || []).join() === 't01', r.by.T01);
  ok('🔴 返車済みなのに完TELを通っていない（T02）', (r.by.T02 || []).indexOf('t02') >= 0, r.by.T02);
  ok('作業完了なのに整備担当が空（T03）', (r.by.T03 || []).join() === 't03', r.by.T03);
  ok('🔴 キャンセルの中身が分からない（T05）', (r.by.T05 || []).join() === 't05', r.by.T05);
  ok('知らないボードのカード（T09）', (r.by.T09 || []).indexOf('t09') >= 0, r.by.T09);
}

console.log('\n── ⑦-2 担当がそれぞれの所見に付く（ゆうた指定 2026-08-21） ──');
{
  const r = await p.evaluate(() => {
    const D = window._D, M = window._MON;
    /* ⚠ 休みの元をにせ物にしたら**必ず戻す**（戻さないと、あとの画面が本物の PitCal を呼んで落ちる） */
    const _kH = window.Holidays, _kC = window.PitCal;
    window.Holidays = { is: () => false, name: () => null };
    window.PitCal = { isClosed: () => false, label: () => '', info: () => ({ closed:false }) };
    window._only([
      window._clean({ id:'w1', status:'work', amountOrder:null, frontStaff:'椎名' }),            /* 1課の人 */
      window._clean({ id:'w2', status:'work', amountOrder:null, boardId:'import', division:'div2',
                      frontStaff:'箱崎', staff:'箱崎', inspectors:['箱崎'], mechanics:['箱崎'] }), /* 2課の人 */
      window._clean({ id:'w3', status:'work', amountOrder:null, frontStaff:'', staff:'' }),      /* 決まっていない */
      /* 車検＝フロントとは別に「回送の担当」も出る */
      window._clean({ id:'w4', status:'work', workType:'shaken', workTypes:['shaken'], feeAmount:50000,
                      frontStaff:'椎名', reserveDate:D(M + 2), returnDate:D(M + 6),
                      inspSchedule:{ decided:D(M), resultStaff:'蓮沼', office:'野田' } })
    ], []);
    const res = pitInspectRun();
    const by = {}; res.findings.forEach(f => { by[f.refId] = by[f.refId] || f; });
    /* ⚠ w4 は お金の所見にも車検の所見にも出る。**回送の担当が付くのは車検の所見だけ**
          （お金の所見に車検担当を出しても、直す人が分からなくなるだけ）。だから車検のほうを見る。 */
    by.w4 = res.findings.filter(f => f.refId === 'w4' && f.cat === 'shaken')[0] || by.w4;
    window._insp.past = false; window._insp.level = ''; window._insp.cat = ''; window._insp.all = {};
    renderInspect();
    const body = document.getElementById('inspect-body');
    const rows = Array.from(body.querySelectorAll('.ins-row')).map(el => ({
      st: (el.querySelector('.ins-who-st') || {}).textContent || '',
      st2: (el.querySelector('.ins-who-st2') || {}).textContent || '',
      color: (el.querySelector('.ins-who-st') || { style:{} }).style.getPropertyValue('--ins-s') || ''
    }));
    const out = pitInspectExport(res);
    window.Holidays = _kH; window.PitCal = _kC;      /* 借りたものは返す */
    return { w1:by.w1, w2:by.w2, w3:by.w3, w4:by.w4,
             w4money: res.findings.filter(f => f.refId === 'w4' && f.cat === 'money')[0] || {},
             rows: rows,
             expKeys: Object.keys(out.所見[0] || {}),
             expStaff: out.所見.map(x => x.担当) };
  });
  ok('🔴 所見に担当が付く（1課の人）', r.w1.staff === '椎名', r.w1.staff);
  ok('🔴 所見に担当が付く（2課の人）', r.w2.staff === '箱崎', r.w2.staff);
  ok('🔴 決まっていなければ空と分かる', r.w3.staff === '', r.w3.staff);
  ok('🔴 担当バッジの色は課から引く（1課と2課で違う）',
     !!r.w1.staffColor && !!r.w2.staffColor && r.w1.staffColor !== r.w2.staffColor,
     [r.w1.staffColor, r.w2.staffColor]);
  ok('🔴 課が空でも色は返る（グレー）', !!r.w3.staffColor, r.w3.staffColor);
  ok('🔴 車検の所見には回送の担当も付く（フロントとは別）',
     r.w4.staff === '椎名' && r.w4.staff2 === '蓮沼', [r.w4.staff, r.w4.staff2]);
  ok('🔴 車検以外の所見には回送の担当を出さない（直す人がぼやけないように）',
     !r.w4money.staff2 && r.w4money.staff === '椎名', [r.w4money.cat, r.w4money.staff2]);
  ok('🔴 画面に担当バッジが出る', r.rows.every(x => !!x.st), r.rows);
  ok('🔴 担当が空の行は「担当なし」と言う', r.rows.some(x => x.st === '担当なし'), r.rows.map(x => x.st));
  ok('🔴 車検の行は「車検 ◯◯」も出る', r.rows.some(x => /車検 蓮沼/.test(x.st2)), r.rows.map(x => x.st2));
  ok('🔴 書き出し（②突合・③AI判断へ渡す形）にも担当が入る',
     r.expKeys.indexOf('担当') >= 0 && r.expKeys.indexOf('車検担当') >= 0, r.expKeys);
  ok('書き出しの担当が空文字で埋まっていない', r.expStaff.some(x => x === '椎名'), r.expStaff);
}

console.log('\n── ⑦-3 隠さない・全部出す／「もう一度チェック」が効く（v1.169.2） ──');
{
  /* 🔴 ゆうた指定（2026-08-22）
       「**終わった車も見る も要らない。確実に全て出して**」
       「**もう一度は押してもなんか動いてる感じがしない**」
     ＝ ① 画面の側で黙って隠さない  ② 押したら走ったと分かる */
  const r = await p.evaluate(() => {
    const D = window._D;
    window._only([
      window._clean({ id:'s1', status:'work', amountOrder:null }),
      window._clean({ id:'s2', status:'returned', returnStage:'returnWait', completedAt:D(-2),
                      amountFinal:null, amountOrder:120000 }),
      window._clean({ id:'s3', status:'work', amountOrder:200000, archived:true, tel:'090-11' })
    ], []);
    const res = pitInspectRun();
    window._insp.level = ''; window._insp.cat = ''; window._insp.done = false; window._insp.all = {};
    renderInspect();
    const body = document.getElementById('inspect-body');
    return {
      found: res.findings.length,
      rows: body.querySelectorAll('.ins-row').length,
      tiles: Array.from(body.querySelectorAll('.ins-tile-n')).map(e => +e.textContent),
      chks: Array.from(body.querySelectorAll('.ins-chk')).map(e => e.textContent),
      scopeBtns: body.querySelectorAll('.ins-scope').length,
      when: (body.querySelector('.ins-when') || {}).textContent || '',
      hasRerun: !!document.getElementById('ins-rerun')
    };
  });
  ok('🔴 物差しが見つけた所見が、1件残らず画面に出ている（隠さない）', r.rows === r.found, r);
  ok('🔴 重さのタイルの合計も、見つけた数と同じ',
     r.tiles.reduce((a, b) => a + b, 0) === r.found, [r.tiles, r.found]);
  ok('🔴 「終わった記録も見る」のチェックは無い', r.chks.every(t => !/終わった記録/.test(t)), r.chks);
  ok('🔴 切り替えのボタンも無い', r.scopeBtns === 0, r.scopeBtns);
  ok('🔴 上の帯に「◯時◯分◯秒にチェック」と出る（走った証拠）',
     /\d{2}:\d{2}:\d{2}/.test(r.when), r.when);
  ok('「もう一度チェック」のボタンがある', r.hasRerun === true);
}
{
  /* 🔴 押したら **時刻が変わる**（＝本当に走り直している）。
     ⚠ 中身が同じだと画面が1文字も変わらず「動いていない」ように見えたのが、ゆうた報告の正体。 */
  const r = await p.evaluate(async () => {
    const when = () => (document.querySelector('.ins-when') || {}).textContent || '';
    const before = when();
    const toasts = [];
    const keep = window.pitToast;
    window.pitToast = function (m) { toasts.push(m); };
    await new Promise(r => setTimeout(r, 1100));
    pitInspectRerun();
    await new Promise(r => setTimeout(r, 400));
    const after = when();
    window.pitToast = keep;
    return { before, after, toasts };
  });
  ok('🔴 押すとチェックした時刻が変わる（走り直している）', r.before !== r.after, r);
  ok('🔴 変わりが無くても黙らない（必ず何か言う）', r.toasts.length === 1, r.toasts);
  ok('🔴 「変わりはありません」と件数を言う', /変わりはありません|→/.test(r.toasts[0] || ''), r.toasts);
}

console.log('\n── ⑦-4 本番データで空振りしていた2つを直した（v1.169.0） ──');
{
  const r = await p.evaluate(() => {
    const D = window._D, M = window._MON;
    const _kH = window.Holidays, _kC = window.PitCal;
    window.Holidays = { is: () => false, name: () => null };
    window.PitCal = { isClosed: () => false, label: () => '', info: () => ({ closed:false }) };
    window._only([
      /* ① まだ来ていない車の「漢字の名前が空」は言わない（電話受付ではカナだけが正しい） */
      window._clean({ id:'yoyaku', status:'reserved', customer:'', kana:'タナカ' }),
      /* ② 入庫したら言う（車検証で分かるので） */
      window._clean({ id:'nyuko',  status:'work', amountOrder:200000, customer:'', kana:'スズキ' }),
      /* ③ 車検で行く日が未定：もう預かっている */
      window._clean({ id:'shaMochi', status:'work', amountOrder:200000, workType:'shaken', workTypes:['shaken'],
                      feeAmount:50000, reserveDate:D(-9), returnDate:D(4), inspSchedule:{} }),
      /* ④ 車検で行く日が未定：これから来る */
      window._clean({ id:'shaKore',  status:'reserved', workType:'shaken', workTypes:['shaken'],
                      feeAmount:50000, reserveDate:D(2), returnDate:D(6), inspSchedule:{} })
    ], []);
    const res = pitInspectRun();
    const hit = (id, rid) => res.findings.some(f => f.refId === id && f.ruleId === rid);
    const txt = id => (res.findings.filter(f => f.refId === id && f.ruleId === 'D02')[0] || {}).text || '';
    const lvOf = rid => (res.findings.filter(f => f.ruleId === rid)[0] || {}).level;
    window.Holidays = _kH; window.PitCal = _kC;
    return { yoyakuD02: hit('yoyaku','D02'), yoyakuTxt: txt('yoyaku'),
             nyukoD02: hit('nyuko','D02'), nyukoTxt: txt('nyuko'),
             mochiS08: hit('shaMochi','S08'), mochiS01: hit('shaMochi','S01'),
             koreS01: hit('shaKore','S01'), koreS08: hit('shaKore','S08'),
             s08lv: lvOf('S08'), s01lv: lvOf('S01') };
  });
  ok('🔴 まだ来ていない車の「漢字の名前が空」は言わない',
     !/お客様名/.test(r.yoyakuTxt), r.yoyakuTxt);
  ok('🔴 入庫した車には言う（車検証で分かるので）', /お客様名/.test(r.nyukoTxt), r.nyukoTxt);
}

console.log('\n── ⑧ 札（見た／直した）と、🔴 v1.172.0 「やらなくていい」道が1つも無いこと ──');
{
  const r = await p.evaluate(() => {
    const base = window._only([window._clean({ id:'k1', status:'work', amountOrder:null })]);
    const f = base.findings.filter(x => x.ruleId === 'M01')[0];
    const before = base.findings.length;
    pitInspectMark(f.key, 'fixed');
    const after = pitInspectRun();
    const marked = after.findings.filter(x => x.key === f.key)[0];
    pitInspectMark(f.key, '');
    const off = pitInspectRun().findings.filter(x => x.key === f.key)[0];
    /* 🔴 v1.172.0 新しく黙らせる道は無い（呼んでも何も起きない） */
    pitInspectMute('M01', true);
    const muted = pitInspectRun();
    return { before, key:f.key, mark:(marked||{}).mark, offMark:(off||{}).mark,
             markedN: after.findings.length,
             mutedN: muted.findings.filter(x => x.ruleId === 'M01').length,
             mutedCount: muted.muted, mutes: Object.keys(state.inspectMutes || {}).length };
  });
  ok('🔴 札の貼り先は「規則ID:カードID」', /^M01:/.test(r.key), r.key);
  ok('🔴 「直した」を貼っても所見は消えない（数が減らない）', r.mark === 'fixed' && r.markedN === r.before, r);
  ok('札をはがせる', !r.offMark, r.offMark);
  ok('🔴🔴 新しく黙らせる道が無い（呼んでも出続ける）', r.mutedN === 1 && r.mutedCount === 0, r);
  ok('🔴 呼んでも印そのものが増えない', r.mutes === 0, r);
}
{
  /* 🔴🔴 v1.172.1（ゆうた訂正）**前に「出さない」を選んでいた規則は、勝手に捨てない。**
     🗣「出さないを選択してたやつはルールからはずしていい」＝**規則ごと消す**という意味。
     ＝ その印は「消す予定の控え」。ただし**黙って隠さない**＝画面に名前を出す。 */
  const r = await p.evaluate(() => {
    window._only([window._clean({ id:'mu1', status:'work', amountOrder:null })]);
    state.inspectMutes = { M01:1 };
    const res = pitInspectRun();
    window._insp.level = ''; window._insp.cat = ''; window._insp.all = {};
    renderInspect();
    const body = document.getElementById('inspect-body');
    const keep = Object.keys(state.inspectMutes || {}).length;
    const out = { keep, n: res.findings.filter(x => x.ruleId === 'M01').length,
                  ids: (res.mutedIds || []).map(x => x.id),
                  band: (body.querySelector('.ins-tobe') || {}).textContent || '' };
    state.inspectMutes = {};
    return out;
  });
  ok('🔴🔴 「出さない」を選んだ印を勝手に捨てない（消す規則の控え）', r.keep === 1, r.keep);
  ok('消すまでの間は、選んだとおり出さない', r.n === 0, r.n);
  ok('🔴 どの規則かを持っている（mutedIds）', r.ids.join() === 'M01', r.ids);
  ok('🔴🔴 黙って隠さない＝画面に「消す予定の規則」と名前を出す',
     /消す予定の規則/.test(r.band) && r.band.length > 20, r.band);
}
{
  /* 🔴🔴 v1.172.0（ゆうた指定）**前に押して隠していたものを出し直す。**
     ＝ ボタンだけ消して印を残すと、戻す手立てが無いまま永久に隠れる。 */
  const r = await p.evaluate(() => {
    window._only([window._clean({ id:'sw1', status:'work', amountOrder:null })]);
    const key = pitInspectRun().findings.filter(x => x.ruleId === 'M01')[0].key;
    /* 昔の「これでOK」と「この規則は出さない」を手で埋め込む（v1.171.0 以前の状態） */
    state.inspectMarks[key] = { v:'spec', at:'2026-08-01', by:'昔の人' };
    state.inspectMutes = { M02:1, M03:1 };
    const res = pitInspectRun();
    const out = { mark: (state.inspectMarks[key] || {}).v || '', mutes: Object.keys(state.inspectMutes).length,
             shown: res.findings.filter(x => x.key === key).length };
    state.inspectMutes = {};
    return out;
  });
  ok('🔴 前に押した「これでOK」の印が外れている', r.mark === '', r.mark);
  /* 🔴🔴 v1.172.1（ゆうた訂正）**「出さない」を選んだ規則は戻さない＝規則ごと消すもの。**
     ここは「勝手に捨てていないこと」を見る（消すのはコードから規則を削る時）。 */
  ok('🔴🔴 「出さない」を選んだ印は残っている（消す予定の控え）', r.mutes === 2, r.mutes);
  ok('🔴 その所見はちゃんと出ている', r.shown === 1, r.shown);
}
{
  /* 🔴🔴 v1.172.0（ゆうた指定）**札は2つだけ／隠す道は画面に1つも無い。**
     ⚠ id を変えると**今までに貼った札が全部はがれる**ので、id が変わっていないことも見る。 */
  const r = await p.evaluate(() => {
    window._only([window._clean({ id:'lb1', status:'work', amountOrder:null })], []);
    const f = pitInspectRun().findings.filter(x => x.ruleId === 'M01')[0];
    pitInspectMark(f.key, 'fixed');
    const res = pitInspectRun();
    window._insp.level = ''; window._insp.cat = ''; window._insp.all = {};
    renderInspect();
    const body = document.getElementById('inspect-body');
    const out = pitInspectExport(res);
    return {
      ids: PIT_INSPECT_MARKS.map(m => m.id),
      labels: PIT_INSPECT_MARKS.map(m => m.label),
      btns: Array.from(body.querySelectorAll('.ins-mk')).map(e => e.textContent),
      badge: (body.querySelector('.ins-badge') || {}).textContent || '',
      rows: body.querySelectorAll('.ins-row').length,
      mute: body.querySelectorAll('.ins-mute').length,
      chk: body.querySelectorAll('.ins-chk').length,
      goal: (body.querySelector('.ins-goal') || {}).textContent || '',
      text: body.textContent,
      exp: out.所見[0] || {}
    };
  });
  ok('🔴 札の中身（id）は変えていない＝貼った札がはがれない', r.ids.join() === 'fixed,ok', r.ids);
  ok('🔴 言葉は「直した／確認した」の2つだけ（v1.173.0 で「見た」を廃止）',
     r.labels.join() === '直した,確認した', r.labels);
  ok('🔴🔴 「これでOK」がどこにも出ていない', !/これでOK/.test(r.text), r.btns);
  ok('🔴🔴 「この規則は出さない」のボタンが無い', r.mute === 0, r.mute);
  ok('🔴 「片づけたものも見る」も無い（隠しているものが無いので要らない）', r.chk === 0, r.chk);
  /* 🔴🔴 v1.173.0 M01 は「抜け・矛盾」＝**直すしかない**ので「確認した」は出ない */
  ok('🔴🔴 抜け・矛盾の規則には「確認した」を出さない', r.btns.join() === '直した', r.btns);
  ok('🔴 札を貼っても行は消えない', r.rows === 1, r.rows);
  ok('貼った札は行にも同じ言葉で出る', r.badge === '直した', r.badge);
  ok('🔴 「0にする」と画面が言っている', /0/.test(r.goal) && /直/.test(r.goal), r.goal);
  ok('🔴 「やらなくていい」ふうの言い方が画面に無い',
     !/仕様かも|そのままで大丈夫|やらなくて/.test(r.text), r.text.slice(0, 200));
  /* 🔴 書き出しは**人が読む言葉**で（②突合・③AI判断がそのまま読む） */
  ok('🔴 書き出しの札が日本語（fixed のままではない）', r.exp.札 === '直した', r.exp.札);
  ok('🔴 書き出しに元の印も残る（機械が読む用）', r.exp.札の印 === 'fixed', r.exp.札の印);
  ok('🔴 書き出しに札をつけた日が入る', /^\d{4}-\d{2}-\d{2}$/.test(r.exp.札をつけた日 || ''), r.exp.札をつけた日);
}
{
  /* もう出なくなった所見の札は捨てる（札がたまり続けない） */
  const r = await p.evaluate(() => {
    window._only([window._clean({ id:'g1', status:'work', amountOrder:null })]);
    const key = pitInspectRun().findings.filter(x => x.ruleId === 'M01')[0].key;
    pitInspectMark(key, 'fixed');
    const had = !!state.inspectMarks[key];
    /* 直した＝金額を入れた → 所見が消える → 札も捨てられる */
    state.cards[0].amountOrder = 250000;
    const res = pitInspectRun();
    return { had, left: !!state.inspectMarks[key], dropped: res.dropped, n: res.findings.length };
  });
  ok('札を貼れている', r.had === true);
  ok('🔴 直したら所見が消える', r.n === 0, r.n);
  ok('🔴 消えた所見の札は自動で捨てる（たまり続けない）', r.left === false && r.dropped >= 1, r);
}

console.log('\n── ⑨ 規則は1文字も書き換えない（書き換えは「ここを直す」だけ） ──');
{
  const same = await p.evaluate(() => {
    const cards = [window._clean({ id:'ro1', status:'work', amountOrder:null, returnDate:window._D(-3) })];
    state.cards = cards; state.loanerAssigns = []; state.inspectMarks = {}; state.inspectMutes = {};
    const before = JSON.stringify(state.cards);
    pitInspectRun(); pitInspectRun();
    return before === JSON.stringify(state.cards);
  });
  ok('🔴 点検を2回走らせてもカードが1文字も変わらない', same === true);
}

console.log('\n── ⑩ 画面（並べるだけ・絞り込み・書き出し） ──');
{
  const r = await p.evaluate(() => {
    const D = window._D;
    /* ⚠ 定休日カレンダーを止める。止めないと「200日先」がたまたま定休日に当たって
          R04 が余分に鳴り、走らせた日によって件数が変わる（実際に変わった）。 */
    const _kH = window.Holidays, _kC = window.PitCal;
    window.Holidays = { is: () => false, name: () => null };
    window.PitCal = { isClosed: () => false, label: () => '', info: () => ({ closed:false }) };
    window._only([
      /* ⚠ v2・v3 にも受注金額を入れる。入れないと3枚とも M01（受注金額が空）に出て、
            「重さで絞れるか」が試せない（規則が正しいぶん、下ごしらえを正しくする側） */
      window._clean({ id:'v1', status:'work', amountOrder:null }),                                  /* red  M01 */
      window._clean({ id:'v2', status:'work', amountOrder:200000, tel:'090-11' }),                  /* amber D05 */
      window._clean({ id:'v3', status:'work', amountOrder:200000, reserveDate:D(1), returnDate:D(200) })  /* amber F07 */
    ], []);
    window._insp.past = false; window._insp.level = ''; window._insp.cat = ''; window._insp.done = false; window._insp.all = {};
    showView('inspect');
    const body = document.getElementById('inspect-body');
    const all = body.querySelectorAll('.ins-row').length;
    const groups = body.querySelectorAll('.ins-g').length;
    pitInspectFilter('level', 'red');
    const red = document.getElementById('inspect-body').querySelectorAll('.ins-row').length;
    pitInspectFilter('level', 'red');       /* もう一度押すと解除 */
    const off = document.getElementById('inspect-body').querySelectorAll('.ins-row').length;
    pitInspectFilter('cat', 'money');
    const money = document.getElementById('inspect-body').querySelectorAll('.ins-row').length;
    pitInspectFilter('cat', '');
    const out = pitInspectExport();
    window.Holidays = _kH; window.PitCal = _kC;      /* 借りたものは返す */
    return { all, groups, red, off, money, exp: out.所見.length, keys: Object.keys(out),
             tiles: body.querySelectorAll('.ins-tile').length,
             hasWhy: !!body.querySelector('.ins-g-why'), hasMute: !!body.querySelector('.ins-mute') };
  });
  ok('3件ぶんの行が出る', r.all === 3, r);
  ok('規則ごとにまとまっている（3つ）', r.groups === 3, r.groups);
  ok('重さのタイルが3つ出る（要対応・確認・気づき）', r.tiles === 3, r.tiles);
  ok('🔴 重さで絞り込める（要対応＝1件）', r.red === 1, r.red);
  ok('もう一度押すと絞り込みが外れる', r.off === 3, r.off);
  ok('🔴 分類で絞り込める（お金＝1件）', r.money === 1, r.money);
  ok('「なぜ出したか／どうする」が出る', r.hasWhy === true);
  /* 🔴🔴 v1.172.0（ゆうた指定）ここに「この規則は出さない」ボタンは無い */
  ok('🔴 「この規則は出さない」ボタンが無い', r.hasMute === false);
  ok('🔴 書き出しに所見が全部入る（②突合・③AI判断へ渡す形）', r.exp === 3, r.exp);
  ok('書き出しに対象台数・規則の数・分類ごとが入る',
     ['対象台数','規則の数','分類ごと','重さごと','所見'].every(k => r.keys.indexOf(k) >= 0), r.keys);
}
{
  /* 1つの規則で多すぎる時は上から少しだけ＋「ほか◯件」 */
  const r = await p.evaluate(() => {
    const cards = []; for (let i = 0; i < 26; i++) cards.push(window._clean({ id:'many' + i, status:'work', amountOrder:null }));
    state.cards = cards; state.loanerAssigns = []; state.inspectMarks = {}; state.inspectMutes = {};
    window._insp.past = false; window._insp.level = ''; window._insp.cat = ''; window._insp.all = {};
    renderInspect();
    const body = document.getElementById('inspect-body');
    const first = body.querySelectorAll('.ins-row').length;
    const more = body.querySelector('.ins-more');
    const txt = more ? more.textContent : '';
    pitInspectAll('M01');
    const opened = document.getElementById('inspect-body').querySelectorAll('.ins-row').length;
    return { first, txt, opened };
  });
  ok('🔴 多すぎる時は上から20件だけ出す', r.first === 20, r.first);
  ok('🔴 隠した件数を黙って切り捨てず必ず言う', /ほか 6件/.test(r.txt), r.txt);
  ok('押すと全部出る', r.opened === 26, r.opened);
}

console.log('\n── ⑪ 現場の言葉で書けているか（内輪の言葉を混ぜない） ──');
{
  /* 🔴 v1.168.1（ゆうた指摘 2026-08-21）
     🗣「**41.5万 を今月に寄せています って書き方が恐らくみんなわからないと思う**」
     ＝ 「寄せる」は売上の数え方（sales-count.js）の中の言い方であって、現場の言葉ではない。
     🔴 **画面に出る文には、作る側だけが分かる言葉を入れない。**
        下の言葉が1つでも混ざったら落とす＝次に規則を足す人も、ここで気づける。
     ⚠ コメント（作る側の覚え書き）は対象外。見るのは**人の目に触れる文だけ**。 */
  const NG = ['寄せ', '盤面', '関門', '所見', '物差し', 'ステータス', 'フラグ', 'null', 'undefined'];
  const r = await p.evaluate((NG) => {
    /* ① 規則の表（見出し・なぜ・どうする） */
    const inTable = [];
    PIT_INSPECT_RULES.forEach(x => {
      const t = String(x.title || '') + String(x.why || '') + String(x.fix || '');
      NG.forEach(w => { if (t.indexOf(w) >= 0) inTable.push(x.id + ' → ' + w); });
    });
    /* ② 実際に画面へ出た文（1件ずつの説明・分類・重さ・札・ボタン） */
    const D = window._D;
    window._only([
      window._clean({ id:'j1', status:'work', amountOrder:null, reserveDate:D(-20), returnDate:D(-5) }),
      window._clean({ id:'j2', status:'returned', returnStage:'returnWait', completedAt:null, amountFinal:null }),
      window._clean({ id:'j3', status:'work', kana:'', repeat:'' })
    ], []);
    window._insp.past = false; window._insp.level = ''; window._insp.cat = ''; window._insp.done = false; window._insp.all = {};
    renderInspect();
    const body = document.getElementById('inspect-body');
    const onScreen = [];
    NG.forEach(w => { if ((body.textContent || '').indexOf(w) >= 0) onScreen.push(w); });
    const stars = [];
    PIT_INSPECT_RULES.forEach(x => {
      ['title','why','fix'].forEach(k => { if (/\*\*/.test(String(x[k] || ''))) stars.push(x.id + '.' + k); });
    });
    return { inTable: inTable, onScreen: onScreen, stars: stars,
             sum: (body.querySelector('.ins-goal') || {}).textContent || '',
             sample: Array.from(body.querySelectorAll('.ins-row-txt')).map(e => e.textContent) };
  }, NG);
  ok('🔴 規則の表（見出し・なぜ・どうする）に内輪の言葉が無い', r.inTable.length === 0, r.inTable);
  /* 🔴 画面は文をそのまま出す（太字の記号は解釈しない）。
     ⚠ 覚え書きのつもりで ** を書くと、画面に **そのまま** と出る（実際に出ていた）。 */
  ok('🔴 画面に出る文に ** が残っていない（そのまま字として出てしまう）',
     r.stars.length === 0, r.stars);
  ok('🔴 画面に出た文にも内輪の言葉が無い', r.onScreen.length === 0, r.onScreen);
  /* 🔴🔴 v1.172.0（ゆうた指定）タイルの右は「0にする」＝運用そのもの。
     前の「片づけた◯件」（札を貼った数）は廃止した＝札を成果のように見せない。 */
  ok('🔴 タイルの右で「0にする」と言っている',
     /0/.test(r.sum) && /直/.test(r.sum) && !/片づけた/.test(r.sum), r.sum);
  /* 規則が言いたいことが、そのまま日本語で読めるか（M01＝受注金額が空） */
  ok('🔴 規則の文がそのまま日本語で読める（M01）',
     r.sample.some(x => /受注金額が空です/.test(x)), r.sample);
}

console.log('\n── ⑫ 名前が「データチェック」になっている（ゆうた指定 2026-08-22） ──');
{
  /* 🔴 なぜ見張るか
       PitFlow の「点検」は **車の12ヶ月点検・タスクボードの点検待ち** を指す言葉。
       同じ字でデータの見直しも呼ぶと現場で必ず取り違えるので言い換えた。
     ⚠ 車のほうの「点検」は**そのまま**（言い換えていないことも一緒に見張る）。 */
  const r = await p.evaluate(() => {
    window._insp.mode = 'daily'; renderInspect();
    const nav = document.querySelector('.si-item[data-view="inspect"]');
    const ttl = document.querySelector('#view-inspect .view-title');
    const body = document.getElementById('inspect-body');
    return {
      nav: (nav && nav.textContent || '').trim(),
      title: (ttl && ttl.textContent || '').trim(),
      rerun: (document.getElementById('ins-rerun') || {}).textContent || '',
      when: (body.querySelector('.ins-when') || {}).textContent || '',
      /* 車のほうの「点検」は残っていること＝言い換えすぎていない */
      keepPhase: (window.pitCardStatusText ? pitCardStatusText({ status:'check' }) : '')
    };
  });
  ok('🔴 メニューが「データチェック」', r.nav === 'データチェック', r.nav);
  ok('🔴 見出しも「データチェック」', /^データチェック/.test(r.title), r.title);
  ok('🔴 ボタンは「もう一度チェック」（「点検」と言わない）',
     r.rerun === 'もう一度チェック', r.rerun);
  ok('🔴 上の帯も「チェック」と言う', /にチェック/.test(r.when), r.when);
  ok('🔴 車のほうの「点検待ち」は言い換えていない', /点検/.test(r.keepPhase), r.keepPhase);
}

console.log('\n── ⑬ いちばん上で「日常チェック／クォーターチェック」を切り替えられる ──');
{
  const r = await p.evaluate(() => {
    window._insp.mode = 'daily'; renderInspect();
    const body = document.getElementById('inspect-body');
    const btns = Array.from(body.querySelectorAll('.ins-mode-b'));
    /* 切り替えは**いちばん上**にあること（下に埋もれていたら見つけられない） */
    const first = body.firstElementChild;
    const dailyOn = btns.map(b => b.classList.contains('on'));
    const dailyHasRules = !!body.querySelector('.ins-tiles');
    pitInspectMode('quarter');
    const qBody = document.getElementById('inspect-body');
    const qOn = Array.from(qBody.querySelectorAll('.ins-mode-b')).map(b => b.classList.contains('on'));
    const qTxt = qBody.textContent || '';
    const qWin = (qBody.querySelector('.ins-q-now') || {}).textContent || '';
    const qHasRules = !!qBody.querySelector('.ins-tiles');
    pitInspectMode('daily');
    return {
      labels: btns.map(b => (b.querySelector('.ins-mode-l') || {}).textContent),
      firstIsMode: !!(first && first.classList.contains('ins-mode')),
      dailyOn, qOn, dailyHasRules, qHasRules, qTxt, qWin,
      /* クォーターの区切りは売上の物差しから借りているか */
      ruler: !!window.pitQuarterOf,
      sameAsSales: window.pitQuarterOf ? window.pitQuarterOf('2026-08-09').no : null
    };
  });
  ok('🔴 切り替えは2つ＝日常チェック／クォーターチェック',
     JSON.stringify(r.labels) === JSON.stringify(['日常チェック', 'クォーターチェック']), r.labels);
  ok('🔴 切り替えは画面のいちばん上にある', r.firstIsMode === true);
  ok('日常チェックが選ばれている時は、規則の一覧が出る', r.dailyOn[0] === true && r.dailyHasRules === true, r);
  ok('🔴 クォーターチェックに切り替わると、規則の一覧は出ない（別の中身）',
     r.qOn[1] === true && r.qHasRules === false, r);
  ok('クォーターチェックは②突合と③AIチェックの話をしている',
     /売上チェックリストPDF/.test(r.qTxt) && /AIチェック/.test(r.qTxt), r.qTxt.slice(0, 120));
  ok('🔴 クォーターの区切りは売上の物差し（pitQuarterOf）を借りている', r.ruler === true);
  ok('🔴 8月9日は第2クォーター（1〜7／8〜15／16〜23／24〜末）', r.sameAsSales === 2, r.sameAsSales);
  ok('いまのクォーターの期間が出ている', /\d{4}-\d{2}-\d{2} 〜 \d{4}-\d{2}-\d{2}/.test(r.qWin), r.qWin);
}

console.log('\n── ⑭ 「ここを直す」＝アーカイブ済みでも、該当箇所だけ直せる（ゆうた指定 2026-08-22） ──');
{
  /* 🔴 ゆうたの言葉そのまま
       「アーカイブ車両であっても、**該当箇所だけ**は修正をだれでもかけられるようにしたい」
       「**ほかの箇所は触れない**」
       「**確定金額と確定日だけはこれまで通り管理者のみ**」 */
  const r = await p.evaluate(() => {
    const D = window._D;
    /* アーカイブ済み＋必須（カナ）が空＝D09 が拾う車 */
    window._only([ window._clean({ id:'a1', status:'returned', archived:true, returnStage:'returnWait',
                                   completedAt:D(-10), amountFinal:300000, kana:'', tel:'090-1111-2222' }) ], []);
    window._insp.mode = 'daily'; window._insp.level = ''; window._insp.cat = '';
    window._insp.done = false; window._insp.all = {};
    renderInspect();
    const res = window._insp.res;
    const f = res.findings.filter(x => x.ruleId === 'D09')[0];
    const before = JSON.stringify(state.cards[0]);
    const btn = document.querySelector('.ins-fixb');
    pitFixOpen(f.key);
    const win = document.getElementById('ins-fix');
    const labels = Array.from(win.querySelectorAll('.ins-fix-l')).map(e => e.textContent.replace(/🔒.*/, '').trim());
    const inputs = Array.from(win.querySelectorAll('.ins-fix-in')).map(e => e.id);
    const archNote = !!win.querySelector('.ins-fix-arch');
    const txt = win.textContent || '';
    /* 直す */
    document.getElementById('ins-fix-f-kana').value = 'ケンサジロウ';
    pitFixSave();
    const c = state.cards[0];
    return {
      hasFinding: !!f, hasBtn: !!btn, labels, inputs, archNote, txt,
      closed: !document.getElementById('ins-fix'),
      kana: c.kana,
      /* 🔴 ほかの箇所が動いていないこと */
      untouched: c.plate === JSON.parse(before).plate && c.amountFinal === JSON.parse(before).amountFinal
                 && c.completedAt === JSON.parse(before).completedAt && c.customer === JSON.parse(before).customer,
      flow: (c.log || []).filter(e => /データチェックから直した/.test(String(e.label || e.text || ''))).length,
      /* 🔴 本当に直ったなら、所見そのものが消えていること（札で隠すのではない） */
      goneAfter: pitInspectRun().findings.filter(x => x.key === f.key).length,
      mark: (state.inspectMarks[f.key] || {}).v || ''
    };
  });
  ok('アーカイブ済みの車でも、抜けは見つかる（D09）', r.hasFinding === true);
  ok('🔴 アーカイブ済みの車にも「ここを直す」が出る（誰でも押せる）', r.hasBtn === true);
  ok('🔴 小窓は「アーカイブ済み」だと言ってから開く（黙って開けない）', r.archNote === true);
  ok('🔴 小窓に出るのは**抜けている欄だけ**（カナ）',
     JSON.stringify(r.labels) === JSON.stringify(['カナ']), r.labels);
  ok('🔴 ほかの欄（ナンバー・確定金額）は小窓に出ない＝触れない',
     r.inputs.every(id => !/plate|amountFinal|completedAt/.test(id)), r.inputs);
  ok('その場で直せた', r.kana === 'ケンサジロウ', r.kana);
  ok('🔴 直した欄以外は1文字も動いていない', r.untouched === true);
  ok('直したらフローに「何を どこから どこへ」が残る', r.flow === 1, r.flow);
  /* 🔴 直したのに所見が残る＝まだ直り切っていない、ということ。
     そこへ自動で「直した」の札を貼ると、残っている問題を自分で隠してしまう。 */
  ok('🔴 直ったら、その所見が消える（札で隠すのではない）', r.goneAfter === 0, r.goneAfter);
  ok('🔴 「直した」の札は自動で貼らない', r.mark === '', r.mark);
  ok('直したら小窓は閉じる', r.closed === true);
  /* ⚠ 小窓の文にも内輪の言葉を混ぜない（⑪と同じ物差し） */
  ok('🔴 小窓の文に内輪の言葉が無い',
     ['寄せ', '盤面', '関門', '所見', '物差し', 'ステータス', 'フラグ', 'null', 'undefined']
       .every(w => r.txt.indexOf(w) < 0), r.txt.slice(0, 160));
}
{
  /* 🔴🔴 ここが今回いちばん大事な見張り＝**確定金額と確定日は管理者だけ。**
     ⚠ 物差しは card-view.js の `pitCanEditFinal()` 1本。ここを差し替えて、
        データチェックが**本当にそれを見ているか**を確かめる（自前で判定していたら通らない）。 */
  const r = await p.evaluate(() => {
    const D = window._D;
    const keep = window.pitCanEditFinal;
    window.pitCanEditFinal = () => false;                 /* ＝管理でない人 */
    window._only([ window._clean({ id:'b1', status:'returned', archived:true, returnStage:'returnWait',
                                   completedAt:D(-10), amountFinal:null, amountOrder:250000 }) ], []);
    window._insp.mode = 'daily'; window._insp.done = false; renderInspect();
    const f = window._insp.res.findings.filter(x => x.ruleId === 'M02')[0];
    pitFixOpen(f.key);
    let win = document.getElementById('ins-fix');
    const lockedTxt = win.textContent || '';
    const noInput = !document.getElementById('ins-fix-f-amountFinal');
    const readOnly = !!win.querySelector('.ins-fix-ro');
    /* ボタンを押しても入らないこと（画面を消しただけにしない） */
    pitFixSave();
    const stillEmpty = state.cards[0].amountFinal == null;
    if (document.getElementById('ins-fix')) pitFixClose();

    /* 管理ならその場で入る */
    window.pitCanEditFinal = () => true;
    renderInspect();
    const f2 = window._insp.res.findings.filter(x => x.ruleId === 'M02')[0];
    pitFixOpen(f2.key);
    document.getElementById('ins-fix-f-amountFinal').value = '312000';
    pitFixSave();
    const after = state.cards[0].amountFinal;
    window.pitCanEditFinal = keep;
    return { lockedTxt, noInput, readOnly, stillEmpty, after };
  });
  ok('🔴 管理でない人には、確定金額の入力欄が出ない', r.noInput === true);
  ok('🔴 でも数字は見える（欄ごと消さない＝無いのか触れないのか分かる）', r.readOnly === true);
  ok('🔴 「🔒 管理のみ」と札で言う', /管理のみ/.test(r.lockedTxt), r.lockedTxt.slice(0, 120));
  ok('🔴 ボタンを押しても入らない（画面を消しただけにしていない）', r.stillEmpty === true);
  ok('🔴 管理ならその場で直せる', r.after === 312000, r.after);
}
{
  /* 実績カウント日＝確定日も同じ守り。さらに**空にはできない**（どの月にも数えられなくなる）。 */
  const r = await p.evaluate(() => {
    const D = window._D;
    const keep = window.pitCanEditFinal;
    window._only([ window._clean({ id:'c1', status:'returned', returnStage:'returnWait',
                                   completedAt:'', amountFinal:180000 }) ], []);
    window._insp.mode = 'daily'; window._insp.done = false; renderInspect();
    const f = window._insp.res.findings.filter(x => x.ruleId === 'F04')[0];

    window.pitCanEditFinal = () => false;
    pitFixOpen(f.key);
    const noInput = !document.getElementById('ins-fix-f-completedAt');
    pitFixClose();

    window.pitCanEditFinal = () => true;
    pitFixOpen(f.key);
    document.getElementById('ins-fix-f-completedAt').value = D(-4);
    pitFixSave();
    const c = state.cards[0];
    window.pitCanEditFinal = keep;
    return { noInput, completedAt: c.completedAt, returnDate: c.returnDate, returnDateFinal: c.returnDateFinal, want: D(-4) };
  });
  ok('🔴 実績カウント日も、管理でない人には入力欄が出ない', r.noInput === true);
  ok('🔴 管理なら入る', r.completedAt === r.want, r);
  ok('🔴 実績日を入れたら返車日も一緒に揃う（card-view.js と同じ1本を通っている）',
     r.returnDate === r.want && r.returnDateFinal === r.want, r);
}
{
  /* 欄が1つに決まらない規則には「ここを直す」を出さない
     ＝ 小窓で直せるふりをすると、直したつもりで直っていない、が起きる。 */
  const r = await p.evaluate(() => {
    const D = window._D;
    window._only([ window._clean({ id:'d1', status:'check', returnStage:'returnWait', returnDate:D(2) }) ], []);
    window._insp.mode = 'daily'; window._insp.done = false; renderInspect();
    const res = window._insp.res;
    const t01 = res.findings.filter(x => x.ruleId === 'T01')[0];
    return { has: !!t01, fields: t01 ? (pitFixFieldsFor(t01) || []).length : -1 };
  });
  ok('T01（タスクの列を動かす）は見つかる', r.has === true);
  ok('🔴 T01 には「ここを直す」を出さない（欄が1つに決まらない）', r.fields === 0, r.fields);
}

console.log('\n── 🧭 物差しを1本に保てているか（中身を機械が読む） ──');
{
  const src = await p.evaluate(async () => {
    const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const g = async u => strip(await (await fetch(u + '?t=' + Date.now())).text());
    return { ir: await g('js/inspect-rules.js'), iv: await g('js/inspect.js'),
             cm: await g('js/card-miss.js'), cd: await g('js/card-detail.js'),
             ifx: await g('js/inspect-fix.js'), cv: await g('js/card-view.js') };
  });
  ok('🔴 必須／推奨の表が card-miss.js に居る', /w\.pitCardMisses\s*=/.test(src.cm) && /'カナ'/.test(src.cm));
  /* ⚠ 「カナ」「受付タイプ」という**字**は入力欄の見出しにも出るので、字では見ない。
        見るのは**古い表の形**（`['kana', 'カナ', …]` の並び）が残っていないか。 */
  ok('🔴 card-detail.js に**同じ表が残っていない**（写しを作らない）',
     !/\[\s*'kana'\s*,/.test(src.cd) && !/\[\s*'dropType'\s*,/.test(src.cd), '');
  ok('🔴 card-detail.js は表を1本に聞いている', /pitCardMisses/.test(src.cd), '');
  ok('🔴 データチェックも同じ1本に聞いている', /pitCardMisses/.test(src.ir), '');
  /* 判定を作り直していないか＝既にある物差しを呼んでいるか */
  /* ⚠ v1.172.2 `pitPhaseStartMs` を外した＝それを使っていた F02（同じエリアに長く止まっている）を
     規則表から消したため（規則を消したら、その規則だけが使っていた道具も一緒に消す）。 */
  ['pitSalesTier', 'pitSalesCountDate', 'pitCardActive', 'pitCardNoSale', 'pitFinalAmountOf',
   'pitIsShaken', 'pitShakenDayOff', 'pitLoanerConflicts', 'pitCustName', 'pitCardStatusText',
   'pitDivisionLabel', 'pitStaffCall', 'pitDivisionColorOr'].forEach(fn => {
    ok('🔴 ' + fn + ' に聞いている（自前で判定を作っていない）', new RegExp('\\b' + fn + '\\b').test(src.ir), '');
  });
  /* 画面が判定を持っていないか */
  ok('🔴 画面（inspect.js）に判定が無い＝`.status ===` を書いていない', !/\.status\s*===/.test(src.iv), '');
  ok('🔴 画面が重さの色を綴っていない（表から --ins-c で受け取る）', !/#ef4444|#f59e0b|#94a3b8/.test(src.iv), '');
  /* しきい値が1か所か */
  ok('🔴 しきい値の表（LIM）が1つある', /var LIM = \{/.test(src.ir));
  ok('🔴 分類・重さ・札の表が pitInspect に配られている',
     /w\.PIT_INSPECT_CATS/.test(src.ir) && /w\.PIT_INSPECT_LEVELS/.test(src.ir) && /w\.PIT_INSPECT_MARKS/.test(src.ir));

  /* ---- 🔴 v1.170.0 「ここを直す」の表（inspect-fix.js）---- */
  ok('🔴 直せる欄の表が inspect-fix.js に1本ある',
     /w\.PIT_FIX_FIELDS/.test(src.ifx) && /w\.PIT_RULE_FIX/.test(src.ifx));
  /* 🔴🔴 いちばん大事：管理者の判定を**書き写していない**こと。
     ⚠ ここに pitIsAdmin() を書き写した日から、片方だけ直る事故が始まる。 */
  ok('🔴🔴 inspect-fix.js は pitIsAdmin を自分で見ていない（card-view.js の1本を借りる）',
     !/pitIsAdmin/.test(src.ifx) && /pitCanEditFinal/.test(src.ifx), '');
  ok('🔴 card-view.js がその1本を貸している', /window\.pitCanEditFinal\s*=/.test(src.cv), '');
  ok('🔴 実績日を入れる手順も1本を借りている（3つ揃える手順を書き写さない）',
     /pitApplyResultDate/.test(src.ifx) && /window\.pitApplyResultDate\s*=/.test(src.cv), '');
  ok('🔴 画面（inspect.js）は直せる欄を組み立てていない＝表に聞くだけ',
     /pitFixFieldsFor/.test(src.iv) && !/PIT_FIX_FIELDS/.test(src.iv), '');
  ok('🔴 クォーターの区切りを画面で書き写していない（売上の物差しを借りる）',
     /pitQuarterOf/.test(src.iv) && !/16\s*[?:]|<=\s*23/.test(src.iv), '');

  /* 表そのものの筋が通っているか（機械が読む） */
  const tbl = await p.evaluate(() => {
    const ruleIds = PIT_INSPECT_RULES.map(r => r.id);
    const fieldIds = PIT_FIX_FIELDS.map(f => f.id);
    const badRule = Object.keys(PIT_RULE_FIX).filter(k => ruleIds.indexOf(k) < 0);
    const badField = [];
    Object.keys(PIT_RULE_FIX).forEach(k => {
      const v = PIT_RULE_FIX[k];
      if (typeof v === 'function') return;                    /* 抜けている欄そのもの＝card-miss.js が決める */
      v.forEach(f => { if (fieldIds.indexOf(f) < 0) badField.push(k + ' → ' + f); });
    });
    return { badRule, badField,
             admin: PIT_FIX_FIELDS.filter(f => f.admin).map(f => f.id),
             dup: fieldIds.filter((x, i) => fieldIds.indexOf(x) !== i) };
  });
  ok('🔴 表が指している規則は全部ある（消えた規則を指していない）', tbl.badRule.length === 0, tbl.badRule);
  ok('🔴 表が指している欄も全部ある', tbl.badField.length === 0, tbl.badField);
  ok('🔴 欄の名前がダブっていない', tbl.dup.length === 0, tbl.dup);
  /* 🔴🔴 ゆうた指定そのもの＝管理者だけの欄は**この3つだけ**（増やしても減らしてもいけない） */
  ok('🔴🔴 管理者だけの欄は「確定金額・実績カウント日・確定返車日」の3つだけ',
     JSON.stringify(tbl.admin.slice().sort()) ===
     JSON.stringify(['amountFinal', 'completedAt', 'returnDateFinal']), tbl.admin);
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  await p.evaluate(() => { if (window.pitSampleData) pitSampleData(); });
  await p.waitForTimeout(400);
  for (const v of ['inspect', 'today', 'reserve', 'return', 'sales', 'loaner', 'shakencal', 'dashboard', 'customers']) {
    await p.evaluate(x => showView(x), v);
    await p.waitForTimeout(220);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  /* 🔴 見本データが、自分たちの保存の決まりを通れる形になっているか（点検が見つけた宿題）。
     ⚠ 測ったのは**このファイルの先頭**（下ごしらえで state を入れ替える前）。 */
  ok('🔴 見本データの「これから作業する車」に必須の空きが無い（見本が保存の決まりを通れる）',
     SAMPLE_MISS === 0, SAMPLE_MISS);
}

console.log('\n── 🧭 v1.173.0 規則は2種類（抜け・矛盾／要判断）＋ 起点日 ──');
{
  /* 🗣「見積もりと確定が大きく違うも、間違えの可能性もあるけど普通にOKなのもある」
     ＝ 見て決めるしかない規則には「確認した（合っている）」を出す。ほかには出さない。 */
  const JUDGE = ['M04','M06','M07','F07','R04','L03','D08','T08'];
  const r = await p.evaluate((judge) => {
    const R = window.PIT_INSPECT_RULES || [];
    const on = R.filter(x => x.judge).map(x => x.id).sort();
    return { on, want: judge.slice().sort(), n: R.length,
             marks: (window.PIT_INSPECT_MARKS || []).map(m => m.id + ':' + (m.judge ? 'judge' : '-')) };
  }, JUDGE);
  ok('🔴🔴 「要判断」はこの8本ちょうど（増えても減っても落ちる）',
     r.on.join() === r.want.join(), r.on);
  ok('🔴 残り40本は「直すしかない」', r.n - r.on.length === 40, r.n);
  ok('🔴 「確認した」の札だけが要判断ものと結びついている',
     r.marks.join() === 'fixed:-,ok:judge', r.marks);
}
{
  /* 🔴 要判断の規則では「確認した」を押せて、**数から外れる**。行は消えない。 */
  const r = await p.evaluate(() => {
    window._only([window._clean({ id:'j1', status:'returned', returnStage:'returnWait',
                                  amountQuote:100000, amountFinal:900000,
                                  completedAt:window._D(-2), reserveDate:window._D(-5), returnDate:window._D(-2) })]);
    const before = pitInspectRun();
    const f = before.findings.filter(x => x.ruleId === 'M07')[0];
    if (!f) return { none:true };
    pitInspectMark(f.key, 'ok');
    const after = pitInspectRun();
    window._insp.level = ''; window._insp.cat = ''; window._insp.all = {}; window._insp.okOpen = true;
    renderInspect();
    const body = document.getElementById('inspect-body');
    const g = after.findings.filter(x => x.key === f.key)[0] || {};
    return { judge: f.judge, mark: g.mark, by: g.markBy !== undefined,
             openBefore: before.openN, openAfter: after.openN, okN: after.okN,
             all: after.findings.length,
             box: !!body.querySelector('.ins-okbox'),
             boxTxt: (body.querySelector('.ins-okh') || {}).textContent || '',
             rows: body.querySelectorAll('.ins-okbox .ins-row').length,
             judgeBadge: !!body.querySelector('.ins-judge') };
  });
  ok('🔴 M07 は「見て決める」規則', r.judge === true, r);
  ok('🔴 「確認した」を押せる', r.mark === 'ok', r);
  ok('🔴🔴 押すと直す数から外れる（0にできる）', r.openAfter === r.openBefore - 1, r);
  ok('🔴🔴 でも消えていない（確認したの別枠に出る）',
     r.all === r.openBefore && r.okN === 1 && r.box === true && r.rows === 1, r);
  ok('別枠に件数が出る', /確認した/.test(r.boxTxt) && /1件/.test(r.boxTxt), r.boxTxt);
  ok('🔴 行に「見て決める」の印が出る', r.judgeBadge === true, r);
  ok('🔴 誰がいつ決めたかを持っている', r.by === true, r);
}
{
  /* 🔴🔴 抜け・矛盾の規則には「確認した」を付けられない（画面から消すだけにしない） */
  const r = await p.evaluate(() => {
    window._only([window._clean({ id:'j2', status:'work', amountOrder:null })]);
    const f = pitInspectRun().findings.filter(x => x.ruleId === 'M01')[0];
    pitInspectMark(f.key, 'ok');                    /* 直に呼んでも通らないこと */
    const after = pitInspectRun();
    return { mark: (after.findings.filter(x => x.key === f.key)[0] || {}).mark || '', open: after.openN };
  });
  ok('🔴🔴 直に呼んでも「確認した」は付かない', r.mark === '', r);
  ok('🔴 数も減らない', r.open === 1, r);
}
{
  /* 🔴🔴 起点日＝この日より前に入庫した車は、日付の前後を言わない（8月の一斉入力の跡） */
  const r = await p.evaluate(() => {
    /* ⚠ 決め打ちの日付は書かない（規則④）。今日からの日数で作る。 */
    const D = window._D, FROM = D(-10);
    state.settings.inspectFrom = FROM;
    window._only([
      window._clean({ id:'old', status:'work', reserveDate:D(-20), returnDate:D(-22) }),
      window._clean({ id:'new', status:'work', reserveDate:D(-3),  returnDate:D(-5)  })
    ]);
    const on = pitInspectRun();
    state.settings.inspectFrom = '';
    const off = pitInspectRun();
    state.settings.inspectFrom = FROM;
    const hit = (res, id) => res.findings.some(f => f.refId === id && f.ruleId === 'F05');
    return { oldOn: hit(on,'old'), newOn: hit(on,'new'), oldOff: hit(off,'old'), from: on.from, want: FROM };
  });
  ok('🔴🔴 起点日より前に入庫した車は言わない（8月の一斉入力の跡）', r.oldOn === false, r);
  ok('🔴🔴 起点日より後の打ち間違いはちゃんと出る', r.newOn === true, r);
  ok('起点日を空にすると、ぜんぶ見る', r.oldOff === true, r);
  ok('いつからかを画面に渡している', r.from === r.want, r);
}
{
  /* 🔴 起点日は「黙って効かせない」＝画面に出す。変えられるのは管理だけ */
  const r = await p.evaluate(() => {
    window.PIT_CLOUD = true; window.__adm = false;
    window.pitCanEditFinal = function(){ return !!window.__adm; };
    window._only([window._clean({ id:'fx', status:'work', amountOrder:null })]);
    renderInspect();
    const body = document.getElementById('inspect-body');
    const line = (body.querySelector('.ins-from') || {}).textContent || '';
    const noEdit = !body.querySelector('.ins-fromin');
    window.__adm = true; renderInspect();
    const b2 = document.getElementById('inspect-body');
    return { line, noEdit, canEdit: !!b2.querySelector('.ins-fromin') };
  });
  ok('🔴 いつからか、が画面に書いてある',
     /\d{4}-\d{2}-\d{2}/.test(r.line) && /日付の前後/.test(r.line), r.line);
  ok('🔴 管理でない人は変えられない', r.noEdit === true, r);
  ok('🔴 管理なら変えられる', r.canEdit === true, r);
}

console.log('\n── 🗑 v1.172.2 ゆうたが「出さない」を選んでいた13本を規則表から消した ──');
{
  /* 🗣「出さないを選択してたやつはルールからはずしていい」＝**規則ごと消す**という意味だった。
     ⚠ 消したものが**うっかり戻っていないか**を、次に規則を足す人のためにここで見張る。 */
  const GONE = ['M05','M10','F01','F02','F11','R05','R07','S08','S01','S03','S04','S06','D06'];
  const r = await p.evaluate((gone) => {
    const ids = (window.PIT_INSPECT_RULES || []).map(x => x.id);
    return { n: ids.length, back: gone.filter(g => ids.indexOf(g) >= 0),
             fix: gone.filter(g => (window.PIT_RULE_FIX || {})[g] !== undefined) };
  }, GONE);
  ok('🔴 消した13本が1本も戻っていない', r.back.length === 0, r.back);
  ok('🔴 「ここを直す」の表からも消えている', r.fix.length === 0, r.fix);
  ok('残っている規則の数（いま48本）', r.n === 48, r.n);
}
{
  /* 🔴 消した規則に付いていた「出さない」の印は片づく。生きている規則の印は残す。 */
  const r = await p.evaluate(() => {
    window._only([window._clean({ id:'mz1', status:'work', amountOrder:null })]);
    state.inspectMutes = { S01:1, M02:1 };     /* S01＝消した規則 ／ M02＝生きている規則 */
    pitInspectRun();
    const left = Object.keys(state.inspectMutes || {});
    state.inspectMutes = {};
    return left;
  });
  ok('🔴 消した規則に付いていた印は片づく', r.indexOf('S01') < 0, r);
  ok('🔴 生きている規則の印は残す（勝手に捨てない）', r.indexOf('M02') >= 0, r);
}

console.log('\n── 🧭 ソースの見張り（v1.172.0「やらなくていい」道が残っていないか） ──');
{
  const iv = fs.readFileSync('js/inspect.js', 'utf8');
  const ir = fs.readFileSync('js/inspect-rules.js', 'utf8');
  const ic = fs.readFileSync('css/inspect.css', 'utf8');
  const hp = fs.readFileSync('js/help-content.js', 'utf8');
  const live = (t) => t.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok('🔴🔴 画面に「これでOK」のボタンを組み立てていない', !/'これでOK'|>これでOK</.test(live(iv)), '');
  ok('🔴🔴 札の表に \'spec\' が残っていない（外す表だけ）',
     !/id:'spec'/.test(ir) && /DEAD_MARKS/.test(ir), '');
  ok('🔴🔴 「この規則は出さない」を画面が出していない', !/ins-mute"/.test(live(iv)), '');
  ok('🔴 規則の「どうする」が「これでOK」「この規則は出さない」を勧めていない',
     !/fix:[^\n]*これでOK/.test(ir) && !/fix:[^\n]*この規則は出さない/.test(ir), '');
  ok('🔴 v1.172.1 「出さない」の印は消す予定の控え＝走らせる時に読むだけ',
     /mutedIds\.push/.test(ir), '');
  /* 🔴 v1.172.2 生きている規則の印は触らない＝**消した規則のぶんだけ**片づける */
  ok('🔴 生きている規則の「出さない」の印は捨てていない',
     /if \(!have\[k\]\)/.test(ir), '');
  ok('🔴 前に隠したものを外す手順が1本ある（sweepEscapes）', /function sweepEscapes/.test(ir), '');
  ok('🔴 CSS からも消えている（.ins-mute / .ins-chk）',
     !/^\.ins-mute\{/m.test(ic) && !/^\.ins-chk\{/m.test(ic), '');
  /* ⚠ ヘルプには「無くしました」と経緯を書いてあるので、言葉が1回だけ出るのは正しい。
     見張るのは「まだ使える案内として書いていないか」＝**無くした、と書いてあること**。 */
  ok('🔴 ヘルプも「0にする」と書いている', /0 にするのが運用/.test(hp), '');
  ok('🔴 ヘルプが「これでOK」を使い方として案内していない',
     !/これでOK/.test(hp) || /「これでOK（次から出さない）」と「この規則は出さない」は無くしました/.test(hp), '');
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
