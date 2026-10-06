/* PitFlow v2.148.0 ── クォーター＝Qが終わった直後のMTG用
   ===================================================================
   ◎ゆうた指定（2026-10-06）
     🗣「Qをまたいだ日に、そのQの実績、翌Qの予測として簡易的なMTGをしてる。それで使う」
        「今Qでどのくらいやったのか／翌Qでどのぐらい入ってくるのか（金額面）って話ができればいい」
        「Q1〜Q4を選択できる形に」「一番上のグラフは売上ビューとおなじ1か月間の全体の数字」
        「Q1〜Q4までのBOXはそのまま。その下に1課2課のグラフ」「年間はなくしていい」「A4PDFは必要」

   ◎ここで見張ること
     🔴 最初に出るQ＝開いた日の直前に終わったQ（1〜7日なら前月のQ4）
     🔴 Q4 の次Q＝翌月の Q1
     🔴 前Qまで／選んだQ／次Q の振り分け（実績＝実績日・まだの車＝返車予定日。過ぎた・未定は次Qへ。次Qより先は出さない）
     🔴 次Qがもう終わっていたら見込みは出さない（実績だけ＝答え合わせ）
     🔴 保険・社員の見込みは外す／実績は数える
     🔴 上の切り替えは Q1〜Q4（当月／月間は出ない）。上の数字は売上ビューと同じ物
     🔴 PDF出力＝クォーターの紙（1枚）

   ◎使い方
     python3 -m http.server 8995      ← 別ウィンドウ
     node _見張り/test_sales_quarter.mjs                                */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const PORT = process.env.PORT || 8995;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: chromePath() });
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitSalesQuarterCollect && window.renderSales', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(900);

const R = await p.evaluate(() => {
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const today = new Date(); today.setHours(0,0,0,0);
  const out = {};
  /* ① 最初に出るQ */
  window._svQ = null; showView('sales'); svSetTab('quarter');
  const qi = today.getDate()<=7?0:today.getDate()<=15?1:today.getDate()<=23?2:3;
  const exp = qi>0 ? { y:today.getFullYear(), m:today.getMonth(), q:qi-1 } : (() => { const d = new Date(today.getFullYear(), today.getMonth()-1, 1); return { y:d.getFullYear(), m:d.getMonth(), q:3 }; })();
  out.def = [JSON.stringify(window._svQ), JSON.stringify(exp)];
  const body = document.getElementById('view-sales-body').innerHTML;
  out.qBtns = (body.match(/svSetQ\(\d\)/g) || []).length >= 4;
  out.noMonthYear = !/svSetMode\('year'\)/.test(body);
  out.hasCourse = document.querySelectorAll('.sv-course').length === 2;
  out.hasTop = /日次の進捗/.test(body) && /着地見込み（実績＋パイプライン）/.test(body);

  /* ② 振り分け＝来月 Q1 を選んで、その中で車を置く（日付は今日から作る＝決め打ちしない） */
  const nm = new Date(today.getFullYear(), today.getMonth()+1, 1);
  const sel = { y:nm.getFullYear(), m:nm.getMonth(), q:3 };      /* 来月Q4 → 次Q＝再来月Q1（月またぎ） */
  const D = (y,m,d) => ymd(new Date(y,m,d));
  const base = { boardId:'default', division:'div1', workType:'general', frontStaff:'椎名 祐太', log:[], reserveDate: ymd(today) };
  const nn = new Date(sel.y, sel.m+1, 1);
  const cards = [
    { id:'TQ_PREV', status:'returned', completedAt:D(sel.y,sel.m,3),  amountFinal:100000 },              /* 前Qまで */
    { id:'TQ_SEL',  status:'returned', completedAt:D(sel.y,sel.m,25), amountFinal:200000 },              /* 選んだQ */
    { id:'TQ_NXA',  status:'returned', completedAt:D(nn.getFullYear(),nn.getMonth(),2), amountFinal:50000 }, /* 次Qの実績 */
    { id:'TQ_NXP',  status:'work', returnDatePlan:D(nn.getFullYear(),nn.getMonth(),5), amountOrder:70000 },  /* 次Qの見込み（確定） */
    { id:'TQ_FAR',  status:'work', returnDatePlan:D(nn.getFullYear(),nn.getMonth(),20), amountOrder:90000 }, /* 次Qより先＝出ない */
    { id:'TQ_UND',  status:'contact', amountQuote:30000, reserveDate:'' },                                /* 返車日なし＝次Qへ */
    { id:'TQ_INS',  status:'work', returnDatePlan:D(nn.getFullYear(),nn.getMonth(),4), amountOrder:500000, workSpecials:['insurance'] }, /* 保険の見込み＝外す */
    { id:'TQ_EMPA', status:'returned', completedAt:D(sel.y,sel.m,26), amountFinal:40000, workSpecials:['employee'] } /* 社員の実績＝数える */
  ].map(c => Object.assign({}, base, c));
  state.cards.push(...cards);
  const Q = pitSalesQuarterCollect(sel);
  out.nx = Q.nx; out.expNx = { y:nn.getFullYear(), m:nn.getMonth(), q:0 };
  out.prev = Q.D.div1.prev; out.sel = Q.D.div1.sel;
  out.nextIds = Q.D.div1.rows.map(r => r.c.id).filter(x => /^TQ_/.test(x)).sort();
  /* 見本の車（TQ_）だけで数える＝デモの車の見込みが混ざらない */
  const mine = t => Q.D.div1.rows.filter(r => /^TQ_/.test(r.c.id) && r.tier === t).reduce((a, r) => a + r.amt, 0);
  out.nextActual = mine('actual'); out.nextConf = mine('confirmed'); out.nextPlan = mine('planned');
  out.next = Q.D.div1.rows.filter(r => /^TQ_/.test(r.c.id)).reduce((a, r) => a + r.amt, 0);
  /* ③ 次Qが終わっている＝見込みは出さない（過去の月の Q1 を選ぶ） */
  const pm = new Date(today.getFullYear(), today.getMonth()-2, 1);
  const Qp = pitSalesQuarterCollect({ y:pm.getFullYear(), m:pm.getMonth(), q:0 });
  out.pastDone = Qp.nextDone;
  out.pastHasPipe = ['actualWait','confirmed','planned','prospect','forecast'].some(t => Qp.D.div1.next[t].count + Qp.D.div2.next[t].count > 0);
  /* ④ 送り（Q4 → 翌月Q1／Q1 → 前月Q4） */
  window._svQ = { y:sel.y, m:sel.m, q:3 }; svShiftQ(1); out.fwd = JSON.stringify(window._svQ);
  svShiftQ(-1); svShiftQ(-1); out.back = JSON.stringify(window._svQ);
  /* ⑤ 紙 */
  window._svQ = sel; renderSales();
  const M = svReportModel();
  out.model = [M.title, M.sections.length, M.kpis.length];
  state.cards = state.cards.filter(c => !/^TQ_/.test(c.id)); window._svQ = null; renderSales();
  return out;
});

