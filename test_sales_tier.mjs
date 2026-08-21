/* PitFlow v1.167.0 ── 売上の確度は6区分（実績／実績待／確定／予定／見込／予測）
   ===================================================================
   ◎ゆうた指定（2026-08-21）
     🗣「現状 実績→確定 のながれだが、実際にはここには
        **完了してるけど返車してないだけ**。と**完了してないこれから作業する**。が混ざっちゃってる。
        なので **実績、実績待、確定、予定、見込、予測** のラベルにして、各表示や計算を全て修正して」
     🗣「**実績待ちに関しては 作業完了エリア or 返車カレンダーにある（実績カレンダーに入ってない車）**が対象」

   ◎ここで見張ること
     🔴 区分は **6つ**。並びは**確からしい順**（実績→実績待→確定→予定→見込→予測）
     🔴 **実績待**＝作業完了エリア（`workDone`）**または**返車カレンダー（`returnStage`）
        ＝ **実績カレンダーに入っていない**（`returned` ではない）
     🔴 **確定**には「これから作業する」だけが残る（パーツ待ち・作業待ち・外注）
     🔴 実績と実績待の**金額の拾い方が同じ**＝**実績になった瞬間に数字が動かない**
     🔴 画面（タイル・課別・フロント別・上の大きい数字・PDF）が**ぜんぶ6区分**になっている
     🔴 区分の並びを**画面ごとに書き直していない**（表を1本にしてある）

   ◎使い方
     python3 -m http.server 8995      ← 別ウィンドウ
     node test_sales_tier.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8995;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitSalesTier && window.renderSales', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(900);

/* 1台だけ置いて区分を聞く。日付は今日からの日数で作る（決め打ちしない） */
const tierOf = card => p.evaluate(c => {
  const d = n => { const x = new Date(); x.setHours(0,0,0,0); x.setDate(x.getDate() + n);
    return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
  const full = Object.assign({ id: 'TR', customer: '売上 太郎', car: 'ノート', boardId: 'default',
    division: 'div1', workType: 'general', dropType: 'drop', frontStaff: '蓮沼 一郎',
    reserveDate: d(-2), returnDate: d(2), estAmount: 100000, log: [] }, c);
  return { tier: window.pitSalesTier(full), amt: window.pitFinalAmountOf ? pitFinalAmountOf(full) : null };
}, card);

console.log('\n── ① 実績待＝作業完了エリア or 返車カレンダー（実績カレンダーには入っていない） ──');
{
  const wd = await tierOf({ status: 'workDone' });
  ok('🔴 作業完了エリア（作業完了済）は「実績待」', wd.tier === 'actualWait', wd);
}
{
  for (const rs of ['callWait', 'returnWait', 'callDone']){
    const r = await tierOf({ status: 'work', returnStage: rs });
    ok('🔴 返車カレンダーにいる（' + rs + '）は「実績待」', r.tier === 'actualWait', r);
  }
}
{
  const r = await tierOf({ status: 'returned', completedAt: null });
  ok('🔴 実績カレンダーに入ったら「実績」（実績待ではない）', r.tier === 'actual', r);
}
{
  /* 返車済みは、返車カレンダーの印が残っていても「実績」が勝つ */
  const r = await tierOf({ status: 'returned', returnStage: 'returnWait' });
  ok('🔴 返車済みなら印が残っていても「実績」', r.tier === 'actual', r);
}

console.log('\n── ② 確定には「これから作業する」だけが残る ──');
{
  for (const st of ['parts', 'work', 'outsource']){
    const r = await tierOf({ status: st });
    ok('🔴 ' + st + '（受注済・これから作業）は「確定」', r.tier === 'confirmed', r);
  }
}

console.log('\n── ③ ほかの区分は今までどおり ──');
{
  const a = await tierOf({ status: 'contact' });
  ok('連絡中（見積提示済）は「予定」', a.tier === 'planned', a);
  const b1 = await tierOf({ status: 'check' });
  const b2 = await tierOf({ status: 'estim' });
  ok('入庫済・受注前は「見込」', b1.tier === 'prospect' && b2.tier === 'prospect', [b1, b2]);
  const c = await tierOf({ status: 'reserved' });
  ok('未入庫の予約は「予測」', c.tier === 'forecast', c);
  const d = await tierOf({ status: 'scrap' });
  const e = await tierOf({ status: 'workDone', noSale: true });
  ok('廃車・売上なしは、どの区分にも入らない', d.tier === null && e.tier === null, [d, e]);
}

console.log('\n── ④ 実績になった瞬間に、金額が動かない ──');
{
  /* 実績待の金額の拾い方は「確定→受注→見積→概算」＝実績化の時と同じ1本 */
  const r = await p.evaluate(() => {
    const d = n => { const x = new Date(); x.setHours(0,0,0,0); x.setDate(x.getDate() + n);
      return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
    const mk = ex => Object.assign({ id: 'AM' + Math.floor(Math.random()*1e6), customer: '金額 太郎', car: 'ノート',
      boardId: 'default', division: 'div1', workType: 'general', dropType: 'drop', frontStaff: '蓮沼 一郎',
      reserveDate: d(-2), returnDate: d(1), estAmount: 100000, log: [] }, ex);
    const moS = (() => { const x = new Date(); return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-01'; })();
    const moE = (() => { const x = new Date(); const l = new Date(x.getFullYear(), x.getMonth()+1, 0);
      return l.getFullYear() + '-' + String(l.getMonth()+1).padStart(2,'0') + '-' + String(l.getDate()).padStart(2,'0'); })();
    /* 完TELで確定金額を入れた車。実績待 → 実績 にしても合計が変わらないこと */
    const before = mk({ status: 'workDone', returnStage: 'returnWait', amountFinal: 250000, amountOrder: 180000, amountQuote: 150000 });
    const after  = Object.assign({}, before, { status: 'returned', completedAt: d(0) });
    state.cards = [before];
    showView('sales');
    const sum1 = document.querySelectorAll('#view-sales-body .sv-tier').length;
    return { moS: moS, moE: moE, sum1: sum1,
             beforeTier: pitSalesTier(before), afterTier: pitSalesTier(after),
             final: window.pitFinalAmountOf ? pitFinalAmountOf(before) : null };
  });
  ok('🔴 実績待の金額は「確定金額」（確定→受注→見積→概算の1本）', r.final === 250000, r);
  ok('実績待 → 実績 で区分だけが変わる', r.beforeTier === 'actualWait' && r.afterTier === 'actual', r);
}

console.log('\n── ⑤ 売上ビューが6区分になっている ──');
{
  const v = await p.evaluate(() => {
    const d = n => { const x = new Date(); x.setHours(0,0,0,0); x.setDate(x.getDate() + n);
      return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
    const mk = (id, ex) => Object.assign({ id: id, customer: '売上 太郎', car: 'ノート', boardId: 'default',
      division: 'div1', workType: 'general', dropType: 'drop', frontStaff: '蓮沼 一郎',
      reserveDate: d(-2), returnDate: d(1), estAmount: 100000, log: [] }, ex);
    state.cards = [
      mk('s1', { status: 'returned', completedAt: d(0), amountFinal: 300000 }),
      mk('s2', { status: 'workDone', amountFinal: 250000 }),
      mk('s3', { status: 'work', returnStage: 'callWait', amountFinal: 200000 }),
      mk('s4', { status: 'parts', amountOrder: 150000 }),
      mk('s5', { status: 'contact', amountQuote: 120000 }),
      mk('s6', { status: 'check' }),
      mk('s7', { status: 'reserved', reserveDate: d(1), returnDate: d(3) })
    ];
    window._svYM = null;
    showView('sales');
    const body = document.querySelector('#view-sales-body');
    const tiles = Array.from(body.querySelectorAll('.sv-tier')).map(e => ({
      label: (e.querySelector('.sv-tier-l') || {}).textContent || '',
      num: (e.querySelector('.sv-tier-num') || {}).textContent || '',
      cnt: (e.querySelector('.sv-tier-cnt') || {}).textContent || ''
    }));
    const heroSub = Array.from(body.querySelectorAll('.sv-hero-sub2 span')).map(e => e.textContent.trim());
    const frontHead = Array.from(body.querySelectorAll('.sv-table thead th')).map(e => e.textContent.trim());
    const courseLabels = Array.from(body.querySelectorAll('.sv-course-grid .sv-cc-l')).map(e => e.textContent.trim());
    return { tiles: tiles, heroSub: heroSub, frontHead: frontHead,
             courseLabels: courseLabels.slice(0, 6), stackRects: body.querySelectorAll('.sv-stack rect, .sv-hero-bar rect').length };
  });
  const labels = v.tiles.map(t => t.label);
  ok('🔴 タイルは 目標＋6区分＝7枚', v.tiles.length === 7, labels);
  ok('🔴 並びは確からしい順（実績→実績待→確定→予定→見込→予測）',
     JSON.stringify(labels) === JSON.stringify(['目標','実績','実績待','確定','予定','見込','予測']), labels);
  {
    const t = v.tiles.find(x => x.label === '実績待');
    ok('🔴 実績待のタイルに2台（作業完了エリア＋返車カレンダー）', !!t && /2台/.test(t.cnt), t);
    const c2 = v.tiles.find(x => x.label === '確定');
    ok('🔴 確定は1台だけ（これから作業する車）', !!c2 && /1台/.test(c2.cnt), c2);
  }
  ok('🔴 上に「実績見込み（実績＋実績待）」が出る', v.heroSub.some(s => /実績見込み/.test(s) && /実績待/.test(s)), v.heroSub);
  ok('🔴 「確度高（＋確定）」も並んで出る', v.heroSub.some(s => /確度高/.test(s)), v.heroSub);
  ok('🔴 フロント別に「実績待」の列がある',
     JSON.stringify(v.frontHead) === JSON.stringify(['フロント','実績','実績待','確定','予定','台数']), v.frontHead);
  ok('🔴 課別（1課/2課）も6区分',
     JSON.stringify(v.courseLabels) === JSON.stringify(['実績','実績待','確定','予定','見込','予測']), v.courseLabels);
}

console.log('\n── 🧭 物差しを1本に保てているか ──');
{
  const src = await p.evaluate(async () => {
    const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const g = async u => strip(await (await fetch(u + '?t=' + Date.now())).text());
    return { sv: await g('js/sales.js'), sc: await g('js/sales-count.js') };
  });
  ok('🔴 区分を決めるのは sales-count.js の1本（sales.js が状態を見ていない）',
     !/status\s*===\s*'workDone'/.test(src.sv) && !/returnStage/.test(src.sv), '');
  ok('🔴 実績待の見分けが sales-count.js にある', /'actualWait'/.test(src.sc), '');
  ok('🔴 画面が区分の並びを書き直していない（TIER_IDS などの1本を使う）',
     !/\['actual','confirmed','planned','prospect','forecast'\]/.test(src.sv), '');
  ok('🔴 実績と実績待の金額は同じ1本（pitFinalAmountOf）', /pitFinalAmountOf/.test(src.sv), '');
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  await p.evaluate(() => { if (window.pitSampleData) pitSampleData(); });
  await p.waitForTimeout(500);
  for (const v of ['sales', 'dashboard', 'mydash', 'today', 'reserve', 'return']) {
    await p.evaluate(x => showView(x), v);
    await p.waitForTimeout(300);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