console.log('\n── ① 形 ──');
ok('🔴 最初に出るQ＝直前に終わったQ', R.def[0] === R.def[1], R.def);
ok('上の切り替えは Q1〜Q4', R.qBtns);
ok('「月間（年度）」は出ない', R.noMonthYear);
ok('上の数字と日次の進捗＝売上ビューと同じ物', R.hasTop);
ok('1課・2課の階段がある', R.hasCourse);

console.log('\n── ② 振り分け ──');
ok('🔴 Q4 の次Q＝翌月の Q1', JSON.stringify(R.nx) === JSON.stringify(R.expNx), [R.nx, R.expNx]);
ok('前Qまでの実績（Q1〜Q3）', R.prev === 100000, R.prev);
ok('🔴 選んだQの実績（社員の実績も数える）', R.sel === 240000, R.sel);
ok('次Qにもう返した実績も見込みに入る', R.nextActual === 50000, R.nextActual);
ok('次Qに返る予定の確定が入る', R.nextConf === 70000, R.nextConf);
ok('返車日が無い車は次Qへ寄せる', R.nextPlan === 30000, R.nextPlan);
ok('🔴 次Qより先・保険の見込みは入らない', R.nextIds.join() === 'TQ_NXA,TQ_NXP,TQ_UND', R.nextIds);
ok('次Qの合計', R.next === 150000, R.next);

console.log('\n── ③ 答え合わせ ──');
ok('🔴 次Qが終わっていたら見込みは出さない（実績だけ）', R.pastDone === true && R.pastHasPipe === false, [R.pastDone, R.pastHasPipe]);

console.log('\n── ④ 送り ──');
ok('Q4 の次へ送る＝翌月Q1', R.fwd === JSON.stringify(R.expNx), R.fwd);
ok('翌月Q1 から2つ戻す＝前の月のQ3（月をまたいで戻る）', JSON.parse(R.back).q === 2 && JSON.parse(R.back).m !== R.expNx.m, R.back);

console.log('\n── ⑤ 紙 ──');
ok('PDF出力＝クォーターの紙（表3つ・数字4つ）', /^クォーター /.test(R.model[0]) && R.model[1] === 3 && R.model[2] === 4, R.model);

console.log('\n── 落ちていないか ──');
ok('ページエラーなし', errs.length === 0, errs.slice(0, 3));
await b.close();
console.log(`\n${pass} ✅ / ${fail} ❌`);
process.exit(fail ? 1 : 0);
